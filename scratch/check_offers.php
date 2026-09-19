<?php
try {
    $db = new PDO('mysql:host=localhost;dbname=cur_mis;charset=utf8mb4', 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    // Check if admission_offers table exists
    $tables = $db->query('SHOW TABLES LIKE "admission%"')->fetchAll(PDO::FETCH_COLUMN);

    echo "=== ADMISSION-RELATED TABLES ===\n";
    echo json_encode($tables, JSON_PRETTY_PRINT) . "\n\n";

    if (in_array('admission_offers', $tables)) {
        // Get recent expired offers
        $query = $db->prepare('
            SELECT
                ao.id,
                ao.application_id,
                ao.offer_letter_reference,
                ao.offered_at,
                ao.expires_at,
                ao.status,
                app.fname,
                app.lname,
                app.email
            FROM admission_offers ao
            LEFT JOIN application app ON app.id = ao.application_id
            WHERE ao.status = "expired"
               OR (ao.expires_at < CURDATE() AND ao.status = "pending")
            ORDER BY ao.expires_at DESC
            LIMIT 20
        ');

        $query->execute();
        $results = $query->fetchAll();

        echo "=== EXPIRED OFFERS ===\n";
        echo json_encode([
            'count' => count($results),
            'results' => $results
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }

} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
?>
