<?php
/**
 * =============================================================================
 *  CUR GRADUATION BOOKLET — DATA GENERATOR (PDF output removed for now)
 * =============================================================================
 *  Pulls staff (with photos) from `employees` and students from `student`
 *  (curac_save database), groups/filters them the same way the booklet
 *  needs, and renders an HTML PREVIEW in the browser instead of a PDF.
 *
 *  PDF GENERATION REMOVED ON REQUEST
 *  -------------------------------------------------------------------------
 *  All FPDF/PDF code has been taken out. Everything up through data
 *  fetching, grouping and the stats summary is untouched and fully working
 *  — you can use this to confirm your DB connection, filters, and grouping
 *  logic are correct before wiring a PDF library back in.
 *
 *  TO ADD PDF GENERATION BACK LATER
 *  -------------------------------------------------------------------------
 *  Everything you need is already computed and sitting in these variables
 *  right before the "7. OUTPUT" section below:
 *      $management     -> array of senior management staff (with photo path)
 *      $academicStaff  -> array of general academic staff
 *      $students       -> flat array of filtered students
 *      $grouped        -> $students grouped by [faculty][department/option]
 *      $stats          -> gender/total counts per faculty/department
 *  Just replace the HTML-building block in "7. OUTPUT" with calls into
 *  whichever PDF library you pick (FPDF, TCPDF, mPDF, dompdf, etc.) — the
 *  data shape won't need to change.
 *
 *  WHAT YOU MUST EDIT BEFORE USE
 *  -------------------------------------------------------------------------
 *  1. DB credentials in "1. DATABASE" below.
 *  2. Photo storage paths in "2. PHOTO STORAGE".
 *  3. $MANAGEMENT_POSITIONS — must match your real employee_position values.
 *     Run: SELECT DISTINCT employee_position FROM employees;
 *  4. $FACULTY_LABELS — maps student.faculty short codes to full names.
 *     Run: SELECT DISTINCT faculty FROM student;
 *  5. Degree classification (First Class / Second Upper / etc.) is
 *     intentionally NOT included — not derivable from the schema you sent.
 *  6. Rector's foreword, Programme timetable, Academic Awards list are
 *     static institutional text — edit the arrays marked "STATIC CONTENT".
 *
 *  USAGE
 *  -------------------------------------------------------------------------
 *  Visit index.php -> pick Academic Year / Intake / ceremony number & date
 *  on the filter form -> submit -> see an HTML preview of the data.
 * =============================================================================
 */

declare(strict_types=1);
error_reporting(E_ALL & ~E_DEPRECATED);

// =============================================================================
// 1. DATABASE
// =============================================================================
define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'curac_save');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

