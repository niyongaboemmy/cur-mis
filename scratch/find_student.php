<?php
// Direct database connection
try {
    $db = new PDO('mysql:host=localhost;dbname=curac_save;charset=utf8mb4', 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (Exception $e) {
    die(json_encode(['error' => $e->getMessage()]));
}

// Search for the student - check both full name and individual names
$query = $db->prepare('
    SELECT
        id,
        fname,
        lname,
        email,
        phone,
        reference,
        apply_date,
        program,
        applied_department,
        applied_level,
        intake,
        status,
        year
    FROM application
    WHERE CONCAT(fname, " ", lname) LIKE ?
       OR fname LIKE ?
       OR lname LIKE ?
    ORDER BY apply_date DESC
');

$query->execute(['%MUYINGANYIKI%ELIZABETH%', '%MUYINGANYIKI%', '%ELIZABETH%']);
$results = $query->fetchAll(PDO::FETCH_ASSOC);

echo json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
?>
