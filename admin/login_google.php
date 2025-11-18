<?php
declare(strict_types=1);
require_once __DIR__ . "/auth_common.php";
session_start();

$clientIdPath = __DIR__ . "/google_client_id.txt";
$clientId = @is_file($clientIdPath) ? trim((string)@file_get_contents($clientIdPath)) : "";
if ($clientId === "" || $clientId === "YOUR_GOOGLE_CLIENT_ID") {
    respond_json(["error" => "Google Client ID non configuré (admin/google_client_id.txt)"], 503);
}

$body = json_input();
$idToken = (string)($body["id_token"] ?? "");
if ($idToken === "") {
    respond_json(["error" => "id_token manquant"], 400);
}

// Validate token with Google tokeninfo endpoint
$ch = curl_init("https://oauth2.googleapis.com/tokeninfo?id_token=" . urlencode($idToken));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
$resp = curl_exec($ch);
$curlErr = curl_error($ch);
$code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($resp === false || $code >= 400) {
    respond_json(["error" => "Validation Google échouée: " . ($curlErr ?: "HTTP $code")], 401);
}

$payload = json_decode((string)$resp, true);
if (!is_array($payload)) {
    respond_json(["error" => "Réponse Google invalide"], 401);
}

$aud = (string)($payload["aud"] ?? "");
if ($aud !== $clientId) {
    respond_json(["error" => "Client ID non reconnu"], 401);
}

$email = (string)($payload["email"] ?? "");
$name = (string)($payload["name"] ?? ($payload["given_name"] ?? ""));
$picture = (string)($payload["picture"] ?? "");
if ($email === "") {
    respond_json(["error" => "Email Google manquant"], 401);
}

$cfg = auth_load_config();
$allowed = in_array($email, $cfg["allowedEmails"], true);
$isSuper = in_array($email, $cfg["superAdmins"], true);

$_SESSION["email"] = $email;
$_SESSION["name"] = $name;
$_SESSION["picture"] = $picture;
$_SESSION["role"] = $isSuper ? "superadmin" : ($allowed ? "user" : "pending");

if (!$allowed && !$isSuper) {
    if (!in_array($email, $cfg["pendingEmails"], true)) {
        $cfg["pendingEmails"][] = $email;
        auth_save_config($cfg);
    }
    respond_json(["status" => "pending", "message" => "Compte en attente d'approbation"], 403);
}

respond_json(["status" => "ok", "email" => $email, "name" => $name, "picture" => $picture, "role" => $_SESSION["role"]]);

