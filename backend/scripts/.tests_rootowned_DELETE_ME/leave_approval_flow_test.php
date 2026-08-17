<?php

declare(strict_types=1);

/**
 * Integration test for the leave approval chain (App\Services\LeaveApprovalService).
 *
 * Drives the real service against the real database, then removes every row it
 * created. Fixtures are prefixed `ZZTEST_` so a crashed run is easy to spot and
 * clean by hand.
 *
 *   php scripts/tests/leave_approval_flow_test.php
 */

define('BASE_PATH', dirname(__DIR__, 2));
require BASE_PATH . '/vendor/autoload.php';
(Dotenv\Dotenv::createImmutable(BASE_PATH))->load();

// Keep the run offline: the service emails the requester on every status change,
// and `users.email` is UNIQUE so the fixtures can't share a blank address.
// Switching the driver off SMTP means PHPMailer never opens a socket — send()
// swallows the resulting failure, exactly as it does in production.
$_ENV['MAIL_DRIVER'] = 'log';

use Core\Database;
use App\Services\LeaveApprovalService;
use App\Constants\Permissions;
use App\Models\LeaveRequestModel;
use App\Models\LeaveApprovalStageModel;
use App\Models\NotificationModel;

$db      = Database::getInstance();
$service = new LeaveApprovalService();
$requests = new LeaveRequestModel();
$stages   = new LeaveApprovalStageModel();

$passed = 0;
$failed = [];

function ok(string $name): void
{
    global $passed;
    $passed++;
    echo "  \033[32m✓\033[0m {$name}\n";
}

function fail(string $name, string $detail): void
{
    global $failed;
    $failed[] = "{$name} — {$detail}";
    echo "  \033[31m✗\033[0m {$name}\n      {$detail}\n";
}

function check(string $name, bool $cond, string $detail = ''): void
{
    $cond ? ok($name) : fail($name, $detail ?: 'assertion failed');
}

