<?php
/**
 * HR All Staff API
 * GET /api/hr/staff/all
 * Fetch all employees from employees table
 */

use Core\Database;

$db = Database::getInstance();

try {
  // Get all employees - show all records
  $employees = $db->fetchAll(
    "SELECT
      employee_id,
      employee_fname,
      employee_lname,
      employee_position,
      employee_phone,
      employee_post,
      faculty,
      employee_status,
      account_status,
      salary
     FROM employees
     ORDER BY employee_fname ASC, employee_lname ASC"
  );

  http_response_code(200);
  echo json_encode([
    'data' => $employees,
    'total' => count($employees),
    'message' => 'All staff retrieved successfully'
  ]);
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode([
    'error' => 'Failed to fetch staff: ' . $e->getMessage()
  ]);
}
?>
