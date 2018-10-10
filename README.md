# Forked from readium-js-viewer for BibleMesh implementation

**EPUB reader written in HTML, CSS and Javascript.**

See the following submodule repositories:
* ( https://github.com/educational-resources-and-services/readium-js )
* ( https://github.com/educational-resources-and-services/readium-shared-js )
* ( https://github.com/educational-resources-and-services/readium-cfi-js )


## Changes to original Readium project
* An express server has been developed for facilitating a server-based library
* Works with a MySQL database
* Setup for authentication using Shibboleth
* Annotations have been changed and expanded for adding notes, copying, sharing, etc
* User data (current location + annotations) are patched to the server instead of simply being saved in localstorage
* UI and other minor changes

Note: Readium's cloud reader has been the sole focus of this project. (I.e. The chrome app and cloud reader lite have not been maintained or tested.)

See ( https://github.com/readium/readium-js ) for more extensive information relating to the original project.


## Prerequisites

* A decent terminal. On Windows, GitShell works great ( http://git-scm.com ), GitBash works too ( https://msysgit.github.io ), and Cygwin adds useful commands ( https://www.cygwin.com ).
* NodeJS ( https://nodejs.org ) v8+
* A MySQL database with [this structure](https://github.com/educational-resources-and-services/readium-js-viewer/blob/master/ReadiumData.sql).


## Development

### Git initialisation

* `git clone --recursive -b master https://github.com/educational-resources-and-services/readium-js-viewer.git`
* `cd readium-js-viewer`
* `git submodule update --init --recursive` to ensure that the readium-js-viewer chain of dependencies is initialised (readium-js, readium-shared-js and readium-cfi-js)
* `git checkout master && git submodule foreach --recursive "git checkout master"`


### Source tree preparation

* `npm run prepare:all` (to perform required preliminary tasks, like patching code before building)

Note that the above command executes the following:

* `npm install` (to download dependencies defined in `package.json` ... note that the `--production` option can be used to avoid downloading development dependencies, for example when testing only the pre-built `build-output` folder contents)
* `npm update` (to make sure that the dependency tree is up to date)
* some additional HTTP requests to the GitHub API in order to check for upstream library updates (wherever Readium uses a forked codebase)


### ENV variables

The following ENV variables are available for configurating the app. Note that you can set ENV variables locally via the [.env file](https://github.com/educational-resources-and-services/readium-js-viewer/blob/master/.env).

Required:
* APP_URL
* RDS_HOSTNAME
* RDS_PORT
* RDS_USERNAME
* RDS_PASSWORD
* RDS_DB_NAME

Optional:
* PORT
* LOGLEVEL
* REDIS_HOSTNAME
* REDIS_PORT
* ADMIN_EMAILS
* SKIP_AUTH
* SESSION_MAXAGE
* APP_SESSION_MAXAGE
* SESSION_SECRET
* REQUIRE_HTTPS
* S3_BUCKET
* IS_DEV
* GOOGLE_ANALYTICS_CODE
* APP_PATH


### Running locally

* `sudo npm start`
* Open browser to `http://localhost:8080`


### Forking

Assuming a fork of `https://github.com/educational-resources-and-services/readium-js-viewer` is made under `USER` at `https://github.com/USER/readium-js-viewer`, the `.gitmodules` file ( https://github.com/educational-resources-and-services/readium-js-viewer/blob/develop/.gitmodules ) will still point to the original submodule URL (at `readium`, instead of `USER`). Thankfully, one can simply modify the `.gitmodules` file by replacing `https://github.com/educational-resources-and-services/` with `https://github.com/USER/`, and do this for every submodule (`readium-js-viewer` > `readium-js` > `readium-shared-js` > `readium-cfi-js`). Then the Git command `git submodule sync` can be invoked, for each submodule.


## Distribution

* `npm run dist`
  * Creates dist/cloud-reader for testing locally. In that directory, run `node app.js`.
  * Creates cloud-reader-app.zip for deploying to AWS or the like.


## License

**BSD-3-Clause** ( http://opensource.org/licenses/BSD-3-Clause )

See [license.txt](./license.txt).
