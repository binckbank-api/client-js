<?php

/*
 *
 * Settings production:
 * This is the file config.php, containing the configuration of the API.
 *
 * clientId: The client identification of your app, supplied by Binck (App Key)
 * clientSecret: The secret which gives access to the API (App Secret)
 * redirectUrl: The URL of your app, which is used to redirect after both a successful or unsuccessful login
 *
 */

// Configuration for Sandbox:
$configuration = json_decode('{
    "clientId": "enter_sandbox_client_id",
    "clientSecret": "enter_sandbox_secret",
    "redirectUrl": "https://your.host.here/app",
    "authenticationProviderUrl": "https://login.sandbox.binck.com/am/oauth2/",
    "apiUrl": "https://api.sandbox.binck.com/api/v1",
    "streamerUrl": "https://realtime.sandbox.binck.com/stream/v1",
    "websiteUrl": "https://web.sandbox.binck.{country}/Logon"
}');

/*
// Configuration for Production:
$configuration = json_decode('{
    "clientId": "enter_production_client_id",
    "clientSecret": "enter_production_secret",
    "redirectUrl": "https://your.host.here/app",
    "authenticationProviderUrl": "https://login.binck.com/am/oauth2/",
    "apiUrl": "https://api.binck.com/api/v1",
    "streamerUrl": "https://realtime.binck.com/stream/v1",
    "websiteUrl": "https://web.binck.{country}/Logon"
}');
*/
