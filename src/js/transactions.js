/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * The Transactions
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function Transactions(requestCallback) {
    "use strict";

    /**
     * This function retrieves all the pending orders.
     * @param {string} accountNumber The account to display the transactions for.
     * @param {string} fromDate The start date (YYYY-MM-DD). No start if empty.
     * @param {string} toDate The end date (YYYY-MM-DD). No end date if empty.
     * @param {string} mutationGroup Valid values are buyAndSell, cost, couponPayment, dividendPayment, interestPayment, moneyTransfer, or positionMutation. All mutations if empty.
     * @param {string} currency 3-letter currency code (ISO 4217). All currencies if empty.
     * @param {string} range Use paging (0-19), or leave empty.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getTransactions = function (accountNumber, fromDate, toDate, mutationGroup, currency, range, successCallback, errorCallback) {
        console.log("Requesting transactions for account " + accountNumber + "..");
        requestCallback(
            "GET",
            "accounts/" + accountNumber + "/transactions?range=" + range + "&fromDate=" + fromDate + "&toDate=" + toDate + "&mutationGroup=" + mutationGroup + "&currency=" + currency,
            {},
            successCallback,
            errorCallback
        );
    };

}
