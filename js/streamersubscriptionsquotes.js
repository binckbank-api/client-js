/*jslint this: true, browser: true, for: true, long: true */
/*global window $ alert console QuoteSubscriptionLevel */

/**
 * The subscriptions per instrument. This administration is important in case of a reconnect.
 *
 * @constructor
 */
function SubscriptionsForQuotes() {
    "use strict";

    /**
     * An array of instruments with subscriptionLevel and number of appearances
     * @type {Array<Object>}
     */
    var subscriptions = [];

    /**
     * An array of instruments that need to be subscribed
     * @type {Array<{instrumentId: string, subscriptionLevel: QuoteSubscriptionLevel}>}
     */
    var instrumentsToSubscribe = [];

    /**
     * An array of instruments that need to be unsubscribed
     * @type {Array<string>}
     */
    var instrumentsToUnsubscribe = [];

    /**
     * Finds the instrument in the array. If not found, -1 is returned.
     * @param {string} instrumentId The instrument to find
     * @return {number} Position in subscription. If not found: -1
     */
    function findPosition(instrumentId) {
        var i;
        for (i = 0; i < subscriptions.length; i += 1) {
            if (subscriptions[i].instrumentId === instrumentId) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Increment or decrement the subscription count with one.
     * @param {Object} subscription The subscription to modify
     * @param {QuoteSubscriptionLevel} subscriptionLevel Level to increment
     * @param {number} incrementation Increment with 1, or -1?
     * @return {number} Number of active subscriptions
     */
    function changeSubscriptionCount(subscription, subscriptionLevel, incrementation) {
        switch (subscriptionLevel) {
        case QuoteSubscriptionLevel.TRADES:
            subscription.countLevelTrades += incrementation;
            return subscription.countLevelTrades;
        case QuoteSubscriptionLevel.TOPOFBOOK:
            subscription.countLevelTopOfBook += incrementation;
            return subscription.countLevelTopOfBook;
        case QuoteSubscriptionLevel.BOOK:
            subscription.countLevelBook += incrementation;
            return subscription.countLevelBook;
        default:
            throw "Invalid subscription level.";
        }
    }

    /**
     * Create a new subscription.
     * @param {string} instrumentId The instrument to add
     * @param {QuoteSubscriptionLevel} subscriptionLevel Count
     * @return {Object} Object with active subscriptions
     */
    function createSubscription(instrumentId, subscriptionLevel) {
        var subscription = {
            "instrumentId": instrumentId,
            "countLevelTrades": 0,
            "countLevelTopOfBook": 0,
            "countLevelBook": 0
        };
        changeSubscriptionCount(subscription, subscriptionLevel, 1);
        return subscription;
    }

    /**
     * Add an instrument to the list of subscriptions.
     * @param {string} instrumentId The instrument to add
     * @param {QuoteSubscriptionLevel} subscriptionLevel Subscribe only to trades, top of book, or to full book
     * @return {void}
     */
    this.push = function (instrumentId, subscriptionLevel) {
        var pos = findPosition(instrumentId);
        var subscription;
        var isNewSubscriptionRequestRequired = false;
        if (pos === -1) {
            // Add the object to the array
            console.log("Add instrument to subscriptions");
            subscriptions[subscriptions.length] = createSubscription(instrumentId, subscriptionLevel);
            // Check if this instrument is queued for deletion. If so, remove it from that list:
            pos = $.inArray(instrumentId, instrumentsToUnsubscribe);
            if (pos !== -1) {
                instrumentsToUnsubscribe.splice(pos, 1);
                console.log("Removing instrument from queue pending for deletion: " + instrumentId);
            }
            isNewSubscriptionRequestRequired = true;
        } else {
            // Increment subscription count for instrument
            console.log("Increment subscription count for instrument");
            subscription = subscriptions[pos];
            isNewSubscriptionRequestRequired = changeSubscriptionCount(subscription, subscriptionLevel, 1) === 1;
        }
        if (isNewSubscriptionRequestRequired) {
            // There is no subscription yet, for this level
            instrumentsToSubscribe[instrumentsToSubscribe.length] = {
                "instrumentId": instrumentId,
                "subscriptionLevel": subscriptionLevel
            };
        }
    };

    /**
     * Remove an instrument from the list of subscriptions.
     * @param {string} instrumentId The instrument to remove
     * @param {QuoteSubscriptionLevel} subscriptionLevel The level for which the instrument must be unsubscribed
     * @return {void}
     */
    this.pop = function (instrumentId, subscriptionLevel) {
        var pos = findPosition(instrumentId);
        var subscription = subscriptions[pos];
        if (subscription.countLevelTrades + subscription.countLevelTopOfBook + subscription.countLevelBook === 1) {
            // Remove the subscription
            subscriptions.splice(pos, 1);
            instrumentsToUnsubscribe[instrumentsToUnsubscribe.length] = instrumentId;
        } else {
            // Decrease only the subscription count
            changeSubscriptionCount(subscription, subscriptionLevel, -1);
        }
    };

    /**
     * Activate the delayed subscriptions.
     * @param {Object} connection The connection with the server
     * @param {string} accountNumber Account number for which the subscription is activated
     * @param {function(string, string)} errorCallback Callback that will be called on an error situation
     * @return {void}
     */
    this.processQueue = function (connection, accountNumber, errorCallback) {

        function processSubscribeForLevel(subscriptionLevel) {
            var instrumentIds = [];
            var i;
            for (i = 0; i < instrumentsToSubscribe.length; i += 1) {
                if (instrumentsToSubscribe[i].subscriptionLevel === subscriptionLevel) {
                    instrumentIds[instrumentIds.length] = instrumentsToSubscribe[i].instrumentId;
                }
            }
            if (instrumentIds.length > 0) {
                connection.invoke("SubscribeQuotes", accountNumber, instrumentIds, subscriptionLevel)
                .then(function (result) {
                    if (result.success) {
                        console.log("Quote subscribe succeeded, number of subscribed instruments is now: " + result.subcount);
                    } else {
                        console.log("Quote subscribe failed");
                    }
                })
                .catch(function (error) {
                    console.error(error);
                    errorCallback("500", "Something went wrong subscribing to instrument(s): " + instrumentIds.join(", ") + ".");
                });
                console.log("Instrument(s) " + instrumentIds.join(", ") + " subscribed.");
            }
        }

        function processUnsubscribe() {
            if (instrumentsToUnsubscribe.length > 0) {
                connection.invoke("UnSubscribeQuotes", instrumentsToUnsubscribe)
                .then(function (result) {
                    if (result.success) {
                        console.log("Quote unsubscribe succeeded, number of subscribed instruments is now: " + result.subcount);
                    } else {
                        console.log("Quote unsubscribe failed");
                    }
                })
                .catch(function (error) {
                    console.error(error);
                    errorCallback("500", "Something went wrong when deleting the subscription to instrument(s): " + instrumentsToUnsubscribe.join(", ") + ".");
                });
                console.log("Instrument(s) " + instrumentsToUnsubscribe.join(", ") + " deleted.");
            }
        }

        processSubscribeForLevel(QuoteSubscriptionLevel.TRADES);
        processSubscribeForLevel(QuoteSubscriptionLevel.TOPOFBOOK);
        processSubscribeForLevel(QuoteSubscriptionLevel.BOOK);
        instrumentsToSubscribe = [];
        processUnsubscribe();
        instrumentsToUnsubscribe = [];
    };

    /**
     * If connection was disconnected, subscriptions must be activated again.
     * @return {boolean} Yes, if there are subscriptions to be activated again
     */
    this.hasSubscriptionsToBeActivated = function () {
        var i;
        var subscription;
        var subscriptionObject;
        if (subscriptions.length > 0) {
            // This is a reconnect. Reactivate the subscriptions.
            for (i = 0; i < subscriptions.length; i += 1) {
                subscription = subscriptions[i];
                subscriptionObject = {
                    "instrumentId": subscription.instrumentId,
                    "subscriptionLevel": QuoteSubscriptionLevel.TRADES
                };
                if (subscription.countLevelBook > 0) {
                    subscriptionObject.subscriptionLevel = QuoteSubscriptionLevel.BOOK;
                } else if (subscription.countLevelTopOfBook > 0) {
                    subscriptionObject.subscriptionLevel = QuoteSubscriptionLevel.TOPOFBOOK;
                }
                instrumentsToSubscribe[instrumentsToSubscribe.length] = subscriptionObject;
            }
        }
        return instrumentsToSubscribe.length > 0;
    };
}
