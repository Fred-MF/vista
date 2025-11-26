<?php
declare(strict_types=1);

ini_set("display_errors", "0");

require_once __DIR__ . "/auth_common.php";
header("Content-Type: application/json; charset=utf-8");
session_start();
if (!user_is_authorized()) {
    http_response_code(401);
    echo json_encode(["status" => "error", "message" => "Accès non autorisé"]);
    exit;
}

// Preflight diagnostics to surface common server issues as JSON (instead of Apache HTML 500)
if (!function_exists("curl_init")) {
    http_response_code(503);
    echo json_encode([
        "status" => "error",
        "message" => "Extension cURL manquante dans PHP. Activez cURL dans MAMP (php.ini) et redémarrez."
    ]);
    exit;
}
$dataDir = dirname(__DIR__) . "/data";
if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0775, true);
}
if (!is_writable($dataDir)) {
    http_response_code(503);
    echo json_encode([
        "status" => "error",
        "message" => "Le répertoire data/ n'est pas accessible en écriture par PHP (MAMP). Corrigez les permissions: " . $dataDir
    ]);
    exit;
}
$regionsDir = $dataDir . "/networks";
if (!is_dir($regionsDir)) {
    @mkdir($regionsDir, 0775, true);
}

$existingData = loadExistingAggregated($dataDir);
$existingGeneratedAt = null;
if (isset($existingData["generatedAt"]) && is_string($existingData["generatedAt"])) {
    $existingGeneratedAt = $existingData["generatedAt"];
}
$existingRegions = [];
if (isset($existingData["regions"]) && is_array($existingData["regions"])) {
    $existingRegions = $existingData["regions"];
}
if (empty($existingRegions)) {
    $existingRegions = loadExistingRegionFiles($regionsDir);
}

$diag = isset($_GET["diag"]) ? (string)$_GET["diag"] : null;
if ($diag === "1") {
    echo json_encode([
        "status" => "ok",
        "phpVersion" => PHP_VERSION,
        "curlLoaded" => function_exists("curl_init"),
        "dataDir" => $dataDir,
        "dataWritable" => is_writable($dataDir),
        "logFile" => __DIR__ . "/rebuild.log",
        "time" => gmdate(DATE_ATOM)
    ]);
    exit;
}

$scriptCompleted = false;
$logFile = __DIR__ . "/rebuild.log";
@file_put_contents($logFile, "[" . gmdate(DATE_ATOM) . "] Début reconstruction\n", FILE_APPEND);

register_shutdown_function(function () use (&$scriptCompleted) {
    if ($scriptCompleted) {
        return;
    }
    $error = error_get_last();
    if ($error) {
        http_response_code(500);
        header("Content-Type: application/json; charset=utf-8");
        echo json_encode([
            "status" => "error",
            "message" => "Erreur fatale : " . sanitizeError($error["message"])
        ]);
    }
});

set_error_handler(function ($severity, $message, $file, $line) use ($logFile) {
    @file_put_contents($logFile, "[ERREUR PHP] $message ($file:$line)\n", FILE_APPEND);
    throw new ErrorException($message, 0, $severity, $file, $line);
});

header("Content-Type: application/json; charset=utf-8");

set_time_limit(0);
@ini_set("memory_limit", "512M");

