<?php
declare(strict_types=1);
require_once __DIR__ . "/auth_common.php";
session_start();

$data = json_input();
$password = (string)($data["password"] ?? "");

if (!super_password_is_set()) {
    respond_json(["error" => "Mot de passe SuperAdmin non configuré (admin/.superadmin_password)"], 503);
}

if (!super_password_verify_input($password)) {
    respond_json(["error" => "Mot de passe invalide"], 401);
}

$_SESSION["role"] = "superadmin";
respond_json(["status" => "ok", "role" => "superadmin"]);

