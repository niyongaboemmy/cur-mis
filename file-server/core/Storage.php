<?php

declare(strict_types=1);

namespace FileServer;

use Ramsey\Uuid\Uuid;

class Storage
{
    private string $basePath;
    private string $metadataFile;

    public function __construct(string $basePath)
    {
        $this->basePath = rtrim($basePath, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        $this->metadataFile = $this->basePath . 'metadata.json';
        
        if (!is_dir($this->basePath)) {
            mkdir($this->basePath, 0755, true);
        }
    }

    public function store(array $file): array
    {
        $id = Uuid::uuid4()->toString();
        $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
        $safeName = $id . ($extension ? '.' . $extension : '');
        $targetPath = $this->basePath . $safeName;

        if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
            throw new \RuntimeException('Failed to move uploaded file.');
        }

        $metadata = [
            'id' => $id,
            'original_name' => $file['name'],
            'mime' => $file['type'],
            'size' => $file['size'],
            'path' => $safeName,
            'created_at' => time()
        ];

        try {
            $this->saveMetadata($id, $metadata);
        } catch (\RuntimeException $e) {
            // The file is stored and get() finds it on disk by its id; only the index entry is missing.
            error_log('[file-server] index not updated for ' . $id . ': ' . $e->getMessage());
        }

        return $metadata;
    }

    public function get(string $id): ?array
    {
        // Ids are UUIDs; anything else never names a stored file (and must not reach glob()).
        if (!preg_match('/^[A-Za-z0-9-]{8,64}$/', $id)) {
            return null;
        }
        try {
            $all = $this->loadMetadata();
        } catch (\RuntimeException) {
            $all = [];
        }
        return $all[$id] ?? $this->findOnDisk($id);
    }

    public function delete(string $id): bool
    {
        $metadata = $this->get($id);
        if (!$metadata) return false;

        $filePath = $this->basePath . $metadata['path'];
        if (file_exists($filePath)) {
            unlink($filePath);
        }

        $this->updateMetadata(function (array $all) use ($id): array {
            unset($all[$id]);
            return $all;
        });

        return true;
    }

    public function getFullPath(string $filename): string
    {
        return $this->basePath . $filename;
    }

    /**
     * A stored file is named "<id>.<ext>". When its index entry is missing (lost to
     * the unlocked index writes this class used to do), describe it from the file itself.
     */
    private function findOnDisk(string $id): ?array
    {
        $matches = glob($this->basePath . $id . '.*') ?: [];
        if (is_file($this->basePath . $id)) {
            $matches[] = $this->basePath . $id;
        }
        foreach ($matches as $path) {
            if (!is_file($path)) continue;
            $name = basename($path);
            return [
                'id'            => $id,
                'original_name' => $name,
                'mime'          => $this->detectMime($path),
                'size'          => filesize($path),
                'path'          => $name,
                'created_at'    => filemtime($path),
            ];
        }
        return null;
    }

    private function detectMime(string $path): string
    {
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime  = $finfo ? finfo_file($finfo, $path) : false;
            if ($finfo) finfo_close($finfo);
            if (is_string($mime) && $mime !== '') return $mime;
        }
        return match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
            'pdf'         => 'application/pdf',
            'jpg', 'jpeg' => 'image/jpeg',
            'png'         => 'image/png',
            'gif'         => 'image/gif',
            'webp'        => 'image/webp',
            default       => 'application/octet-stream',
        };
    }

    private function saveMetadata(string $id, array $data): void
    {
        $this->updateMetadata(function (array $all) use ($id, $data): array {
            $all[$id] = $data;
            return $all;
        });
    }

    /**
     * Read-modify-write of the index under an exclusive lock, written atomically.
     * Without the lock, parallel uploads each read the same index and the last
     * writer dropped the others' entries; without the atomic rename, a reader could
     * catch the file half-written.
     */
    private function updateMetadata(callable $change): void
    {
        $lock = fopen($this->metadataFile . '.lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX)) {
            throw new \RuntimeException('Could not lock the file index.');
        }
        try {
            $all = $change($this->loadMetadata());
            $tmp = $this->metadataFile . '.tmp.' . bin2hex(random_bytes(6));
            if (file_put_contents($tmp, json_encode($all, JSON_PRETTY_PRINT)) === false || !rename($tmp, $this->metadataFile)) {
                @unlink($tmp);
                throw new \RuntimeException('Could not write the file index.');
            }
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** @throws \RuntimeException when the index exists but cannot be read — never treat it as empty. */
    private function loadMetadata(): array
    {
        if (!file_exists($this->metadataFile)) return [];
        $raw = file_get_contents($this->metadataFile);
        if ($raw === false) {
            throw new \RuntimeException('Could not read the file index.');
        }
        if (trim($raw) === '') return [];
        $all = json_decode($raw, true);
        if (!is_array($all)) {
            throw new \RuntimeException('The file index is unreadable.');
        }
        return $all;
    }
}
