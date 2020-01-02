define(['jquery', './EpubReader', 'readium_shared_js/helpers', 'biblemesh_AppComm'], function($, EpubReader, Helpers, biblemesh_AppComm){
        
    if(typeof Sentry != 'undefined') Sentry.init({ dsn: 'https://0569beced42c4b068367c8d47cfddf36@sentry.io/144504' })
    window.addEventListener("error", function(e) { Sentry.captureException(e) })
    window.addEventListener("unhandledrejection", function(e) { Sentry.captureException(e) })

    window.addEventListener('unload', function() { biblemesh_AppComm.postMsg('unload') })

    // postMessageFileCache is irrelevant unless I have goToCfi switch pages
    // without reloading the window (which would probably be good).
    var postMessageFileCache = {}  

    var fileAsTextCallbacksByURL = {};
    biblemesh_AppComm.subscribe('fileAsText', function(payload) {
        var uri = payload.uri
        if(fileAsTextCallbacksByURL[uri]) {
            if(payload.error) {
                fileAsTextCallbacksByURL[uri].error({}, 'error', null)
            } else {
                postMessageFileCache[uri] = payload.fileText
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
            if(typeof Sentry != 'undefined') Sentry.captureMessage('Ajax call returned with error. Request: ' + JSON.stringify(settings))
            _error(xhr, status, errorThrown);
        }
        settings.success = function(result) {
            // // cache the most common files in localstorage: container.xml, opf and toc
            // if(settings.url.match(/(?:container\.xml|\.opf|\.ncx|toc\.xhtml|nav\.xhtml)$/) && result.length < 100000) {
            //     try {
            //         localStorage.setItem("biblemesh_cache:" + settings.url, result);
            //     } catch(e) {}
            // }
            _success(result);
        }

        // try {
        //     // see if we have stored it in localstorage (used with most common files)
        //     const localStorageFileCache = localStorage.getItem("biblemesh_cache:" + settings.url);
        //     if(localStorageFileCache) {
        //         settings.success(localStorageFileCache);
        //         return
        //     }
        // } catch(e) {}

        if(window.isReactNativeWebView) {

            if(postMessageFileCache[settings.url]) {
                settings.success(postMessageFileCache[settings.url])
                return
            }

            fileAsTextCallbacksByURL[settings.url] = settings

            biblemesh_AppComm.postMsg('getFileAsText', { uri: settings.url });

            return
        } else {
            var dataOrigin = Helpers.getURLQueryParams().epub.replace(/^(https?:\/\/[^\/]*).*$/i, '$1')
            if(settings.url.indexOf(dataOrigin) === 0) {
                settings.headers = window.epubFileFetchHeaders
            }
            return $._ajax(settings)
        }
    }

    // For css and script files included in the xhtml.
    var cookies = ((window.epubFileFetchHeaders || {})["x-cookie-override"] || '').split(';');
    for(var i=0; i<cookies.length; i++) {
        document.cookie = cookies[i].trim();
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
    