$regions = [
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

$onlyRegion = isset($_GET["region"]) ? (string)$_GET["region"] : null;
if ($onlyRegion !== null && $onlyRegion !== "" && isset($regions[$onlyRegion])) {
    $regions = [ $onlyRegion => $regions[$onlyRegion] ];
    @file_put_contents($logFile, "[info] Reconstruction limitée à la région {$onlyRegion}\n", FILE_APPEND);
}

$agencyListQuery = <<<'GQL'
{
  agencies {
    gtfsId
    name
  }
}
GQL;

$agencyRoutesQuery = <<<'GQL'
query AgencyRoutes($agencyId: String!) {
  agency(id: $agencyId) {
    gtfsId
    name
    routes {
      gtfsId
      shortName
      longName
    }
  }
}
GQL;

$routeStopsQuery = <<<'GQL'
query RouteStops($routeId: String!) {
  route(id: $routeId) {
    gtfsId
    shortName
    longName
    patterns {
      id
      stops {
        id
        gtfsId
        lat
        lon
      }
    }
  }
}
GQL;

$stopRealtimeProbeQuery = <<<'GQL'
query StopRealtimeProbe($id: String!, $startTime: Long!, $timeRange: Int!, $numberOfDepartures: Int!) {
  stop(id: $id) {
    stoptimesWithoutPatterns(
      startTime: $startTime,
      timeRange: $timeRange,
      numberOfDepartures: $numberOfDepartures,
      omitNonPickups: false,
      omitCanceled: false
    ) {
      realtime
      realtimeDeparture
      scheduledDeparture
      realtimeState
    }
  }
}
GQL;

$result = [
    "generatedAt" => gmdate(DATE_ATOM),
    "regions" => []
];

$errors = [];

foreach ($regions as $regionCode => $endpoint) {
    try {
        @file_put_contents($logFile, "[$regionCode] Début\n", FILE_APPEND);
        $networks = rebuildRegionViaAgencies(
            $regionCode,
            $endpoint,
            $agencyListQuery,
            $agencyRoutesQuery,
            $routeStopsQuery,
            $stopRealtimeProbeQuery,
            $logFile
        );
        $result["regions"][$regionCode] = $networks;
        @file_put_contents($logFile, "[$regionCode] OK (" . count($networks) . " réseaux)\n", FILE_APPEND);
    } catch (Throwable $e) {
        $errors[] = [
            "region" => $regionCode,
            "message" => $e->getMessage()
        ];
        @file_put_contents($logFile, "[$regionCode] ERREUR : " . $e->getMessage() . "\n", FILE_APPEND);
    }
}

$result["errors"] = $errors;
$processedRegionCodes = array_keys($result["regions"]);
$successCount = count($processedRegionCodes);

$mergedRegions = $existingRegions;
foreach ($result["regions"] as $code => $networks) {
    $mergedRegions[$code] = $networks;
}
$result["regions"] = $mergedRegions;

if ($successCount === 0 && $existingGeneratedAt) {
    $result["generatedAt"] = $existingGeneratedAt;
}

$outputPath = dirname(__DIR__) . "/data/networks.json";
$encoded = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

if ($encoded === false) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => "Échec de l'encodage JSON."
    ]);
    exit;
}

if (file_put_contents($outputPath, $encoded) === false) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => "Impossible d'écrire le fichier de sortie."
    ]);
    exit;
}

