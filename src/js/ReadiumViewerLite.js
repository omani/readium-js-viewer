define(['jquery', './EpubReader', 'readium_shared_js/helpers'], function($, EpubReader, Helpers){

    if(typeof Raven != 'undefined') Raven.config('https://0569beced42c4b068367c8d47cfddf36@sentry.io/144504').install()
        
    // decide where to put this code so as all functionality can work through it

   // setup receiving goToCfi messages

   // have specialAssetRetrievalMethod set via postMessage

    // do post pageChanged message instead of updating the URL and messing with pushState or replaceState

    // do post showPageListView message when appropriate

    // do post textSelected message when appropriate

    // do post textUnselected message when appropriate

    // do post reportError message when appropriate

    // setup receiving loadSpineAndGetPagesInfo messages
        // do post pagesInfo messages

    // setup receiving renderHighlights messages

    // setup receiving setDisplaySettings messages

    // only use postMessage if we are in native apps (in the future, this may also be used for offline books in the web app)
 alert('test')
    
    // var specialAssetRetrievalMethod = 'none'
    var specialAssetRetrievalMethod = 'ajaxThroughPostMessage'
    var fileAsTextCallbacksByURL = {}

    // This next function is needed because when the app in android
    // sends a postMessage to the WebView, it runs decodeURIComponent
    // on it for some reason. To fix this I swap out % for {"} (an
    // impossible sequence in JSON) before sending it and then
    // swap {"} out for % in the cloud-reader-lite.
    const percentageUnescape = (str) => str.replace(/{"}/g, '%')
    
    document.addEventListener('message', function(event) {
        if(event.origin && event.origin !== window.location.origin) return  // only allow from the the apps or the same origin

        var message = JSON.parse(percentageUnescape(event.data))

        switch(message.identifier) {
            case 'setSpecialAssetRetrievalMethod':
                if([ 'none', 'ajaxThroughPostMessage' ].indexOf(message.payload) != -1) {
                    specialAssetRetrievalMethod = message.payload.method
                }
                break;
            case 'fileAsText':
                var uri = message.payload.uri
                if(fileAsTextCallbacksByURL[uri]) {
                    if(message.payload.error) {
                        fileAsTextCallbacksByURL[uri].error({}, 'error', null)
                    } else {
                        fileAsTextCallbacksByURL[uri].success(message.payload.fileText)
                    }
                    delete fileAsTextCallbacksByURL[uri]
                }
                break;
            case 'loadSpineAndGetPagesInfo':
                break;
            case 'goToCfi':
                break;
            case 'renderHighlights':
                break;
            case 'setDisplaySettings':
                break;
        }
    })  
    
    var consoleLog = function(message) {
        parent.postMessage(JSON.stringify({
            identifier: 'consoleLog',
            payload: {
                message: message,
            },
        }), location.origin);
    }

    $._ajax = $.ajax;
    $.ajax = function(settings) {
        var _error = settings.error;
        var _success = settings.success;
        settings.error = function(xhr, status, errorThrown) {
            Raven.captureException(new Error('Ajax call returned with error. Request: ' + JSON.stringify(settings)))
            _error(xhr, status, errorThrown);
        }
        settings.success = function(result) {
            _success(result);
        }

        if(specialAssetRetrievalMethod == 'ajaxThroughPostMessage') {

            fileAsTextCallbacksByURL[settings.url] = settings
            
            parent.postMessage(JSON.stringify({
                identifier: 'getFileAsText',
                payload: {
                    uri: settings.url,
                },
            }), location.origin);

            return
        } else {
            return $._ajax(settings)
        }
    }

    
    $(function(){

        var urlParams = Helpers.getURLQueryParams();
    
        // embedded, epub
        // (epub is ebookURL)
      EpubReader.loadUI(urlParams);

        $(document.body).on('click', function()
        {
            $(document.body).removeClass("keyboard");
        });

        $(document).on('keyup', function(e)
        {
            $(document.body).addClass("keyboard");
        });
    });

    $(document.body).tooltip({
        selector : EpubReader.tooltipSelector(),
        placement: function(tip, element){
          var placeValue = 'auto';
          if (element.id == 'left-page-btn'){
            placeValue = 'right';
          } else if (element.id == 'right-page-btn') {
            placeValue = 'left'
          }
          return placeValue;
        },
        container: 'body' // do this to prevent weird navbar re-sizing issue when the tooltip is inserted
    }).on('show.bs.tooltip', function(e){
        $(EpubReader.tooltipSelector()).not(e.target).tooltip('destroy');
        var target = e.target; 
        setTimeout(function(){
            $(target).tooltip('destroy');
        }, 8000);
    });
    
    
    
    
    if (window.File
         //&& window.FileReader
     ) {
        var fileDragNDropHTMLArea = $(document.body);
        fileDragNDropHTMLArea.on("dragover", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            
            //$(ev.target)
            fileDragNDropHTMLArea.addClass("fileDragHover");
        });
        fileDragNDropHTMLArea.on("dragleave", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            
            //$(ev.target)
            fileDragNDropHTMLArea.removeClass("fileDragHover");
        });
        fileDragNDropHTMLArea.on("drop", function(ev) {
            ev.stopPropagation();
            ev.preventDefault();
            
            //$(ev.target)
            fileDragNDropHTMLArea.removeClass("fileDragHover");
            
            var files = ev.target.files || ev.originalEvent.dataTransfer.files;
            if (files.length) {
                var file = files[0];
                console.log("File drag-n-drop:");
                console.log(file.name);
                console.log(file.type);
                console.log(file.size);
                
                if (file.type == "application/epub+zip" || (/\.epub$/.test(file.name))) {
                    
                      EpubReader.loadUI({epub: file});
                }
            }
        });
    }

});
