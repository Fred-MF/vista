<?php
declare(strict_types=1);

/**
 * Admin API for managing network display labels (Zone & Réseau).
 * 
 * Endpoints:
 *   GET  - List all labels
 *   POST - Update labels (JSON body with "labels" object)
 *   GET  ?action=export - Export labels as CSV
 *   POST ?action=import - Import labels from CSV (multipart form with "file")
 */

require_once __DIR__ . "/auth_common.php";
session_start();

$LABELS_FILE = __DIR__ . "/../data/network_labels.json";

function labels_respond_json(array $data, int $status = 200): void
{
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function labels_respond_error(string $message, int $status = 400): void
{
    labels_respond_json(["status" => "error", "message" => $message], $status);
}

function load_labels(string $path): array
{
    if (!file_exists($path)) {
        return ["updatedAt" => null, "labels" => []];
    }
    $content = file_get_contents($path);
    $data = json_decode($content, true);
    if (!is_array($data)) {
        return ["updatedAt" => null, "labels" => []];
    }
    return [
        "updatedAt" => $data["updatedAt"] ?? null,
        "labels" => $data["labels"] ?? []
    ];
}

function save_labels(string $path, array $labels): bool
{
    $data = [
        "updatedAt" => gmdate(DATE_ATOM),
        "labels" => $labels
    ];
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    return file_put_contents($path, $json) !== false;
}

// Check authentication
if (!user_is_authorized()) {
    labels_respond_error("Non autorisé", 401);
}

header("Cache-Control: no-cache, no-store, must-revalidate");

$method = $_SERVER["REQUEST_METHOD"];
$action = $_GET["action"] ?? null;

function load_all_networks(): array
{
    $networksDir = __DIR__ . "/../data/networks";
    $networks = [];
    
    if (!is_dir($networksDir)) {
        return $networks;
    }
    
    $files = glob($networksDir . "/*.json");
    foreach ($files as $file) {
        $content = file_get_contents($file);
        $data = json_decode($content, true);
        if (is_array($data)) {
            foreach ($data as $network) {
                $agencyId = $network["agencyId"] ?? null;
                if ($agencyId) {
                    $networks[$agencyId] = [
                        "name" => $network["name"] ?? "",
                        "region" => $network["region"] ?? ""
                    ];
                }
            }
        }
    }
    
    // Sort by region then name
    uasort($networks, function($a, $b) {
        $cmp = strcmp($a["region"] ?? "", $b["region"] ?? "");
        if ($cmp !== 0) return $cmp;
        return strcmp($a["name"] ?? "", $b["name"] ?? "");
    });
    
    return $networks;
}

// GET - List all labels or export CSV
if ($method === "GET") {
    // Export CSV
    if ($action === "export") {
        $labelsData = load_labels($LABELS_FILE);
        $labels = $labelsData["labels"];
        
        // Load all networks from JSON files
        $allNetworks = load_all_networks();
        
        header("Content-Type: text/csv; charset=utf-8");
        header("Content-Disposition: attachment; filename=network_labels_" . date("Y-m-d") . ".csv");
        
        $output = fopen("php://output", "w");
        // BOM for Excel UTF-8
        fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));
        // Header row
        fputcsv($output, ["region", "agencyId", "name_otp", "zone", "reseau", "aliasOf"], ";");
        
        // Export all networks, merging with labels
        foreach ($allNetworks as $agencyId => $networkInfo) {
            $label = $labels[$agencyId] ?? [];
            fputcsv($output, [
                $networkInfo["region"] ?? "",
                $agencyId,
                $networkInfo["name"] ?? "",
                $label["zone"] ?? "",
                $label["reseau"] ?? "",
                $label["aliasOf"] ?? ""
            ], ";");
        }
        fclose($output);
        exit;
    }
    
    // List all labels
    $data = load_labels($LABELS_FILE);
    labels_respond_json([
        "status" => "ok",
        "updatedAt" => $data["updatedAt"],
        "labels" => $data["labels"]
    ]);
}

