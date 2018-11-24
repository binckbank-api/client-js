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
 * @param {function(Object)} newsCallback Callback to be called when news is received
 * @param {function(Object)} orderExecutionsCallback Callback to be called when an order execution is received
 * @param {function(Object)} orderModificationsCallback Callback to be called when an order modification is received
 * @param {function(Object)} orderEventsCallback Callback to be called when an order update is received
 * @param {function(string, string)} errorCallback Callback that will be called on an error situation
 */
function Streamer(getConfiguration, getSubscription, quoteCallback, newsCallback, orderExecutionsCallback, orderModificationsCallback, orderEventsCallback, errorCallback) {
    "use strict";

    /** @type {Object} */
    var streamerObject = this;
    /** @type {Object} */
    var connection = null;
    /** @type {boolean} */
    this.isConnected = false;
    /** @type {boolean} */
    this.isNewsActivated = false;
    /** @type {boolean} */
    this.isOrdersActivated = false;
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
        .withUrl(getConfiguration().streamerUrl, options)
        .configureLogging(signalR.LogLevel.Information)  // Might be 'Trace' for testing
        .build();
        // Do something with an incoming quote:
        connection.on("Quote", quoteCallback);
        // Do something with incoming news:
        connection.on("News", newsCallback);
        // Do something with incoming order executions:
        connection.on("OrderExecution", orderExecutionsCallback);
        // Do something with incoming order modifications:
        connection.on("OrderModified", orderModificationsCallback);
        // Do something with incoming order status changes:
        connection.on("OrderStatus", orderEventsCallback);
        // More in the future, like "order" and "transaction"
        connection.onclose(function () {
            console.log("The connection has been closed.");
            streamerObject.isConnected = false;
            errorCallback("disconnected", "The streamer connection has been closed.");
        });
    }

    /**
     * Start the connection. Can be used to re-start after a disconnect.
     * @param {function()} startedCallback When successful, this function is called.
     * @return {void}
     */
    this.start = function (startedCallback) {
        console.log("Starting streamer..");
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
                if (streamerObject.isNewsActivated) {
                    streamerObject.activateNews();
                }
                if (streamerObject.isOrdersActivated) {
                    streamerObject.activateOrders();
                }
                startedCallback();
            })
            .catch(function (error) {
                console.error(error);
                if ($.trim(error.message) !== "") {
                    errorCallback("404", error.message);
                } else {
                    errorCallback("404", "Something went wrong creating a connection. Is the streamer endpoint configured on " + getConfiguration().streamerUrl + "?");
                }
            });
        }
    };

    /**
     * When a new token is granted, make sure the connection doesn't get a timeout, by calling this function with the new token.
     * @return {void}
     */
    this.extendSubscriptions = function () {
        console.log("Extending streamer subscription..");
        if (streamerObject.isConnected) {
            connection.invoke("ExtendSubscriptions", getSubscription().accessToken)
            .then(function () {
                var currentTime = new Date();
                // Session is extended with 60 minutes
                currentTime.setTime(currentTime.getTime() + (1 * 60 * 60 * 1000));
                console.log("Subscriptions are extended to " + currentTime.toLocaleString());
            })
            .catch(function (error) {
                console.error(error);
                if (error.message !== "") {
                    errorCallback("500", error.message);
                } else {
                    errorCallback("500", "Something went wrong stopping the connection.");
                }
            });
        } else {
            console.log("Streamer is not connected.");
        }
    };

    /**
     * Stop the connection.
     * @return {void}
     */
    this.stop = function () {
        console.log("Stopping streamer..");
        if (connection !== null) {
            connection.stop()
            .then(function () {
                console.log("Streamer stopped.");
                streamerObject.isNewsActivated = false;
                streamerObject.isOrdersActivated = false;
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
        }
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

    /**
     * Activates the news feed
     * @return {void}
     */
    this.activateNews = function () {
        var accountNumber = getSubscription().activeAccountNumber;
        if (streamerObject.isConnected === false) {
            console.log("Start the connection first, before starting the news feed.");
            return;
        }
        console.log("Subscribe to news feed with account " + accountNumber);
        connection.invoke("SubscribeNews", accountNumber)
        .then(function (subscriptionResponse) {
            if (subscriptionResponse.isSucceeded) {
                streamerObject.isNewsActivated = true;
                console.log("Subscribe to the news feed succeeded.");
            } else {
                console.log("Something went wrong with the subscription. Probably the accoumntNumber is not valid.");
            }
        })
        .catch(function (error) {
            console.error(error);
            errorCallback("500", "Something went wrong subscribing to the news feed.");
        });
    };

    /**
     * Deactivates the news feed
     * @return {void}
     */
    this.deActivateNews = function () {
        console.log("De-activating realtime news");
        connection.invoke("UnSubscribeNews")
        .then(function () {
            streamerObject.isNewsActivated = false;
            console.log("Unsubscribe to the news feed succeeded.");
        })
        .catch(function (error) {
            console.error(error);
            errorCallback("500", "Something went wrong unsubscribing the news feed.");
        });
    };

    /**
     * Activates the order updates feed
     * @return {void}
     */
    this.activateOrders = function () {
        var accountNumber = getSubscription().activeAccountNumber;
        if (streamerObject.isConnected === false) {
            console.log("Start the connection first, before starting the order updates feed.");
            return;
        }
        console.log("Subscribe to order updates feed with account " + accountNumber);
        connection.invoke("SubscribeOrders", accountNumber)
        .then(function (subscriptionResponse) {
            if (subscriptionResponse.isSucceeded) {
                streamerObject.isOrdersActivated = true;
                console.log("Subscribe to the order updates feed succeeded.");
            } else {
                console.log("Something went wrong with the subscription. Probably the accoumntNumber is not valid.");
            }
        })
        .catch(function (error) {
            console.error(error);
            errorCallback("500", "Something went wrong subscribing to the order updates feed.");
        });
    };

    /**
     * Deactivates the order updates feed
     * @return {void}
     */
    this.deActivateOrders = function () {
        console.log("De-activating the realtime order updates");
        connection.invoke("UnSubscribeOrders")
        .then(function () {
            streamerObject.isOrdersActivated = false;
            console.log("Unsubscribe to the order updates feed succeeded.");
        })
        .catch(function (error) {
            console.error(error);
            errorCallback("500", "Something went wrong unsubscribing the order updates feed.");
        });
    };
}