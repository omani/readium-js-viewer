!(function(d){

    var newEl = function(type, attrs) {
        var el = d.createElement(type);
        for(var attr in attrs) {
            el[attr] = attrs[attr];
        } 
        return el;
    }

    if(!window.erasereader) {
        var node = d.createElement('style');
        node.innerHTML = ''
                    + '.erasereader-widget-iframe {'
                        + "display: block;"
                        + "border: none;"
                        + "width: 100%;"
                    + '}'
                    + '.erasereader-widget-div {'
                        + "box-sizing: border-box;"
                        + "box-shadow: 2px 2px 15px #CCC;"
                        + "border: 0 solid #1c60ab;"
                        + "border-width: 0 2px 0 17px;"
                        + "margin: 10px 0;"
                        + "padding: 6px 14px;"
                    + '}'
                    + '.widget-reference {'
                        + 'text-align: right;'
                    + '}'
                    + '.widget-reference-a {'
                        + 'display: inline-block;'
                        + 'color: black;'
                        + 'text-decoration: none;'
                        + 'position: relative;'
                    + '}'
                    + '.widget-reference-a:hover .widget-title {'
                        + 'text-decoration: underline;'
                    + '}'
                    + '.widget-spinelabel {'
                        + 'opacity: .9;'
                        + 'padding-top: 5px;'
                        + 'font-size: .85em;'
                    + '}'
                    + '.widget-title {'
                        + 'font-weight: bold;'
                        + 'font-size: 1em;'
                    + '}'
                    + '.widget-author {'
                        + 'opacity: .5;'
                        + 'font-size: 1em;'
                        + 'padding-bottom: 5px;'
                    + '}'
                    + '.widget-reference::before {'
                        + 'content: "”";'
                        + 'float: right;'
                        + 'font-size: 100px;'
                        + 'font-family: cursive;'
                        + 'color: #1c60ab;'
                        + 'line-height: 90px;'
                        + 'padding: 0 5px 0 8px;'
                    + '}'
                    + '.erasereader-widget-div-dark {'
                        + "background: #141414;"
                    + '}'
                    + '.erasereader-widget-div-dark .widget-reference-a {'
                        + "color: white;"
                    + '}'
                    + '';
        d.head.appendChild(node);
    }

    var erasereader = erasereader || {
        setup: function() {
            var settings = {
                width: '100%',
                maxheight: '10000px',
                textsize: 100,  // percentage
                theme: 'author-theme',  // OR author-theme OR night-theme
            }

            var els = d.getElementsByClassName('erasereader-widget');
            var elsLen = els.length;
            var basename = Date.now();

            for(var i = 0; i < elsLen; i++) {
                var el = els[0];
                var attrs = el.attributes;
                
                var queryParamObj = Object.assign({}, settings);
                for(var j=0; j<attrs.length; j++) {
                    var attr = attrs[j].nodeName;
                    var attrVal = attrs[j].nodeValue;
                    if(attr.match(/^data-/) && attrVal) {
                        queryParamObj[attr.replace(/^data-/,'')] = attrVal;
                    }
                }
                var queryParamArray = [];
                for(var p in queryParamObj) {
                    queryParamArray.push( encodeURIComponent(p) + "=" + encodeURIComponent(queryParamObj[p]) );
                }

                var iframeIdName = 'erasereader-widget-iframe-' + (basename + i);
                var iframeEl = newEl('iframe', {
                    id: iframeIdName,
                    name: iframeIdName,
                    className: 'erasereader-widget-iframe',
                    src: el.href + '&widget=1&' + queryParamArray.join('&'),
                    style: ""
                        + "visibility: hidden;"
                        + "max-height: " + queryParamObj.maxheight + ";"
                        + "height: " + (queryParamObj.maxheight.match(/px$/) ? Math.min(queryParamObj.maxheight, 200) : 200) + "px;",
                });

                var divEl = newEl('div', {
                    className: 'erasereader-widget-div' + (queryParamObj.theme=='night-theme' ? ' erasereader-widget-div-dark' : ''),
                    style: ""
                        + "width: " + queryParamObj.width + " !important;",
                });

                divEl.appendChild(iframeEl);
                el.parentNode.replaceChild(divEl, el);
            }

            window.addEventListener('message', function(event) {
                var data = event.data;
                var iframeEl = d.getElementById(data.iframeid);

                if(iframeEl) {
                    switch(data.action) {
                        case 'setHeight':
                            var height = parseInt(data.payload, 10);
                            if(iframeEl && height) {
                                iframeEl.style.height = height + "px";
                            }
                            iframeEl.style.visibility = "";  // just in case
                            break;
                        
                        case 'loading':
                            iframeEl.style.visibility = "";
                            break;

                        case 'setReference':
                            var payload = data.payload || {};
                            var refEl = newEl('div', {
                                className: "widget-reference",
                            });
                            var refElA = newEl('a', {
                                className: "widget-reference-a",
                                target: '_blank',
                                href: iframeEl.src.replace(/&widget=1.*$/, '&flash=1'),
                            });
                            var spineLblEl = newEl('div', {
                                className: "widget-spinelabel",
                                innerText: '“' + (payload.spineLabel || "") + '”',
                                // note: it is important I do not inject HTML as I do not check the postMessage source
                            });
                            var titleEl = newEl('div', {
                                className: "widget-title",
                                innerText: (payload.title || ""),
                            });
                            var authorEl = newEl('div', {
                                className: "widget-author",
                                innerText: (payload.author || ""),
                            });

                            refElA.appendChild(spineLblEl);
                            refElA.appendChild(titleEl);
                            refElA.appendChild(authorEl);
                            refEl.appendChild(refElA);
                            iframeEl.parentNode.insertBefore(refEl, null);
                            
                            break;
                    }
                }

            }, false);
        }
    };

    erasereader.setup();

})(document);