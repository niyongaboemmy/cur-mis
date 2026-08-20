<?php

declare(strict_types=1);

namespace FileServer;

class Request
{
    public function method(): string
    {
        return $_SERVER['REQUEST_METHOD'] ?? 'GET';
    }

    public function uri(): string
    {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        
        $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
        if ($scriptDir !== '/' && str_starts_with($uri, $scriptDir)) {
            $uri = substr($uri, strlen($scriptDir));
        }

        return '/' . ltrim($uri, '/');
    }

    public function body(): array
    {
        static $parsed = null;
        if ($parsed !== null) return $parsed;

        if (str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
            $parsed = json_decode(file_get_contents('php://input'), true) ?? [];
        } else {
            $parsed = $_POST;
        }

        return $parsed;
    }

    public function file(string $key): ?array
    {
        return $_FILES[$key] ?? null;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $_SERVER[$key] ?? null;
    }
}
