define([
'readium_shared_js/biblemesh_helpers'
],
function(biblemesh_Helpers){
    
    var userInfo = {};

    var settingsInLocalStorageOnly = /^(reader|needsMigration|replaceByDefault|404:.*)$/;

    var lastSuccessfulPatch = biblemesh_Helpers.getUTCTimeStamp();
    var currentlyPatching = false;

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
        patch : function(userData, staleDataCallback, forceOnceCallback){

            // The apps should record the last time they successfully sent a user-data update to the server.
            // Then, when they go offline and come back online, they can clone the user-data book objects
            // and filter them down to those objects which are newer than the last successful update to the
            // server. This clone can be sent to the server as a full batch of the needed updates.

            var runPatch = function() {

                var patchTime = biblemesh_Helpers.getUTCTimeStamp();
                var newUserData = { books: {} };
                var somethingToPatch = false;

                // filter down the userData object to only new items
                for(var bookId in userData.books) {
                    var bookUserData = userData.books[bookId];

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

                } else {

                    var path = getUserDataPathPreface() + key + '.json';

                    $.ajax({
                        url: path,
                        success: function (result) {
                            retVal[key] = result;
                            callbackWhenComplete();
                        },
                        error: function (xhr, status, errorThrown) {
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
        refreshUserData: function(bookId, userData, callback) {
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