/*jslint this: true, browser: true, for: true, long: true */
/*global window $ console Sessions Version Settings Instruments Quotes News Accounts Balances Performances Positions Orders Transactions */

/**
 * The API to connect with Binck
 *
 * @constructor
 * @param {function()} getConfiguration The function used to retrieve the configuration object
 * @param {function(Object)} newTokenCallback When a token has been acquired, this function is called
 * @param {function(number)} expirationCounterCallback Counter function returning minutes until expiration of the token (for demo purposes)
 */
function Api(getConfiguration, newTokenCallback, expirationCounterCallback) {
    "use strict";

    /** @type {Object} */
    var apiObject = this;
    /** @type {string} */
    var accessToken = "";
    /** @type {string} */
    var refreshToken = "";
    /** @type {Date} */
    var accessTokenExpirationTime;
    /** @type {number} */
    var accessTokenExpirationTimer;  // Show the time left the token is active, for debug purposes.
    /** @type {number} */
    var accessTokenRefreshTimer;  // Request a new token just before the token expires.
    // CSRF-token is optional but highly recommended. You should store the value of this (CSRF) token in the users session to be validated when they return.
    // This should be a random unique per session token and put on the session/cookie/localStorage.
    /** @type {number} */
    var csrfToken = Math.random();

    /**
     * This function is used to do the calls.
     * @param {string} method The HTTP method, for example 'POST'.
     * @param {string} urlParams Specify the endpoint, like 'version'.
     * @param {Object} data Data to submit.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {Object} Returns the ajax request, for optional triggering.
     */
    function requestCallback(method, urlParams, data, successCallback, errorCallback) {

        /**
         * Return the authorization header with the Bearer token.
         * If the token is expired, the login page will be shown instead.
         * @return {Object} The constructed header, to be sent with a request.
         */
        function getAccessHeader() {
            if (accessToken === "" && urlParams !== "version") {
                throw "Not logged in.";
            }
            if (new Date() > accessTokenExpirationTime) {
                console.log("Token has been expired.");
                window.clearInterval(accessTokenExpirationTimer);
                window.clearTimeout(accessTokenRefreshTimer);
                apiObject.navigateToLoginPage(apiObject.getState().realm);
            }
            return {
                "Accept": "application/json; charset=utf-8",
                "Authorization": "Bearer " + accessToken
            };
        }

        /**
         * If an error was returned from an ajax call, this function translates the xhr object to a "human readable" error text.
         * @param {Object} jqXhr The returned xhr object.
         * @return {void}
         */
        function getExtendedErrorInfo(jqXhr) {
            var errorOrigin = method + " /" + urlParams;
            console.log(errorOrigin + ": " + JSON.stringify(jqXhr));
            if (jqXhr.responseJSON !== undefined && jqXhr.responseJSON.hasOwnProperty("endUserMessage") && jqXhr.responseJSON.endUserMessage !== "") {
                errorCallback(jqXhr.status + " - " + jqXhr.responseJSON.endUserMessage + " (" + errorOrigin + ")");
            } else if (jqXhr.responseJSON !== undefined && jqXhr.responseJSON.hasOwnProperty("developerMessage")) {
                errorCallback(jqXhr.status + " - " + jqXhr.responseJSON.developerMessage + " (" + errorOrigin + ")");
            } else if (jqXhr.responseJSON !== undefined && jqXhr.responseJSON.hasOwnProperty("message")) {
                errorCallback(jqXhr.status + " - " + jqXhr.responseJSON.message + " (" + errorOrigin + ")");
            } else {
                errorCallback("Error in " + errorOrigin + ": " + jqXhr.status + " (" + jqXhr.statusText + ")");
            }
        }

        return $.ajax({
            "dataType": "json",
            // We are sending JSON if using POST or PATCH. API is not accepting www-form-urlencoded.
            "contentType": "application/json; charset=utf-8",
            "type": method.toUpperCase(),
            "url": getConfiguration().apiUrl + "/" + urlParams,
            "timeout": 30 * 1000,  // Timeout after 30 seconds.
            "data": (
                method.toUpperCase() === "GET"
                ? data
                : JSON.stringify(data)
            ),
            "headers": getAccessHeader(),
            "success": successCallback,
            "error": function (jqXhr) {
                getExtendedErrorInfo(jqXhr);
            }
        });
    }

    /**
     * This function is used to start a download.
     * @param {string} method The HTTP method, for example 'POST'.
     * @param {string} urlParams Specify the endpoint, like 'version'.
     * @param {Object} data Data to submit.
     * @param {function((Object|null|string))} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    function requestCallbackDownload(method, urlParams, data, successCallback, errorCallback) {
        // Use plain httpRequest, since jQuery fails doing this.
        var req = new XMLHttpRequest();
        req.open(method, getConfiguration().apiUrl + "/" + urlParams, true);
        req.responseType = "blob";
        req.setRequestHeader("Authorization", "Bearer " + accessToken);
        req.onreadystatechange = function () {
            if (req.readyState === 4 && req.status === 200) {
                successCallback(req.response);
            } else if (req.status !== 200) {
                console.log(req);
                errorCallback(req.status.toString());
            }
        };
        req.send(data);
    }

    /**
     * Get argument from the URL.
     * @param {string} name Name of query parameter.
     * @return {string} Value.
     */
    function getUrlParameterByName(name) {
        // Get an argument of the URL like www.test.org/?arg=value
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
        var results = regex.exec(window.location.href);
        return (
            results === null
            ? ""
            : decodeURIComponent(results[1].replace(/\+/g, " "))
        );
    }

    /**
     * Read a cookie.
     * @param {string} key Name of the cookie.
     * @return {string} Value.
     */
    this.getCookie = function (key) {
        var name = key + "=";
        var decodedCookie = decodeURIComponent(document.cookie);
        var cookieArray = decodedCookie.split(";");
        var i;
        var c;
        for (i = 0; i < cookieArray.length; i += 1) {
            c = cookieArray[i];
            while (c.charAt(0) === " ") {
                c = c.substring(1);
            }
            if (c.indexOf(name) === 0) {
                return c.substring(name.length, c.length);
            }
        }
        return "";
    };

    /**
     * Insert a cookie. In order to delete it, make value empty.
     * @param {string} key Name of the cookie.
     * @param {string} value Value to store.
     * @return {void}
     */
    this.setCookie = function (key, value) {
        var expires = new Date();
        // Cookie is valid for 360 days.
        expires.setTime(expires.getTime() + 360 * 24 * 60 * 60 * 1000);
        document.cookie = key + "=" + value + ";expires=" + expires.toUTCString();
    };

    /**
     * Get the state from the redirect URL.
     * @return {*} The object saved in the state parameter.
     */
    this.getState = function () {
        var stateString = getUrlParameterByName("state");
        var stateStringDecoded = window.atob(stateString);
        try {
            return JSON.parse(stateStringDecoded);
        } catch (ignore) {
            console.error("State returned in the URL parameter is invalid.");
            return null;
        }
    };

    /**
     * The state is used to validate the response and to add the desired opening account, if multiple accounts are available and if this account type is one of them.
     * @param {string} accountType The requested account type to show.
     * @param {string} realm The realm to use.
     * @return {string} The encoded state object, including the CSRF token.
     */
    function createState(accountType, realm) {
        var stateObject = {
            // Token is a random number
            "csrfToken": csrfToken,
            // Remember realm, to get token
            "realm": realm,
            "account": accountType
        };
        // Convert the object to a base64 encoded string:
        var stateString = JSON.stringify(stateObject);
        return window.btoa(stateString);
    }

    /**
     * Construct the URL to navigate to the login dialog.
     * @param {string} realm Realm used by the client.
     * @return {string} URL to redirect to.
     */
    this.getLogonUrl = function (realm) {
        var configurationObject = getConfiguration();
        var responseType = "code";
        return configurationObject.authenticationProviderUrl + "realms/" + encodeURIComponent(realm) + "/authorize?" + $.param({
            "ui_locales": configurationObject.language,
            "client_id": configurationObject.clientId,
            "scope": configurationObject.scope,
            "state": createState(configurationObject.accountType, realm),
            "response_type": responseType,
            "redirect_uri": configurationObject.redirectUrl
        });
    };

    /**
     * This function loads the page where the user enters the credentials and agreed to the consent.
     * When authorized, the browser will navigate to the given redirect URL (which must be registered as "Callback URL" in WSO2).
     * @param {string} realm Identification for the type of login.
     * @return {void}
     */
    this.navigateToLoginPage = function (realm) {
        // The login page needs to be a redirect, using GET to supply landing page and client id.
        // Save the state, to compare after the login.
        apiObject.setCookie("csrfToken", csrfToken.toString());
        console.log("Loading login or consent page..");
        window.location = apiObject.getLogonUrl(realm);
    };

    /**
     * This function calculates the time until which the token is valid.
     * @param {number} expiresInSeconds Seconds until expiration.
     * @return {void}
     */
    function updateTokenExpirationTime(expiresInSeconds) {
        accessTokenExpirationTime = new Date();
        accessTokenExpirationTime.setSeconds(accessTokenExpirationTime.getSeconds() + expiresInSeconds);
        console.log("New token will expire at " + accessTokenExpirationTime.toLocaleString());
        // Start a timer, to log the time until expiration - for debug purposes, not for production.
        accessTokenExpirationTimer = window.setInterval(
            function () {
                var difference = accessTokenExpirationTime - new Date();
                var minutesTillExpiration = Math.round(difference / 1000 / 60);
                if (difference > 0) {
                    expirationCounterCallback(minutesTillExpiration);
                } else {
                    console.log("Token expired.");
                    window.clearInterval(accessTokenExpirationTimer);
                }
            },
            60 * 1000
        );
    }

    /**
     * If authentication was successful, we validate the response by comparing states. Ideally the state is stored in a cookie or localStorage.
     * @param {function(string)} errorCallback Callback function to invoke in case of an error.
     * @return {void}
     */
    function verifyCsrfToken(errorCallback) {
        var csrfTokenBefore = parseFloat(apiObject.getCookie("csrfToken"));
        var csrfTokenAfter = apiObject.getState().csrfToken;
        console.log("Comparing stored CSRF code " + csrfTokenBefore + " with retrieved code " + csrfTokenAfter + "..");
        if (csrfTokenAfter !== csrfTokenBefore) {
            errorCallback("CSRF error: The state supplied when logging in, is not the same as the state from the response.");
        }
    }

    /**
     * If authentication was successful, the token can be requested using the code supplied by the authentication provider.
     * @param {Object} tokenObject The token object returned.
     * @param {function(string)} errorCallback Callback function to invoke in case of an error.
     * @return {void}
     */
    function tokenReceivedCallback(tokenObject, errorCallback) {
        /* {
            access_token: "7819a965-6858-4db9-8583-864d66d80911",
            refresh_token: "4a4b125f-e5a2-439d-abac-3e85ef40cc37",
            scope: "read write",
            token_type: "Bearer",
            expires_in: 3599
        } */
        var nextSessionRefresh = tokenObject.expires_in - 60;  // Refresh one minute before expiration
        var nextSessionRefreshTime = new Date();
        nextSessionRefreshTime.setSeconds(nextSessionRefreshTime.getSeconds() + nextSessionRefresh);
        accessToken = tokenObject.access_token;
        refreshToken = tokenObject.refresh_token;
        console.log("New token received: " + accessToken);
        updateTokenExpirationTime(tokenObject.expires_in);
        // Start a timer, to refresh the token before it expires.
        console.log("Session will be refreshed at " + nextSessionRefreshTime.toLocaleString());
        accessTokenRefreshTimer = window.setTimeout(
            function () {
                apiObject.getRefreshToken(errorCallback);
            },
            nextSessionRefresh * 1000  // Do the refresh just before the token will expire
        );
        newTokenCallback(tokenObject);
    }

    /**
     * Retrieve an access token from the server.
     * @param {Object} data Data to be send as query string.
     * @param {function(string)} errorCallback Callback function to invoke in case of an error.
     * @return {void}
     */
    function getToken(data, errorCallback) {
        var configurationObject = getConfiguration();
        data.realm = apiObject.getState().realm;
        $.ajax({
            "dataType": "json",
            "type": "GET",
            "url": configurationObject.appServerUrl + "token.php",
            "data": data,
            "cache": false,  // No caching. Multiple tokens can be retrieved with same code when page is refreshed.
            "success": function (tokenObject) {
                tokenReceivedCallback(tokenObject, errorCallback);
            },
            "error": function (jqXhr) {
                console.error("Error retrieving token.");
                if (jqXhr.hasOwnProperty("responseJSON") && jqXhr.responseJSON.hasOwnProperty("error") && jqXhr.responseJSON.hasOwnProperty("error_description")) {
                    if (jqXhr.responseJSON.error === "invalid_grant") {
                        apiObject.navigateToLoginPage(apiObject.getState().realm);
                    } else {
                        errorCallback(jqXhr.responseJSON.error_description);
                    }
                } else {
                    errorCallback("Communication error in getToken: " + jqXhr.status);
                }
            }
        });
    }

    /**
     * If authentication was successful, the token can be requested using the code supplied by the authentication provider.
     * @param {string} code The code from the URL.
     * @param {function(string)} errorCallback Callback function to invoke in case of an error.
     * @return {void}
     */
    function getAccessToken(code, errorCallback) {
        var data = {
            "code": code
        };
        console.log("Requesting token..");
        getToken(data, errorCallback);
    }

    /**
     * Retrieve a new accessToken, if the current one is almost expired.
     * @param {function(string)} errorCallback Callback function to invoke in case of an error.
     * @return {void}
     */
    this.getRefreshToken = function (errorCallback) {
        var data = {
            "refresh_token": refreshToken
        };
        console.log("Requesting token refresh..");
        getToken(data, errorCallback);
    };

    /**
     * This is the function to use for a single page application.
     * The URL is checked. If it contains a code, the token is requested and the user is authenticated.
     * If there is no code yet, the login page will be shown.
     * @param {function()} notAuthenticatedCallback If not authenticated, this callback will be invoked, along with the login page.
     * @param {function(string)} errorCallback Callback function to invoke in case of an error.
     * @return {void}
     */
    this.checkState = function (notAuthenticatedCallback, errorCallback) {
        var code = getUrlParameterByName("code");
        if (code === "") {
            notAuthenticatedCallback();
            if (getUrlParameterByName("error") !== "") {
                // An error occurred. User might not have authorized the request.
                errorCallback("Login failed: \n" + getUrlParameterByName("error_description"));
            }
        } else {
            console.log("Received scope: " + getUrlParameterByName("scope"));
            verifyCsrfToken(errorCallback);
            getAccessToken(code, errorCallback);
        }
    };

    apiObject.accounts = new Accounts(requestCallback);
    apiObject.settings = new Settings(requestCallback);
    apiObject.balances = new Balances(requestCallback);
    apiObject.instruments = new Instruments(requestCallback, requestCallbackDownload);
    apiObject.quotes = new Quotes(requestCallback);
    apiObject.news = new News(requestCallback);
    apiObject.orders = new Orders(requestCallback);
    apiObject.performances = new Performances(requestCallback);
    apiObject.positions = new Positions(requestCallback);
    apiObject.sessions = new Sessions(requestCallback);
    apiObject.transactions = new Transactions(requestCallback);
    apiObject.version = new Version(requestCallback);
}
