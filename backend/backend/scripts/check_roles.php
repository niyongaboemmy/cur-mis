<?php
$dbHost = '127.0.0.1';
$dbUsername = 'root';
$dbPassword = '';
$dbDatabase = 'curac_save';

$mysqli = new mysqli($dbHost, $dbUsername, $dbPassword, $dbDatabase);

if ($mysqli->connect_error) {
    die("Connection failed: " . $mysqli->connect_error);
}

echo "Available Roles:\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

$result = $mysqli->query("SELECT id, name, description FROM roles ORDER BY id");

if ($result && $result->num_rows > 0) {
    while ($row = $result->fetch_assoc()) {
        echo "ID: " . str_pad($row['id'], 3) . " | Name: " . str_pad($row['name'], 25) . " | " . ($row['description'] ?? 'N/A') . "\n";
    }
} else {
    echo "No roles found\n";
}

echo "\n";

// Also check the user
echo "User Information:\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

$email = 'faustin.niitegeka@gmail.com';
$result = $mysqli->query("SELECT id, email, full_name, role_id FROM users WHERE LOWER(email) = LOWER('$email')");

if ($result && $result->num_rows > 0) {
    $user = $result->fetch_assoc();
    echo "Email: " . $user['email'] . "\n";
    echo "Name: " . $user['full_name'] . "\n";
    echo "User ID: " . $user['id'] . "\n";
    echo "Current Role ID: " . $user['role_id'] . "\n";
} else {
    echo "User not found\n";
}

$mysqli->close();
?>