// POST actions
if ($method === "POST") {
    // Import CSV
    if ($action === "import") {
        if (!isset($_FILES["file"]) || $_FILES["file"]["error"] !== UPLOAD_ERR_OK) {
            labels_respond_error("Fichier CSV manquant ou erreur d'upload");
        }
        
        $file = $_FILES["file"]["tmp_name"];
        $handle = fopen($file, "r");
        if ($handle === false) {
            labels_respond_error("Impossible de lire le fichier");
        }
        
        // Load existing labels
        $existingData = load_labels($LABELS_FILE);
        $labels = $existingData["labels"];
        
        // Auto-detect separator by reading first line
        $firstLine = fgets($handle);
        rewind($handle);
        
        // Count occurrences of potential separators
        $semicolonCount = substr_count($firstLine, ";");
        $commaCount = substr_count($firstLine, ",");
        $separator = $semicolonCount >= $commaCount ? ";" : ",";
        
        // Read header row
        $header = fgetcsv($handle, 0, $separator);
        if ($header === false) {
            fclose($handle);
            labels_respond_error("Fichier CSV vide ou invalide");
        }
        
        // Normalize header (remove BOM, trim, lowercase)
        $header = array_map(function($col) {
            $col = preg_replace('/^\xEF\xBB\xBF/', '', $col);
            return strtolower(trim($col));
        }, $header);
        
        // Expected columns: region, agencyId, name_otp, zone, reseau, aliasOf
        $agencyIdCol = array_search("agencyid", $header);
        $nameOtpCol = array_search("name_otp", $header);
        $zoneCol = array_search("zone", $header);
        $reseauCol = array_search("reseau", $header);
        $aliasOfCol = array_search("aliasof", $header);
        // region column is ignored (informational only, derived from agencyId)
        
        if ($agencyIdCol === false) {
            fclose($handle);
            labels_respond_error("Colonne 'agencyId' manquante dans le CSV");
        }
        
        $imported = 0;
        $skipped = 0;
        
        while (($row = fgetcsv($handle, 0, $separator)) !== false) {
            $agencyId = trim($row[$agencyIdCol] ?? "");
            if ($agencyId === "") {
                $skipped++;
                continue;
            }
            
            $nameOtp = $nameOtpCol !== false ? trim($row[$nameOtpCol] ?? "") : "";
            $zone = $zoneCol !== false ? trim($row[$zoneCol] ?? "") : "";
            $reseau = $reseauCol !== false ? trim($row[$reseauCol] ?? "") : "";
            $aliasOf = $aliasOfCol !== false ? trim($row[$aliasOfCol] ?? "") : "";
            
            // Only update if there's at least one value to import
            if ($nameOtp !== "" || $zone !== "" || $reseau !== "" || $aliasOf !== "") {
                if (!isset($labels[$agencyId])) {
                    $labels[$agencyId] = [];
                }
                if ($nameOtp !== "") {
                    $labels[$agencyId]["name_otp"] = $nameOtp;
                }
                if ($zone !== "") {
                    $labels[$agencyId]["zone"] = $zone;
                }
                if ($reseau !== "") {
                    $labels[$agencyId]["reseau"] = $reseau;
                }
                if ($aliasOf !== "" && $aliasOf !== $agencyId) {
                    $labels[$agencyId]["aliasOf"] = $aliasOf;
                } elseif ($aliasOf === "") {
                    // Empty value removes the alias
                    unset($labels[$agencyId]["aliasOf"]);
                }
                $imported++;
            } else {
                $skipped++;
            }
        }
        
        fclose($handle);
        
        if (!save_labels($LABELS_FILE, $labels)) {
            labels_respond_error("Erreur lors de la sauvegarde", 500);
        }
        
        labels_respond_json([
            "status" => "ok",
            "message" => "Import terminé",
            "imported" => $imported,
            "skipped" => $skipped
        ]);
    }
    
    // Update labels (JSON body)
    $input = file_get_contents("php://input");
    $body = json_decode($input, true);
    
    if (!is_array($body)) {
        labels_respond_error("Corps JSON invalide");
    }
    
    // Single label update
    if (isset($body["agencyId"])) {
        $agencyId = trim($body["agencyId"]);
        if ($agencyId === "") {
            labels_respond_error("agencyId requis");
        }
        
        $existingData = load_labels($LABELS_FILE);
        $labels = $existingData["labels"];
        
        if (!isset($labels[$agencyId])) {
            $labels[$agencyId] = [];
        }
        
        if (isset($body["zone"])) {
            $labels[$agencyId]["zone"] = trim($body["zone"]);
        }
        if (isset($body["reseau"])) {
            $labels[$agencyId]["reseau"] = trim($body["reseau"]);
        }
        if (isset($body["name_otp"])) {
            $labels[$agencyId]["name_otp"] = trim($body["name_otp"]);
        }
        if (array_key_exists("aliasOf", $body)) {
            $aliasOf = trim($body["aliasOf"] ?? "");
            if ($aliasOf === "" || $aliasOf === $agencyId) {
                // Remove alias if empty or self-referencing
                unset($labels[$agencyId]["aliasOf"]);
            } else {
                $labels[$agencyId]["aliasOf"] = $aliasOf;
            }
        }
        
        if (!save_labels($LABELS_FILE, $labels)) {
            labels_respond_error("Erreur lors de la sauvegarde", 500);
        }
        
        labels_respond_json([
            "status" => "ok",
            "message" => "Label mis à jour",
            "agencyId" => $agencyId,
            "label" => $labels[$agencyId]
        ]);
    }
    
    // Bulk update
    if (isset($body["labels"]) && is_array($body["labels"])) {
        if (!save_labels($LABELS_FILE, $body["labels"])) {
            labels_respond_error("Erreur lors de la sauvegarde", 500);
        }
        
        labels_respond_json([
            "status" => "ok",
            "message" => "Labels mis à jour"
        ]);
    }
    
    labels_respond_error("Format de requête invalide");
}

labels_respond_error("Méthode non supportée", 405);

