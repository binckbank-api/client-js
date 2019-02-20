/*jslint this: true, browser: true, for: true, long: true, single: true */
/*global window $ alert console QuoteSubscriptionLevel InstrumentCell */

/**
 * An instrument row
 *
 * @constructor
 * @param {Object} streamer The streamer wrapper object
 * @param {Object} containerElm The jQuery element which will contain the rows to be created
 * @param {string} id Id of the instrument
 * @param {string} name Name of the instrument
 * @param {number} priceDecimals The number of decimals used to display the prices
 */
function InstrumentRow(streamer, containerElm, id, name, priceDecimals) {
    "use strict";

    var elmMain = $('<div><span class="instrumentName">' + name + "</span></div>");
    var lastCell;
    var lastTimeCell;
    var bidCell;
    var askCell;
    var highCell;
    var lowCell;
    var openCell;
    var closeCell;
    var volumeCell;

    /**
     * Get the given title, which is probably the instrument name.
     * @return {string} Title - Contents of the first column
     */
    this.getTitle = function () {
        return elmMain.find("span.instrumentName").text().toString();
    };

    /**
     * Update the title.
     * @param {string} title The new title.
     * @return {void}
     */
    this.setTitle = function (title) {
        elmMain.find("span.instrumentName").text(title);
    };

    /**
     * Initialize the row, by creating the cells and append them to the container.
     * @return {void}
     */
    function init() {
        // Add different cells
        lastCell = new InstrumentCell(elmMain, "lst", "price", priceDecimals, true);
        bidCell = new InstrumentCell(elmMain, "bid", "price", priceDecimals, true);
        askCell = new InstrumentCell(elmMain, "ask", "price", priceDecimals, true);
        highCell = new InstrumentCell(elmMain, "hgh", "price", priceDecimals, true);
        lowCell = new InstrumentCell(elmMain, "low", "price", priceDecimals, true);
        openCell = new InstrumentCell(elmMain, "opn", "price", priceDecimals, false);
        closeCell = new InstrumentCell(elmMain, "cls", "price", priceDecimals, false);
        volumeCell = new InstrumentCell(elmMain, "vol", "volume", 0, false);
        lastTimeCell = new InstrumentCell(elmMain, "lst", "time", 0, true);
        containerElm.append(elmMain);
        // Requested level is "Trades + bid1 + ask1"
        streamer.quotes.addInstruments([id], QuoteSubscriptionLevel.TOPOFBOOK);
    }

    /**
     * Update the appropriate cell with the new price.
     * @param {Object} quoteMessage The new data to display.
     * @return {void}
     */
    function processQuoteMessage(quoteMessage) {
        switch (quoteMessage.typ) {
        case "lst":
        case "thp":
            lastCell.update(quoteMessage);
            lastTimeCell.update(quoteMessage);
            break;
        case "bid":
            bidCell.update(quoteMessage);
            break;
        case "ask":
            askCell.update(quoteMessage);
            break;
        case "opn":
            openCell.update(quoteMessage);
            break;
        case "cls":
            closeCell.update(quoteMessage);
            // Do this to be able to calculate difference
            lastCell.update(quoteMessage);
            break;
        case "hgh":
            highCell.update(quoteMessage);
            break;
        case "low":
            lowCell.update(quoteMessage);
            break;
        case "vol":
            volumeCell.update(quoteMessage);
            break;
        case "iir":
        case "idv":
        case "ivl":
            // Implied interest rate is ignored, same for implied dividend and implied volatility
            break;
        }
    }

    /**
     * Stop listening and remove row.
     * @param {string} idToRemove Instrument to remove.
     * @return {void}
     */
    function removeRow(idToRemove) {
        if (idToRemove === undefined || idToRemove === null || idToRemove.toString() === id.toString()) {
            // It's me!
            streamer.quotes.deleteInstruments([id], QuoteSubscriptionLevel.TOPOFBOOK);
            lastCell.stop();
            bidCell.stop();
            askCell.stop();
            openCell.stop();
            closeCell.stop();
            highCell.stop();
            lowCell.stop();
            volumeCell.stop();
            elmMain.remove();
            $.topic("RemoveInstrumentList").unsubscribe(removeRow);
        }
    }

    $.topic("NewQuote").subscribe(function (quoteMessagesObject) {
        var i;
        if (quoteMessagesObject.id.toString() === id.toString()) {
            // It's me!
            for (i = 0; i < quoteMessagesObject.qt.length; i += 1) {
                processQuoteMessage(quoteMessagesObject.qt[i]);
            }
        }
    });

    $.topic("RemoveInstrumentList").subscribe(removeRow);

    init();
}
