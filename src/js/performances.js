/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * The performance for an account
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function Performances(requestCallback) {
    "use strict";

    /**
     * Load the performance of an account.
     * @param {string} accountNumber The identifier of the account.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getPerformanceOverview = function (accountNumber, successCallback, errorCallback) {
        console.log("Requesting performance for account " + accountNumber + "..");
        requestCallback("GET", "accounts/" + accountNumber + "/performances", {}, successCallback, errorCallback);
    };

    /**
     * Load the performance of an account for a specific year.
     * @param {string} accountNumber The identifier of the account.
     * @param {number} year The year as 4 digit number (2016).
     * @param {boolean} isPerPositionRequired Get by individual derivative position, or grouped by underlying value.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getPerformanceForYear = function (accountNumber, year, isPerPositionRequired, successCallback, errorCallback) {
        console.log("Requesting performance " + year + " for account " + accountNumber + "..");
        var data = {
            "onPosition": isPerPositionRequired
        };
        requestCallback("GET", "accounts/" + accountNumber + "/performances/" + year, data, successCallback, errorCallback);
    };
}
