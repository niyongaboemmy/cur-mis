<?php
try {
    $db = new PDO('mysql:host=localhost;dbname=cur_mis;charset=utf8mb4', 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    // List tables
    $tables = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    echo "=== TABLES IN cur_mis ===\n";
    echo json_encode($tables, JSON_PRETTY_PRINT) . "\n\n";

    // Search for MUYINGANYIKI in student_applications
    if (in_array('student_applications', $tables)) {
        $query = $db->prepare('
            SELECT
                id,
                first_name,
                last_name,
                email,
                phone,
                application_number,
                created_at,
                program_id,
                intake,
                status,
                level_id
            FROM student_applications
            WHERE first_name LIKE ?
               OR last_name LIKE ?
               OR CONCAT(first_name, " ", last_name) LIKE ?
            ORDER BY created_at DESC
        ');

        $query->execute(['%MUYINGANYIKI%', '%MUYINGANYIKI%', '%MUYINGANYIKI%']);
        $results = $query->fetchAll(PDO::FETCH_ASSOC);

        echo "=== SEARCH RESULTS ===\n";
        echo json_encode([
            'count' => count($results),
            'results' => $results
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    } else {
        echo "Table 'student_applications' not found in cur_mis\n";
    }

} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
?>
