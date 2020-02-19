/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * The Positions of an account
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function Positions(requestCallback) {
    "use strict";

    /**
     * This function retrieves the funds in the portfolio of a customer.
     * @param {string} accountNumber The account to look for the portfolio.
     * @param {string} range Use paging (0-19), or leave empty.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getPositions = function (accountNumber, range, successCallback, errorCallback) {
        var data = {
            "range": range
        };
        console.log("Requesting positions for account " + accountNumber + "..");
        requestCallback("GET", "accounts/" + accountNumber + "/positions", data, successCallback, errorCallback);
    };

    /**
     * Load the details of a single position.
     * @param {string} accountNumber The identifier of the account.
     * @param {string} instrumentId The identifier of the instrument.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getPosition = function (accountNumber, instrumentId, successCallback, errorCallback) {
        console.log("Requesting position " + instrumentId + " for account " + accountNumber + "..");
        requestCallback("GET", "accounts/" + accountNumber + "/positions/" + instrumentId, {}, successCallback, errorCallback);
    };
}
