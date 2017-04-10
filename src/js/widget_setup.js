var erasereader = erasereader || {
    setup: function() {
        var settings = {
            width: '100%',
            maxheight: '10000px',
            textsize: 100,  // percentage
            theme: 'default-theme',  // OR author-theme OR night-theme
            quotestyle: 'quotation-mark',  // OR line
        }

        var d = document;
        
        var els = d.getElementsByClassName('erasereader-widget');

        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var attrs = el.attributes;
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

            iframeEl.className = 'erasereader-widget-iframe';
            iframeEl.src = el.href + '&widget=1&' + queryParamArray.join('&');
            iframeEl.style = ""
                + "border: none !important;"
                + "width: " + queryParamObj.width + " !important;"
                + "max-height: " + queryParamObj.maxheight + " !important;";

            el.parentNode.replaceChild(iframeEl, el);
        }
    }
};

erasereader.setup();

// <a class="erasereader-widget" href="http://127.0.0.1:8080/book/11?goto=%7B%22idref%22%3A%22chapter7%22%2C%22elementCfi%22%3A%22%2F4%2F2%2F20%2C%2F3%3A123%2C%2F3%3A132%22%7D" target="_blank" data-width="" data-maxheight="" data-textsize="" data-theme="" data-quotestyle="">Open book</a>
// !function(d,i,s){if(!window.erasereader){if(!d.getElementById(i)) {var c=d.getElementsByTagName(s)[0],j=d.createElement(s);j.id=i;j.src="http://127.0.0.1:8080/src/js/widget_setup.js?5";c.parentNode.insertBefore(j,c);}}else{erasereader.setup()}}(document,"erasereader-widget-script","script");