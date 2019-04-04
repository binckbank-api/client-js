<?php

/*
 *
 * This is the file token.php, used to retrieve a token for using the API.
 * Example: http://www.domain.com/binck/server/token.php?code=05f8d801-8399-4b1a-a66d-cadda65523a6&realm=bincknlapi
 *
 * clientId: The client identification of your app, supplied by Binck
 * clientSecret: The secret which gives access to the API
 *
 */

// Set your return content type
header('Content-Type: application/json; charset=utf-8');

$configuration = json_decode('{
    "clientId": "enter_production_client_id",
    "clientSecret": "enter_production_secret",
    "authenticationProviderUrl": "https://login.binck.com/am/oauth2/",
    "redirectUrl": "https://your.host.here/app",
    "apiUrl": "https://api.binck.com/api/v1",
    "streamerUrl": "https://realtime.binck.com/stream/v1"
}');

/**
 * Return an error in the same format as used by the API
 * @param string $message The message to return in the JSON response.
 */
function handleErrorAndDie($message) {
    http_response_code(500);
    die(
        json_encode(
            array(
                'developerMessage' => $message,
                'endUserMessage' => '',
                'errorCode' => 'Forbidden',
                'errorId' => 405
            )
        )
    );
}

/**
 * Return the configuration, so configuration can be in one place
 */
function handleConfigResponse() {
    global $configuration;
    echo json_encode(
        array(
            'clientId' => $configuration->clientId,
            'authenticationProviderUrl' => $configuration->authenticationProviderUrl,
            'apiUrl' => $configuration->apiUrl,
            'streamerUrl' => $configuration->streamerUrl,
            'redirectUrl' => $configuration->redirectUrl
        )
    );
}

/**
 * Return the bearer token
 * @param boolean $isRefresh Initial retrieval, or refresh?
 * @param string $realm The realm used for the session.
 * @param string $code If it is an initial request, this argument must contain the code, otherwise this is the refresh token.
 */
function handleAuthenticationResponse($isRefresh, $realm, $code) {
    global $configuration;
    if ($isRefresh == true) {
        // Refresh the token with a refresh_token
        $data = array(
            'client_id' => $configuration->clientId,
            'client_secret' => $configuration->clientSecret,
            'grant_type' => 'refresh_token',
            'refresh_token' => $code);
    } else {
        // Initial request for a token with a code
        $data = array(
            'client_id' => $configuration->clientId,
            'client_secret' => $configuration->clientSecret,
            'redirect_uri' => $configuration->redirectUrl,
            'grant_type' => 'authorization_code',
            'code' => $code);
    }
    $options = array(
        'http' => array(
            'header'  => "Content-type: application/x-www-form-urlencoded\r\n",
            'method'  => 'POST',
            'content' => http_build_query($data),
            'ignore_errors' => true
        ),
        'ssl' => array(
            // This Mozilla CA certificate store is downloaded from:
            // https://curl.haxx.se/docs/caextract.html
            // This bundle was generated at Wed Jan 23 04:12:09 2019 GMT.
            'cafile' => 'cacert-2019-01-23.pem',
            'verify_peer' => true,
            'verify_peer_name' => true
        )
    );
    $context  = stream_context_create($options);
    $url = $configuration->authenticationProviderUrl.'realms/'.urlencode($realm).'/access_token';
    $result = @file_get_contents($url, false, $context);
    if (!$result) {
        handleErrorAndDie(error_get_last()['message']);
    }
    if (property_exists(json_decode($result), 'error')) {
        http_response_code(500);
    } else if (property_exists(json_decode($result), 'code')) {
        http_response_code(json_decode($result)->code);
    }
    echo $result;
}

if (isset($_GET['config'])) {
    // Only return the configuration (clientId), to have this in one place
    handleConfigResponse();
} elseif (isset($_GET['realm']) && isset($_GET['code'])) {
    handleAuthenticationResponse(
        false,  // Not a refresh
        filter_input(INPUT_GET, 'realm', FILTER_SANITIZE_STRING),
        filter_input(INPUT_GET, 'code', FILTER_SANITIZE_STRING)
    );
} elseif (isset($_GET['realm']) && isset($_GET['refresh_token'])) {
    handleAuthenticationResponse(
        true,  // Refresh
        filter_input(INPUT_GET, 'realm', FILTER_SANITIZE_STRING),
        filter_input(INPUT_GET, 'refresh_token', FILTER_SANITIZE_STRING)
    );
} else {
    handleErrorAndDie('Parameters are missing. Required are "realm" and "code" or "refresh_token".');
}