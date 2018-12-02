/*jslint this: true, browser: true, for: true, single: true, long: true */
/*global window $ console Api Streamer InstrumentRow OrderBookRow QuoteSubscriptionLevel */

$(function () {
    "use strict";

    /** @type {string} */
    var activeAccountNumber;
    /** @type {boolean} */
    var isActiveAccountReadonly = true;
    /** @type {Object} */
    var api;
    /** @type {Object} */
    var streamer;
    /** @type {Date} */
    var nextDelayLogTime = new Date();  // Log the delay on the connection every minute
    /** @type {Array<Object>} */
    var instrumentList;
    /** @type {boolean} */
    var isFirstToken = true;

    /**
     * Get the selected realm.
     * @return {string} Realm selected when login page was loaded
     */
    function getRealm() {
        return $("#idEdtRealm").val().toString();
    }

    /**
     * Get the language for the login dialog and exception if login is not successful
     * @return {string} Culture code selected when login page was loaded
     */
    function getCultureForLogin() {
        return $("#idEdtCulture").val().toString();
    }

    function getConfiguration() {
        // clientId is the "Consumer key"
        // clientSecret is the "Consumer secret" and cannot be in frontend app
        // realm for Italian customers is binckitapi
        // scope can be "read write" (mutation rights) and "read" (readonly)
        // scope is depending on Application rights, password or just what is desired.

        var environment = "Sandbox";  // Active environment. Can be Sandbox, or Production.

        var selectedAuthenticationProviderUrl;  // This is the URL of the authentication provider to be used.
        var selectedApiUrl;  // This is the URL to the API of Binck of the local process.
        var selectedStreamerUrl;  // This is the URL to the streamer, providing real time prices, order updates, portfolio updates and news.
        var selectedClientId;  // This is the identifier of your application.
        var selectedRedirectUrl;  // This is the landing URL of your application, after logging in. HTTPS is required for production use.
        var selectedAppServerUrl;  // This is the server of your application, used to request and refresh the token. HTTPS is required for production use.

        switch (environment.toLowerCase()) {
        case "sandbox":
            // Sandbox (PS)
            selectedAuthenticationProviderUrl = "https://login.sandbox.binck.com/am/oauth2/";
            selectedApiUrl = "https://api.sandbox.binck.com/api/v1/";
            selectedStreamerUrl = "https://realtime.sandbox.binck.com/stream/v1";
            selectedClientId = "enter_client_id";
            selectedRedirectUrl = "https://your.host.here/";
            selectedAppServerUrl = "https://your.host.here/server/sandbox/";
            break;
        case "production":
            // Production (P)
            selectedAuthenticationProviderUrl = "https://login.binck.com/am/oauth2/";
            selectedApiUrl = "https://api.binck.com/api/v1/";
            selectedStreamerUrl = "https://realtime.binck.com/stream/v1";
            selectedClientId = "enter_client_id";
            selectedRedirectUrl = "https://your.host.here/";
            selectedAppServerUrl = "https://your.host.here/server/sandbox/";
            break;
        }

        var configurationObject = {
            "clientId": selectedClientId,
            "accountType": $("#idEdtAccountType").val(),
            "redirectUrl": selectedRedirectUrl,
            "realm": "bincknlapi",
            "authenticationProviderUrl": selectedAuthenticationProviderUrl,
            "apiUrl": selectedApiUrl,
            "appServerUrl": selectedAppServerUrl,
            "streamerUrl": selectedStreamerUrl,
            "language": getCultureForLogin(),
            "scope": $("#idEdtScope").val()
        };

        return configurationObject;
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
     * @return {Object} Json object with account and token
     */
    function getSubscription() {
        return {
            "activeAccountNumber": activeAccountNumber,
            "accessToken": $("#idBearerToken").text()
        };
    }

    /**
     * Publish the received quote object
     * @param {Object} quoteMessagesObject The object received by the streamer
     * @return {void}
     */
    function quoteCallback(quoteMessagesObject) {
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
     * @param {Object} newsObject The object received by the streamer
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
     * @param {Array<number>} instrumentIds instruments in order of rows.
     * @param {Object} subscriptions Quote collection, limited to subscriptions.
     * @return {void}
     */
    function displayQuoteSubscriptions(instrumentIds, subscriptions) {
        var i;
        var position;
        var subscription;
        for (i = 0; i < subscriptions.length; i += 1) {
            subscription = subscriptions[i];
            position = $.inArray(subscription.instrumentId, instrumentIds);
            instrumentList[position].setTitle(instrumentList[position].getTitle() + " [" + subscription.subscriptionLevel + "]");
        }
    }

    /**
     * Showcase of the streaming quotes API.
     * @param {Object} instruments Instruments collection.
     * @return {void}
     */
    function displayQuotesFeed(instruments) {
        var i;
        var instrument;
        var instrumentIds = [];
        // Delete all active subscriptions
        $.topic("RemoveInstrumentList").publish();
        instrumentList = [];
        for (i = 0; i < instruments.length; i += 1) {
            instrument = instruments[i];
            instrumentIds[instrumentIds.length] = instrument.id;
            instrumentList[instrumentList.length] = new InstrumentRow(streamer, $("#idInstrumentsList"), instrument.id, instrument.name + " (" + currencyCodeToSymbol(instrument.currency) + ")", instrument.priceDecimals);
        }
        streamer.activateSubscriptions();
        api.quotes.getQuotes(activeAccountNumber, instrumentIds, "none", function (data) {
            displayQuoteSubscriptions(instrumentIds, data.quotesCollection.quotes);
        }, apiErrorCallback);
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
                window.alert("Position: " + position.instrument.name);
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
                        positionsHtml += '<a href="#' + position.instrument.id + '" data-code="' + position.instrument.id + '">' + position.quantity + " x " + position.instrument.name + " (" + position.currency + " " + position.value.toFixed(2) + ")</a><br />";
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
     * Show the tradable options with a certain symbol.
     * @param {string} symbol The symbol of the derivate.
     * @param {number} pagingOffset The start of the requested range.
     * @return {void}
     */
    function displayDerivativeSeriesBySymbol(symbol, pagingOffset) {
        var maxArrayLength = 50;  // This is an example of the use of the paging. The default max is 100.
        var limit = pagingOffset + (maxArrayLength - 1);
        api.instruments.getDerivativeSheetBySymbol(
            symbol,
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
                    displayDerivativeSeriesBySymbol(symbol, data.paging.offset + maxArrayLength);
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
                $("#idSelectedAccount").text($("#idSelectedAccount").text() + " - balance: " + balance.assetsTotalValue.toFixed(2));
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
                var performanceHtml = "Total " + year + ": " + data.summary.currency + " " + data.summary.total.toFixed(2) + " (realized " + data.summary.realized.toFixed(2) + ", unrealized " + data.summary.unrealized.toFixed(2) + ")<br />";
                var i;
                var performance;
                if (data.performancesCollection.performances.length === 0) {
                    performanceHtml = "No performance found.";
                } else {
                    for (i = 0; i < data.performancesCollection.performances.length; i += 1) {
                        performance = data.performancesCollection.performances[i];
                        performanceHtml += performance.instrument.name + ": " + performance.currency + " " + performance.annual.toFixed(2) + "<br />";
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
                var performanceHtml = "Total: " + data.summary.currency + " " + data.summary.total.toFixed(2) + " (realized " + data.summary.realized.toFixed(2) + ", unrealized " + data.summary.unrealized.toFixed(2) + ")<br />";
                var i;
                var performance;
                if (data.performancesCollection.performances.length === 0) {
                    performanceHtml = "No performance found.";
                } else {
                    for (i = 0; i < data.performancesCollection.performances.length; i += 1) {
                        performance = data.performancesCollection.performances[i];
                        performanceHtml += '<a href="#" data-code="' + performance.year + '">' + performance.year + "</a>: " + performance.currency + " " + performance.total.toFixed(2) + "<br />";
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
     * @param {string} instrumentId The id of the underlying instrument.
     * @return {void}
     */
    function displayDerivativeClassesByInstrument(instrumentId) {
        api.instruments.getDerivativeSheetByInstrument(
            instrumentId,
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
     * @param {string} instrumentId instrument for which to show the streaming order book.
     * @param {number} priceDecimals Number of decimals used to format the price.
     * @return {void}
     */
    function displayOrderbookFeed(instrumentId, priceDecimals) {
        var i;
        // Delete all active subscriptions
        $.topic("RemoveOrderBook").publish();
        for (i = 1; i <= 5; i += 1) {
            new OrderBookRow(streamer, $("#idOrderBook"), instrumentId, i, priceDecimals);
        }
        streamer.activateSubscriptions();
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
                }
                $("#idNewsForInstrument").html(newsHtml);
            },
            apiErrorCallback
        );
    }

    /**
     * Populate the order object with the found instrument from the search response.
     * @param {Object} instrumentsData The response of the instruments endpoint.
     * @return {void}
     */
    function prepareOrder(instrumentsData) {
        var instrument;
        var instrumentsHtml = "";
        var orderType = $("input[name=orderType]:checked").val();
        var newOrderObject = {
            "type": orderType,
            "quantity": 1,
            "duration": "day"
        };
        if (instrumentsData.instrumentsCollection.instruments.length === 0) {
            window.alert("No instrument found with the name '" + $("#idEdtInstrumentName").val().toString() + "'.\n\nMaybe the instrument is not available for the selected account type?");
        } else {
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
            // We found one result
            instrument = instrumentsData.instrumentsCollection.instruments[0];
            // Populate the newOrderObject
            switch (instrument.type) {
            case "option":
                newOrderObject.option = {
                    "leg1": {
                        "side": "buy",
                        "instrumentId": instrument.id
                    }
                };
                break;
            case "future":
                newOrderObject.future = {
                    "side": "buy",
                    "instrumentId": instrument.id
                };
                break;
            case "srd":
                newOrderObject.srd = {
                    "side": "buy",
                    "instrumentId": instrument.id
                };
                break;
            default:
                newOrderObject.cash = {
                    "side": "buy",
                    "instrumentId": instrument.id
                };
            }
            $("#idEdtOrderModel").val(JSON.stringify(newOrderObject));
            // Get recent news updates about this instrument
            displayNews(instrument.id);
            // And show the instrument
            instrumentsHtml += '<a href="#" data-code="' + instrument.id + '" data-decimals="' + instrument.priceDecimals + '">' + instrument.name + "</a> (mic " + instrument.marketIdentificationCode + ")";
            // Remove previously bound events.
            $("#idSearchResults a[href]").off("click");
            $("#idSearchResults").html(instrumentsHtml);
            $("#idSearchResults a[href]").on("click", function (e) {
                var instrumentId = $(this).data("code").toString();
                var decimals = parseInt($(this).data("decimals").toString(), 10);
                e.preventDefault();
                displayDerivativeClassesByInstrument(instrumentId);
                // Start streaming order book. Check if streamer is already started, is done before starting.
                streamer.start(
                    function () {
                        // Show the order book of the instrument
                        displayOrderbookFeed(instrumentId, decimals);
                    }
                );
            });
        }
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
            prepareOrder,
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
                isActiveAccountReadonly = account.isReadOnly;
                // This call requires an account type:
                displaySettings();
                displayPositions();
                displayTransactions("");
                displayPerformances();
                displayInstrumentSearchResults();
                displayDerivativeSeriesBySymbol("BCK", 0);
                $("#idSelectedAccount").text(account.iban);
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
                var defaultAccountTypeToFind = api.getState().account;
                var isDefaultAccountTypeFound = false;
                var defaultAccount = 0;
                var accountsHtml = "";
                var rights;
                var i;
                if (data.accountsCollection.accounts.length === 0) {
                    accountsHtml = "No accounts found.";
                } else {
                    for (i = 0; i < data.accountsCollection.accounts.length; i += 1) {
                        account = data.accountsCollection.accounts[i];
                        if (account.isReadonly) {
                            rights = "readonly";
                        } else {
                            rights = "mutation";
                        }
                        if (!isDefaultAccountTypeFound && account.type === defaultAccountTypeToFind) {
                            isDefaultAccountTypeFound = true;
                            defaultAccount = i;
                        }
                        accountsHtml += '<a href="#" data-code="' + account.number + '">' + account.iban + " " + account.name + "</a> (" + rights + ")<br />";
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
    function alertIfActiveAccountIsReadonly() {
        if (isActiveAccountReadonly) {
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
        alertIfActiveAccountIsReadonly();
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
     * Display orders. Highlight the new order.
     * @return {void}
     */
    function displayOrders() {
        api.orders.getOrders(
            activeAccountNumber,
            "all",
            "",
            function (data) {
                var ordersHtml = "";
                var orderHtml;
                var i;
                var order;
                if (data.ordersCollection.orders.length === 0) {
                    ordersHtml = "No recent orders found.";
                } else {
                    for (i = 0; i < data.ordersCollection.orders.length; i += 1) {
                        order = data.ordersCollection.orders[i];
                        orderHtml = '<a href="#order" data-code="' + order.number + '">' + order.number + "</a> " + (
                            order.hasOwnProperty("side")
                            ? order.side + " "
                            : ""
                        ) + order.quantity + " x " + order.instrument.name + " (expires " + new Date(order.expirationDate).toLocaleDateString() + ") state: " + order.lastStatus;
                        if (order.lastStatus === "placed") {
                            orderHtml += ' <a href="#cancel" data-code="' + order.number + '">cancel</a>';
                        } else if (order.lastStatus === "placementConfirmed" || order.lastStatus === "modified") {
                            orderHtml += ' <a href="#modify" data-code="' + order.number + '">modify</a>';
                            orderHtml += ' <a href="#cancel" data-code="' + order.number + '">cancel</a>';
                        }
                        ordersHtml += orderHtml + "<br />";
                    }
                }
                populateOrdersList(ordersHtml, displayOrders);
            },
            apiErrorCallback
        );
    }

    /**
     * Showcase of the streaming order updates API: Change in positions.
     * @param {Object} orderObject The object received by the streamer
     * @return {void}
     */
    function orderExecutionsCallback(orderObject) {
        console.log("Order has (partially) been executed.");
        console.log(orderObject);
        window.alert("You just received an order execution for account " + orderObject.accountNumber);
    }

    /**
     * Showcase of the streaming order updates API: Change in pending order.
     * @param {Object} orderObject The object received by the streamer
     * @return {void}
     */
    function orderModificationsCallback(orderObject) {
        console.log("Order has been modified.");
        console.log(orderObject);
        window.alert("You just received an order modification for account " + orderObject.accountNumber);
    }

    /**
     * Showcase of the streaming order updates API: Change in order status.
     * @param {Object} orderObject The object received by the streamer
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
            ) + orderObject.quantity + " x " + orderObject.instrument.id + " /refresh to get full name/ (expires " + new Date(orderObject.expirationDate).toLocaleDateString() + ") state: " + orderObject.status;
            if (orderObject.status === "placed") {
                orderHtml += ' <a href="#cancel" data-code="' + orderObject.number + '">cancel</a>';
            } else if (orderObject.status === "placementConfirmed" || orderObject.status === "modified") {
                orderHtml += ' <a href="#modify" data-code="' + orderObject.number + '">modify</a>';
                orderHtml += ' <a href="#cancel" data-code="' + orderObject.number + '">cancel</a>';
            }
            currentOrdersHtml = orderHtml + "<br />" + currentOrdersHtml;
            populateOrdersList(currentOrdersHtml, displayOrders);
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
                    window.alert("Order cannot be placed!");
                }
            },
            apiErrorCallback
        );
    }

    /**
     * Create an order object, from the textarea input.
     * @return {Object} The newOrderObject
     */
    function createNewOrderObject() {
        var inputText = $("#idEdtOrderModel").val().toString();
        /** @type {Object} */
        var newOrderObject = JSON.parse(inputText);
        if (newOrderObject !== null && typeof newOrderObject === "object") {
            return newOrderObject;
        }
        throw "Invalid input: " + inputText;
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
                    displayOrders();
                },
                function (error) {
                    // Something went wrong, for example, there is no money to buy something.
                    // However, show the list of orders.
                    displayOrders();
                    apiErrorCallback(error);
                }
            );
        }

        var newOrderObject = createNewOrderObject();
        alertIfActiveAccountIsReadonly();
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
             * Callback to display the price breakdown.
             * @param {Object} dataFromOrderCosts The response.
             * @return {string} Text containing the description of the costs
             */
            function convertCostsToText(dataFromOrderCosts) {
                var result = "";
                var legCounter;  // Normally 1, 2 of option combination.
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
                        result += category.type + " (" + category.valueInEuro.toFixed(2) + "):\n";
                        for (subCategoryCounter = 0; subCategoryCounter < category.subCategories.length; subCategoryCounter += 1) {
                            subCategory = category.subCategories[subCategoryCounter];
                            result += "- " + (
                                subCategory.type === "other"
                                ? subCategory.costCategory
                                : subCategory.type
                            ) + " (" + subCategory.valueInEuro.toFixed(2) + ")\n";
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
        alertIfActiveAccountIsReadonly();
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
         * @return {Object} The ajax request
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
                        resultsArray[resultsArray.length] = {name: kid.name + ".pdf", id: kid.kidId, instrumentId: instrumentId};
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
        alertIfActiveAccountIsReadonly();
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
        if (!streamer.isNewsActivated) {
            // Activate the realtime news feed
            toggleNewsButtonText(true);
            streamer.start(
                function () {
                    streamer.activateNews();
                }
            );
        } else {
            streamer.deActivateNews();
            toggleNewsButtonText(false);
        }
    }

    /**
     * Start listening to the order updates feed.
     * @return {void}
     */
    function activateRealtimeOrderUpdates() {
        if (!streamer.isOrdersActivated) {
            // Activate the realtime order update feed
            toggleOrderEventsButtonText(true);
            streamer.start(
                function () {
                    streamer.activateOrders();
                }
            );
        } else {
            streamer.deActivateOrders();
            toggleOrderEventsButtonText(false);
        }
    }

    /**
     * Show the version in the title.
     * @return {void}
     */
    function displayVersion() {
        api.version.getVersion(
            function (data) {
                var newTitle = "API " + data.currentVersion + " (" + new Date(data.buildDate).toLocaleString() + ")";
                console.log("Received version " + data.currentVersion + " reply @ " + new Date(data.metadata.timestamp).toLocaleString());
                if (document.title !== newTitle) {
                    document.title = newTitle;
                }
                $("#idTestConnectionFromClient").text("Test connection from client: OK");
            },
            function (error) {
                $("#idTestConnectionFromClient").text("Test connection from client: " + error);
            }
        );
    }

    /**
     * Display, for demo purposes, the URL used to request the login page.
     * @return {void}
     */
    function populateLoginUrl() {
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
        $("#idLoginUrl").text(api.getLogonUrl(getRealm()));
    }

    /**
     * This callback is triggered when a new token is available.
     * @param {Object} tokenObject If the user is authenticated, this function is invoked
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
            $("#idBtnOrders").on("click", displayOrders);
            $("#idBtnOrder").on("click", placeOrder);
            $("#idBtnOrderCosts").on("click", displayOrderCosts);
            $("#idBtnOrderKID").on("click", displayOrderKid);
            $("#idBtnUpdatePositions").on("click", displayPositions);
            $("#idBtnFind").on("click", displayInstrumentSearchResults);
            $("input[type=radio][name=instrumentSearchType]").on("change", displayInstrumentSearchResults);
            $("input[type=radio][name=orderType]").on("change", displayInstrumentSearchResults);
            $("#idBtnActivateRealtimeOrderUpdates").on("click", activateRealtimeOrderUpdates);
            $("#idBtnActivateRealtimeNews").on("click", activateRealtimeNews);
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

    api = new Api(getConfiguration, newTokenCallback);
    streamer = new Streamer(
        getConfiguration,
        getSubscription,
        quoteCallback,
        newsCallback,
        orderExecutionsCallback,
        orderModificationsCallback,
        orderEventsCallback,
        apiStreamerErrorCallback
    );
    // Not authenticated yet. Hide login stuff.
    $("#idAuthenticatedPart").hide();
    // Show QR Code, for demo purposes
    document.getElementById("idQrCode").src = "https://chart.googleapis.com/chart?cht=qr&chs=500x500&chl=" + encodeURIComponent(window.location.href);
    // Authorize.
    api.checkState(
        function () {
            // Not authenticated
            $("#idEdtRealm").val(getConfiguration().realm);
            $("#idEnvironment").text(getConfiguration().apiUrl);
            populateLoginUrl();
            $("#idEdtAccountType, #idEdtCulture, #idEdtRealm, #idEdtScope").on("change input", populateLoginUrl);
            $("#idBtnLoginOrLogout").on("click", function (evt) {
                evt.preventDefault();
                api.navigateToLoginPage(getRealm());
            }).val("Sign in");
            // Display the version of the API every 15 seconds, so we can wait for an update
            window.setInterval(displayVersion, 15 * 1000);
            displayVersion();
        },
        apiErrorCallback
    );
});
