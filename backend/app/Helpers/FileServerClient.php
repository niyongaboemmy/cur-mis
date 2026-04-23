<?php

declare(strict_types=1);

namespace App\Helpers;

use RuntimeException;

class FileServerClient
{
    private string $baseUrl;
    private string $apiKey;

    /** Allowed MIME types for applicant document uploads. */
    private const ALLOWED_MIMES = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
    ];

    /** Max upload size: 5 MB */
    private const MAX_SIZE = 5 * 1024 * 1024;

    public function __construct()
    {
        $this->baseUrl = rtrim((string)($_ENV['FILE_SERVER_URL'] ?? ''), '/');
        $this->apiKey  = (string)($_ENV['FILE_SERVER_KEY'] ?? '');
    }

    /**
     * Validate and upload a file from $_FILES to the file server.
     *
     * @param  array $file  One entry from $_FILES (e.g. $_FILES['document'])
     * @return array [id, original_name, mime, size]
     * @throws RuntimeException on validation failure or server error
     */
    public function upload(array $file): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new RuntimeException('File upload failed with error code: ' . ($file['error'] ?? 'unknown'));
        }

        if (($file['size'] ?? 0) > self::MAX_SIZE) {
            throw new RuntimeException('File exceeds the maximum allowed size of 5 MB.');
        }

        $mime = $this->detectMime($file['tmp_name'] ?? '');
        if (!in_array($mime, self::ALLOWED_MIMES, true)) {
            throw new RuntimeException('Invalid file type. Allowed: PDF, JPEG, PNG.');
        }

        $ch = curl_init($this->baseUrl . '/upload');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => [
                'file' => new \CURLFile($file['tmp_name'], $mime, $file['name'] ?? 'upload'),
            ],
            CURLOPT_HTTPHEADER     => [
                'X-API-Key: ' . $this->apiKey,
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT        => 30,
        ]);

        $raw      = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new RuntimeException('Could not reach file storage service: ' . $error);
        }

        $body = json_decode((string)$raw, true);

        if ($httpCode < 200 || $httpCode >= 300 || empty($body['data']['id'])) {
            $msg = $body['message'] ?? 'Unknown error';
            throw new RuntimeException("File storage service error ({$httpCode}): {$msg}");
        }

        return [
            'id'            => $body['data']['id'],
            'original_name' => $body['data']['original_name'] ?? ($file['name'] ?? 'upload'),
            'size'          => $body['data']['size']          ?? $file['size'],
            'mime'          => $body['data']['mime']          ?? $mime,
        ];
    }

    /**
     * Download a file from the file server by its UUID.
     *
     * @return array [content, mime, original_name]
     * @throws RuntimeException on server error
     */
    public function download(string $fileServerId): array
    {
        $ch = curl_init($this->baseUrl . '/download/' . rawurlencode($fileServerId));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'X-API-Key: ' . $this->apiKey,
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HEADER         => true,
        ]);

        $response = (string)curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($error) {
            throw new RuntimeException('Could not reach file storage service: ' . $error);
        }

        if ($httpCode === 404) {
            throw new RuntimeException('File not found.');
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            throw new RuntimeException('File storage service error.');
        }

        $headers = substr($response, 0, $headerSize);
        $content = substr($response, $headerSize);

        $mime         = 'application/octet-stream';
        $originalName = 'download';

        if (preg_match('/Content-Type:\s*([^\r\n]+)/i', $headers, $m)) {
            $mime = trim($m[1]);
        }
        if (preg_match('/X-Original-Name:\s*([^\r\n]+)/i', $headers, $m)) {
            $originalName = trim($m[1]);
        } elseif (preg_match('/Content-Disposition:.*filename[^;=\n]*=([\'"]?)([^\'"\n]+)\1/i', $headers, $m)) {
            $originalName = trim($m[2]);
        }

        return [
            'content'       => $content,
            'mime'          => $mime,
            'original_name' => $originalName,
        ];
    }

    /**
     * Delete a file from the file server.
     */
    public function delete(string $fileServerId): bool
    {
        $ch = curl_init($this->baseUrl . '/files/' . rawurlencode($fileServerId));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => 'DELETE',
            CURLOPT_HTTPHEADER     => [
                'X-API-Key: ' . $this->apiKey,
            ],
            CURLOPT_TIMEOUT        => 15,
        ]);

        curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $httpCode >= 200 && $httpCode < 300;
    }

    private function detectMime(string $path): string
    {
        if (!$path || !file_exists($path)) {
            return 'application/octet-stream';
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime  = finfo_file($finfo, $path);
        finfo_close($finfo);
        return $mime ?: 'application/octet-stream';
    }
}
