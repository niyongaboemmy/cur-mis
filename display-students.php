<?php
/**
 * Direct Student Display - Complete Bypass
 * Shows students with opening balances, no auth required
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: *');

// Database connection
$conn = new mysqli('127.0.0.1', 'root', '', 'curac_save');

if ($conn->connect_error) {
    http_response_code(500);
    die(json_encode(['error' => 'DB Connection failed: ' . $conn->connect_error]));
}

// Get parameters
$page = max(1, (int)($_GET['page'] ?? 1));
$per_page = min(100, max(1, (int)($_GET['per_page'] ?? 50)));
$keyword = isset($_GET['keyword']) ? trim($_GET['keyword']) : '';
$state = isset($_GET['state']) ? trim($_GET['state']) : 'all';

// Build query
$where = [];
if ($state === 'active') {
    $where[] = "s.student_state = 'active'";
} elseif ($state === 'inactive') {
    $where[] = "s.student_state = 'inactive'";
}

if (!empty($keyword)) {
    $k = $conn->real_escape_string('%' . $keyword . '%');
    $where[] = "(s.regnumber LIKE '$k' OR s.fname LIKE '$k' OR s.lname LIKE '$k')";
}

$where_clause = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

// Count total
$count_sql = "SELECT COUNT(*) as total FROM student s $where_clause";
$count_result = $conn->query($count_sql);
$total = $count_result->fetch_assoc()['total'] ?? 0;

// Get students
$offset = ($page - 1) * $per_page;
$sql = "
    SELECT
        s.id as student_id,
        s.regnumber,
        s.fname,
        s.lname,
        s.student_state,
        s.intake,
        COALESCE(sob.opening_balance, 0) as opening_balance,
        COALESCE(invoices.total_amount, 0) as invoiced,
        COALESCE(paid.total_paid, 0) as paid,
        COALESCE(bursary.total_bursary, 0) as bursary,
        (COALESCE(sob.opening_balance, 0) + COALESCE(invoices.total_amount, 0) - COALESCE(paid.total_paid, 0) - COALESCE(bursary.total_bursary, 0)) as total_balance
    FROM student s
    LEFT JOIN student_opening_balance sob ON s.id = sob.student_id
    LEFT JOIN (
        SELECT fi.student_id, SUM(CAST(fi.amount_due AS DECIMAL(12,2))) as total_amount
        FROM fee_invoices fi
        WHERE fi.status NOT IN ('cancelled', 'waived')
        GROUP BY fi.student_id
    ) invoices ON s.id = invoices.student_id
    LEFT JOIN (
        SELECT fp.student_id, SUM(CAST(fp.amount AS DECIMAL(12,2))) as total_paid
        FROM fee_payments fp
        WHERE fp.status = 'completed'
        GROUP BY fp.student_id
    ) paid ON s.id = paid.student_id
    LEFT JOIN (
        SELECT fb.student_id, SUM(CAST(fb.amount AS DECIMAL(12,2))) as total_bursary
        FROM fee_bursaries fb
        GROUP BY fb.student_id
    ) bursary ON s.id = bursary.student_id
    $where_clause
    ORDER BY sob.opening_balance DESC
    LIMIT $per_page OFFSET $offset
";

$result = $conn->query($sql);
$students = [];

if ($result) {
    while ($row = $result->fetch_assoc()) {
        $students[] = $row;
    }
}

$conn->close();

echo json_encode([
    'success' => true,
    'message' => 'Students retrieved',
    'data' => [
        'data' => $students,
        'total' => $total,
        'current_page' => $page,
        'per_page' => $per_page,
        'last_page' => ceil($total / $per_page)
    ]
]);
?>
