/*jslint this: true, browser: true, for: true, long: true, single: true */
/*global window $ alert console QuoteSubscriptionLevel InstrumentCell */

/**
 * An order book row
 *
 * @constructor
 * @param {Object} streamer The streamer wrapper object.
 * @param {Object} containerElm The jQuery element which will contain the rows to be created.
 * @param {string} id Id of the instrument.
 * @param {number} depth The book depth (1-5).
 * @param {number} priceDecimals The number of decimals used to display the prices.
 */
function OrderBookRow(streamer, containerElm, id, depth, priceDecimals) {
    "use strict";

    var elmMain = $('<div></div>');
    var bidOrdersCell;
    var bidVolumeCell;
    var bidCell;
    var askCell;
    var askVolumeCell;
    var askOrdersCell;
    var cellTypePostfix = (
        (depth === 1)
        ? ""
        : depth.toString()
    );

    /**
     * Initialize the row, by creating the cells and append them to the container.
     * @return {void}
     */
    function init() {
        // Add different cells
        bidOrdersCell = new InstrumentCell(elmMain, "bid" + cellTypePostfix, "orders", 0, false);
        bidVolumeCell = new InstrumentCell(elmMain, "bid" + cellTypePostfix, "volume", 0, false);
        bidCell = new InstrumentCell(elmMain, "bid" + cellTypePostfix, "price", priceDecimals, true);
        askCell = new InstrumentCell(elmMain, "ask" + cellTypePostfix, "price", priceDecimals, true);
        askVolumeCell = new InstrumentCell(elmMain, "ask" + cellTypePostfix, "volume", 0, false);
        askOrdersCell = new InstrumentCell(elmMain, "ask" + cellTypePostfix, "orders", 0, false);
        containerElm.append(elmMain);
        // Requested level is "book"
        streamer.quotes.addInstruments([id], QuoteSubscriptionLevel.BOOK);
    }

    /**
     * Update the appropriate cell with the new price.
     * @param {Object} quoteMessage The new data to display.
     * @return {void}
     */
    function processQuoteMessage(quoteMessage) {
        switch (quoteMessage.typ) {
        case "ask" + cellTypePostfix:
            askCell.update(quoteMessage);
            askVolumeCell.update(quoteMessage);
            askOrdersCell.update(quoteMessage);
            break;
        case "bid" + cellTypePostfix:
            bidCell.update(quoteMessage);
            bidVolumeCell.update(quoteMessage);
            bidOrdersCell.update(quoteMessage);
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
            streamer.quotes.deleteInstruments([id], QuoteSubscriptionLevel.BOOK);
            askCell.stop();
            askVolumeCell.stop();
            askOrdersCell.stop();
            bidCell.stop();
            bidVolumeCell.stop();
            bidOrdersCell.stop();
            elmMain.remove();
            $.topic("RemoveOrderBook").unsubscribe(removeRow);
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

    $.topic("RemoveOrderBook").subscribe(removeRow);

    init();
}