function equals(string $name, mixed $expected, mixed $actual): void
{
    check($name, $expected === $actual, 'expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
}

/** Assert that $fn throws a RuntimeException whose message contains $needle. */
function throws(string $name, string $needle, callable $fn): void
{
    try {
        $fn();
        fail($name, 'expected a RuntimeException, none thrown');
    } catch (\RuntimeException $e) {
        if ($needle === '' || stripos($e->getMessage(), $needle) !== false) {
            ok($name);
        } else {
            fail($name, "message '{$e->getMessage()}' does not contain '{$needle}'");
        }
    }
}

// PHP notices point at real mistakes in a test (an undefined variable means an
// assertion is not testing what it reads as), so surface them rather than
// letting them scroll past.
set_error_handler(static function (int $no, string $msg, string $file, int $line): bool {
    if ($no & (E_WARNING | E_NOTICE | E_USER_WARNING)) {
        echo "\033[33m  ! PHP {$msg} at line {$line}\033[0m\n";
    }
    return false;
}, E_ALL);

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

$createdUsers = [];
$createdEmployees = [];
$createdTypes = [];
$createdRequests = [];
$createdRoles = [];

/**
 * Fixtures get their OWN roles. Reusing a real role would make
 * NotificationService's permission fan-out deliver test notifications to real
 * user accounts — the roles here hold nothing except what a test grants them.
 */
function mkRole(string $name): int
{
    global $db, $createdRoles;
    $slug = 'ZZTEST_role_' . $name . '_' . bin2hex(random_bytes(3));
    $db->execute("INSERT INTO roles (name, description) VALUES (?, 'leave_approval_flow_test.php fixture')", [$slug]);
    $id = (int) $db->lastInsertId();
    $createdRoles[] = $id;
    return $id;
}

/** Grant a permission slug to a fixture role. */
function grantToRole(int $roleId, string $slug): void
{
    global $db;
    $db->execute(
        "INSERT IGNORE INTO role_permissions (role_id, permission_id)
         SELECT ?, id FROM permissions WHERE slug = ?",
        [$roleId, $slug]
    );
}

function mkUser(string $name, int $roleId): int
{
    global $db, $createdUsers;
    // email is NOT NULL but must stay empty: an address here would make the
    // service try to send real SMTP mail during the test.
    $db->execute(
        "INSERT INTO users (username, password, full_name, email, role_id, is_active)
         VALUES (?, '-', ?, ?, ?, 1)",
        [$handle = 'ZZTEST_' . $name . '_' . bin2hex(random_bytes(3)), 'ZZTEST ' . $name, $handle . '@zztest.invalid', $roleId]
    );
    $id = (int) $db->lastInsertId();
    $createdUsers[] = $id;
    return $id;
}

function mkEmployee(int $userId, string $name): int
{
    global $db, $createdEmployees;
    // Nearly every column on this legacy table is NOT NULL with no default.
    $db->execute(
        "INSERT INTO employees
           (user_id, employee_fname, employee_lname, employee_gender, employee_age,
            employee_phone, employee_post, employee_position, additional_duty, faculty,
            employee_photo, employee_address, employee_status, employe_qr, employee_idcard,
            employee_bank, employee_account, employee_username, employee_password,
            employee_author, employee_reg_date, school_id)
         VALUES (?, 'ZZTEST', ?, 'F', '30', '0000000000', 'Testing', 'Tester', '', 0,
                 '', '', 'Active', '', '', '', '', ?, '-', 'test', CURDATE(), 0)",
        [$userId, $name, 'ZZTEST_' . $name . '_' . bin2hex(random_bytes(3))]
    );
    $id = (int) $db->lastInsertId();
    $createdEmployees[] = $id;
    return $id;
}

function mkLeaveType(string $name, int $daysAllowed): int
{
    global $db, $createdTypes;
    $db->execute(
        "INSERT INTO leave_types (name, description, days_allowed, is_paid, color, is_active)
         VALUES (?, 'created by leave_approval_flow_test.php', ?, 1, '#4FB4FF', 1)",
        ['ZZTEST ' . $name, $daysAllowed]
    );
    $id = (int) $db->lastInsertId();
    $createdTypes[] = $id;
    return $id;
}

$exit = 0;

try {

/** Actor shapes as they arrive from the JWT middleware. */
$requesterRole = mkRole('requester');
$reviewerRole  = mkRole('reviewer');   // granted APPROVE_LEAVE_L1 below
$finalRole     = mkRole('final');      // granted APPROVE_LEAVE_FINAL below
grantToRole($reviewerRole, Permissions::APPROVE_LEAVE_L1);
grantToRole($finalRole,    Permissions::APPROVE_LEAVE_FINAL);

$requesterUser = mkUser('requester', $requesterRole);
$requesterEmp  = mkEmployee($requesterUser, 'Requester');
$hodUser       = mkUser('hod', $reviewerRole);
$hrUser        = mkUser('hr',  $finalRole);

$requester = ['id' => $requesterUser, 'full_name' => 'ZZTEST requester', 'role' => 'lecturer'];
$hod       = ['id' => $hodUser,       'full_name' => 'ZZTEST hod',       'role' => 'HOD'];
$hr        = ['id' => $hrUser,        'full_name' => 'ZZTEST hr',        'role' => 'hr_manager'];

$permsHod = [Permissions::APPROVE_LEAVE_L1];
$permsHr  = [Permissions::APPROVE_LEAVE_FINAL];
$permsAll = LeaveApprovalService::STAGE_PERMISSIONS;

// A two-stage type (supervisor → HR) and a chain-less type for the fallback test.
$twoStageType = mkLeaveType('Two Stage', 20);
$service->replaceChain($twoStageType, [
    ['stage_key' => 'supervisor_review', 'stage_label' => 'Supervisor / HOD Review', 'required_permission_slug' => Permissions::APPROVE_LEAVE_L1,    'is_final_approval' => 0],
    ['stage_key' => 'hr_approval',       'stage_label' => 'HR Approval',             'required_permission_slug' => Permissions::APPROVE_LEAVE_FINAL, 'is_final_approval' => 1],
]);
$noChainType = mkLeaveType('No Chain', 10);
$stages->deleteByLeaveType($noChainType);

/** Track everything we create so teardown can remove it. */
$submit = function (array $overrides = []) use ($service, $requester, $requesterUser, $twoStageType, &$createdRequests): array {
    $row = $service->submit(
        $overrides['owner_column'] ?? 'user_id',
        $overrides['owner_id']     ?? $requesterUser,
        $overrides['leave_type_id'] ?? $twoStageType,
        $overrides['start']        ?? '2030-03-04',
        $overrides['end']          ?? '2030-03-08',
        $overrides['reason']       ?? 'ZZTEST reason',
        $overrides['actor']        ?? $requester
    );
    $createdRequests[] = (int) $row['id'];
    return $row;
};

/** Notifications delivered to one user about one leave request. */
$notifs = function (int $userId, ?int $requestId = null, ?string $type = null) use ($db): array {
    $sql = "SELECT * FROM notifications WHERE user_id = ?";
    $b   = [$userId];
    if ($requestId !== null) { $sql .= " AND entity_type = 'leave_request' AND entity_id = ?"; $b[] = $requestId; }
    if ($type !== null)      { $sql .= " AND type = ?"; $b[] = $type; }
    return $db->fetchAll($sql . " ORDER BY id ASC", $b);
};

$usedDays = function (int $empId, int $typeId, int $year) use ($db): float {
    $row = $db->fetchOne(
        "SELECT used_days FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?",
        [$empId, $typeId, $year]
    );
    return $row ? (float) $row['used_days'] : 0.0;
};

// ─────────────────────────────────────────────────────────────────────────────
echo "\nChain resolution\n";
// ─────────────────────────────────────────────────────────────────────────────

$chain = $service->chainFor($twoStageType);
equals('chainFor returns the configured stages in order', 2, count($chain));
equals('stage 1 is the supervisor stage', 'supervisor_review', $chain[0]['stage_key']);
equals('stage 2 is flagged final', 1, (int) $chain[1]['is_final_approval']);

$fallback = $service->chainFor($noChainType);
equals('a type with no chain falls back to one implicit stage', 1, count($fallback));
equals('the fallback stage is gated on MANAGE_LEAVE_REQUESTS', Permissions::MANAGE_LEAVE_REQUESTS, $fallback[0]['required_permission_slug']);
equals('the fallback stage is final', 1, (int) $fallback[0]['is_final_approval']);

throws('a chain with no final stage is rejected', 'exactly one stage', fn() => $service->replaceChain($twoStageType, [
    ['stage_key' => 'a', 'stage_label' => 'A', 'required_permission_slug' => Permissions::APPROVE_LEAVE_L1, 'is_final_approval' => 0],
]));
throws('a chain whose final stage is not last is rejected', 'last stage', fn() => $service->replaceChain($twoStageType, [
    ['stage_key' => 'a', 'stage_label' => 'A', 'required_permission_slug' => Permissions::APPROVE_LEAVE_L1,    'is_final_approval' => 1],
    ['stage_key' => 'b', 'stage_label' => 'B', 'required_permission_slug' => Permissions::APPROVE_LEAVE_FINAL, 'is_final_approval' => 0],
]));
throws('duplicate stage keys are rejected', 'unique', fn() => $service->replaceChain($twoStageType, [
    ['stage_key' => 'a', 'stage_label' => 'A', 'required_permission_slug' => Permissions::APPROVE_LEAVE_L1,    'is_final_approval' => 0],
    ['stage_key' => 'a', 'stage_label' => 'A2', 'required_permission_slug' => Permissions::APPROVE_LEAVE_FINAL, 'is_final_approval' => 1],
]));
throws('an unknown permission slug is rejected', 'Unknown permission', fn() => $service->replaceChain($twoStageType, [
    ['stage_key' => 'a', 'stage_label' => 'A', 'required_permission_slug' => 'NOT_A_REAL_PERM', 'is_final_approval' => 1],
]));
equals('a rejected chain edit leaves the stored chain intact', 2, count($service->chainFor($twoStageType)));

// ─────────────────────────────────────────────────────────────────────────────
echo "\nSubmission\n";
// ─────────────────────────────────────────────────────────────────────────────

$r1 = $submit();
equals('a new request is Pending', 'Pending', $r1['status']);
equals('a new request enters at stage 1', 1, (int) $r1['current_stage_order']);
equals('the current stage label is resolved', 'Supervisor / HOD Review', $r1['current_stage_label']);
equals('Mon–Fri days are counted, weekends skipped', '5.0', (string) $r1['days_requested']);
equals('the audit trail opens with a submission row', 'submitted', $service->history((int) $r1['id'])[0]['decision']);
check('a self-service request resolves the requester\'s employee record', (int) $r1['employee_id'] === $requesterEmp, 'employee_id=' . var_export($r1['employee_id'], true));

throws('an overlapping request is refused', 'overlapping', fn() => $submit(['start' => '2030-03-06', 'end' => '2030-03-12']));
throws('an end date before the start date is refused', 'working day', fn() => $submit(['start' => '2030-04-10', 'end' => '2030-04-01']));
throws('a weekend-only range is refused', 'working day', fn() => $submit(['start' => '2030-04-06', 'end' => '2030-04-07']));
throws('an unknown leave type is refused', 'Leave type not found', fn() => $submit(['leave_type_id' => 99999999, 'start' => '2030-05-06', 'end' => '2030-05-07']));

// ─────────────────────────────────────────────────────────────────────────────
echo "\nStage decisions\n";
// ─────────────────────────────────────────────────────────────────────────────

$id1 = (int) $r1['id'];

throws('nobody decides their own leave', 'your own', fn() => $service->decide($id1, 'approved', $permsAll, $requester, null));
throws('an actor without the stage-1 permission is refused', 'do not hold', fn() => $service->decide($id1, 'approved', $permsHr, $hr, null));
throws('an invalid decision verb is refused', 'Invalid decision', fn() => $service->decide($id1, 'maybe', $permsAll, $hod, null));
throws('a rejection without a reason is refused', 'reason is required', fn() => $service->decide($id1, 'rejected', $permsHod, $hod, '  '));

$before = $usedDays($requesterEmp, $twoStageType, 2030);
$after1 = $service->decide($id1, 'approved', $permsHod, $hod, 'Cover arranged.');
equals('a non-final approval keeps the request Pending', 'Pending', $after1['status']);
equals('a non-final approval advances the chain pointer', 2, (int) $after1['current_stage_order']);
equals('the next stage label is resolved', 'HR Approval', $after1['current_stage_label']);
equals('a non-final approval does not touch the balance', $before, $usedDays($requesterEmp, $twoStageType, 2030));
equals('the stage-1 decision is on the audit trail', 'approved', $service->history($id1)[1]['decision']);
equals('the audit trail records who decided', 'ZZTEST hod', $service->history($id1)[1]['actor_name']);
equals('the audit trail records the stage decided', 'supervisor_review', $service->history($id1)[1]['stage_key']);

throws('the stage-1 approver cannot also decide stage 2', 'do not hold', fn() => $service->decide($id1, 'approved', $permsHod, $hod, null));

$after2 = $service->decide($id1, 'approved', $permsHr, $hr, 'Granted.');
equals('the final approval grants the leave', 'Approved', $after2['status']);
equals('the final approval debits the balance', $before + 5.0, $usedDays($requesterEmp, $twoStageType, 2030));
equals('the balance is billed to the year the leave falls in', 5.0, $usedDays($requesterEmp, $twoStageType, 2030));
equals('nothing is billed to the year the decision was taken in', 0.0, $usedDays($requesterEmp, $twoStageType, (int) date('Y')));
equals('the audit trail holds all three events', 3, count($service->history($id1)));
throws('an already-decided request cannot be decided again', 'not awaiting review', fn() => $service->decide($id1, 'approved', $permsHr, $hr, null));

// ─────────────────────────────────────────────────────────────────────────────
echo "\nRejection\n";
// ─────────────────────────────────────────────────────────────────────────────

$r2  = $submit(['start' => '2030-06-03', 'end' => '2030-06-04']);
$id2 = (int) $r2['id'];
$rejected = $service->decide($id2, 'rejected', $permsHod, $hod, 'Peak teaching week.');
equals('a rejection at stage 1 terminates the request', 'Rejected', $rejected['status']);
equals('a rejection leaves the pointer on the deciding stage', 1, (int) $rejected['current_stage_order']);
equals('the rejection reason is stored on the request', 'Peak teaching week.', $rejected['review_comment']);
equals('a rejected request never reaches HR', 2, count($service->history($id2)));
equals('a rejected request debits nothing', 0.0, $usedDays($requesterEmp, $twoStageType, 2030) - 5.0);
throws('a rejected request cannot be cancelled', 'no longer be cancelled', fn() => $service->cancel($id2, null, $hr));

// ─────────────────────────────────────────────────────────────────────────────
echo "\nChanges requested → resubmit\n";
// ─────────────────────────────────────────────────────────────────────────────

$r3  = $submit(['start' => '2030-07-01', 'end' => '2030-07-02']);
$id3 = (int) $r3['id'];
throws('asking for changes without saying what is refused', 'needs to change', fn() => $service->decide($id3, 'changes_requested', $permsHod, $hod, ''));

$sentBack = $service->decide($id3, 'changes_requested', $permsHod, $hod, 'Attach the conference invitation.');
equals('changes requested moves the request out of review', 'ChangesRequested', $sentBack['status']);
equals('changes requested holds the pointer at the flagging stage', 1, (int) $sentBack['current_stage_order']);
throws('a request awaiting changes cannot be decided', 'not awaiting review', fn() => $service->decide($id3, 'approved', $permsHod, $hod, null));

$resubmitted = $service->resubmit($id3, $requesterUser, ['start_date' => '2030-07-01', 'end_date' => '2030-07-03', 'reason' => 'Invitation attached.'], $requester);
equals('a resubmission re-enters review', 'Pending', $resubmitted['status']);
equals('a resubmission re-enters at the SAME stage that flagged it', 1, (int) $resubmitted['current_stage_order']);
equals('a resubmission recalculates the working days', '3.0', (string) $resubmitted['days_requested']);
equals('a resubmission clears the stale reviewer comment', null, $resubmitted['review_comment']);
equals('the resubmission is on the audit trail', 'resubmitted', $service->history($id3)[2]['decision']);
throws('only the owner may resubmit', 'not found', fn() => $service->resubmit($id3, $hodUser, [], $hod));
throws('a request already under review cannot be resubmitted', 'changes requested can be resubmitted', fn() => $service->resubmit($id3, $requesterUser, [], $requester));

// ─────────────────────────────────────────────────────────────────────────────
echo "\nCancellation\n";
// ─────────────────────────────────────────────────────────────────────────────

throws('a staff member cannot cancel someone else\'s request', 'not found', fn() => $service->cancel($id3, $hodUser, $hod));
$selfCancelled = $service->cancel($id3, $requesterUser, $requester);
equals('the requester may cancel while still under review', 'Cancelled', $selfCancelled['status']);
throws('a cancelled request cannot be cancelled twice', 'still under review', fn() => $service->cancel($id3, $requesterUser, $requester));
$trail3 = $service->history($id3);
equals('the cancellation is on the audit trail', 'cancelled', end($trail3)['decision'] ?? null);

// Administrative cancel of an already-granted leave credits the balance back.
$grantedUsed = $usedDays($requesterEmp, $twoStageType, 2030);
$adminCancelled = $service->cancel($id1, null, $hr, 'Trip called off.');
equals('an administrator may cancel a granted leave', 'Cancelled', $adminCancelled['status']);
equals('cancelling a granted leave credits the days back', $grantedUsed - 5.0, $usedDays($requesterEmp, $twoStageType, 2030));

$r4  = $submit(['start' => '2030-08-05', 'end' => '2030-08-06']);
$id4 = (int) $r4['id'];
$service->decide($id4, 'changes_requested', $permsHod, $hod, 'Clarify the dates.');
throws('the requester cannot cancel once the leave is granted', 'still under review', function () use ($service, $requesterUser, $requester, $permsHod, $permsHr, $hod, $hr, $id4) {
    $service->resubmit($id4, $requesterUser, [], $requester);
    $service->decide($id4, 'approved', $permsHod, $hod, null);
    $service->decide($id4, 'approved', $permsHr, $hr, null);
    $service->cancel($id4, $requesterUser, $requester);
});

// ─────────────────────────────────────────────────────────────────────────────
echo "\nApproval queue\n";
// ─────────────────────────────────────────────────────────────────────────────

$r5  = $submit(['start' => '2030-09-02', 'end' => '2030-09-03']);
$id5 = (int) $r5['id'];

$hodQueue = array_column($service->queueForActor($permsHod, false), 'id');
check('a stage-1 request appears in the stage-1 approver\'s queue', in_array($id5, array_map('intval', $hodQueue), true), 'queue=' . json_encode($hodQueue));

$hrQueue = array_map('intval', array_column($service->queueForActor($permsHr, false), 'id'));
check('a stage-1 request is absent from the final approver\'s queue', !in_array($id5, $hrQueue, true), 'queue=' . json_encode($hrQueue));

$service->decide($id5, 'approved', $permsHod, $hod, null);
$hodQueue2 = array_map('intval', array_column($service->queueForActor($permsHod, false), 'id'));
$hrQueue2  = array_map('intval', array_column($service->queueForActor($permsHr,  false), 'id'));
check('once advanced, the request leaves the stage-1 queue', !in_array($id5, $hodQueue2, true), 'queue=' . json_encode($hodQueue2));
check('once advanced, the request enters the final approver\'s queue', in_array($id5, $hrQueue2, true), 'queue=' . json_encode($hrQueue2));

equals('an actor holding no leave permission gets an empty queue', [], $service->queueForActor(['VIEW_STUDENTS'], false));

$superQueue = array_map('intval', array_column($service->queueForActor([], true), 'id'));
check('a superadmin sees every stage', in_array($id5, $superQueue, true), 'queue=' . json_encode($superQueue));

// A chain-less type is only reachable by the MANAGE_LEAVE_REQUESTS fallback.
$r6  = $submit(['leave_type_id' => $noChainType, 'start' => '2030-10-07', 'end' => '2030-10-08']);
$id6 = (int) $r6['id'];
$mgrQueue = array_map('intval', array_column($service->queueForActor([Permissions::MANAGE_LEAVE_REQUESTS], false), 'id'));
check('a chain-less request surfaces for MANAGE_LEAVE_REQUESTS', in_array($id6, $mgrQueue, true), 'queue=' . json_encode($mgrQueue));
$hodQueue3 = array_map('intval', array_column($service->queueForActor($permsHod, false), 'id'));
check('a chain-less request does not leak into a stage queue', !in_array($id6, $hodQueue3, true), 'queue=' . json_encode($hodQueue3));

$granted6 = $service->decide($id6, 'approved', [Permissions::MANAGE_LEAVE_REQUESTS], $hr, null);
equals('the implicit single stage is final — one approval grants it', 'Approved', $granted6['status']);

$queueRow = null;
foreach ($service->queueForActor($permsHr, false) as $row) {
    if ((int) $row['id'] === $id5) { $queueRow = $row; }
}
check('queue rows carry the labels the UI needs', $queueRow !== null
    && ($queueRow['current_stage_label'] ?? null) === 'HR Approval'
    && (int) ($queueRow['current_stage_is_final'] ?? 0) === 1
    && ($queueRow['leave_type_name'] ?? null) !== null
    && ($queueRow['employee_name'] ?? null) !== null,
    'row=' . json_encode($queueRow));

// ─────────────────────────────────────────────────────────────────────────────
echo "\nProgress view\n";
// ─────────────────────────────────────────────────────────────────────────────

$p5 = $service->progress($id5);
equals('progress has submission + 2 stages + granted', 4, (int) $p5['total_steps']);
equals('the cleared stage shows completed', 'completed', $p5['steps'][1]['state']);
equals('the awaiting stage shows current', 'current', $p5['steps'][2]['state']);
equals('the outcome step is still pending', 'pending', $p5['steps'][3]['state']);
equals('current_step points at the awaiting stage', 3, (int) $p5['current_step']);
check('progress carries the audit trail', is_array($p5['history']) && count($p5['history']) >= 2, 'history=' . json_encode($p5['history']));
check('progress never exposes permission slugs', !str_contains(json_encode($p5['steps']), 'APPROVE_LEAVE'), json_encode($p5['steps']));

$pRejected = $service->progress($id2);
equals('a rejected request marks the deciding stage rejected', 'rejected', $pRejected['steps'][1]['state']);
equals('a rejected request marks later stages skipped', 'skipped', $pRejected['steps'][2]['state']);

$pGranted = $service->progress($id4);
equals('a granted request marks every stage completed', 'completed', $pGranted['steps'][1]['state']);
equals('a granted request completes the outcome step', 'completed', $pGranted['steps'][3]['state']);

equals('progress for a missing request is null', null, $service->progress(999999999));

// ─────────────────────────────────────────────────────────────────────────────
echo "\nThe institution's approval flow (VC → HR → DAF → VC final)\n";
// ─────────────────────────────────────────────────────────────────────────────

// Every real leave type is seeded with the institutional chain by migration 134;
// assert against a real type rather than a fixture so a drift between the
// migration and LeaveController::DEFAULT_CHAIN is caught here.
$realTypeId    = (int) $db->fetchOne("SELECT id FROM leave_types WHERE name NOT LIKE 'ZZTEST%' ORDER BY id LIMIT 1")['id'];
$seededChain   = $service->chainFor($realTypeId);
$expectedChain = \App\Controllers\LeaveController::DEFAULT_CHAIN;

equals('a real leave type has four approval stages', 4, count($seededChain));
equals('the seeded chain matches DEFAULT_CHAIN stage for stage',
    array_map(static fn(array $c): array => [
        $c['stage_key'], $c['stage_label'], $c['required_permission_slug'], (int) $c['is_final_approval'],
    ], $expectedChain),
    array_map(static fn(array $c): array => [
        $c['stage_key'], $c['stage_label'], $c['required_permission_slug'], (int) $c['is_final_approval'],
    ], $seededChain));

equals('stage 1 is the Vice Chancellor',        'Vice Chancellor', $seededChain[0]['stage_label']);
equals('stage 2 is HR\'s recommendation',       'HR — Recommendation', $seededChain[1]['stage_label']);
equals('stage 3 is the DAF',                    'DAF — Director of Administration & Finance', $seededChain[2]['stage_label']);
equals('stage 4 is the VC final authorization', 'Vice Chancellor — Final Authorization', $seededChain[3]['stage_label']);
equals('only the final authorization grants the leave', [0, 0, 0, 1],
    array_map(static fn(array $c): int => (int) $c['is_final_approval'], $seededChain));
equals('the VC signs the first and last stage under different slugs',
    [Permissions::APPROVE_LEAVE_VC, Permissions::APPROVE_LEAVE_FINAL],
    [$seededChain[0]['required_permission_slug'], $seededChain[3]['required_permission_slug']]);

// Walk a request through all four signatures, each by a different office.
$instRole = mkRole('institution');
foreach ([Permissions::APPROVE_LEAVE_VC, Permissions::APPROVE_LEAVE_HR,
          Permissions::APPROVE_LEAVE_DAF, Permissions::APPROVE_LEAVE_FINAL] as $slug) {
    grantToRole($instRole, $slug);
}
$vcUser  = mkUser('vc',  $instRole);
$hrUser2 = mkUser('hr2', $instRole);
$dafUser = mkUser('daf', $instRole);
$vc      = ['id' => $vcUser,  'full_name' => 'ZZTEST vc',  'role' => 'VC'];
$hrRec   = ['id' => $hrUser2, 'full_name' => 'ZZTEST hr2', 'role' => 'HR'];
$daf     = ['id' => $dafUser, 'full_name' => 'ZZTEST daf', 'role' => 'DAF'];

$ri  = $submit(['leave_type_id' => $realTypeId, 'start' => '2031-05-05', 'end' => '2031-05-06']);
$idi = (int) $ri['id'];

equals('the request enters at the Vice Chancellor', 'Vice Chancellor', $ri['current_stage_label']);
equals('the request reports four stages', 4, (int) $ri['total_stages']);

throws('HR cannot sign before the Vice Chancellor has', 'do not hold',
    fn() => $service->decide($idi, 'approved', [Permissions::APPROVE_LEAVE_HR], $hrRec, null));
throws('the DAF cannot sign before HR has', 'do not hold',
    fn() => $service->decide($idi, 'approved', [Permissions::APPROVE_LEAVE_DAF], $daf, null));
throws('the final authorization cannot be given first', 'do not hold',
    fn() => $service->decide($idi, 'approved', [Permissions::APPROVE_LEAVE_FINAL], $vc, null));

$afterVc = $service->decide($idi, 'approved', [Permissions::APPROVE_LEAVE_VC], $vc, 'Noted.');
equals('after the VC it moves to HR', 'HR — Recommendation', $afterVc['current_stage_label']);
equals('the VC signature does not grant the leave', 'Pending', $afterVc['status']);

$afterHr = $service->decide($idi, 'approved', [Permissions::APPROVE_LEAVE_HR], $hrRec, 'Recommended.');
equals('after HR it moves to the DAF', 'DAF — Director of Administration & Finance', $afterHr['current_stage_label']);
equals('HR only recommends — it cannot grant', 'Pending', $afterHr['status']);

$beforeGrant = $usedDays($requesterEmp, $realTypeId, 2031);
$afterDaf = $service->decide($idi, 'approved', [Permissions::APPROVE_LEAVE_DAF], $daf, 'Funds available.');
equals('after the DAF it returns to the VC', 'Vice Chancellor — Final Authorization', $afterDaf['current_stage_label']);
equals('nothing is debited before the final authorization', $beforeGrant,
    $usedDays($requesterEmp, $realTypeId, 2031));

$granted = $service->decide($idi, 'approved', [Permissions::APPROVE_LEAVE_FINAL], $vc, 'Authorised.');
equals('the VC final authorization grants the leave', 'Approved', $granted['status']);
equals('only the final authorization debits the balance', $beforeGrant + 2.0,
    $usedDays($requesterEmp, $realTypeId, 2031));

// The signature block: five steps, each naming who signed and in what capacity.
$instSteps = $service->progress($idi)['steps'];
equals('the flow renders six steps (prepared + 4 signatures + outcome)', 6, count($instSteps));
equals('step 1 is the responsible officer\'s preparation',
    'Prepared by (Responsible Officer)', $instSteps[0]['label']);
equals('every signature step is recorded as completed', ['completed', 'completed', 'completed', 'completed'],
    array_map(static fn(array $st): string => $st['state'], array_slice($instSteps, 1, 4)));
equals('each signature names the office that gave it', ['VC', 'HR', 'DAF', 'VC'],
    array_map(static fn(array $st): ?string => $st['actor_role'], array_slice($instSteps, 1, 4)));
equals('each signature names the signatory',
    ['ZZTEST vc', 'ZZTEST hr2', 'ZZTEST daf', 'ZZTEST vc'],
    array_map(static fn(array $st): ?string => $st['actor'], array_slice($instSteps, 1, 4)));
check('each signature records when it was given',
    count(array_filter(array_slice($instSteps, 1, 4), static fn(array $st): bool => !empty($st['decided_at']))) === 4,
    json_encode(array_column($instSteps, 'decided_at')));
equals('the VC\'s two signatures are both attributed to them', 2,
    count(array_filter(array_slice($instSteps, 1, 4), static fn(array $st): bool => $st['actor_role'] === 'VC')));

// The progress payload also drives the header and the progress bar, so it must
// carry the request's own identity and a signature count distinct from the step
// count (the submission and the outcome are steps, not signatures).
$instProgress = $service->progress($idi);
equals('progress reports the leave type', 'Annual Leave', $instProgress['leave_type_name']);
check('progress reports the requester', !empty($instProgress['employee_name']), var_export($instProgress['employee_name'], true));
check('progress reports the dates', !empty($instProgress['start_date']) && !empty($instProgress['end_date']),
    json_encode([$instProgress['start_date'] ?? null, $instProgress['end_date'] ?? null]));
equals('progress counts four signatures in total', 4, $instProgress['signatures_total']);
equals('all four are signed once granted', 4, $instProgress['signatures_done']);
equals('signatures exclude the submission and the outcome',
    $instProgress['total_steps'] - 2, $instProgress['signatures_total']);

// A rejection anywhere in the chain stops it there.
$rj  = $submit(['leave_type_id' => $realTypeId, 'start' => '2031-06-02', 'end' => '2031-06-03']);
$idj = (int) $rj['id'];
$service->decide($idj, 'approved', [Permissions::APPROVE_LEAVE_VC], $vc, null);
$rejectedAtHr = $service->decide($idj, 'rejected', [Permissions::APPROVE_LEAVE_HR], $hrRec, 'Not recommended.');
equals('a rejection at HR ends the request', 'Rejected', $rejectedAtHr['status']);
$rjProgress = $service->progress($idj);
equals('a partly-signed request counts only what is signed', 1, $rjProgress['signatures_done']);
equals('a rejected request still reports the full chain length', 4, $rjProgress['signatures_total']);
$rjSteps = $rjProgress['steps'];
equals('the rejecting stage is marked rejected', 'rejected', $rjSteps[2]['state']);
equals('the DAF stage is never reached', 'skipped', $rjSteps[3]['state']);
equals('the final authorization is never reached', 'skipped', $rjSteps[4]['state']);

// ─────────────────────────────────────────────────────────────────────────────
echo "\nSLA / stage ageing\n";
// ─────────────────────────────────────────────────────────────────────────────

// A 1-hour SLA on stage 1 so a backdated arrival is unambiguously late.
$slaType = mkLeaveType('Sla', 15);
$service->replaceChain($slaType, [
    ['stage_key' => 'quick_review', 'stage_label' => 'Quick Review', 'required_permission_slug' => Permissions::APPROVE_LEAVE_L1,    'is_final_approval' => 0, 'sla_hours' => 1],
    ['stage_key' => 'final_ok',     'stage_label' => 'Final OK',     'required_permission_slug' => Permissions::APPROVE_LEAVE_FINAL, 'is_final_approval' => 1, 'sla_hours' => null],
]);

$rs  = $submit(['leave_type_id' => $slaType, 'start' => '2031-03-03', 'end' => '2031-03-04']);
$ids = (int) $rs['id'];

equals('a fresh request is not overdue', 0, (int) $rs['is_overdue']);
equals('a fresh request reports zero hours at its stage', 0, (int) $rs['hours_at_stage']);
equals('the current stage exposes its SLA', 1, (int) $rs['current_stage_sla_hours']);
check('the row reports when it reached this stage', !empty($rs['stage_entered_at']), var_export($rs['stage_entered_at'] ?? null, true));

// Age it by backdating the audit trail — the ageing clock reads from there.
$db->execute(
    "UPDATE leave_request_approvals SET decided_at = DATE_SUB(NOW(), INTERVAL 5 HOUR) WHERE leave_request_id = ?",
    [$ids]
);
$aged = $requests->findDetailed($ids);
equals('a request past its stage SLA is flagged overdue', 1, (int) $aged['is_overdue']);
equals('hours at stage are counted from the last decision', 5, (int) $aged['hours_at_stage']);

$agedQueue = $service->queueForActor($permsHod, false);
$firstOverdue = null;
foreach ($agedQueue as $qRow) { if ((int) $qRow['id'] === $ids) { $firstOverdue = $qRow; break; } }
check('an overdue request appears in the queue', $firstOverdue !== null, 'not in queue');
equals('the queue leads with the overdue request', $ids, (int) ($agedQueue[0]['id'] ?? 0));

$slaSteps = $service->progress($ids)['steps'];
equals('the awaiting step reports its SLA', 1, (int) $slaSteps[1]['sla_hours']);
equals('the awaiting step reports how long it has waited', 5, (int) $slaSteps[1]['hours_waiting']);
equals('the awaiting step is marked overdue', true, $slaSteps[1]['is_overdue']);
equals('a stage with no SLA reports none', null, $slaSteps[2]['sla_hours']);
equals('a step not yet reached has no running clock', null, $slaSteps[2]['hours_waiting']);
check('a cleared step records when it cleared', !empty($slaSteps[0]['decided_at']), json_encode($slaSteps[0]));

// Clearing the stage restarts the clock at the next one.
$service->decide($ids, 'approved', $permsHod, $hod, null);
$moved = $requests->findDetailed($ids);
equals('advancing clears the overdue flag', 0, (int) $moved['is_overdue']);
equals('advancing restarts the stage clock', 0, (int) $moved['hours_at_stage']);
equals('a stage with no SLA is never overdue', null, $moved['current_stage_sla_hours']);

$service->decide($ids, 'approved', $permsHr, $hr, null);
equals('a settled request is never overdue', 0, (int) $requests->findDetailed($ids)['is_overdue']);

// ─────────────────────────────────────────────────────────────────────────────
echo "\nRequests filed on an employee's behalf\n";
// ─────────────────────────────────────────────────────────────────────────────

// employee_id, no user_id — the shape HR's submit-on-behalf endpoint creates.
$onBehalf = $submit([
    'owner_column' => 'employee_id',
    'owner_id'     => $requesterEmp,
    'start'        => '2031-04-07',
    'end'          => '2031-04-08',
    'actor'        => $hr,
]);
$idb = (int) $onBehalf['id'];

equals('an HR-filed request has no user_id', null, $onBehalf['user_id']);
check('an HR-filed request still resolves an email address',
    !empty($onBehalf['requester_email']), var_export($onBehalf['requester_email'] ?? null, true));
// The employee's login is reached through employees.user_id, so the in-system
// channel must not silently skip what the email channel delivers.
equals('the employee is notified in-system too, via employees.user_id', 1,
    count($notifs($requesterUser, $idb, 'LEAVE_SUBMITTED')));

throws('the employee cannot decide a request filed for them', 'your own',
    fn() => $service->decide($idb, 'approved', $permsAll, $requester, null));

$beforeOnBehalf = $usedDays($requesterEmp, $twoStageType, 2031);
$service->decide($idb, 'approved', $permsHod, $hod, null);
equals('a non-final approval on an HR-filed request debits nothing', $beforeOnBehalf,
    $usedDays($requesterEmp, $twoStageType, 2031));

$service->decide($idb, 'approved', $permsHr, $hr, 'Granted.');
equals('an HR-filed request is notified through to the grant', 1,
    count($notifs($requesterUser, $idb, 'LEAVE_APPROVED')));
equals('an HR-filed grant debits the employee balance', $beforeOnBehalf + 2.0,
    $usedDays($requesterEmp, $twoStageType, 2031));

// ─────────────────────────────────────────────────────────────────────────────
echo "\nNotifications — requester\n";
// ─────────────────────────────────────────────────────────────────────────────

$r7  = $submit(['start' => '2030-11-04', 'end' => '2030-11-05']);
$id7 = (int) $r7['id'];

$own = $notifs($requesterUser, $id7);
equals('submitting notifies the requester in-system', 1, count($own));
equals('the submission notification names the request', 'LEAVE_SUBMITTED', $own[0]['type']);
check('the submission notification says who has it now',
    str_contains($own[0]['message'], 'Supervisor / HOD Review'), $own[0]['message']);
equals('the submission notification deep-links to My Leave', '/me/leave', $own[0]['link']);
equals('the submission notification starts unread', 0, (int) $own[0]['is_read']);

$service->decide($id7, 'approved', $permsHod, $hod, 'Fine by me.');
$own = $notifs($requesterUser, $id7);
equals('clearing a stage notifies the requester again', 2, count($own));
equals('the advance notification is typed as a stage approval', 'LEAVE_STAGEAPPROVED', $own[1]['type']);
check('the advance notification names the next stage',
    str_contains($own[1]['message'], 'HR Approval'), $own[1]['message']);

$service->decide($id7, 'changes_requested', $permsHr, $hr, 'Attach the invitation.');
$own = $notifs($requesterUser, $id7);
equals('a changes-requested decision notifies the requester', 3, count($own));
equals('changes requested is flagged as needing attention', 'warning', $own[2]['severity']);
check('the reviewer note is carried into the notification',
    str_contains($own[2]['message'], 'Attach the invitation.'), $own[2]['message']);

$service->resubmit($id7, $requesterUser, [], $requester);
$service->decide($id7, 'approved', $permsHr, $hr, null);
$own = $notifs($requesterUser, $id7);
equals('the grant notification is a success', 'success', end($own)['severity']);
equals('the grant notification is typed as approved', 'LEAVE_APPROVED', end($own)['type']);

// ─────────────────────────────────────────────────────────────────────────────
echo "\nNotifications — reviewers\n";
// ─────────────────────────────────────────────────────────────────────────────

// $hodUser's fixture role holds APPROVE_LEAVE_L1 and nothing else, so anything
// delivered here came from the chain's own permission fan-out.
$r8  = $submit(['start' => '2030-12-02', 'end' => '2030-12-03']);
$id8 = (int) $r8['id'];

$hodInbox = $notifs($hodUser, $id8, 'LEAVE_AWAITING_DECISION');
check('a stage-1 approver is told a request needs them', count($hodInbox) === 1, 'count=' . count($hodInbox));
if ($hodInbox) {
    check('the approver notification names the requester and stage',
        str_contains($hodInbox[0]['message'], 'ZZTEST') && str_contains($hodInbox[0]['message'], 'Supervisor / HOD Review'),
        $hodInbox[0]['message']);
    equals('the approver notification links to the approval queue', '/hr/leave/approvals', $hodInbox[0]['link']);
    equals('the approver notification is a call to action', 'warning', $hodInbox[0]['severity']);
}

equals('the requester is never asked to approve their own request', 0,
    count($notifs($requesterUser, $id8, 'LEAVE_AWAITING_DECISION')));

equals('the final approver is not asked to decide stage 1', 0,
    count($notifs($hrUser, $id8, 'LEAVE_AWAITING_DECISION')));

$service->decide($id8, 'approved', $permsHod, $hod, null);
$hodInbox = $notifs($hodUser, $id8, 'LEAVE_AWAITING_DECISION');
check('deciding retires the approver\'s action notification',
    !empty($hodInbox) && (int) $hodInbox[0]['is_read'] === 1,
    json_encode($hodInbox));

$hrInbox = $notifs($hrUser, $id8, 'LEAVE_AWAITING_DECISION');
check('advancing hands the request to the next stage\'s approver',
    count($hrInbox) === 1 && (int) $hrInbox[0]['is_read'] === 0,
    json_encode($hrInbox));

// A cancelled request must not stay in anyone's action list.
$r9  = $submit(['start' => '2031-01-06', 'end' => '2031-01-07']);
$id9 = (int) $r9['id'];
$service->cancel($id9, $requesterUser, $requester);
$stale = array_filter(
    $notifs($hodUser, $id9, 'LEAVE_AWAITING_DECISION'),
    static fn(array $n): bool => (int) $n['is_read'] === 0
);
equals('cancelling retires every outstanding action notification', 0, count($stale));

// ─────────────────────────────────────────────────────────────────────────────
echo "\nNotifications — delivery is never fatal\n";
// ─────────────────────────────────────────────────────────────────────────────

equals('pushing to user 0 is a no-op, not an error', null,
    \App\Services\NotificationService::push(0, 'X', 'X', 'X'));
// A stage whose permission nobody holds must not stall silently: the fan-out
// falls back to superadmins so at least someone is told. (replaceChain() already
// rejects slugs that aren't real permissions, so in practice this only happens
// for a valid slug that no role has been granted.)
$UNGRANTED = 'THIS_SLUG_IS_GRANTED_TO_NO_ROLE';
equals('an ungranted slug has no explicit holders', [],
    \App\Services\NotificationService::usersWithPermission($UNGRANTED));
check('superadmins are only reachable as the explicit fallback',
    count(\App\Services\NotificationService::usersWithPermission($UNGRANTED, [], true)) > 0,
    'no superadmin found to fall back to');

// Routine fan-out reaches the explicit holders — including the fixture reviewer —
// and no superadmin-role account. (Other real HOD accounts legitimately hold
// APPROVE_LEAVE_L1 too, so this asserts membership, not an exact list.)
$l1Holders = \App\Services\NotificationService::usersWithPermission(Permissions::APPROVE_LEAVE_L1);
check('routine fan-out includes the explicit stage holders',
    in_array($hodUser, $l1Holders, true), 'holders=' . json_encode($l1Holders));

$superadminIds = array_column(
    $db->fetchAll("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'superadmin'"),
    'id'
);
equals('routine fan-out sweeps in no superadmin', [],
    array_values(array_intersect($l1Holders, array_map('intval', $superadminIds))));


// ─────────────────────────────────────────────────────────────────────────────
echo "\nStatus transition guard\n";
// ─────────────────────────────────────────────────────────────────────────────

// Reaching into the model bypasses the service, which is exactly why the
// service's own guard has to be the thing that refuses illegal moves.
$requests->update($id2, ['status' => 'Rejected']);
throws('Rejected is terminal — no transition out of it', 'no longer be cancelled', fn() => $service->cancel($id2, null, $hr));

} catch (\Throwable $e) {
    // An uncaught throwable skips every remaining assertion, so the summary
    // below would report a smaller "passed" count with zero failures — a green
    // result for a suite that never finished. Record it as a failure.
    echo "\n\033[31mUNCAUGHT " . $e::class . ": " . $e->getMessage() . "\033[0m\n";
    echo $e->getTraceAsString() . "\n";
    $failed[] = 'SUITE ABORTED before completing — ' . $e::class . ': ' . $e->getMessage();
    $exit = 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Teardown
// ─────────────────────────────────────────────────────────────────────────────

echo "\nCleaning up…\n";
foreach ($createdRequests as $id) {
    // Any recipient at all — a fan-out may legitimately have reached a real
    // account, and leaving test notifications in a real inbox is not on.
    $db->execute("DELETE FROM notifications WHERE entity_type = 'leave_request' AND entity_id = ?", [$id]);
    // leave_request_approvals cascades.
    $db->execute("DELETE FROM leave_requests WHERE id = ?", [$id]);
}
foreach ($createdTypes as $id) {
    $db->execute("DELETE FROM leave_balances WHERE leave_type_id = ?", [$id]);
    // leave_approval_stages cascades.
    $db->execute("DELETE FROM leave_types WHERE id = ?", [$id]);
}
foreach ($createdEmployees as $id) {
    $db->execute("DELETE FROM employees WHERE employee_id = ?", [$id]);
}
foreach ($createdUsers as $id) {
    $db->execute("DELETE FROM notifications WHERE user_id = ?", [$id]);
    $db->execute("DELETE FROM system_logs WHERE user_id = ?", [$id]);
    $db->execute("DELETE FROM users WHERE id = ?", [$id]);
}
foreach ($createdRoles as $id) {
    $db->execute("DELETE FROM role_permissions WHERE role_id = ?", [$id]);
    $db->execute("DELETE FROM roles WHERE id = ?", [$id]);
}

// Sweep anything a previous crashed run left behind, so the next run starts clean.
$db->execute("DELETE FROM leave_requests WHERE leave_type_id IN (SELECT id FROM leave_types WHERE name LIKE 'ZZTEST%')");
$db->execute("DELETE FROM leave_balances WHERE leave_type_id IN (SELECT id FROM leave_types WHERE name LIKE 'ZZTEST%')");
$db->execute("DELETE FROM leave_types WHERE name LIKE 'ZZTEST%'");
$db->execute("DELETE FROM employees WHERE employee_username LIKE 'ZZTEST%'");
$db->execute("DELETE FROM system_logs WHERE user_email LIKE '%@zztest.invalid'");
$db->execute("DELETE FROM users WHERE username LIKE 'ZZTEST%'");

$db->execute("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name LIKE 'ZZTEST%')");
$db->execute("DELETE FROM roles WHERE name LIKE 'ZZTEST%'");

// Orphaned notifications: a leave notification whose request no longer exists
// points nowhere and can only be residue (from this run or a crashed earlier
// one). A permission fan-out can legitimately reach real accounts, so this is
// the only reliable way to keep test noise out of real inboxes.
$db->execute(
    "DELETE n FROM notifications n
     LEFT JOIN leave_requests lr ON lr.id = n.entity_id
     WHERE n.entity_type = 'leave_request' AND lr.id IS NULL"
);

$leftovers = (int) ($db->fetchOne("SELECT COUNT(*) AS n FROM leave_types WHERE name LIKE 'ZZTEST%'")['n'] ?? 0)
           + (int) ($db->fetchOne("SELECT COUNT(*) AS n FROM users WHERE username LIKE 'ZZTEST%'")['n'] ?? 0)
           + (int) ($db->fetchOne("SELECT COUNT(*) AS n FROM roles WHERE name LIKE 'ZZTEST%'")['n'] ?? 0);
echo $leftovers === 0 ? "  all fixtures removed\n" : "  \033[33m{$leftovers} ZZTEST row(s) left behind\033[0m\n";

// ─────────────────────────────────────────────────────────────────────────────
echo "\n" . str_repeat('─', 62) . "\n";
echo "  passed: {$passed}   failed: " . count($failed) . "\n";
foreach ($failed as $f) {
    echo "    \033[31m✗\033[0m {$f}\n";
}
echo str_repeat('─', 62) . "\n";

exit($failed || $exit ? 1 : 0);
