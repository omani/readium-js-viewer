define([
"readium_shared_js/globalsSetup",
 "readium_shared_js/globals",
'./ModuleConfig',
'jquery',
'bootstrap',
'bootstrapA11y',
'URIjs',
'./Spinner',
'biblemesh_Settings',
'i18nStrings',
'./Dialogs',
'./ReaderSettingsDialog',
'hgn!readium_js_viewer_html_templates/about-dialog.html',
'hgn!readium_js_viewer_html_templates/reader-navbar.html',
'hgn!readium_js_viewer_html_templates/reader-body.html',
'hgn!readium_js_viewer_html_templates/reader-body-page-btns.html',
'hgn!readium_js_viewer_html_templates/biblemesh_highlight-opts.html',
'hgn!readium_js_viewer_html_templates/biblemesh_progress-bar-item.html',
'Analytics',
'screenfull',
'./Keyboard',
'./EpubReaderMediaOverlays',
'./EpubReaderBackgroundAudioTrack',
'./gestures',
'./versioning/ReadiumVersioning',
'readium_js/Readium',
'readium_shared_js/helpers',
'readium_shared_js/biblemesh_helpers',
'readium_shared_js/models/bookmark_data'],

function (
globalSetup,
Globals,
moduleConfig,
$,
bootstrap,
bootstrapA11y,
URI,
spinner,
Settings,
Strings,
Dialogs,
SettingsDialog,
AboutDialog,
ReaderNavbar,
ReaderBody,
ReaderBodyPageButtons,
biblemesh_highlightOptions,
biblemesh_progressBarItem,
Analytics,
screenfull,
Keyboard,
EpubReaderMediaOverlays,
EpubReaderBackgroundAudioTrack,
GesturesHandler,
Versioning,
Readium,
Helpers,
biblemesh_Helpers,
BookmarkData){

    // initialised in initReadium()
    var readium = undefined;

    // initialised in loadReaderUI(), with passed data.embedded
    var embedded = undefined;
    
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

    var biblemesh_userDataRefreshInterval = 0;

    var biblemesh_onload = true;
    var biblemesh_doPushState = false;
    
    // TODO: is this variable actually used anywhere here??
    // (bad naming convention, hard to find usages of "el")
    var el = document.documentElement;

    var tooltipSelector = function() {
        return 'nav *[title], #readium-page-btns *[title], #progressBar *[title]';
    };
   
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

    function setBookTitle(title) {
    
        var $titleEl = $('.book-title-header');
        if ($titleEl.length) {
            $titleEl.text(title);
        } else {
            $('<h2 class="book-title-header"></h2>').insertAfter('.navbar').text(title);
        }

        document.title = title;  // biblemesh_
    };

    var _debugBookmarkData_goto = undefined;
    var debugBookmarkData = function(cfi) {
            
        var DEBUG = false; // change this to visualize the CFI range  biblemesh_
        if (!DEBUG) return;
                
        if (!readium) return;
            
        var paginationInfo = readium.reader.getPaginationInfo();
        console.log(JSON.stringify(paginationInfo));
        
        if (paginationInfo.isFixedLayout) return;
    
        try {
            ReadiumSDK._DEBUG_CfiNavigationLogic.clearDebugOverlays();
            
        } catch (error) {
            //ignore
        }
        
        try {
            console.log(cfi);
            
            var range = readium.reader.getDomRangeFromRangeCfi(cfi);
            console.log(range);
            
            var res = ReadiumSDK._DEBUG_CfiNavigationLogic.drawDebugOverlayFromDomRange(range);
            console.log(res);
        
            var cfiFirst = ReadiumSDK.reader.getFirstVisibleCfi();
            console.log(cfiFirst);
            
            var cfiLast  = ReadiumSDK.reader.getLastVisibleCfi();
            console.log(cfiLast);
            
        } catch (error) {
            //ignore
        }
        
        setTimeout(function() {
            try {
                ReadiumSDK._DEBUG_CfiNavigationLogic.clearDebugOverlays();
            } catch (error) {
                //ignore
            }
        }, 2000);
    };
    
    // This function will retrieve a package document and load an EPUB
    var loadEbook = function (readerSettings, openPageRequest) {

        biblemesh_askedAboutLocationUpdate = false;

        readium.openPackageDocument(
            
            ebookURL,
            
            function(packageDocument, options){
                
                if (!packageDocument) {
                    
                    console.error("ERROR OPENING EBOOK: " + ebookURL_filepath);
                    
                    spin(false);
                    setBookTitle(ebookURL_filepath);
                            
                    Dialogs.showErrorWithDetails(Strings.err_epub_corrupt, ebookURL_filepath);
                    //Dialogs.showModalMessage(Strings.err_dlg_title, ebookURL_filepath);
                            
                    return;
                }
                
                currentPackageDocument = packageDocument;
                currentPackageDocument.generateTocListDOM(function(dom){
                    loadToc(dom)
                });
    
                wasFixed = readium.reader.isCurrentViewFixedLayout();
                var metadata = options.metadata;
    
                setBookTitle(metadata.title);
    
                $("#left-page-btn").unbind("click");
                $("#right-page-btn").unbind("click");
                var $pageBtnsContainer = $('#readium-page-btns');
                $pageBtnsContainer.empty();
                var rtl = currentPackageDocument.getPageProgressionDirection() === "rtl"; //_package.spine.isLeftToRight()
                $pageBtnsContainer.append(ReaderBodyPageButtons({strings: Strings, dialogs: Dialogs, keyboard: Keyboard,
                    pageProgressionDirectionIsRTL: rtl
                }));
                $("#left-page-btn").on("click", prevPage);
                $("#right-page-btn").on("click", nextPage);
                $("#left-page-btn").mouseleave(function() {
                  $(tooltipSelector()).tooltip('destroy');
                });
                $("#right-page-btn").mouseleave(function() {
                  $(tooltipSelector()).tooltip('destroy');
                });
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

    var tocShowHideToggle = function(){

        unhideUI();

        var $appContainer = $('#app-container'),
            hide = $appContainer.hasClass('toc-visible');
        var bookmark;
        if (readium.reader.handleViewportResize && !embedded){
            bookmark = JSON.parse(readium.reader.bookmarkCurrentPage());
        }

        if (hide){
            $appContainer.removeClass('toc-visible');

            // clear tabindex off of any previously focused ToC item
            var existsFocusable = $('#readium-toc-body a[tabindex="60"]');
            if (existsFocusable.length > 0){
              existsFocusable[0].setAttribute("tabindex", "-1");
            }
            /* end of clear focusable tab item */
            setTimeout(function(){ $('#tocButt')[0].focus(); }, 100);
        }
        else{
            $appContainer.addClass('toc-visible');

            setTimeout(function(){ $('#readium-toc-body button.close')[0].focus(); }, 100);
        }

        if(embedded){
            hideLoop(null, true);
        }else if (readium.reader.handleViewportResize){

            readium.reader.handleViewportResize(bookmark);

            // setTimeout(function()
            // {
            //     readium.reader.openSpineItemElementCfi(bookmark.idref, bookmark.contentCFI, readium.reader);
            // }, 90);
        }
    };

    var showScaleDisplay = function(){
        $('.zoom-wrapper').show();
    }
    var setScaleDisplay = function(){
        var scale = readium.reader.getViewScale();
        $('.zoom-wrapper input').val(Math.round(scale) + "%");
    }

    var hideScaleDisplay = function(){
        $('.zoom-wrapper').hide();
    }

    var loadToc = function(dom){

        if (dom) {
            $('script', dom).remove();

            var tocNav;

            var $navs = $('nav', dom);
            Array.prototype.every.call($navs, function(nav){
                if (nav.getAttributeNS('http://www.idpf.org/2007/ops', 'type') == 'toc'){
                    tocNav = nav;
                    return false;
                }
                return true;
            });

            var isRTL = false;
            var pparent = tocNav;

            while (pparent && pparent.getAttributeNS)
            {
                var dir = pparent.getAttributeNS("http://www.w3.org/1999/xhtml", "dir") || pparent.getAttribute("dir");

                if (dir && dir === "rtl")
                {
                    isRTL = true;
                    break;
                }
                pparent = pparent.parentNode;
            }

            var toc = (tocNav && $(tocNav).html()) || $('body', dom).html() || $(dom)[0].outerHTML;  // biblemesh_
            var tocUrl = currentPackageDocument.getToc();

            if (toc && toc.length)
            {
                var $toc = $(toc);

                // "iframe" elements need to be stripped out, because of potential vulnerability when loading malicious EPUBs
                // e.g. src="javascript:doHorribleThings(window.top)"
                // Note that "embed" and "object" elements with AllowScriptAccess="always" do not need to be removed,
                // because unlike "iframe" the @src URI does not trigger the execution of the "javascript:" statement,
                // and because the "data:" base64 encoding of an image/svg that contains ecmascript
                // automatically results in origin/domain restrictions (thereby preventing access to window.top / window.parent).
                // Also note that "script" elements are discarded automatically by jQuery.
                $('iframe', $toc).remove();

                $('#readium-toc-body').append($toc);

                if (isRTL)
                {
                    $toc[0].setAttributeNS("http://www.w3.org/1999/xhtml", "dir", "rtl");
                    $toc[0].style.direction = "rtl"; // The CSS stylesheet property does not trigger :(
                }

                // remove default focus from anchor elements in TOC after added to #readium-toc-body
                var $items = $('#readium-toc-body li >a');
                $items.each(function(){
                  $(this).attr("tabindex", "-1");
                   $(this).on("focus", function(event){
                    //console.log("toc item focus: " + event.target);
                    // remove tabindex from previously focused
                    var $prevFocus = $('#readium-toc-body a[tabindex="60"]');
                    if ($prevFocus.length>0 && $prevFocus[0] !== event.target){
                      //console.log("previous focus: " + $prevFocus[0]);
                      $prevFocus.attr("tabindex","-1");
                    }
                    // add to newly focused
                    event.target.setAttribute("tabindex", "60");
                  });
                });

                biblemesh_setupProgressBar(dom);

            }

        } else {
            var tocUrl = currentPackageDocument.getToc();

            $('#readium-toc-body').append("?? " + tocUrl);
        }

        var _tocLinkActivated = false;

        var lastIframe = undefined,
            wasFixed;

        readium.reader.on(ReadiumSDK.Events.FXL_VIEW_RESIZED, function() {
            Globals.logEvent("FXL_VIEW_RESIZED", "ON", "EpubReader.js");
            setScaleDisplay();
        });
        
        readium.reader.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOADED, function ($iframe, spineItem)
        {
            Globals.logEvent("CONTENT_DOCUMENT_LOADED", "ON", "EpubReader.js [ " + spineItem.href + " ]");
            
            var isFixed = readium.reader.isCurrentViewFixedLayout();

            // TODO: fix the pan-zoom feature!
            if (isFixed){
                showScaleDisplay();
            }
            else{
                hideScaleDisplay();
            }

            //TODO not picked-up by all screen readers, so for now this short description will suffice
            $iframe.attr("title", "EPUB");
            $iframe.attr("aria-label", "EPUB");

            lastIframe = $iframe[0];
        });

        readium.reader.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOAD_START, function (loadStartData, loadStartSpineItem)
        {
            biblemesh_updateProgressBar(loadStartSpineItem.idref);
        })
        readium.reader.on(ReadiumSDK.Events.PAGINATION_CHANGED, function (pageChangeData)
        {
            Globals.logEvent("PAGINATION_CHANGED", "ON", "EpubReader.js");
            
            var biblemesh_isOnload = biblemesh_onload;  //first call to this function is always during onload
            biblemesh_onload = false;

            if (_debugBookmarkData_goto) {
                
                debugBookmarkData(_debugBookmarkData_goto);
                _debugBookmarkData_goto = undefined;
            }
            
            biblemesh_updateURL();
            if(!biblemesh_isOnload) biblemesh_savePlace();
            updateUI(pageChangeData);

            spin(false);

            if (!_tocLinkActivated) return;
            _tocLinkActivated = false;

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

        $('#readium-toc-body').on('click', 'a', function(e)
        {
            try {
                spin(true);
    
                var href = $(this).attr('href');
                //href = tocUrl ? new URI(href).absoluteTo(tocUrl).toString() : href;
    
                _tocLinkActivated = true;
    
                biblemesh_doPushState = true;
                readium.reader.openContentUrl(href, tocUrl, undefined);
    
                if (embedded) {
                    $('.toc-visible').removeClass('toc-visible');
                    unhideUI();
                }
            } catch (err) {
                
                console.error(err);
                
            } finally {
                //e.preventDefault();
                //e.stopPropagation();
                return false;
            }
        });
        $('#readium-toc-body').prepend('<button tabindex="50" type="button" class="close" data-dismiss="modal" aria-label="'+Strings.i18n_close+' '+Strings.toc+'" title="'+Strings.i18n_close+' '+Strings.toc+'"><span aria-hidden="true">&times;</span></button>');
        $('#readium-toc-body button.close').on('click', function(){
            tocShowHideToggle();
            /*
            var bookmark = JSON.parse(readium.reader.bookmarkCurrentPage());
            $('#app-container').removeClass('toc-visible');
            if (embedded){
                $(document.body).removeClass('hide-ui');
            }else if (readium.reader.handleViewportResize){
                readium.reader.handleViewportResize();
                readium.reader.openSpineItemElementCfi(bookmark.idref, bookmark.contentCFI, readium.reader);
            }
            */
            return false;
        })
//        var KEY_ENTER = 0x0D;
//        var KEY_SPACE = 0x20;
        var KEY_END = 0x23;
        var KEY_HOME = 0x24;
//        var KEY_LEFT = 0x25;
        var KEY_UP = 0x26;
//        var KEY_RIGHT = 0x27;
        var KEY_DOWN = 0x28;

        $('#readium-toc-body').keydown( function(event){
            var next = null;
            var blurNode = event.target;
            switch (event.which) {
              case KEY_HOME:
                  //find first li >a
                  next = $('#readium-toc-body li >a')[0];
              break;

              case KEY_END:
              // find last a within toc
                next = $('#readium-toc-body a').last()[0];
              break;

              case KEY_DOWN:
                if (blurNode.tagName == "BUTTON") {
                    var existsFocusable = $('#readium-toc-body a[tabindex="60"]');
                    if (existsFocusable.length > 0) {
                      next = existsFocusable[0];
                    } else {
                      // go to first entry
                      next = $('#readium-toc-body li >a')[0];
                    }
                } else {
                  // find all the a elements, find previous focus (tabindex=60) then get next
                  var $items = $('#readium-toc-body a');
                  var index = $('a[tabindex="60"]').index('#readium-toc-body a');
                  //var index = $('a[tabindex="60"]').index($items); // not sure why this won't work?
                  if (index > -1 && index < $items.length-1) {
                    next = $items.get(index+1);
                  } 
                }
              break;

              case KEY_UP:
                // find all the a elements, find previous focus (tabindex=60) then get previous
                var $items = $('#readium-toc-body a');
                var index = $('a[tabindex="60"]').index('#readium-toc-body a');
                if (index > -1 && index > 0 ) {
                  next = $items.get(index-1);
                } 
              break;

              default:
                return;
            }
            if (next) {
              event.preventDefault();
              setTimeout(next.focus(), 5);
            }
          return;
      }); // end of onkeyup
    } // end of loadToc

    var biblemesh_setupProgressBar = function(tocDOM){
        var progressBarEl = $("<div id='progressBar'></div>");
        var idRef = biblemesh_getCurrentIdRef();
        var spineItemsLen = readium.reader.spine().items.length;
        var labels = {};

        if(spineItemsLen <= 1) return;

        $('a', tocDOM).each(function(idx, el) {
            labels[$(el).attr('href')] = $(el).text().replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        });

        for( var i=0; i<spineItemsLen; i++ ) {
            var spineItem = readium.reader.spine().item(i);
            if(spineItem) {
                var lineContEl = $( biblemesh_progressBarItem(
                    {
                        idref: spineItem.idref,
                        label: labels[spineItem.href]
                    }
                ) )
                    .on('click', function(e) {
                        var gotoIdRef = $(this).attr('data-idref');
                        spin(true);
                        biblemesh_doPushState = true;
                        readium.reader.openSpineItemElementId(gotoIdRef);
                        biblemesh_updateProgressBar(gotoIdRef);
                    });
                
                progressBarEl.append(lineContEl);
            }
        }

        $('#reading-area').append(progressBarEl);

        biblemesh_updateProgressBar();

    } // end of biblemesh_setupProgressBar

    var biblemesh_updateProgressBar = function(idRef) {

        idRef = idRef || biblemesh_getCurrentIdRef();

        var beforeCurrentSpot = !!idRef;

        $(".progressBarLineCont").each(function(idx, el) {
            el = $(el);
            var isCurrentPage = el.attr('data-idref') == idRef;
            beforeCurrentSpot = beforeCurrentSpot && !isCurrentPage;

            el[isCurrentPage ? "addClass" : "removeClass"]("progressBarLineCurrent");
            el[beforeCurrentSpot ? "addClass" : "removeClass"]("progressBarLineDone");

        });

    } // end of biblemesh_updateProgressBar

    var toggleFullScreen = function(){

        if (!screenfull.enabled) return;

        screenfull.toggle();
    }

    var isChromeExtensionPackagedApp = (typeof chrome !== "undefined") && chrome.app
              && chrome.app.window && chrome.app.window.current; // a bit redundant?

    if (isChromeExtensionPackagedApp) {
        screenfull.onchange = function(e) {
            if (chrome.app.window.current().isFullscreen()) {
                chrome.app.window.current().restore();
            }
        };
    }
    var oldOnChange = screenfull.onchange;
    screenfull.onchange = function(e){
        var titleText;

        if (screenfull.isFullscreen)
        {
            titleText = Strings.exit_fullscreen+ ' [' + Keyboard.FullScreenToggle + ']';
            $('#buttFullScreenToggle span').removeClass('glyphicon-resize-full');
            $('#buttFullScreenToggle span').addClass('glyphicon-resize-small');
            $('#buttFullScreenToggle').attr('aria-label', titleText);
            $('#buttFullScreenToggle').attr('title', titleText);
        }
        else
        {
            titleText = Strings.enter_fullscreen + ' [' + Keyboard.FullScreenToggle + ']';
            $('#buttFullScreenToggle span').removeClass('glyphicon-resize-small');
            $('#buttFullScreenToggle span').addClass('glyphicon-resize-full');
            $('#buttFullScreenToggle').attr('aria-label', titleText);
            $('#buttFullScreenToggle').attr('title', titleText);
        }
        oldOnChange.call(this, e);
    }
    var unhideUI = function(){
        hideLoop();
    }

    var hideUI = function(){
        hideTimeoutId = null;
        // don't hide it toolbar while toc open in non-embedded mode
        if (!embedded && $('#app-container').hasClass('toc-visible')){
            hideLoop()
            return;
        }

        var navBar = document.getElementById("app-navbar");
        if (document.activeElement) {
            var within = jQuery.contains(navBar, document.activeElement);
            if (within){
                hideLoop();
                return;
            } 
        }

        var $navBar = $(navBar);
        // BROEKN! $navBar.is(':hover')
        var isMouseOver = $navBar.find(':hover').length > 0;
        if (isMouseOver){
            hideLoop()
            return;  
        } 

        if ($('#audioplayer').hasClass('expanded-audio')){
            hideLoop();
            return;  
        } 

        $(tooltipSelector()).tooltip('destroy');

        $(document.body).addClass('hide-ui');
    }

    var hideTimeoutId;

    var hideLoop = function(e, immediate){

        // if (!embedded){
        //     return;
        // }
        if (hideTimeoutId){
            window.clearTimeout(hideTimeoutId);
            hideTimeoutId = null;
        }
        if (!$('#app-container').hasClass('toc-visible') && $(document.body).hasClass('hide-ui')){
            $(document.body).removeClass('hide-ui');
        }
        if (immediate){
            hideUI();
        }
        else{
            hideTimeoutId = window.setTimeout(hideUI, 3000);  // biblemesh_
        }
    }

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
        }
    }
    
    var biblemesh_delHighlightOpts = function() {
        var iframe = $("#epub-reader-frame iframe")[0];
        if(!iframe) return;
        var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
        var docEl = $( doc.documentElement );

        docEl.find('.highlightOpts-note-text').trigger('blur');

        readium.reader.plugins.highlights.removeHighlight("highlightOpts-sel-highlight");
        docEl.children("#highlightOpts").remove();
    }

    //TODO: also update "previous/next page" commands status (disabled/enabled), not just button visibility.
    // https://github.com/readium/readium-js-viewer/issues/188
    // See onSwipeLeft() onSwipeRight() in gesturesHandler.
    // See nextPage() prevPage() in this class.
    var updateUI = function(pageChangeData){
        if(pageChangeData.paginationInfo.canGoLeft())
            $("#left-page-btn").show();
        else
            $("#left-page-btn").hide();
        if(pageChangeData.paginationInfo.canGoRight())
            $("#right-page-btn").show();
        else
            $("#right-page-btn").hide();

        // biblemesh_ : IF and ELSE block new
        if(pageChangeData.spineItem == undefined) {  // i.e. if they are on the same chapter
            try {
                // quicker than running biblemesh_drawHighlights
                // needed because highlights off screen when a new spine is loaded are not drawn
                readium.reader.plugins.highlights.redrawAnnotations();
            } catch(e) {}
        } else {
            biblemesh_drawHighlights();
            biblemesh_updateProgressBar(pageChangeData.spineItem.idref);
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

    //copied from readium-js/readium-shared-js/plugins/highlights
    var biblemesh_cfiIsBetweenTwoCfis = function(cfi, firstVisibleCfi, lastVisibleCfi) {
        if (!firstVisibleCfi || !lastVisibleCfi) {
            return null;
        }
        var first = biblemesh_contentCfiComparator(cfi, firstVisibleCfi);
        var second = biblemesh_contentCfiComparator(cfi, lastVisibleCfi);
        return first >= 0 && second <= 0;
    }

    var biblemesh_askedAboutLocationUpdate = false;
    var biblemesh_refreshUserDataCallback = function() {
        var spotInfo = biblemesh_Helpers.getCurrentSpotInfo();

        biblemesh_drawHighlights();

        if(!biblemesh_askedAboutLocationUpdate) {
            try {
                var latLoc = biblemesh_userData.books[biblemesh_bookId].latest_location;
                if(latLoc && latLoc != spotInfo.ebookSpot) {
                    var dataLoc = JSON.parse(latLoc);
                    if(dataLoc.idref && dataLoc.elementCfi) {

                        var firstVisibleCfi = readium.reader.getFirstVisibleCfi();
                        var lastVisibleCfi = readium.reader.getLastVisibleCfi();

                        if (firstVisibleCfi &&
                            lastVisibleCfi &&
                            !biblemesh_cfiIsBetweenTwoCfis(
                                dataLoc.elementCfi,
                                firstVisibleCfi.contentCFI,
                                lastVisibleCfi.contentCFI)
                        ) {
                            Dialogs.showModalPrompt(Strings.biblemesh_location_update, Strings.biblemesh_execute_location_update,
                                                    Strings.biblemesh_i18n_update, Strings.i18n_cancel,
                                                    function(){
                                                        readium.reader.openSpineItemElementCfi(dataLoc.idref, dataLoc.elementCfi);
                                                    });
                            biblemesh_askedAboutLocationUpdate = true;
                        }
                    }
                }
            } catch (e) {}
        }
    }

    var savePlace = function(){
        Settings.put(ebookURL_filepath, readium.reader.bookmarkCurrentPage(), $.noop);
    }

    var biblemesh_savePlace = function(){
        var spotInfo = biblemesh_Helpers.getCurrentSpotInfo();

        if(biblemesh_bookId) {
            biblemesh_initUserDataBook();
            if(biblemesh_userData.books[biblemesh_bookId].latest_location != spotInfo.ebookSpot) {
                biblemesh_userData.books[biblemesh_bookId].latest_location = spotInfo.ebookSpot;
                biblemesh_userData.books[biblemesh_bookId].updated_at = biblemesh_Helpers.getUTCTimeStamp();
                Settings.patch(biblemesh_userData, biblemesh_refreshUserDataCallback);
            }
        }
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

    var biblemesh_updateURL = function(){

        var url = biblemesh_getBookmarkURL()
        
        history[biblemesh_doPushState ? 'pushState' : 'replaceState']({epub: "/epub_content/book_" + biblemesh_bookId}, null, url);
        biblemesh_doPushState = false;
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
        biblemesh_delHighlightOpts();

        if(!sel.isCollapsed && selStr!='' && cfiObj) {

            var highlightOptsEl = $( biblemesh_highlightOptions(
                {
                    strings: Strings
                }
            ) );

            var currentHighlight = biblemesh_getHighlightDataObj(cfiObj);

            var hasCurrentHighlight = function() {
                return currentHighlight && !currentHighlight.highlight._delete;
            }

            var saveHighlight = function() {
                if(hasCurrentHighlight() && currentHighlight.highlight.note != $(this).val()) {  // should always be true
                    currentHighlight.highlight.note = $(this).val();
                    currentHighlight.highlight.updated_at = biblemesh_Helpers.getUTCTimeStamp();
                    Settings.patch(biblemesh_userData, biblemesh_refreshUserDataCallback);
                    biblemesh_setupShareLink();
                }
            }

            var encodeURIComp = function(comp) {
                return encodeURIComponent(comp).replace(/%20/g, "+");
            }

            function biblemesh_setupShareLink() {
                var abridgedHighlight = selStr;
                var abridgedNote = hasCurrentHighlight() ? currentHighlight.highlight.note : '';
                while(encodeURIComp(abridgedHighlight+abridgedNote).length > 1900) {
                    if(abridgedHighlight.length > abridgedNote.length) {
                        abridgedHighlight = abridgedHighlight.substring(0, abridgedHighlight.length-50) + '...';
                    } else {
                        abridgedNote = abridgedNote.substring(0, abridgedNote.length-50) + '...';
                    }
                }
                highlightOptsEl.find('.highlightOpts-share').attr('href',
                    '/book/' + biblemesh_bookId
                        + '?goto=' + encodeURIComp(JSON.stringify({
                            idref: cfiObj.idref,
                            elementCfi: cfiObj.cfi
                        }))
                        + '&highlight=' + encodeURIComp(abridgedHighlight)
                        + (abridgedNote ? '&note=' + encodeURIComp(abridgedNote) : '')
                        + (abridgedNote
                            ? '&sharer=' + encodeURIComp(
                                (Settings.getUserAttr('firstname') + ' ' + Settings.getUserAttr('lastname')).trim()
                            )
                            : ''
                        )
                        + '&editing=1'
                );
            }

            var noteBeforeDel = '';

            var setupVisually = function() {
                highlightOptsEl
                    .find('.highlightOpts-box-' + (hasCurrentHighlight() ? currentHighlight.highlight.color : 0))
                    .addClass('highlightOpts-sel')
                    .siblings('.highlightOpts-box')
                    .removeClass('highlightOpts-sel');
                highlightOptsEl
                    .find('.highlightOpts-line:not(.highlightOpts-highlightline)')
                    [hasCurrentHighlight() ? 'removeClass' : 'addClass']('highlightOpts-faded');
                highlightOptsEl
                    .find('.highlightOpts-note-text')
                    .val(hasCurrentHighlight() ? currentHighlight.highlight.note : '');
                highlightOptsEl
                    .find('.highlightOpts-addnote')
                    [hasCurrentHighlight() ? 'removeClass' : 'addClass']('disabled');
            }

            setupVisually();

            var SHADOW_WIDTH = 10;
            var docHt = docEl.height();
            var docWd = docEl.width();

            var docLeft = parseInt(docEl.css("left"), 10);

            // get selection bounding box
            var rg = sel.getRangeAt(0);
            var cRect = rg.getBoundingClientRect();
            var selectionVeryTop = cRect.top;
            var selectionVeryBottom = cRect.top+cRect.height;
            var selectionVeryLeft = cRect.left;
            var selectionVeryRight = cRect.left+cRect.width;
            var hasNote = forceShowNote || (hasCurrentHighlight() && currentHighlight.highlight.note);

            var style = {
                width: hasNote ? Math.min( 400 , docWd - SHADOW_WIDTH*2 ) : 250,
                height: hasNote ? Math.min( 216 , docHt - SHADOW_WIDTH*2 ) : 42
            }

            var midLeft = docLeft * -1 + parseInt((selectionVeryLeft + selectionVeryRight) / 2);
            var moreRoomAtTop = (selectionVeryTop + selectionVeryBottom) / 2 > docHt / 2;

            style.left = Math.max( SHADOW_WIDTH , Math.min( docWd - docLeft - style.width - SHADOW_WIDTH*2 , midLeft - parseInt(style.width/2) ) );
            style.top = Math.max( SHADOW_WIDTH , Math.min( docHt - style.height - SHADOW_WIDTH*2 , moreRoomAtTop ? selectionVeryTop - style.height : selectionVeryBottom ) );;

            highlightOptsEl.css(style);

            if(!hasNote) {
                highlightOptsEl.addClass('nonote');
            }

// a click on a highlight that includes a partial word does not then indicate a highlight is selected

            highlightOptsEl.find('.highlightOpts-box').on('click', function() {
                if($(this).hasClass('highlightOpts-sel')) return;

                var highlightChoice = parseInt($(this).attr('data-choice'));

                if(highlightChoice == 0) {
                    readium.reader.plugins.highlights.removeHighlight(biblemesh_getHighlightId(cfiObj));

                    if(currentHighlight) {
                        if(currentHighlight.highlight.note != "") {
                            var boxSelectedBeforeDel = highlightOptsEl.find('.highlightOpts-sel');
                            noteBeforeDel = currentHighlight.highlight.note;
                            highlightOptsEl.find('.highlightOpts-share').after(
                                $("<div class='highlightOpts-undo'>" + Strings.biblemesh_undo + "</div>")
                                    .on('click', function() {
                                        boxSelectedBeforeDel.trigger('click');
                                    })
                            );
                        }
                        currentHighlight.highlight = biblemesh_userData.books[biblemesh_bookId].highlights[currentHighlight.idx] = {
                            spineIdRef: cfiObj.idref,
                            cfi: cfiObj.cfi,
                            updated_at: biblemesh_Helpers.getUTCTimeStamp(),
                            _delete: true
                        }
                    }

                } else {
                    // readium.reader.plugins.highlights.addHighlight(cfiObj.idref, cfiObj.cfi, biblemesh_getHighlightId(cfiObj), "user-highlight");

                    var highlightData = {
                        spineIdRef: cfiObj.idref,
                        cfi: cfiObj.cfi,
                        color: highlightChoice,
                        note: noteBeforeDel,
                        updated_at: biblemesh_Helpers.getUTCTimeStamp()
                    };
                    
                    if(currentHighlight) {
                        currentHighlight.highlight = biblemesh_userData.books[biblemesh_bookId].highlights[currentHighlight.idx] = highlightData;
                    } else {
                        biblemesh_userData.books[biblemesh_bookId].highlights.push(highlightData);
                        currentHighlight = {
                            idx: biblemesh_userData.books[biblemesh_bookId].highlights.length - 1,
                            highlight: highlightData
                        }
                    }

                    highlightOptsEl.find('.highlightOpts-undo').remove();
                    highlightOptsEl.find('.highlightOpts-note-text').val(noteBeforeDel);

                    biblemesh_drawHighlights();
                }

                Settings.patch(biblemesh_userData, biblemesh_refreshUserDataCallback);

                setupVisually();
            });

            highlightOptsEl.find('.highlightOpts-addnote')
                .on('click', function(e) {
                    if($(this).hasClass('disabled')) return;

                    var highlightBookmarkData = new BookmarkData(currentHighlight.highlight.spineIdRef, currentHighlight.highlight.cfi);
                    var highlightRange = readium.reader.getDomRangeFromRangeCfi(highlightBookmarkData);

                    sel.removeAllRanges();
                    sel.addRange(highlightRange);

                    biblemesh_showHighlightOptions(true);
                });

            highlightOptsEl.find('.highlightOpts-note-text')
                .on('mousedown', function(e) {
                    if(!hasCurrentHighlight()) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                })
                .on('blur', saveHighlight)
                .on('change', saveHighlight)
                .on('mouseup', saveHighlight)
                .on('touchend', saveHighlight)
                .on('keyup', saveHighlight);

            highlightOptsEl.find('.highlightOpts-share')
                .on('click', function(e) {
                    e.preventDefault();

                    var bodyHt = $('body').height();

                    Dialogs.showModalMessage(Strings.biblemesh_share, '');
                    $('.modal-body').addClass('withShareIFrame').html('').append(
                        $('<iframe class="shareIframe"></iframe>')
                            .attr('src', $(this).attr('href'))
                            .css('height', Math.min(500, bodyHt - 100) )
                    );
                    $('.modal-footer').remove();

                });

            docEl.append(highlightOptsEl);

            readium.reader.plugins.highlights.addSelectionHighlight("highlightOpts-sel-highlight", "sel-highlight", undefined, true);
            biblemesh_setupShareLink();

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

    var installReaderEventHandlers = function(){

        if (isChromeExtensionPackagedApp) {
            $('.icon-shareUrl').css("display", "none");
        } else {
            $(".icon-shareUrl").on("click", function () {
                
                // biblemesh_ : Next line replaces 17 lines of code
                var url = biblemesh_getBookmarkURL();
                
                //showModalMessage
                //showErrorWithDetails
                Dialogs.showModalMessageEx(Strings.share_url, $('<p id="share-url-dialog-input-label">'+Strings.share_url_label+'</p><input id="share-url-dialog-input-id" aria-labelledby="share-url-dialog-input-label" type="text" value="'+url+'" readonly="readonly" style="width:100%" />'));
                
                setTimeout(function(){
                    $('#share-url-dialog-input-id').focus().select();
                }, 500);
            });
        }

        // Set handlers for click events
        // $(".icon-annotations").on("click", function () { });  -- biblemesh_ : not needed

        var isWithinForbiddenNavKeysArea = function()
        {
            return document.activeElement &&
            (
                document.activeElement === document.getElementById('volume-range-slider')
                || document.activeElement === document.getElementById('time-range-slider')
                || document.activeElement === document.getElementById('rate-range-slider')
                || jQuery.contains(document.getElementById("mo-sync-form"), document.activeElement)
                || jQuery.contains(document.getElementById("mo-highlighters"), document.activeElement)

                // jQuery.contains(document.getElementById("app-navbar"), document.activeElement)
                // || jQuery.contains(document.getElementById("settings-dialog"), document.activeElement)
                // || jQuery.contains(document.getElementById("about-dialog"), document.activeElement)
            )
            ;
        };

        var hideTB = function(){
            if (!embedded && $('#app-container').hasClass('toc-visible')){
                return;
            }
            hideUI();
            if (document.activeElement) document.activeElement.blur();
        };
        $("#buttHideToolBar").on("click", hideTB);
        // biblemesh_ : following event commented out
        // Keyboard.on(Keyboard.ToolbarHide, 'reader', hideTB);

        var showTB = function(){
            $("#aboutButt1")[0].focus();
            unhideUI();
            setTimeout(function(){ $("#aboutButt1")[0].focus(); }, 50);
        };
        $("#buttShowToolBar").on("click", showTB);
        // biblemesh_ : following event commented out
        // Keyboard.on(Keyboard.ToolbarShow, 'reader', showTB);

        Keyboard.on(Keyboard.PagePrevious, 'reader', function(){
            if (!isWithinForbiddenNavKeysArea()) prevPage();
        });

        // biblemesh_ : following event commented out
        // Keyboard.on(Keyboard.PagePreviousAlt, 'reader', prevPage);

        // biblemesh_ : following event commented out
        // Keyboard.on(Keyboard.PageNextAlt, 'reader', nextPage);

        Keyboard.on(Keyboard.PageNext, 'reader', function(){
            if (!isWithinForbiddenNavKeysArea()) nextPage();
        });

        // biblemesh_ : following event commented out
        // Keyboard.on(Keyboard.FullScreenToggle, 'reader', toggleFullScreen);

        $('#buttFullScreenToggle').on('click', toggleFullScreen);

        var loadlibrary = function()
        {
            $("html").attr("data-theme", "library");
            
            var urlParams = biblemesh_Helpers.getURLQueryParams();
            //var ebookURL = urlParams['epub'];
            var libraryURL = urlParams['epubs'];
            
            $(window).triggerHandler('loadlibrary', libraryURL);
            //$(window).trigger('loadlibrary');
        };

        // biblemesh_ : following event commented out
        // Keyboard.on(Keyboard.SwitchToLibrary, 'reader', loadlibrary /* function(){setTimeout(, 30);} */ );

        $('.icon-library').on('click', function(){
            loadlibrary();
            return false;
        });

        $('.zoom-wrapper input').on('click', function(){
            if (!this.disabled){
                this.focus();
                return false;
            }
        });

        // biblemesh_ : following event commented out
        // Keyboard.on(Keyboard.TocShowHideToggle, 'reader', function()
        // {
        //     var visible = $('#app-container').hasClass('toc-visible');
        //     if (!visible)
        //     {
        //         tocShowHideToggle();
        //     }
        //     else
        //     {
        //         setTimeout(function(){ $('#readium-toc-body button.close')[0].focus(); }, 100);
        //     }
        // });

        $('.icon-toc').on('click', tocShowHideToggle);

        var setTocSize = function(){
            var appHeight = $(document.body).height() - $('#app-container')[0].offsetTop;
            $('#app-container').height(appHeight);
            $('#readium-toc-body').height(appHeight);
            biblemesh_delHighlightOpts();
        };

        // biblemesh_ : following event commented out
        // Keyboard.on(Keyboard.ShowSettingsModal, 'reader', function(){$('#settings-dialog').modal("show")});

        $('#app-navbar').on('mousemove', hideLoop);
        
        $(window).on('resize', setTocSize);
        setTocSize();
        hideLoop();

        // biblemesh_ : new event to ensure save of highlight note
        $(window).on('unload', function() {
            var iframe = $("#epub-reader-frame iframe")[0];
            var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
            var docEl = $( doc.documentElement );

            docEl.find('.highlightOpts-note-text').trigger('blur');
        });

            // captures all clicks on the document on the capture phase. Not sure if it's possible with jquery
            // so I'm using DOM api directly
            //document.addEventListener('click', hideLoop, true);
    };

    var setFitScreen = function(e){
        readium.reader.setZoom({style: 'fit-screen'});
        $('.active-zoom').removeClass('active-zoom');
        $('#zoom-fit-screen').addClass('active-zoom');
        $('.zoom-wrapper input').prop('disabled', true);
        $('.zoom-wrapper>a').dropdown('toggle');
        return false;
    }

    var setFitWidth = function(e){
        readium.reader.setZoom({style: 'fit-width'});
        $('.active-zoom').removeClass('active-zoom');
        $('#zoom-fit-width').addClass('active-zoom');
        $('.zoom-wrapper input').prop('disabled', true);
         $('.zoom-wrapper>a').dropdown('toggle');
        return false;
    }

    var enableCustom = function(e){
        $('.zoom-wrapper input').prop('disabled', false).focus();
        $('.active-zoom').removeClass('active-zoom');
        $('#zoom-custom').addClass('active-zoom');
         $('.zoom-wrapper>a').dropdown('toggle');
        return false;
    }

    var zoomRegex = /^\s*(\d+)%?\s*$/;
    var setCustom = function(e){
        var percent = $('.zoom-wrapper input').val();
        var matches = zoomRegex.exec(percent);
        if (matches){
            var percentVal = Number(matches[1])/100;
            readium.reader.setZoom({style: 'user', scale: percentVal});
        }
        else{
            setScaleDisplay();
        }
    }

    var loadReaderUIPrivate = function(){
        $('.modal-backdrop').remove();
        var $appContainer = $('#app-container');
        $appContainer.empty();
        $appContainer.append(ReaderBody({strings: Strings, dialogs: Dialogs, keyboard: Keyboard}));
        $('nav').empty();
        $('nav').attr("aria-label", Strings.i18n_toolbar);
        $('nav').append(ReaderNavbar({
            strings: Strings,
            dialogs: Dialogs,
            keyboard: Keyboard,
            idp_logo_src: Settings.getUserAttr('idpLogoSrc'),  // biblemesh_
            logout_of_idp: Strings.biblemesh_logout_of + Settings.getUserAttr('idpName'),  // biblemesh_
            firstname: Settings.getUserAttr('firstname')  // biblemesh_
        }));
        installReaderEventHandlers();
        document.title = "Reader";  // biblemesh_
        $('#zoom-fit-width a').on('click', setFitWidth);
        $('#zoom-fit-screen a').on('click', setFitScreen);
        $('#zoom-custom a').on('click', enableCustom);
        $('.zoom-wrapper input').on('change', setCustom);

        // biblemesh_ : following event
        $('#navusersettings').on('click', function(){
            $('#settings-dialog').modal("show");
        });

        spin(true);
    }

    var loadReaderUI = function (data) {

        Keyboard.scope('reader');

        ebookURL = data.epub;
        ebookURL_filepath = Helpers.getEbookUrlFilePath(ebookURL);


        Analytics.trackView('/reader');
        embedded = data.embedded;

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

        console.log("MODULE CONFIG:");
        console.log(moduleConfig);

        // biblemesh_ : next lines through the call to to getMultiple and the setting of biblemesh_userData are new
        var spotInfo = biblemesh_Helpers.getCurrentSpotInfo();
        biblemesh_bookId = spotInfo.bookId;
        var bookKey = 'books/' + biblemesh_bookId;

        try { ga('send', 'pageview', window.location.pathname); } catch(e) {} // biblemesh_

        Settings.getMultiple(['reader', bookKey], function(settings){

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

            _debugBookmarkData_goto = undefined;
            var openPageRequest;
            // biblemesh_ : following IF block replaces original
            if (biblemesh_userData.books[biblemesh_bookId]){
                try {
                    var bookmark = JSON.parse(biblemesh_userData.books[biblemesh_bookId].latest_location);
                    //console.log("Bookmark restore: " + JSON.stringify(bookmark));
                    // openPageRequest = {idref: bookmark.idref, elementCfi: bookmark.contentCFI};
                    openPageRequest = bookmark;
                    console.debug("Open request (bookmark): " + JSON.stringify(openPageRequest));
                } catch(err) {
                    console.error(err);
                }
            }

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
    
                if (readium.reader.plugins.example) {
                    readium.reader.plugins.example.on("exampleEvent", function(message) {
                        alert(message);
                    });
                }
            });

            gesturesHandler = new GesturesHandler(readium.reader, readerOptions.el);
            gesturesHandler.initialize();

            $(window).on('keyup', function(e)
            {
                if (e.keyCode === 9 || e.which === 9)
                {
                    unhideUI();
                }
            });

            readium.reader.addIFrameEventListener('keydown', function(e) {
                Keyboard.dispatch(document.documentElement, e.originalEvent);
            });

            readium.reader.addIFrameEventListener('keyup', function(e) {
                Keyboard.dispatch(document.documentElement, e.originalEvent);
            });

            readium.reader.addIFrameEventListener('focus', function(e) {
                // $('#reading-area').addClass("contentFocus");  // biblemesh_
                hideUI();  // biblemesh_
                $(window).trigger("focus");
            });
            
            readium.reader.addIFrameEventListener('blur', function(e) {
                // $('#reading-area').removeClass("contentFocus");  // biblemesh_
            });

            // biblemesh_ : the following two listeners are new
            readium.reader.addIFrameEventListener('mousedown', function(e) {
                if(!e || !e.target) { return; }

                hideUI();  // biblemesh_

                if($(e.target).attr('id') == "highlightOpts" || $(e.target).parents("#highlightOpts").length != 0) {
                    // e.preventDefault();
                    // e.stopPropagation();
                    return;
                } else {
                    var iframe = $("#epub-reader-frame iframe")[0];
                    var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
                    var docEl = $( doc.documentElement );

                    biblemesh_delHighlightOpts();
                }
            });
            readium.reader.addIFrameEventListener('mouseup', function(e) {
                if(!e || !e.target) { return; }

                if($(e.target).attr('id') == "highlightOpts" || $(e.target).parents("#highlightOpts").length != 0) {
                    // e.preventDefault();
                    // e.stopPropagation();
                    return;
                }

                setTimeout(function() {
                    biblemesh_showHighlightOptions();
                }, 1);
                
            });

            SettingsDialog.initDialog(readium.reader);

            $('#settings-dialog').on('hidden.bs.modal', function () {

                Keyboard.scope('reader');

                unhideUI()
                setTimeout(function(){ $("#settbutt1").focus(); }, 50);

                $("#buttSave").removeAttr("accesskey");
                $("#buttClose").removeAttr("accesskey");
            });
            $('#settings-dialog').on('shown.bs.modal', function () {

                Keyboard.scope('settings');

                $("#buttSave").attr("accesskey", Keyboard.accesskeys.SettingsModalSave);
                $("#buttClose").attr("accesskey", Keyboard.accesskeys.SettingsModalClose);
            });


            $('#about-dialog').on('hidden.bs.modal', function () {
                Keyboard.scope('reader');

                unhideUI();
                setTimeout(function(){ $("#aboutButt1").focus(); }, 50);
            });
            $('#about-dialog').on('shown.bs.modal', function(){
                Keyboard.scope('about');
            });

            var readerSettings;
            if (settings.reader){
                readerSettings = settings.reader;   // biblemesh_
            }
            if (!embedded){
                readerSettings = readerSettings || SettingsDialog.defaultSettings;
                SettingsDialog.updateReader(readium.reader, readerSettings);
            }
            else{
                readium.reader.updateSettings({
                    syntheticSpread:  "auto",
                    scroll: "auto"
                });
            }


            var toggleNightTheme = function(){

                if (!embedded){

                    Settings.get('reader', function(json)
                    {
                        if (!json)
                        {
                            json = {};
                        }

                        var isNight = json.theme === "night-theme";
                        json.theme = isNight ? "author-theme" : "night-theme";

                        Settings.put('reader', json);

                        SettingsDialog.updateReader(readium.reader, json);
                    });
                }
            };
            $("#buttNightTheme").on("click", toggleNightTheme);
            // biblemesh_ : following event commented out
            // Keyboard.on(Keyboard.NightTheme, 'reader', toggleNightTheme);

            readium.reader.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOAD_START, function($iframe, spineItem) {
                Globals.logEvent("CONTENT_DOCUMENT_LOAD_START", "ON", "EpubReader.js [ " + spineItem.href + " ]");
                
                spin(true);
            });

            EpubReaderMediaOverlays.init(readium);

            EpubReaderBackgroundAudioTrack.init(readium);

            //epubReadingSystem

            Versioning.getVersioningInfo(function(version){

                $('#app-container').append(AboutDialog({imagePathPrefix: moduleConfig.imagePathPrefix, strings: Strings, dateTimeString: version.dateTimeString, viewerJs: version.readiumJsViewer, readiumJs: version.readiumJs, sharedJs: version.readiumSharedJs, cfiJs: version.readiumCfiJs}));


                window.navigator.epubReadingSystem.name = "readium-js-viewer";
                window.navigator.epubReadingSystem.version = version.readiumJsViewer.chromeVersion;

                window.navigator.epubReadingSystem.readium = {};

                window.navigator.epubReadingSystem.readium.buildInfo = {};

                window.navigator.epubReadingSystem.readium.buildInfo.dateTime = version.dateTimeString; //new Date(timestamp).toString();
                window.navigator.epubReadingSystem.readium.buildInfo.version = version.readiumJsViewer.version;
                window.navigator.epubReadingSystem.readium.buildInfo.chromeVersion = version.readiumJsViewer.chromeVersion;

                window.navigator.epubReadingSystem.readium.buildInfo.gitRepositories = [];

                var repo1 = {};
                repo1.name = "readium-js-viewer";
                repo1.sha = version.readiumJsViewer.sha;
                repo1.tag = version.readiumJsViewer.tag;
                repo1.version = version.readiumJsViewer.version;
                repo1.clean = version.readiumJsViewer.clean;
                repo1.branch = version.readiumJsViewer.branch;
                repo1.release = version.readiumJsViewer.release;
                repo1.timestamp = version.readiumJsViewer.timestamp;
                repo1.url = "https://github.com/readium/" + repo1.name + "/tree/" + repo1.sha;
                window.navigator.epubReadingSystem.readium.buildInfo.gitRepositories.push(repo1);

                var repo2 = {};
                repo2.name = "readium-js";
                repo2.sha = version.readiumJs.sha;
                repo2.tag = version.readiumJs.tag;
                repo2.version = version.readiumJs.version;
                repo2.clean = version.readiumJs.clean;
                repo2.branch = version.readiumJs.branch;
                repo2.release = version.readiumJs.release;
                repo2.timestamp = version.readiumJs.timestamp;
                repo2.url = "https://github.com/readium/" + repo2.name + "/tree/" + repo2.sha;
                window.navigator.epubReadingSystem.readium.buildInfo.gitRepositories.push(repo2);

                var repo3 = {};
                repo3.name = "readium-shared-js";
                repo3.sha = version.readiumSharedJs.sha;
                repo3.tag = version.readiumSharedJs.tag;
                repo3.version = version.readiumSharedJs.version;
                repo3.clean = version.readiumSharedJs.clean;
                repo3.branch = version.readiumSharedJs.branch;
                repo3.release = version.readiumSharedJs.release;
                repo3.timestamp = version.readiumSharedJs.timestamp;
                repo3.url = "https://github.com/readium/" + repo3.name + "/tree/" + repo3.sha;
                window.navigator.epubReadingSystem.readium.buildInfo.gitRepositories.push(repo3);

                var repo4 = {};
                repo4.name = "readium-cfi-js";
                repo4.sha = version.readiumCfiJs.sha;
                repo4.tag = version.readiumCfiJs.tag;
                repo4.version = version.readiumCfiJs.version;
                repo4.clean = version.readiumCfiJs.clean;
                repo4.branch = version.readiumCfiJs.branch;
                repo4.release = version.readiumCfiJs.release;
                repo4.timestamp = version.readiumCfiJs.timestamp;
                repo4.url = "https://github.com/readium/" + repo4.name + "/tree/" + repo4.sha;
                window.navigator.epubReadingSystem.readium.buildInfo.gitRepositories.push(repo4);

                // Debug check:
                //console.debug(JSON.stringify(window.navigator.epubReadingSystem, undefined, 2));


                loadEbook(readerSettings, openPageRequest);
            });
        });
        
        // biblemesh_ : Next statement is new
        biblemesh_userDataRefreshInterval = setInterval(function() {
            Settings.refreshUserData(biblemesh_bookId, biblemesh_userData, biblemesh_refreshUserDataCallback);
        }, (1000*60*60));
    }

    var unloadReaderUI = function(){

        clearInterval(biblemesh_userDataRefreshInterval);  // biblemesh_

        if (readium) {
            readium.closePackageDocument();
        }

        // needed only if access keys can potentially be used to open a book while a dialog is opened, because keyboard.scope() is not accounted for with HTML access keys :(
        // for example: settings dialogs is open => SHIFT CTRL [B] access key => library view opens with transparent black overlay!
        Dialogs.closeModal();
        Dialogs.reset();
        $('#settings-dialog').modal('hide');
        $('#about-dialog').modal('hide');
        $('.modal-backdrop').remove();
        $('#app-navbar').off('mousemove');


        Keyboard.off('reader');
        Keyboard.off('settings');

        $('#settings-dialog').off('hidden.bs.modal');
        $('#settings-dialog').off('shown.bs.modal');

        $('#about-dialog').off('hidden.bs.modal');
        $('#about-dialog').off('shown.bs.modal');

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

        $(window).off('resize');
        $(window).off('mousemove');
        $(window).off('keyup');
        $(window).off('message');
        $(window).off('unload');  // biblemesh_
        window.clearTimeout(hideTimeoutId);
        $(document.body).removeClass('embedded');
        $('.book-title-header').remove();

        $(document.body).removeClass('hide-ui');
    }

    var applyKeyboardSettingsAndLoadUi = function(data)
    {
        // override current scheme with user options
        Settings.get('reader', function(json)
        {
           Keyboard.applySettings(json);

           loadReaderUI(data);
        });
    };

    return {
        loadUI : applyKeyboardSettingsAndLoadUi,
        unloadUI : unloadReaderUI,
        tooltipSelector : tooltipSelector,
        ensureUrlIsRelativeToApp : ensureUrlIsRelativeToApp 
    };

});
