/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * The Accounts
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function Accounts(requestCallback) {
    "use strict";

    /**
     * Load all the accounts for a relation.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getAccounts = function (successCallback, errorCallback) {
        console.log("Requesting accounts..");
        requestCallback("GET", "accounts", {}, successCallback, errorCallback);
    };

    /**
     * Load the details of a single account.
     * @param {string} accountNumber The identifier of the account.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getAccount = function (accountNumber, successCallback, errorCallback) {
        console.log("Requesting account " + accountNumber + "..");
        requestCallback("GET", "accounts/" + accountNumber, {}, successCallback, errorCallback);
    };
}
