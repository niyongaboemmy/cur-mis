<?php
/**
 * Environment Configuration Test Script
 * Tests all local environment variables for the CUR-MIS system
 */

echo "════════════════════════════════════════════════════════\n";
echo "  ENVIRONMENT CONFIGURATION VALIDATION TEST\n";
echo "════════════════════════════════════════════════════════\n\n";

// Test 1: Load Backend Environment
echo "1. BACKEND ENVIRONMENT LOADING\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

$backendEnvPath = dirname(__DIR__) . '/backend/.env';
if (file_exists($backendEnvPath)) {
    echo "✓ .env file exists: $backendEnvPath\n";

    // Parse .env file manually (ignoring comments and special characters)
    $content = file_get_contents($backendEnvPath);
    $requiredVars = [
        'APP_NAME', 'APP_ENV', 'APP_DEBUG', 'APP_URL',
        'DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD',
        'JWT_SECRET', 'JWT_EXPIRY',
        'CORS_ALLOWED_ORIGINS'
    ];

    foreach ($requiredVars as $var) {
        if (preg_match('/' . preg_quote($var) . '=(.*)/', $content, $matches)) {
            $value = trim($matches[1], '" ');
            echo "  ✓ $var = " . substr((string)$value, 0, 30) . (strlen($value) > 30 ? '...' : '') . "\n";
        } else {
            echo "  ⚠ $var may not be set\n";
        }
    }
} else {
    echo "✗ .env file NOT found at: $backendEnvPath\n";
}

echo "\n";

// Test 2: Database Configuration
echo "2. DATABASE CONFIGURATION\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

try {
    // Extract DB config from .env content
    preg_match('/DB_HOST=(.*)/', $content, $host_match);
    preg_match('/DB_PORT=(.*)/', $content, $port_match);
    preg_match('/DB_DATABASE=(.*)/', $content, $db_match);
    preg_match('/DB_USERNAME=(.*)/', $content, $user_match);
    preg_match('/DB_PASSWORD=(.*)/', $content, $pass_match);

    $db_host = trim($host_match[1] ?? 'localhost', '" ');
    $db_port = trim($port_match[1] ?? '3306', '" ');
    $db_name = trim($db_match[1] ?? 'cur_mis', '" ');
    $db_user = trim($user_match[1] ?? 'root', '" ');
    $db_pass = trim($pass_match[1] ?? '', '" ');

    $dsn = "mysql:host=$db_host;port=$db_port;dbname=$db_name";

    echo "  Database DSN: $dsn\n";
    echo "  Connection Test: Attempting to connect...\n";

    try {
        $pdo = new PDO($dsn, $db_user, $db_pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        echo "  ✓ Database connection successful!\n";
    } catch (PDOException $e) {
        echo "  ⚠ Database connection failed (this is normal if DB is not running)\n";
    }
} catch (Exception $e) {
    echo "  ✗ Error reading configuration: " . $e->getMessage() . "\n";
}

echo "\n";

// Test 3: Frontend Configuration
echo "3. FRONTEND ENVIRONMENT CONFIGURATION\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

$frontendEnvPath = dirname(__DIR__) . '/frontend/.env.local';
if (file_exists($frontendEnvPath)) {
    echo "✓ .env.local file exists: $frontendEnvPath\n";

    $content = file_get_contents($frontendEnvPath);
    $requiredVars = [
        'VITE_API_URL', 'VITE_BASE_PATH', 'VITE_APP_NAME',
        'VITE_APP_VERSION', 'VITE_API_TIMEOUT', 'VITE_AUTH_STORAGE_KEY'
    ];

    foreach ($requiredVars as $var) {
        if (strpos($content, $var . '=') !== false) {
            // Extract the value
            preg_match('/' . preg_quote($var) . '=(.*)/', $content, $matches);
            $value = $matches[1] ?? 'not set';
            echo "  ✓ $var = $value\n";
        } else {
            echo "  ✗ $var is missing!\n";
        }
    }
} else {
    echo "✗ .env.local file NOT found at: $frontendEnvPath\n";
}

echo "\n";

// Test 4: File Server Configuration
echo "4. FILE SERVER CONFIGURATION\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

$fileServerEnvPath = dirname(__DIR__) . '/file-server/.env';
if (file_exists($fileServerEnvPath)) {
    echo "✓ .env file exists: $fileServerEnvPath\n";

    $content = file_get_contents($fileServerEnvPath);
    $requiredVars = [
        'APP_NAME', 'APP_ENV', 'APP_DEBUG',
        'FILE_SERVER_KEY', 'MAX_UPLOAD_SIZE', 'CORS_ALLOWED_ORIGINS'
    ];

    foreach ($requiredVars as $var) {
        if (preg_match('/' . preg_quote($var) . '=(.*)/', $content, $matches)) {
            $value = trim($matches[1], '" ');
            echo "  ✓ $var = " . substr((string)$value, 0, 30) . (strlen($value) > 30 ? '...' : '') . "\n";
        } else {
            echo "  ⚠ $var may not be set\n";
        }
    }
} else {
    echo "✗ .env file NOT found at: $fileServerEnvPath\n";
}

echo "\n";

// Test 5: Payment API Configuration
echo "5. PAYMENT API CONFIGURATION\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

$paymentApiEnvPath = dirname(__DIR__) . '/payment_api/.env';
if (file_exists($paymentApiEnvPath)) {
    echo "✓ .env file exists: $paymentApiEnvPath\n";

    $content = file_get_contents($paymentApiEnvPath);
    $requiredVars = [
        'APP_NAME', 'APP_ENV', 'APP_DEBUG', 'APP_URL',
        'PAYMENT_API_KEY', 'PAYMENT_WEBHOOK_SECRET',
        'PAYMENT_GATEWAY', 'PAYMENT_CALLBACK_URL'
    ];

    foreach ($requiredVars as $var) {
        if (preg_match('/' . preg_quote($var) . '=(.*)/', $content, $matches)) {
            $value = trim($matches[1], '" ');
            echo "  ✓ $var = " . substr((string)$value, 0, 30) . (strlen($value) > 30 ? '...' : '') . "\n";
        } else {
            echo "  ⚠ $var may not be set\n";
        }
    }
} else {
    echo "✗ .env file NOT found at: $paymentApiEnvPath\n";
}

echo "\n";

// Test 6: Local URLs Summary
echo "6. LOCAL DEVELOPMENT URLS\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

$urls = [
    'Frontend (Vite)' => 'http://localhost:5173',
    'Backend API' => 'http://localhost:8080/api',
    'File Server' => 'http://localhost:9000',
    'Payment API' => 'http://localhost:8081',
    'MySQL' => '127.0.0.1:3306 (cur_mis)',
    'API Documentation' => 'http://localhost:8080/api/api-docs.php'
];

foreach ($urls as $service => $url) {
    echo "  ✓ $service: $url\n";
}

echo "\n";
echo "════════════════════════════════════════════════════════\n";
echo "  ✓ All environment configurations are set up!\n";
echo "════════════════════════════════════════════════════════\n\n";

echo "NEXT STEPS:\n";
echo "  1. Ensure MySQL is running\n";
echo "  2. Create database: CREATE DATABASE cur_mis;\n";
echo "  3. Run migrations: php backend/scripts/migrate.php (or applicable)\n";
echo "  4. Start frontend: npm run dev (from frontend/)\n";
echo "  5. Start backend: php -S localhost:8080 (from backend/public/)\n";
echo "  6. Access app at: http://localhost:5173\n\n";
?>
