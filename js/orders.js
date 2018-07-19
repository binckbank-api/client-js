/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * The Orders
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function Orders(requestCallback) {
    "use strict";

    /**
     * This function retrieves a list of orders.
     * @param {string} accountNumber The account to display the orders for.
     * @param {string} status 'all', 'open', 'executed', 'canceled'.
     * @param {string} range Use paging (0-19), or leave empty.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getOrders = function (accountNumber, status, range, successCallback, errorCallback) {
        console.log("Requesting orders for account " + accountNumber + "..");
        requestCallback("GET", "accounts/" + accountNumber + "/orders?range=" + range + "&status=" + status, {}, successCallback, errorCallback);
    };

    /**
     * Load the details of a single order.
     * @param {string} accountNumber The identifier of the account.
     * @param {number} orderNumber The identifier of the order.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getOrder = function (accountNumber, orderNumber, successCallback, errorCallback) {
        console.log("Requesting account " + accountNumber + "..");
        requestCallback("GET", "accounts/" + accountNumber + "/orders/" + orderNumber, {}, successCallback, errorCallback);
    };

    /**
     * This function is used to validate an order, before actually sending it to Binck.
     * @param {string} accountNumber The account to display the orders for.
     * @param {Object} orderObject The order object.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.validateNewOrder = function (accountNumber, orderObject, successCallback, errorCallback) {
        console.log("Validate order for account " + accountNumber + "..");
        requestCallback("POST", "accounts/" + accountNumber + "/orders/preview", orderObject, successCallback, errorCallback);
    };

    /**
     * This function is used to send an order to the system.
     * @param {string} accountNumber The account to display the orders for.
     * @param {Object} orderObject The order object.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.placeOrder = function (accountNumber, orderObject, successCallback, errorCallback) {
        console.log("Place order for account " + accountNumber + "..");
        requestCallback("POST", "accounts/" + accountNumber + "/orders", orderObject, successCallback, errorCallback);
    };

    /**
     * This function is used to validate an order modification, before actually sending it to Binck.
     * @param {string} accountNumber The account to display the orders for.
     * @param {Object} orderObject The order object.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.validateModifyOrder = function (accountNumber, orderObject, successCallback, errorCallback) {
        console.log("Validate order modification " + orderObject.orderNumber + " for account " + accountNumber + "..");
        requestCallback("POST", "accounts/" + accountNumber + "/orders/" + orderObject.orderNumber + "/preview", orderObject, successCallback, errorCallback);
    };

    /**
     * This function is used to modify an active order.
     * @param {string} accountNumber The account to display the orders for.
     * @param {Object} orderObject The order object.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.modifyOrder = function (accountNumber, orderObject, successCallback, errorCallback) {
        console.log("Modify order for account " + accountNumber + "..");
        requestCallback("PATCH", "accounts/" + accountNumber + "/orders/" + orderObject.orderNumber, orderObject, successCallback, errorCallback);
    };

    /**
     * This function cancels an order, if not executed.
     * @param {string} accountNumber The account to display the orders for.
     * @param {number} orderNumber The order identification.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.cancelOrder = function (accountNumber, orderNumber, successCallback, errorCallback) {
        console.log("Cancel order " + orderNumber + " for account " + accountNumber + "..");
        requestCallback("DELETE", "accounts/" + accountNumber + "/orders/" + orderNumber, {}, successCallback, errorCallback);
    };
}
