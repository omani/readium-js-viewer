define([
"readium_shared_js/globalsSetup",
    "readium_shared_js/globals",
'./ModuleConfig',
'jquery',
'URIjs',
'./Spinner',
'hgn!readium_js_viewer_html_templates/reader-body.html',
'./EpubReaderMediaOverlays',
'./EpubReaderBackgroundAudioTrack',
'./gestures',
'readium_js/Readium',
'readium_shared_js/helpers',
'readium_shared_js/biblemesh_helpers',
'readium_shared_js/models/bookmark_data'],

function (
globalSetup,
Globals,
moduleConfig,
$,
URI,
spinner,
ReaderBody,
EpubReaderMediaOverlays,
EpubReaderBackgroundAudioTrack,
GesturesHandler,
Readium,
Helpers,
biblemesh_Helpers,
BookmarkData){

    // initialised in initReadium()
    var readium = undefined;

    var biblemesh_isWidget = undefined;
    var biblemesh_widgetMetaData = undefined;

    // initialised in loadReaderUI(), with passed data.epub
    var ebookURL = undefined;
    var ebookURL_filepath = undefined;
    var biblemesh_bookId = undefined;

    // initialised in loadEbook() >> readium.openPackageDocument()
    var currentPackageDocument = undefined;
    
    // initialised in initReadium()
    // (variable not actually used anywhere here, but top-level to indicate that its lifespan is that of the reader object (not to be garbage-collected))
    var gesturesHandler = undefined;

    var biblemesh_userData = { books: {} };
    /*  EXAMPLE
        books: {
            <book_id>: {
                latest_location: xxxx,
                updated_at: xxxx,
                highlights: [
                    {
                        spineIdRef: xxxx,
                        cfi: xxxx,
                        color: 1,
                        note: "lorem ipsum",
                        updated_at: xxxx
                    },
                    …
                ]
            },
            …
        }
    */

    var ensureUrlIsRelativeToApp = function(ebookURL) {

        if (!ebookURL) {
            return ebookURL;
        }
        
        if (ebookURL.indexOf("http") != 0) {
            return ebookURL;
        }
            
        var isHTTPS = (ebookURL.indexOf("https") == 0);
    
        var CORS_PROXY_HTTP_TOKEN = "/http://";
        var CORS_PROXY_HTTPS_TOKEN = "/https://";
        
        // Ensures URLs like http://crossorigin.me/http://domain.com/etc
        // do not end-up loosing the double forward slash in http://domain.com
        // (because of URI.absoluteTo() path normalisation)
        var CORS_PROXY_HTTP_TOKEN_ESCAPED = "%2Fhttp%3A%2F%2F";
        var CORS_PROXY_HTTPS_TOKEN_ESCAPED = "%2Fhttps%3A%2F%2F";
        
        // case-insensitive regexp for percent-escapes
        var regex_CORS_PROXY_HTTPs_TOKEN_ESCAPED = new RegExp("%2F(http[s]?)%3A%2F%2F", "gi");
        
        var appUrl =
        window.location ? (
            window.location.protocol
            + "//"
            + window.location.hostname
            + (window.location.port ? (':' + window.location.port) : '')
            // + window.location.pathname
            + "/"  // biblemesh_
        ) : undefined;
        
        if (appUrl) {
            console.log("EPUB URL absolute: " + ebookURL);
            console.log("App URL: " + appUrl);
            
            ebookURL = ebookURL.replace(CORS_PROXY_HTTP_TOKEN, CORS_PROXY_HTTP_TOKEN_ESCAPED);
            ebookURL = ebookURL.replace(CORS_PROXY_HTTPS_TOKEN, CORS_PROXY_HTTPS_TOKEN_ESCAPED);
            
            ebookURL = new URI(ebookURL).relativeTo(appUrl).toString();
            if (ebookURL.indexOf("//") == 0) { // URI.relativeTo() sometimes returns "//domain.com/path" without the protocol
                ebookURL = (isHTTPS ? "https:" : "http:") + ebookURL;
            }
            
            ebookURL = ebookURL.replace(regex_CORS_PROXY_HTTPs_TOKEN_ESCAPED, "/$1://");
            
            console.log("EPUB URL relative to app: " + ebookURL);
        }
        
        return ebookURL;
    };

    // This function will retrieve a package document and load an EPUB
    var loadEbook = function (readerSettings, openPageRequest) {
        readium.openPackageDocument(
            
            ebookURL,
            
            function(packageDocument, options){
                if (!packageDocument) {
                    
                    console.error("ERROR OPENING EBOOK: " + ebookURL_filepath);
                    
                    spin(false);
                    
                    parent.postMessage(JSON.stringify({
                        identifier: 'reportError',
                        payload: {
                            errorCode: 'error opening package document',
                            info: {
                                filepath: ebookURL_filepath,
                            },
                        },
                    }), location.origin);
                            
                    return;
                }
                
                currentPackageDocument = packageDocument;
                currentPackageDocument.generateTocListDOM(function(dom){
                    loadToc(dom)
                });

                if(biblemesh_isWidget) {
                    biblemesh_widgetMetaData = {
                        title: metadata.title || "",
                        author: metadata.author || metadata.publisher || ""
                    };
                }

            },

            openPageRequest

        );
    };

    var spin = function(on)
    {
        if (on) {
    //console.error("do SPIN: -- WILL: " + spinner.willSpin + " IS:" + spinner.isSpinning + " STOP REQ:" + spinner.stopRequested);
            if (spinner.willSpin || spinner.isSpinning) return;
    
            spinner.willSpin = true;
    
            setTimeout(function()
            {
                if (spinner.stopRequested)
                {
    //console.debug("STOP REQUEST: -- WILL: " + spinner.willSpin + " IS:" + spinner.isSpinning + " STOP REQ:" + spinner.stopRequested);
                    spinner.willSpin = false;
                    spinner.stopRequested = false;
                    return;
                }
    //console.debug("SPIN: -- WILL: " + spinner.willSpin + " IS:" + spinner.isSpinning + " STOP REQ:" + spinner.stopRequested);
                spinner.isSpinning = true;
                spinner.spin($('#reading-area')[0]);
    
                spinner.willSpin = false;
    
            }, 100);
        } else {
            
            if (spinner.isSpinning)
            {
//console.debug("!! SPIN: -- WILL: " + spinner.willSpin + " IS:" + spinner.isSpinning + " STOP REQ:" + spinner.stopRequested);
                spinner.stop();
                spinner.isSpinning = false;
            }
            else if (spinner.willSpin)
            {
//console.debug("!! SPIN REQ: -- WILL: " + spinner.willSpin + " IS:" + spinner.isSpinning + " STOP REQ:" + spinner.stopRequested);
                spinner.stopRequested = true;
            }
        }
    };
    
    var loadToc = function(dom){
        var lastIframe = undefined;
            

        readium.reader.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOADED, function ($iframe, spineItem)
        {

            Globals.logEvent("CONTENT_DOCUMENT_LOADED", "ON", "EpubReader.js [ " + spineItem.href + " ]");
            

            //TODO not picked-up by all screen readers, so for now this short description will suffice
            $iframe.attr("title", "EPUB");
            $iframe.attr("aria-label", "EPUB");

            lastIframe = $iframe[0];

            if(biblemesh_isWidget) {
                if(typeof biblemesh_isWidget != 'boolean') {

                    // put in start and end marker elements
                    var widgetScopeBookmarkData = new BookmarkData(biblemesh_isWidget.idref, biblemesh_isWidget.elementCfi);
                    var widgetScopeRange = readium.reader.getDomRangeFromRangeCfi(widgetScopeBookmarkData);

                    var startMarkerEl = $('<span></span>');
                    var endMarkerEl = $('<span></span>');

                    widgetScopeRange.insertNode(startMarkerEl[0]);
                    widgetScopeRange.collapse();
                    widgetScopeRange.insertNode(endMarkerEl[0]);

                    // hide all before start and after end
                    var widgetHide = function(baseEl, direction) {
                        var sibling = baseEl[0][direction + 'Sibling'];
                        while(sibling) {
                            if(sibling.nodeType == 3) {  // text node
                                $(sibling).wrap('<span></span>');
                                sibling = sibling.parentElement;
                            }
                            if(sibling.nodeType == 1) {  // element
                                $(sibling)
                                    .css('cssText', $(sibling).attr('style') + ';display: none !important;')
                                    .attr('data-hiddenbywidget', '');
                            }
                            sibling = sibling[direction + 'Sibling'];
                        }
                        var baseElParent = baseEl.parent();
                        if(baseElParent.length > 0 && !baseElParent.is('body, html')) {
                            widgetHide(baseElParent, direction);
                        }
                    }
                    widgetHide(startMarkerEl, 'previous');
                    widgetHide(endMarkerEl, 'next');

                    // get rid of margin-top at the beginning, and margin-bottom at the end
                    var widgetRemoveMargin = function(baseEl, direction) {
                        var sibling = baseEl[0][direction + 'Sibling'];
                        while(sibling) {
                            if(sibling.nodeType == 3) {  // text node
                                $(sibling).wrap('<span></span>');
                                sibling = sibling.parentElement;
                            }
                            if(sibling.nodeType == 1) {  // element
                                $(sibling)
                                    .css('cssText', $(sibling).attr('style') + ';display: none !important;')
                                    .attr('data-hiddenbywidget', '');
                            }
                            sibling = sibling[direction + 'Sibling'];
                        }
                        var baseElParent = baseEl.parent();
                        if(baseElParent.length > 0 && !baseElParent.is('body, html')) {
                            widgetHide(baseElParent, direction);
                        }
                    }

                    // remove markers
                    startMarkerEl.remove();
                    endMarkerEl.remove();

                }

                var doc = ( $iframe[0].contentWindow || $iframe[0].contentDocument ).document;
                
                $(doc).find('a').off('click').on('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();                    

                    var aHref = $(this).attr('href');
                    var combinedPath = aHref.match(/^#/) ? $iframe.attr('data-src').replace(/#.*$/, '') + aHref : Helpers.ResolveContentRef(aHref, $iframe.attr('data-src'));
                    var hashIndex = combinedPath.indexOf("#");
                    var hrefPart;
                    var elementId;
                    if (hashIndex >= 0) {
                        hrefPart = combinedPath.substr(0, hashIndex);
                        elementId = combinedPath.substr(hashIndex + 1);
                    }
                    else {
                        hrefPart = combinedPath;
                        elementId = undefined;
                    }

                    var linkSpineItem = readium.reader.spine().getItemByHref(hrefPart);
                    var bookmark = new BookmarkData(linkSpineItem.idref, null);
                    debugBookmarkData(bookmark);
                    
                    bookmark.elementCfi = bookmark.contentCFI;
                    bookmark.contentCFI = undefined;
                    bookmark = JSON.stringify(bookmark);
                    
                    ebookURL = ensureUrlIsRelativeToApp(ebookURL);

                    var url = biblemesh_Helpers.buildUrlQueryParameters(undefined, {
                        epub: ebookURL,
                        goto: bookmark,
                        elementId: elementId
                    }, true);

                    window.open(url);
                });

                $(document.body).removeClass("widgetloading");

                var spineInfo = biblemesh_spinelabels[spineItem.href.replace(/#.*$/,'')];
                var spineLabel = $('<textarea />').html((spineInfo && spineInfo.hrefsAndLabels && spineInfo.hrefsAndLabels[0] && spineInfo.hrefsAndLabels[0].label) || "").text();
                var title = $('<textarea />').html(biblemesh_widgetMetaData.title).text();
                var author = $('<textarea />').html(biblemesh_widgetMetaData.author).text();
                parent.postMessage({
                    action: 'setReference',
                    iframeid: window.name,
                    payload: {
                        spineLabel: spineLabel,
                        title: title,
                        author: author,
                    }
                }, '*');

                var docHt = $(doc).find('html').height();
                parent.postMessage({
                    action: 'setHeight',
                    iframeid: window.name,
                    payload: docHt,
                }, '*');

                $('.content-doc-frame, #scaler').css('height', docHt);
   
                spin(false);
                $("#epub-reader-frame").css("opacity", "");
            }

            setTimeout(function() {
                var urlParams = biblemesh_Helpers.getURLQueryParams();
                if(!biblemesh_isWidget && urlParams.elementId) {
                    readium.reader.openSpineItemElementId(spineItem.idref, urlParams.elementId);
                }
            }, 1);
        });

        readium.reader.on(ReadiumSDK.Events.PAGINATION_CHANGED, function (pageChangeData)
        {
            Globals.logEvent("PAGINATION_CHANGED", "ON", "EpubReader.js");

            // var biblemesh_isOnload = biblemesh_onload;  //first call to this function is always during onload
            // biblemesh_onload = false;

            // if(!biblemesh_isOnload) biblemesh_savePlace();
            updateUI(pageChangeData);

            if(pageChangeData.spineItem && !biblemesh_isWidget) {  // biblemesh_
                spin(false);
                $("#epub-reader-frame").css("opacity", "");
            }

            try
            {
                var iframe = undefined;
                var element = undefined;

                var id = pageChangeData.elementId;
                if (!id)
                {
                    var bookmark = JSON.parse(readium.reader.bookmarkCurrentPage());

                    //bookmark.idref; //manifest item
                    if (pageChangeData.spineItem)
                    {
                        element = readium.reader.getElementByCfi(pageChangeData.spineItem.idref, bookmark.contentCFI,
                            ["cfi-marker", "mo-cfi-highlight"],
                            [],
                            ["MathJax_Message"]);
                        element = element[0];

                        if (element)
                        {
                            iframe = $("#epub-reader-frame iframe")[0];
                            var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
                            if (element.ownerDocument !== doc)
                            {
                                iframe = $("#epub-reader-frame iframe")[1];
                                if (iframe)
                                {
                                    doc = ( iframe.contentWindow || iframe.contentDocument ).document;
                                    if (element.ownerDocument !== doc)
                                    {
                                        iframe = undefined;
                                    }
                                }
                            }
                        }
                    }
                }
                else
                {
                    iframe = $("#epub-reader-frame iframe")[0];
                    var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
                    element = doc.getElementById(id);
                    if (!element)
                    {
                        iframe = $("#epub-reader-frame iframe")[1];
                        if (iframe)
                        {
                            doc = ( iframe.contentWindow || iframe.contentDocument ).document;
                            element = doc.getElementById(id);
                            if (!element)
                            {
                                iframe = undefined;
                            }
                        }
                    }
                }

                if (!iframe)
                {
                    iframe = lastIframe;
                }


/* Remove because is removing focus from the toc
                if (iframe)
                {
                    //var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
                    var toFocus = iframe; //doc.body
                    setTimeout(function(){ toFocus.focus(); }, 50);
                }
*/
            }
            catch (e)
            {
                //
            }
        });

    } // end of loadToc

    var biblemesh_getHighlightDataObj = function(cfiObj) {
        var returnObj = false;
        var cfiObjId = biblemesh_getHighlightId(cfiObj);

        biblemesh_userData.books[biblemesh_bookId].highlights.forEach(function(highlight, idx) {
            if(biblemesh_getHighlightId(highlight) == cfiObjId) {
                returnObj = {
                    highlight: highlight,
                    idx: idx
                };
            }
        });

        return returnObj;
    }

    var biblemesh_getHighlightId = function(highlight) {
        return (highlight.spineIdRef || highlight.idref) + ' ' + highlight.cfi;
    }

    var biblemesh_getCurrentIdRef = function() {
        var spotInfo = biblemesh_Helpers.getCurrentSpotInfo();
        var idRef;
        try {
            idRef = JSON.parse(spotInfo.ebookSpot).idref;
        } catch(e) {
            idRef = '';
        }
        return idRef;
    }

    var biblemesh_markHighlightsWithNotes = function() {
        var iframe = $("#epub-reader-frame iframe")[0];
        if(!iframe) return;
        var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
        var docEl = $( doc.documentElement );

        docEl.children('.rd-highlight').removeClass('highlight-with-note');

        biblemesh_userData.books[biblemesh_bookId].highlights.forEach(function(highlight) {
            if(highlight.note) {
                var highlightId = biblemesh_getHighlightId(highlight);
                var highlightEl = docEl.children('[data-id="' + highlightId + '"]');
                if(highlightEl) {
                    highlightEl.addClass('highlight-with-note');
                }
            }
        });
    }

    var biblemesh_drawHighlights = function() {
        if (readium && readium.reader.plugins.highlights) {

            var idRef = biblemesh_getCurrentIdRef();;
            var highlightsToDraw = [];

            // next line needed especially for switching between books
            readium.reader.plugins.highlights.removeHighlightsByType("user-highlight");

            biblemesh_initUserDataBook();

            biblemesh_userData.books[biblemesh_bookId].highlights.forEach(function(highlight) {
                // without this line, highlights are sometimes not added because they are listed as still there
                readium.reader.plugins.highlights.removeHighlight(biblemesh_getHighlightId(highlight));
                if(highlight.spineIdRef == idRef && !highlight._delete) {
                    highlightsToDraw.push(highlight);
                }
            });

            highlightsToDraw.sort(function(a, b) {
                return biblemesh_contentCfiComparator(a.cfi, b.cfi);
            });

            highlightsToDraw.forEach(function(highlight) {
                try {
                    readium.reader.plugins.highlights.addHighlight(
                        highlight.spineIdRef,
                        highlight.cfi,
                        biblemesh_getHighlightId(highlight),
                        "user-highlight"
                    );
                } catch(e) {
                    // should never get here.
                }
            });
            biblemesh_markHighlightsWithNotes();
        }
    }
    
    var updateUI = function(pageChangeData){

        // biblemesh_ : IF and ELSE block new
        if(pageChangeData.spineItem == undefined) {  // i.e. if they are on the same chapter
            try {
                // quicker than running biblemesh_drawHighlights
                // needed because highlights off screen when a new spine is loaded are not drawn
                readium.reader.plugins.highlights.redrawAnnotations();
                biblemesh_markHighlightsWithNotes();
            } catch(e) {}
        } else {
            biblemesh_drawHighlights();
        }

    }

    var biblemesh_initUserDataBook = function(){
        if(!biblemesh_userData.books[biblemesh_bookId]) {
            biblemesh_userData.books[biblemesh_bookId] = {
                latest_location: '',
                updated_at: 0,
                highlights: []
            }        
        }
    }

    //copied from readium-js/readium-shared-js/plugins/highlights
    var biblemesh_parseContentCfi = function(cont) {
        return cont.replace(/\[(.*?)\]/, "").split(/[\/,:]/).map(function(n) {
            return parseInt(n);
        }).filter(Boolean);
    }

    //copied from readium-js/readium-shared-js/plugins/highlights
    var biblemesh_contentCfiComparator = function(cont1, cont2) {
        cont1 = biblemesh_parseContentCfi(cont1);
        cont2 = biblemesh_parseContentCfi(cont2);

        //compare cont arrays looking for differences
        for (var i = 0; i < cont1.length; i++) {
            if (cont1[i] > cont2[i]) {
                return 1;
            } else if (cont1[i] < cont2[i]) {
                return -1;
            }
        }

        //no differences found, so confirm that cont2 did not have values we didn't check
        if (cont1.length < cont2.length) {
            return -1;
        }

        //cont arrays are identical
        return 0;
    }

    var biblemesh_getBookmarkURL = function(){
        if (!ebookURL) return;
        
        var bookmark = readium.reader.bookmarkCurrentPage();
        bookmark = JSON.parse(bookmark);
        
        var cfi = new BookmarkData(bookmark.idref, bookmark.contentCFI);
        debugBookmarkData(cfi);
        
        bookmark.elementCfi = bookmark.contentCFI;
        bookmark.contentCFI = undefined;
        bookmark = JSON.stringify(bookmark);
        
        ebookURL = ensureUrlIsRelativeToApp(ebookURL);

        var url = biblemesh_Helpers.buildUrlQueryParameters(undefined, {
            epub: ebookURL,
            epubs: " ",
            embedded: " ",
            goto: bookmark
        });

        return url;
    }

    var biblemesh_showHighlightOptions = function(forceShowNote) {

        var iframe = $("#epub-reader-frame iframe")[0];
        var win = iframe.contentWindow || iframe;
        var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
        var docEl = $( doc.documentElement );
        var sel = win.getSelection();
        var selStr = sel.toString().replace(/\n/g,' ').trim();
        var cfiObj = readium.reader.plugins.highlights.getCurrentSelectionCfi();

        biblemesh_initUserDataBook();

        if(!sel.isCollapsed && selStr!='' && cfiObj) {

            var highlightId = biblemesh_getHighlightId(cfiObj);
            
            var currentHighlight = biblemesh_getHighlightDataObj(cfiObj);

            var hasCurrentHighlight = function() {
                return currentHighlight && !currentHighlight.highlight._delete;
            }

            // get selection bounding box
            var rg = sel.getRangeAt(0);
            var cRect = rg.getBoundingClientRect();
            var selectionVeryTop = cRect.top;
            var selectionVeryBottom = cRect.top+cRect.height;

            // parent.postMessage(JSON.stringify({
            //     identifier: 'textSelected',
            //     payload: {
            //         startCfi: '??',  // TODO
            //         endCfi: '??',  // TODO
            //         copyTooltipInLowerHalf: false,  // TODO
            //     },
            // }), location.origin);

        }
    }

    var nextPage = function () {
        readium.reader.openPageRight();
        return false;
    };

    var prevPage = function () {
        readium.reader.openPageLeft();
        return false;
    };
    
    var loadReaderUIPrivate = function(){
        var $appContainer = $('#app-container');
        $appContainer.empty();
        // $appContainer.append(ReaderBody({strings: Strings, dialogs: Dialogs, keyboard: Keyboard}));
        $appContainer.append(ReaderBody());

        spin(true);
    }

    var loadReaderUI = function (data) {
        ebookURL = data.epub;
        ebookURL_filepath = Helpers.getEbookUrlFilePath(ebookURL);
        biblemesh_isWidget = !!data.widget;

        if(biblemesh_isWidget) {
            parent.postMessage({
                action: 'loading',
                iframeid: window.name
            }, '*');
        }

        loadReaderUIPrivate();

        //because we reinitialize the reader we have to unsubscribe to all events for the previews reader instance
        if(readium && readium.reader) {
            
            Globals.logEvent("__ALL__", "OFF", "EpubReader.js");
            readium.reader.off();
        }

        if (window.ReadiumSDK) {
            Globals.logEvent("PLUGINS_LOADED", "OFF", "EpubReader.js");
            ReadiumSDK.off(ReadiumSDK.Events.PLUGINS_LOADED);
        }

        setTimeout(function()
        {
            initReadium(); //async
        }, 0);
    };

    var initReadium = function(){

        // biblemesh_ : next lines through the call to to getMultiple and the setting of biblemesh_userData are new
        var spotInfo = biblemesh_Helpers.getCurrentSpotInfo();
        biblemesh_bookId = spotInfo.bookId;
        var bookKey = 'books/' + biblemesh_bookId;

        try { ga('send', 'pageview', window.location.pathname); } catch(e) {} // biblemesh_

        var settings = {

        }

        biblemesh_userData.books[biblemesh_bookId] = settings[bookKey] || null;

        var readerOptions =  {
            el: "#epub-reader-frame",
            annotationCSSUrl: moduleConfig.annotationCSSUrl + '?bust=VERSION_BUST_STRING',  // biblemesh_
            mathJaxUrl : moduleConfig.mathJaxUrl,
        };

        var readiumOptions = {
            jsLibRoot: moduleConfig.jsLibRoot,
            openBookOptions: {}
        };

        if (moduleConfig.useSimpleLoader){
            readiumOptions.useSimpleLoader = true;
        }

        var openPageRequest;
        var goto = spotInfo.ebookSpot;  //biblemesh_
        if (goto) {
            console.log("Goto override? " + goto);

            try {
                var gotoObj = JSON.parse(goto);
                
                var openPageRequest_ = undefined;
                
                
                // See ReaderView.openBook()
                // e.g. with accessible_epub_3:
                // &goto={"contentRefUrl":"ch02.xhtml%23_data_integrity","sourceFileHref":"EPUB"}
                // or: {"idref":"id-id2635343","elementCfi":"/4/2[building_a_better_epub]@0:10"} (the legacy spatial bookmark is wrong here, but this is fixed in intel-cfi-improvement feature branch)
                if (gotoObj.idref) {
                    if (gotoObj.spineItemPageIndex) {
                        openPageRequest_ = {idref: gotoObj.idref, spineItemPageIndex: gotoObj.spineItemPageIndex};
                    }
                    else if (gotoObj.elementCfi) {
                                    
                        _debugBookmarkData_goto = new BookmarkData(gotoObj.idref, gotoObj.elementCfi);
                        
                        openPageRequest_ = {idref: gotoObj.idref, elementCfi: gotoObj.elementCfi};
                    }
                    else {
                        openPageRequest_ = {idref: gotoObj.idref};
                    }
                }
                else if (gotoObj.contentRefUrl && gotoObj.sourceFileHref) {
                    openPageRequest_ = {contentRefUrl: gotoObj.contentRefUrl, sourceFileHref: gotoObj.sourceFileHref};
                }
                
                
                if (openPageRequest_) {
                    if(biblemesh_isWidget) {
                        biblemesh_isWidget = openPageRequest_;
                    }
                    openPageRequest = openPageRequest_;
                    console.debug("Open request (goto): " + JSON.stringify(openPageRequest));
                }
            } catch(err) {
                console.error(err);
            }
        }
        readium = new Readium(readiumOptions, readerOptions);

        window.READIUM = readium;

        ReadiumSDK.on(ReadiumSDK.Events.PLUGINS_LOADED, function () {
            Globals.logEvent("PLUGINS_LOADED", "ON", "EpubReader.js");
            
            console.log('PLUGINS INITIALIZED!');

            if (!readium.reader.plugins.highlights) {
                $('.icon-annotations').css("display", "none");
            } else {
                $('.icon-annotations').css("display", "none");  // biblemesh_ 

                readium.reader.plugins.highlights.initialize({
                    annotationCSSUrl: readerOptions.annotationCSSUrl
                });

                readium.reader.plugins.highlights.on("annotationClicked", function(type, idref, cfi, id) {
                    console.debug("ANNOTATION CLICK: " + id);
                    // biblemesh_ : this function has all new contents

                    var iframe = $("#epub-reader-frame iframe")[0];
                    var win = iframe.contentWindow || iframe;
                    var sel = win.getSelection();

                    // select the text of a highlight
                    var highlightBookmarkData = new BookmarkData(idref, cfi);
                    var highlightRange = readium.reader.getDomRangeFromRangeCfi(highlightBookmarkData);

                    sel.removeAllRanges();
                    sel.addRange(highlightRange);
    
                    biblemesh_showHighlightOptions();

                });
            }

        });

        readium.reader.addIFrameEventListener('keydown', function(e) {
            e.preventDefault();
            e.stopPropagation();
        });

        readium.reader.addIFrameEventListener('touchstart', function(e) {
            var iframe = $("#epub-reader-frame iframe")[0];
            var win = iframe.contentWindow || iframe;
        });
        readium.reader.addIFrameEventListener('touchend', function(e) {
            var iframe = $("#epub-reader-frame iframe")[0];
            var win = iframe.contentWindow || iframe;
        });

        var defaultSettings = {
            fontSize: 100,
            syntheticSpread: "auto",
            scroll: "auto",
            theme: "author-theme",
            columnGap: 45,
            columnMaxWidth: 600,
            columnMinWidth: 300
        }

        var readerSettings = settings.reader || defaultSettings;   // biblemesh_

        if(biblemesh_isWidget) {
            var urlParams = biblemesh_Helpers.getURLQueryParams();
            readerSettings.scroll = 'scroll-doc';
            readerSettings.theme = urlParams.theme || 'author-theme'; 
            readerSettings.columnMaxWidth = 99999;
            readerSettings.columnMinWidth = 100;
            readerSettings.syntheticSpread = 'single';
            readerSettings.fontSize = parseInt(urlParams.textsize, 10) || 100;
            // SettingsDialog.updateReader(readium.reader, readerSettings);
        }

        readium.reader.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOAD_START, function($iframe, spineItem) {
            Globals.logEvent("CONTENT_DOCUMENT_LOAD_START", "ON", "EpubReader.js [ " + spineItem.href + " ]");

            $("#epub-reader-frame").css("opacity", ".01");
            spin(true);
        });

        EpubReaderMediaOverlays.init(readium);

        EpubReaderBackgroundAudioTrack.init(readium);

        //epubReadingSystem

        loadEbook(readerSettings, openPageRequest);
    }

    var unloadReaderUI = function(){

        if (readium) {
            readium.closePackageDocument();
        }

        // visibility check fails because iframe is unloaded
        //if (readium.reader.isMediaOverlayAvailable())
        if (readium && readium.reader) // window.push/popstate
        {
            try{
                readium.reader.pauseMediaOverlay();
            }catch(err){
                //ignore error.
                //can occur when ReaderView._mediaOverlayPlayer is null, for example when openBook() fails 
            }
        }

        // $(window).off('unload');  // biblemesh_
    }

    var applyKeyboardSettingsAndLoadUi = function(data)
    {
        // override current scheme with user options
        Settings.get('reader', function(json)
        {
            loadReaderUI(data);
        });
    };

    return {
        loadUI : applyKeyboardSettingsAndLoadUi,
        unloadUI : unloadReaderUI,
        tooltipSelector : function() {},
        ensureUrlIsRelativeToApp : ensureUrlIsRelativeToApp 
    };

});
    