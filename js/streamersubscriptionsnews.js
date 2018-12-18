/*jslint this: true, browser: true, for: true, long: true */
/*global window $ alert console */

/**
 * The news subscriptions.
 *
 * @constructor
 * @param {function()} getConnection Retrieve the hub connection object
 * @param {function()} getSubscription Subscription, with account and access token
 * @param {function(string, string)} errorCallback Callback that will be called on an error situation
 */
function SubscriptionsForNews(getConnection, getSubscription, errorCallback) {
    "use strict";

    /** @type {boolean} */
    this.isActive = false;
    /** @type {Object} */
    var streamerNewsObject = this;

    function processError(error) {
        console.error(error);
        errorCallback("500", "Something went wrong with the connection to the news feed.");
    }

    /**
     * Activates the news feed for the active account number
     * @return {void}
     */
    this.activate = function () {

        function activateNews(subscriptionResponse) {
            if (subscriptionResponse.isSucceeded) {
                streamerNewsObject.isActive = true;
                console.log("Subscribed to news feed.");
            } else {
                console.log("Something went wrong. Is the accountNumber valid?");
            }
        }

        var accountNumber = getSubscription().activeAccountNumber;
        console.log("Subscribe to news feed with account " + accountNumber);
        getConnection().invoke("SubscribeNews", accountNumber).then(activateNews).catch(processError);
    };

    /**
     * Deactivates the news feed
     * @return {void}
     */
    this.deActivate = function () {

        function deActivateNews() {
            streamerNewsObject.isActive = false;
            console.log("Unsubscribed to the news feed.");
        }

        console.log("De-activating realtime news");
        getConnection().invoke("UnSubscribeNews").then(deActivateNews).catch(processError);
    };

}