function getPDO(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

// =============================================================================
// 2. PHOTO STORAGE  — EDIT THESE PATHS
// =============================================================================
define('EMPLOYEE_PHOTO_BASE', __DIR__ . '/uploads/employees/');
define('STUDENT_PHOTO_BASE',  __DIR__ . '/uploads/students/');
define('CHANCELLOR_PHOTO',    __DIR__ . '/assets/chancellor.jpg'); // optional static image

function resolvePhoto(string $base, ?string $relative): ?string
{
    if (!$relative) {
        return null;
    }
    $relative = ltrim($relative, '/');
    $path = rtrim($base, '/') . '/' . $relative;
    return is_file($path) ? $path : null;
}

// =============================================================================
// 3. STATIC CONTENT — EDIT FREELY (not present in the supplied tables)
// =============================================================================
define('UNIVERSITY_NAME', 'Catholic University of Rwanda');
define('CHANCELLOR_NAME', 'BISHOP PHILIPPE RUKAMBA');
define('CHANCELLOR_TITLE', 'CUR CHANCELLOR');

$GOVERNING_BODY = [
    'Prof. Dr. Leon MUTESA',
    'Fr. Dr. Laurent NTAGANDA',
    'Br. Dr. Albert NZABONALIBA',
    'Miss Lilianne GASANGO',
    'Dr. Christine MUKANTWARI',
    'Mr. Ernest RWAGASANA',
    'Sr. Dr. Catherine KAZIBERA',
    'Dr. Bosco Prince KANANI',
    'Dr. Celestin KUBUMWE',
    'Fr. Emmanuel RUTANGUSA',
    'Prof. Jean Chrysostome NKEJABAHIZI',
    'Mrs. Marie Ignatianna MUKARUSANGA',
    'Dr. Protais MUHAYIMANA',
    'Mrs. Alice MUTONIWASE',
    'Mrs. Pascasie MUSABYEMUNGU',
    'Dr. Pierre Celestin RWABUKUMBA',
];

// employee_position value (exact match) => printed title. Order = print order.
// EDIT to match your real employee_position values.
$MANAGEMENT_POSITIONS = [
    'Rector'                        => 'Rector',
    'VRAC'                          => 'VRAC',
    'DAF'                           => 'DAF',
    'Academic Registrar'            => 'Academic Registrar',
    'Director of Quality Assurance' => 'Director of Quality Assurance',
    'Director of Research'          => 'Director of Research',
    'Director of ICT'               => 'Director of ICT',
    'Director of the Library'       => 'Director of the Library',
    'Dean of Students'              => 'Dean of Students',
    'HRM'                           => 'HRM',
];

// student.faculty short code => printed faculty name. EDIT to match your data.
$FACULTY_LABELS = [
    'FCRS'  => 'Faculty of Catechesis and Religious Sciences (FCRS)',
    'FCOM'  => 'Faculty of Commerce (FCOM)',
    'FED'   => 'Faculty of Education (FED)',
    'FPHHN' => 'Faculty of Public Health and Human Nutrition (FPHHN)',
    'FST'   => 'Faculty of Science and Technology (FST)',
    'FSW'   => 'Faculty of Social Work (FSW)',
    'PGDE'  => 'Postgraduate Diploma in Education (PGDE)',
];

$RECTOR_FOREWORD = "It is my great pleasure to welcome you to this Graduation Ceremony at "
    . UNIVERSITY_NAME . ". Today's ceremony honours the effort, perseverance and "
    . "achievements of our graduates.\n\nEDIT THIS PARAGRAPH - paste your own Rector's "
    . "foreword text here.";

$PROGRAMME = [
    ['07:30 - 08:30', 'Arrival of Graduands, Parents and Students'],
    ['08:30 - 09:00', 'Arrival of Invited Guests and Members of the Governing Body'],
    ['09:00 - 09:15', 'Arrival of the Chairperson of the Governing Body'],
    ['09:15 - 09:30', 'Arrival of the Chancellor'],
    ['09:30 - 10:00', 'Academic Procession'],
    ['10:00 - 10:10', 'National Anthem'],
    ['10:10 - 10:15', 'Prayer'],
    ['10:15 - 10:20', 'The Chairperson of the Governing Body constitutes the Congregation'],
    ['10:20 - 10:30', 'The Rector addresses the Congregation'],
    ['10:30 - 10:40', 'Entertainment'],
    ['10:40 - 11:00', 'Speech of the Chancellor'],
    ['11:00 - 12:00', 'Conferment of Degrees to Graduands'],
    ['12:00 - 12:20', 'Awarding the best Graduates'],
    ['12:20 - 12:35', 'Speech of Alumni Representative'],
    ['12:35 - 12:45', 'Speech of Graduates Representative'],
    ['12:45 - 13:05', 'Short Dance Interlude'],
    ['13:05 - 13:10', 'The Chairperson of the Governing Body dissolves the Congregation'],
    ['13:10 - 13:15', 'Blessing by the Chancellor'],
    ['13:15',         'Academic Recession'],
];

$ACADEMIC_AWARDS = [
    "Bachelor's degree in Catechesis",
    "Bachelor's degree in Religious Sciences",
    "Bachelor's degree in Commercial Engineering",
    "Bachelor's degree in Management and Accounting",
    "Bachelor's degree in Educational Management and Planning",
    "Bachelor's degree in Didactics of Mathematics and Computer Science",
    "Bachelor's degree in Human Nutrition",
    "Bachelor's degree in Public Health",
    "Bachelor's degree in Biomedical Laboratory Sciences",
    "Bachelor's degree in Computer Science",
    "Bachelor's degree in Child and Family Studies",
    "Bachelor's degree in Welfare and Social Development",
    "Post Graduate Diploma in Education",
    // ...add the rest to match your current programme catalogue
];

// Position keywords used to pull the general Academic Staff list. Matches
// employee_position LIKE '%keyword%'. Anyone already in $MANAGEMENT_POSITIONS
// is excluded automatically.
$ACADEMIC_STAFF_KEYWORDS = ['Dr.', 'Prof.', 'Fr.', 'Sr.', 'Mr.', 'Mrs.'];

// =============================================================================
// 4. DATA ACCESS
// =============================================================================

function fetchManagementTeam(PDO $pdo, array $positions): array
{
    if (!$positions) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($positions), '?'));
    $stmt = $pdo->prepare("
        SELECT employee_id, employee_fname, employee_lname, employee_position, employee_photo
        FROM employees
        WHERE employee_position IN ($placeholders)
    ");
    $stmt->execute(array_keys($positions));
    $rows = $stmt->fetchAll();

    $order = array_flip(array_keys($positions));
    usort($rows, fn($a, $b) => ($order[$a['employee_position']] ?? 999) <=> ($order[$b['employee_position']] ?? 999));
    return $rows;
}

