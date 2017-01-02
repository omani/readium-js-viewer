define([
'readium_shared_js/helpers'
],
function(Helpers){
    
    var userId = 1;  // TODO: this is just a placeholder

    var settingsInLocalStorage = ['reader', 'needsMigration', 'replaceByDefault'];
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
            if(settingsInLocalStorage.indexOf(key) != -1) {
                if (!isLocalStorageEnabled()) {
                    if (callback) callback();
                    return;
                }
                
                var val = JSON.stringify(val);
                localStorage[key] = val;
                
                if (callback){
                    callback();
                }

            } else {
                console.error('Put not supported to the server.'); 
                callback();

            }
        },
        patch : function(userData){

            // The apps should record the last time they successfully sent a user-data update to the server.
            // Then, when they go offline and come back online, they can clone the user-data book objects
            // and filter them down to those objects which are newer than the last successful update to the
            // server. This clone can be sent to the server as a full batch of the needed updates.

            var runPatch = function() {
                if(currentlyPatching) return;

                var patchTime = Helpers.getUTCTimeStamp();
                var newUserData = { books: {} };

                // filter down the userData object to only new items
                for(var bookId in userData.books) {
                    var bookUserData = userData.books[bookId];

                    newUserData.books[bookId] = { highlights: [] };

                    if(bookUserData.updated_at > lastSuccessfulPatch) {
                        newUserData.books[bookId].latest_location = bookUserData.latest_location;
                        newUserData.books[bookId].updated_at = bookUserData.updated_at;
                    }

                    if(bookUserData.highlights) {
                        for(var highlightIdx in bookUserData.highlights) {
                            if(bookUserData.highlights[highlightIdx].updated_at > lastSuccessfulPatch) {
                                newUserData.books[bookId].highlights.push(bookUserData.highlights[highlightIdx]);
                            }
                        }
                    }
                }

                console.log("Time-filtered userData object for patch request(s):", newUserData);

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
                                if(status == 412) {
                                    console.log("userData is stale.");
                                    lastSuccessfulPatch = patchTime;
                                    // update the userData on this book
                                    // runPatch();

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
            }

            runPatch();
        },
        get : function(key, callback){
            if(settingsInLocalStorage.indexOf(key) != -1) {
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
                if(settingsInLocalStorage.indexOf(key) != -1) {
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
        }
    }
    return Settings;
})