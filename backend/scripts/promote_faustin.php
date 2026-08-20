<?php
/**
 * Promote faustin.niitegeka@gmail.com to ADMIN
 * Run: php scripts/promote_faustin.php
 */

require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '3306';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? '';

$email = 'faustin.niitegeka@gmail.com';

echo "🔄 Promoting $email to ADMIN...\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "✓ Connected to database: $db\n";

    // 1. Find admin role
    $stmt = $pdo->prepare("SELECT id FROM roles WHERE name = 'admin'");
    $stmt->execute();
    $role = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$role) {
        die("❌ Admin role not found\n");
    }

    $adminRoleId = (int)$role['id'];
    echo "✓ Found admin role (ID: $adminRoleId)\n";

    // 2. Find user
    $stmt = $pdo->prepare("SELECT id, email, full_name, role_id FROM users WHERE LOWER(email) = LOWER(?)");
    $stmt->execute([$email]);
    $userRecord = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$userRecord) {
        die("❌ User with email '$email' not found\n");
    }

    $userId = (int)$userRecord['id'];
    $oldRoleId = (int)$userRecord['role_id'];

    echo "✓ Found user: {$userRecord['full_name']} (ID: $userId)\n";
    echo "  Current role ID: $oldRoleId\n";

    // 3. Update user role
    $stmt = $pdo->prepare("UPDATE users SET role_id = :role_id, is_active = 1 WHERE id = :user_id");
    $stmt->execute(['role_id' => $adminRoleId, 'user_id' => $userId]);

    if ($stmt->rowCount() === 0) {
        die("❌ Failed to update user\n");
    }

    echo "✓ Updated role to ADMIN\n";

    // 4. Verify
    $stmt = $pdo->prepare("SELECT u.id, u.email, u.full_name, r.name as role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?");
    $stmt->execute([$userId]);
    $verified = $stmt->fetch(PDO::FETCH_ASSOC);

    echo "\n";
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    echo "✅ SUCCESS! User is now ADMIN\n";
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    echo "\nUser Details:\n";
    echo "  ID:        " . $verified['id'] . "\n";
    echo "  Email:     " . $verified['email'] . "\n";
    echo "  Name:      " . $verified['full_name'] . "\n";
    echo "  Role:      " . $verified['role_name'] . "\n";
    echo "  Status:    Active\n";
    echo "\n";
    echo "This Admin can now:\n";
    echo "  ✅ Access ALL features and modules\n";
    echo "  ✅ Manage all users, roles, and permissions\n";
    echo "  ✅ View all students and staff\n";
    echo "  ✅ Access all departments and faculties\n";
    echo "  ✅ View and modify all financial data\n";
    echo "  ✅ Manage HR and payroll\n";
    echo "  ✅ Access all academic records\n";
    echo "  ✅ Assign scope to other users (HOD, Dean, etc.)\n";
    echo "\n";
    echo "📝 Next Steps:\n";
    echo "  1. Open your browser and go to: http://localhost:5173 (or your frontend URL)\n";
    echo "  2. Log in with email: $email\n";
    echo "  3. You should now see ALL modules in the sidebar\n";
    echo "\n";

} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
?>
