<?php

declare(strict_types=1);

namespace FileServer;

class Response
{
    public function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json');
        echo json_encode($data);
        exit;
    }

    public function error(string $message, int $status = 400): never
    {
        $this->json(['success' => false, 'message' => $message], $status);
    }

    public function success(mixed $data = null, string $message = 'Success'): never
    {
        $this->json(['success' => true, 'message' => $message, 'data' => $data]);
    }

    public function file(string $path, string $filename, string $mime): never
    {
        if (!file_exists($path)) {
            $this->error('File not found.', 404);
        }

        header('Content-Type: ' . $mime);
        header('Content-Disposition: inline; filename="' . $filename . '"');
        header('Content-Length: ' . filesize($path));
        
        // Disable buffering for large files
        if (ob_get_level()) ob_end_clean();
        
        readfile($path);
        exit;
    }
}
