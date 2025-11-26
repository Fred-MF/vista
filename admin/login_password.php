<?php
declare(strict_types=1);
require_once __DIR__ . "/auth_common.php";
session_start();

header("Content-Type: application/json; charset=utf-8");

$data = json_input();
$username = (string)($data["username"] ?? "");
$password = (string)($data["password"] ?? "");

if ($username === "" || $password === "") {
    respond_json(["error" => "Identifiants manquants"], 400);
}

$creds = basic_auth_load();
if (empty($creds)) {
    respond_json([
        "error" => "Identifiants non configurés. Créez admin/.basic_auth.json avec {\"username\":\"admin\",\"passwordHash\":\"<hash ou mot de passe>\"}"
    ], 503);
}

$ok = false;
if (hash_equals($creds["username"], $username)) {
    $stored = $creds["passwordHash"];
    if (is_string($stored) && $stored !== "") {
        if (str_starts_with($stored, '$2y$') || str_starts_with($stored, '$argon2')) {
            $ok = password_verify($password, $stored);
        } else {
            // Plaintext fallback (dev only)
            $ok = hash_equals($stored, $password);
        }
    }
}

if (!$ok) {
    respond_json(["error" => "Identifiants invalides"], 401);
}

$_SESSION["role"] = "admin";
$_SESSION["name"] = "Admin";
$_SESSION["email"] = $username;
respond_json(["status" => "ok", "role" => "admin"]);



