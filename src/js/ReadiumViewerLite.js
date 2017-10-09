define(['jquery', './EpubReader', 'readium_shared_js/helpers', 'biblemesh_AppComm'], function($, EpubReader, Helpers, biblemesh_AppComm){
    
    if(typeof Raven != 'undefined') Raven.config('https://0569beced42c4b068367c8d47cfddf36@sentry.io/144504').install()
        
    var specialAssetRetrievalMethod = 'ajaxThroughPostMessage'  // or 'none'
    biblemesh_AppComm.subscribe('setSpecialAssetRetrievalMethod', function(payload) {
        if([ 'none', 'ajaxThroughPostMessage' ].indexOf(payload) != -1) {
            specialAssetRetrievalMethod = payload.method
        }
    })
    
    var fileAsTextCallbacksByURL = {};
    biblemesh_AppComm.subscribe('fileAsText', function(payload) {
        var uri = payload.uri
        if(fileAsTextCallbacksByURL[uri]) {
            if(payload.error) {
                fileAsTextCallbacksByURL[uri].error({}, 'error', null)
            } else {
                fileAsTextCallbacksByURL[uri].success(payload.fileText)
            }
            delete fileAsTextCallbacksByURL[uri]
        }
    })

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
    