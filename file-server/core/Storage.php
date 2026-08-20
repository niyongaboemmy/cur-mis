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

        $this->saveMetadata($id, $metadata);

        return $metadata;
    }

    public function get(string $id): ?array
    {
        $all = $this->loadMetadata();
        return $all[$id] ?? null;
    }

    public function delete(string $id): bool
    {
        $metadata = $this->get($id);
        if (!$metadata) return false;

        $filePath = $this->basePath . $metadata['path'];
        if (file_exists($filePath)) {
            unlink($filePath);
        }

        $all = $this->loadMetadata();
        unset($all[$id]);
        file_put_contents($this->metadataFile, json_encode($all, JSON_PRETTY_PRINT));

        return true;
    }

    public function getFullPath(string $filename): string
    {
        return $this->basePath . $filename;
    }

    private function saveMetadata(string $id, array $data): void
    {
        $all = $this->loadMetadata();
        $all[$id] = $data;
        file_put_contents($this->metadataFile, json_encode($all, JSON_PRETTY_PRINT));
    }

    private function loadMetadata(): array
    {
        if (!file_exists($this->metadataFile)) return [];
        return json_decode(file_get_contents($this->metadataFile), true) ?? [];
    }
}
