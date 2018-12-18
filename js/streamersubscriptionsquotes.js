/*jslint this: true, browser: true, for: true, long: true */
/*global window $ alert console QuoteSubscriptionLevel */

/**
 * Subscription level enum
 * @readonly
 * @enum {string}
 */

var QuoteSubscriptionLevel = {
    TRADES: "Trades",  // Retrieve only the last, high, low, cumulative volume and open prices.
    TOPOFBOOK: "TopOfBook",  // In addition to trades, retrieve the bid1 and ask1 of the book.
    BOOK: "Book" // In addition to trades, retrieve the full book, if available.
};

/**
 * The quote subscriptions per instrument. This administration is important in case of a reconnect.
 *
 * @constructor
 * @param {function()} getConnection Retrieve the hub connection object
 * @param {function()} getSubscription Subscription, with account and access token
 * @param {function(string, string)} errorCallback Callback that will be called on an error situation
 */
function SubscriptionsForQuotes(getConnection, getSubscription, errorCallback) {
    "use strict";

    /** @type {Object} */
    var streamerQuotesObject = this;

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
     * @param {QuoteSubscriptionLevel} quoteSubscriptionLevel Subscribe only to trades, top of book, or to full book
     * @return {void}
     */
    this.push = function (instrumentId, quoteSubscriptionLevel) {
        var pos = findPosition(instrumentId);
        var subscription;
        var isNewSubscriptionRequestRequired = false;
        if (pos === -1) {
            // Add the object to the array
            console.log("Add instrument to subscriptions");
            subscriptions[subscriptions.length] = createSubscription(instrumentId, quoteSubscriptionLevel);
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
            isNewSubscriptionRequestRequired = changeSubscriptionCount(subscription, quoteSubscriptionLevel, 1) === 1;
        }
        if (isNewSubscriptionRequestRequired) {
            // There is no subscription yet, for this level
            instrumentsToSubscribe[instrumentsToSubscribe.length] = {
                "instrumentId": instrumentId,
                "subscriptionLevel": quoteSubscriptionLevel
            };
        }
    };

    /**
     * Remove an instrument from the list of subscriptions.
     * @param {string} instrumentId The instrument to remove
     * @param {QuoteSubscriptionLevel} quoteSubscriptionLevel The level for which the instrument must be unsubscribed
     * @return {void}
     */
    this.pop = function (instrumentId, quoteSubscriptionLevel) {
        var pos = findPosition(instrumentId);
        var subscription = subscriptions[pos];
        if (subscription.countLevelTrades + subscription.countLevelTopOfBook + subscription.countLevelBook === 1) {
            // Remove the subscription
            subscriptions.splice(pos, 1);
            instrumentsToUnsubscribe[instrumentsToUnsubscribe.length] = instrumentId;
        } else {
            // Decrease only the subscription count
            changeSubscriptionCount(subscription, quoteSubscriptionLevel, -1);
        }
    };

    function processError(error) {
        console.error(error);
        errorCallback("500", "Something went wrong with the connection to the quotes feed.");
    }

    /**
     * Activate the delayed subscriptions.
     * @return {void}
     */
    this.activateSubscriptions = function () {
        var accountNumber = getSubscription().activeAccountNumber;

        function activateQuotes(subscriptionResponse) {
            if (subscriptionResponse.isSucceeded) {
                console.log("Quote subscribe succeeded, number of subscribed instruments is now: " + subscriptionResponse.subcount);
            } else {
                console.log("Something went wrong. Is the accountNumber valid?");
            }
        }

        function processSubscribeForLevel(quoteSubscriptionLevel) {
            var instrumentIds = [];
            var i;
            for (i = 0; i < instrumentsToSubscribe.length; i += 1) {
                if (instrumentsToSubscribe[i].subscriptionLevel === quoteSubscriptionLevel) {
                    instrumentIds[instrumentIds.length] = instrumentsToSubscribe[i].instrumentId;
                }
            }
            if (instrumentIds.length > 0) {
                getConnection().invoke("SubscribeQuotes", accountNumber, instrumentIds, quoteSubscriptionLevel).then(activateQuotes).catch(processError);
            }
        }

        function deActivateQuotes(subscriptionResponse) {
            if (subscriptionResponse.isSucceeded) {
                console.log("Quote unsubscribe succeeded, number of subscribed instruments is now: " + subscriptionResponse.subcount);
            } else {
                // Internal issue - should never occur
                console.log("Quote unsubscribe failed");
            }
        }

        function processUnsubscribe() {
            if (instrumentsToUnsubscribe.length > 0) {
                getConnection().invoke("UnSubscribeQuotes", instrumentsToUnsubscribe).then(deActivateQuotes).catch(processError);
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

    /**
     * Add a list of instruments to the feed.
     * @param {Array<string>} instrumentIds The instruments for subscription
     * @param {QuoteSubscriptionLevel} quoteSubscriptionLevel Max level of quotes to receive back
     * @return {void}
     */
    this.addInstruments = function (instrumentIds, quoteSubscriptionLevel) {
        var i;
        for (i = 0; i < instrumentIds.length; i += 1) {
            streamerQuotesObject.push(instrumentIds[i], quoteSubscriptionLevel);
        }
        console.log("Instrument(s) queued for subscription: " + instrumentIds.join(", ") + " (level " + quoteSubscriptionLevel + ").");
    };

    /**
     * Remove a list of instruments from the feed.
     * @param {Array<string>} instrumentIds The instruments for subscription
     * @param {QuoteSubscriptionLevel} quoteSubscriptionLevel Max level of quotes to receive back
     * @return {void}
     */
    this.deleteInstruments = function (instrumentIds, quoteSubscriptionLevel) {
        var i;
        for (i = 0; i < instrumentIds.length; i += 1) {
            streamerQuotesObject.pop(instrumentIds[i], quoteSubscriptionLevel);
        }
        console.log("Instrument(s) queued for deletion: " + instrumentIds.join(", ") + " (level " + quoteSubscriptionLevel + ").");
    };
}
