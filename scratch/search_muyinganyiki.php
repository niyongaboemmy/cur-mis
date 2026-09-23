<?php
try {
    $db = new PDO('mysql:host=localhost;dbname=curac_save;charset=utf8mb4', 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    // Search for MUYINGANYIKI
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
        WHERE fname LIKE ?
           OR lname LIKE ?
           OR CONCAT(fname, " ", lname) LIKE ?
        ORDER BY apply_date DESC
        LIMIT 20
    ');

    $query->execute(['%MUYINGANYIKI%', '%MUYINGANYIKI%', '%MUYINGANYIKI%']);
    $results = $query->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'message' => 'Search results for MUYINGANYIKI',
        'count' => count($results),
        'results' => $results
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
?>
