/*jslint this: true, browser: true, for: true, long: true */
/*global window $ alert console */

/**
 * The orders subscriptions.
 *
 * @constructor
 * @param {Object} connection The connection with the server
 * @param {function()} getSubscription Subscription, with account and access token
 * @param {function(string, string)} errorCallback Callback that will be called on an error situation
 */
function SubscriptionsForOrders(connection, getSubscription, errorCallback) {
    "use strict";

    /** @type {boolean} */
    this.isActive = false;
    /** @type {Object} */
    var streamerOrdersObject = this;

    function processError(error) {
        console.error(error);
        errorCallback("500", "Something went wrong with the connection to the orders feed.");
    }

    /**
     * Activates the order events feed (combined for events, modifications and executions) for the active account number
     * @return {void}
     */
    this.activate = function () {

        function activateOrders(subscriptionResponse) {
            if (subscriptionResponse.isSucceeded) {
                streamerOrdersObject.isActive = true;
                console.log("Subscribed to the order updates feed.");
            } else {
                console.log("Something went wrong. Is the accountNumber valid?");
            }
        }

        var accountNumber = getSubscription().activeAccountNumber;
        console.log("Subscribe to order updates feed with account " + accountNumber);
        connection.invoke("SubscribeOrders", accountNumber).then(activateOrders).catch(processError);
    };

    /**
     * Deactivates the order events feed
     * @return {void}
     */
    this.deActivate = function () {

        function deActivateOrders() {
            streamerOrdersObject.isActive = false;
            console.log("Unsubscribed to the order updates feed.");
        }

        console.log("De-activating the realtime order updates");
        connection.invoke("UnSubscribeOrders").then(deActivateOrders).catch(processError);
    };

}
