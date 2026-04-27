<?php
/**
 * One-time seed: Import April-2026 payroll from HR Excel.
 *
 * Matching key: employee_lname (Last name column) in employees table.
 * emp_id = employees.employee_id  (no hr_employees involved)
 * Run: php backend/database/seeds/import_payroll_april_2026.php
 */

$host   = 'localhost';
$port   = 3306;
$dbname = 'curac_save';
$user   = 'root';
$pass   = 'root';

$pdo = new PDO(
    "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4",
    $user, $pass,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);

// Excel data: fname = employee_fname column, lname = employee_lname column
$excelRows = [
    ['fname' => 'NTAGANDA',      'lname' => 'Laurent',     'gross' => 1756795, 'paye' => 491038],
    ['fname' => 'NZABONALIBA',   'lname' => 'Albert',      'gross' => 1465744, 'paye' => 403723],
    ['fname' => 'GASANGO',       'lname' => 'Lilianne',    'gross' => 1465744, 'paye' => 403723],
    ['fname' => 'NSHIMIYIMANA',  'lname' => 'Hélène',      'gross' => 657472,  'paye' => 161242],
    ['fname' => 'MUREKEYISONI',  'lname' => 'Julienne',    'gross' => 657472,  'paye' => 161242],
    ['fname' => 'MUKAMURENZI',   'lname' => 'Clarisse',    'gross' => 548112,  'paye' => 128434],
    ['fname' => 'MUTANGANA',     'lname' => 'Innocent',    'gross' => 480407,  'paye' => 108122],
    ['fname' => 'IDUKUNDA',      'lname' => 'Lengo Lione', 'gross' => 480407,  'paye' => 108122],
    ['fname' => 'UMUGWANEZA',    'lname' => 'Lydie',       'gross' => 416850,  'paye' => 89055],
    ['fname' => 'KARASIRA',      'lname' => 'Theophille',  'gross' => 423458,  'paye' => 91037],
    ['fname' => 'NSHIMIYIMANA',  'lname' => 'Emmanuel',    'gross' => 341834,  'paye' => 66550],
    ['fname' => 'BIZIMANA',      'lname' => 'Protais',     'gross' => 341834,  'paye' => 66550],
    ['fname' => 'NDAYISHIMIYE',  'lname' => 'Placide',     'gross' => 341834,  'paye' => 66550],
    ['fname' => 'NGOGA',         'lname' => 'Tito',        'gross' => 341834,  'paye' => 66550],
    ['fname' => 'UMUTESI',       'lname' => 'Alice',       'gross' => 341834,  'paye' => 66550],
    ['fname' => 'NIYONSABA',     'lname' => 'Esperance',   'gross' => 341834,  'paye' => 66550],
    ['fname' => 'KAMPARAYE',     'lname' => 'Iphigénie',   'gross' => 341834,  'paye' => 66550],
    ['fname' => 'UWIMANA',       'lname' => 'Jeanne',      'gross' => 341834,  'paye' => 66550],
    ['fname' => 'MUSABYEMARIYA', 'lname' => 'Gaudiose',    'gross' => 341834,  'paye' => 66550],
    ['fname' => 'NIKOMBABONA',   'lname' => 'Etienne',     'gross' => 341834,  'paye' => 66550],
    ['fname' => 'SIBOMANA',      'lname' => 'Eric',        'gross' => 341834,  'paye' => 66550],
    ['fname' => 'HAKIZIMANA',    'lname' => 'Martin',      'gross' => 341834,  'paye' => 66550],
    ['fname' => 'NDAYISHIMIYE',  'lname' => 'Jean Damas',  'gross' => 545741,  'paye' => 127722],
    ['fname' => 'UWISHEMA',      'lname' => 'Charles',     'gross' => 182497,  'paye' => 20499],
    ['fname' => 'SAGE',          'lname' => 'Emmanuel',    'gross' => 130000,  'paye' => 10000],
    ['fname' => 'NTWARI',        'lname' => 'Innocent',    'gross' => 125000,  'paye' => 9000],
];

