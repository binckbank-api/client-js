/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * Loads the prices for one or more instruments
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function Quotes(requestCallback) {
    "use strict";

    /**
     * Load trade or book prices for a list of instruments
     * @param {string} accountNumber The identifier of the account.
     * @param {Array<string>} instrumentIds The identifiers of the instrument.
     * @param {string} level Get full book (bid1-bid5 and ask1-ask5), or only trades (last, high, low, etc).
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getQuotes = function (accountNumber, instrumentIds, level, successCallback, errorCallback) {
        console.log("Requesting quotes for instrument " + instrumentIds.join(" and ") + "..");
        requestCallback("GET", "quotes", {
            "accountNumber": accountNumber,
            "level": level,
            "instrumentIds": instrumentIds.join()
        }, successCallback, errorCallback);
    };

}
