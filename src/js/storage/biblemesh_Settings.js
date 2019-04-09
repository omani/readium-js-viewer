define([
'readium_shared_js/biblemesh_helpers'
],
function(biblemesh_Helpers){

    var userInfo = {};
    var cachedGets = {};  // prevents need to go back to server for highlight data when they hit the back button

    var settingsInLocalStorageOnly = /^(reader|needsMigration|replaceByDefault|404:.*|alertedToNativeApp)$/;

    var lastSuccessfulPatch = biblemesh_Helpers.getUTCTimeStamp();
    var currentlyPatching = false;

    var currentReadingRecord_memory = false;
    var readingRecords_memory = [];
    var currentReadingRecordInterval = -1;
    var currentlySendingReadingRecords = false;
    var lastReadingRecordBookId, lastReadingRecordSpineIdRef;

    var getUserDataPathPreface = function() {
        return location.origin + '/users/' + userInfo.id + '/';
    }

    // localStorage may be disabled due to zero-quota issues (e.g. iPad in private browsing mode)
    var _isLocalStorageEnabled = undefined;
    var isLocalStorageEnabled = function() {
        if (_isLocalStorageEnabled) return true;
        if (typeof _isLocalStorageEnabled === "undefined") {
            _isLocalStorageEnabled = false;
            if (localStorage) {
                try {
                    localStorage.setItem("_isLocalStorageEnabled", "?");
                    localStorage.removeItem("_isLocalStorageEnabled");
                    _isLocalStorageEnabled = true;
                } catch(e) {
                }
            }
            return _isLocalStorageEnabled;
        } else {
            return false;
        }
    };
    
    var emptyLocalStorageUserPatch = function() {
        if (isLocalStorageEnabled()) {
            localStorage.removeItem('userDataPatch');
            console.log("Local storage patch emptied.");
        }
    }

    var indicateSave = function() {
        try {
            var iframe = $("#epub-reader-frame iframe")[0];
            var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
            var docEl = $( doc.documentElement );
            docEl[currentlyPatching ? 'addClass' : 'removeClass']('highlightssaving');
        } catch(e) { }
    }

    var getReadingRecords = function() {
        return isLocalStorageEnabled()
            ? JSON.parse(localStorage['readingRecords'] || '[]')
            : readingRecords_memory.slice(0);
    }

    var getCurrentReadingRecord = function() {
        return isLocalStorageEnabled()
            ? JSON.parse(localStorage['currentReadingRecord'] || 'false')
            : currentReadingRecord_memory ? Object.assign({}, currentReadingRecord_memory) : false;
    }

    var setReadingRecords = function(readingRecords) {
        if(isLocalStorageEnabled()) {
            localStorage['readingRecords'] = JSON.stringify(readingRecords);
        } else {
            readingRecords_memory = readingRecords.slice(0);
        }
    }

    var setCurrentReadingRecord = function(currentReadingRecord) {
        if(isLocalStorageEnabled()) {
            if(currentReadingRecord) {
                localStorage['currentReadingRecord'] = JSON.stringify(currentReadingRecord);
            } else {
                localStorage.removeItem('currentReadingRecord');
            }
        } else {
            currentReadingRecord_memory = currentReadingRecord ? Object.assign({}, currentReadingRecord) : false;
        }
    }

    var updateEndTimeOnCurrentReadingRecord = function() {
        var currentReadingRecord = getCurrentReadingRecord();
        if(!currentReadingRecord) return;
        
        currentReadingRecord.endTime = Date.now();

        setCurrentReadingRecord(currentReadingRecord);
    }

    var pushCurrentReadingRecordOnQueue = function() {
        var currentReadingRecord = getCurrentReadingRecord();
        if(!currentReadingRecord) return;

        if(currentReadingRecord.endTime - currentReadingRecord.startTime > 5*1000) {
            var readingRecords = getReadingRecords();
            readingRecords.push(currentReadingRecord);
            setReadingRecords(readingRecords);
        }

        setCurrentReadingRecord();

        Settings.sendRecordedReading();
    }
    
    Settings = {
        put : function(key, val, callback){
            if (isLocalStorageEnabled()) {
                var val = JSON.stringify(val);
                localStorage[key] = val;
            }

            if(!key.match(settingsInLocalStorageOnly)) {
                console.error('Put method not supported to the server.'); 
            }

            if (callback) callback();

        },
        startRecordReading : function(bookId, spineIdRef){
            if(!userInfo.idpXapiOn) return;

            // In case there was a reading record which was not ended...
            pushCurrentReadingRecordOnQueue();

            setCurrentReadingRecord({
                bookId: bookId,
                spineIdRef: spineIdRef,
                startTime: Date.now(),
            });

            lastReadingRecordBookId = lastReadingRecordSpineIdRef = undefined;

            updateEndTimeOnCurrentReadingRecord();

            clearInterval(currentReadingRecordInterval);
            currentReadingRecordInterval = setInterval(updateEndTimeOnCurrentReadingRecord, 1000);
        },
        endRecordReading : function(){
            if(!userInfo.idpXapiOn) return;

            clearInterval(currentReadingRecordInterval);
            updateEndTimeOnCurrentReadingRecord();

            pushCurrentReadingRecordOnQueue();

            lastReadingRecordBookId = lastReadingRecordSpineIdRef = undefined;
        },
        toggleRecordReading : function(){
            var currentReadingRecord = getCurrentReadingRecord();
            if(
                currentReadingRecord
                && document.visibilityState == 'hidden'
            ) {
                Settings.endRecordReading();
                lastReadingRecordBookId = currentReadingRecord.bookId;
                lastReadingRecordSpineIdRef = currentReadingRecord.spineIdRef;

            } else if(
                !currentReadingRecord
                && document.visibilityState == 'visible'
                && lastReadingRecordBookId
                && lastReadingRecordSpineIdRef
            ) {
                Settings.startRecordReading(lastReadingRecordBookId, lastReadingRecordSpineIdRef);
            }

        },
        sendRecordedReading : function(){
            if(!userInfo.idpXapiOn) return;
            if(currentlySendingReadingRecords) return;

            var readingRecords = getReadingRecords();
            if(readingRecords.length == 0) return;

            var path = location.origin + '/reportReading';

            var ajaxRequest = {
                url: path,
                method: 'POST',
                data: {
                    readingRecords: readingRecords,
                },
                success: function () {
                    console.log("Reading record report successful.");
                    setReadingRecords(getReadingRecords().slice(readingRecords.length));
                    currentlySendingReadingRecords = false;
                    Settings.sendRecordedReading();
                },
                error: function (xhr, status, errorThrown) {
                    console.log("ERROR: Could not send reading records.", xhr, status, errorThrown);
                    currentlySendingReadingRecords = false;
                }
            }

            currentlySendingReadingRecords = true;
            $.ajax(ajaxRequest);
        },
        patch : function(userData, staleDataCallback, forceOnceCallback){

            // The apps should record the last time they successfully sent a user-data update to the server.
            // Then, when they go offline and come back online, they can clone the user-data book objects
            // and filter them down to those objects which are newer than the last successful update to the
            // server. This clone can be sent to the server as a full batch of the needed updates.

            var runPatch = function() {

                if(userInfo.idpNoAuth) {
                    if (isLocalStorageEnabled()) {
                        localStorage['userDataBooks'] = JSON.stringify(userData.books);
                    }
                    return;
                }

                var patchTime = biblemesh_Helpers.getUTCTimeStamp();
                var newUserData = { books: {} };
                var somethingToPatch = false;

                // filter down the userData object to only new items
                for(var bookId in userData.books) {
                    var bookUserData = userData.books[bookId];
                    if(!bookUserData) {
                        continue;
                    }

                    newUserData.books[bookId] = { highlights: [] };

                    if(forceOnceCallback || bookUserData.updated_at > lastSuccessfulPatch) {
                        newUserData.books[bookId].latest_location = bookUserData.latest_location;
                        newUserData.books[bookId].updated_at = bookUserData.updated_at;
                        somethingToPatch = true;
                    }

                    if(bookUserData.highlights) {
                        for(var highlightIdx in bookUserData.highlights) {
                            if(forceOnceCallback || bookUserData.highlights[highlightIdx].updated_at > lastSuccessfulPatch) {
                                newUserData.books[bookId].highlights.push(bookUserData.highlights[highlightIdx]);
                                somethingToPatch = true;
                            }
                        }
                    }
                }

                if(somethingToPatch) {

                    if (isLocalStorageEnabled()) {
                        localStorage['userDataPatch'] = JSON.stringify(newUserData);
                        console.log("Local storage patch: ", localStorage['userDataPatch']);
                    }

                    if(currentlyPatching) return;

                    console.log("Time-filtered userData object for patch request(s):", newUserData);

                    // send necessary patch requests
                    for(var bookId in newUserData.books) {

                        var bookUserData = newUserData.books[bookId];

                        if(bookUserData.latest_location || bookUserData.highlights.length > 0) {

                            var path = getUserDataPathPreface() + 'books/' + bookId + '.json';

                            currentlyPatching = true;
                            indicateSave();

                            var patch = {
                                url: path,
                                method: 'PATCH',
                                data: bookUserData,
                                success: function () {
                                    console.log("Patch successful.");
                                    currentlyPatching = false;
                                    indicateSave();
                                    lastSuccessfulPatch = patchTime;
                                    if(forceOnceCallback) {
                                        forceOnceCallback();
                                    } else {
                                        runPatch();
                                    }
                                },
                                error: function (xhr, status, errorThrown) {
                                    if(xhr.status == 403) {
                                        location.reload();
                                        return;
                                    }
                                    currentlyPatching = false;
                                    indicateSave();
                                    if(xhr.status == 412) {
                                        console.log("userData is stale.");
                                        lastSuccessfulPatch = patchTime;
                                        if(forceOnceCallback) {
                                            forceOnceCallback();
                                        } else {
                                            // update the userData on this book
                                            Settings.refreshUserData(bookId, userData, staleDataCallback);
                                        }
                                    } else {
                                        console.error('Patch error when AJAX fetching ' + path);
                                        console.error(status);
                                        console.error(errorThrown);
                                        console.error('Will rerun in 10 seconds.');
                                        setTimeout(function() {
                                            runPatch();
                                        }, 10000);
                                    }
                                }
                            }

                            console.log("Patch:", patch);

                            $.ajax(patch);
                        }
                    }

                } else {
                    console.log("Nothing to patch.");
                    emptyLocalStorageUserPatch();
                }
            }

            runPatch();
        },
        get : function(key, callback){
            if(key.match(settingsInLocalStorageOnly)) {
                if (!isLocalStorageEnabled()) {
                    if (callback) callback(null);
                    return;
                }
                
                var val = localStorage[key];
                if (val){
                    callback(JSON.parse(val));
                }
                else{
                    callback(null);
                }

            } else {
                var path = getUserDataPathPreface() + key + '.json';
                $.ajax({
                    url: path,
                    success: function (result) {
                        callback(result);
                    },
                    error: function (xhr, status, errorThrown) {
                        if(xhr.status == 403) {
                            location.reload();
                            return;
                        }
                        console.error('Error when AJAX fetching ' + path);
                        console.error(status);
                        console.error(errorThrown);
                        callback({});
                    }
                });
            }
        },
        getMultiple : function(keys, callback){
            
            var retVal = {};

            var callbackWhenComplete = function() {
                if(Object.keys(retVal).length >= keys.length) {
                    callback(retVal);
                }
            }
            
            keys.forEach(function(key, i) {
                if(key.match(settingsInLocalStorageOnly)) {
                    if (!isLocalStorageEnabled()) {
                        retVal['_err_' + key] = true;
                    } else {
                        retVal[key] = JSON.parse(localStorage[key] || null);
                    }
                    
                    callbackWhenComplete();

                } else if(userInfo.idpNoAuth && key.match(/^books\/[0-9]+$/)) {
                    if(isLocalStorageEnabled()) {
                        try {
                            retVal[key] = (JSON.parse(localStorage['userDataBooks']) || {})[key.replace(/^books\/([0-9]+)$/, '$1')];
                        } catch(e) {
                            retVal['_err_' + key] = true;
                        }
                    }
                    callbackWhenComplete();
                    return;

                } else {

                    var path = getUserDataPathPreface() + key + '.json';

                    if(cachedGets[path]) {
                        retVal[key] = cachedGets[path];
                        callbackWhenComplete();
                        return;
                    }

                    $.ajax({
                        url: path,
                        success: function (result) {
                            retVal[key] = result;
                            callbackWhenComplete();
                            cachedGets[path] = result;
                        },
                        error: function (xhr, status, errorThrown) {
                            if(xhr.status == 403) {
                                location.reload();
                                return;
                            }
                            console.error('Error when AJAX fetching ' + path);
                            console.error(status);
                            console.error(errorThrown);
                            retVal['_err_' + key] = true;
                            callbackWhenComplete();
                        }
                    });
                }
            });
        },
        clearCache: function() {
            cachedGets = {};
        },
        refreshUserData: function(bookId, userData, callback) {
            if(userInfo.idpNoAuth) return;

            var bookKey = 'books/' + bookId;
            Settings.get(bookKey, function(bookUserData) {
                if(!bookUserData) throw "Unexpected blank response on refreshUserData";

                userData.books[bookId] = bookUserData;
                console.log("userData has been refreshed.");
                if(callback) callback();
            });
        },
//what if this takes longer
        patchFromLocalStorage: function(callback) {
            if (isLocalStorageEnabled()) {
                if(localStorage['userDataPatch']) {
                    try {
                        Settings.patch(JSON.parse(localStorage['userDataPatch']), null, function() {
                            emptyLocalStorageUserPatch();
                            if(callback) callback();
                        });
                        return;
                    } catch(e) {}
                }
            }
            if(callback) callback();
        },

        initialize: function(callback, errorCallback) {
            // 1. gets basic user info (id, username, ...)
            // 2. gets google analytics code
            // 3. sets the js time to align with the server
            $.ajax({
                url: location.origin + '/usersetup.json',
                success: function (result) {
                    userInfo = result.userInfo;
                    if(result.gaCode) {
                        biblemesh_Helpers.setupGoogleAnalytics(result.gaCode)
                    }
                    biblemesh_Helpers.setServerTimeOffset(result.currentServerTime);
                    callback();
                },
                error: function (xhr, status, errorThrown) {
                    if(xhr.status == 403) {
                        location.reload();
                        return;
                    }
                    console.error('Error setting up the user.');
                    errorCallback();
                }
            });
        },

        getUserAttr: function(key) {
            return userInfo[key];
        }
        
    }
    return Settings;
})