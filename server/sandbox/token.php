<?php

// This is the file token.php, used to retrieve a token for using the API.
// The token can be requested with a code, supplied as parameter of the redirect URI.

// Example: http://www.domain.com/binck/server/sandbox/token.php?code=05f8d801-8399-4b1a-a66d-cadda65523a6&realm=bincknlapi&redirect_uri=http%3A%2F%2Fwww.domain.com%2Fbinck%2Fdemo.php

// Set your return content type
header('Content-Type: application/json; charset=utf-8');

$clientId = 'enter_sandbox_client_id';
$clientSecret = 'enter_sandbox_secret';

// Sandbox:
$authenticationProviderUrl = 'https://login.sandbox.binck.com/am/oauth2/';

/**
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
 * @param boolean $isRefresh Initial retrieval, or refresh?
 * @param string $realm The realm used for the session.
 * @param string $code If it is an initial request, this argument must contain the code, otherwise this is the refresh token.
 * @param string $redirect_uri The redirection URL, for validation purposes.
 */
function doAuthenticationResponse($isRefresh, $realm, $code, $redirect_uri) {
    global $authenticationProviderUrl;
    global $clientId;
    global $clientSecret;
    if ($isRefresh == true) {
        // Refresh the token with a refresh_token
        $data = array(
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'grant_type' => 'refresh_token',
            'refresh_token' => $code);
    } else {
        // Initial request for a token with a code
        $data = array(
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirect_uri,
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
    $url = $authenticationProviderUrl.'realms/'.urlencode($realm).'/access_token';
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

if (isset($_GET['realm']) && isset($_GET['code']) && isset($_GET['redirect_uri'])) {
    doAuthenticationResponse(
        false,  // Not a refresh
        filter_input(INPUT_GET, 'realm', FILTER_SANITIZE_STRING),
        filter_input(INPUT_GET, 'code', FILTER_SANITIZE_STRING),
        filter_input(INPUT_GET, 'redirect_uri', FILTER_SANITIZE_STRING)
    );
} elseif (isset($_GET['realm']) && isset($_GET['refresh_token']) && isset($_GET['redirect_uri'])) {
    doAuthenticationResponse(
        true,  // Refresh
        filter_input(INPUT_GET, 'realm', FILTER_SANITIZE_STRING),
        filter_input(INPUT_GET, 'refresh_token', FILTER_SANITIZE_STRING),
        filter_input(INPUT_GET, 'redirect_uri', FILTER_SANITIZE_STRING)
    );
} else {
    handleErrorAndDie('Parameters are missing. Required are "realm", "redirect_uri" and "code" or "refresh_token".');
}
