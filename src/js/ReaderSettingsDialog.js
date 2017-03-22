// biblemesh_ : This file changed in it entirety

define(['./ModuleConfig', 'hgn!readium_js_viewer_html_templates/biblemesh_settings-dialog.html', './ReaderSettingsDialog_Keyboard', 'i18nStrings', './Dialogs', 'biblemesh_Settings', './Keyboard'], function(moduleConfig, SettingsDialog, KeyboardSettings, Strings, Dialogs, Settings, Keyboard){

    // change these values to affec the default state of the application's preferences at first-run.
    var defaultSettings = {
        fontSize: 100,
        syntheticSpread: "auto",
        scroll: "auto",
        columnGap: 60,
        columnMaxWidth: 550,
        columnMinWidth: 400
    }

    var biblemesh_ReaderSettings = {};

    var getBookStyles = function(theme){
        var isAuthorTheme = theme === "author-theme";
        var $previewText = $('.preview-text');
        setPreviewTheme($previewText, theme);
        var previewStyle = window.getComputedStyle($previewText[0]);
        var bookStyles = [{selector: 'body', declarations: {
            backgroundColor: isAuthorTheme ? "" : previewStyle.backgroundColor,
            color: isAuthorTheme ? "" : previewStyle.color
        }}];
        bookStyles.push({selector: '*:not(a):not(body)', declarations: { // biblemesh_
            backgroundColor: (theme === "default-theme") ? 'white' : '',
            color: (theme === "default-theme") ? 'black' : ''
        }});
        bookStyles.push({selector: 'a', declarations: { // biblemesh_
            color: (theme === "night-theme") ? 'rgb(118, 189, 228)' : ''
        }});
        return bookStyles;
    }

    var setPreviewTheme = function($previewText, newTheme){
        var previewTheme = $previewText.attr('data-theme');
        $previewText.removeClass(previewTheme);
        $previewText.addClass(newTheme);
        $previewText.attr('data-theme', newTheme);
    }

    var updateReader = function(reader, readerSettings){
        reader.updateSettings(readerSettings); // triggers on pagination changed

        if (readerSettings.theme){
            //$("html").addClass("_" + readerSettings.theme);
            $("html").attr("data-theme", readerSettings.theme);

            var bookStyles = getBookStyles(readerSettings.theme);
            reader.setBookStyles(bookStyles);
            $('#reading-area').css(bookStyles[0].declarations);
        }
    }

    var indicateCurrentTheme = function() {
        $('.setting-theme-div').removeClass('setting-theme-sel');
        $('.setting-theme-div-' + biblemesh_ReaderSettings.theme).addClass('setting-theme-sel');
    }

    var initDialog = function(reader){
        $('#app-container').append(SettingsDialog({imagePathPrefix: moduleConfig.imagePathPrefix, strings: Strings, dialogs: Dialogs, keyboard: Keyboard}));

        $previewText = $('.preview-text');
        $('.theme-option').on('click', function(){
            biblemesh_ReaderSettings.theme = $(this).attr('data-theme');
            indicateCurrentTheme();
            save();
        });

        var $displayFormatRadios = $('[name="display-format"]');
        $displayFormatRadios.on('change', function(){
            biblemesh_ReaderSettings.syntheticSpread = this.value;
            save();
        });

        $('#buttIncreaseFontSize').on('click', function(){
            biblemesh_ReaderSettings.fontSize = Math.min(250, (parseInt(biblemesh_ReaderSettings.fontSize,10) || 100) + 10);
            save();
        });

        $('#buttReduceFontSize').on('click', function(){
            biblemesh_ReaderSettings.fontSize = Math.max(30, (parseInt(biblemesh_ReaderSettings.fontSize,10) || 100) - 10);
            save();
        });

        $('#settings-dialog').on('show.bs.modal', function(){ // IMPORTANT: not "shown.bs.modal"!! (because .off() in library vs. reader context)

            $('#tab-butt-main').trigger("click");
            // KeyboardSettings.initKeyboardList();  biblemesh_ commented 

            // setTimeout(function(){ $('#closeSettingsCross')[0].focus(); }, 1000); //tab-butt-main  biblemesh_ commented

            Settings.get('reader', function(readerSettings){
                biblemesh_ReaderSettings = readerSettings || defaultSettings;
                
                if (biblemesh_ReaderSettings.syntheticSpread == "auto"){
                    $('#two-up-option input').prop('checked', true);
                }
                else if (biblemesh_ReaderSettings.syntheticSpread == "single"){
                    $('#one-up-option input').prop('checked', true);
                }

                indicateCurrentTheme();

            });
        });

        var save = function(){

            if (reader){
               updateReader(reader, biblemesh_ReaderSettings);
            }

            Settings.put('reader', biblemesh_ReaderSettings);

        };

    }

    return {
        initDialog : initDialog,
        updateReader : updateReader,
        defaultSettings : defaultSettings
    }
});
