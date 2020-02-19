/*jslint this: true, browser: true, long: true */
/*global console */

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
     * @param {function(Object)} successCallback Callback function to invoke in case of an error.
     * @param {function(Object)} errorCallback Callback function to invoke in case of an error.
     * @return {void}
     */
    this.getDataFromServer = function (serverUrl, data, successCallback, errorCallback) {
        fetch(serverUrl, {
            "headers": {
                "Accept": "application/json; charset=utf-8",
                "Content-Type": "application/json; charset=utf-8"
            },
            "body": JSON.stringify(data),
            "method": "POST"
        }).then(function (response) {
            if (response.ok) {
                response.json().then(function (responseJson) {
                    successCallback(responseJson);
                });
            } else {
                errorCallback(response);
            }
        }).catch(function (error) {
            errorCallback({"error": error});
        });
    };

}
