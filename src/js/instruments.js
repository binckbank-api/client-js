/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * The Instruments
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 * @param {function(string, string, Object, function((Object|null|string)), function(string))} requestCallbackDownload The callback for a generic way to download a document with the API.
 */
function Instruments(requestCallback, requestCallbackDownload) {
    "use strict";

    /**
     * This function loads all the instruments in a group.
     * @param {string} instrumentListId The identifier of the list.
     * @param {string} accountNumber The account number.
     * @param {null|string} range The range to be requested.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getInstrumentList = function (instrumentListId, accountNumber, range, successCallback, errorCallback) {
        var data = {
            "accountNumber": accountNumber
        };
        if (range !== null) {
            data.range = range;
        }
        console.log("Requesting instrument list " + instrumentListId + "..");
        requestCallback("GET", "instruments/lists/" + instrumentListId, data, successCallback, errorCallback);
    };

    /**
     * This function loads a filtered list of leveraged products.
     * @param {string} category The leveraged products category.
     * @param {string} publisher The publisher. Default no filter (all).
     * @param {string} longShort Filter list on long or short. Default no filter (all).
     * @param {string} type Filter list on type. Default no filter (all).
     * @param {string} stopLossRange The range of the stoploss level.
     * @param {string} accountNumber The account number.
     * @param {null|string} range The range to be requested.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getLeveragedProducts = function (category, publisher, longShort, type, stopLossRange, accountNumber, range, successCallback, errorCallback) {
        var data = {
            "stopLossRange": stopLossRange,
            "accountNumber": accountNumber
        };
        if (category !== "indices") {
            data.category = category;
        }
        if (publisher !== "all") {
            data.publisher = publisher;
        }
        if (longShort !== "all") {
            data.longShort = longShort;
        }
        if (type !== "all") {
            data.type = type;
        }
        if (range !== null) {
            data.range = range;
        }
        console.log("Requesting leveraged products list of category " + category + "..");
        requestCallback("GET", "instruments/leveragedproducts", data, successCallback, errorCallback);
    };

    /**
     * This function tries to find a stock by (part of) its name.
     * @param {string} q The search text.
     * @param {null|string} instrumentType The type of instrument (eg. equity, option, tracker, or index).
     * @param {number} count The maximum number of instruments in the response.
     * @param {string} accountNumber The account number.
     * @param {boolean} includeTickSizeTable Add tickSize table to the response, to lookup the minimum price movement for order limits.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.findByName = function (q, instrumentType, count, accountNumber, includeTickSizeTable, successCallback, errorCallback) {
        var data = {
            "searchText": q,
            "accountNumber": accountNumber,
            "includeTickSizes": includeTickSizeTable,
            "range": "0-" + (count - 1)
        };
        console.log("Searching " + count + " result for instrument '" + q + "' with account number " + accountNumber + "..");
        if (instrumentType !== null) {
            data.instrumentType = instrumentType;
        }
        requestCallback("GET", "instruments", data, successCallback, errorCallback);
    };

    /**
     * This function tries to find a stock by ISIN and MIC.
     * @param {string} isin The ISIN code.
     * @param {null|string} mic The MIC (Market Identification Code).
     * @param {null|string} instrumentType The type of instrument (eg. equity, option, tracker, or index).
     * @param {string} accountNumber The account number.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.findByIsin = function (isin, mic, instrumentType, accountNumber, successCallback, errorCallback) {
        console.log("Searching for instrument '" + isin + "' of account number " + accountNumber + "..");
        var data = {
            "isin": isin,
            "accountNumber": accountNumber
        };
        if (mic !== null) {
            data.mic = mic;
        }
        if (instrumentType !== null) {
            data.instrumentType = instrumentType;
        }
        requestCallback("GET", "instruments", data, successCallback, errorCallback);
    };

    /**
     * Request a derivative sheet. If there are multiple derivative series for the instrument, a list with the different symbols is returned.
     * @param {string} instrumentId The id of the underlying instrument (might be an index id).
     * @param {string} accountNumber The account number.
     * @param {string} range The range to be requested.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getDerivativeSheetByInstrument = function (instrumentId, accountNumber, range, successCallback, errorCallback) {
        console.log("Requesting derivative sheet for instrument " + instrumentId + " of account number " + accountNumber + "..");
        requestCallback("GET", "instruments/derivatives", {
            "accountNumber": accountNumber,
            "underlyingInstrumentId": instrumentId,
            "range": range
        }, successCallback, errorCallback);
    };

    /**
     * Request a derivative sheet with the symbol. Can be futures or options.
     * @param {string} symbol The symbol of the derivate.
     * @param {null|string} mic Optional Market Identification Code.
     * @param {null|string} currency Optional currency of instrument.
     * @param {string} accountNumber The account number.
     * @param {string} range The range to be requested.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getDerivativeSheetBySymbol = function (symbol, mic, currency, accountNumber, range, successCallback, errorCallback) {
        var data = {
            "accountNumber": accountNumber,
            "symbol": symbol,
            "range": range
        };
        if (mic !== null) {
            data.marketIdentificationCode = mic;
        }
        if (currency !== null) {
            data.currency = currency;
        }
        console.log("Requesting derivative sheet for symbol " + symbol + " of account number " + accountNumber + "..");
        requestCallback("GET", "instruments/derivatives", data, successCallback, errorCallback);
    };

    /**
     * Load the details of one or more instruments.
     * @param {Array<string>} instrumentIds The identifiers of the instrument.
     * @param {string} accountNumber The account number.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getInstrument = function (instrumentIds, accountNumber, successCallback, errorCallback) {
        // More than 1 instrument can be requested, for example all instruments from a portfolio or 'watch list'.
        console.log("Requesting instrument " + instrumentIds.join(" and ") + "..");
        requestCallback("GET", "instruments/" + encodeURIComponent(instrumentIds.join()), {
            "accountNumber": accountNumber
        }, successCallback, errorCallback);
    };

    /**
     * Lookup if there can be a document downloaded about this instrument, in the language of the customer.
     * @param {string} instrumentId The identifier of the instrument.
     * @param {string} accountNumber The account number.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {Object} The ajax request
     */
    this.getKidDocumentLink = function (instrumentId, accountNumber, successCallback, errorCallback) {
        console.log("Requesting instrument documentation link for instrument " + instrumentId + "..");
        return requestCallback("GET", "instruments/" + instrumentId + "/kid", {
            "accountNumber": accountNumber
        }, successCallback, errorCallback);
    };

    /**
     * Retrieve the document.
     * @param {string} instrumentId The identifier of the instrument.
     * @param {string} kidId The identifier of the document, retrieved from getKidDocumentLink.
     * @param {string} accountNumber The account number.
     * @param {function((Object|null|string))} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getKidDocument = function (instrumentId, kidId, accountNumber, successCallback, errorCallback) {
        console.log("Requesting instrument documentation for instrument " + instrumentId + " with id " + kidId + "..");
        requestCallbackDownload("GET", "instruments/" + instrumentId + "/kid/" + encodeURIComponent(kidId) + "?accountNumber=" + accountNumber, {}, successCallback, errorCallback);
    };
}
