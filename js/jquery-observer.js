/*jslint browser: true */
/*global jQuery */

var topics = {};

jQuery.topic = function (id) {
    "use strict";

    var callbacks;
    var localTopic = id && topics[id];

    if (!localTopic) {
        callbacks = jQuery.Callbacks();
        localTopic = {
            "publish": callbacks.fire,
            "subscribe": callbacks.add,
            "unsubscribe": callbacks.remove
        };
        if (id) {
            topics[id] = localTopic;
        }
    }
    return localTopic;
};