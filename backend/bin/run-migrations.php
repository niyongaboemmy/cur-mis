#!/usr/bin/env php
<?php

declare(strict_types=1);

// Simple migration runner for deployment
// Runs all SQL migration files in order

$migrationsDir = dirname(__DIR__) . '/database/migrations';
$migrationsFile = dirname(__DIR__) . '/database/.migrations_run';

if (!is_dir($migrationsDir)) {
    echo "❌ Migrations directory not found: $migrationsDir\n";
    exit(1);
}

// Load database connection
require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/core/Database.php';

use Core\Database;

try {
    $db = Database::getInstance();

    // Read which migrations have been run
    $ranMigrations = [];
    if (file_exists($migrationsFile)) {
        $ranMigrations = array_filter(array_map('trim', file($migrationsFile)));
    }

    echo "\n╔════════════════════════════════════════════════════════════════╗\n";
    echo "║                    Running Database Migrations                  ║\n";
    echo "╚════════════════════════════════════════════════════════════════╝\n\n";

    // Get all migration files
    $files = glob("$migrationsDir/*.sql");
    if (!$files) {
        echo "✅ No migration files found.\n";
        exit(0);
    }

    sort($files);
    $executed = 0;

    foreach ($files as $file) {
        $filename = basename($file);

        if (in_array($filename, $ranMigrations, true)) {
            echo "⏭️  SKIPPED: $filename (already run)\n";
            continue;
        }

        echo "▶️  Running: $filename...\n";

        try {
            $sql = file_get_contents($file);

            // Split by semicolon but handle multi-statement files
            $statements = array_filter(
                array_map('trim', preg_split('/;\s*$/', $sql, -1, PREG_SPLIT_NO_EMPTY)),
                fn($s) => !empty($s) && !str_starts_with(trim($s), '--')
            );

            foreach ($statements as $statement) {
                $stmt = $statement . ';';
                $db->execute($stmt);
            }

            $ranMigrations[] = $filename;
            file_put_contents($migrationsFile, implode("\n", $ranMigrations));

            echo "   ✅ Success\n";
            $executed++;

        } catch (\Exception $e) {
            echo "   ❌ Error: {$e->getMessage()}\n";
            // Don't exit - try to run next migration
        }
    }

    echo "\n╔════════════════════════════════════════════════════════════════╗\n";
    echo "║                   Migration Run Complete                        ║\n";
    echo "╚════════════════════════════════════════════════════════════════╝\n\n";
    echo "📊 Executed: $executed new migrations\n";
    echo "📝 Total run: " . count($ranMigrations) . " migrations\n\n";

} catch (\Exception $e) {
    echo "❌ Fatal Error: {$e->getMessage()}\n";
    exit(1);
}

exit(0);
