/*jslint this: true, browser: true, long: true */
/*global console */

/**
 * The Sessions
 *
 * @constructor
 * @param {function(string, string, Object, function(Object), function(string))} requestCallback The callback for a generic way to call the API.
 */
function Sessions(requestCallback) {
    "use strict";

    /**
     * Internal scoped applications can retrieve internal sessions.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.getSessions = function (successCallback, errorCallback) {
        console.log("Requesting sessions..");
        requestCallback("GET", "sessions", {}, successCallback, errorCallback);
    };

    /**
     * This is the logout function.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @param {function(string)} errorCallback The function to be called in case of a failed request.
     * @return {void}
     */
    this.abortSession = function (successCallback, errorCallback) {
        console.log("Logout..");
        requestCallback("DELETE", "sessions", {}, successCallback, errorCallback);
    };
}
