<?php
declare(strict_types=1);

function auth_config_path(): string {
    return __DIR__ . "/config.json";
}

function basic_auth_path(): string {
    return __DIR__ . "/.basic_auth.json";
}

function basic_auth_load(): array {
    $path = basic_auth_path();
    if (!is_file($path)) {
        // Not configured
        return [];
    }
    $raw = file_get_contents($path);
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) {
        return [];
    }
    return [
        "username" => (string)($data["username"] ?? ""),
        "passwordHash" => (string)($data["passwordHash"] ?? "")
    ];
}

function auth_load_config(): array {
    $path = auth_config_path();
    if (!is_file($path)) {
        return [
            "allowedEmails" => [],
            "pendingEmails" => [],
            "superAdmins" => []
        ];
    }
    $raw = file_get_contents($path);
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) {
        return [
            "allowedEmails" => [],
            "pendingEmails" => [],
            "superAdmins" => []
        ];
    }
    $data["allowedEmails"] = array_values(array_unique(array_map("strval", $data["allowedEmails"] ?? [])));
    $data["pendingEmails"] = array_values(array_unique(array_map("strval", $data["pendingEmails"] ?? [])));
    $data["superAdmins"] = array_values(array_unique(array_map("strval", $data["superAdmins"] ?? [])));
    return $data;
}

function auth_save_config(array $cfg): void {
    $cfg["allowedEmails"] = array_values(array_unique(array_map("strval", $cfg["allowedEmails"] ?? [])));
    $cfg["pendingEmails"] = array_values(array_unique(array_map("strval", $cfg["pendingEmails"] ?? [])));
    $cfg["superAdmins"] = array_values(array_unique(array_map("strval", $cfg["superAdmins"] ?? [])));
    @file_put_contents(auth_config_path(), json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function super_password_path(): string {
    return __DIR__ . "/.superadmin_password";
}

function super_password_is_set(): bool {
    return is_file(super_password_path());
}

function super_password_verify_input(string $password): bool {
    if (!super_password_is_set()) {
        return false;
    }
    $hash = trim((string)@file_get_contents(super_password_path()));
    if ($hash === "") {
        return false;
    }
    if (str_starts_with($hash, '$2y$') || str_starts_with($hash, '$argon2')) {
        return password_verify($password, $hash);
    }
    return hash_equals($hash, $password);
}

function user_session(): array {
    $email = $_SESSION["email"] ?? null;
    $name = $_SESSION["name"] ?? null;
    $picture = $_SESSION["picture"] ?? null;
    $role = $_SESSION["role"] ?? null; // superadmin|user|pending
    return [
        "email" => is_string($email) ? $email : null,
        "name" => is_string($name) ? $name : null,
        "picture" => is_string($picture) ? $picture : null,
        "role" => is_string($role) ? $role : null
    ];
}

function user_is_superadmin(): bool {
    if (($_SESSION["role"] ?? null) === "superadmin") {
        return true;
    }
    $email = $_SESSION["email"] ?? null;
    if (!is_string($email) || $email === "") {
        return false;
    }
    $cfg = auth_load_config();
    return in_array($email, $cfg["superAdmins"], true);
}

function user_is_authorized(): bool {
    $role = $_SESSION["role"] ?? null;
    return user_is_superadmin() || $role === "user" || $role === "admin";
}

function require_superadmin(): void {
    if (!user_is_superadmin()) {
        http_response_code(401);
        header("Content-Type: application/json; charset=utf-8");
        echo json_encode(["error" => "SuperAdmin requis"]);
        exit;
    }
}

function json_input(): array {
    $raw = file_get_contents("php://input");
    $data = json_decode((string)$raw, true);
    return is_array($data) ? $data : [];
}

function respond_json($payload, int $status = 200): void {
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($payload);
    exit;
}

