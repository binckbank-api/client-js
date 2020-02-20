<?php

/*
 *
 * This is the file token.php, used to retrieve a token for using the API.
 *
 */

// Load the file with the settings:
require "config.php";

// Set your return content type
header('Content-Type: application/json; charset=utf-8');

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
            'redirectUrl' => $configuration->redirectUrl,
            'websiteUrl' => $configuration->websiteUrl
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
            // This bundle was generated at Wed Jan 1 04:12:10 2020 GMT.
            'cafile' => 'cacert-2020-01-01.pem',
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
    $result_object = json_decode($result);
    if (json_last_error() == JSON_ERROR_NONE) {
        if (property_exists($result_object, 'error')) {
            http_response_code(500);
        } else if (property_exists(json_decode($result), 'code')) {
            http_response_code(json_decode($result)->code);
        }
        echo $result;
    } else {
        // Something bad happened, no json in response (404 Not Found?)
        handleErrorAndDie($result);
    }
}

/**
 * Make sure no garbage is send to the token server
 * @param string $input_var Input variable to clean from wrong characters
 */
function sanitizeInputVar($input_var) {
    return filter_var($input_var, FILTER_SANITIZE_STRING, FILTER_FLAG_STRIP_LOW | FILTER_FLAG_STRIP_HIGH);
}

// Get and decode the post data
$request_params = json_decode(file_get_contents('php://input'));
if ($request_params == null || !isset($request_params->requestType)) {
    handleErrorAndDie('Missing parameters. Required is "requestType".');
}

// Get data
switch (sanitizeInputVar($request_params->requestType)) {
    case "config":
        // Only return the configuration
        handleConfigResponse();
        break;
    case "requestToken":
        // Request a token
        if (!isset($request_params->realm, $request_params->code)) {
            handleErrorAndDie('Missing parameters. For a new token realm and code are required.');
        }
        handleAuthenticationResponse(false, sanitizeInputVar($request_params->realm), sanitizeInputVar($request_params->code));
        break;
    case "refreshToken":
        // Request a new token
        if (!isset($request_params->realm, $request_params->refreshToken)) {
            handleErrorAndDie('Missing parameters. For a token refresh realm and refreshToken are required.');
        }
        handleAuthenticationResponse(true, sanitizeInputVar($request_params->realm), sanitizeInputVar($request_params->refreshToken));
        break;
    default:
        handleErrorAndDie('Missing parameters. Required is "requestType".');
}
