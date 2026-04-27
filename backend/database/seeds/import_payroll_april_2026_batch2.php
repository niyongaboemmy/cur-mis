<?php
/**
 * Seed: Import April-2026 payroll — Batch 2 (45 employees).
 * Matching: employee_lname (Last name column) in employees table.
 * Also updates employees.salary for each matched/created employee.
 * Run: php backend/database/seeds/import_payroll_april_2026_batch2.php
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

// fname = First name column (caps surname), lname = Last name column (given name)
// paye  = Per H.R column (HR-submitted PAYE, stored as `tax` in hr_payroll)
$excelRows = [
    ['fname' => 'SENYENZI',          'lname' => 'Apollon',            'gross' => 588002,  'paye' => 140401],
    ['fname' => 'MUTONIWASE',        'lname' => 'Alice',              'gross' => 588002,  'paye' => 140401],
    ['fname' => 'Dr.BAYISENGE',      'lname' => 'Rachel',             'gross' => 885810,  'paye' => 229743],
    ['fname' => 'Dr. GASANA',        'lname' => 'Emmanuel',           'gross' => 735810,  'paye' => 184743],
    ['fname' => 'ICYIMANISHAKA',     'lname' => 'François',           'gross' => 588002,  'paye' => 140401],
    ['fname' => 'KARENZI',           'lname' => 'Eric',               'gross' => 588002,  'paye' => 140401],
    ['fname' => 'Sr.UWIMANIMPAYE',   'lname' => 'Donatha',            'gross' => 1045905, 'paye' => 277772],
    ['fname' => 'MUHIMBAZA',         'lname' => 'Consolée',           'gross' => 773771,  'paye' => 196131],
    ['fname' => 'NSHIMYUMUREMYI',    'lname' => 'Eustache',           'gross' => 687880,  'paye' => 170364],
    ['fname' => 'Dr.HASHAKIMANA',    'lname' => 'Theogene',           'gross' => 1237334, 'paye' => 335200],
    ['fname' => 'NIYONAGIZE',        'lname' => 'Jean Pierre',        'gross' => 588002,  'paye' => 140401],
    ['fname' => 'Dr.MUHAYIMANA',     'lname' => 'Protais',            'gross' => 1180615, 'paye' => 318184],
    ['fname' => 'Dr.HARIMANA',       'lname' => 'Yves',               'gross' => 995304,  'paye' => 262591],
    ['fname' => 'Dr.SIBOMANA',       'lname' => 'Aimable',            'gross' => 1296662, 'paye' => 352998],
    ['fname' => 'ULIHO',             'lname' => 'Alphonse',           'gross' => 588002,  'paye' => 140401],
    ['fname' => 'Dr. BYUKUSENGE',    'lname' => 'Celine',             'gross' => 995304,  'paye' => 262591],
    ['fname' => 'MUKANTABANA',       'lname' => 'Bertilde',           'gross' => 845450,  'paye' => 217635],
    ['fname' => 'NZAMURAMBAHO',      'lname' => 'Humure Philippe',    'gross' => 545741,  'paye' => 127722],
    ['fname' => 'NWANKO Helen',      'lname' => 'Chinwe',             'gross' => 395886,  'paye' => 82766],
    ['fname' => 'ISHIMWE',           'lname' => 'Samuel',             'gross' => 845450,  'paye' => 217635],
    ['fname' => 'BIZIMUNGU',         'lname' => 'Japhet',             'gross' => 492853,  'paye' => 111856],
    ['fname' => 'UWIRINGIYIMANA',    'lname' => 'Françoise',          'gross' => 492853,  'paye' => 111856],
    ['fname' => 'NYIRANGERI',        'lname' => 'Pierrine',           'gross' => 653336,  'paye' => 160001],
    ['fname' => 'INGABIRE',          'lname' => 'Marie Laetitia',     'gross' => 845450,  'paye' => 217635],
    ['fname' => 'ZALWANGO Shadiah',  'lname' => 'Madinah',            'gross' => 1000053, 'paye' => 264016],
    ['fname' => 'BUCYANA',           'lname' => 'Florence',           'gross' => 588002,  'paye' => 140401],
    ['fname' => 'NGENDAHIMANA',      'lname' => 'SAFARI',             'gross' => 492853,  'paye' => 111856],
    ['fname' => 'NSENGIYUMVA',       'lname' => 'Jean marie Vianney', 'gross' => 915921,  'paye' => 238776],
    ['fname' => 'SENDEGEYA',         'lname' => 'Pierre',             'gross' => 588002,  'paye' => 140401],
    ['fname' => 'NDATUMUREMYI',      'lname' => 'Japhet',             'gross' => 552851,  'paye' => 129855],
    ['fname' => 'NZEYIMANA',         'lname' => 'Godefroid',          'gross' => 635982,  'paye' => 154795],
    ['fname' => 'UWIMANA',           'lname' => 'Clementine',         'gross' => 552851,  'paye' => 129855],
    ['fname' => 'SEBAHIRE',          'lname' => 'Ignace',             'gross' => 829132,  'paye' => 212740],
    ['fname' => 'NZUMVIRIMANA',      'lname' => 'Charles',            'gross' => 552851,  'paye' => 129855],
    ['fname' => 'ISHIMWE',           'lname' => 'Alain Prudence',     'gross' => 437673,  'paye' => 95302],
    ['fname' => 'IZERE',             'lname' => 'Cedrick',            'gross' => 437673,  'paye' => 95302],
    ['fname' => 'NTAWUZUMUSI',       'lname' => 'Elias',              'gross' => 1036488, 'paye' => 274947],
    ['fname' => 'Maurice',           'lname' => 'NTAHOBARI',          'gross' => 588002,  'paye' => 140401],
    ['fname' => 'SHYAKA',            'lname' => 'Emmanuel',           'gross' => 588002,  'paye' => 140401],
    ['fname' => 'URAYENEZA',         'lname' => 'Yves',               'gross' => 1045905, 'paye' => 277772],
    ['fname' => 'MUTAYOMBA',         'lname' => 'Sylvestre',          'gross' => 966073,  'paye' => 253822],
    ['fname' => 'Dr BISHYANUKA',     'lname' => 'Joseph',             'gross' => 1045905, 'paye' => 277772],
    ['fname' => 'Dr. HAKIZIMANA',    'lname' => 'Lucien',             'gross' => 1029937, 'paye' => 272981],
    ['fname' => 'BAYISENGE',         'lname' => 'Ernestine',          'gross' => 588002,  'paye' => 140401],
];

$periodYear  = 2026;
$periodMonth = 4;
$payMonth    = 'April 2026';

$inserted = 0;
$updated  = 0;
$created  = 0;

$stmtByLname = $pdo->prepare(
    "SELECT employee_id, employee_fname, employee_lname
     FROM employees WHERE employee_lname LIKE ? LIMIT 5"
);
$stmtByFname = $pdo->prepare(
    "SELECT employee_id, employee_fname, employee_lname
     FROM employees WHERE employee_fname LIKE ? OR employee_lname LIKE ? LIMIT 5"
);
$stmtUpdateSalary = $pdo->prepare(
    "UPDATE employees SET salary = ? WHERE employee_id = ?"
);
$stmtCreate = $pdo->prepare(
    "INSERT INTO employees (employee_fname, employee_lname, employee_status, account_status, salary, employee_reg_date)
     VALUES (?, ?, 'Permanent', 'Active', ?, CURDATE())"
);
$stmtUpsert = $pdo->prepare(
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

foreach ($excelRows as $i => $row) {
    $fname = trim($row['fname']);
    $lname = trim($row['lname']);
    $gross = (float)$row['gross'];
    $paye  = (float)$row['paye'];
    $net   = max(0, $gross - $paye);
    $no    = $i + 1;

    // Strip titles
    $fnameClean = preg_replace('/^(Dr|DR|Prof|Mr|Mrs|Ms|Sr)\.?\s+/i', '', $fname);
    $fnameClean = trim($fnameClean);

    // ── 1. Match by employee_lname (Last name column) ───────────────────────
    $stmtByLname->execute(["%{$lname}%"]);
    $candidates = $stmtByLname->fetchAll();

    $emp = null;
    if (count($candidates) === 1) {
        $emp = $candidates[0];
    } elseif (count($candidates) > 1) {
        foreach ($candidates as $c) {
            if (stripos($c['employee_fname'], $fnameClean) !== false) {
                $emp = $c; break;
            }
        }
        // Fallback: pick first lname match
        if (!$emp) $emp = $candidates[0];
    }

    // ── 2. Fallback: search by all-caps surname in fname/lname ──────────────
    if (!$emp) {
        $stmtByFname->execute(["%{$fnameClean}%", "%{$fnameClean}%"]);
        $candidates2 = $stmtByFname->fetchAll();
        if (count($candidates2) === 1) {
            $emp = $candidates2[0];
        } elseif (count($candidates2) > 1) {
            foreach ($candidates2 as $c) {
                if (stripos($c['employee_fname'], $lname) !== false ||
                    stripos($c['employee_lname'], $lname) !== false) {
                    $emp = $c; break;
                }
            }
            if (!$emp) $emp = $candidates2[0];
        }
    }

    // ── 3. Create new employee if not found ─────────────────────────────────
    if (!$emp) {
        $stmtCreate->execute([$fnameClean, $lname, $gross]);
        $newId = (int)$pdo->lastInsertId();
        $emp   = ['employee_id' => $newId, 'employee_fname' => $fnameClean, 'employee_lname' => $lname];
        $created++;
        echo "[{$no}] CREATED  emp#{$newId} {$fnameClean} {$lname}\n";
    } else {
        // Update salary on matched employee
        $stmtUpdateSalary->execute([$gross, (int)$emp['employee_id']]);
        $updated++;
    }

    $empId = (int)$emp['employee_id'];

    // ── 4. Upsert into hr_payroll ────────────────────────────────────────────
    $stmtUpsert->execute([
        $empId, $payMonth, $periodYear, $periodMonth,
        $gross, $gross, $paye, $net,
    ]);

    $inserted++;
    echo "[{$no}] OK  emp#{$empId} ({$emp['employee_fname']} {$emp['employee_lname']}) | Gross: " . number_format($gross) . " | PAYE: " . number_format($paye) . "\n";
}

echo "\n✓ Done: {$inserted} payroll records upserted, {$created} new employees created, {$updated} salary fields updated.\n";

$total = (int)$pdo->query("SELECT COUNT(*) FROM hr_payroll WHERE period_year=2026 AND period_month=4")->fetchColumn();
echo "Total April 2026 payroll rows in DB: {$total}\n";
