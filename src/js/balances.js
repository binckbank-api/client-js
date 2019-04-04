/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * Loads the Accounts with the balances
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function Balances(requestCallback) {
    "use strict";

    /**
     * Load the balance of a single account.
     * @param {string} accountNumber The identifier of the account.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getBalance = function (accountNumber, successCallback, errorCallback) {
        console.log("Requesting balance..");
        requestCallback("GET", "accounts/" + accountNumber + "/balances", {}, successCallback, errorCallback);
    };

}
