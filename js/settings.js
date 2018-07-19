/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * The Settings of an account
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function Settings(requestCallback) {
    "use strict";

    /**
     * This function retrieves the funds in the portfolio of a customer.
     * @param {string} accountNumber The account to look for the portfolio.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getSettings = function (accountNumber, successCallback, errorCallback) {
        console.log("Requesting settings for account " + accountNumber + "..");
        requestCallback("GET", "accounts/" + accountNumber + "/settings", {}, successCallback, errorCallback);
    };

}
