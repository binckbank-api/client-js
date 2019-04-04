/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * The news
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function News(requestCallback) {
    "use strict";

    /**
     * This function retrieves news for one or more instruments.
     * @param {string} accountNumber The account to look for the portfolio.
     * @param {string} instrumentIds The instrument ids. Comma separated. Can be empty.
     * @param {string} range Use paging (0-19), or leave empty.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getNews = function (accountNumber, instrumentIds, range, successCallback, errorCallback) {
        var queryParameters = {
            "accountNumber": accountNumber,
            "instrumentIds": instrumentIds,
            "range": range
        };
        var fromDate = new Date();
        if (instrumentIds === "") {
            // Get news of last three days max.
            fromDate.setDate(fromDate.getDate() - 3);
        } else {
            // Get news of the last three week max.
            fromDate.setDate(fromDate.getDate() - 3 * 7);
        }
        // convert to JSON and remove quotes
        queryParameters.fromDate = JSON.stringify(fromDate).slice(1, -1);
        console.log("Requesting news for account " + accountNumber + "..");
        requestCallback("GET", "news", queryParameters, successCallback, errorCallback);
    };
}
