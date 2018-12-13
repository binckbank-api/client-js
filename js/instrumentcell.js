/*jslint this: true, browser: true, for: true, long: true, single: true */
/*global window $ alert console */

/**
 * An instrument cell, part of a row
 *
 * @constructor
 * @param {Object} containerElm The jQuery element which will contain the cells to be created.
 * @param {string} cellType The type of price for this cell.
 * @param {string} infoToShow Show price, volume, time, or order count.
 * @param {number} priceDecimals The number of decimals used to display the prices.
 * @param {boolean} hasHighlighting Do changes lead to highlighting?
 */
function InstrumentCell(containerElm, cellType, infoToShow, priceDecimals, hasHighlighting) {
    "use strict";

    var elm = $("<span />");
    var timer;
    var currentPrice = 0;
    var previousDayClosePrice = 0;
    var lastUpdateDateTime = new Date(0);

    /**
     * Initialize the cell, by appending it to the containing row.
     * @return {void}
     */
    function init() {
        if (infoToShow === "time") {
            elm.addClass("dateTime");
        } else {
            elm.addClass("price");
        }
        containerElm.append(elm);
    }

    /**
     * Update background and font color.
     * @param {string} backgroundColor The CSS background-color.
     * @param {string} fontColor The CSS font-color.
     * @return {void}
     */
    function changeColor(backgroundColor, fontColor) {
        elm.css({"background-color": backgroundColor, "color": fontColor});
    }

    /**
     * Undo the highlighting, after a few milliseconds.
     * @param {string} fontColor The new CSS font-color.
     * @return {void}
     */
    function resetHighlighting(fontColor) {
        changeColor("white", fontColor);
    }

    /**
     * If a previous update was in progress, kill it.
     * @return {void}
     */
    function stopHighlightTimer() {
        window.clearInterval(timer);
    }

    /**
     * The font starts black, but if we compare it with open, we can give color.
     * @param {number} lastPrice The current last price.
     * @return {void}
     */
    function giveValueColor(lastPrice) {
        // Do this only for the cells displaying last prices
        if (cellType === "lst" && lastPrice !== 0 && previousDayClosePrice !== 0) {
            // We are able to give color, because we have a last price to compare with the open price
            if (lastPrice > previousDayClosePrice) {
                // Make text green
                resetHighlighting("green");
            } else if (lastPrice < previousDayClosePrice) {
                // Make text red
                resetHighlighting("red");
            } else {
                // Make text black, the default
                resetHighlighting("black");
            }
        } else {
            // No close arrived for this instrument
            resetHighlighting("black");
        }
    }

    /**
     * Display the updated price in red or green, depending on the direction.
     * @param {boolean} isHigher Green if price is higher than before.
     * @return {void}
     */
    function highlightUpdate(isHigher) {
        var fontColor;
        var backgroundColor;
        stopHighlightTimer();
        if (infoToShow === "time") {
            backgroundColor = "silver";
            fontColor = "black";
        } else if (isHigher) {
            backgroundColor = "green";
            fontColor = "white";
        } else {
            backgroundColor = "red";
            fontColor = "white";
        }
        changeColor(backgroundColor, fontColor);
        // Start timer to remove highlighting
        timer = window.setInterval(function () {
            if (cellType === "lst" && infoToShow === "price") {
                giveValueColor(currentPrice);
            } else {
                resetHighlighting("black");
            }
        }, 640);
    }

    /**
     * Determine if update must be highlighted (red or green).
     * @param {Object} quoteMessage The new data to display.
     * @param {number} priceAsNumber The new price.
     * @return {boolean} Yes, if applicable for highlighting
     */
    function isHighlightingRequired(quoteMessage, priceAsNumber) {
        // Only highlight updates
        return (hasHighlighting && quoteMessage.msg === "qu" && priceAsNumber !== currentPrice && currentPrice !== 0);
    }

    /**
     * A message can have certain tags, if there is a special meaning.
     * @param {Object} quoteMessage The new data to display.
     * @return {boolean} Yes, if tagged for a special reason, like 'Cancel'
     */
    function isTaggedAndNeedsNoFurtherProcessing(quoteMessage) {

        function displayCustomText(newText) {
            elm.text(newText);
            resetHighlighting("black");
        }

        if (quoteMessage.hasOwnProperty("tags")) {
            if (quoteMessage.tags.indexOf("C") >= 0) {
                // Cancel all current quotes, because a new cycle starts.
                displayCustomText("");
                return true;
            }
            if (quoteMessage.tags.indexOf("M") >= 0) {
                // This is a market quote message. Show this indication (in the bid/ask cell).
                displayCustomText("mkt");
                return true;
            }
            if (quoteMessage.tags.indexOf("O") >= 0) {
                // Process open indicator.
                displayCustomText("open");
                return true;
            }
            if (quoteMessage.tags.indexOf("X") >= 0) {
                // Exclude this quote from intraday charts, but show in overview lists.
                console.log("Received price tagged with 'X'. Shown in overview, but to be ignored in charts.");
            }
        }
        return false;
    }

    /**
     * Validate if the price is generated today.
     * @param {Date} updateDateTime The timestamp.
     * @return {boolean} Yes, if it is a quote of today
     */
    function isQuoteFromToday(updateDateTime) {
        var today = new Date();
        return updateDateTime.getDate() === today.getDate() && updateDateTime.getMonth() === today.getMonth() && updateDateTime.getYear() === today.getYear();
    }

    /**
     * Get time as a locale string. Add date if different day.
     * @param {Date} updateDateTime The timestamp.
     * @return {string} Formatted time, in format of the browser (might differ from the language of the customer!)
     */
    function getTimeString(updateDateTime) {
        var timeString;
        if (isQuoteFromToday(updateDateTime)) {
            // Today. Just display the time:
            timeString = updateDateTime.toLocaleTimeString();
        } else {
            // Not a quote from today. Include date:
            timeString = updateDateTime.toLocaleString();
        }
        return timeString;
    }

    /**
     * Update the text of the title attribute.
     * @param {Object} quoteMessage The new data to display.
     * @param {Date} updateDateTime The timestamp.
     * @return {void}
     */
    function updateTitleAttribute(quoteMessage, updateDateTime) {
        if (cellType !== "vol") {
            // Cumulative volume doesn't come with date/time
            if (!quoteMessage.hasOwnProperty("vol") || quoteMessage.vol === 0) {
                elm.prop("title", getTimeString(updateDateTime));
            } else if ((cellType === "bid" || cellType === "ask") && quoteMessage.hasOwnProperty("ord") && quoteMessage.ord !== 0) {
                elm.prop("title", "Volume " + quoteMessage.vol + "/" + quoteMessage.ord + " @ " + getTimeString(updateDateTime));
            } else {
                elm.prop("title", "Volume " + quoteMessage.vol + " @ " + getTimeString(updateDateTime));
            }
        }
    }

    /**
     * Process the price (or volume) update.
     * @param {Object} quoteMessage The new data to display.
     * @return {void}
     */
    this.update = function (quoteMessage) {

        function truncate(number) {
            return (
                number > 0
                ? Math.floor(number)
                : Math.ceil(number)
            );
        }

        var price;
        var priceAsNumber;
        var currentUpdateDateTime = new Date(quoteMessage.dt);
        if (quoteMessage.msg === "qi") {
            if (quoteMessage.typ === "cls" && cellType === "lst") {
                previousDayClosePrice = quoteMessage.prc;
                giveValueColor(currentPrice);
                return;
            }
            giveValueColor(quoteMessage.prc);
            // There might be multiple initial quotes for the same instrument (eg. lst and thp). Only process when new quote is more recent.
            if (lastUpdateDateTime.getTime() >= currentUpdateDateTime.getTime()) {
                // We receive an initial quote, but already show a more recent one.
                return;
            }
        }
        if (isTaggedAndNeedsNoFurtherProcessing(quoteMessage)) {
            return;
        }
        if (cellType === "vol" && quoteMessage.vol === 0) {
            // Don't show the cumulative volume of an index.
            return;
        }
        if (infoToShow === "volume") {
            priceAsNumber = quoteMessage.vol;
            if (priceAsNumber > 1800000) {
                price = truncate(quoteMessage.vol / 1000000) + " M";
            } else if (priceAsNumber > 2000) {
                price = truncate(quoteMessage.vol / 1000) + " K";
            } else {
                price = quoteMessage.vol;
            }
        } else if (infoToShow === "time") {
            price = getTimeString(currentUpdateDateTime);
            priceAsNumber = currentUpdateDateTime.getTime();
        } else if (infoToShow === "orders") {
            // Some instruments don't have the order count enabled
            price = (
                quoteMessage.ord !== 0
                ? quoteMessage.ord
                : ""
            );
            priceAsNumber = quoteMessage.ord;
        } else {
            price = quoteMessage.prc.toFixed(priceDecimals);
            if (quoteMessage.typ === "thp") {
                // This is a theoretical price, determined during an auction cycle. Give an indication of this, by surrounding the price with brackets.
                price = "[" + price + "]";
            }
            priceAsNumber = quoteMessage.prc;
        }
        elm.text(price);
        if (isHighlightingRequired(quoteMessage, priceAsNumber)) {
            // A new last arrived, indicate if higher or lower.
            highlightUpdate(currentPrice < priceAsNumber);
        }
        currentPrice = priceAsNumber;
        lastUpdateDateTime = currentUpdateDateTime;
        updateTitleAttribute(quoteMessage, lastUpdateDateTime);
    };

    /**
     * Stop highlighting prices.
     * @return {void}
     */
    this.stop = function () {
        stopHighlightTimer();
    };

    init();
}