// Also write per-region files and a lightweight regions index for lazy loading
$regionCodes = array_keys($result["regions"]);
foreach ($result["regions"] as $code => $networks) {
    $regionalPath = $regionsDir . "/" . $code . ".json";
    @file_put_contents($regionalPath, json_encode($networks, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}
$regionsIndexPath = dirname(__DIR__) . "/data/regions.json";
@file_put_contents($regionsIndexPath, json_encode([
    "generatedAt" => $result["generatedAt"],
    "regions" => $regionCodes
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$statusCode = empty($errors) ? 200 : 207; // 207 Multi-Status si erreurs partielles
http_response_code($statusCode);
echo json_encode([
    "status" => empty($errors) ? "ok" : "partial",
    "generatedAt" => $result["generatedAt"],
    "errors" => $errors,
    "regionsProcessed" => $successCount,
    "regionsAvailable" => count($result["regions"])
]);
$scriptCompleted = true;
exit;

function rebuildRegionViaAgencies(
    string $regionCode,
    string $endpoint,
    string $listQuery,
    string $routesQuery,
    string $routeStopsQuery,
    string $realtimeProbeQuery,
    string $logFile
): array
{
    $listResponse = executeGraphQL($endpoint, $listQuery);
    $agencies = $listResponse["data"]["agencies"] ?? [];

    $networks = [];
    foreach ($agencies as $agencyInfo) {
        $agencyId = $agencyInfo["gtfsId"] ?? null;
        if (!$agencyId) {
            continue;
        }
        @file_put_contents($logFile, "[$regionCode][$agencyId] Routes…\n", FILE_APPEND);
        $detailResponse = executeGraphQL($endpoint, $routesQuery, ["agencyId" => $agencyId]);
        $agency = $detailResponse["data"]["agency"] ?? null;
        if (!$agency) {
            continue;
        }

        $routeList = $agency["routes"] ?? [];
        if (empty($routeList)) {
            continue;
        }

        $stopMap = [];
        $routeNames = [];
        $sampleStopIds = [];
        foreach ($routeList as $routeMeta) {
            $routeId = $routeMeta["gtfsId"] ?? null;
            if (!$routeId) {
                continue;
            }
            @file_put_contents($logFile, "[$regionCode][$agencyId][$routeId] Stops…\n", FILE_APPEND);
            $routeNames[] = $routeMeta["shortName"] ??
                $routeMeta["longName"] ??
                $routeId;

            // Requête dédiée pour récupérer les stops du route
            $routeResponse = executeGraphQL($endpoint, $routeStopsQuery, ["routeId" => $routeId]);
            $routeData = $routeResponse["data"]["route"] ?? null;
            if (!$routeData) {
                continue;
            }

            $patterns = $routeData["patterns"] ?? [];
            foreach ($patterns as $pattern) {
                $stops = $pattern["stops"] ?? [];
                foreach ($stops as $stop) {
                    $lat = $stop["lat"] ?? null;
                    $lon = $stop["lon"] ?? null;
                    if (!is_numeric($lat) || !is_numeric($lon)) {
                        continue;
                    }
                    $stopId = $stop["gtfsId"] ?? $stop["id"] ?? spl_object_hash((object)$stop);
                    if (isset($stopMap[$stopId])) {
                        continue;
                    }
                    $stopMap[$stopId] = [
                        "lat" => (float)$lat,
                        "lon" => (float)$lon
                    ];
                    // Collect sample stop IDs for realtime detection (max 5)
                    if (count($sampleStopIds) < 5 && !empty($stop["gtfsId"])) {
                        $sampleStopIds[] = $stop["gtfsId"];
                    }
                }
            }

            // Petite pause pour éviter de saturer l'API si nécessaire
            usleep(50000); // 50ms
        }

        $stops = array_values($stopMap);
        $stopCount = count($stops);
        if ($stopCount === 0) {
            continue;
        }

        $stats = computeStats($stops);
        $hasRealtime = detectRealtimeSupport(
            $endpoint,
            $realtimeProbeQuery,
            $sampleStopIds,
            $logFile
        );

        $networks[] = [
            "region" => $regionCode,
            "endpoint" => $endpoint,
            "agencyId" => $agency["gtfsId"],
            "name" => $agency["name"] ?? $agency["gtfsId"],
            "routes" => array_values(array_unique($routeNames)),
            "stopCount" => $stopCount,
            "centroid" => [
                "lat" => $stats["latAvg"],
                "lon" => $stats["lonAvg"]
            ],
            "bbox" => [
                "minLat" => $stats["minLat"],
                "maxLat" => $stats["maxLat"],
                "minLon" => $stats["minLon"],
                "maxLon" => $stats["maxLon"]
            ],
            "radiusMeters" => estimateRadiusMeters($stats),
            "updatedAt" => gmdate(DATE_ATOM),
            "hasRealtime" => $hasRealtime
        ];
    }

    usort($networks, fn ($a, $b) => strcmp($a["name"], $b["name"]));
    return $networks;
}

function executeGraphQL(string $endpoint, string $query, array $variables = []): array
{
    $payload = json_encode([
        "query" => $query,
        "variables" => $variables
    ]);

    $ch = curl_init($endpoint);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Content-Type: application/json",
        "Content-Length: " . strlen($payload)
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);

    $response = curl_exec($ch);
    if ($response === false) {
        $err = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException("Erreur cURL: " . $err);
    }

    $statusCode = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($statusCode >= 400) {
        throw new RuntimeException("HTTP $statusCode lors de l'appel à $endpoint");
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        throw new RuntimeException("Réponse JSON invalide sur $endpoint");
    }

    if (!empty($decoded["errors"])) {
        $messages = array_map(fn ($err) => $err["message"] ?? "Erreur inconnue", $decoded["errors"]);
        throw new RuntimeException("GraphQL errors: " . implode(" | ", $messages));
    }

    return $decoded;
}

function detectRealtimeSupport(
    string $endpoint,
    string $realtimeQuery,
    array $stopIds,
    string $logFile
): bool
{
    if (empty($stopIds)) {
        return false;
    }
    $startTime = time();
    foreach ($stopIds as $stopId) {
        if (!$stopId) {
            continue;
        }
        try {
            $response = executeGraphQL($endpoint, $realtimeQuery, [
                "id" => $stopId,
                "startTime" => $startTime,
                "timeRange" => 3600,
                "numberOfDepartures" => 5
            ]);
        } catch (Throwable $e) {
            @file_put_contents($logFile, "[realtime][$stopId] " . $e->getMessage() . "\n", FILE_APPEND);
            continue;
        }
        $stoptimes = $response["data"]["stop"]["stoptimesWithoutPatterns"] ?? [];
        foreach ($stoptimes as $st) {
            $hasRealtime = !empty($st["realtime"]);
            $sched = $st["scheduledDeparture"] ?? null;
            $rt = $st["realtimeDeparture"] ?? null;
            if ($hasRealtime || (is_numeric($sched) && is_numeric($rt) && $sched !== $rt)) {
                return true;
            }
        }
    }
    return false;
}

function collectStops(array $agency): array
{
    $stopMap = [];
    $routes = $agency["routes"] ?? [];
    foreach ($routes as $route) {
        $patterns = $route["patterns"] ?? [];
        foreach ($patterns as $pattern) {
            $stops = $pattern["stops"] ?? [];
            foreach ($stops as $stop) {
                $lat = $stop["lat"] ?? null;
                $lon = $stop["lon"] ?? null;
                if (!is_numeric($lat) || !is_numeric($lon)) {
                    continue;
                }
                $stopId = $stop["gtfsId"] ?? $stop["id"] ?? spl_object_hash((object)$stop);
                if (isset($stopMap[$stopId])) {
                    continue;
                }
                $stopMap[$stopId] = [
                    "lat" => (float)$lat,
                    "lon" => (float)$lon
                ];
                if (count($sampleStopIds) < 5) {
                    $sampleStopIds[] = $stopId;
                }
            }
        }
    }

    return array_values($stopMap);
}

function collectRouteNames(array $agency): array
{
    $names = [];
    $routes = $agency["routes"] ?? [];
    foreach ($routes as $route) {
        $label = $route["shortName"] ?? $route["longName"] ?? $route["gtfsId"] ?? null;
        if ($label) {
            $names[$label] = true;
        }
    }
    return array_keys($names);
}

function computeStats(array $stops): array
{
    $latSum = 0.0;
    $lonSum = 0.0;
    $count = count($stops);
    $minLat = INF;
    $maxLat = -INF;
    $minLon = INF;
    $maxLon = -INF;

    foreach ($stops as $stop) {
        $lat = $stop["lat"];
        $lon = $stop["lon"];
        $latSum += $lat;
        $lonSum += $lon;
        $minLat = min($minLat, $lat);
        $maxLat = max($maxLat, $lat);
        $minLon = min($minLon, $lon);
        $maxLon = max($maxLon, $lon);
    }

    return [
        "latAvg" => $latSum / $count,
        "lonAvg" => $lonSum / $count,
        "minLat" => $minLat,
        "maxLat" => $maxLat,
        "minLon" => $minLon,
        "maxLon" => $maxLon
    ];
}

function estimateRadiusMeters(array $stats): float
{
    $centroid = [$stats["latAvg"], $stats["lonAvg"]];
    $corners = [
        [$stats["minLat"], $stats["minLon"]],
        [$stats["minLat"], $stats["maxLon"]],
        [$stats["maxLat"], $stats["minLon"]],
        [$stats["maxLat"], $stats["maxLon"]]
    ];
    $maxDistanceKm = 0.0;
    foreach ($corners as $corner) {
        $dist = haversineDistanceKm($centroid[0], $centroid[1], $corner[0], $corner[1]);
        if ($dist > $maxDistanceKm) {
            $maxDistanceKm = $dist;
        }
    }
    return $maxDistanceKm * 1000;
}

function haversineDistanceKm(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $earthRadiusKm = 6371;
    $toRad = fn ($value) => $value * M_PI / 180;
    $dLat = $toRad($lat2 - $lat1);
    $dLon = $toRad($lon2 - $lon1);
    $lat1Rad = $toRad($lat1);
    $lat2Rad = $toRad($lat2);

    $a = sin($dLat / 2) * sin($dLat / 2) +
        sin($dLon / 2) * sin($dLon / 2) * cos($lat1Rad) * cos($lat2Rad);
    $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
    return $earthRadiusKm * $c;
}

function sanitizeError(string $message): string
{
    return trim(strip_tags($message));
}

function loadExistingAggregated(string $dataDir): array
{
    $path = rtrim($dataDir, "/") . "/networks.json";
    if (!is_file($path)) {
        return ["generatedAt" => null, "regions" => []];
    }
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === "") {
        return ["generatedAt" => null, "regions" => []];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ["generatedAt" => null, "regions" => []];
    }
    $regions = [];
    if (isset($decoded["regions"]) && is_array($decoded["regions"])) {
        foreach ($decoded["regions"] as $code => $networks) {
            if (!is_array($networks)) {
                continue;
            }
            $regions[(string)$code] = $networks;
        }
    }
    return [
        "generatedAt" => $decoded["generatedAt"] ?? null,
        "regions" => $regions
    ];
}

function loadExistingRegionFiles(string $regionsDir): array
{
    if (!is_dir($regionsDir)) {
        return [];
    }
    $regions = [];
    $files = glob(rtrim($regionsDir, "/") . "/*.json") ?: [];
    foreach ($files as $file) {
        $code = basename((string)$file, ".json");
        $raw = @file_get_contents($file);
        if ($raw === false) {
            continue;
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            continue;
        }
        $regions[$code] = $decoded;
    }
    return $regions;
}
