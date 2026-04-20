<?php

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));

require BASE_PATH . '/vendor/autoload.php';

// Load .env into $_ENV / $_SERVER
$dotenv = Dotenv\Dotenv::createImmutable(BASE_PATH);
$dotenv->load();

// Abort early if critical env vars are missing
$dotenv->required([
    'APP_ENV',
    'DB_HOST',
    'DB_DATABASE',
    'DB_USERNAME',
    'DB_PASSWORD',
    'JWT_SECRET',
])->notEmpty();

// Register global exception/error handler before any application code runs.
// In production this returns structured JSON; in debug mode it includes a stack trace.
\Core\ExceptionHandler::register();

// Show PHP errors in debug mode only (never in production)
if ($_ENV['APP_DEBUG'] === 'true') {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    error_reporting(0);
}

// Handle CORS headers and preflight OPTIONS requests before any output
(new \App\Middleware\CorsMiddleware())->handle();

// Boot the router, request, and response objects
$router   = new \Core\Router();
$request  = new \Core\Request();
$response = new \Core\Response();

// Register all API routes
require BASE_PATH . '/routes/api.php';

// Dispatch — matches the current method + URI to a route handler
$router->dispatch($request, $response);
