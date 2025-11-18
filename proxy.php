<?php
header("Content-Type: application/json");
// Restrict CORS (optional): same-origin by default; set a whitelist below if needed.
$origin = $_SERVER["HTTP_ORIGIN"] ?? null;
$allowedOrigins = [
    // Example: "https://vista.example.com",
    // "http://localhost:5173",
    // "http://localhost:8080",
];
if ($origin && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: " . $origin);
    header("Vary: Origin");
}

$otpEndpoints = [
    "ara" => "https://otp-ara.maasify.io/otp/routers/default/index/graphql",
    "bfc" => "https://otp-bfc.maasify.io/otp/routers/default/index/graphql",
    "bre" => "https://otp-bre.maasify.io/otp/routers/default/index/graphql",
    "caraibe" => "https://otp-caraibe.maasify.io/otp/routers/default/index/graphql",
    "cor" => "https://otp-cor.maasify.io/otp/routers/default/index/graphql",
    "cvl" => "https://otp-cvl.maasify.io/otp/routers/default/index/graphql",
    "ges" => "https://otp-ges.maasify.io/otp/routers/default/index/graphql",
    "gf" => "https://otp-gf.maasify.io/otp/routers/default/index/graphql",
    "hdf" => "https://otp-hdf.maasify.io/otp/routers/default/index/graphql",
    "idf" => "https://otp-idf.maasify.io/otp/routers/default/index/graphql",
    "mar" => "https://otp-mar.maasify.io/otp/routers/default/index/graphql",
    "naq" => "https://otp-naq.maasify.io/otp/routers/default/index/graphql",
    "nor" => "https://otp-nor.maasify.io/otp/routers/default/index/graphql",
    "occ" => "https://otp-occ.maasify.io/otp/routers/default/index/graphql",
    "paca" => "https://otp-paca.maasify.io/otp/routers/default/index/graphql",
    "pdl" => "https://otp-pdl.maasify.io/otp/routers/default/index/graphql",
    "re" => "https://otp-re.maasify.io/otp/routers/default/index/graphql"
];

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Méthode non autorisée"]);
    exit;
}

$payload = json_decode(file_get_contents("php://input"), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(["error" => "Payload JSON invalide"]);
    exit;
}

$region = $payload["region"] ?? null;
$query = $payload["query"] ?? null;
$variables = $payload["variables"] ?? null;

if (!$region || !$query) {
    http_response_code(400);
    echo json_encode(["error" => "Paramètres requis : region, query"]);
    exit;
}

if (!isset($otpEndpoints[$region])) {
    http_response_code(400);
    echo json_encode(["error" => "Région inconnue"]);
    exit;
}

$querySize = is_string($query) ? strlen($query) : 0;
if ($querySize > 10000) {
    http_response_code(413);
    echo json_encode(["error" => "Requête GraphQL trop volumineuse"]);
    exit;
}

$endpoint = $otpEndpoints[$region];
$forwardPayload = json_encode([
    "query" => $query,
    "variables" => $variables
]);

$ch = curl_init($endpoint);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $forwardPayload);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Content-Type: application/json",
    "Content-Length: " . strlen($forwardPayload)
]);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

$responseBody = curl_exec($ch);
$curlErr = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($responseBody === false) {
    http_response_code(500);
    echo json_encode(["error" => "Erreur cURL : " . $curlErr]);
    exit;
}

if ($httpCode >= 400) {
    http_response_code($httpCode);
}

echo $responseBody;
