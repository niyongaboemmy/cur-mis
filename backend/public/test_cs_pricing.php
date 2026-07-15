<?php
declare(strict_types=1);

$basePath = dirname(__DIR__);
require $basePath . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable($basePath);
$dotenv->load();

\Core\ExceptionHandler::register();

try {
    // Get CS department ID (from Computer science)
    $db = Core\Database::getInstance();
    
    $cs_dept = $db->fetchOne(
        "SELECT dep_id FROM departements WHERE dep_name LIKE '%Computer%' LIMIT 1"
    );
    echo "Computer Science dept ID: " . ($cs_dept['dep_id'] ?? 'NOT FOUND') . "\n\n";
    
    // Get per-credit rates for CS
    $rates = $db->fetchAll(
        "SELECT fpcr.*, ay.label, f.fac_name 
         FROM fee_per_credit_rates fpcr
         LEFT JOIN academic_years ay ON ay.id = fpcr.academic_year_id
         LEFT JOIN faculty f ON f.fac_id = fpcr.faculty_id
         WHERE fpcr.is_active = 1
         ORDER BY fpcr.created_at DESC LIMIT 5"
    );
    
    echo "Recent per-credit rates:\n";
    foreach ($rates as $r) {
        echo "- Faculty: {$r['fac_name']}, Year: {$r['label']}, Amount: {$r['amount_per_credit']}\n";
        
        $depts = $db->fetchAll(
            "SELECT department_id FROM fee_per_credit_rate_departments WHERE fee_per_credit_rate_id = ?",
            [$r['id']]
        );
        echo "  Linked departments: " . (empty($depts) ? "ALL" : implode(", ", array_column($depts, 'department_id'))) . "\n";
    }
    
    echo "\nModules in Computer Science (dep_id=" . ($cs_dept['dep_id'] ?? 'unknown') . "):\n";
    $modules = $db->fetchAll(
        "SELECT module_id, module_code, module_name, module_credits, department 
         FROM modules WHERE department = ? LIMIT 5",
        [$cs_dept['dep_id'] ?? 0]
    );
    
    foreach ($modules as $m) {
        echo "- {$m['module_code']}: {$m['module_credits']} credits (dept={$m['department']})\n";
    }
    
} catch (\Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
