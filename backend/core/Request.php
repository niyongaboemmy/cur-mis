<?php

declare(strict_types=1);

namespace Core;

class Request
{
    private array $routeParams = [];

    public function method(): string
    {
        $override = $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? $this->body()['_method'] ?? null;
        if ($override && in_array(strtoupper($override), ['PUT', 'PATCH', 'DELETE'], true)) {
            return strtoupper($override);
        }
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
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

    public function query(?string $key = null, mixed $default = null): mixed
    {
        if ($key === null) {
            return $_GET;
        }
        return $_GET[$key] ?? $default;
    }

    public function body(): array
    {
        static $parsed = null;
        if ($parsed !== null) {
            return $parsed;
        }

        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

        if (str_contains($contentType, 'application/json')) {
            $raw    = file_get_contents('php://input');
            $parsed = json_decode($raw, true) ?? [];
        } elseif (
            str_contains($contentType, 'multipart/form-data') ||
            str_contains($contentType, 'application/x-www-form-urlencoded')
        ) {
            $parsed = $_POST;
        } else {
            $raw    = file_get_contents('php://input');
            $parsed = json_decode($raw, true) ?? $_POST;
        }

        return $parsed;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body()[$key] ?? $default;
    }

    public function files(): array
    {
        return $_FILES;
    }

    public function file(string $key): array|null
    {
        return $_FILES[$key] ?? null;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $_SERVER[$key] ?? null;
    }

    public function headers(): array
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $header           = str_replace('_', '-', substr($key, 5));
                $headers[$header] = $value;
            }
        }
        return $headers;
    }

    public function bearerToken(): ?string
    {
        $auth = $this->header('Authorization') ?? $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($auth, 'Bearer ')) {
            return substr($auth, 7);
        }
        return null;
    }

    public function ip(): string
    {
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    public function setRouteParams(array $params): void
    {
        $this->routeParams = array_merge($this->routeParams, $params);
    }

    public function param(string $key, mixed $default = null): mixed
    {
        return $this->routeParams[$key] ?? $default;
    }

    public function all(): array
    {
        return array_merge($this->query(), $this->body(), $this->routeParams);
    }
}
