<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Dotenv\Dotenv;
use FileServer\Request;
use FileServer\Response;
use FileServer\Router;
use FileServer\Storage;

// ── Configuration ─────────────────────────────────────────────────────────────
$dotenv = Dotenv::createImmutable(dirname(__DIR__));
$dotenv->safeLoad();

define('STORAGE_PATH', dirname(__DIR__) . '/storage/uploads/');
define('API_KEY', $_ENV['FILE_SERVER_KEY'] ?? 'development_key_change_me');

$request  = new Request();
$response = new Response();
$router   = new Router();
$storage  = new Storage(STORAGE_PATH);

// ── Auth Middleware ───────────────────────────────────────────────────────────
$checkAuth = function (Request $request, Response $response) {
    $providedKey = $request->header('X-API-Key');
    if ($providedKey !== API_KEY) {
        $response->error('Unauthorized. Invalid API Key.', 401);
    }
};

// ── Routes ───────────────────────────────────────────────────────────────────

/** Health Check */
$router->add('GET', '/health', function ($req, $res) {
    $res->success(['status' => 'ok'], 'File server is healthy.');
});

/** Upload File */
$router->add('POST', '/upload', function ($req, $res) use ($checkAuth, $storage) {
    $checkAuth($req, $res);

    $file = $req->file('file');
    if (!$file) {
        $res->error('No file provided in the "file" field.');
    }

    try {
        $metadata = $storage->store($file);
        $res->success($metadata, 'File uploaded successfully.');
    } catch (\Exception $e) {
        $res->error($e->getMessage(), 500);
    }
});

/** Download / View File */
$router->add('GET', '/download/{id}', function ($req, $res, $id) use ($storage) {
    // Note: Download might be public or secured by a signed token in URL.
    // For now, we allow reading if the ID is known.
    $metadata = $storage->get($id);
    if (!$metadata) {
        $res->error('File not found.', 404);
    }

    $res->file($storage->getFullPath($metadata['path']), $metadata['original_name'], $metadata['mime']);
});

/** Delete File */
$router->add('DELETE', '/files/{id}', function ($req, $res, $id) use ($checkAuth, $storage) {
    $checkAuth($req, $res);

    if ($storage->delete($id)) {
        $res->success(null, 'File deleted.');
    } else {
        $res->error('File not found or already deleted.', 404);
    }
});

// ── Run ──────────────────────────────────────────────────────────────────────
$router->resolve($request, $response);
