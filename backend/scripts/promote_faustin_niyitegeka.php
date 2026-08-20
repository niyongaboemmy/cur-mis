<?php
/**
 * Promote faustin.niyitegeka@gmail.com to ADMIN (highest access)
 * Run: php scripts/promote_faustin_niyitegeka.php
 */

require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '3306';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? '';

$email = 'faustin.niyitegeka@gmail.com';

echo "\n";
echo "╔━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╗\n";
echo "║  🔄 Promoting User to ADMIN Role                 ║\n";
echo "╚━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╝\n";
echo "\n";

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

    // 2. Find user (exact email match)
    $stmt = $pdo->prepare("SELECT id, email, full_name, role_id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $userRecord = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$userRecord) {
        die("❌ User with email '$email' not found\n");
    }

    $userId = (int)$userRecord['id'];
    $oldRoleId = (int)$userRecord['role_id'];

    echo "✓ Found user: {$userRecord['full_name']} (ID: $userId)\n";
    echo "  Current role ID: $oldRoleId\n";

    // 3. Update user role to admin
    $stmt = $pdo->prepare("UPDATE users SET role_id = :role_id, is_active = 1 WHERE id = :user_id");
    $stmt->execute(['role_id' => $adminRoleId, 'user_id' => $userId]);

    if ($stmt->rowCount() === 0) {
        die("❌ Failed to update user\n");
    }

    echo "✓ Updated role to ADMIN\n";

    // 4. Verify the change
    $stmt = $pdo->prepare("SELECT u.id, u.email, u.full_name, r.name as role_name, u.is_active FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?");
    $stmt->execute([$userId]);
    $verified = $stmt->fetch(PDO::FETCH_ASSOC);

    echo "\n";
    echo "╔━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╗\n";
    echo "║  ✅ SUCCESS! User Promoted to ADMIN              ║\n";
    echo "╚━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╝\n";
    echo "\n";
    echo "📋 User Details:\n";
    echo "   ID:         " . $verified['id'] . "\n";
    echo "   Email:      " . $verified['email'] . "\n";
    echo "   Name:       " . $verified['full_name'] . "\n";
    echo "   Role:       " . $verified['role_name'] . " ⭐\n";
    echo "   Status:     " . ($verified['is_active'] ? 'Active ✓' : 'Inactive ✗') . "\n";
    echo "\n";
    echo "🔓 This Admin User Can Now Access:\n";
    echo "   ✅ ALL features and modules in the system\n";
    echo "   ✅ All student records and profiles\n";
    echo "   ✅ All staff and HR data\n";
    echo "   ✅ All departments and faculties\n";
    echo "   ✅ All academic records and marks\n";
    echo "   ✅ All financial data and reports\n";
    echo "   ✅ User management and role assignment\n";
    echo "   ✅ Permissions and access control\n";
    echo "   ✅ System settings and configuration\n";
    echo "   ✅ Scope assignment (HOD, Dean, etc.)\n";
    echo "\n";
    echo "🚀 Next Steps:\n";
    echo "   1. Log out from the current session\n";
    echo "   2. Log in with: $email\n";
    echo "   3. View all features in the sidebar\n";
    echo "   4. Check the Dashboard, Administration panels\n";
    echo "\n";
    echo "💡 Frontend URL: http://localhost:5173\n";
    echo "💡 Backend API: http://localhost:8080\n";
    echo "\n";

} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
    echo "\n";
    exit(1);
}
?>
