<?php
declare(strict_types=1);
require_once __DIR__ . "/auth_common.php";
session_start();
$user = user_session();
$authenticated = is_string($user["role"] ?? null);
header("Content-Type: application/json; charset=utf-8");
echo json_encode([
    "authenticated" => $authenticated,
    "user" => $user
]);



