<?php
try {
    $db = new PDO('mysql:host=localhost;dbname=curac_save;charset=utf8mb4', 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    $result = $db->query('DESCRIBE application')->fetchAll();
    echo json_encode($result, JSON_PRETTY_PRINT);

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
