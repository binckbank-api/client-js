/*jslint this: true, browser: true, for: true, long: true */
/*global window console signalR, SubscriptionsForNews, SubscriptionsForOrders, SubscriptionsForQuotes */

/**
 * The Streamer wrapper to connect with Binck for quotes, news and order events
 *
 * Documentation:
 * https://docs.microsoft.com/en-us/aspnet/core/signalr/javascript-client
 *
 * NPM package:
 * https://www.npmjs.com/package/@aspnet/signalr
 *
 * @constructor
 * @param {string} streamerEndpoint Url of the server.
 * @param {function()} getSubscription Subscription, with account and access token
 * @param {function(Object)} quotesCallback Callback to be called when a quote is received
 * @param {function(Object)} newsCallback Callback to be called when news is received
 * @param {function(Object)} orderExecutionsCallback Callback to be called when an order execution is received
 * @param {function(Object)} orderModificationsCallback Callback to be called when an order modification is received
 * @param {function(Object)} orderEventsCallback Callback to be called when an order update is received
 * @param {function(string, string)} errorCallback Callback that will be called on an error situation
 */
function Streamer(streamerEndpoint, getSubscription, quotesCallback, newsCallback, orderExecutionsCallback, orderModificationsCallback, orderEventsCallback, errorCallback) {
    "use strict";

    /** @type {Object} */
    var streamerObject = this;
    /** @type {Object} */
    var connection = null;
    /** @type {boolean} */
    this.isConnected = false;
    /** @type {Object} */
    this.news = null;
    /** @type {Object} */
    this.orders = null;
    /** @type {Object} */
    this.quotes = null;
    /** @type {boolean} */
    var isApplicationClosing = false;

    /**
     * Get the version of the API. Since this function works without token, this might be the first call to test development.
     * @param {function(Object)} successCallbackVersion When successful, this function is called.
     * @param {function(string)} errorCallbackVersion The function to be called in case of a failed request.
     * @return {void}
     */
    this.getVersion = function (successCallbackVersion, errorCallbackVersion) {
        console.log("Requesting version of streamer..");
        var parser = document.createElement("a");
        parser.href = streamerEndpoint;
        // The version endpoint requires parameters nor token. Only GET.
        fetch(parser.protocol + "//" + parser.host + "/version").then(function (response) {
            if (response.ok) {
                response.json().then(function (responseJson) {
                    successCallbackVersion(responseJson);
                });
            } else {
                console.error(response);
                errorCallbackVersion("Error in version: " + response.status + " (" + response.statusText + ")");
            }
        }).catch(function (error) {
            console.error("Version: ", error);
            errorCallbackVersion("Error in version: " + error);
        });
    };

    /**
     * Creates the connection
     * @return {void}
     */
    function createConnection() {
        var options = {
            // accessTokenFactory not called every request, so refresh token doesn't work.
            // Waiting for bug fix https://github.com/aspnet/SignalR/pull/1880
            accessTokenFactory: function () {
                var accessToken = getSubscription().accessToken;
                console.log("AccessToken used in streamer request: " + accessToken);
                // If you are here looking for the reason your connection is disconnected right after connecting,
                // you might check your token. It should only contain the codes separated by hyphens (no "Bearer " as postfix).
                return accessToken;
            }
        };
        // https://docs.microsoft.com/en-us/aspnet/core/signalr/diagnostics?view=aspnetcore-3.1
        var logLevel = (
            window.location.hostname === "localhost"
            ? signalR.LogLevel.Debug
            : signalR.LogLevel.Information
        );
        console.log("Setup streamer connection with logLevel " + logLevel);
        connection = new signalR.HubConnectionBuilder().withUrl(streamerEndpoint + "?accountNumber=" + getSubscription().activeAccountNumber, options).configureLogging(logLevel).build();
        // Function .withAutomaticReconnect() is available from .NET Core 3
        // Configure the callback for quote events:
        console.log("Configuring callback for quote events");
        connection.on("Quote", quotesCallback);
        // Configure the callback for news events:
        console.log("Configuring callback for news events");
        connection.on("News", newsCallback);
        // Configure the callback for order execution events:
        console.log("Configuring callback for order execution events");
        connection.on("OrderExecution", orderExecutionsCallback);
        // Configure the callback for order modification events:
        console.log("Configuring callback for order modification events");
        connection.on("OrderModified", orderModificationsCallback);
        // Configure the callback for order status change events:
        console.log("Configuring callback for order status change events");
        connection.on("OrderStatus", orderEventsCallback);
        connection.onclose(function () {
            console.log("The connection has been closed.");
            streamerObject.isConnected = false;
            if (!isApplicationClosing) {
                errorCallback("disconnected", "The streamer connection has been closed.");
            }
        });
    }

    /**
     * Handle an error.
     * @param {Object} error Error object.
     * @return {void}
     */
    function processError(error) {
        if (error !== undefined && error !== null) {
            console.error(error);
            if (error.message.trim() !== "") {
                errorCallback("404", error.message);
            } else {
                errorCallback("404", "Something went wrong with the connection. Is the streamer endpoint configured on " + streamerEndpoint + "?");
            }
        } else {
            console.log("Something bad happened, probably in the javascript.");
        }
    }

    /**
     * Start the connection. Can be used to re-start after a disconnect.
     * @param {function()} startedCallback When successful, this function is called.
     * @return {void}
     */
    this.start = function (startedCallback) {

        /**
         * This function is called after connecting.
         * @return {void}
         */
        function reactivateSubscriptions() {
            streamerObject.isConnected = true;
            if (streamerObject.quotes.hasSubscriptionsToBeActivated()) {
                streamerObject.quotes.activateSubscriptions();
            }
            if (streamerObject.news.isActivated) {
                streamerObject.news.activate();
            }
            if (streamerObject.orders.isActivated) {
                streamerObject.orders.activate();
            }
            startedCallback();
        }

        console.log("Starting streamer..");
        if (connection === null) {
            createConnection();
        }
        if (streamerObject.isConnected) {
            startedCallback();
        } else {
            connection.start().then(reactivateSubscriptions).catch(processError);
        }
    };

    /**
     * When a new token is granted, make sure the connection doesn't get a timeout, by calling this function with the new token.
     * @return {void}
     */
    this.extendSubscriptions = function () {

        /**
         * This function is called after subscription has been extended.
         * @return {void}
         */
        function logRefreshTime() {
            var currentTime = new Date();
            var oneHour = 1 * 60 * 60 * 1000;
            // Session is extended with 60 minutes
            currentTime.setTime(currentTime.getTime() + oneHour);
            console.log("Streamer subscription is extended to " + currentTime.toLocaleString());
        }

        console.log("Extending streamer subscription..");
        if (streamerObject.isConnected) {
            connection.invoke("ExtendSubscriptions", getSubscription().accessToken).then(logRefreshTime).catch(processError);
        } else {
            console.log("Streamer is not connected.");
        }
    };

    /**
     * Stop the connection.
     * @param {function()=} stoppedCallback When successful, this function is called.
     * @return {void}
     */
    this.stop = function (stoppedCallback) {

        /**
         * This function is called after stopping the connection.
         * @return {void}
         */
        function deActivateStreamerObjects() {
            console.log("Streamer stopped.");
            streamerObject.news.isActivated = false;
            streamerObject.orders.isActivated = false;
            streamerObject.isConnected = false;
            if (stoppedCallback !== undefined) {
                stoppedCallback();
            }
        }

        console.log("Stopping streamer..");
        if (connection !== null) {
            isApplicationClosing = true;
            connection.stop().then(deActivateStreamerObjects).catch(processError);
        }
    };

    /**
     * Callback to use the connection from elsewhere.
     * @return {Object} The connection established with the server.
     */
    function getConnection() {
        return connection;
    }

    streamerObject.news = new SubscriptionsForNews(getConnection, getSubscription, errorCallback);
    streamerObject.orders = new SubscriptionsForOrders(getConnection, getSubscription, errorCallback);
    streamerObject.quotes = new SubscriptionsForQuotes(getConnection, getSubscription, errorCallback);

    // Don't send the disconnect error when page is refreshed or browser navigates elsewhere
    window.addEventListener("beforeunload", function () {
        isApplicationClosing = true;
    });

}