/*jslint this: true, browser: true, for: true, single: true, long: true */
/*global window $ alert confirm console Api Streamer InstrumentRow OrderBookRow QuoteSubscriptionLevel */

$(function () {
    "use strict";

    /**
     * Get the selected realm.
     * @return {string}
     */
    function getRealm() {
        return $("#idEdtRealm").val().toString();
    }

    /**
     * Get the language for the login dialog and exception if login is not successful
     * @return {string}
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

        // Sandbox
        var selectedAuthenticationProviderUrl = "https://oauth2.sandbox.binck.com/openam/oauth2/";  // This is the URL of the authentication provider to be used.
        //var selectedAuthenticationProviderUrl = "https://login.sandbox.binck.com/am/";  // This is the URL of the authentication provider to be used.
        var selectedApiUrl = "https://api.sandbox.binck.com/api/v1/"; // This is the URL to the API of Binck sandbox.
        var selectedClientId = "enter_client_id";
        // HTTPS is required for production use!
        var selectedRedirectUrl = "http://localhost/";
        // HTTPS is required for production use!
        var selectedAppServerUrl = "http://localhost/server/sandbox/";
        var selectedStreamingQuotesUrl = "http://localhost:61821/quotes";

        /*
        // Production
        var selectedAuthenticationProviderUrl = "https://oauth2.binck.com/openam/oauth2/";  // This is the URL of the authentication provider to be used.
        //var selectedAuthenticationProviderUrl = "https://login.binck.com/am/";  // This is the URL of the authentication provider to be used.
        var selectedApiUrl = "https://api.binck.com/api/v1/"; // This is the URL to the API of Binck production.
        var selectedClientId = "enter_client_id";
        // HTTPS is required for real production use!
        var selectedRedirectUrl = "http://localhost/";
        // HTTPS is required for real production use!
        var selectedAppServerUrl = "http://localhost/server/prod/";
        var selectedStreamingQuotesUrl = "http://localhost:61821/quotes";
        */

        // THE VALUES BELOW ARE REWRITTEN BY IMAGE/RUNTIME.SH AT STARTUP OF THE EXAMPLE SITE CONTAINER.
        // PLEASE KEEP THE KEYS THE SAME!
        var configurationObject = {
            "clientId": selectedClientId,
            "accountType": $("#idEdtAccountType").val(),
            "redirectUrl": selectedRedirectUrl,
            "realm": "bincknlapi",
            "authenticationProviderUrl": selectedAuthenticationProviderUrl,
            "apiUrl": selectedApiUrl,
            "appServerUrl": selectedAppServerUrl,
            "streamingQuotesUrl": selectedStreamingQuotesUrl,
            "language": getCultureForLogin(),
            "scope": $("#idEdtScope").val()
        };

        return configurationObject;
    }

    /**
     * Detect the IP addresses to be white listed (requirement for phase 1).
     * @return {void}
     */
    function getIpToWhitelist() {
        console.log("Requesting IP from server");
        $.ajax({
            "dataType": "json",
            "type": "GET",
            "url": getConfiguration().appServerUrl + "token.php",
            "cache": false,
            "success": function (data) {
                $("#idIpServer").html("IP server: <b>" + data["ip-server"] + "</b> Test connection from server: " + data.connection + "<br />");
            }
        });
        console.log("Requesting IP from client");
        $.ajax({
            "dataType": "json",
            "type": "GET",
            "url": "http://www.basement.nl/ip.php",
            "cache": false,
            "success": function (data) {
                $("#idIpClient").html("IP client: <b>" + data.ip + "</b>");
            }
        });
    }

    /**
     * This is the callback when communication errors appear.
     * @param {string} error The error to be shown.
     * @return {void}
     */
    function apiErrorCallback(error) {
        alert("Something went wrong: " + error);
    }

    /**
     * This is the callback when communication errors appear in the streamer.
     * @param {string} errorCode The error to be shown.
     * @param {string} description The error to be shown.
     * @return {void}
     */
    function apiStreamerErrorCallback(errorCode, description) {
        alert("Something went wrong: " + description + " (" + errorCode + ")");
        if (errorCode === "disconnected") {
            streamer.start(function () {
                console.log("Reconnected to the streamer.");
            });
        }
    }

    /** @type {string} */
    var activeAccountNumber;
    /** @type {Object} */
    var api = new Api(getConfiguration);
    /** @type {Date} */
    var nextDelayLogTime = new Date();  // Log the delay on the connection every minute
    /** @type {Array<Object>} */
    var instrumentList;

    /**
     * The streamer needs the account and token, to validate the subscription.
     * @return {Object}
     */
    function getSubscription() {
        return {
            "activeAccountNumber": activeAccountNumber,
            "accessToken": $("#idBearerToken").text()
        };
    }

    /**
     * Publish the received quote object
     * @param {Object} quoteMessagesObject
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

    /** @type {Object} */
    var streamer = new Streamer(getConfiguration, getSubscription, quoteCallback, apiStreamerErrorCallback);

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
                alert("Name: " + instrument.name + (instrument.hasOwnProperty("isincode")
                    ? "\nISIN code: " + instrument.isincode
                    : ""));
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
     * Showcase of the streaming API.
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
                    settingsHtml = "Trading in advanced instruments is not allowed";
                } else {
                    settingsHtml = "Advanced instruments allowed:";
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
                alert("Position: " + position.instrument.name);
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
                    alert("Derivative symbol " + symbol + " not found for this account type.");
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
                alert(symbols);
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
     * Display the instruments returned in the search response.
     * @param {Object} instrumentsData The response of the instruments endpoint.
     * @return {void}
     */
    function displayInstruments(instrumentsData) {
        var instrument;
        var i;
        var instrumentsHtml;
        if (instrumentsData.instrumentsCollection.instruments.length === 0) {
            alert("No instrument found");
        } else {
            instrumentsHtml = "Found " + instrumentsData.count + " instruments. First " + (instrumentsData.paging.limit + 1) + ":";
            for (i = 0; i < instrumentsData.instrumentsCollection.instruments.length; i += 1) {
                instrument = instrumentsData.instrumentsCollection.instruments[i];
                instrumentsHtml += '<br /><a href="#" data-code="' + instrument.id + '" data-decimals="' + instrument.priceDecimals + '">' + instrument.name + "</a> (mic " + instrument.marketIdentificationCode + ")";
            }
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
        api.instruments.findByName(
            searchText,
            null,
            activeAccountNumber,
            displayInstruments,
            apiErrorCallback
        );
    }

    /**
     * Search for an instrument by ISIN code.
     * @return {void}
     */
    function displayInstrumentIsinResults() {
        var isin = $("#idEdtInstrumentIsin").val().toString();
        api.instruments.findByIsin(
            isin,
            null,
            null,
            activeAccountNumber,
            displayInstruments,
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
                alert("Number of legs in order " + orderNumber + ": " + data.ordersCollection.orders.length);
            },
            apiErrorCallback
        );
    }

    /**
     * Change the limit price of an active order.
     * @param {Object} modifyOrderModel The order modification.
     * @param {function()} successCallback When successful, this function is called.
     * @return {void}
     */
    function modifyOrder(modifyOrderModel, successCallback) {
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
                    if (warningsToBeConfirmed !== "" && !confirm(warningsToBeConfirmed)) {
                        isAllOrderConfirmationsApprovedByUser = false;
                    }
                    // Second, if there are general warnings, show them to the user. Can be in a dialog, or just on the order ticket window.
                    if (!confirm(warningsToBeShown + "Order can be placed. Do you want to continue?")) {
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
                    alert("Order cannot be placed!\n\n" + warningsToBeShown);
                }
            },
            apiErrorCallback
        );
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
                        orderHtml = '<a href="#order" data-code="' + order.number + '">' + order.number + "</a> " + (order.hasOwnProperty("side")
                            ? order.side + " "
                            : "") + order.quantity + " x " + order.instrument.name + " (expires " + new Date(order.expirationDate).toLocaleDateString() + ") state: " + order.lastStatus;
                        if (order.lastStatus === "placed") {
                            orderHtml += ' <a href="#cancel" data-code="' + order.number + '">cancel</a>';
                        } else if (order.lastStatus === "placementConfirmed" || order.lastStatus === "modified") {
                            orderHtml += ' <a href="#modify" data-code="' + order.number + '">modify</a>';
                            orderHtml += ' <a href="#cancel" data-code="' + order.number + '">cancel</a>';
                        }
                    }
                    ordersHtml += orderHtml + "<br />";
                }
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
                            displayOrders();
                            alert("Order has been canceled");
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
                            displayOrders();
                            alert("Order has been modified");
                        }
                    );
                });
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

    /**
     * Validate an order to the portfolio and risk appetite of the customer and if warning is accepted, place the order.
     * @param {Array<string>} instrumentIds The instrument identification. If strategy, multiple instrument ids are involved.
     * @param {Object} newOrderModel The order to place.
     * @param {function()} successCallback When successful, this function is called.
     * @return {void}
     */
    function placeOrder(instrumentIds, newOrderModel, successCallback) {

        /**
         * Although KID is applicable, we are not sure if there is actually a document is the correct language. Search for it.
         * @param {string} instrumentId The instrumentId where to find documents for.
         * @param {Array<Object>} resultsArray The list of documents which can be downloaded.
         * @return {Object}
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
         * Check if the order can be placed, looking at the existing portfolio and risk appetite. And if so, place the order.
         * @return {void}
         */
        function validateAndPlaceOrder() {
            api.orders.validateNewOrder(
                activeAccountNumber,
                newOrderModel,
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
                        if (warningsToBeConfirmed !== "" && !confirm(warningsToBeConfirmed)) {
                            isAllOrderConfirmationsApprovedByUser = false;
                        }
                        // Second, if there are general warnings, show them to the user. Can be in a dialog, or just on the order ticket window.
                        if (!confirm(warningsToBeShown + "Order can be placed. Do you want to continue?")) {
                            isAllOrderConfirmationsApprovedByUser = false;
                        }
                        if (isAllOrderConfirmationsApprovedByUser) {
                            // Copy the validationCode into the newOrderModel, to proceed with the order
                            console.log("Validation code: " + dataFromValidateOrder.previewOrder.validationCode);
                            newOrderModel.validationCode = dataFromValidateOrder.previewOrder.validationCode;
                            api.orders.placeOrder(
                                activeAccountNumber,
                                newOrderModel,
                                function (dataFromPlaceOrder) {
                                    console.log("Placed order with number: " + dataFromPlaceOrder.ordersCollection.orders[0].number);
                                    successCallback();
                                },
                                function (error) {
                                    // Something went wrong, for example, there is no money to buy something.
                                    // However, show the list of orders.
                                    displayOrders();
                                    apiErrorCallback(error);
                                }
                            );
                        }
                    } else {
                        alert("Order cannot be placed!\n\n" + warningsToBeShown);
                    }
                },
                apiErrorCallback
            );
        }

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
                    if (confirm("There might be documentation available about the instrument(s) to trade. Do you want to search for documentation?")) {
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
                                alert("Document(s) available for reading:\n\n" + documentsList.join("\n"));
                            } else {
                                alert("No documents found");
                            }
                            validateAndPlaceOrder();
                        });
                    } else {
                        validateAndPlaceOrder();
                    }
                } else {
                    validateAndPlaceOrder();
                }
            },
            apiErrorCallback
        );
    }

    /**
     * Find a stock using the search text box. Buy 1 piece of it.
     * @return {void}
     */
    function orderSomething() {
        var searchText = $("#idEdtInstrumentName").val().toString();
        api.instruments.findByName(
            searchText,
            "equity",
            activeAccountNumber,
            function (data) {
                var instrument;
                var newOrderModel = {
                    "type": "limit",
                    "quantity": 1,
                    "duration": "day",
                    "limitPrice": 4,
                    "cash": {
                        "side": "buy",
                        "instrumentId": ""
                    }
                };
                if (data.instrumentsCollection.instruments.length === 0) {
                    alert("No stock found with name " + searchText);
                } else {
                    // We pick the first instrument from the search results. This is probably the one we want to buy.
                    instrument = data.instrumentsCollection.instruments[0];
                    console.log("Found instrument. Placing order in " + instrument.name);
                    newOrderModel.cash.instrumentId = instrument.id;
                    placeOrder([instrument.id], newOrderModel, displayOrders);
                }
            },
            apiErrorCallback
        );
    }

    /**
     * Buy 1 option.
     * @return {void}
     */
    function orderOption() {
        var newOrderModel = {
            "type": "limit",
            "limitPrice": 10.05,
            "quantity": 1,
            "duration": "day",
            "option": {
                "leg1": {
                    "side": "sell",
                    "instrumentId": "BAqlx"  // IBM C JAN 2019
                }
            }
        };
        placeOrder(["BAqlx"], newOrderModel, displayOrders);
    }

    /**
     * Buy 1 future.
     * @return {void}
     */
    function orderFuture() {
        var newOrderModel = {
            "type": "limit",
            "limitPrice": 10.00,
            "quantity": 1,
            "duration": "day",
            "future": {
                "side": "sell",
                "instrumentId": "OMAJP"  // FDAX SEP 2018
            }
        };
        placeOrder(["OMAJP"], newOrderModel, displayOrders);
    }

    /**
     * Buy 1 SRD.
     * @return {void}
     */
    function orderSrd() {
        var newOrderModel = {
            "type": "limit",
            "limitPrice": 10.05,
            "quantity": 1,
            "duration": "day",
            "srd": {
                "side": "sell",
                "instrumentId": "nmyRj"  // C BCK DEC 2018 8.00
            }
        };
        placeOrder(["nmyRj"], newOrderModel, displayOrders);
    }

    /**
     * Buy 1 option strategy.
     * @return {void}
     */
    function orderMultiLegOption() {
        var newOrderModel = {
            "type": "limit",
            "limitPrice": 10.05,
            "quantity": 1,
            "duration": "day",
            "option": {
                "leg1": {
                    "side": "buy",
                    "instrumentId": "nmyRj"  // C BCK DEC 2018 8.00
                },
                "leg2": {
                    "side": "buy",
                    "instrumentId": "lVD1M"  // P BCK DEC 2018 7.00
                }
            }
        };
        placeOrder(["nmyRj", "lVD1M"], newOrderModel, displayOrders);
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
                $("#idTestConnectionFromClient").html("Test connection from client: OK");
            },
            function (error) {
                $("#idTestConnectionFromClient").html("Test connection from client: " + error);
            }
        );
    }

    /**
     * Display, for demo purposes, the URL used to request the login page.
     * @return {void}
     */
    function populateLoginUrl() {
        $("#idLoginUrl").text(api.getLogonUrl(getRealm()));
    }

    // Not authenticated yet. Hide login stuff.
    $("#idAuthenticatedPart").hide();
    // Authorize.
    api.checkState(
        function () {
            // Not authenticated
            getIpToWhitelist();
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
        function (data) {
            // User is authenticated
            $("#idUnauthenticatedPart").hide();
            $("#idAuthenticatedPart").show();
            $("#idBtnLoginOrLogout").on("click", function (evt) {
                evt.preventDefault();
                api.sessions.abortSession(
                    function (data) {
                        alert(data.message);
                    },
                    apiErrorCallback
                );
            }).val("Sign out");
            $("#idBearerToken").text(data.access_token);
            $("#idEdtScope").val(data.scope);
            $("#idEdtRealm").val(api.getState().realm);
            $("#idRefreshToken").on("click", function () {
                api.getRefreshToken(function (data) {
                    $("#idBearerToken").text(data.access_token);
                }, apiErrorCallback);
            });
            $("#idEdtAccountType").val(api.getState().account);
            $("#idBtnOrders").on("click", displayOrders);
            $("#idBtnOrder").on("click", orderSomething);
            $("#idBtnOrderOption").on("click", orderOption);
            $("#idBtnOrderMultiLegOption").on("click", orderMultiLegOption);
            $("#idBtnOrderFuture").on("click", orderFuture);
            $("#idBtnOrderSrd").on("click", orderSrd);
            $("#idBtnUpdatePositions").on("click", displayPositions);
            $("#idBtnFind").on("click", displayInstrumentSearchResults);
            $("#idBtnFindIsin").on("click", displayInstrumentIsinResults);
            $("#idTransactionsFilter a[href]").on("click", function (e) {
                e.preventDefault();
                displayTransactions($(this).data("code").toString());
            });
            $("#idInstrumentsLists a[href]").on("click", function (e) {
                e.preventDefault();
                displayInstrumentList($(this).data("code").toString());
            });
            displayAccounts();
        },
        apiErrorCallback
    );
});