function fetchAcademicStaff(PDO $pdo, array $keywords, array $excludeIds): array
{
    if (!$keywords) {
        return [];
    }
    $conds = implode(' OR ', array_fill(0, count($keywords), 'employee_position LIKE ?'));
    $sql = "SELECT employee_id, employee_fname, employee_lname, employee_position
            FROM employees WHERE ($conds)";
    $params = array_map(fn($k) => "%$k%", $keywords);

    if ($excludeIds) {
        $sql .= ' AND employee_id NOT IN (' . implode(',', array_fill(0, count($excludeIds), '?')) . ')';
        $params = array_merge($params, $excludeIds);
    }
    $sql .= ' ORDER BY employee_lname, employee_fname';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * Fetch students with their aggregate marks from module_marks table.
 * Calculates total marks and classification (First Class, Second Upper, etc.)
 */
function fetchStudents(PDO $pdo, ?string $accYear, ?string $intake, ?string $state): array
{
    $sql = "SELECT
                s.id, s.regnumber, s.fname, s.lname, s.gender, s.faculty, s.department, s.std_option,
                s.programme_level, s.current_level, s.acc_year, s.intake, s.student_state, s.photo,
                COALESCE(AVG(mm.percentage), 0) AS avg_marks,
                COALESCE(SUM(CASE WHEN mm.percentage >= 50 THEN 1 ELSE 0 END), 0) AS passed_modules,
                COALESCE(COUNT(mm.module_id), 0) AS total_modules
            FROM student s
            LEFT JOIN module_marks mm ON s.id = mm.student_id
            WHERE 1=1";
    $params = [];

    if ($accYear !== null && $accYear !== '') {
        $sql .= ' AND s.acc_year = ?';
        $params[] = $accYear;
    }
    if ($intake !== null && $intake !== '') {
        $sql .= ' AND s.intake = ?';
        $params[] = $intake;
    }
    if ($state !== null && $state !== '') {
        $sql .= ' AND s.student_state = ?';
        $params[] = $state;
    }

    $sql .= ' GROUP BY s.id ORDER BY avg_marks DESC, s.lname, s.fname';

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * Classify student based on average marks
 * >80 = First Class, >70 = Second Upper, >60 = Second Lower, >50 = Pass, else = Fail
 */
function getClassification(float $avgMarks, int $totalModules): array
{
    if ($totalModules === 0) {
        return ['class' => 'No Marks', 'grade' => 'N/A', 'color' => '#999'];
    }

    if ($avgMarks >= 80) {
        return ['class' => 'First Class', 'grade' => 'A', 'color' => '#1a7a1a'];
    } elseif ($avgMarks >= 70) {
        return ['class' => 'Second Upper', 'grade' => 'B+', 'color' => '#2d7a2d'];
    } elseif ($avgMarks >= 60) {
        return ['class' => 'Second Lower', 'grade' => 'B', 'color' => '#4a8a4a'];
    } elseif ($avgMarks >= 50) {
        return ['class' => 'Pass', 'grade' => 'C', 'color' => '#ff9800'];
    } else {
        return ['class' => 'Fail', 'grade' => 'F', 'color' => '#cc0000'];
    }
}

/**
 * Separate students into groups by classification
 */
function groupStudentsByClassification(array $students): array
{
    $classified = [
        'First Class' => [],
        'Second Upper' => [],
        'Second Lower' => [],
        'Pass' => [],
        'Fail' => [],
        'No Marks' => [],
    ];

    foreach ($students as $student) {
        $avgMarks = (float)($student['avg_marks'] ?? 0);
        $totalModules = (int)($student['total_modules'] ?? 0);
        $classification = getClassification($avgMarks, $totalModules);
        $classified[$classification['class']][] = $student;
    }

    // Remove empty classes
    return array_filter($classified, fn($arr) => !empty($arr));
}

function groupStudents(array $students): array
{
    $grouped = [];
    foreach ($students as $s) {
        $faculty = $s['faculty'] ?: 'UNSPECIFIED';
        $deptLabel = trim(($s['department'] ?: '') . ($s['std_option'] ? ' (' . $s['std_option'] . ')' : ''));
        $deptLabel = $deptLabel !== '' ? $deptLabel : 'General';
        $grouped[$faculty][$deptLabel][] = $s;
    }
    return $grouped;
}

function buildStatsSummary(array $grouped): array
{
    $summary = [];
    $grandF = $grandM = 0;
    foreach ($grouped as $faculty => $depts) {
        foreach ($depts as $dept => $students) {
            $f = count(array_filter($students, fn($s) => strtoupper((string)$s['gender']) === 'F'));
            $m = count(array_filter($students, fn($s) => strtoupper((string)$s['gender']) === 'M'));
            $summary[$faculty][$dept] = ['F' => $f, 'M' => $m, 'total' => $f + $m];
            $grandF += $f;
            $grandM += $m;
        }
    }
    $summary['__grand_total__'] = ['F' => $grandF, 'M' => $grandM, 'total' => $grandF + $grandM];
    return $summary;
}

function fetchDistinct(PDO $pdo, string $column): array
{
    $allowed = ['acc_year', 'intake', 'student_state']; // whitelist against injection
    if (!in_array($column, $allowed, true)) {
        throw new InvalidArgumentException('Column not allowed');
    }
    $stmt = $pdo->query("SELECT DISTINCT `$column` AS v FROM student WHERE `$column` IS NOT NULL AND `$column` <> '' ORDER BY `$column`");
    return array_column($stmt->fetchAll(), 'v');
}

// =============================================================================
// 5. PDF DOWNLOAD HANDLER
// =============================================================================
function generateResultsPDF(PDO $pdo, string $accYear, string $intake, string $studentState): void
{
    // Check if TCPDF or DOMPDF is available, otherwise use native PHP PDF generation
    if (!class_exists('TCPDF') && !class_exists('Dompdf\\Dompdf')) {
        // Fallback: generate as HTML and let browser print
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: inline; filename="student-results.html"');
        ob_start();
        ?>
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Student Results Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 15px; }
                h1 { text-align: center; color: #2f6b2f; }
                .classification { margin: 20px 0; page-break-inside: avoid; }
                .classification-header { padding: 10px; font-weight: bold; font-size: 14px; margin-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #ccc; padding: 8px; font-size: 12px; text-align: left; }
                th { background: #2f6b2f; color: #fff; }
                tr:nth-child(even) { background: #f9f9f9; }
                .print-only { display: block; }
                @media print {
                    body { margin: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>Student Results Report</h1>
            <p style="text-align: center; color: #555;">Generated on <?= date('d/m/Y H:i') ?></p>
        <?php

        $students = fetchStudents($pdo, $accYear ?: null, $intake ?: null, $studentState ?: null);
        $classifiedStudents = groupStudentsByClassification($students);
        $classOrder = ['First Class', 'Second Upper', 'Second Lower', 'Pass', 'Fail', 'No Marks'];

        foreach ($classOrder as $classification) {
            if (!isset($classifiedStudents[$classification])) continue;
            $classStudents = $classifiedStudents[$classification];
            $sample = $classStudents[0];
            $classInfo = getClassification((float)($sample['avg_marks'] ?? 0), (int)($sample['total_modules'] ?? 0));
            $color = $classInfo['color'];
            ?>
            <div class="classification">
                <div class="classification-header" style="background: <?= htmlspecialchars($color) ?>22; border-left: 4px solid <?= htmlspecialchars($color) ?>;">
                    <?= htmlspecialchars($classification) ?> — <?= count($classStudents) ?> students
                </div>
                <table>
                    <tr>
                        <th>S/N</th>
                        <th>Surname</th>
                        <th>First Name</th>
                        <th>Reg. Number</th>
                        <th>Faculty</th>
                        <th>Avg Marks</th>
                        <th>Grade</th>
                        <th>Passed/Total</th>
                    </tr>
                    <?php $sn = 1; foreach ($classStudents as $s): ?>
                        <?php $classData = getClassification((float)($s['avg_marks'] ?? 0), (int)($s['total_modules'] ?? 0)); ?>
                        <tr>
                            <td><?= $sn++ ?></td>
                            <td><?= htmlspecialchars((string)$s['lname']) ?></td>
                            <td><?= htmlspecialchars((string)$s['fname']) ?></td>
                            <td><?= htmlspecialchars((string)$s['regnumber']) ?></td>
                            <td><?= htmlspecialchars($s['faculty'] ?? '—') ?></td>
                            <td style="text-align: center; font-weight: bold;"><?= number_format((float)($s['avg_marks'] ?? 0), 2) ?>%</td>
                            <td style="text-align: center; font-weight: bold;"><?= htmlspecialchars($classData['grade']) ?></td>
                            <td style="text-align: center;"><?= $s['passed_modules'] ?>/<?= $s['total_modules'] ?></td>
                        </tr>
                    <?php endforeach; ?>
                </table>
            </div>
            <?php
        }
        ?>
        </body>
        </html>
        <?php
        echo ob_get_clean();
        exit;
    }
}

// =============================================================================
// 6. REQUEST HANDLING — filter form, then preview on submit
// =============================================================================
$action = $_GET['action'] ?? '';

// Handle PDF download
if ($action === 'download_pdf') {
    $accYear = $_GET['acc_year'] ?? '';
    $intake = $_GET['intake'] ?? '';
    $studentState = $_GET['student_state'] ?? '';
    $pdo = getPDO();
    generateResultsPDF($pdo, $accYear, $intake, $studentState);
}

if ($action !== 'generate') {
    $pdo = getPDO();
    $years   = fetchDistinct($pdo, 'acc_year');
    $intakes = fetchDistinct($pdo, 'intake');
    $states  = fetchDistinct($pdo, 'student_state');
    ?>
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Generate Graduation Booklet</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 520px; margin: 40px auto; }
            label { display: block; margin-top: 14px; font-weight: bold; }
            select, input { width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
            button { margin-top: 22px; padding: 10px 18px; background: #2f6b2f; color: #fff; border: 0; border-radius: 4px; cursor: pointer; }
        </style>
    </head>
    <body>
        <h2>Generate Graduation Booklet (preview)</h2>
        <p style="color:#555;">PDF output is disabled for now — this shows the assembled data as an HTML page.</p>
        <form method="get" action="index.php">
            <input type="hidden" name="action" value="generate">

            <label>Academic Year (acc_year)</label>
            <select name="acc_year">
                <option value="">-- All --</option>
                <?php foreach ($years as $y): ?>
                    <option value="<?= htmlspecialchars($y) ?>"><?= htmlspecialchars($y) ?></option>
                <?php endforeach; ?>
            </select>

            <label>Intake</label>
            <select name="intake">
                <option value="">-- All --</option>
                <?php foreach ($intakes as $i): ?>
                    <option value="<?= htmlspecialchars($i) ?>"><?= htmlspecialchars($i) ?></option>
                <?php endforeach; ?>
            </select>

            <label>Student state</label>
            <select name="student_state">
                <option value="">-- All --</option>
                <?php foreach ($states as $s): ?>
                    <option value="<?= htmlspecialchars($s) ?>"><?= htmlspecialchars($s) ?></option>
                <?php endforeach; ?>
            </select>

            <label>Ceremony ordinal (e.g. "10th")</label>
            <input type="text" name="ceremony_no" value="10th" required>

            <label>Ceremony date</label>
            <input type="date" name="ceremony_date" value="<?= date('Y-m-d') ?>" required>

            <button type="submit">Preview data</button>
        </form>
    </body>
    </html>
    <?php
    exit;
}

// ---- action=generate: gather data -------------------------------------------
$accYear         = $_GET['acc_year'] ?? '';
$intake          = $_GET['intake'] ?? '';
$studentState    = $_GET['student_state'] ?? '';
$ceremonyNo      = $_GET['ceremony_no'] ?? '10th';
$ceremonyDateRaw = $_GET['ceremony_date'] ?? date('Y-m-d');
$ceremonyDate    = date('jS M. Y', strtotime($ceremonyDateRaw)); // dynamic, always current input/today

$pdo = getPDO();

$management    = fetchManagementTeam($pdo, $MANAGEMENT_POSITIONS);
$managementIds = array_column($management, 'employee_id');
$academicStaff = fetchAcademicStaff($pdo, $ACADEMIC_STAFF_KEYWORDS, $managementIds);
$students      = fetchStudents($pdo, $accYear ?: null, $intake ?: null, $studentState ?: null);
$grouped       = groupStudents($students);
$stats         = buildStatsSummary($grouped);

// =============================================================================
// 7. OUTPUT — HTML preview with classified results
// =============================================================================
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title><?= htmlspecialchars($ceremonyNo) ?> Graduation Ceremony - <?= htmlspecialchars($ceremonyDate) ?></title>
    <style>
        body { font-family: Arial, sans-serif; margin: 30px; color: #222; }
        h1 { text-align: center; }
        h2 { border-bottom: 2px solid #2f6b2f; padding-bottom: 4px; margin-top: 40px; }
        h3 { margin-bottom: 4px; margin-top: 0; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 14px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 13px; text-align: left; }
        th { background: #a9cce3; font-weight: bold; }
        .mgmt-grid { display: flex; flex-wrap: wrap; gap: 16px; }
        .mgmt-card { width: 140px; text-align: center; font-size: 12px; }
        .mgmt-card img { width: 100px; height: 120px; object-fit: cover; border: 1px solid #ccc; }
        .no-photo { width: 100px; height: 120px; border: 1px dashed #aaa; display: flex; align-items: center; justify-content: center; color: #999; margin: 0 auto; }
        .note { background: #fff8e1; border: 1px solid #e0c060; padding: 10px 14px; font-size: 13px; margin-bottom: 20px; }
        a.back { display: inline-block; margin-bottom: 16px; }
        .download-btn { display: inline-block; padding: 12px 24px; background: #007bff; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; margin-bottom: 20px; transition: background 0.3s; }
        .download-btn:hover { background: #0056b3; }
        .classification-box { margin-top: 30px; padding: 12px; border-left: 4px solid; page-break-inside: avoid; }
        .classification-box h3 { margin: 0 0 12px 0; }
        .stats-summary { background: #f5f5f5; padding: 12px; margin: 20px 0; border-radius: 4px; }
        .stats-summary p { margin: 6px 0; font-size: 14px; }
    </style>
</head>
<body>
    <a class="back" href="index.php">&larr; back to filters</a>
    <div class="note">PDF generation is currently disabled — plug your PDF library into "6. OUTPUT" in index.php when ready. $management, $academicStaff, $students, $grouped and $stats are already computed above that section.</div>

    <h1><?= htmlspecialchars(UNIVERSITY_NAME) ?><br><?= htmlspecialchars($ceremonyNo) ?> Graduation Ceremony — <?= htmlspecialchars($ceremonyDate) ?></h1>

    <h2>Senior Management Team</h2>
    <div class="mgmt-grid">
        <?php foreach ($management as $person): ?>
            <?php $photoPath = resolvePhoto(EMPLOYEE_PHOTO_BASE, $person['employee_photo']); ?>
            <div class="mgmt-card">
                <?php if ($photoPath): ?>
                    <img src="<?= htmlspecialchars(str_replace(__DIR__, '', $photoPath)) ?>" alt="">
                <?php else: ?>
                    <div class="no-photo">No Photo</div>
                <?php endif; ?>
                <strong><?= htmlspecialchars(trim($person['employee_fname'] . ' ' . strtoupper($person['employee_lname']))) ?></strong><br>
                <?= htmlspecialchars($MANAGEMENT_POSITIONS[$person['employee_position']] ?? $person['employee_position']) ?>
            </div>
        <?php endforeach; ?>
        <?php if (!$management): ?><p>No matches — check $MANAGEMENT_POSITIONS against your real employee_position values.</p><?php endif; ?>
    </div>

    <h2>Statistics Summary</h2>
    <table>
        <tr><th>Faculty</th><th>Department / Option</th><th>Female</th><th>Male</th><th>Total</th></tr>
        <?php foreach ($stats as $faculty => $depts): ?>
            <?php if ($faculty === '__grand_total__') continue; ?>
            <?php $first = true; foreach ($depts as $dept => $row): ?>
                <tr>
                    <td><?= $first ? htmlspecialchars($FACULTY_LABELS[$faculty] ?? $faculty) : '' ?></td>
                    <td><?= htmlspecialchars($dept) ?></td>
                    <td><?= $row['F'] ?></td>
                    <td><?= $row['M'] ?></td>
                    <td><?= $row['total'] ?></td>
                </tr>
            <?php $first = false; endforeach; ?>
        <?php endforeach; ?>
        <?php $gt = $stats['__grand_total__']; ?>
        <tr style="font-weight:bold;background:#f0f0f0;">
            <td colspan="2">GRAND TOTAL</td><td><?= $gt['F'] ?></td><td><?= $gt['M'] ?></td><td><?= $gt['total'] ?></td>
        </tr>
    </table>

    <h2>Students by Classification (Sorted by Marks)</h2>
    <div style="margin-bottom: 20px;">
        <a href="index.php?action=download_pdf&amp;acc_year=<?= urlencode($accYear) ?>&amp;intake=<?= urlencode($intake) ?>&amp;student_state=<?= urlencode($studentState) ?>"
           class="download-btn">
            📥 Download Results as PDF
        </a>
    </div>

    <?php
        $classifiedStudents = groupStudentsByClassification($students);
        $classOrder = ['First Class', 'Second Upper', 'Second Lower', 'Pass', 'Fail', 'No Marks'];
        $orderedClassified = [];
        foreach ($classOrder as $cls) {
            if (isset($classifiedStudents[$cls])) {
                $orderedClassified[$cls] = $classifiedStudents[$cls];
            }
        }
    ?>

    <!-- Classification Summary -->
    <div class="stats-summary">
        <h3 style="margin-top: 0;">Classification Summary</h3>
        <table style="margin-bottom: 0;">
            <tr>
                <th>Classification</th>
                <th>Grade</th>
                <th>Count</th>
                <th>Percentage</th>
            </tr>
            <?php
                $totalStudents = count($students);
                foreach ($classOrder as $cls) {
                    if (isset($orderedClassified[$cls])) {
                        $count = count($orderedClassified[$cls]);
                        $percentage = $totalStudents > 0 ? round(($count / $totalStudents) * 100, 1) : 0;
                        $sample = $orderedClassified[$cls][0];
                        $classInfo = getClassification((float)($sample['avg_marks'] ?? 0), (int)($sample['total_modules'] ?? 0));
                        ?>
                        <tr>
                            <td><strong><?= htmlspecialchars($cls) ?></strong></td>
                            <td style="text-align: center; font-weight: bold; color: <?= htmlspecialchars($classInfo['color']) ?>;">
                                <?= htmlspecialchars($classInfo['grade']) ?>
                            </td>
                            <td style="text-align: center;"><?= $count ?></td>
                            <td style="text-align: center;"><?= $percentage ?>%</td>
                        </tr>
                        <?php
                    }
                }
            ?>
            <tr style="font-weight: bold; background: #f0f0f0;">
                <td colspan="2">TOTAL</td>
                <td style="text-align: center;"><?= $totalStudents ?></td>
                <td style="text-align: center;">100%</td>
            </tr>
        </table>
    </div>

    <?php foreach ($orderedClassified as $classification => $classStudents): ?>
        <?php
            $sample = $classStudents[0];
            $classInfo = getClassification((float)($sample['avg_marks'] ?? 0), (int)($sample['total_modules'] ?? 0));
            $color = $classInfo['color'];
        ?>
        <div class="classification-box" style="background: <?= htmlspecialchars($color) ?>22; border-left-color: <?= htmlspecialchars($color) ?>;">
            <h3 style="color: <?= htmlspecialchars($color) ?>;">
                <?= htmlspecialchars($classification) ?> (<?= count($classStudents) ?> students)
            </h3>
            <table>
                <tr>
                    <th>S/N</th>
                    <th>Surname</th>
                    <th>First Name</th>
                    <th>Reg. Number</th>
                    <th>Faculty</th>
                    <th>Department</th>
                    <th>Avg Marks</th>
                    <th>Grade</th>
                    <th>Passed/Total Modules</th>
                </tr>
                <?php $sn = 1; foreach ($classStudents as $s): ?>
                    <?php $classData = getClassification((float)($s['avg_marks'] ?? 0), (int)($s['total_modules'] ?? 0)); ?>
                    <tr>
                        <td><?= $sn++ ?></td>
                        <td><?= htmlspecialchars((string)$s['lname']) ?></td>
                        <td><?= htmlspecialchars((string)$s['fname']) ?></td>
                        <td><?= htmlspecialchars((string)$s['regnumber']) ?></td>
                        <td><?= htmlspecialchars($FACULTY_LABELS[$s['faculty']] ?? $s['faculty'] ?? '—') ?></td>
                        <td><?= htmlspecialchars((string)($s['department'] ?? '—')) ?></td>
                        <td style="text-align: center; font-weight: bold; color: <?= htmlspecialchars($classData['color']) ?>;">
                            <?= number_format((float)($s['avg_marks'] ?? 0), 2) ?>%
                        </td>
                        <td style="text-align: center; font-weight: bold; color: <?= htmlspecialchars($classData['color']) ?>;">
                            <?= htmlspecialchars($classData['grade']) ?>
                        </td>
                        <td style="text-align: center;">
                            <?= $s['passed_modules'] ?>/<?= $s['total_modules'] ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </table>
        </div>
    <?php endforeach; ?>

    <?php if (!$students): ?><p>No students matched your filters.</p><?php endif; ?>

    <h2>Academic Staff</h2>
    <ul>
        <?php foreach ($academicStaff as $staff): ?>
            <li><?= htmlspecialchars(trim($staff['employee_position'] . ' ' . $staff['employee_fname'] . ' ' . strtoupper($staff['employee_lname']))) ?></li>
        <?php endforeach; ?>
    </ul>

    <h2>Academic Awards</h2>
    <ol>
        <?php foreach ($ACADEMIC_AWARDS as $award): ?>
            <li><?= htmlspecialchars($award) ?></li>
        <?php endforeach; ?>
    </ol>
</body>
</html>
<?php
exit;