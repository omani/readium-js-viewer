var erasereader = erasereader || {
    setup: function() {
        var settings = {
            width: '100%',
            maxheight: '10000px',
            textsize: 100,  // percentage
            theme: 'default-theme',  // OR author-theme OR night-theme
        }

        var d = document;
        
        var els = d.getElementsByClassName('erasereader-widget');
        var basename = Date.now();

        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var attrs = el.attributes;
            var divEl = d.createElement('div');
            var iframeEl = d.createElement('iframe');
            
            var queryParamObj = Object.assign({}, settings);
            for(var i=0; i<attrs.length; i++) {
                var attr = attrs[i].nodeName;
                var attrVal = attrs[i].nodeValue;
                if(attr.match(/^data-/) && attrVal) {
                    queryParamObj[attr.replace(/^data-/,'')] = attrVal;
                }
            }
            var queryParamArray = [];
            for(var p in queryParamObj) {
                queryParamArray.push( encodeURIComponent(p) + "=" + encodeURIComponent(queryParamObj[p]) );
            }

            iframeEl.id = iframeEl.name = 'erasereader-widget-iframe-' + (basename + i);
            iframeEl.className = 'erasereader-widget-iframe';
            iframeEl.src = el.href + '&widget=1&' + queryParamArray.join('&');
            iframeEl.style = ""
                + "visibility: hidden !important;"
                + "display: block !important;"
                + "border: none !important;"
                + "width: 100% !important;"
                + "max-height: " + queryParamObj.maxheight + " !important;"
                + "height: " + Math.min(queryParamObj.maxheight, 200) + "px;";

            divEl.className = 'erasereader-widget-div';
            divEl.style = ""
                + "width: " + queryParamObj.width + " !important;"
                + "box-sizing: border-box;"
                + "box-shadow: 2px 2px 15px #ccc;"
                + "border: 0 solid #1c60ab;"
                + "border-width: 0 2px 0 17px;"
                + "margin: 10px 0;"
                + "padding: 6px 14px;";
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
                        // no break; here on purpose
                    case 'loading':
                        iframeEl.style.visibility = "";
                        break;
                }
            }

        }, false);
    }
};

erasereader.setup();