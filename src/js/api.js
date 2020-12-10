/*jslint this: true, browser: true, for: true, long: true */
/*global window console Server Sessions Version Settings Instruments Quotes News Accounts Balances Performances Positions Orders Transactions */

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
    /** @type {Object} */
    var server = new Server();
    /** @type {string} */
    var accessToken = "";
    /** @type {string} */
    var refreshToken = "";
    /** @type {Date} */
    var accessTokenExpirationTime;
    /** @type {number} */
    var accessTokenExpirationTimer = 0;  // Show the time left the token is active, for debug purposes.
    /** @type {number} */
    var accessTokenRefreshTimer;  // Request a new token just before the token expires.
    // CSRF-token is optional but highly recommended. You should store the value of this (CSRF) token in the users session to be validated when they return.
    // This should be a random unique per session token and put on the session/cookie/localStorage.
    /** @type {number} */
    var csrfToken = Math.random();

    /**
     * This function constructs query parameters from an object.
     * @param {Object<string, string>} data Key/value pairs to process.
     * @return {string} The query parameter string, of which the first is prefixed with "?".
     */
    function convertObjectToQueryParameters(data) {
        var result = "";
        Object.entries(data).forEach(function (entry) {
            result += (
                result === ""
                ? "?"
                : "&"
            ) + entry[0] + "=" + encodeURIComponent(entry[1]);
        });
        return result;
    }

    /**
     * This function is used to do the calls.
     * @param {string} method The HTTP method, for example 'POST'.
     * @param {string} urlParams Specify the endpoint, like 'version'.
     * @param {Object} data Data to submit.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    function requestCallback(method, urlParams, data, successCallback, errorCallback) {

        /**
         * If data is posted then a content header is required, as well as different parameter handling.
         * @return {boolean} True for POST, PUT of PATCH.
         */
        function isPostBodyRequired() {
            return method.toUpperCase() !== "GET" && method.toUpperCase() !== "DELETE";
        }

        /**
         * Return the authorization header with the Bearer token.
         * If the token is expired, the login page will be shown instead.
         * @return {Object} The constructed header, to be sent with a request.
         */
        function getAccessHeaders() {
            var header = {
                "Accept": "application/json; charset=utf-8"
            };
            if (urlParams === "version") {
                return header;
            }
            if (accessToken === "") {
                throw "Not logged in.";
            }
            if (new Date() > accessTokenExpirationTime) {
                console.log("Token has been expired.");
                window.clearInterval(accessTokenExpirationTimer);
                window.clearTimeout(accessTokenRefreshTimer);
                apiObject.navigateToLoginPage(apiObject.getState().realm);
            }
            header.Authorization = "Bearer " + accessToken;
            if (isPostBodyRequired()) {
                // We are sending JSON if using POST or PATCH. API is not accepting www-form-urlencoded.
                header["Content-Type"] = "application/json; charset=utf-8";
            }
            return header;
        }

        /**
         * If an error was returned from a fetch, this function translates the response error object to a "human readable" error text.
         * @param {Object} errorObject The returned error object.
         * @return {void}
         */
        function getExtendedErrorInfo(errorObject) {
            var textToDisplay = "Error with " + method + " /" + urlParams + " - status " + errorObject.status + " " + errorObject.statusText;
            console.error(textToDisplay);
            // Some errors have a JSON-response, containing explanation of what went wrong.
            errorObject.json().then(function (errorObjectJson) {
                if (errorObjectJson.hasOwnProperty("endUserMessage") && errorObjectJson.endUserMessage !== "") {
                    // EndUserMessage is translated and meant to be shown to the customer.
                    errorCallback(errorObjectJson.endUserMessage);
                } else if (errorObjectJson.hasOwnProperty("developerMessage")) {
                    // DeveloperMessages shouldn't be shown to the customer. They are English and should only appear during development (for example Bad Request).
                    errorCallback(errorObjectJson.developerMessage + " (" + textToDisplay + ")");
                } else if (errorObjectJson.hasOwnProperty("message")) {
                    // In rare cases a developerMessage is just called "message".
                    errorCallback(errorObjectJson.message + " (" + textToDisplay + ")");
                } else {
                    errorCallback(JSON.stringify(errorObjectJson) + " (" + textToDisplay + ")");
                }
            }).catch(function () {
                // Typically 401 (Unauthorized) has an empty response, this generates a SyntaxError.
                errorCallback(textToDisplay);
            });
        }

        var url = getConfiguration().apiUrl + "/" + urlParams;
        var fetchInitOptions = {
            "headers": getAccessHeaders(),
            "method": method
        };
        if (isPostBodyRequired()) {
            // Put parameters as json in the body of the request
            fetchInitOptions.body = JSON.stringify(data);
        } else {
            // Add parameters as query parameters
            url += convertObjectToQueryParameters(data);
        }
        fetch(url, fetchInitOptions).then(function (response) {
            if (response.ok) {
                response.json().then(function (responseJson) {
                    successCallback(responseJson);
                });
            } else {
                getExtendedErrorInfo(response);
            }
        }).catch(function (error) {
            errorCallback(error.toString());
        });
    }

    /**
     * This function is used to start a download.
     * @param {string} method The HTTP method, for example 'POST'.
     * @param {string} urlParams Specify the endpoint, like 'version', including GET query parameters.
     * @param {FormData} data POST data to submit.
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
     * This function is used to test an endpoint. Remove this function in a production environment.
     * @param {string} method The HTTP method, for example 'POST'.
     * @param {string} urlParams Specify the endpoint, like 'version'.
     * @param {Object} data Data to submit.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.test = function (method, urlParams, data, successCallback, errorCallback) {
        console.log("Test endpoint.");
        requestCallback(method, urlParams, data, successCallback, errorCallback);
    };

    /**
     * Get argument from the URL.
     * @param {string} name Name of query parameter.
     * @return {string} Value.
     */
    function getUrlParameterByName(name) {
        // Get an argument of the URL like www.test.org/?arg=value
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&#]" + name + "=([^&#]*)");
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
        return configurationObject.authenticationProviderUrl + "realms/" + encodeURIComponent(realm) + "/authorize" + convertObjectToQueryParameters({
            "ui_locales": configurationObject.language,
            "client_id": configurationObject.clientId,
            "scope": configurationObject.scope,
            "state": createState(configurationObject.accountType, realm),
            "response_type": "code",
            "redirect_uri": configurationObject.redirectUrl
        });
    };

    /**
     * This function loads the page where the user enters the credentials and agreed to the consent.
     * When authorized, the browser will navigate to the given redirect URL.
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
        // Start a timer once, to log the time until expiration - for debug purposes, not for production.
        if (accessTokenExpirationTimer === 0) {
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
     * @param {Object} data Data to be send.
     * @param {function(string)} errorCallback Callback function to invoke in case of an error.
     * @return {void}
     */
    function getToken(data, errorCallback) {
        var configurationObject = getConfiguration();
        data.realm = apiObject.getState().realm;
        server.getDataFromServer(
            configurationObject.appServerUrl,
            data,
            function (tokenObject) {
                console.log("Received scope: " + tokenObject.scope);
                tokenReceivedCallback(tokenObject, errorCallback);
            },
            function (errorResponse) {
                console.error(errorResponse);
                // Error comes as object. See if a new login is required.
                errorResponse.json().then(function (errorResponseJson) {
                    if (errorResponseJson.hasOwnProperty("error") && errorResponseJson.hasOwnProperty("error_description")) {
                        if (errorResponseJson.error === "invalid_grant") {
                            apiObject.navigateToLoginPage(apiObject.getState().realm);
                        } else {
                            errorCallback(errorResponseJson.error_description);
                        }
                    } else {
                        errorCallback("Communication error in request to server.");
                    }
                }).catch(function () {
                    errorCallback("Communication error in request to server.");
                });
            }
        );
    }

    /**
     * If authentication was successful, the token can be requested using the code supplied by the authentication provider.
     * @param {string} code The code from the URL.
     * @param {function(string)} errorCallback Callback function to invoke in case of an error.
     * @return {void}
     */
    function getAccessToken(code, errorCallback) {
        var data = {
            "requestType": "requestToken",
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
            "requestType": "refreshToken",
            "refreshToken": refreshToken
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
        var error;
        if (code === "") {
            notAuthenticatedCallback();
            error = getUrlParameterByName("error");
            if (error !== "") {
                // An error occurred. User might not have authorized the request.
                errorCallback("Login failed: \n" + getUrlParameterByName("error_description") + " (" + error + ")");
            }
        } else {
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
