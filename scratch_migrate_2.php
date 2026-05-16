<?php
try {
    $pdo = new PDO('mysql:host=127.0.0.1;port=8889;dbname=curac_save', 'root', 'root');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $files = [
        'backend/database/migrations/2026_05_16_048_add_user_id_to_student_and_staff.sql',
        'backend/database/migrations/2026_05_16_049_add_urubutopay_integration.sql',
        'backend/database/migrations/2026_05_16_050_add_created_by_to_fee_structures.sql',
        'backend/database/migrations/2026_05_16_051_add_online_payments_history_permission.sql',
        'backend/database/migrations/2026_05_16_052_add_reversed_status_to_fee_payments.sql',
        'backend/database/migrations/2026_05_16_053_add_my_invoice_permission.sql'
    ];
    
    foreach ($files as $file) {
        if (!file_exists($file)) continue;
        echo "Running $file...\n";
        $sql = file_get_contents($file);
        
        $statements = array_filter(array_map('trim', explode(';', $sql)));
        foreach ($statements as $stmt) {
            if (!empty($stmt)) {
                try {
                    $pdo->exec($stmt);
                } catch (Exception $e) {
                    echo "  - Warning: " . $e->getMessage() . "\n";
                }
            }
        }
        echo "Done $file.\n\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
