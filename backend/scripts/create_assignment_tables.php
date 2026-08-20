<?php
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '3306';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? '';

$pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

echo "\n╔════════════════════════════════════════════════════════════════╗\n";
echo "║       Creating Department & Faculty Assignment Tables         ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

try {
    // Create user_department_assignments
    $stmt = $pdo->query("SHOW TABLES LIKE 'user_department_assignments'");
    if ($stmt->rowCount() === 0) {
        echo "Creating user_department_assignments table...\n";

        $pdo->exec("
            CREATE TABLE user_department_assignments (
              id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              user_id        INT UNSIGNED NOT NULL,
              department_id  INT(11) NOT NULL,
              assigned_by    INT UNSIGNED DEFAULT NULL,
              assigned_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uq_user_department (user_id, department_id),
              KEY idx_user_id (user_id),
              KEY idx_department_id (department_id),
              CONSTRAINT fk_user_dept_assignments_user
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
              CONSTRAINT fk_user_dept_assignments_department
                FOREIGN KEY (department_id) REFERENCES departements (dep_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        ");

        echo "✓ Created user_department_assignments\n";
    } else {
        echo "✓ user_department_assignments already exists\n";
    }

    echo "\n";

    // Create user_faculty_assignments
    $stmt = $pdo->query("SHOW TABLES LIKE 'user_faculty_assignments'");
    if ($stmt->rowCount() === 0) {
        echo "Creating user_faculty_assignments table...\n";

        $pdo->exec("
            CREATE TABLE user_faculty_assignments (
              id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              user_id        INT UNSIGNED NOT NULL,
              faculty_id     INT(11) NOT NULL,
              assigned_by    INT UNSIGNED DEFAULT NULL,
              assigned_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uq_user_faculty (user_id, faculty_id),
              KEY idx_user_id (user_id),
              KEY idx_faculty_id (faculty_id),
              CONSTRAINT fk_user_faculty_assignments_user
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
              CONSTRAINT fk_user_faculty_assignments_faculty
                FOREIGN KEY (faculty_id) REFERENCES faculty (fac_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        ");

        echo "✓ Created user_faculty_assignments\n";
    } else {
        echo "✓ user_faculty_assignments already exists\n";
    }

    echo "\n";
    echo "╔════════════════════════════════════════════════════════════════╗\n";
    echo "║                    ✅ SUCCESS!                                 ║\n";
    echo "╚════════════════════════════════════════════════════════════════╝\n";
    echo "\nBoth assignment tables created successfully!\n";
    echo "You can now use:\n";
    echo "  • Assign users to departments\n";
    echo "  • Assign users to faculties\n";
    echo "  • Set department/faculty scopes on roles\n\n";

} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n\n";
}

?>
