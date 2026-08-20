<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

try {
    $db = Core\Database::getInstance();
    $pdo = $db->getPdo();

    echo "✓ Database connected\n";

    // Check users table
    $result = $pdo->query("SELECT COUNT(*) as count FROM users");
    $users = $result->fetch();
    echo "✓ Users in database: " . $users['count'] . "\n";

    // Check if superadmin exists
    $result = $pdo->query("SELECT u.id, u.email, r.name FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE r.name = 'superadmin' LIMIT 1");
    $admin = $result->fetch();
    if ($admin) {
        echo "✓ Superadmin found: " . $admin['email'] . "\n";
    } else {
        echo "⚠ No superadmin user found\n";
    }

    // Check permissions
    $result = $pdo->query("SELECT COUNT(*) as count FROM permissions");
    $perms = $result->fetch();
    echo "✓ Permissions in database: " . $perms['count'] . "\n";

    // Check fee types
    $result = $pdo->query("SELECT COUNT(*) as count FROM fee_types WHERE is_active = 1");
    $fees = $result->fetch();
    echo "✓ Active fee types: " . $fees['count'] . "\n";

    // Check system documents
    $result = $pdo->query("SELECT COUNT(*) as count FROM system_documents WHERE is_active = 1");
    $docs = $result->fetch();
    echo "✓ System documents: " . $docs['count'] . "\n";

    echo "\n✅ All systems operational!\n";

} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
    exit(1);
}
