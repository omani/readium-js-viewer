define([
    // "readium_shared_js/globalsSetup",
        "readium_shared_js/globals",
    './ModuleConfig',
    'jquery',
    'URIjs',
    './Spinner',
    'hgn!readium_js_viewer_html_templates/reader-body.html',
    'hgn!readium_js_viewer_html_templates/reader-body-page-btns.html',
    './EpubReaderMediaOverlays',
    './EpubReaderBackgroundAudioTrack',
    // './gestures',
    'readium_js/Readium',
    'readium_shared_js/helpers',
    'readium_shared_js/biblemesh_helpers',
    'readium_shared_js/models/bookmark_data',
    'biblemesh_AppComm'],
    
    function (
    // globalSetup,
    Globals,
    moduleConfig,
    $,
    URI,
    spinner,
    ReaderBody,
    ReaderBodyPageButtons,
    EpubReaderMediaOverlays,
    EpubReaderBackgroundAudioTrack,
    // GesturesHandler,
    Readium,
    Helpers,
    biblemesh_Helpers,
    BookmarkData,
    biblemesh_AppComm){
    
        var biblemesh_ALLOTTED_PAGE_CFIS_FETCH_MILLISECONDS = 250;
        var biblemesh_MIN_NUMBER_OF_PAGES_IN_CFIS_FETCH = 3;
        var biblemesh_COLUMN_MAX_WIDTH = 1000;  // Note that this relates to a hard-coded number in toad-reader-apps for creating page snapshots.

        // initialised in initReadium()
        var readium = undefined;
    
        var biblemesh_isWidget = undefined;
        var biblemesh_getPagesInfoFunc = undefined;
        var biblemesh_highlights = [];
        var biblemesh_highlightTouched = false;
        var biblemesh_toolCfiCounts = {};
        var biblemesh_isWebPlatform = false;
        var biblemesh_doReportToolSpots = false;
        var biblemesh_textSelected = false;
        var biblemesh_isMobileSafari = !!navigator.userAgent.match(/(iPad|iPhone|iPod)/);
        var biblemesh_currentLoadedPageBookmark;
        var biblemesh_doSafariInitialLoadFix = !!navigator.userAgent.match(/safari/i) && !navigator.userAgent.match(/chrome/i);

        // initialised in loadReaderUI(), with passed data.epub
        var ebookURL = undefined;
        var ebookURL_filepath = undefined;
    
        // initialised in loadEbook() >> readium.openPackageDocument()
        var currentPackageDocument = undefined;
        
        // initialised in initReadium()
        // (variable not actually used anywhere here, but top-level to indicate that its lifespan is that of the reader object (not to be garbage-collected))
        var gesturesHandler = undefined;
    
        var isStaticBlock = function(el) {
            if($(el).attr('data-withtoolspacing')) return true;

            var cssObj = $(el).css(['position', 'top', 'left', 'bottom', 'right', 'display', 'borderTopWidth', 'backgroundColor']);
            var effectivelyZero = /^(0[^0-9]*)?$/
            var staticLikePosition = (
                ['static'].includes(cssObj.position)
                || (
                    cssObj.position === 'relative'
                    && effectivelyZero.test(cssObj.top)
                    && effectivelyZero.test(cssObj.left)
                    && effectivelyZero.test(cssObj.right)
                    && effectivelyZero.test(cssObj.bottom)
                )
            );

            return (
                cssObj.display === 'block'
                && staticLikePosition
                && cssObj.borderTopWidth === '0px'
                && /^rgba\(.*?, 0\)$/.test(cssObj.backgroundColor)
            );
        }

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
        var loadEbook = function (openPageRequest) {
            readium.openPackageDocument(
                
                ebookURL,
                
                function(packageDocument, options){
                    if (!packageDocument) {
                        
                        console.error("ERROR OPENING EBOOK: " + ebookURL_filepath);
                        
                        spin(false);

                        biblemesh_AppComm.postMsg('reportError', {
                            errorCode: 'error opening package document',
                            info: {
                                filepath: ebookURL_filepath,
                            },
                        });
                        
                        return;
                    }
                    
                    currentPackageDocument = packageDocument;
                    currentPackageDocument.generateTocListDOM(function(dom){
                        loadToc(dom)
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
        
        var loadToc = function(dom){
    
            readium.reader.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOADED, function ($iframe, spineItem)
            {
    
                Globals.logEvent("CONTENT_DOCUMENT_LOADED", "ON", "EpubReader.js [ " + spineItem.href + " ]");

                //TODO not picked-up by all screen readers, so for now this short description will suffice
                $iframe.attr("title", "EPUB");
                $iframe.attr("aria-label", "EPUB");
    
                // Following line needed to catch keyboard events
                $iframe[0].contentWindow.focus();

                if(biblemesh_isWidget) {
                    if(typeof biblemesh_isWidget != 'boolean') {
    
                        try {

                            // put in start and end marker elements
                            var widgetScopeBookmarkData = new BookmarkData(biblemesh_isWidget.idref, biblemesh_isWidget.elementCfi);
                            var widgetScopeRange = readium.reader.getDomRangeFromRangeCfi(widgetScopeBookmarkData);
        
                            var startMarkerEl = $('<span></span>');
                            var endMarkerEl = $('<span></span>');
        
                            widgetScopeRange.insertNode(startMarkerEl[0]);
                            widgetScopeRange.collapse();
                            widgetScopeRange.insertNode(endMarkerEl[0]);
        
                            if(!startMarkerEl[0].nextSibling) {
                                $(startMarkerEl[0]).insertAfter($(startMarkerEl[0].parentElement))
                            }
        
                            if(!endMarkerEl[0].previousSibling) {
                                $(endMarkerEl[0]).insertBefore($(endMarkerEl[0].parentElement))
                            }
        
                            // hide all before start and after end
                            var widgetHide = function(baseEl, direction) {
                                var sibling = baseEl[0][direction + 'Sibling'];
                                while(sibling) {
                                    if(sibling.nodeType == 3) {  // text node
                                        if(sibling.textContent.trim() !== '') {
                                            $(sibling).wrap('<span data-addedbywidget=""></span>');
                                            biblemesh_isWidgetWithAddedElements = true;
                                            sibling = sibling.parentElement;
                                        }
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
        
                            // remove markers
                            var startMarkerParent = startMarkerEl[0].parentNode;
                            var endMarkerParent = endMarkerEl[0].parentNode;
                            startMarkerEl.remove();
                            endMarkerEl.remove();
                            startMarkerParent.normalize();
                            endMarkerParent.normalize();

                        } catch(err) {
                            console.error("Widget not set up properly. Displaying entire spine as a fallback.", biblemesh_isWidget, err);
                        }

                    }

                    var doc = ( $iframe[0].contentWindow || $iframe[0].contentDocument ).document;

                    $(doc).find('a').off('click').on('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
    
                        var aHref = $(this).attr('href');
                        var combinedPath = aHref.match(/^#/) ? $iframe.attr('data-src').replace(/#.*$/, '') + aHref : Helpers.ResolveContentRef(aHref, $iframe.attr('data-src'));
                        if(!combinedPath.match(/^http/)) {
                            combinedPath = doc.getElementsByTagName('base')[0].href.match(/^https?:\/\/[^\/]*/)[0] + combinedPath;
                        }
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
                        
                        bookmark.elementCfi = bookmark.contentCFI;
                        if(elementId) {
                            bookmark.elementCfi = 'ID:' + elementId;
                        }
                        bookmark.contentCFI = undefined;
                        bookmark = JSON.stringify(bookmark);
                        
                        ebookURL = ensureUrlIsRelativeToApp(ebookURL);
    
                        var url = biblemesh_Helpers.buildUrlQueryParameters(undefined, {
                            epub: ebookURL,
                            goto: bookmark,
                        }, true);

                        window.open(url);
                    });
    
                    $(document.body).removeClass("widgetloading");
    
                    $('.content-doc-frame, #scaler').css('height', 0);
                    var docHt = $(doc).find('html').height();
                    biblemesh_AppComm.postMsg('setHeight', docHt + 5);
    
                    $('.content-doc-frame, #scaler').css('height', docHt);
       
                    spin(false);
                    $("#epub-reader-frame").css("opacity", "");
                }

                setTimeout(function() {
                    var urlParams = biblemesh_Helpers.getURLQueryParams();
                    if(!biblemesh_isWidget && urlParams.elementId) {
                        readium.reader.openSpineItemElementId(spineItem.idref, urlParams.elementId, undefined, biblemesh_insertTools);

                        var url = biblemesh_Helpers.buildUrlQueryParameters(undefined, {
                            elementId: " "
                        });
                        history.replaceState({epub: "/epub_content/book_" + biblemesh_bookId}, null, url);
                    }
                }, 1);
            });
    
            var execPageChangeTimeout;
            readium.reader.on(ReadiumSDK.Events.PAGINATION_CHANGED, function (pageChangeData)
            {
                Globals.logEvent("PAGINATION_CHANGED", "ON", "EpubReader.js");

                var initiatedByInteralLinkClick = false;
                try {
                    initiatedByInteralLinkClick = !!pageChangeData.initiator.isInternalLink;
                } catch(e) {}

                if(biblemesh_doSafariInitialLoadFix) {
                    // Safari appears to have a bug in the layout of columns where a line can get
                    // cut in half between two columns on the initial load. This hack fixes the issue.

                    setTimeout(function() {

                        biblemesh_doSafariInitialLoadFix = false;

                        var iframe = $("#epub-reader-frame iframe")[0];
                        if(!iframe) return;
                        var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
                        var docEl = doc.documentElement;

                        var adjustedHeight = docEl.style.height.replace(/^([0-9]+)px$/, function(match, num) {
                            return (parseInt(num) - 1) + ".999px"
                        });

                        docEl.style.height = adjustedHeight;
                        docEl.style.minHeight = adjustedHeight;
                        docEl.style.maxHeight = adjustedHeight;

                    }, 1);
                }

                clearTimeout(execPageChangeTimeout);

                var bookmark = JSON.parse(readium.reader.bookmarkCurrentPage());

                var execPageChange = function() {

                    // var biblemesh_isOnload = biblemesh_onload;  //first call to this function is always during onload
                    // biblemesh_onload = false;
        
                    // if(!biblemesh_isOnload) biblemesh_savePlace();
                    updateUI(pageChangeData);
    
                    if(pageChangeData.spineItem && !biblemesh_isWidget) {  // biblemesh_
                        spin(false);
                        $("#epub-reader-frame").css("opacity", "");
                    }
        
                    biblemesh_currentLoadedPageBookmark = bookmark;
    
                    biblemesh_getPagesInfoFunc && biblemesh_getPagesInfoFunc()
    
                    biblemesh_AppComm.postMsg('pageChanged', {
                        newCfi: bookmark.contentCFI,
                        newSpineIdRef: bookmark.idref,
                        initiatedByInteralLinkClick: initiatedByInteralLinkClick,
                    });

                }

                if(bookmark.contentCFI) {
                    execPageChange();
                } else {
                    // May not really be loaded yet.
                    execPageChangeTimeout = setTimeout(execPageChange, 100);
                    return;
                }

            });
    
        } // end of loadToc
    
        var biblemesh_getHighlightDataObj = function(cfiObj) {
            var returnObj = false;
            var cfiObjId = biblemesh_getHighlightId(cfiObj);
    
            biblemesh_highlights.forEach(function(highlight, idx) {
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
    
        var biblemesh_markHighlightsWithNotes = function() {
            var iframe = $("#epub-reader-frame iframe")[0];
            if(!iframe) return;
            var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
            var docEl = $( doc.documentElement );
    
            docEl.children('.rd-highlight').removeClass('highlight-with-note');
    
            biblemesh_highlights.forEach(function(highlight) {
                if(highlight.hasNote) {
                    var highlightId = biblemesh_getHighlightId(highlight);
                    var highlightEl = docEl.children('[data-id="' + highlightId + '"]');
                    if(highlightEl) {
                        highlightEl.addClass('highlight-with-note');
                    }
                }
            });
        }

        var biblemesh_insertTools = function() {
            var iframe = $("#epub-reader-frame iframe")[0];
            var doc = ( iframe.contentWindow || iframe.contentDocument ).document;

            var bookmark = JSON.parse(readium.reader.bookmarkCurrentPage());
            var idRef = bookmark.idref;

            // insert spaces for biblemesh_toolCfiCounts
            var $elsToRemoveSpace = $(doc).find('[data-withtoolspacing]');
            for(var cfi in biblemesh_toolCfiCounts) {
                var $el = readium.reader.getElementByCfi(idRef, cfi);

                if($el) {
                    $el
                        .attr('style', ($el.attr('style') || "").replace(/; --tool-spacing: [0-9]+px/g, '') + '; --tool-spacing: ' + (34 * biblemesh_toolCfiCounts[cfi]) + 'px')
                        .attr('data-withtoolspacing', true);

                    $elsToRemoveSpace = $elsToRemoveSpace.filter(function() { return this !== $el[0] });
                }
            }
            $elsToRemoveSpace.removeAttr('data-withtoolspacing');

            // calc block element cfis to make pagination change faster
            var staticBlockEls = $(doc).find('*').filter(function() { return isStaticBlock(this); }).toArray();
            var calcBlockElCfi = function() {
                setTimeout(function() {
                    var el = staticBlockEls.shift();
                    if(!el) return;
                    el.calculatedCfi = el.calculatedCfi || readium.reader.getCfiForElement(el).contentCFI
                    calcBlockElCfi();
                }, 0);
            }
            calcBlockElCfi();

            readium.reader.biblemesh_updatePagination();

            // report all tool spots
            biblemesh_reportToolSpots();
        }
    
        var biblemesh_reportToolSpots = function(getEntireSpine, pageWidth) {
            if(!biblemesh_doReportToolSpots) return null;

            var iframe = $("#epub-reader-frame iframe")[0];
            var doc = ( iframe.contentWindow || iframe.contentDocument ).document;

            var iframeRect = iframe.getBoundingClientRect();
            var offsetMargin = 30;
            var offsetMarginWithBuffer = offsetMargin + 20;

            var toolSpots = [];
            var lastRect = { y: 0, height: 0 };
            var alreadyPassedThePage = false;
            $(doc).find('*').each(function() {
                if(alreadyPassedThePage && !getEntireSpine) return;
                if(isStaticBlock(this)) {
                    try {
                        var rects = this.getClientRects();
                        var rect = rects[0];
                        lastRect = rects[rects.length - 1] || lastRect;
                        if(rect.x >= 0 && rect.x <= iframeRect.width - offsetMarginWithBuffer && this.tagName !== 'BODY') {
                            // left edge of the block is showing
                            this.calculatedCfi = this.calculatedCfi || readium.reader.getCfiForElement(this).contentCFI
                            for(var ordering=0; ordering <= (biblemesh_toolCfiCounts[this.calculatedCfi] || 0); ordering++) {
                                var tool = {
                                    y: parseInt(rect.y, 10) + (ordering * 34),
                                    cfi: this.calculatedCfi,
                                    ordering: ordering,
                                };
                                if(getEntireSpine) {
                                    var pageIndex = Math.floor((rect.x + offsetMarginWithBuffer) / pageWidth);
                                    toolSpots[pageIndex] = toolSpots[pageIndex] || [];
                                    toolSpots[pageIndex].push(tool);
                                } else {
                                    toolSpots.push(tool);
                                }
                            }
                        } else if(this.tagName !== 'BODY' && rect.y >= 0) {
                            alreadyPassedThePage = rect.x > iframeRect.width  // assumes ltr page
                        }
                    } catch(e) {}
                }
            });
            var toolAtTheEnd = {
                y: lastRect.y + lastRect.height,
                cfi: 'AT THE END',
            };
            if(getEntireSpine) {
                var pageIndex = Math.floor((lastRect.x + offsetMarginWithBuffer) / pageWidth);
                toolSpots[pageIndex] = toolSpots[pageIndex] || [];
                toolSpots[pageIndex].push(toolAtTheEnd);
            } else if(lastRect.x >= 0 && lastRect.x <= iframeRect.width - offsetMarginWithBuffer) {
                toolSpots.push(toolAtTheEnd);
            }

            var bookmark = JSON.parse(readium.reader.bookmarkCurrentPage());

            var toolSpotInfo = {
                spineIdRef: bookmark.idref,
                toolSpots: toolSpots,
                offsetX: iframeRect.x + offsetMargin,
                offsetY: iframeRect.y,
            }

            if(getEntireSpine) {
                return toolSpotInfo
            }

            biblemesh_AppComm.postMsg('reportToolSpots', toolSpotInfo);
        }

        var biblemesh_drawHighlights = function() {
            if (readium && readium.reader.plugins.highlights) {
    
                var bookmark = JSON.parse(readium.reader.bookmarkCurrentPage());
                var idRef = bookmark.idref;
                var highlightsToDraw = [];
    
                // next line needed especially for switching between books
                readium.reader.plugins.highlights.removeHighlightsByType("user1-highlight");
                readium.reader.plugins.highlights.removeHighlightsByType("user2-highlight");
                readium.reader.plugins.highlights.removeHighlightsByType("user3-highlight");
                readium.reader.plugins.highlights.removeHighlightsByType("instructor-highlight");
                readium.reader.plugins.highlights.removeHighlightsByType("classroom-highlight");
                readium.reader.plugins.highlights.removeHighlightsByType("user1-instructor-highlight");
                readium.reader.plugins.highlights.removeHighlightsByType("user2-instructor-highlight");
                readium.reader.plugins.highlights.removeHighlightsByType("user3-instructor-highlight");
    
                biblemesh_highlights.forEach(function(highlight) {
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
                            (highlight.type || "user") + "-highlight"
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
                    biblemesh_reportToolSpots();
                    // quicker than running biblemesh_drawHighlights
                    // needed because highlights off screen when a new spine is loaded are not drawn
                    readium.reader.plugins.highlights.redrawAnnotations();
                    biblemesh_markHighlightsWithNotes();
                } catch(e) {}
            } else {
                biblemesh_drawHighlights();
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
    
        // var biblemesh_getBookmarkURL = function(){
        //     if (!ebookURL) return;
            
        //     var bookmark = readium.reader.bookmarkCurrentPage();
        //     bookmark = JSON.parse(bookmark);
            
        //     var cfi = new BookmarkData(bookmark.idref, bookmark.contentCFI);
            
        //     bookmark.elementCfi = bookmark.contentCFI;
        //     bookmark.contentCFI = undefined;
        //     bookmark = JSON.stringify(bookmark);
            
        //     ebookURL = ensureUrlIsRelativeToApp(ebookURL);
    
        //     var url = biblemesh_Helpers.buildUrlQueryParameters(undefined, {
        //         epub: ebookURL,
        //         epubs: " ",
        //         embedded: " ",
        //         goto: bookmark
        //     });
    
        //     return url;
        // }
    
        var biblemesh_showHighlightOptions = function(forceShowNote) {

            var iframe = $("#epub-reader-frame iframe")[0];
            var win = iframe.contentWindow || iframe;
            var sel = win.getSelection();
            var selStr = sel.toString().replace(/\n/g,' ').trim();
            var cfiObj = readium.reader.plugins.highlights.getCurrentSelectionCfi();
    
            if(!sel.isCollapsed && selStr!='' && cfiObj) {
    
                // var highlightId = biblemesh_getHighlightId(cfiObj);
                    
                var currentHighlight = biblemesh_getHighlightDataObj(cfiObj);
                
                var hasCurrentHighlight = function() {
                    return currentHighlight && !currentHighlight.highlight._delete;
                }
    
                // get selection bounding box
                var rg = sel.getRangeAt(0);
                var cRect = rg.getBoundingClientRect();
                var selectionVeryTop = cRect.top;
                var selectionVeryBottom = cRect.top+cRect.height;
                var winHt = $(win).height()

                var tooltipHt = 30  // TODO: needs to be adjusted; likely differs between android and ios

                var tooltipAboveText =
                    (selectionVeryTop - tooltipHt) > 0
                    || (selectionVeryBottom + tooltipHt) > winHt
                var copyTooltipInLowerHalf = tooltipAboveText
                    ? (selectionVeryTop - tooltipHt) > (winHt / 2)
                    : (selectionVeryBottom + tooltipHt) > (winHt / 2)

                biblemesh_AppComm.postMsg('textSelected', {
                    text: selStr,
                    spineIdRef: cfiObj.idref,
                    cfi: cfiObj.cfi,
                    copyTooltipInLowerHalf: copyTooltipInLowerHalf,
                });
                biblemesh_textSelected = true
                
            } else {
                biblemesh_AppComm.postMsg('textUnselected');
                biblemesh_textSelected = false
            }
        }
    
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
                biblemesh_AppComm.postMsg('loading', {});
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

        var biblemesh_translateSettings = function(settings) {
            settings.syntheticSpread = settings.columns;
            settings.fontSize = settings.textSize;
        }
    
        var initReadium = function(){

            biblemesh_isWebPlatform = !!window.isWebPlatform;
            biblemesh_doReportToolSpots = !!window.doReportToolSpots;
            biblemesh_toolCfiCounts = window.initialToolCfiCountsObjFromWebView || biblemesh_toolCfiCounts;
            delete window.initialToolCfiCountsObjFromWebView;

            biblemesh_highlights = window.initialHighlightsObjFromWebView || biblemesh_highlights;
            delete window.initialHighlightsObjFromWebView;

            var spotInfo = biblemesh_Helpers.getCurrentSpotInfo(); // biblemesh_
    
            try { ga('send', 'pageview', window.location.pathname); } catch(e) {} // biblemesh_
    
            var readerOptions =  {
                el: "#epub-reader-frame",
                // annotationCSSUrl: moduleConfig.annotationCSSUrl + '?bust=VERSION_BUST*_STRING',  // biblemesh_
                annotationCSSContent: moduleConfig.annotationCSSContent,
                mathJaxUrl : moduleConfig.mathJaxUrl,
            };
    
            var readiumOptions = {
                jsLibRoot: moduleConfig.jsLibRoot,
                openBookOptions: {}
            };
    
            if (moduleConfig.useSimpleLoader){
                readiumOptions.useSimpleLoader = true;
            }
    
            var openPageRequest = {};
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

            openPageRequest.prePageTurnFunc = biblemesh_insertTools;

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
                        // annotationCSSUrl: readerOptions.annotationCSSUrl
                        annotationCSSContent: readerOptions.annotationCSSContent
                    });
    
                    readium.reader.plugins.highlights.on("annotationTouched", function(type, idref, cfi, id) {
                        biblemesh_highlightTouched = true;
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
        
                    });
                }
    
            });

            var showPageListView = function() {
                readium.reader.pauseMediaOverlay();
                pauseAudioAndVideoTags();
                biblemesh_AppComm.postMsg('showPageListView');
            }

            var docEl, touchPageX, touchPageY, touchIsClick, touchIsSwipe,
                docElLeftBeforeStart, touchPageXAtStart, touchPageXOnLastMove,
                touchPageXOnSecondToLastMove, timeAtStart, timeOnLastMove, timeOnSecondToLastMove,
                isTransitioning, textWasSelectedAtStart;

            var turnPage = function(direction) {
                if(isTransitioning) return;

                biblemesh_AppComm.postMsg('reportPageTurnStart');

                var iframe = $("#epub-reader-frame iframe")[0];
                var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
                docEl = $( doc.documentElement );
                docElLeftBeforeStart = parseInt(docEl.css('left'), 10);

                flipPage(direction);

                iframe.contentWindow.focus();
            }

            readium.reader.addIFrameEventListener('keydown', function(e) {
                if(e.keyCode === 27 || e.which === 27) {
                    e.preventDefault();
                    e.stopPropagation();

                    var iframe = $("#epub-reader-frame iframe")[0];
                    if([ iframe, iframe.contentWindow ].includes(document.activeElement)) {
                        showPageListView();
                    } else {
                        iframe.contentWindow.focus();
                    }

                    return;
                }

                //biblemesh_ : Next if statement to prevent scroll on right/left arrows in FF
                if(
                    !$(e.target).is('textarea, input')
                    && $(e.target).closest('[contenteditable="true"]').length == 0
                    && ([37,39].indexOf(e.keyCode) != -1 || [37,39].indexOf(e.which) != -1)
                ) {
                    e.preventDefault();
                    e.stopPropagation();

                    if(e.keyCode === 37 || e.which === 37) {
                        turnPage('Left');
                    }
    
                    if(e.keyCode === 39 || e.which === 39) {
                        turnPage('Right');
                    }

                    return;
                }
            });

            var wrapInTransition = function(action, transitionTime, postAction, transitionType) {
                var gracePeriodToFinish = Math.min(transitionTime / 2, 100);
                isTransitioning = true;
                docEl.css("transition", "left " + (transitionTime / 1000) + "s " + (transitionType || "ease-in-out"));
                requestAnimationFrame(action);
                setTimeout(function() {
                    docEl.css("transition", "");
                    postAction && postAction();
                    isTransitioning = false;
                }, transitionTime + gracePeriodToFinish);
            }
        
            var cancelSwipe = function(transitionTime, e) {

                touchIsClick = touchIsSwipe = false;

                if(e) {
                    e.target.touchIsSwipe = false;
                }

                // bring back to original position
                wrapInTransition(
                    function() {
                        docEl.css('left', docElLeftBeforeStart + 'px');
                    },
                    transitionTime || 200,
                    function() {
                        biblemesh_AppComm.postMsg('cancelPageTurn');
                    }
                );
            }

            var pageExistsToThe = function(direction) {
                // logic taken from reader_view.js

                var spine = readium.reader.spine();
                var paginationInfo = readium.reader.getPaginationInfo();
                var isNext = direction === 'Left';
                if(spine.isLeftToRight()) isNext = !isNext;

                if(isNext) {

                    if (paginationInfo.openPages.length == 0) {
                        return false;
                    }
            
                    var lastOpenPage = paginationInfo.openPages[paginationInfo.openPages.length - 1];
            
                    if (lastOpenPage.spineItemPageIndex < lastOpenPage.spineItemPageCount - 1) {
                        return true;
                    }
            
                    var currentSpineItem = spine.getItemById(lastOpenPage.idref);
                    var nextSpineItem = spine.nextItem(currentSpineItem);

                    return nextSpineItem ? nextSpineItem.idref : false;

                } else {
                    
                    if (paginationInfo.openPages.length == 0) {
                        return false;
                    }
            
                    var firstOpenPage = paginationInfo.openPages[0];
            
                    if (firstOpenPage.spineItemPageIndex > 0) {
                        return true;
                    }
            
                    var currentSpineItem = spine.getItemById(firstOpenPage.idref);
                    var prevSpineItem = spine.prevItem(currentSpineItem);
            
                    return prevSpineItem ? prevSpineItem.idref : false;
                }            
            }

            readium.reader.addIFrameEventListener('touchstart', function(e) {
                if(biblemesh_isWebPlatform) return

                var iframe = $("#epub-reader-frame iframe")[0];
                var win = iframe.contentWindow || iframe;
                var sel = win.getSelection();

                if(isTransitioning) return;
                if(e.touches.length !== 1 || !sel.isCollapsed) {
                    cancelSwipe(null, e);
                    return;
                }

                biblemesh_AppComm.postMsg('requestPauseProcessing');

                var iframe = $("#epub-reader-frame iframe")[0];
                var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
                docEl = $( doc.documentElement );

                textWasSelectedAtStart = biblemesh_textSelected;
                touchPageXAtStart = touchPageXOnLastMove = touchPageX = e.touches[0].pageX;
                touchPageY = e.touches[0].pageY;
                touchIsClick = true;
                touchIsSwipe = e.target.touchIsSwipe = false;
                docElLeftBeforeStart = parseInt(docEl.css('left'), 10);
                timeAtStart = timeOnLastMove = Date.now();
            }, 'document');

            if(!biblemesh_isWebPlatform) {
                readium.reader.addIFrameEventListener('selectionchange', function(e) {
                    cancelSwipe(null, e);
                }, 'document');
            }

            readium.reader.addIFrameEventListener('touchmove', function(e) {
                if(biblemesh_isWebPlatform) return
                if(isTransitioning) return;
                if(e.touches.length !== 1) return;

                // If the epub has something special here with touch, then do not swipe
                if(e.target && $(e.target).closest('[ontouchstart]')[0]) {
                    return;
                }

                if(touchIsClick) {
                    touchIsClick = Math.sqrt((touchPageX - e.touches[0].pageX) * 2 + (touchPageY - e.touches[0].pageY) * 2) < 4;
                    touchIsSwipe = e.target.touchIsSwipe = !touchIsClick;

                    if(touchIsSwipe) {
                        biblemesh_AppComm.postMsg('startPageTurn');
                    }
                }
                
                if(touchIsSwipe) {
                    touchPageXOnSecondToLastMove = touchPageXOnLastMove;
                    timeOnSecondToLastMove = timeOnLastMove;
                    touchPageXOnLastMove = e.touches[0].pageX;
                    timeOnLastMove = Date.now();
                    docEl.css('left', (docElLeftBeforeStart + (touchPageXOnLastMove - touchPageXAtStart)) + 'px');
                }
            }, 'document');

            var flipPage = function(pageToDirection, e) {
                biblemesh_AppComm.postMsg('startPageTurn');

                var existsPageInDesiredDirection = pageExistsToThe(pageToDirection);
                if(existsPageInDesiredDirection) {
                    transitionToPage(existsPageInDesiredDirection, pageToDirection);
                } else {
                    biblemesh_AppComm.postMsg('flipToNewSpine');
                    var shakeAdjAmount = (pageToDirection === 'Left' ? 80 : -80);

                    wrapInTransition(
                        function() {
                            docEl.css('left', (docElLeftBeforeStart + shakeAdjAmount) + 'px');
                        },
                        50,
                        function() {
                            wrapInTransition(
                                function() {
                                    docEl.css('left', (docElLeftBeforeStart - parseInt(shakeAdjAmount/2, 10)) + 'px');
                                },
                                75,
                                function() {
                                    cancelSwipe(50, e);
                                }
                            );
                        }
                    );
                }
            }

            var transitionToPage = function(existsPageInDesiredDirection, direction, transitionTime) {
                var pageWidth = $("#epub-reader-frame iframe").width();
                wrapInTransition(
                    function() {
                        docEl.css('left', (docElLeftBeforeStart + pageWidth * (direction === 'Left' ? 1 : -1)) + 'px')
                    },
                    transitionTime || 250,
                    function() {
                        if(typeof existsPageInDesiredDirection === 'string') {
                            biblemesh_AppComm.postMsg('flipToNewSpine', { newSpineIdRef: existsPageInDesiredDirection });
                        } else {
                            readium.reader['openPage' + direction]()
                        }
                    },
                    "linear"
                );
            }

            $('#epub-reader-container')[0].addEventListener('touchend', function(e) {
                if(biblemesh_isWebPlatform) return
                if((e.touches || []).length !== 0) return;

                var winWd = window.innerWidth;
                var touchPageX = e.changedTouches[0].pageX;
                var sideWd = (winWd - biblemesh_COLUMN_MAX_WIDTH) / 2;
 
                if(touchPageX < sideWd) {
                    e.preventDefault();
                    e.stopPropagation();
                    turnPage('Left');
                } else if(touchPageX > winWd - sideWd) {
                    e.preventDefault();
                    e.stopPropagation();
                    turnPage('Right');
                }
            });

            readium.reader.addIFrameEventListener('touchend', function(e) {
                if(biblemesh_isWebPlatform) return
                if(isTransitioning) return;
                if(e.touches.length !== 0) return;

                if(touchIsClick) {

                    if(textWasSelectedAtStart) {
                        biblemesh_AppComm.postMsg('textUnselected');
                        biblemesh_textSelected = false
                    }


                    var iframe = $("#epub-reader-frame iframe")[0];
                    var doc = ( iframe.contentWindow || iframe.contentDocument ).document;
                    var bodyEl = doc.body;
        
                    // create and dispatch media_overlay_touch_tap event
                    var mediaOverlayClicked = false;
                    var mediaOverlayTouchTapEvent = new CustomEvent("media_overlay_touch_tap", {
                        detail: {
                            pageX: e.pageX,
                            pageY: e.pageY,
                            target: e.target,
                            indicateMediaChange: function() {
                                mediaOverlayClicked = true;
                            },
                        }
                    });
                    bodyEl.dispatchEvent(mediaOverlayTouchTapEvent);

                    if(
                        !textWasSelectedAtStart
                        && !biblemesh_highlightTouched
                        && Date.now() - timeAtStart < 500   // long touches should not be considered page turn taps
                        && (!e.target || !$(e.target).closest('a[href], [onclick], [onmousedown], [ontouchstart]')[0])  // it is a link/clickable, or is inside a link/clickable
                        && !mediaOverlayClicked
                    ) {

                        e.preventDefault();
                        e.stopPropagation();

                        var winWd = window.innerWidth;
                        var sideWd = Math.max((winWd - biblemesh_COLUMN_MAX_WIDTH) / 2, 0);
                        var pageToDirection = '';

                        if((touchPageX + sideWd) / winWd < .3) {
                            pageToDirection = 'Left';
                        }

                        if((touchPageX + sideWd) / winWd > .7) {
                            pageToDirection = 'Right';
                        }

                        if(pageToDirection) {

                            if(!spinner.willSpin && !spinner.isSpinning) {
                                flipPage(pageToDirection, e);
                            }

                        } else {
                            showPageListView();
                        }
                    
                    }

                } else if(touchIsSwipe && !spinner.willSpin && !spinner.isSpinning) {

                    var direction = touchPageXAtStart < touchPageXOnLastMove ? 'Left' : 'Right';
                    var lastDirection = touchPageXOnSecondToLastMove < touchPageXOnLastMove ? 'Left' : 'Right';

                    var lastSpeed = Math.abs(touchPageXOnLastMove - touchPageXOnSecondToLastMove) / (timeOnLastMove - timeOnSecondToLastMove);  // px/ms
                    var pageWidth = $("#epub-reader-frame iframe").width();
                    var dragLength = Math.abs(parseInt(docEl.css('left'), 10) - docElLeftBeforeStart);
                    var speedToPxFactor = 900;
                    var existsPageInDesiredDirection = pageExistsToThe(direction);
            
                    if(
                        (direction === lastDirection || lastSpeed < .2)
                        && lastSpeed * speedToPxFactor + dragLength > pageWidth / 2
                        && existsPageInDesiredDirection
                    ) {
                        var transitionTime = (pageWidth - dragLength) / Math.max(lastSpeed, .8);
                        transitionToPage(existsPageInDesiredDirection, direction, transitionTime);

                        // unselect text
                        if(biblemesh_isMobileSafari) {
                            biblemesh_AppComm.postMsg('textUnselected');
                            biblemesh_textSelected = textWasSelectedAtStart;
                        } else {
                            var iframe = $("#epub-reader-frame iframe")[0];
                            var win = iframe.contentWindow || iframe;
                            var sel = win.getSelection();
                            sel.removeAllRanges();
                        }

                    } else {
                        cancelSwipe(null, e);
                    }


                }

                biblemesh_highlightTouched = touchIsClick = touchIsSwipe = e.target.touchIsSwipe = false;

            }, 'document');

            var $pageBtnsContainer = $('#readium-page-btns');
            var clearLeftRightButtons = function() {
                $("#left-page-btn").unbind("click");
                $("#right-page-btn").unbind("click");
                $pageBtnsContainer.empty();
            }
            clearLeftRightButtons();

            if(biblemesh_isWebPlatform && $("#left-page-btn").length === 0 && !biblemesh_isWidget) {
                clearLeftRightButtons();
                // var rtl = currentPackageDocument.getPageProgressionDirection() === "rtl"; //_package.spine.isLeftToRight()
                $pageBtnsContainer.append(ReaderBodyPageButtons());
                $("#left-page-btn").on("click", function() {
                    turnPage('Left');
                });
                $("#right-page-btn").on("click", function() {
                    turnPage('Right');
                });
                $("#view-toc").on("click", function() {
                    showPageListView();
                });
            }

            readium.reader.addIFrameEventListener('selectionchange', biblemesh_showHighlightOptions, 'document');
    
            var defaultSettings = {
                fontSize: 100,
                syntheticSpread: "auto",
                scroll: "auto",
                theme: "author-theme",
                columnGap: 60,
                columnMaxWidth: biblemesh_COLUMN_MAX_WIDTH,
                columnMinWidth: 300
            }
    
            if(biblemesh_isWidget) {
                var urlParams = biblemesh_Helpers.getURLQueryParams();
                // readerSettings = readerSettings || SettingsDialog.defaultSettings;
                defaultSettings.scroll = 'scroll-doc';
                defaultSettings.theme = urlParams.theme || 'author-theme'; 
                defaultSettings.columnMaxWidth = 99999;
                defaultSettings.columnMinWidth = 100;
                defaultSettings.syntheticSpread = 'single';
                defaultSettings.fontSize = parseInt(urlParams.textsize, 10) || 100;
                // SettingsDialog.updateReader(readium.reader, readerSettings);

                clearLeftRightButtons();

                $('#epub-reader-container').css("top", 0).css("bottom", 0);
            }

            biblemesh_translateSettings(spotInfo.settings);

            var readerSettings = Object.assign(defaultSettings, spotInfo.settings);   // biblemesh_

            readium.reader.updateSettings(readerSettings);
            
            readium.reader.on(ReadiumSDK.Events.CONTENT_DOCUMENT_LOAD_START, function($iframe, spineItem) {
                Globals.logEvent("CONTENT_DOCUMENT_LOAD_START", "ON", "EpubReader.js [ " + spineItem.href + " ]");
    
                $("#epub-reader-frame").css("opacity", ".01");
                spin(true);
            });
    
            EpubReaderMediaOverlays.init(readium);
    
            EpubReaderBackgroundAudioTrack.init(readium);
    
            //epubReadingSystem
    
            loadEbook(openPageRequest);

            var setSelectionText = function(payload) {
                var iframe = $("#epub-reader-frame iframe")[0];
                var win = iframe.contentWindow || iframe;
                var sel = win.getSelection();
                var textSelectedBefore = biblemesh_textSelected

                if(!payload || !payload.spineIdRef || !payload.cfi) {
                    sel.removeAllRanges();
                    biblemesh_textSelected = false;
                    return;
                }

                // select the text of a highlight
                var highlightBookmarkData = new BookmarkData(payload.spineIdRef, payload.cfi);
                var highlightRange = readium.reader.getDomRangeFromRangeCfi(highlightBookmarkData);

                sel.removeAllRanges();
                sel.addRange(highlightRange);

                if(biblemesh_isMobileSafari) {
                    biblemesh_textSelected = textSelectedBefore
                }
            }

            biblemesh_AppComm.subscribe('goToCfi', function(payload) {
                try {
                    if(payload.toolCfiCounts) {
                        biblemesh_toolCfiCounts = payload.toolCfiCounts;
                    }
                    readium.reader.openSpineItemElementCfi(
                        payload.spineIdRef,
                        (payload.lastPage || payload.textNodeInfo)
                            ? payload
                            : payload.cfi,
                        undefined,
                        payload.toolCfiCounts ? biblemesh_insertTools : undefined,
                        function() {
                            if(payload.autoSelectHighlight && payload.cfi) {
                                setSelectionText(payload);
                            }
                        }
                    );
                } catch(e) {
                    biblemesh_AppComm.postMsg('reportError', { errorCode: 'invalid cfi' });
                }
            });

            biblemesh_AppComm.subscribe('goToHref', function(payload) {
                try {
                    if(payload.toolCfiCounts) {
                        biblemesh_toolCfiCounts = payload.toolCfiCounts;
                    }
                    var spineItem = readium.reader.spine().getItemByHref(payload.href);
                    var hrefUri = new URI(payload.href);
                    var hashFrag = hrefUri.fragment();
                    biblemesh_toolCfiCounts = payload.toolCfiCounts;
                    readium.reader.openSpineItemElementId(
                        spineItem.idref,
                        hashFrag,
                        undefined,
                        payload.toolCfiCounts ? biblemesh_insertTools : undefined
                    );
                } catch(e) {
                    biblemesh_AppComm.postMsg('reportError', { errorCode: 'invalid href' });
                }
            });

            biblemesh_AppComm.subscribe('goToPage', function(payload) {

                var bookmark = JSON.parse(readium.reader.bookmarkCurrentPage());
                
                if(bookmark.idref == payload.spineIdRef) {

                    // check if they are already on this page, and if so just return and do nothing
                    var paginationInfo = readium.reader.getPaginationInfo();
                    var firstOpenPage = paginationInfo.openPages[0];
                    if((firstOpenPage || {}).spineItemPageIndex == payload.pageIndexInSpine) {
                        return;
                    }

                    readium.reader.openPageIndex(payload.pageIndexInSpine);
                } else {
                    if(payload.toolCfiCounts) {
                        biblemesh_toolCfiCounts = payload.toolCfiCounts;
                    }
                    readium.reader.openSpineItemPage(
                        payload.spineIdRef,
                        payload.lastPage
                            ? payload
                            : payload.pageIndexInSpine,
                        undefined,
                        payload.toolCfiCounts ? biblemesh_insertTools : undefined
                    );
                }
            });

            var biblemesh_loadSpineTime;
            var biblemesh_getPagesInfo = function(payload) { return function() {
                var $iframe = $("#epub-reader-frame iframe");

                if(!biblemesh_currentLoadedPageBookmark) return  // this will be null if the initial load is not finished

                if(biblemesh_currentLoadedPageBookmark.idref == payload.spineIdRef) {
                    biblemesh_getPagesInfoFunc = undefined;

                    var allottedMS = payload.allottedMS || biblemesh_ALLOTTED_PAGE_CFIS_FETCH_MILLISECONDS
                    var minimumPagesToFetch = payload.minimumPagesToFetch || biblemesh_MIN_NUMBER_OF_PAGES_IN_CFIS_FETCH

                    var startTime = Date.now();
                    var startIndex = payload.startIndex || 0;
                    var numPages = readium.reader.biblemesh_getColumnCount();

                    var width = payload.width * numPages;
                    window.biblemesh_preventAllResizing = true;
                    $iframe.css("width", width);
                    $(document.body).css("width", width);

                    var pageCfis = [];
                    if(
                        !biblemesh_loadSpineTime
                        || Date.now() - biblemesh_loadSpineTime < allottedMS
                    ) {
                        for(var pageIndex=startIndex; pageIndex<numPages; pageIndex++) {
                            var cfi = readium.reader.biblemesh_getFirstVisibleCfiOnSpineItemPageIndex(pageIndex);
                            pageCfis.push(cfi);
                    
                            if(
                                pageIndex+1 - startIndex >= minimumPagesToFetch
                                && Date.now() - startTime > allottedMS
                            ) {
                                break;
                            }
                        }
                    }

                    biblemesh_loadSpineTime = null

                    biblemesh_AppComm.postMsg('pagesInfo', {
                        spineIdRef: payload.spineIdRef,
                        pageCfis: pageCfis,
                        startIndex: startIndex,
                        completed: pageIndex === numPages,
                        // The next line might need to be throttled.
                        toolSpotSets: pageIndex === numPages ? biblemesh_reportToolSpots(true, payload.width) : null,
                    });

                } else {
                    biblemesh_toolCfiCounts = payload.toolCfiCounts;
                    readium.reader.openSpineItemElementId(payload.spineIdRef, undefined, undefined, biblemesh_insertTools);
                }
            }}

            biblemesh_AppComm.subscribe('continueToGetPagesInfo', function(payload) {
                biblemesh_getPagesInfo(payload)();
            })

            biblemesh_AppComm.subscribe('loadSpineAndGetPagesInfo', function(payload) {
                biblemesh_loadSpineTime = Date.now();
                biblemesh_getPagesInfoFunc = biblemesh_getPagesInfo(payload);
            });

            biblemesh_AppComm.subscribe('insertTools', function(payload) {
                if(JSON.stringify(biblemesh_toolCfiCounts) !== JSON.stringify(payload.toolCfiCounts)) {
                    biblemesh_toolCfiCounts = payload.toolCfiCounts;
                    biblemesh_insertTools();
                    readium.reader.plugins.highlights.redrawAnnotations();
                }
            });

            biblemesh_AppComm.subscribe('renderHighlights', function(payload) {
                biblemesh_highlights = payload.highlights;
                biblemesh_drawHighlights();
            });

            biblemesh_AppComm.subscribe('setDisplaySettings', function(payload) {
                biblemesh_translateSettings(payload);
                readium.reader.updateSettings(payload);
            });

            biblemesh_AppComm.subscribe('setSelectionText', setSelectionText);

            biblemesh_AppComm.postMsg('loaded');

        }
    
        var pauseAudioAndVideoTags = function(){
            var pauseAudioAndVideoInIframe = function($iframe) {
                $('audio, video', $iframe.contents()).each(function() {
                    this.pause();
                });
                $('iframe', $iframe.contents()).each(function() {
                    pauseAudioAndVideoInIframe($( this ));
                });
            };

            pauseAudioAndVideoInIframe($("#epub-reader-frame iframe"));
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
        