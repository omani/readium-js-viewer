define([
],
function(
){

    var funcsByIdentifier = {}

    window.ReactNativeToWebView = function(message) {
        try {
            if(funcsByIdentifier[message.identifier]) {
                funcsByIdentifier[message.identifier](message.payload || {})
            }
        } catch(e) {
            var errorMessage = "\nReactNativeToWebView ERROR: " + e.name + "\n";
            errorMessage += e.message + "\n\n";
            errorMessage += e.stack;
          
            biblemesh_AppComm.postMsg('consoleLog', { message: errorMessage });
        }
    };

    // We also need a postMessage route for react native web
    window.addEventListener('message', function(event) {
        if(event.origin && event.origin !== window.location.origin) return;  // only allow from the the apps or the same origin

        if(event.data.action === 'injectJS') {
            eval(event.data.jsStr);
        }
    });

    var biblemesh_AppComm = {
        subscribe: function(identifier, func) {

            funcsByIdentifier[identifier] = func;

        },
        postMsg: function(identifier, payload) {
            var postIfReady = function() {
                if(!window.isReactNativeWebView) {
                    parent.postMessage(JSON.stringify({
                        identifier: identifier,
                        payload: payload,
                    }), window.parentOriginForPostMessage);
                } else if(window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                    // send a message to React Native
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        identifier: identifier,
                        payload: payload,
                    }));
                } else {
                    setTimeout(postIfReady, 20);
                }
            }
            postIfReady();
        },
    }

    // setup receiving setDisplaySettings messages

    // only use postMessage if we are in native apps (in the future, this may also be used for offline books in the web app)

    // biblemesh_AppComm.postMsg('consoleLog', { message: 'test message' });
    
    return biblemesh_AppComm;
})