<?php

declare(strict_types=1);

return [
    'name'  => $_ENV['APP_NAME']  ?? 'CurMis',
    'env'   => $_ENV['APP_ENV']   ?? 'production',
    'debug' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true',
    'url'   => $_ENV['APP_URL']   ?? '',

    'db' => [
        'host'     => $_ENV['DB_HOST']     ?? '127.0.0.1',
        'port'     => $_ENV['DB_PORT']     ?? '3306',
        'database' => $_ENV['DB_DATABASE'] ?? '',
        'username' => $_ENV['DB_USERNAME'] ?? '',
        'password' => $_ENV['DB_PASSWORD'] ?? '',
        'charset'  => $_ENV['DB_CHARSET']  ?? 'utf8mb4',
    ],

    'jwt' => [
        'secret' => $_ENV['JWT_SECRET'] ?? '',
        'expiry' => (int)($_ENV['JWT_EXPIRY'] ?? 3600),
    ],

    'cors' => [
        'allowed_origins' => array_map('trim', explode(',', $_ENV['CORS_ALLOWED_ORIGINS'] ?? '*')),
    ],
];
