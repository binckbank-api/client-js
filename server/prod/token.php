<?php

// error_reporting(E_ALL);
// ini_set('display_errors', 1);

// This is the file token.php, used to retrieve a token for using the API.
// The token can be requested with a code, supplied as parameter of the redirect URI.

// Example: http://www.domain.com/binck/token.php?code=05f8d801-8399-4b1a-a66d-cadda65523a6&realm=bincknlapi&redirect_uri=http%3A%2F%2Fwww.domain.com%2Fbinck%2Fdemo.php

// Set your return content type
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$clientId = 'enter_client_id';
$clientSecret = 'p@ssw0rd';

// Production:
$authenticationProviderUrl = 'https://oauth2.binck.com/openam/oauth2/';
$apiUrl = 'https://api.binck.com/api/v1/';

function handleError($message) {
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

function tryAddToArray($value, &$array) {
    if ((trim($value) != '') && (!in_array($value, $array))) {
        $array[] = $value;
    }
}

function getMyIp() {
    $ip_array = [];
    $ip = @file_get_contents('http://www.basement.nl/ip.php');
    if (!$ip) {
        // Something went wrong..
    } else {
        tryAddToArray(json_decode($ip) -> ip, $ip_array);
    }
    tryAddToArray(gethostbyname(gethostname()), $ip_array);
    try {
        tryAddToArray(getenv('SERVER_ADDR'), $ip_array);
    } catch (Exception $e) {
        // Ignore
    }
    try {
        tryAddToArray(getenv('LOCAL_ADDR'), $ip_array);
    } catch (Exception $e) {
        // Ignore
    }

    return implode(', ', $ip_array);
}

function doDefaultResponse() {
    // This function just returns the two IP addresses which are used in the connection.
    
    global $apiUrl;
    ini_set('default_socket_timeout', 5);
    $options = array(
        // Hack to disable unsafe certificate checking. Not meant for production!
        'ssl' => array(
            'verify_peer' => false,
            'verify_peer_name' => false
        )
    );
    $context  = stream_context_create($options);

    $version = @file_get_contents($apiUrl.'version', false, $context);
    if (!$version) {
        $connection = error_get_last()['message'];
    } else {
        $connection = 'OK';
    }
    $info_array = array(
        'ip-client' => getenv('REMOTE_ADDR'),
        'ip-server' => getMyIp(),
        'connection' => $connection
    );
    echo json_encode($info_array);
}

function doAuthenticationResponse($isRefresh, $realm, $code, $redirect_uri) {
    global $authenticationProviderUrl;
    global $clientId;
    global $clientSecret;
    if ($isRefresh == true) {
        // Refresh the token with a refresh_token
        error_log('Refresh token with code ' . $code);
        $data = array(
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'grant_type' => 'refresh_token',
            'refresh_token' => $code);
    } else {
        // Initial request for a token with a code
        error_log('Request token with code ' . $code);
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
        // Hack to disable unsafe certificate checking. Not meant for production!
        'ssl' => array(
            'verify_peer' => false,
            'verify_peer_name' => false
        )
    );

    $context  = stream_context_create($options);

    $url = $authenticationProviderUrl.'access_token?realm='.urlencode($realm);
    error_log('Used URL ' . $url);

    $result = @file_get_contents($url, false, $context);

    if (!$result) {
        handleError(error_get_last()['message']);
    }
    if (property_exists(json_decode($result), 'error')) {
        http_response_code(500);
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
    doDefaultResponse();
}
