<?php

declare(strict_types=1);

namespace Core;

class Response
{
    private int $statusCode = 200;
    private array $headers = [];

    public function status(int $code): static
    {
        $this->statusCode = $code;
        return $this;
    }

    public function header(string $name, string $value): static
    {
        $this->headers[$name] = $value;
        return $this;
    }

    public function json(mixed $data, int $status = null): never
    {
        if ($status !== null) {
            $this->statusCode = $status;
        }

        http_response_code($this->statusCode);
        header('Content-Type: application/json; charset=utf-8');

        foreach ($this->headers as $name => $value) {
            header("{$name}: {$value}");
        }

        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public function success(mixed $data = null, string $message = 'Success', int $status = 200, array $extra = []): never
    {
        $payload = [
            'success' => true,
            'message' => $message,
            'data'    => $data,
        ];
        
        if (!empty($extra)) {
            $payload = array_merge($payload, $extra);
        }

        $this->json($payload, $status);
    }

    public function error(string $message, int $status = 400, mixed $errors = null): never
    {
        $payload = [
            'success' => false,
            'message' => $message,
        ];
        if ($errors !== null) {
            $payload['errors'] = $errors;
        }
        $this->json($payload, $status);
    }

    public function noContent(): never
    {
        http_response_code(204);
        foreach ($this->headers as $name => $value) {
            header("{$name}: {$value}");
        }
        exit;
    }
}
