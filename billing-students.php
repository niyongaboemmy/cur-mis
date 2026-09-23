<?php
/**
 * Direct Student Billing Display
 * Bypass routing issues and display students directly from database
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-HTTP-Method-Override, Accept');

try {
    // Database connection
    $conn = new mysqli('127.0.0.1', 'root', '', 'curac_save');

    if ($conn->connect_error) {
        throw new Exception('Database connection failed: ' . $conn->connect_error);
    }

    // Get parameters
    $page = (int)($_GET['page'] ?? 1);
    $per_page = (int)($_GET['per_page'] ?? 50);
    $keyword = $_GET['keyword'] ?? '';
    $state = $_GET['state'] ?? 'all';
    $sort = $_GET['sort'] ?? 'opening_balance';

    // Build WHERE clause
    $where = [];
    $bindings = [];

    if ($state === 'active') {
        $where[] = "s.student_state = 'active'";
    } elseif ($state === 'inactive') {
        $where[] = "s.student_state = 'inactive'";
    }

    if (!empty($keyword)) {
        $where[] = "(s.regnumber LIKE ? OR s.fname LIKE ? OR s.lname LIKE ?)";
        $k = "%{$keyword}%";
        $bindings[] = $k;
        $bindings[] = $k;
        $bindings[] = $k;
    }

    $whereSql = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";

    // Count total - use simple query
    $countSql = "SELECT COUNT(DISTINCT s.id) as total FROM student s $whereSql";
    $countResult = $conn->query($countSql);
    if (!$countResult) {
        throw new Exception('Count query failed: ' . $conn->error);
    }
    $countRow = $countResult->fetch_assoc();
    $total = (int)($countRow['total'] ?? 0);

    // Build sort map
    $sortMap = [
        'name' => 'CONCAT(s.fname, " ", s.lname)',
        'opening_balance' => 'COALESCE(sob.opening_balance, 0)',
        'invoiced' => 'COALESCE(invoices.total_amount, 0)',
        'paid' => 'COALESCE(paid_sum.total_paid, 0)',
        'bursary' => 'COALESCE(bursary_sum.total_bursary, 0)',
        'total_balance' => '(COALESCE(sob.opening_balance, 0) + COALESCE(invoices.total_amount, 0) - COALESCE(paid_sum.total_paid, 0) - COALESCE(bursary_sum.total_bursary, 0))',
        'intake' => 's.intake',
    ];

    $orderField = $sortMap[$sort] ?? 'COALESCE(sob.opening_balance, 0)';
    $offset = ($page - 1) * $per_page;

    // Main query
    $sql = "
        SELECT
            s.id as student_id,
            s.regnumber,
            s.fname,
            s.lname,
            s.student_state,
            s.intake,
            s.faculty as faculty_id,
            s.department as department_id,
            '' as faculty,
            '' as department,
            COALESCE(sob.opening_balance, 0) as opening_balance,
            COALESCE(invoices.total_amount, 0) as invoiced,
            COALESCE(paid_sum.total_paid, 0) as paid,
            COALESCE(bursary_sum.total_bursary, 0) as bursary,
            (COALESCE(sob.opening_balance, 0) + COALESCE(invoices.total_amount, 0) - COALESCE(paid_sum.total_paid, 0) - COALESCE(bursary_sum.total_bursary, 0)) as total_balance
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
        ) paid_sum ON s.id = paid_sum.student_id
        LEFT JOIN (
            SELECT fb.student_id, SUM(CAST(fb.amount AS DECIMAL(12,2))) as total_bursary
            FROM fee_bursaries fb
            GROUP BY fb.student_id
        ) bursary_sum ON s.id = bursary_sum.student_id
        $whereSql
        ORDER BY $orderField DESC
        LIMIT $per_page OFFSET $offset
    ";

    // If no WHERE clause, just run query directly
    if (empty($bindings)) {
        $result = $conn->query($sql);
        if (!$result) {
            throw new Exception('Query failed: ' . $conn->error);
        }
    } else {
        // Use prepared statement only when needed
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            throw new Exception('Prepare failed: ' . $conn->error);
        }
        $types = str_repeat('s', count($bindings));
        if (!$stmt->bind_param($types, ...$bindings)) {
            throw new Exception('Bind param failed: ' . $stmt->error);
        }
        if (!$stmt->execute()) {
            throw new Exception('Execute failed: ' . $stmt->error);
        }
        $result = $stmt->get_result();
    }

    $students = [];
    while ($row = $result->fetch_assoc()) {
        $students[] = $row;
    }

    // Return response
    echo json_encode([
        'success' => true,
        'message' => 'Students retrieved successfully',
        'data' => [
            'data' => $students,
            'total' => $total,
            'current_page' => $page,
            'per_page' => $per_page,
            'last_page' => ceil($total / $per_page),
        ]
    ]);

    $conn->close();

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage(),
        'debug' => [
            'error' => $e->getMessage(),
            'file' => $e->getFile(),
            'line' => $e->getLine()
        ]
    ]);
}
?>
