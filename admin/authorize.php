<?php
declare(strict_types=1);
require_once __DIR__ . "/auth_common.php";
session_start();

$method = $_SERVER["REQUEST_METHOD"] ?? "GET";

if ($method === "GET") {
    require_superadmin();
    $cfg = auth_load_config();
    respond_json([
        "allowedEmails" => $cfg["allowedEmails"],
        "pendingEmails" => $cfg["pendingEmails"],
        "superAdmins" => $cfg["superAdmins"]
    ]);
}

if ($method === "POST") {
    require_superadmin();
    $data = json_input();
    $action = (string)($data["action"] ?? "");
    $email = (string)($data["email"] ?? "");
    if ($email === "" || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond_json(["error" => "Email invalide"], 400);
    }
    $cfg = auth_load_config();
    if ($action === "approve") {
        if (!in_array($email, $cfg["allowedEmails"], true)) {
            $cfg["allowedEmails"][] = $email;
        }
        $cfg["pendingEmails"] = array_values(array_diff($cfg["pendingEmails"], [$email]));
        auth_save_config($cfg);
        respond_json(["status" => "ok", "message" => "Approuvé"]);
    } elseif ($action === "deny") {
        $cfg["pendingEmails"] = array_values(array_diff($cfg["pendingEmails"], [$email]));
        $cfg["allowedEmails"] = array_values(array_diff($cfg["allowedEmails"], [$email]));
        auth_save_config($cfg);
        respond_json(["status" => "ok", "message" => "Supprimé"]);
    } elseif ($action === "promote") {
        if (!in_array($email, $cfg["superAdmins"], true)) {
            $cfg["superAdmins"][] = $email;
        }
        if (!in_array($email, $cfg["allowedEmails"], true)) {
            $cfg["allowedEmails"][] = $email;
        }
        $cfg["pendingEmails"] = array_values(array_diff($cfg["pendingEmails"], [$email]));
        auth_save_config($cfg);
        respond_json(["status" => "ok", "message" => "Promu SuperAdmin"]);
    } elseif ($action === "demote") {
        $cfg["superAdmins"] = array_values(array_diff($cfg["superAdmins"], [$email]));
        auth_save_config($cfg);
        respond_json(["status" => "ok", "message" => "Rétrogradé"]);
    } else {
        respond_json(["error" => "Action inconnue"], 400);
    }
}

respond_json(["error" => "Méthode non supportée"], 405);

