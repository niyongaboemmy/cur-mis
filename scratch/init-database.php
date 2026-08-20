<?php
/**
 * Database Initialization Script
 * Creates cur_mis database and runs all migrations
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

echo "════════════════════════════════════════════════════════\n";
echo "  DATABASE INITIALIZATION SCRIPT\n";
echo "════════════════════════════════════════════════════════\n\n";

$host = '127.0.0.1';
$user = 'root';
$password = '';
$port = 3306;

// Step 1: Connect to MySQL server (without database)
echo "Step 1: Connecting to MySQL server...\n";
try {
    $pdo = new PDO(
        "mysql:host=$host;port=$port",
        $user,
        $password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    echo "✓ Connected to MySQL\n\n";
} catch (PDOException $e) {
    die("✗ Connection failed: " . $e->getMessage() . "\n\nTroubleshooting:\n" .
        "1. Ensure MySQL is running: C:\\xamppP\\mysql\\bin\\mysqld.exe\n" .
        "2. Check port 3306 is not in use\n" .
        "3. Try: mysql -u root from command line\n");
}

// Step 2: Create databases
echo "Step 2: Creating databases...\n";
try {
    $pdo->exec("CREATE DATABASE IF NOT EXISTS cur_mis CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
    echo "✓ Created database: cur_mis\n";

    $pdo->exec("CREATE DATABASE IF NOT EXISTS cur_mis_payments CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
    echo "✓ Created database: cur_mis_payments\n\n";
} catch (PDOException $e) {
    die("✗ Database creation failed: " . $e->getMessage());
}

// Step 3: Connect to the application database
echo "Step 3: Connecting to application database...\n";
try {
    $pdo = new PDO(
        "mysql:host=$host;port=$port;dbname=cur_mis;charset=utf8mb4",
        $user,
        $password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    echo "✓ Connected to cur_mis database\n\n";
} catch (PDOException $e) {
    die("✗ Application database connection failed: " . $e->getMessage());
}

// Step 4: Run migrations
echo "Step 4: Running database migrations...\n";
$migrationsDir = dirname(__DIR__) . '/backend/database/migrations';

if (!is_dir($migrationsDir)) {
    echo "⚠ Migrations directory not found: $migrationsDir\n";
    echo "  Continuing without migrations...\n\n";
} else {
    $migrations = glob($migrationsDir . '/*.sql');
    sort($migrations);

    $migrationCount = 0;
    $errorCount = 0;

    foreach ($migrations as $migration) {
        $filename = basename($migration);

        try {
            $sql = file_get_contents($migration);

            // Split by semicolon and execute each statement
            $statements = array_filter(array_map('trim', explode(';', $sql)));

            foreach ($statements as $statement) {
                if (!empty($statement)) {
                    $pdo->exec($statement);
                }
            }

            echo "✓ $filename\n";
            $migrationCount++;
        } catch (PDOException $e) {
            echo "✗ $filename - " . $e->getMessage() . "\n";
            $errorCount++;
        }
    }

    echo "\n  Migrations completed: $migrationCount successful, $errorCount errors\n\n";
}

// Step 5: Verify tables were created
echo "Step 5: Verifying database structure...\n";
try {
    $result = $pdo->query("SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'cur_mis'");
    $row = $result->fetch(PDO::FETCH_ASSOC);
    $tableCount = $row['table_count'];

    if ($tableCount > 0) {
        echo "✓ Database has $tableCount tables\n";

        // List some key tables
        $keyTables = ['users', 'students', 'programs', 'academic_years', 'intakes'];
        $checkResult = $pdo->query("SHOW TABLES");
        $existingTables = $checkResult->fetchAll(PDO::FETCH_COLUMN);

        echo "\n  Key tables found:\n";
        foreach ($keyTables as $table) {
            $status = in_array($table, $existingTables) ? "✓" : "✗";
            echo "  $status $table\n";
        }
    } else {
        echo "⚠ No tables found. You may need to run migrations manually.\n";
    }
} catch (PDOException $e) {
    echo "⚠ Could not verify tables: " . $e->getMessage() . "\n";
}

echo "\n";
echo "════════════════════════════════════════════════════════\n";
echo "  ✓ DATABASE INITIALIZATION COMPLETE\n";
echo "════════════════════════════════════════════════════════\n\n";

echo "Next steps:\n";
echo "1. Refresh http://localhost:8080 in browser\n";
echo "2. You should see API responses (no 500 errors)\n";
echo "3. Access http://localhost:5182 (Frontend)\n\n";

echo "If errors persist:\n";
echo "- Check MySQL is running: ps aux | grep mysqld\n";
echo "- Check error logs: tail -f C:\\xamppP\\mysql\\data\\mysql_error.log\n";
echo "- Run migrations manually: mysql -u root cur_mis < backend/database/migrations/*.sql\n";
?>
