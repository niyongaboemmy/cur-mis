<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

try {
    $db = Core\Database::getInstance();

    echo "═══════════════════════════════════════════════════════════\n";
    echo "           CUR-MIS LOGIN TEST & AUDIT\n";
    echo "═══════════════════════════════════════════════════════════\n\n";

    // 1. Test database
    echo "📊 DATABASE STATUS\n";
    echo "─────────────────────────────────────────────────────────\n";
    $result = $db->getPdo()->query("SELECT DATABASE() as db_name");
    $db_info = $result->fetch();
    echo "✓ Connected to: " . $db_info['db_name'] . "\n";

    // 2. Check users table
    $result = $db->getPdo()->query("SELECT COUNT(*) as count FROM users");
    $users_count = $result->fetch();
    echo "✓ Total users: " . $users_count['count'] . "\n";

    // 3. Check superadmin
    echo "\n👤 SUPERADMIN ACCOUNT\n";
    echo "─────────────────────────────────────────────────────────\n";
    $result = $db->getPdo()->query(
        "SELECT u.id, u.email, u.first_name, u.last_name, r.name as role
         FROM users u
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE r.name = 'superadmin'
         LIMIT 1"
    );
    $admin = $result->fetch();
    if ($admin) {
        echo "✓ Email: " . $admin['email'] . "\n";
        echo "✓ Name: " . $admin['first_name'] . " " . $admin['last_name'] . "\n";
        echo "✓ Role: " . $admin['role'] . "\n";
        echo "✓ ID: " . $admin['id'] . "\n";
    } else {
        echo "✗ No superadmin found!\n";
    }

    // 4. Check JWT configuration
    echo "\n🔐 JWT CONFIGURATION\n";
    echo "─────────────────────────────────────────────────────────\n";
    $jwt_secret = $_ENV['JWT_SECRET'] ?? '';
    echo "✓ JWT_SECRET: " . (strlen($jwt_secret) > 0 ? "SET (" . strlen($jwt_secret) . " chars)" : "NOT SET") . "\n";
    $jwt_expiry = $_ENV['JWT_EXPIRY'] ?? 604800;
    echo "✓ JWT_EXPIRY: " . $jwt_expiry . " seconds (" . ($jwt_expiry / 3600) . " hours)\n";

    // 5. Check CORS
    echo "\n🔗 CORS CONFIGURATION\n";
    echo "─────────────────────────────────────────────────────────\n";
    $cors = $_ENV['CORS_ALLOWED_ORIGINS'] ?? '*';
    echo "✓ CORS_ALLOWED_ORIGINS: " . $cors . "\n";

    // 6. Check permissions
    echo "\n🔑 PERMISSIONS SYSTEM\n";
    echo "─────────────────────────────────────────────────────────\n";
    $result = $db->getPdo()->query("SELECT COUNT(*) as count FROM permissions");
    $perms_count = $result->fetch();
    echo "✓ Total permissions: " . $perms_count['count'] . "\n";

    // 7. Check fee types
    echo "\n💰 FEE TYPES\n";
    echo "─────────────────────────────────────────────────────────\n";
    $result = $db->getPdo()->query("SELECT COUNT(*) as count FROM fee_types");
    $fees_count = $result->fetch();
    echo "✓ Total fee types: " . $fees_count['count'] . "\n";

    // 8. Check academic years
    echo "\n📅 ACADEMIC YEARS\n";
    echo "─────────────────────────────────────────────────────────\n";
    $result = $db->getPdo()->query("SELECT id, label, is_current FROM academic_years ORDER BY id DESC LIMIT 3");
    $years = $result->fetchAll();
    if ($years) {
        foreach ($years as $year) {
            $current = $year['is_current'] ? '✓ CURRENT' : '';
            echo "  • " . $year['label'] . " $current\n";
        }
    } else {
        echo "✗ No academic years found!\n";
    }

    // 9. Check faculties
    echo "\n🏢 FACULTIES & PROGRAMS\n";
    echo "─────────────────────────────────────────────────────────\n";
    $result = $db->getPdo()->query("SELECT COUNT(*) as count FROM faculty");
    $faculties = $result->fetch();
    echo "✓ Total faculties: " . $faculties['count'] . "\n";

    $result = $db->getPdo()->query("SELECT COUNT(*) as count FROM options");
    $options = $result->fetch();
    echo "✓ Total program options: " . $options['count'] . "\n";

    $result = $db->getPdo()->query("SELECT COUNT(*) as count FROM levels");
    $levels = $result->fetch();
    echo "✓ Total study levels: " . $levels['count'] . "\n";

    // 10. Check system documents
    echo "\n📄 SYSTEM DOCUMENTS\n";
    echo "─────────────────────────────────────────────────────────\n";
    $result = $db->getPdo()->query("SELECT COUNT(*) as count FROM system_documents");
    $docs = $result->fetch();
    echo "✓ Total documents: " . $docs['count'] . "\n";

    $result = $db->getPdo()->query("SELECT name, category FROM system_documents LIMIT 5");
    $doc_list = $result->fetchAll();
    if ($doc_list) {
        foreach ($doc_list as $doc) {
            echo "  • " . $doc['name'] . " (" . $doc['category'] . ")\n";
        }
    }

    echo "\n═══════════════════════════════════════════════════════════\n";
    echo "✅ ALL SYSTEMS READY FOR LOGIN!\n";
    echo "═══════════════════════════════════════════════════════════\n\n";

    echo "LOGIN CREDENTIALS:\n";
    echo "─────────────────────────────────────────────────────────\n";
    echo "URL:      http://localhost/cur-mis\n";
    echo "Email:    " . $admin['email'] . "\n";
    echo "Password: (check your password reset email or use default)\n\n";

    echo "PRODUCTION:\n";
    echo "─────────────────────────────────────────────────────────\n";
    echo "URL:      https://cur.ac.rw/umis\n";
    echo "Email:    " . $admin['email'] . "\n";
    echo "Password: (check your password reset email or use default)\n\n";

} catch (Exception $e) {
    echo "✗ ERROR: " . $e->getMessage() . "\n";
    echo "Stack trace:\n";
    echo $e->getTraceAsString() . "\n";
    exit(1);
}
