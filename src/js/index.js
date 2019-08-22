/*jslint this: true, browser: true, for: true, single: true, long: true */
/*global window $ console Api Streamer Server InstrumentRow OrderBookRow QuoteSubscriptionLevel */

$(function () {
    "use strict";

    /** @type {Object} */
    var serverConnection = {
        // Location of the application backend, containing configuration and token retrieval functions. Must be SSL for production!
        "appServerUrl": "server/token.php"
    };

    /** @type {string} */
    var activeAccountNumber;
    /** @type {boolean} */
    var isActiveAccountReadOnly = true;
    /** @type {Object} */
    var api;
    /** @type {Object} */
    var streamer;
    /** @type {Date} */
    var nextDelayLogTime = new Date();  // Log the delay on the connection every minute.
    /** @type {Array<Object>} */
    var instrumentList;
    /** @type {Object} */
    var activeInstrument = null;
    /** @type {boolean} */
    var isFirstToken = true;
    /** @type {Object} */
    var configurationFromBackend;  // The configuration is supplied by the app server, so configuration is centralized and can be changed in a deploy pipeline.

    /**
     * Get the selected realm.
     * @return {string} Realm selected when login page was loaded.
     */
    function getRealm() {
        return $("#idEdtRealm").val().toString();
    }

    /**
     * Get the language for the login dialog and exception if login is not successful.
     * @return {string} Culture code selected when login page was loaded.
     */
    function getCultureForLogin() {
        return $("#idEdtCulture").val().toString();
    }

    /**
     * Get the configuration for the API, like environment and client.
     * @return {Object} Object with the configuration.
     */
    function getConfiguration() {
        return {
            "clientId": configurationFromBackend.clientId,  // This is the identifier of your application. Both clientId and secret are available server side.
            "accountType": $("#idEdtAccountType").val(),
            "redirectUrl": configurationFromBackend.redirectUrl,  // This is the landing URL of your application, after logging in. HTTPS is required for production use.
            "realm": "bincknlapi",
            "authenticationProviderUrl": configurationFromBackend.authenticationProviderUrl,  // This is the URL of the authentication provider to be used.
            "apiUrl": configurationFromBackend.apiUrl,  // This is the URL to the API of Binck of the local process.
            "language": getCultureForLogin(),
            "scope": $("#idEdtScope").val(),
            "appServerUrl": serverConnection.appServerUrl
        };
    }

    /**
     * This is the callback when communication errors appear.
     * @param {string} error The error to be shown.
     * @return {void}
     */
    function apiErrorCallback(error) {
        window.alert("Something went wrong: " + error);
    }

    /**
     * Set the correct caption to the streaming news button.
     * @param {boolean} isOn Indication if streaming news is enabled or disabled.
     * @return {void}
     */
    function toggleNewsButtonText(isOn) {
        $("#idBtnActivateRealtimeNews").val(
            isOn
            ? "Turn off news"
            : "Activate realtime news"
        );
    }

    /**
     * Set the correct caption to the streaming order events button.
     * @param {boolean} isOn Indication if streaming orders is enabled or disabled.
     * @return {void}
     */
    function toggleOrderEventsButtonText(isOn) {
        $("#idBtnActivateRealtimeOrderUpdates").val(
            isOn
            ? "Turn off order updates"
            : "Activate realtime order updates"
        );
    }

    /**
     * This is the callback when communication errors appear in the streamer.
     * @param {string} errorCode The error to be shown.
     * @param {string} description The error to be shown.
     * @return {void}
     */
    function apiStreamerErrorCallback(errorCode, description) {
        window.alert("Something went wrong: " + description + " (" + errorCode + ")");
        // From version 3.0, SignalR automatically reconnects.
        if (errorCode === "disconnected" && window.confirm("Restart streamer?")) {
            streamer.start(function () {
                console.log("Reconnected to the streamer.");
            });
        } else {
            // Turn off news and streaming orders
            toggleNewsButtonText(false);
            toggleOrderEventsButtonText(false);
        }
    }

    /**
     * The streamer needs the account and token, to validate the subscription.
     * @return {Object} Json object with account and token.
     */
    function getSubscription() {
        return {
            "activeAccountNumber": activeAccountNumber,
            "accessToken": $("#idBearerToken").text()
        };
    }

    /**
     * Publish the received quote object.
     * @param {Object} quoteMessagesObject The object received by the streamer.
     * @return {void}
     */
    function quotesCallback(quoteMessagesObject) {
        var now = new Date();
        // This is the function receiving the quotes
        // Internally, the received data is published to the instrument rows:
        $.topic("NewQuote").publish(quoteMessagesObject);
        // Log the delay on the connection, every minute:
        if (nextDelayLogTime < now) {
            console.log("Delay on connection (ms): " + (now.getTime() - new Date(quoteMessagesObject.sdt).getTime()));
            // Next delay measurement in one minute:
            now.setMinutes(now.getMinutes() + 1);
            nextDelayLogTime = now;
        }
    }

    /**
     * Showcase of the streaming news API.
     * @param {Object} newsObject The object received by the streamer.
     * @return {void}
     */
    function newsCallback(newsObject) {
        var currentNewsHtml = $("#idNews").html();
        var newsBody = (
            newsObject.hasOwnProperty("body")
            ? newsObject.body
            : ""
        );
        console.log(newsObject);
        if (newsObject.fmt !== "html") {
            // The body might be formatted in plain text. Make line breaks visible in HTML.
            newsBody.replace(/\\r\\n/g, "<br />");
        }
        $("#idNews").html("<p>" + new Date(newsObject.dt).toLocaleString() + ": <b>" + newsObject.head + "</b><br />" + newsBody + "</p>" + currentNewsHtml);
    }

    /**
     * Do something with requested instruments.
     * @param {string} instrumentId The id of the desired instrument.
     * @return {void}
     */
    function displayInstrument(instrumentId) {
        var instrumentIds = [instrumentId];
        api.instruments.getInstrument(
            instrumentIds,
            activeAccountNumber,
            function (data) {
                var instrument = data.instrumentsCollection.instruments[0];
                // Not all instruments have ISIN codes:
                window.alert("Name: " + instrument.name + (
                    instrument.hasOwnProperty("isincode")
                    ? "\nISIN code: " + instrument.isincode
                    : ""
                ));
            },
            apiErrorCallback
        );
    }

    /**
     * Convert the currency code to a symbol (USD to $).
     * @param {string} currencyCode Currency code, coming from the API.
     * @return {string} Currency symbol.
     */
    function currencyCodeToSymbol(currencyCode) {
        switch (currencyCode) {
        case "EUR":
            return "€";
        case "USD":
            return "$";
        default:
            return currencyCode;
        }
    }

    /**
     * Get the quote subscription level per instrument.
     * @param {Object} subscriptions Quote collection, limited to subscriptions.
     * @return {void}
     */
    function displayQuoteSubscriptions(subscriptions) {
        var i;
        var subscription;
        for (i = 0; i < subscriptions.length; i += 1) {
            subscription = subscriptions[i];
            $.topic("AddSubscriptionLevel").publish(subscription);
        }
    }

    /**
     * Showcase of the streaming quotes API.
     * @param {Object} instruments Instruments collection.
     * @return {void}
     */
    function displayQuotesFeed(instruments) {

        function internalDisplayQuotesFeed(instrumentIdsToUpdate) {
            // Display if instrument has realtime or delayed quotes
            api.quotes.getLatestQuotes(activeAccountNumber, instrumentIdsToUpdate, "none", function (data) {
                displayQuoteSubscriptions(data.quotesCollection.quotes);
            }, apiErrorCallback);
            // Start streamer for the queued instruments
            streamer.quotes.activateSubscriptions();
        }

        var i;
        var instrument;
        var instrumentIds = [];
        if (instruments.length === 0) {
            window.alert("No instruments available to request quotes for.\n\nAre these instruments applicable for this account type?");
            return;
        }
        // Delete all active subscriptions
        $.topic("RemoveInstrumentList").publish();
        instrumentList = [];
        for (i = 0; i < instruments.length; i += 1) {
            instrument = instruments[i];
            if (instrument.type !== "futureClass" && instrument.type !== "optionClass") {
                // Classes don't have quotes, so leave them out of the request.
                instrumentIds[instrumentIds.length] = instrument.id;
            }
            instrumentList[instrumentList.length] = new InstrumentRow(streamer, $("#idInstrumentsList"), instrument.id, instrument.name + " (" + currencyCodeToSymbol(instrument.currency) + ")", instrument.priceDecimals);
            if (instrumentIds.length > 99) {
                // Update the list in blocks. Otherwise the headers might be too long.
                internalDisplayQuotesFeed(instrumentIds);
                instrumentIds = [];
            }
        }
        // And process the rest
        if (instrumentIds.length > 0) {
            internalDisplayQuotesFeed(instrumentIds);
        }
    }

    /**
     * Do something with requested instruments.
     * @param {string} instrumentListCode The code of the desired instrument list.
     * @return {void}
     */
    function displayInstrumentList(instrumentListCode) {
        api.instruments.getInstrumentList(
            instrumentListCode,
            activeAccountNumber,
            null,
            function (data) {
                // Check if streamer is already started, is done before starting.
                streamer.start(
                    function () {
                        displayQuotesFeed(data.instrumentsCollection.instruments);
                    }
                );
            },
            apiErrorCallback
        );
    }

    /**
     * Show the subscriptions of this account.
     * @return {void}
     */
    function displaySettings() {
        api.settings.getSettings(
            activeAccountNumber,
            function (data) {
                var settingsHtml;
                var i;
                if (data.settingsCollection.settings[0].tradingAllowed.length === 0) {
                    settingsHtml = "Trading is not allowed";
                } else {
                    settingsHtml = "Trading allowed for instrument types:";
                    for (i = 0; i < data.settingsCollection.settings[0].tradingAllowed.length; i += 1) {
                        settingsHtml += " " + data.settingsCollection.settings[0].tradingAllowed[i].tradingType;
                    }
                }
                $("#idAccountSettings").html(settingsHtml);
            },
            apiErrorCallback
        );
    }

    /**
     * Do something with a position.
     * @param {string} instrumentId The id of the position.
     * @return {void}
     */
    function displayPosition(instrumentId) {
        api.positions.getPosition(
            activeAccountNumber,
            instrumentId,
            function (data) {
                var position = data.positionsCollection.positions[0];
                window.alert("Position: " + position.instrument.name + ", average historical price " + currencyCodeToSymbol(position.currency) + " " + position.averageHistoricalPrice.toFixed(2));
            },
            apiErrorCallback
        );
    }

    /**
     * Do something with requested portfolio.
     * @return {void}
     */
    function displayPositions() {
        api.positions.getPositions(
            activeAccountNumber,
            "",
            function (data) {
                var positionsHtml = "";
                var i;
                var position;
                if (data.positionsCollection.positions.length === 0) {
                    positionsHtml = "No positions found.";
                } else {
                    for (i = 0; i < data.positionsCollection.positions.length; i += 1) {
                        position = data.positionsCollection.positions[i];
                        positionsHtml += '<a href="#' + position.instrument.id + '" data-code="' + position.instrument.id + '">' + position.quantity + " x " + position.instrument.name + " (" + currencyCodeToSymbol(position.currency) + " " + position.value.toFixed(2) + ")</a><br />";
                    }
                }
                $("#idPositions").html(positionsHtml);
                $("#idPositions a[href]").on("click", function (e) {
                    e.preventDefault();
                    displayPosition($(this).data("code").toString());
                });
            },
            apiErrorCallback
        );
    }

    /**
     * Show the tradable option series with a certain symbol.
     * @param {string} symbol The symbol of the derivate.
     * @param {null|string} mic The Market Identification Code.
     * @param {null|string} currency The currency.
     * @param {number} pagingOffset The start of the requested range.
     * @return {void}
     */
    function displayDerivativeSeriesBySymbol(symbol, mic, currency, pagingOffset) {
        var maxArrayLength = 50;  // This is an example of the use of the paging. The default max is 100.
        var limit = pagingOffset + (maxArrayLength - 1);
        api.instruments.getDerivativeSheetBySymbol(
            symbol,
            mic,
            currency,
            activeAccountNumber,
            pagingOffset + "-" + limit,
            function (data) {
                var derivativesHtml;
                var i;
                var derivative;
                var expirationDate;
                var month = 0;
                var price = 0;
                if (pagingOffset === 0) {
                    // First range. Add underlying instrument:
                    derivativesHtml = "";
                } else {
                    // Subsequent ranges. Append them to the existing one(s).
                    derivativesHtml = $("#idOptionSheet").html().toString();
                }
                if (data.derivativesCollection.classes.length === 0) {
                    window.alert("Derivative symbol " + symbol + " not found for this account type.");
                    return;
                }
                for (i = 0; i < data.derivativesCollection.classes[0].series.length; i += 1) {
                    derivative = data.derivativesCollection.classes[0].series[i];
                    expirationDate = new Date(derivative.expirationDate);
                    if (month !== expirationDate.getMonth()) {
                        month = expirationDate.getMonth();
                        derivativesHtml += "<br />" + symbol + " " + expirationDate.toLocaleString("en-us", {"month": "short"}) + " " + expirationDate.getFullYear() + ": ";
                    }
                    if (price !== derivative.strike) {
                        price = derivative.strike;
                        derivativesHtml += derivative.strike.toFixed(derivative.strikeDecimals) + " ";
                    }
                    derivativesHtml += '<a href="#' + derivative.instrumentId + '" data-code="' + derivative.instrumentId + '">' + derivative.optionType.charAt(0).toUpperCase() + "</a> ";
                }
                $("#idOptionSheet").html(derivativesHtml);
                if (data.paging.offset + maxArrayLength < data.count) {
                    // Retrieve the next range.
                    // Alternatively (advisable!), this can be done using the paging.next string, until paging.next is unavailable.
                    displayDerivativeSeriesBySymbol(symbol, mic, currency, data.paging.offset + maxArrayLength);
                } else {
                    $("#idOptionSheet a[href]").on("click", function (e) {
                        e.preventDefault();
                        displayInstrument($(this).data("code").toString());
                    });
                }
            },
            apiErrorCallback
        );
    }

    /**
     * Get the balance of an account.
     * @return {void}
     */
    function displayBalance() {
        api.balances.getBalance(
            activeAccountNumber,
            function (data) {
                var balance = data.balancesCollection.balances[0];
                var cashBalance;
                var i;
                var balanceHtml = " - balance: " + currencyCodeToSymbol(data.balancesCollection.currency) + " " + balance.assetsTotalValue.toFixed(2) + ", spending limit: " + balance.availableSpendingLimit.toFixed(2);
                if (balance.hasOwnProperty("availableSpendingLimitSrd")) {
                    // Only available when customer is allowed to trade in SRD.
                    balanceHtml += ", spending limit SRD: " + balance.availableSpendingLimitSrd.toFixed(2);
                }
                if (balance.cashBalancesCollection.cashBalances.length > 1) {
                    balanceHtml += "<br />Money accounts: ";
                    for (i = 0; i < balance.cashBalancesCollection.cashBalances.length; i += 1) {
                        cashBalance = balance.cashBalancesCollection.cashBalances[i];
                        balanceHtml += " " + currencyCodeToSymbol(cashBalance.currency) + " " + cashBalance.cashBalance.toFixed(2);
                    }
                }
                $("#idBalances").html(balanceHtml);
            },
            apiErrorCallback
        );
    }

    /**
     * Display transactions.
     * @param {string} mutationGroup The filer on mutation type. Empty if all transactions are required.
     * @return {void}
     */
    function displayTransactions(mutationGroup) {
        var transactionsHtml = "";
        var i;
        api.transactions.getTransactions(
            activeAccountNumber,
            "1990-01-15",
            "",
            mutationGroup,
            "",
            "0-24",
            function (data) {
                var transaction;
                var instrumentName;
                if (data.transactionsCollection.transactions.length === 0) {
                    transactionsHtml = "No transactions found.";
                } else {
                    for (i = 0; i < data.transactionsCollection.transactions.length; i += 1) {
                        transaction = data.transactionsCollection.transactions[i];
                        if (transaction.hasOwnProperty("instrument")) {
                            instrumentName = " " + transaction.instrument.name;
                        } else {
                            instrumentName = "";
                        }
                        transactionsHtml += transaction.accountCurrency + "-" + transaction.number + ". " + new Date(transaction.transactionDate).toLocaleDateString() + " / " + new Date(transaction.settlementDate).toLocaleDateString() + ": " + transaction.mutatedBalance.toFixed(2) + " (" + transaction.mutationType + ")" + instrumentName + "<br />";
                    }
                }
                $("#idTransactions").html(transactionsHtml);
            },
            apiErrorCallback
        );
    }

    /**
     * Display performance.
     * @param {number} year The 4 digit year (2017).
     * @return {void}
     */
    function displayPerformance(year) {
        api.performances.getPerformanceForYear(
            activeAccountNumber,
            year,
            true,
            function (data) {
                var performanceHtml = "Total " + year + ": " + currencyCodeToSymbol(data.summary.currency) + " " + data.summary.total.toFixed(2) + " (realized " + data.summary.realized.toFixed(2) + ", unrealized " + data.summary.unrealized.toFixed(2) + ")<br />";
                var i;
                var performance;
                if (data.performancesCollection.performances.length === 0) {
                    performanceHtml += "No performance on instruments found. ";
                } else {
                    for (i = 0; i < data.performancesCollection.performances.length; i += 1) {
                        performance = data.performancesCollection.performances[i];
                        performanceHtml += performance.instrument.name + ": " + currencyCodeToSymbol(performance.currency) + " " + performance.annual.toFixed(2) + "<br />";
                    }
                }
                $("#idPerformance").html(performanceHtml);
                $("#idPerformance a[href]").on("click", function (e) {
                    e.preventDefault();
                    displayPerformance($(this).data("code").toString());
                });
            },
            apiErrorCallback
        );
    }

    /**
     * Display performances.
     * @return {void}
     */
    function displayPerformances() {
        api.performances.getPerformanceOverview(
            activeAccountNumber,
            function (data) {
                var performanceHtml = "Total: " + currencyCodeToSymbol(data.summary.currency) + " " + data.summary.total.toFixed(2) + " (realized " + data.summary.realized.toFixed(2) + ", unrealized " + data.summary.unrealized.toFixed(2) + ")<br />";
                var i;
                var performance;
                if (data.performancesCollection.performances.length === 0) {
                    performanceHtml = "No performance found.";
                } else {
                    for (i = 0; i < data.performancesCollection.performances.length; i += 1) {
                        performance = data.performancesCollection.performances[i];
                        performanceHtml += '<a href="#" data-code="' + performance.year + '">' + performance.year + "</a>: " + currencyCodeToSymbol(performance.currency) + " " + performance.total.toFixed(2) + "<br />";
                    }
                }
                $("#idPerformance").html(performanceHtml);
                $("#idPerformance a[href]").on("click", function (e) {
                    e.preventDefault();
                    displayPerformance($(this).data("code").toString());
                });
            },
            apiErrorCallback
        );
    }

    /**
     * Display the symbols of the derivatives available for an instrument.
     * @return {void}
     */
    function displayDerivativeClassesByInstrument() {
        api.instruments.getDerivativeSheetByInstrument(
            activeInstrument.id,
            activeAccountNumber,
            "",
            function (data) {
                var classData;
                var i;
                var symbols;
                if (data.derivativesCollection.classes.length === 0) {
                    symbols = "No derivatives of this instrument found.";
                } else {
                    symbols = "Found " + data.derivativesCollection.classes.length + " derivative class(es):\n";
                    for (i = 0; i < data.derivativesCollection.classes.length; i += 1) {
                        classData = data.derivativesCollection.classes[i];
                        symbols += classData.symbol + "\n";
                    }
                }
                window.alert(symbols);
            },
            apiErrorCallback
        );
    }

    /**
     * Display the order book updates.
     * @return {void}
     */
    function displayOrderBookFeed() {
        // Start streaming order book. Check if streamer is already started, is done before starting.
        streamer.start(
            function () {
                var i;
                // Delete all active subscriptions
                $.topic("RemoveOrderBook").publish();
                for (i = 1; i <= 5; i += 1) {
                    new OrderBookRow(streamer, $("#idOrderBook"), activeInstrument.id, i, activeInstrument.priceDecimals);
                }
                streamer.quotes.activateSubscriptions();
            }
        );
    }

    /**
     * Display recent news of an instrument.
     * @param {string} instrumentId instrument for which to show the streaming order book.
     * @return {void}
     */
    function displayNews(instrumentId) {
        // Get the last 10 news items
        api.news.getNews(
            activeAccountNumber,
            instrumentId,
            "0-9",
            function (data) {
                var i;
                var newsItem;
                var newsHtml = "";
                for (i = 0; i < data.newsCollection.news.length; i += 1) {
                    newsItem = data.newsCollection.news[i];
                    newsHtml += "<p>" + new Date(newsItem.publishedDateTime).toLocaleString() + ": <b>" + newsItem.headline + "</b></p>";
                    console.log(newsItem.headline);
                    if (newsItem.hasOwnProperty("body")) {
                        console.log(newsItem.body);
                    }
                }
                $("#idNewsForInstrument").html(newsHtml);
            },
            apiErrorCallback
        );
    }

    /**
     * Populate the tickSizes.
     * @return {void}
     */
    function displayTickSizeTable() {
        var tickSizeStep;
        var i;
        // Clear tick sizes
        $("#idEdtTickSizes").children().remove();
        // Populate tick size list
        for (i = 0; i < activeInstrument.tickSizeCollection.tickSizes.length; i += 1) {
            tickSizeStep = activeInstrument.tickSizeCollection.tickSizes[i];
            $("#idEdtTickSizes").append('<option value="' + tickSizeStep.from + '">From ' + tickSizeStep.from + ": " + tickSizeStep.size + "</option>");
        }
    }

    /**
     * Populate the order object with the found instrument from the search response.
     * @return {void}
     */
    function prepareOrder() {
        var instrumentsHtml = "";
        var orderType = $("input[name=orderType]:checked").val();
        var newOrderObject = {
            "type": orderType,
            "quantity": 1,
            "duration": "day"
        };
        var instrumentIdForNews;
        switch (orderType) {
        case "stop":
            newOrderObject.stopPrice = 5;
            break;
        case "stopLimit":
            newOrderObject.stopPrice = 5;
            newOrderObject.limitPrice = 5;
            break;
        case "limit":
            newOrderObject.limitPrice = 5;
            break;
        }
        displayTickSizeTable();
        // Populate the newOrderObject
        switch (activeInstrument.type) {
        case "option":
            instrumentIdForNews = activeInstrument.derivativesInfo.underlyingInstrumentId;
            newOrderObject.option = {
                "leg1": {
                    "side": "buy",
                    "instrumentId": activeInstrument.id
                }
            };
            break;
        case "future":
            instrumentIdForNews = activeInstrument.derivativesInfo.underlyingInstrumentId;
            newOrderObject.future = {
                "side": "buy",
                "instrumentId": activeInstrument.id
            };
            break;
        case "srdClass":
            instrumentIdForNews = activeInstrument.srdInfo.underlyingInstrumentId;
            newOrderObject.srd = {
                "side": "buy",
                "instrumentId": activeInstrument.id
            };
            break;
        default:
            instrumentIdForNews = activeInstrument.id;
            newOrderObject.cash = {
                "side": "buy",
                "instrumentId": activeInstrument.id
            };
        }
        newOrderObject.referenceId = "my correlation id";  // Better to make it unique..
        $("#idEdtOrderModel").val(JSON.stringify(newOrderObject));
        // Get recent news updates about this instrument
        displayNews(instrumentIdForNews);
        // And show the instrument
        instrumentsHtml += '<a href="#">' + activeInstrument.name + "</a> (mic " + activeInstrument.marketIdentificationCode + ")";
        // Remove previously bound events.
        $("#idSearchResults a[href]").off("click");
        $("#idSearchResults").html(instrumentsHtml);
        $("#idSearchResults a[href]").on("click", function (e) {
            e.preventDefault();
            displayDerivativeClassesByInstrument();
        });
    }

    /**
     * Search for an instrument by its name. Fast, so can be used for progressive search.
     * @return {void}
     */
    function displayInstrumentSearchResults() {
        var searchText = $("#idEdtInstrumentName").val().toString();
        var instrumentType = $("input[name=instrumentSearchType]:checked").val();
        if (instrumentType === "all") {
            instrumentType = null;
        }
        api.instruments.findByName(
            searchText,
            instrumentType,
            1,
            activeAccountNumber,
            true,  // includeTickSizes
            function (data) {
                if (data.instrumentsCollection.instruments.length === 0) {
                    window.alert("No instrument found with the name '" + $("#idEdtInstrumentName").val().toString() + "'.\n\nMaybe the instrument is not available for the selected account type?");
                } else {
                    // We found one result - make this the active instrument for example calls
                    activeInstrument = data.instrumentsCollection.instruments[0];
                    prepareOrder();
                    if (activeInstrument.hasOptions) {
                        displayDerivativeSeriesBySymbol(activeInstrument.symbol, null, activeInstrument.currency, 0);
                    }
                }
            },
            apiErrorCallback
        );
    }

    /**
     * Do something with requested account details.
     * @return {void}
     */
    function displayAccount() {
        api.accounts.getAccount(
            activeAccountNumber,
            function (data) {
                var account = data.accountsCollection.accounts[0];
                document.title = account.iban;
                isActiveAccountReadOnly = account.isReadOnly;
                // This call requires an account type:
                displaySettings();
                displayPositions();
                displayTransactions("");
                displayPerformances();
                displayInstrumentSearchResults();
                $("#idSelectedAccount").text(account.iban + " " + account.name + " (" + account.type + ")");
                displayBalance();
            },
            apiErrorCallback
        );
    }

    /**
     * Do something with requested account list.
     * @return {void}
     */
    function displayAccounts() {
        api.accounts.getAccounts(
            function (data) {
                var account;
                var state = api.getState();
                var defaultAccountTypeToFind = "";
                var isDefaultAccountTypeFound = false;
                var defaultAccount = 0;
                var accountsHtml = "";
                var rights;
                var i;
                // Check if the state returned as query parameter in the redirect_url is valid.
                if (state === null) {
                    window.alert("The state returned in the URL is invalid. Something went wrong while logging in.");
                } else {
                    defaultAccountTypeToFind = state.account;
                }
                if (data.accountsCollection.accounts.length === 0) {
                    accountsHtml = "No accounts found.";
                } else {
                    for (i = 0; i < data.accountsCollection.accounts.length; i += 1) {
                        account = data.accountsCollection.accounts[i];
                        rights = (
                            account.isReadOnly
                            ? "read"
                            : "write"
                        );
                        if (!isDefaultAccountTypeFound && account.type === defaultAccountTypeToFind) {
                            isDefaultAccountTypeFound = true;
                            defaultAccount = i;
                        }
                        accountsHtml += '<a href="#" data-code="' + account.number + '">' + account.iban + " " + account.name + "</a> (" + account.type + ": " + rights + ")<br />";
                    }
                    account = data.accountsCollection.accounts[defaultAccount];
                    activeAccountNumber = account.number;
                    // Get information about the active account:
                    displayAccount();
                }
                $("#idAccounts").html(accountsHtml);
                $("#idAccounts a[href]").on("click", function (e) {
                    e.preventDefault();
                    activeAccountNumber = $(this).data("code").toString();
                    displayAccount();
                });
            },
            apiErrorCallback
        );
    }

    /**
     * Display a single order.
     * @param {number} orderNumber The order to show.
     * @return {void}
     */
    function displayOrder(orderNumber) {
        api.orders.getOrder(
            activeAccountNumber,
            orderNumber,
            function (data) {
                window.alert("Number of legs in order " + orderNumber + ": " + data.ordersCollection.orders.length);
            },
            apiErrorCallback
        );
    }

    /**
     * If the write scope is not available, some endpoints are not available. Display a warning if this is the case.
     * @return {void}
     */
    function alertIfActiveAccountIsReadOnly() {
        if (isActiveAccountReadOnly) {
            window.alert("You are not authorized to access this endpoint with the granted scope.");
        }
    }

    /**
     * Change the limit price of an active order.
     * @param {Object} modifyOrderModel The order modification.
     * @param {function()} successCallback When successful, this function is called.
     * @return {void}
     */
    function modifyOrder(modifyOrderModel, successCallback) {
        alertIfActiveAccountIsReadOnly();
        api.orders.validateModifyOrder(
            activeAccountNumber,
            modifyOrderModel,
            function (dataFromValidateOrder) {
                var isAllOrderConfirmationsApprovedByUser = true;  // Stay positive!
                var warningsToBeShown;
                var warningsToBeConfirmed;
                if (dataFromValidateOrder.previewOrder.warningsToBeShown.length > 0) {
                    warningsToBeShown = "Warning(s):\n\n" + dataFromValidateOrder.previewOrder.warningsToBeShown.join("\n") + "\n\n";
                } else {
                    warningsToBeShown = "No warnings.\n\n";
                }
                if (dataFromValidateOrder.previewOrder.warningsToBeConfirmed.length > 0) {
                    warningsToBeConfirmed = "By continuing you'll approve with the contents of the following warning(s):\n\n" + dataFromValidateOrder.previewOrder.warningsToBeConfirmed.join("\n") + "\n\n";
                } else {
                    warningsToBeConfirmed = "";
                }
                if (dataFromValidateOrder.previewOrder.orderCanBeRegistered === true) {
                    // First, let the user explicitly confirm the order warnings.
                    if (warningsToBeConfirmed !== "" && !window.confirm(warningsToBeConfirmed)) {
                        isAllOrderConfirmationsApprovedByUser = false;
                    }
                    // Second, if there are general warnings, show them to the user. Can be in a dialog, or just on the order ticket window.
                    if (!window.confirm(warningsToBeShown + "Order can be placed. Do you want to continue?")) {
                        isAllOrderConfirmationsApprovedByUser = false;
                    }
                    if (isAllOrderConfirmationsApprovedByUser) {
                        // Copy the validationCode into the newOrderModel, to proceed with the order
                        console.log("Validation code: " + dataFromValidateOrder.previewOrder.validationCode);
                        modifyOrderModel.validationCode = dataFromValidateOrder.previewOrder.validationCode;
                        api.orders.modifyOrder(
                            activeAccountNumber,
                            modifyOrderModel,
                            successCallback,
                            apiErrorCallback
                        );
                    }
                } else {
                    window.alert("Order cannot be placed!\n\n" + warningsToBeShown);
                }
            },
            apiErrorCallback
        );
    }

    /**
     * Add the new HTML to the list of pending orders and attach the onClick events.
     * @param {string} ordersHtml The list of orders.
     * @param {function()} refreshCallback This is what to do when a modification or cancel was executed, if streaming is not active.
     * @return {void}
     */
    function populateOrdersList(ordersHtml, refreshCallback) {
        $("#idOrders").html(ordersHtml);
        $("#idOrders a[href='#order']").on("click", function (e) {
            var orderNumber = parseInt($(this).data("code"), 10);
            e.preventDefault();
            displayOrder(orderNumber);
        });
        $("#idOrders a[href='#cancel']").on("click", function (e) {
            e.preventDefault();
            api.orders.cancelOrder(
                activeAccountNumber,
                parseInt($(this).data("code"), 10),
                function () {
                    if (streamer.isOrdersActivated) {
                        refreshCallback();
                    }
                    window.alert("Order has been canceled.");
                },
                apiErrorCallback
            );
        });
        $("#idOrders a[href='#modify']").on("click", function (e) {
            e.preventDefault();
            modifyOrder(
                {
                    "orderNumber": parseInt($(this).data("code"), 10),
                    "orderLineNumber": 1,
                    "limitPrice": 5.05
                },
                function () {
                    if (streamer.isOrdersActivated) {
                        refreshCallback();
                    }
                    window.alert("Order has been modified.");
                }
            );
        });
    }

    /**
     * Display quotes from the last 6 months, year, etc.
     * @return {void}
     */
    function displayHistoricalQuotes() {

        /**
         * Add history to the list.
         * @param {Date} fromDateTime The date of the first quotes. Can be today.
         * @param {string} interval The frequency of the quotes (OneMinute, FiveMinutes, TenMinutes, FifteenMinutes, OneHour, OneDay, OneWeek, OneMonth), to save bandwidth.
         * @param {Object} targetElm The element where to show the data.
         * @return {void}
         */
        function internalDisplayHistoricalQuotes(fromDateTime, interval, targetElm) {
            api.quotes.getHistoricalQuotes(
                activeAccountNumber,
                activeInstrument.id,
                fromDateTime,
                null,
                interval,
                function (data) {
                    var historicalQuotesHtml = "";
                    var i;
                    var historicalQuote;
                    for (i = 0; i < data.historicalQuotesCollection.historicalQuotes.length; i += 1) {
                        historicalQuote = data.historicalQuotesCollection.historicalQuotes[i];
                        historicalQuotesHtml += historicalQuote.last + " (" + historicalQuote.cumVol + ") @ " + new Date(historicalQuote.dateTime).toLocaleString() + "<br />";
                    }
                    targetElm.html(historicalQuotesHtml);
                },
                apiErrorCallback
            );
        }

        var sixMonthsBack = new Date();
        var twoDaysBack = new Date();
        var tenYearsBack = new Date();
        twoDaysBack.setDate(twoDaysBack.getDate() - 2);
        internalDisplayHistoricalQuotes(twoDaysBack, "fifteenMinutes", $("#idHistoricalQuotesForInstrumentQuarter"));
        tenYearsBack.setFullYear(tenYearsBack.getFullYear() - 10);
        internalDisplayHistoricalQuotes(tenYearsBack, "oneDay", $("#idHistoricalQuotesForInstrumentDay"));
        sixMonthsBack.setMonth(sixMonthsBack.getMonth() - 6);
        internalDisplayHistoricalQuotes(sixMonthsBack, "OneWeek", $("#idHistoricalQuotesForInstrumentWeek"));
        // Get all current quotes, to show the settlement price and open interest of a future for example
        api.quotes.getLatestQuotes(activeAccountNumber, [activeInstrument.id], "tradesBidAsk", function (data) {
            console.log(data.quotesCollection.quotes);
        }, apiErrorCallback);
    }

    /**
     * Create the html with the order descriptions.
     * @param {Object} data The response object or the orders endpoint.
     * @return {string} The orders in HTML format.
     */
    function generateOrdersList(data) {
        var ordersHtml = "";
        var orderHtml;
        var i;
        var order;
        for (i = 0; i < data.ordersCollection.orders.length; i += 1) {
            order = data.ordersCollection.orders[i];
            orderHtml = '<a href="#order" data-code="' + order.number + '">' + order.number + "</a> " + (
                order.hasOwnProperty("side")
                ? order.side + " "
                : ""
            ) + order.quantity + " x " + order.instrument.name + " (expires " + new Date(order.expirationDate).toLocaleDateString() + ") state: " + order.lastStatus;
            if (order.hasOwnProperty("referenceId")) {
                orderHtml += " /order has reference '" + order.referenceId + "'/";
            }
            if (order.lastStatus === "placed") {
                orderHtml += ' <a href="#cancel" data-code="' + order.number + '">cancel</a>';
            } else if (order.lastStatus === "placementConfirmed" || order.lastStatus === "modified") {
                orderHtml += ' <a href="#modify" data-code="' + order.number + '">modify</a>';
                orderHtml += ' <a href="#cancel" data-code="' + order.number + '">cancel</a>';
            }
            ordersHtml += orderHtml + "<br />";
        }
        return ordersHtml;
    }

    /**
     * Display orders.
     * @return {void}
     */
    function displayOrdersActive() {
        api.orders.getOrdersActive(
            activeAccountNumber,
            "all",
            "",
            function (data) {
                var ordersHtml;
                if (data.ordersCollection.orders.length === 0) {
                    ordersHtml = "No recent orders found.";
                } else {
                    ordersHtml = generateOrdersList(data);
                }
                populateOrdersList(ordersHtml, displayOrdersActive);
            },
            apiErrorCallback
        );
    }

    /**
     * Display historical orders.
     * @return {void}
     */
    function displayOrdersHistory() {
        var date = new Date();
        var month;
        var year;
        // Retrieve orders from last month
        date.setDate(date.getDate() - 30);
        month = date.getMonth() + 1;
        year = date.getFullYear();
        api.orders.getOrdersHistory(
            activeAccountNumber,
            month,
            year,
            "",
            function (data) {
                var ordersHtml;
                if (data.ordersCollection.orders.length === 0) {
                    ordersHtml = "No order history found in month " + month + " of year " + year + ".";
                } else {
                    ordersHtml = generateOrdersList(data);
                }
                populateOrdersList(ordersHtml, displayOrdersActive);
            },
            apiErrorCallback
        );
    }

    /**
     * Showcase of the streaming order updates API: Change in positions.
     * @param {Object} orderObject The object received by the streamer.
     * @return {void}
     */
    function orderExecutionsCallback(orderObject) {
        console.log("Order has (partially) been executed.");
        console.log(orderObject);
        window.alert("You just received an order execution for account " + orderObject.accountNumber);
    }

    /**
     * Showcase of the streaming order updates API: Change in pending order.
     * @param {Object} orderObject The object received by the streamer.
     * @return {void}
     */
    function orderModificationsCallback(orderObject) {
        console.log("Order has been modified.");
        console.log(orderObject);
        window.alert("You just received an order modification for account " + orderObject.accountNumber);
    }

    /**
     * Showcase of the streaming order updates API: Change in order status.
     * @param {Object} orderObject The object received by the streamer.
     * @return {void}
     */
    function orderEventsCallback(orderObject) {
        var currentOrdersHtml;
        var orderHtml;
        console.log("Order status has been changed.");
        console.log(orderObject);
        if (orderObject.accountNumber === activeAccountNumber) {
            // Add the incoming order to the list
            currentOrdersHtml = $("#idOrders").html();
            orderHtml = '<a href="#order" data-code="' + orderObject.number + '">' + orderObject.number + "</a> " + (
                orderObject.hasOwnProperty("side")
                ? orderObject.side + " "
                : ""
            ) + " instrumentId " + orderObject.instrument.id + " /refresh to get full name/ (expires " + new Date(orderObject.expirationDate).toLocaleDateString() + ") state: " + orderObject.status;
            if (orderObject.status === "placed") {
                orderHtml += ' <a href="#cancel" data-code="' + orderObject.number + '">cancel</a>';
            } else if (orderObject.status === "placementConfirmed" || orderObject.status === "modified") {
                orderHtml += ' <a href="#modify" data-code="' + orderObject.number + '">modify</a>';
                orderHtml += ' <a href="#cancel" data-code="' + orderObject.number + '">cancel</a>';
            }
            if (orderObject.hasOwnProperty("referenceId")) {
                orderHtml += " /order has reference '" + orderObject.referenceId + "'/";
            }
            currentOrdersHtml = orderHtml + "<br />" + currentOrdersHtml;
            populateOrdersList(currentOrdersHtml, displayOrdersActive);
        } else {
            window.alert("You just received an order update for another account: " + orderObject.accountNumber);
        }
    }

    /**
     * Check if the order can be placed, considering the the existing portfolio of the account, rights and risk appetite of the customer.
     * @param {Object} newOrderObject The order model, without validationCode.
     * @param {function(Object)} successCallback When successful, this function is called.
     * @return {void}
     */
    function previewOrder(newOrderObject, successCallback) {
        api.orders.validateNewOrder(
            activeAccountNumber,
            newOrderObject,
            function (dataFromValidateOrder) {
                var isAllOrderConfirmationsApprovedByUser = true;  // Stay positive!
                var warningsToBeShown;
                var warningsToBeConfirmed;
                if (dataFromValidateOrder.previewOrder.warningsToBeShown.length > 0) {
                    warningsToBeShown = "Warning(s):<br />" + dataFromValidateOrder.previewOrder.warningsToBeShown.join("<br />" + "<br />");
                } else {
                    warningsToBeShown = "No warnings.<br />";
                }
                if (dataFromValidateOrder.previewOrder.warningsToBeConfirmed.length > 0) {
                    warningsToBeConfirmed = "By continuing you'll approve the contents of the following warning(s):<br />" + dataFromValidateOrder.previewOrder.warningsToBeConfirmed.join("<br />") + "<br />";
                } else {
                    warningsToBeConfirmed = "";
                }
                $("#idOrderWarningsToShow").html(warningsToBeShown);
                $("#idOrderWarningsToConfirm").html(warningsToBeConfirmed);
                if (dataFromValidateOrder.previewOrder.orderCanBeRegistered === true) {
                    // First, let the user explicitly confirm the order warnings.
                    if (warningsToBeConfirmed !== "" && !window.confirm($("#idOrderWarningsToConfirm").text())) {
                        isAllOrderConfirmationsApprovedByUser = false;
                    }
                    // Second, if there are general warnings, show them to the user. Can be in a dialog, or just on the order ticket window.
                    if (!window.confirm($("#idOrderWarningsToShow").text() + "Order can be placed. Do you want to continue?")) {
                        isAllOrderConfirmationsApprovedByUser = false;
                    }
                    if (isAllOrderConfirmationsApprovedByUser) {
                        // Copy the validationCode into the newOrderObject, to proceed with the order
                        console.log("Validation code: " + dataFromValidateOrder.previewOrder.validationCode);
                        newOrderObject.validationCode = dataFromValidateOrder.previewOrder.validationCode;
                        // Replace the object with the one containing the validationCode
                        $("#idEdtOrderModel").val(JSON.stringify(newOrderObject));
                        // ..and continue
                        successCallback(newOrderObject);
                    }
                } else {
                    window.alert("Order cannot be placed! See warnings below for the reason.");
                }
            },
            apiErrorCallback
        );
    }

    /**
     * Create an order object, from the textarea input.
     * @return {Object} The newOrderObject.
     */
    function createNewOrderObject() {
        var inputText = $("#idEdtOrderModel").val().toString();
        /** @type {Object} */
        var newOrderObject = null;
        try {
            newOrderObject = JSON.parse(inputText);
        } catch (e) {
            console.error(e);
        }
        if (newOrderObject !== null && typeof newOrderObject === "object") {
            return newOrderObject;
        }
        apiErrorCallback("The order model is not a valid JSON object. Missing a quote? Comma instead of dot?");
        throw "Invalid JSON input: " + inputText;
    }

    /**
     * Validate an order to the portfolio and risk appetite of the customer and if warning is accepted, place the order.
     * @return {void}
     */
    function placeOrder() {

        /**
         * Place the order after the validation.
         * @param {Object} internalNewOrderObject The order model.
         * @return {void}
         */
        function internalPlaceOrder(internalNewOrderObject) {
            api.orders.placeOrder(
                activeAccountNumber,
                internalNewOrderObject,
                function (dataFromPlaceOrder) {
                    console.log("Placed order with number: " + dataFromPlaceOrder.ordersCollection.orders[0].number);
                    delete internalNewOrderObject.validationCode;
                    // Replace the object with one without the validationCode
                    $("#idEdtOrderModel").val(JSON.stringify(internalNewOrderObject));
                    if (!streamer.orders.isActive) {
                        displayOrdersActive();
                    }
                },
                function (error) {
                    // Something went wrong, for example, there is no money to buy something.
                    // However, show the list of orders.
                    displayOrdersActive();
                    apiErrorCallback(error);
                }
            );
        }

        var newOrderObject = createNewOrderObject();
        alertIfActiveAccountIsReadOnly();
        if (newOrderObject.hasOwnProperty("validationCode")) {
            internalPlaceOrder(newOrderObject);
        } else {
            previewOrder(newOrderObject, internalPlaceOrder);
        }
    }

    /**
     * Get the instrumentId from the order object. Multiple, if it is a multi leg order.
     * @param {Object} newOrderObject The order model.
     * @return {Array<string>} Returns an array of instrumentIds
     */
    function getInstrumentsFromOrderObject(newOrderObject) {
        var instrumentIds = [];
        // Extract the instrument(s) from the order object
        if (newOrderObject.hasOwnProperty("cash")) {
            instrumentIds[instrumentIds.length] = newOrderObject.cash.instrumentId;
        } else if (newOrderObject.hasOwnProperty("srd")) {
            instrumentIds[instrumentIds.length] = newOrderObject.srd.instrumentId;
        } else if (newOrderObject.hasOwnProperty("future")) {
            instrumentIds[instrumentIds.length] = newOrderObject.future.instrumentId;
        } else if (newOrderObject.hasOwnProperty("option")) {
            instrumentIds[instrumentIds.length] = newOrderObject.option.leg1.instrumentId;
            if (newOrderObject.option.hasOwnProperty("leg2")) {
                instrumentIds[instrumentIds.length] = newOrderObject.option.leg2.instrumentId;
            }
        }
        return instrumentIds;
    }

    /**
     * Display the price breakdown of an order.
     * @return {void}
     */
    function displayOrderCosts() {

        /**
         * Display the price breakdown after the validation.
         * @param {Object} internalNewOrderObject The order model.
         * @return {void}
         */
        function internalDisplayOrderCosts(internalNewOrderObject) {

            /**
             * Translate the object to a line.
             * @param {Object} category The (sub)category.
             * @return {string} Text containing the description of the costs detail.
             */
            function addCostsLine(category) {
                if (category.hasOwnProperty("valueInEuro")) {
                    return category.name + " (" + currencyCodeToSymbol("EUR") + " " + category.valueInEuro.toFixed(2) + " - " + category.percentage + "%" + ")\n";
                }
                return category.name + " (" + category.extraInfo + ")";
            }

            /**
             * Callback to display the price breakdown.
             * @param {Object} dataFromOrderCosts The response.
             * @return {string} Text containing the description of the costs.
             */
            function convertCostsToText(dataFromOrderCosts) {
                var result = "";
                var legCounter;  // Normally 1 leg, 2 in case of an option strategy.
                var leg;
                var categoryCounter;
                var category;
                var subCategoryCounter;
                var subCategory;
                for (legCounter = 0; legCounter < dataFromOrderCosts.costsCollection.legs.length; legCounter += 1) {
                    leg = dataFromOrderCosts.costsCollection.legs[legCounter];
                    result += "Leg " + (legCounter + 1) + ":\n";
                    for (categoryCounter = 0; categoryCounter < leg.categories.length; categoryCounter += 1) {
                        category = leg.categories[categoryCounter];
                        result += addCostsLine(category);
                        for (subCategoryCounter = 0; subCategoryCounter < category.subCategories.length; subCategoryCounter += 1) {
                            subCategory = category.subCategories[subCategoryCounter];
                            result += "- " + addCostsLine(subCategory);
                        }
                    }
                }
                return result;
            }

            delete internalNewOrderObject.validationCode;
            api.orders.getCosts(
                activeAccountNumber,
                internalNewOrderObject,
                function (dataFromOrderCosts) {
                    window.alert(convertCostsToText(dataFromOrderCosts));
                },
                apiErrorCallback
            );
        }

        var newOrderObject = createNewOrderObject();
        alertIfActiveAccountIsReadOnly();
        if (newOrderObject.hasOwnProperty("validationCode")) {
            internalDisplayOrderCosts(newOrderObject);
        } else {
            previewOrder(newOrderObject, internalDisplayOrderCosts);
        }
    }

    /**
     * Display the price breakdown of an order.
     * @return {void}
     */
    function displayOrderKid() {

        /**
         * Although KID is applicable, we are not sure if there is actually a document is the correct language. Search for it.
         * @param {string} instrumentId The instrumentId where to find documents for.
         * @param {Array<Object>} resultsArray The list of documents which can be downloaded.
         * @return {Object} The ajax request.
         */
        function getKidDocumentLink(instrumentId, resultsArray) {
            return api.instruments.getKidDocumentLink(
                instrumentId,
                activeAccountNumber,
                function (data) {
                    var kid;
                    var i;
                    for (i = 0; i < data.kidCollection.kids.length; i += 1) {
                        kid = data.kidCollection.kids[i];
                        resultsArray[resultsArray.length] = {
                            "name": kid.name + ".pdf",
                            "id": kid.kidId,
                            "instrumentId": instrumentId
                        };
                    }
                },
                apiErrorCallback
            );
        }

        /**
         * Download documentation about an instrument, to comply with PRIIPs.
         * @param {string} instrumentId Identification of the instrument.
         * @param {string} kidId Identification of the document.
         * @param {string} fileName Name of the document, with extension.
         * @return {void}
         */
        function downloadKidDocument(instrumentId, kidId, fileName) {
            console.log("Preparing download for document " + fileName);
            api.instruments.getKidDocument(
                instrumentId,
                kidId,
                activeAccountNumber,
                function (data) {
                    // Old browsers have sometimes handy features:
                    if (typeof window.navigator.msSaveBlob === "function") {
                        window.navigator.msSaveBlob(data, fileName);
                    } else {
                        var blob = data;
                        var link = document.createElement("a");
                        link.href = window.URL.createObjectURL(blob);
                        link.download = fileName;
                        document.body.appendChild(link);
                        link.click();
                    }
                },
                apiErrorCallback
            );
        }

        var newOrderObject = createNewOrderObject();
        var instrumentIds = getInstrumentsFromOrderObject(newOrderObject);
        alertIfActiveAccountIsReadOnly();
        // First, we need to know if the KID regime applies for one or more instruments
        api.instruments.getInstrument(
            instrumentIds,
            activeAccountNumber,
            function (dataFromInstrument) {
                var kidApplicableInstruments = [];
                var promises = [];
                var resultsArray = [];
                var i;
                for (i = 0; i < dataFromInstrument.instrumentsCollection.instruments.length; i += 1) {
                    if (dataFromInstrument.instrumentsCollection.instruments[i].isKidApplicable) {
                        // There might be documentation about this instrument.
                        kidApplicableInstruments[kidApplicableInstruments.length] = dataFromInstrument.instrumentsCollection.instruments[i].id;
                    }
                }
                if (kidApplicableInstruments.length > 0) {
                    if (window.confirm("There might be documentation available about the instrument(s) to trade. Do you want to search for documentation?")) {
                        // Build the promise
                        for (i = 0; i < kidApplicableInstruments.length; i += 1) {
                            promises[promises.length] = getKidDocumentLink(kidApplicableInstruments[i], resultsArray);
                        }
                        // Wait for the search to complete..
                        $.when.apply($, promises).done(function () {
                            var documentsList = [];
                            var j;
                            for (j = 0; j < resultsArray.length; j += 1) {
                                documentsList[documentsList.length] = resultsArray[j].name;
                                downloadKidDocument(resultsArray[j].instrumentId, resultsArray[j].id, resultsArray[j].name);
                            }
                            if (documentsList.length > 0) {
                                window.alert("Document(s) available for reading:\n\n" + documentsList.join("\n"));
                            } else {
                                window.alert("No documents found.");
                            }
                        });
                    }
                } else {
                    window.alert("This instrument has no KID documentation (not KID applicable).");
                }
            },
            apiErrorCallback
        );
    }

    /**
     * Start listening to the news feed.
     * @return {void}
     */
    function activateRealtimeNews() {
        if (!streamer.news.isActive) {
            // Activate the realtime news feed
            toggleNewsButtonText(true);
            streamer.start(
                function () {
                    streamer.news.activate();
                }
            );
        } else {
            streamer.news.deActivate();
            toggleNewsButtonText(false);
        }
    }

    /**
     * Start listening to the order updates feed.
     * @return {void}
     */
    function activateRealtimeOrderUpdates() {
        if (!streamer.orders.isActive) {
            // Activate the realtime order update feed
            toggleOrderEventsButtonText(true);
            streamer.start(
                function () {
                    streamer.orders.activate();
                }
            );
        } else {
            streamer.orders.deActivate();
            toggleOrderEventsButtonText(false);
        }
    }

    /**
     * Test the connection and if any, show the version of API in the title.
     * @return {void}
     */
    function displayVersions() {

        function displayApiVersion() {
            api.version.getVersion(
                function (data) {
                    var newTitle = "API " + data.currentVersion + " (" + new Date(data.buildDate).toLocaleString() + ")";
                    console.log("Received api version " + data.currentVersion + " build @ " + new Date(data.buildDate).toLocaleString() + ", request time " + new Date(data.metadata.timestamp).toLocaleString());
                    if (document.title !== newTitle) {
                        document.title = newTitle;
                    }
                    $("#idTestApiConnection").text("Test api connection: OK");
                },
                function (error) {
                    $("#idTestApiConnection").text("Test api connection: " + error);
                }
            );
        }

        function displayStreamerVersion() {
            streamer.getVersion(
                function (data) {
                    console.log("Received streamer version " + data.currentVersion + " build @ " + new Date(data.buildDate).toLocaleString());
                    $("#idTestStreamerConnection").text("Test streamer connection: OK");
                },
                function (error) {
                    $("#idTestStreamerConnection").text("Test streamer connection: " + error);
                }
            );
        }

        displayApiVersion();
        displayStreamerVersion();
    }

    /**
     * Display, for demo purposes, the URL used to request the login page.
     * @return {void}
     */
    function populateLoginUrl() {
        var websiteUrl = configurationFromBackend.websiteUrl.replace("{country}", getCultureForLogin().substring(0, 2));
        $("#idLoginUrl").text(api.getLogonUrl(getRealm()));
        $("#idWebsiteUrl").html('<a href="' + websiteUrl + '" target="_blank">' + websiteUrl + "</a>");
    }

    /**
     * Display, for demo purposes, the URL used to request the login page - add realm text.
     * @return {void}
     */
    function populateLoginUrlFromCulture() {
        switch (getCultureForLogin()) {
        case "fr":
            $("#idEdtRealm").val("binckfrapi");
            break;
        case "frBE":
        case "nlBE":
            $("#idEdtRealm").val("binckbeapi");
            break;
        case "it":
            $("#idEdtRealm").val("binckitapi");
            break;
        case "nl":
            $("#idEdtRealm").val("bincknlapi");
            break;
        }
        populateLoginUrl();
    }

    /**
     * This callback is triggered when a new token is available.
     * @param {Object} tokenObject Fresh token.
     * @return {void}
     */
    function newTokenCallback(tokenObject) {
        $("#idBearerToken").text(tokenObject.access_token);
        if (isFirstToken === true) {
            // User is authenticated
            isFirstToken = false;
            $("#idUnauthenticatedPart").hide();
            $("#idAuthenticatedPart").show();
            $("#idBtnLoginOrLogout").on("click", function (evt) {
                evt.preventDefault();
                streamer.stop();
                api.sessions.abortSession(
                    function (dataFromAbortSession) {
                        window.alert(dataFromAbortSession.message);
                    },
                    apiErrorCallback
                );
            }).val("Sign out");
            $("#idEdtScope").val(tokenObject.scope);
            $("#idEdtRealm").val(api.getState().realm);
            $("#idRefreshToken").on("click", function () {
                api.getRefreshToken(function (dataFromRefreshToken) {
                    console.log("Token refresh completed: " + dataFromRefreshToken.access_token);
                }, apiErrorCallback);
            });
            $("#idEdtAccountType").val(api.getState().account);
            $("#idBtnOrdersActive").on("click", displayOrdersActive);
            $("#idBtnOrdersHistory").on("click", displayOrdersHistory);
            $("#idBtnOrder").on("click", placeOrder);
            $("#idBtnQuotesBook").on("click", displayOrderBookFeed);
            $("#idBtnQuotesHist").on("click", displayHistoricalQuotes);
            $("#idBtnOrderCosts").on("click", displayOrderCosts);
            $("#idBtnOrderKID").on("click", displayOrderKid);
            $("#idBtnUpdateBalances").on("click", displayBalance);
            $("#idBtnUpdatePositions").on("click", displayPositions);
            $("#idBtnUpdatePerformance").on("click", displayPerformances);
            $("#idBtnFind").on("click", displayInstrumentSearchResults);
            $("input[type=radio][name=instrumentSearchType]").on("change", displayInstrumentSearchResults);
            $("input[type=radio][name=orderType]").on("change", displayInstrumentSearchResults);
            $("#idBtnActivateRealtimeOrderUpdates").on("click", activateRealtimeOrderUpdates);
            $("#idBtnActivateRealtimeNews").on("click", activateRealtimeNews);
            $("#idBtnUpdateTransactions").on("click", function () {
                displayTransactions("");
            });
            $("#idTransactionsFilter a[href]").on("click", function (e) {
                e.preventDefault();
                displayTransactions($(this).data("code").toString());
            });
            $("#idInstrumentsLists a[href]").on("click", function (e) {
                e.preventDefault();
                displayInstrumentList($(this).data("code").toString());
            });
            displayAccounts();
        } else {
            streamer.extendSubscriptions();
        }
    }

    /**
     * This callback is triggered periodically, to publish the minutes until token refresh. Only for demo purposes.
     * @param {number} minutesTillExpiration Minutes left until expiration.
     * @return {void}
     */
    function expirationCounterCallback(minutesTillExpiration) {
        console.log("Token expires in " + minutesTillExpiration + " minutes.");
    }

    /**
     * Make sure there are times shown in the console logging.
     * @return {void}
     */
    function prefixConsoleLog() {

        /**
         * Prefix a number with zero's, so times are displayed as 09:31:02.
         * @param {number} num The number to be padded.
         * @param {number} size How much zero's to add to the number (when 2: 4 will be 04 and 12 remains 12).
         * @return {string} The padded number
         */
        function pad(num, size) {
            var numWithPrefix = new Array(size).join("0") + num;
            return numWithPrefix.substr(-size);
        }

        console.logCopy = console.log.bind(console);
        console.log = function (data) {
            var now = new Date();
            var logPrefix = "[" + now.getFullYear() + "-" + pad(now.getMonth() + 1, 2) + "-" + pad(now.getDate(), 2) + " " + pad(now.getHours(), 2) + ":" + pad(now.getMinutes(), 2) + ":" + pad(now.getSeconds(), 2) + "." + pad(now.getMilliseconds(), 3) + "] ";
            this.logCopy(logPrefix, data);
        };
    }

    /**
     * This callback is triggered the configuration is retrieved from the server.
     * @param {Object} configData Contains clientId, authentication URI and other configuration.
     * @return {void}
     */
    function initPage(configData) {
        configurationFromBackend = configData;
        api = new Api(getConfiguration, newTokenCallback, expirationCounterCallback);
        streamer = new Streamer(
            configurationFromBackend.streamerUrl,
            getSubscription,
            quotesCallback,
            newsCallback,
            orderExecutionsCallback,
            orderModificationsCallback,
            orderEventsCallback,
            apiStreamerErrorCallback
        );
        // Not authenticated yet - hide login stuff
        $("#idAuthenticatedPart").hide();
        // Show QR Code, for demo purposes
        document.getElementById("idQrCode").src = "https://chart.googleapis.com/chart?cht=qr&chs=500x500&chl=" + encodeURIComponent(window.location.href);
        // Authorize
        api.checkState(
            function () {
                // Not authenticated
                $("#idEdtRealm").val(getConfiguration().realm);
                $("#idEnvironment").text(configurationFromBackend.apiUrl);
                populateLoginUrl();
                $("#idEdtCulture").on("change input", populateLoginUrlFromCulture);
                $("#idEdtAccountType, #idEdtCulture, #idEdtRealm, #idEdtScope").on("change input", populateLoginUrl);
                $("#idBtnLoginOrLogout").on("click", function (evt) {
                    evt.preventDefault();
                    api.navigateToLoginPage(getRealm());
                }).val("Sign in");
                // Display the version of the API every 45 seconds, so we can wait for an update
                window.setInterval(displayVersions, 45 * 1000);
                displayVersions();
            },
            apiErrorCallback
        );
    }

    prefixConsoleLog();
    // This app cannot be loaded in the browser using the file: protocol (file:///C:/inetpub/wwwroot/index.html).
    if (location.protocol === "file:") {
        window.alert("This app must run in a web server, since there is a backend involved.");
        throw "Protocol 'file:' not allowed.";
    }
    // Retrieve the application configuration from the server
    new Server().getDataFromServer(
        serverConnection.appServerUrl,
        {"requestType": "config"},
        true,
        initPage,
        function (errorObject) {
            apiErrorCallback(JSON.stringify(errorObject));
        }
    );
});
