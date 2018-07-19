/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * The Version
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function Version(requestCallback) {
    "use strict";

    /**
     * Get the version of the API. Since this function works without token, this might be the first call to test development.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getVersion = function (successCallback, errorCallback) {
        console.log("Requesting version..");
        // The version request requires parameters nor token. Only GET.
        requestCallback("GET", "version", {}, successCallback, errorCallback);
    };
}
