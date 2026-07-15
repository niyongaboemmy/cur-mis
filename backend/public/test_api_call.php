<?php
// Simple test to verify the API can respond
// Access via: http://localhost/cur-mis/backend/public/test_api_call.php

require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

\Core\ExceptionHandler::register();

$router = new \Core\Router();
$request = new \Core\Request();
$response = new \Core\Response();

// Manually set the request to test
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/api/health';
$_SERVER['PATH_INFO'] = '/api/health';

require __DIR__ . '/../routes/api.php';

$router->dispatch($request, $response);
