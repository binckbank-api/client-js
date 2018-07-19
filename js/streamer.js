/*jslint this: true, browser: true, for: true, long: true */
/*global window $ console signalR, SubscriptionsForQuotes */

/**
 * Subscription level enum
 * @readonly
 * @enum {string}
 */
var QuoteSubscriptionLevel = {
    TRADES: "Trades",
    TOPOFBOOK: "TopOfBook",
    BOOK: "Book"
};

/**
 * The Streamer wrapper to connect with Binck for quotes, news and order events
 *
 * Documentation:
 * https://docs.microsoft.com/en-us/aspnet/core/signalr/javascript-client?view=aspnetcore-2.1
 *
 * Examples:
 * https://github.com/aspnet/SignalR/blob/dev/samples/SignalRSamples/wwwroot/hubs.html
 *
 * @constructor
 * @param {function()} getConfiguration Connection configuration
 * @param {function()} getSubscription Subscription, with account and access token
 * @param {function(Object)} quoteCallback Callback to be called when a quote is received
 * @param {function(string, string)} errorCallback Callback that will be called on an error situation
 */
function Streamer(getConfiguration, getSubscription, quoteCallback, errorCallback) {
    "use strict";

    /** @type {Object} */
    var streamerObject = this;
    /** @type {Object} */
    var connection = null;
    /** @type {boolean} */
    this.isConnected = false;

    var subscriptionsForQuotes = new SubscriptionsForQuotes();

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
                return accessToken;
            }
        };
        connection = new signalR.HubConnectionBuilder()
            .withUrl(getConfiguration().streamingQuotesUrl, options)
            .configureLogging(signalR.LogLevel.Information)  // Might be 'Trace' for testing
            .build();
        // Do something with an incoming quote:
        connection.on("Quote", quoteCallback);
        // More in the future, like "news", "order", "position"
        connection.onclose(function () {
            console.log("The connection has been closed.");
            streamerObject.isConnected = false;
            errorCallback("disconnected", "The connection has been closed.");
        });
    }

    /**
     * Start the connection.
     * @param {function()} startedCallback When successful, this function is called.
     * @return {void}
     */
    this.start = function (startedCallback) {
        console.log("Starting");
        if (connection === null) {
            createConnection();
        }
        if (streamerObject.isConnected) {
            startedCallback();
        } else {
            connection.start()
                .then(function () {
                    streamerObject.isConnected = true;
                    if (subscriptionsForQuotes.hasSubscriptionsToBeActivated()) {
                        streamerObject.activateSubscriptions();
                    }
                    startedCallback();
                })
                .catch(function (error) {
                    console.error(error);
                    if ($.trim(error.message) !== "") {
                        errorCallback("404", error.message);
                    } else {
                        errorCallback("404", "Something went wrong creating a connection. Is quotes endpoint configured on " + getConfiguration().streamingQuotesUrl + "?");
                    }
                });
        }
    };

    /**
     * Stop the connection.
     * @return {void}
     */
    this.stop = function () {
        console.log("Stopping");
        connection.stop()
            .then(function () {
                streamerObject.isConnected = false;
            })
            .catch(function (error) {
                console.error(error);
                if (error.message !== "") {
                    errorCallback("500", error.message);
                } else {
                    errorCallback("500", "Something went wrong stopping the connection.");
                }
            });
    };

    /**
     * Add a list of instruments to the feed.
     * @param {Array<string>} instrumentIds The instruments for subscription
     * @param {QuoteSubscriptionLevel} subscriptionLevel Max level of quotes to receive back
     * @return {void}
     */
    this.addInstruments = function (instrumentIds, subscriptionLevel) {
        var i;
        for (i = 0; i < instrumentIds.length; i += 1) {
            subscriptionsForQuotes.push(instrumentIds[i], subscriptionLevel);
        }
        console.log("Instrument(s) queued for subscription: " + instrumentIds.join(", ") + " (level " + subscriptionLevel + ").");
    };

    /**
     * Remove a list of instruments from the feed.
     * @param {Array<string>} instrumentIds The instruments for subscription
     * @param {QuoteSubscriptionLevel} subscriptionLevel Max level of quotes to receive back
     * @return {void}
     */
    this.deleteInstruments = function (instrumentIds, subscriptionLevel) {
        var i;
        for (i = 0; i < instrumentIds.length; i += 1) {
            subscriptionsForQuotes.pop(instrumentIds[i], subscriptionLevel);
        }
        console.log("Instrument(s) queued for deletion: " + instrumentIds.join(", ") + " (level " + subscriptionLevel + ").");
    };

    /**
     * Activates the delayed subscriptions with the server
     * @return {void}
     */
    this.activateSubscriptions = function () {
        if (streamerObject.isConnected === false) {
            console.log("Start the connection first, before adding instruments.");
            return;
        }
        subscriptionsForQuotes.processQueue(connection, getSubscription().activeAccountNumber, errorCallback);
    };

}