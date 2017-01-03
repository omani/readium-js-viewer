define([
'readium_shared_js/helpers'
],
function(Helpers){
    
    var userId = 1;  // TODO: this is just a placeholder

    var settingsInLocalStorageOnly = ['reader', 'needsMigration', 'replaceByDefault'];
    var userDataPathPreface = location.origin + '/users/' + userId + '/';

    var lastSuccessfulPatch = Helpers.getUTCTimeStamp();
    var currentlyPatching = false;

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
    
    Settings = {
        put : function(key, val, callback){
            if (isLocalStorageEnabled()) {
                var val = JSON.stringify(val);
                localStorage[key] = val;
            }

            if(settingsInLocalStorageOnly.indexOf(key) == -1) {
                console.error('Put method not supported to the server.'); 
            }

            if (callback) callback();

        },
        patch : function(userData, staleDataCallback, skipRefresh){

            // The apps should record the last time they successfully sent a user-data update to the server.
            // Then, when they go offline and come back online, they can clone the user-data book objects
            // and filter them down to those objects which are newer than the last successful update to the
            // server. This clone can be sent to the server as a full batch of the needed updates.

            var runPatch = function() {
                if(currentlyPatching) return;

                var patchTime = Helpers.getUTCTimeStamp();
                var newUserData = { books: {} };
                var somethingToPatch = false;

                // filter down the userData object to only new items
                for(var bookId in userData.books) {
                    var bookUserData = userData.books[bookId];

                    newUserData.books[bookId] = { highlights: [] };

                    if(bookUserData.updated_at > lastSuccessfulPatch) {
                        newUserData.books[bookId].latest_location = bookUserData.latest_location;
                        newUserData.books[bookId].updated_at = bookUserData.updated_at;
                        somethingToPatch = true;
                    }

                    if(bookUserData.highlights) {
                        for(var highlightIdx in bookUserData.highlights) {
                            if(bookUserData.highlights[highlightIdx].updated_at > lastSuccessfulPatch) {
                                newUserData.books[bookId].highlights.push(bookUserData.highlights[highlightIdx]);
                                somethingToPatch = true;
                            }
                        }
                    }
                }

                if(somethingToPatch) {
                    console.log("Time-filtered userData object for patch request(s):", newUserData);

                    if (isLocalStorageEnabled()) {
                        localStorage['userDataPatch'] = JSON.stringify(newUserData);
                    }

                    // send necessary patch requests
                    for(var bookId in newUserData.books) {

                        var bookUserData = newUserData.books[bookId];

                        if(bookUserData.latest_location || bookUserData.highlights.length > 0) {

                            var path = userDataPathPreface + 'books/' + bookId + '.json';

                            currentlyPatching = true;

                            var patch = {
                                url: path,
                                method: 'PATCH',
                                data: bookUserData,
                                success: function () {
                                    console.log("Patch successful.");
                                    currentlyPatching = false;
                                    lastSuccessfulPatch = patchTime;
                                    runPatch();
                                },
                                error: function (xhr, status, errorThrown) {
                                    currentlyPatching = false;
                                    if(xhr.status == 412) {
                                        console.log("userData is stale.");
                                        lastSuccessfulPatch = patchTime;
                                        if(!skipRefresh) {
                                            // update the userData on this book
                                            Settings.refreshUserData(bookId, userData, staleDataCallback);
                                        }
                                    } else {
                                        console.error('Patch error when AJAX fetching ' + path);
                                        console.error(status);
                                        console.error(errorThrown);
                                        console.error('Will rerun in 10 seconds.');
                                        setTimeout(runPatch, 10000);
                                    }
                                }
                            }

                            console.log("Patch:", patch);

                            $.ajax(patch);
                        }
                    }

                } else {
                    console.log("Nothing to patch.");

                    if (isLocalStorageEnabled()) {
                        localStorage.removeItem('userDataPatch');
                    }
                }
            }

            runPatch();
        },
        get : function(key, callback){
            if(settingsInLocalStorageOnly.indexOf(key) != -1) {
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
                var path = userDataPathPreface + key + '.json';
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
                if(settingsInLocalStorageOnly.indexOf(key) != -1) {
                    if (!isLocalStorageEnabled()) {
                        retVal['_err_' + key] = true;
                    } else {
                        retVal[key] = JSON.parse(localStorage[key] || null);
                    }
                    
                    callbackWhenComplete();

                } else {

                    var path = userDataPathPreface + key + '.json';

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
        patchFromLocalStorage: function() {
            if (isLocalStorageEnabled()) {
                if(localStorage['userDataPatch']) {
                    try {
                        String.patch(JSON.parse(localStorage['userDataPatch']), null, true);
                    } catch(e) {}
                }
            }
        }
    }
    return Settings;
})