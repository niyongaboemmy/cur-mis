<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Thin HTTP client for the standalone file-storage service.
 *
 * Every failure leaves here as a {@see FileServerException} so callers can tell
 * "your file is invalid" (422) apart from "storage is broken" (502) — see the
 * doc block on that class for why the distinction matters.
 */
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
     * Fail fast when the storage credentials are absent.
     *
     * Without this an empty FILE_SERVER_KEY is sent as a blank X-API-Key header,
     * the file server answers 401 "Invalid API Key", and that upstream message
     * used to be relayed to the end user as if their file were at fault. A
     * missing key is a deployment problem, so say so in the log and give the
     * user a generic, honest "service unavailable".
     */
    private function assertConfigured(): void
    {
        $missing = [];
        if ($this->baseUrl === '') $missing[] = 'FILE_SERVER_URL';
        if ($this->apiKey  === '') $missing[] = 'FILE_SERVER_KEY';

        if ($missing !== []) {
            throw FileServerException::upstream(
                'File storage is not configured — missing env var(s): ' . implode(', ', $missing)
                . '. Set them in backend/.env; FILE_SERVER_KEY must match the value in file-server/.env.'
            );
        }
    }

    /** True when the storage service answers its health check. */
    public function healthy(): bool
    {
        if ($this->baseUrl === '') {
            return false;
        }
        $ch = curl_init($this->baseUrl . '/health');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 5,
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $code >= 200 && $code < 300;
    }

    /**
     * Validate and upload a file from $_FILES to the file server.
     *
     * @param  array $file  One entry from $_FILES (e.g. $_FILES['document'])
     * @return array [id, original_name, mime, size]
     * @throws FileServerException client-kind on validation failure, upstream-kind on storage/config error
     */
    public function upload(array $file): array
    {
        $this->assertConfigured();

        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw FileServerException::client($this->uploadErrorMessage((int)($file['error'] ?? -1)));
        }

        if (($file['size'] ?? 0) > self::MAX_SIZE) {
            throw FileServerException::client('File exceeds the maximum allowed size of 5 MB.');
        }

        // Authoritative type check: the file's actual content, not the
        // client-supplied $_FILES['type'], which is trivially spoofed.
        $mime = $this->detectMime($file['tmp_name'] ?? '');
        if (!in_array($mime, self::ALLOWED_MIMES, true)) {
            throw FileServerException::client('Invalid file type. Allowed: PDF, JPEG, PNG, WebP.');
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
            throw FileServerException::upstream('Could not reach file storage service: ' . $error);
        }

        $body = json_decode((string)$raw, true);

        if ($httpCode < 200 || $httpCode >= 300 || empty($body['data']['id'])) {
            $msg  = $body['message'] ?? 'Unknown error';
            $hint = in_array($httpCode, [401, 403], true)
                ? ' — FILE_SERVER_KEY in backend/.env does not match FILE_SERVER_KEY in file-server/.env.'
                : '';
            throw FileServerException::upstream("File storage service error ({$httpCode}): {$msg}{$hint}");
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
     * @throws FileServerException client-kind when the file is missing, upstream-kind on storage error
     */
    public function download(string $fileServerId): array
    {
        $this->assertConfigured();

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
            throw FileServerException::upstream('Could not reach file storage service: ' . $error);
        }

        if ($httpCode === 404) {
            throw FileServerException::client('File not found.');
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            throw FileServerException::upstream("File storage download failed with HTTP {$httpCode}.");
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

    /** Human-readable text for a PHP $_FILES upload error code. */
    private function uploadErrorMessage(int $code): string
    {
        return match ($code) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE =>
                'File exceeds the maximum allowed size of 5 MB.',
            UPLOAD_ERR_PARTIAL =>
                'The file was only partially uploaded. Please try again.',
            UPLOAD_ERR_NO_FILE =>
                'No file was uploaded.',
            UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE, UPLOAD_ERR_EXTENSION =>
                'The server could not process the upload. Please contact the administrator.',
            default =>
                'File upload failed. Please try again.',
        };
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
