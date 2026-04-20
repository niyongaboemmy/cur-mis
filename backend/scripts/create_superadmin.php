<?php
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

use App\Models\UserModel;

echo "--- SuperAdmin Account Sync Tool ---\n";

$targetEmail = "emmanuelniyongabo44@gmail.com";
$targetUsername = "admin";
$password = "Kigalinziza@800";
$fullName = "Emmy Niyongabo";

$userModel = new UserModel();

// 1. Check for email
$userByEmail = $userModel->findBy('email', $targetEmail);
// 2. Check for username
$userByUsername = $userModel->findBy('username', $targetUsername);

if ($userByEmail) {
    echo "Updating existing user by email: $targetEmail\n";
    $userModel->update($userByEmail['id'], [
        'password' => password_hash($password, PASSWORD_BCRYPT),
        'role' => 'superadmin',
        'is_active' => 1,
        'full_name' => $fullName,
        'username' => $targetUsername // Ensure username matches
    ]);
} elseif ($userByUsername) {
    echo "Updating existing user by username: $targetUsername\n";
    $userModel->update($userByUsername['id'], [
        'email' => $targetEmail,
        'password' => password_hash($password, PASSWORD_BCRYPT),
        'role' => 'superadmin',
        'is_active' => 1,
        'full_name' => $fullName
    ]);
} else {
    echo "Creating brand new SuperAdmin account...\n";
    $userModel->create([
        'username' => $targetUsername,
        'full_name' => $fullName,
        'email' => $targetEmail,
        'password' => password_hash($password, PASSWORD_BCRYPT),
        'role' => 'superadmin',
        'is_active' => 1
    ]);
}

echo "✅ Account is ready for testing.\n";
echo "Email: $targetEmail\n";
echo "Password: $password\n";
