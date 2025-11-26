<?php
/**
 * maptiler-proxy.php
 * Proxy léger pour contourner les problèmes CORS lors du chargement des tuiles MapTiler depuis le navigateur.
 * Usage côté client : appeler ce fichier avec le paramètre GET `url` qui pointe vers une ressource MapTiler.
 * Exemple : /maptiler-proxy.php?url=https%3A%2F%2Fapi.maptiler.com%2Ftiles%2Fv3%2F0%2F0%2F0.pbf%3Fkey%3Dxxxxx
 */

$allowedHosts = [
    "api.maptiler.com",
    "fonts.maptiler.com",
    "tile-assets.maptiler.com"
];

$cacheRoot = __DIR__ . "/cache/maptiler";
if (!is_dir($cacheRoot)) {
    @mkdir($cacheRoot, 0775, true);
}

function infer_cache_ttl(string $url): int
{
    $lower = strtolower($url);
    if (str_contains($lower, ".style.json") || str_ends_with($lower, ".json") || str_contains($lower, ".json?")) {
        return 86400; // 24h pour les styles/manifests
    }
    if (preg_match("/\.(pbf|mvt)(\?|$)/", $lower)) {
        return 3600; // 1h pour les tuiles vectorielles
    }
    if (preg_match("/\.(png|jpg|jpeg|webp)(\?|$)/", $lower)) {
        return 86400;
    }
    return 600; // fallback 10 min
}

function serve_cached_response(array $meta, string $bodyPath): void
{
    if (!is_file($bodyPath)) {
        return;
    }
    http_response_code($meta["status"] ?? 200);
    header("Content-Type: " . ($meta["content_type"] ?? "application/octet-stream"));
    header("Content-Length: " . filesize($bodyPath));
    header("Cache-Control: public, max-age=" . ($meta["ttl"] ?? 600));
    header("X-Cache: HIT");
    readfile($bodyPath);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    http_response_code(405);
    header("Content-Type: application/json");
    echo json_encode(["error" => "Méthode non autorisée"]);
    exit;
}

$targetUrl = $_GET["url"] ?? "";
if (!$targetUrl) {
    http_response_code(400);
    header("Content-Type: application/json");
    echo json_encode(["error" => "Paramètre `url` requis"]);
    exit;
}

$decodedUrl = filter_var($targetUrl, FILTER_SANITIZE_URL);
$parsed = parse_url($decodedUrl);
if (!$parsed || empty($parsed["scheme"]) || empty($parsed["host"])) {
    http_response_code(400);
    header("Content-Type: application/json");
    echo json_encode(["error" => "URL cible invalide"]);
    exit;
}

$host = strtolower($parsed["host"]);
if (!in_array($host, $allowedHosts, true)) {
    http_response_code(403);
    header("Content-Type: application/json");
    echo json_encode(["error" => "Hôte non autorisé"]);
    exit;
}

$cacheTtl = infer_cache_ttl($decodedUrl);
$cacheKey = sha1($decodedUrl);
$cacheMetaPath = $cacheRoot ? $cacheRoot . "/" . $cacheKey . ".json" : null;
$cacheBodyPath = $cacheRoot ? $cacheRoot . "/" . $cacheKey . ".bin" : null;

if ($cacheTtl > 0 && $cacheMetaPath && $cacheBodyPath && is_file($cacheMetaPath) && is_file($cacheBodyPath)) {
    $meta = json_decode(@file_get_contents($cacheMetaPath), true);
    $storedAt = $meta["stored_at"] ?? 0;
    if ($meta && ($storedAt + $cacheTtl) > time()) {
        serve_cached_response($meta + ["ttl" => $cacheTtl], $cacheBodyPath);
    }
}

$referer = getenv("MAPTILER_ALLOWED_REFERER") ?: (($_SERVER["HTTP_HOST"] ?? "localhost") ? ("http://" . ($_SERVER["HTTP_HOST"] ?? "localhost")) : null);
$userAgent = "VistaMaptilerProxy/1.0";

$ch = curl_init($decodedUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 20);
curl_setopt($ch, CURLOPT_HTTPHEADER, array_filter([
    $referer ? "Referer: {$referer}" : null,
    "User-Agent: {$userAgent}"
]));

$response = curl_exec($ch);
if ($response === false) {
    $err = curl_error($ch);
    curl_close($ch);
    http_response_code(502);
    header("Content-Type: application/json");
    echo json_encode(["error" => "Erreur proxy MapTiler", "details" => $err]);
    exit;
}

$statusCode = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: "application/octet-stream";
curl_close($ch);

$rawHeaders = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);

if ($cacheTtl > 0 && $cacheMetaPath && $cacheBodyPath && $statusCode < 500 && $statusCode !== 429) {
    @file_put_contents($cacheBodyPath, $body);
    @file_put_contents($cacheMetaPath, json_encode([
        "status" => $statusCode ?: 200,
        "content_type" => $contentType,
        "stored_at" => time(),
        "ttl" => $cacheTtl
    ]));
}

http_response_code($statusCode ?: 200);
header("Content-Type: " . $contentType);
header("Content-Length: " . strlen($body));
header("Cache-Control: public, max-age=" . $cacheTtl);
header("X-Cache: MISS");

echo $body;

