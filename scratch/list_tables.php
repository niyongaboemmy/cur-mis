<?php
try {
    $db = new PDO('mysql:host=localhost;charset=utf8mb4', 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    // First show all databases
    $result = $db->query('SHOW DATABASES')->fetchAll();
    echo "=== AVAILABLE DATABASES ===\n";
    echo json_encode($result, JSON_PRETTY_PRINT) . "\n\n";

    // Connect to curac_save and list tables
    $db = new PDO('mysql:host=localhost;dbname=curac_save;charset=utf8mb4', 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    $result = $db->query('SHOW TABLES')->fetchAll();
    echo "=== TABLES IN curac_save ===\n";
    echo json_encode($result, JSON_PRETTY_PRINT) . "\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