$periodYear  = 2026;
$periodMonth = 4;
$payMonth    = 'April 2026';

$inserted = 0;
$skipped  = 0;

foreach ($excelRows as $i => $row) {
    $fname = trim($row['fname']);
    $lname = trim($row['lname']);
    $gross = (float)$row['gross'];
    $paye  = (float)$row['paye'];
    $net   = max(0, $gross - $paye);
    $no    = $i + 1;

    // Strip titles from fname for matching
    $fnameClean = preg_replace('/^(Dr|DR|Prof|Mr|Mrs|Ms)\.?\s+/i', '', $fname);

    // ── 1. Find in `employees` by employee_lname ────────────────────────────
    $stmt = $pdo->prepare(
        "SELECT employee_id, employee_fname, employee_lname
         FROM employees
         WHERE employee_lname LIKE ?
         LIMIT 5"
    );
    $stmt->execute(["%{$lname}%"]);
    $candidates = $stmt->fetchAll();

    $emp = null;
    if (count($candidates) === 1) {
        $emp = $candidates[0];
    } elseif (count($candidates) > 1) {
        // Narrow by fname
        foreach ($candidates as $c) {
            if (stripos($c['employee_fname'], $fnameClean) !== false) {
                $emp = $c;
                break;
            }
        }
        if (!$emp) $emp = $candidates[0]; // fallback: first lname match
    }

    // ── 1b. Fallback: search by the all-caps surname (fname column) ─────────
    // Handles cases where DB has names swapped or spelling differs slightly
    if (!$emp) {
        $stmt2b = $pdo->prepare(
            "SELECT employee_id, employee_fname, employee_lname
             FROM employees
             WHERE employee_fname LIKE ? OR employee_lname LIKE ?
             LIMIT 5"
        );
        $stmt2b->execute(["%{$fnameClean}%", "%{$fnameClean}%"]);
        $candidates2 = $stmt2b->fetchAll();
        if (count($candidates2) === 1) {
            $emp = $candidates2[0];
        } elseif (count($candidates2) > 1) {
            foreach ($candidates2 as $c) {
                if (stripos($c['employee_fname'], $lname) !== false ||
                    stripos($c['employee_lname'], $lname) !== false) {
                    $emp = $c;
                    break;
                }
            }
            if (!$emp) $emp = $candidates2[0];
        }
    }

    if (!$emp) {
        $skipped++;
        echo "[{$no}] SKIP  — no employee found for {$fname} {$lname}\n";
        continue;
    }

    $empId = (int)$emp['employee_id'];

    // ── 2. Upsert into hr_payroll using employees.employee_id ───────────────
    $stmtUp = $pdo->prepare(
        "INSERT INTO hr_payroll
           (emp_id, pay_month, period_year, period_month,
            basic_salary, housing_allowance, transport_allowance, other_allowances,
            gross, tax, pension, rama, maternity, cbhi, net, status)
         VALUES (?, ?, ?, ?,  ?, 0, 0, 0,  ?, ?, 0, 0, 0, 0, ?, 'Approved')
         ON DUPLICATE KEY UPDATE
           pay_month    = VALUES(pay_month),
           basic_salary = VALUES(basic_salary),
           gross        = VALUES(gross),
           tax          = VALUES(tax),
           net          = VALUES(net),
           status       = VALUES(status)"
    );
    $stmtUp->execute([
        $empId, $payMonth, $periodYear, $periodMonth,
        $gross, $gross, $paye, $net,
    ]);

    $inserted++;
    echo "[{$no}] OK    employee_id#{$empId} ({$emp['employee_fname']} {$emp['employee_lname']}) — Gross: " . number_format($gross) . " | PAYE: " . number_format($paye) . "\n";
}

echo "\n✓ Done: {$inserted} payroll records upserted, {$skipped} skipped (not found in employees table).\n";
