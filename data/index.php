<?php
declare(strict_types=1);

/**
 * Lightweight data relay used as a fallback when static JSON files
 * are not directly accessible (hosting restrictions, auth, etc.).
 *
 * Supported routes:
 *   - ?resource=regions
 *   - ?resource=aggregated
 *   - ?resource=region&code=<regionCode>
 */

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

$resource = strtolower((string)($_GET["resource"] ?? "regions"));
$regionsDir = __DIR__ . "/networks";

function respond_error(int $status, string $message): void
{
    http_response_code($status);
    echo json_encode([
        "status" => "error",
        "message" => $message
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function stream_json_file(string $path): void
{
    if (!is_file($path)) {
        respond_error(404, "Ressource introuvable");
    }
    $handle = fopen($path, "rb");
    if ($handle === false) {
        respond_error(500, "Impossible de lire la ressource");
    }
    while (!feof($handle)) {
        echo fread($handle, 8192);
    }
    fclose($handle);
    exit;
}

switch ($resource) {
    case "regions":
        stream_json_file(__DIR__ . "/regions.json");
        break;

    case "aggregated":
        stream_json_file(__DIR__ . "/networks.json");
        break;

    case "region":
        $code = strtolower((string)($_GET["code"] ?? ""));
        if ($code === "" || !preg_match("/^[a-z0-9_-]+$/", $code)) {
            respond_error(400, "Code région invalide");
        }
        stream_json_file($regionsDir . "/" . $code . ".json");
        break;

    default:
        respond_error(400, "Paramètre resource inconnu");
}

