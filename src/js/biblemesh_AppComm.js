define([
],
function(
){

    // This next function is needed because when the app in android
    // sends a postMessage to the WebView, it runs decodeURIComponent
    // on it for some reason. To fix this I swap out % for {"} (an
    // impossible sequence in JSON) before sending it and then
    // swap {"} out for % in the cloud-reader-lite.
    var percentageUnescape = (str) => str.replace(/{"}/g, '%')
    
    var funcsByIdentifier = {}

    document.addEventListener('message', function(event) {

        if(event.origin && event.origin !== window.location.origin) return  // only allow from the the apps or the same origin
        
        var message = JSON.parse(percentageUnescape(event.data))

        if(funcsByIdentifier[message.identifier]) {
            funcsByIdentifier[message.identifier](message.payload || {})
        }
    })  

    var biblemesh_AppComm = {
        subscribe: function(identifier, func) {

            funcsByIdentifier[identifier] = func;

        },
        postMsg: function(identifier, payload) {
            parent.postMessage(JSON.stringify({
                identifier: identifier,
                payload: payload,
            }), location.origin);
        },
    }

    // setup receiving loadSpineAndGetPagesInfo messages
        // do post pagesInfo messages

    // setup receiving renderHighlights messages

    // setup receiving setDisplaySettings messages

    // only use postMessage if we are in native apps (in the future, this may also be used for offline books in the web app)

    // biblemesh_AppComm.postMsg('consoleLog', { message: 'test message' });
    
    return biblemesh_AppComm;
})