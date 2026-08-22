<?php
/**
 * Optimized Student Billing Display
 * Retrieves student financial data with opening balances from curac_save database
 * Uses prepared statements for security
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

try {
    // Database connection
    $conn = new mysqli('127.0.0.1', 'root', '', 'curac_save');

    if ($conn->connect_error) {
        throw new Exception('DB Connection failed: ' . $conn->connect_error);
    }

    // Parameters with validation
    $page = max(1, (int)($_GET['page'] ?? 1));
    $per_page = min(100, max(1, (int)($_GET['per_page'] ?? 50)));
    $keyword = isset($_GET['keyword']) ? trim($_GET['keyword']) : '';
    $state = isset($_GET['state']) ? trim($_GET['state']) : 'all';
    $sort = isset($_GET['sort']) ? trim($_GET['sort']) : 'opening_balance';

    // Build WHERE clause with prepared statements
    $where_conditions = [];
    $bind_params = [];
    $bind_types = '';

    if ($state === 'active') {
        $where_conditions[] = "s.student_state = 'active'";
    } elseif ($state === 'inactive') {
        $where_conditions[] = "s.student_state = 'inactive'";
    }

    if (!empty($keyword)) {
        $where_conditions[] = "(s.regnumber LIKE ? OR s.fname LIKE ? OR s.lname LIKE ?)";
        $search_term = '%' . $keyword . '%';
        $bind_params = array_merge($bind_params, [$search_term, $search_term, $search_term]);
        $bind_types .= 'sss';
    }

    $where_clause = !empty($where_conditions) ? 'WHERE ' . implode(' AND ', $where_conditions) : '';

    // Count total students
    $count_sql = "SELECT COUNT(*) as total FROM student s $where_clause";
    if (!empty($bind_params)) {
        $count_stmt = $conn->prepare($count_sql);
        if (!$count_stmt) throw new Exception('Count prepare failed: ' . $conn->error);
        $count_stmt->bind_param($bind_types, ...$bind_params);
        $count_stmt->execute();
        $count_result = $count_stmt->get_result();
    } else {
        $count_result = $conn->query($count_sql);
        if (!$count_result) throw new Exception('Count query failed: ' . $conn->error);
    }

    $total = (int)($count_result->fetch_assoc()['total'] ?? 0);

    // Sort mapping with SQL injection protection
    $sort_map = [
        'opening_balance' => 'COALESCE(sob.opening_balance, 0) DESC',
        'invoiced' => 'COALESCE(invoices.total_amount, 0) DESC',
        'paid' => 'COALESCE(paid.total_paid, 0) DESC',
        'bursary' => 'COALESCE(bursary.total_bursary, 0) DESC',
        'total_balance' => 'total_balance DESC',
        'name' => 'CONCAT(s.fname, " ", s.lname) ASC',
        'regnumber' => 's.regnumber ASC'
    ];

    $order_by = $sort_map[$sort] ?? $sort_map['opening_balance'];

    // Main query
    $offset = ($page - 1) * $per_page;
    $sql = "
        SELECT
            s.id as student_id,
            s.regnumber,
            s.fname,
            s.lname,
            s.student_state,
            s.intake,
            s.email,
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
        ORDER BY $order_by
        LIMIT $per_page OFFSET $offset
    ";

    if (!empty($bind_params)) {
        $stmt = $conn->prepare($sql);
        if (!$stmt) throw new Exception('Query prepare failed: ' . $conn->error);
        $stmt->bind_param($bind_types, ...$bind_params);
        if (!$stmt->execute()) throw new Exception('Query execute failed: ' . $stmt->error);
        $result = $stmt->get_result();
    } else {
        $result = $conn->query($sql);
        if (!$result) throw new Exception('Query failed: ' . $conn->error);
    }

    $students = [];
    while ($row = $result->fetch_assoc()) {
        $row['opening_balance'] = (float)$row['opening_balance'];
        $row['invoiced'] = (float)$row['invoiced'];
        $row['paid'] = (float)$row['paid'];
        $row['bursary'] = (float)$row['bursary'];
        $row['total_balance'] = (float)$row['total_balance'];
        $students[] = $row;
    }

    $conn->close();

    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Students retrieved successfully',
        'data' => [
            'data' => $students,
            'total' => $total,
            'current_page' => $page,
            'per_page' => $per_page,
            'last_page' => (int)ceil($total / $per_page)
        ]
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error retrieving students',
        'error' => $e->getMessage()
    ]);
    exit;
}
?>
