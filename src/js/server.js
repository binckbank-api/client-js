/*jslint this: true, browser: true, long: true */
/*global console $ */

/**
 * Request something from the application server
 *
 * @constructor
 */
function Server() {
    "use strict";

    /**
     * Retrieve data from the application backend.
     * @param {string} serverUrl Location of the server.
     * @param {Object} data Data to be send.
     * @param {boolean} isCachingAllowed Can the response come from the browser cache?
     * @param {function(Object)} successCallback Callback function to invoke in case of an error.
     * @param {function(Object)} errorCallback Callback function to invoke in case of an error.
     * @return {void}
     */
    this.getDataFromServer = function (serverUrl, data, isCachingAllowed, successCallback, errorCallback) {
        $.ajax({
            "dataType": "json",
            "contentType": "application/json; charset=utf-8",
            "type": "POST",
            "url": serverUrl,
            "data": JSON.stringify(data),
            "cache": isCachingAllowed,
            "success": successCallback,
            "error": errorCallback
        });
    };

}
