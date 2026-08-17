<?php
/** Remove every ZZTEST fixture row, in FK-safe order. */
function sweepZzTest(\Core\Database $db): void
{
    $db->execute("DELETE FROM leave_requests WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'ZZTEST%')");
    $db->execute("DELETE FROM leave_requests WHERE leave_type_id IN (SELECT id FROM leave_types WHERE name LIKE 'ZZTEST%')");
    $db->execute("DELETE FROM leave_balances WHERE employee_id IN (SELECT employee_id FROM employees WHERE employee_username LIKE 'ZZTEST%')");
    $db->execute("DELETE FROM leave_types WHERE name LIKE 'ZZTEST%'");
    $db->execute("DELETE FROM employees WHERE employee_username LIKE 'ZZTEST%'");
    $db->execute("DELETE FROM system_logs WHERE user_email LIKE '%@zztest.invalid'");
    $db->execute("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'ZZTEST%')");
    $db->execute("DELETE FROM users WHERE username LIKE 'ZZTEST%'");
    $db->execute("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name LIKE 'ZZTEST%')");
    $db->execute("DELETE FROM roles WHERE name LIKE 'ZZTEST%'");
    // Notifications whose leave request is gone point nowhere — residue, whoever
    // received them.
    $db->execute(
        "DELETE n FROM notifications n
         LEFT JOIN leave_requests lr ON lr.id = n.entity_id
         WHERE n.entity_type = 'leave_request' AND lr.id IS NULL"
    );
}
