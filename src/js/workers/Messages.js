define(function(){
    return {
        // window -> worker messages
        IMPORT_ZIP : 0,
        OVERWRITE_CONTINUE : 1,
        FIND_PACKAGE_RESPONSE: 2,
        PARSE_PACKAGE_RESPONSE: 3,
        DELETE_EPUB : 4,
        IMPORT_DIR : 5,
        IMPORT_URL: 6,
        MIGRATE: 7,
        OVERWRITE_SIDE_BY_SIDE: 8,
        CONTINUE_IMPORT_ZIP: 9,

        // worker -> window messages
        SUCCESS : 100,
        PROGRESS : 101,
        ERROR : 102,
        OVERWRITE : 103,
        FIND_PACKAGE : 104,
        PARSE_PACKAGE: 105,


        PROGRESS_EXTRACTING : 200,
        PROGRESS_WRITING: 201,
        PROGRESS_DELETING: 202,
        PROGRESS_MIGRATING: 203,

        BIBLEMESH_UPLOAD: 250,
        BIBLEMESH_PROCESSING: 251,

        ERROR_STORAGE : 300,
        ERROR_EPUB : 301,
        ERROR_AJAX : 302,
        ERROR_PACKAGE_PARSE: 303,
        
        READY: 400
    }
});