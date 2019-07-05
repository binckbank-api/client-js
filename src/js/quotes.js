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
     * Load trade or book prices for a list of instruments - if level in "none", only the subscriptions are retrieved
     * @param {string} accountNumber The identifier of the account.
     * @param {Array<string>} instrumentIds The identifier of the instrument(s).
     * @param {string} level Get full book (bid1-bid5 and ask1-ask5) with "tradesBidAsk", or only trades (last, high, low, etc) with "tradesOnly". Can be "none" to get subscriptions.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getLatestQuotes = function (accountNumber, instrumentIds, level, successCallback, errorCallback) {
        console.log("Requesting quotes for instrument " + instrumentIds.join(" and ") + "..");
        requestCallback("GET", "quotes", {
            "accountNumber": accountNumber,
            "level": level,
            "instrumentIds": instrumentIds.join()
        }, successCallback, errorCallback);
    };

    /**
     * Load historical quotes for an instrument, in intervals - each of the intervals have different period max. lengths
     * @param {string} accountNumber The identifier of the account.
     * @param {string} instrumentId The identifier of the instrument.
     * @param {Date} fromDateTime The date of the first quotes. Can be today.
     * @param {null|Date} toDateTime The date of the last quotes. Can be today.
     * @param {string} interval The frequency of the quotes (OneMinute, FiveMinutes, TenMinutes, FifteenMinutes, OneHour, OneDay, OneWeek, OneMonth), to save bandwidth.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getHistoricalQuotes = function (accountNumber, instrumentId, fromDateTime, toDateTime, interval, successCallback, errorCallback) {
        var data = {
            "accountNumber": accountNumber,
            "fromDateTime": fromDateTime.toJSON(),
            "interval": interval
        };
        console.log("Requesting historical quotes for instrument " + instrumentId + "..");
        if (toDateTime !== null) {
            data.toDateTime = toDateTime.toJSON();
        }
        requestCallback("GET", "quotes/" + instrumentId + "/history", data, successCallback, errorCallback);
    };

}
