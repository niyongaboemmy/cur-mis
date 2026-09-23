<?php

namespace App\Controllers;

use App\Models\DB;
use DateTime;

class BordereauxPaymentController
{
    /**
     * GET /api/applicant/bordereau/:applicationId/status
     * Check if student can submit Bordereau payment
     */
    public function getSubmissionStatus()
    {
        $userId = authUser()['user_id'] ?? null;
        $appId = intval($_GET['application_id'] ?? 0);

        if (!$userId || !$appId) {
            jsonResponse(['error' => 'Missing parameters'], 400);
            return;
        }

        try {
            // Verify applicant owns this application
            $app = DB::query(
                "SELECT sa.id, sa.student_id, sa.amount, sa.payment_status, sa.bordereau_payment_status
                 FROM student_applications sa
                 JOIN users u ON u.id = ?
                 WHERE sa.id = ? AND u.id = ?",
                [$userId, $appId, $userId]
            )->fetch();

            if (!$app) {
                jsonResponse(['error' => 'Application not found'], 404);
                return;
            }

            // Get current submission status
            $submission = DB::query(
                "SELECT id, status, submission_attempt, rejection_reason, amount, receipt_number, reviewed_at
                 FROM bordereau_submissions
                 WHERE application_id = ? AND status IN ('pending', 'approved')
                 ORDER BY created_at DESC LIMIT 1",
                [$appId]
            )->fetch();

            // Check if student can still resubmit
            $canResubmit = true;
            $reason = null;
            if ($submission && $submission['status'] === 'rejected') {
                if ($submission['submission_attempt'] >= 3) {
                    $canResubmit = false;
                    $reason = 'Maximum submission attempts (3) reached. Contact Finance.';
                }
            }

            jsonResponse([
                'application_id' => $appId,
                'required_amount' => $app['amount'],
                'current_submission' => $submission ? [
                    'id' => $submission['id'],
                    'status' => $submission['status'],
                    'receipt_number' => $submission['receipt_number'],
                    'amount' => $submission['amount'],
                    'attempt' => $submission['submission_attempt'],
                    'rejection_reason' => $submission['rejection_reason'],
                    'reviewed_at' => $submission['reviewed_at'],
                ] : null,
                'can_submit' => $canResubmit,
                'resubmit_reason' => $reason,
                'remaining_attempts' => max(0, 3 - ($submission['submission_attempt'] ?? 0)),
            ]);
        } catch (\Exception $e) {
            jsonResponse(['error' => 'Internal server error'], 500);
            logError($e);
        }
    }

    /**
     * POST /api/applicant/bordereau/submit
     * Student submits Bordereau receipt number for verification
     */
    public function submitBordereau()
    {
        $userId = authUser()['user_id'] ?? null;
        $data = json_decode(file_get_contents('php://input'), true);

        if (!$userId || !$data) {
            jsonResponse(['error' => 'Invalid request'], 400);
            return;
        }

        try {
            $appId = $data['application_id'] ?? null;
            $receiptNumber = trim($data['receipt_number'] ?? '');
            $amount = floatval($data['amount'] ?? 0);
            $bankName = trim($data['bank_name'] ?? null);
            $accountHolder = trim($data['account_holder_name'] ?? null);
            $paymentDate = $data['payment_date'] ?? null;

            if (!$appId || !$receiptNumber || $amount <= 0) {
                jsonResponse(['error' => 'Missing or invalid fields'], 400);
                return;
            }

            // Verify applicant owns this application
            $app = DB::query(
                "SELECT sa.id, sa.student_id, sa.amount
                 FROM student_applications sa
                 JOIN users u ON u.id = ?
                 WHERE sa.id = ? AND u.id = ?",
                [$userId, $appId, $userId]
            )->fetch();

            if (!$app) {
                jsonResponse(['error' => 'Application not found'], 404);
                return;
            }

            // Check if receipt number already exists
            $existing = DB::query(
                "SELECT id FROM bordereau_submissions WHERE receipt_number = ?",
                [$receiptNumber]
            )->fetch();

            if ($existing) {
                jsonResponse(['error' => 'This receipt number has already been submitted'], 409);
                return;
            }

            // Check current submission status
            $currentSubmission = DB::query(
                "SELECT id, status, submission_attempt FROM bordereau_submissions
                 WHERE application_id = ? ORDER BY created_at DESC LIMIT 1",
                [$appId]
            )->fetch();

            $newAttempt = 1;
            if ($currentSubmission && $currentSubmission['status'] === 'rejected') {
                if ($currentSubmission['submission_attempt'] >= 3) {
                    jsonResponse(['error' => 'Maximum submission attempts reached. Contact Finance.'], 429);
                    return;
                }
                $newAttempt = $currentSubmission['submission_attempt'] + 1;
            }

            // Insert submission
            DB::query(
                "INSERT INTO bordereau_submissions (
                    application_id, student_id, receipt_number, amount, bank_name,
                    account_holder_name, payment_date, status, submission_attempt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
                [
                    $appId,
                    $app['student_id'],
                    $receiptNumber,
                    $amount,
                    $bankName ?: null,
                    $accountHolder ?: null,
                    $paymentDate ?: null,
                    $newAttempt,
                ]
            );

            $submissionId = DB::connection()->lastInsertId();

            // Create verification requests for Finance and Registrar
            DB::query(
                "INSERT INTO bordereau_verification_requests (bordereau_submission_id, recipient_role)
                 VALUES (?, 'finance'), (?, 'registrar')",
                [$submissionId, $submissionId]
            );

            // Update application status
            DB::query(
                "UPDATE student_applications
                 SET bordereau_payment_status = 'pending_review', updated_at = NOW()
                 WHERE id = ?",
                [$appId]
            );

            jsonResponse([
                'success' => true,
                'message' => 'Receipt submitted successfully. Finance team will review within 24 hours.',
                'submission_id' => $submissionId,
                'attempt' => $newAttempt,
                'remaining_attempts' => max(0, 3 - $newAttempt),
            ]);
        } catch (\Exception $e) {
            jsonResponse(['error' => 'Internal server error'], 500);
            logError($e);
        }
    }

    /**
     * GET /api/finance/bordereau/pending
     * Get pending Bordereau submissions for Finance/Registrar review
     */
    public function getPendingSubmissions()
    {
        $staff = authUser();
        $role = $_GET['role'] ?? null; // 'finance' or 'registrar'

        // Verify user is Finance or Registrar
        if (!in_array($role, ['finance', 'registrar'])) {
            jsonResponse(['error' => 'Invalid role'], 400);
            return;
        }

        if (!hasPermission("view_bordereau_{$role}_verification")) {
            jsonResponse(['error' => 'Unauthorized'], 403);
            return;
        }

        try {
            $submissions = DB::query(
                "SELECT
                    bs.id,
                    bs.application_id,
                    bs.student_id,
                    bs.receipt_number,
                    bs.amount,
                    bs.bank_name,
                    bs.account_holder_name,
                    bs.payment_date,
                    bs.notes,
                    bs.status,
                    bs.submission_attempt,
                    bs.rejection_reason,
                    bs.reviewed_by,
                    bs.reviewed_at,
                    bs.created_at,
                    sa.first_name,
                    sa.last_name,
                    sa.application_reference,
                    sa.amount as required_amount,
                    bvr.is_read
                 FROM bordereau_submissions bs
                 JOIN student_applications sa ON sa.id = bs.application_id
                 JOIN bordereau_verification_requests bvr ON bvr.bordereau_submission_id = bs.id
                 WHERE bvr.recipient_role = ? AND bs.status = 'pending'
                 ORDER BY bs.created_at ASC",
                [$role]
            )->fetchAll();

            jsonResponse([
                'pending_count' => count($submissions),
                'submissions' => $submissions,
            ]);
        } catch (\Exception $e) {
            jsonResponse(['error' => 'Internal server error'], 500);
            logError($e);
        }
    }

    /**
     * POST /api/finance/bordereau/:id/approve
     * Finance/Registrar approves a Bordereau submission
     */
    public function approveBordereau()
    {
        $staff = authUser();
        $staffId = $staff['user_id'] ?? null;
        $submissionId = intval($_POST['submission_id'] ?? 0);

        if (!$staffId || !$submissionId) {
            jsonResponse(['error' => 'Missing parameters'], 400);
            return;
        }

        if (!hasPermission('approve_bordereau_payment')) {
            jsonResponse(['error' => 'Unauthorized'], 403);
            return;
        }

        try {
            $submission = DB::query(
                "SELECT id, application_id, student_id, amount FROM bordereau_submissions
                 WHERE id = ? AND status = 'pending'",
                [$submissionId]
            )->fetch();

            if (!$submission) {
                jsonResponse(['error' => 'Submission not found or already processed'], 404);
                return;
            }

            // Approve the submission
            DB::query(
                "UPDATE bordereau_submissions
                 SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW()
                 WHERE id = ?",
                [$staffId, $submissionId]
            );

            // Update application status to paid
            DB::query(
                "UPDATE student_applications
                 SET bordereau_payment_status = 'approved',
                     bordereau_submission_id = ?,
                     payment_status = 'paid',
                     paid_at = NOW(),
                     updated_at = NOW()
                 WHERE id = ?",
                [$submissionId, $submission['application_id']]
            );

            // Mark verification requests as read
            DB::query(
                "UPDATE bordereau_verification_requests
                 SET is_read = 1, read_at = NOW()
                 WHERE bordereau_submission_id = ?",
                [$submissionId]
            );

            // Log the action
            DB::query(
                "INSERT INTO application_status_log (application_id, status, notes, updated_by, updated_at)
                 VALUES (?, 'paid', ?, ?, NOW())",
                [$submission['application_id'], "Bordereau payment approved: {$submission['amount']} RWF", $staffId]
            );

            jsonResponse([
                'success' => true,
                'message' => 'Bordereau payment approved. Student can now proceed.',
                'application_id' => $submission['application_id'],
            ]);
        } catch (\Exception $e) {
            jsonResponse(['error' => 'Internal server error'], 500);
            logError($e);
        }
    }

    /**
     * POST /api/finance/bordereau/:id/reject
     * Finance/Registrar rejects a Bordereau submission
     */
    public function rejectBordereau()
    {
        $staff = authUser();
        $staffId = $staff['user_id'] ?? null;
        $data = json_decode(file_get_contents('php://input'), true);
        $submissionId = intval($data['submission_id'] ?? 0);
        $rejectionReason = trim($data['rejection_reason'] ?? '');

        if (!$staffId || !$submissionId || !$rejectionReason) {
            jsonResponse(['error' => 'Missing parameters'], 400);
            return;
        }

        if (!hasPermission('approve_bordereau_payment')) {
            jsonResponse(['error' => 'Unauthorized'], 403);
            return;
        }

        try {
            $submission = DB::query(
                "SELECT id, application_id, submission_attempt FROM bordereau_submissions
                 WHERE id = ? AND status = 'pending'",
                [$submissionId]
            )->fetch();

            if (!$submission) {
                jsonResponse(['error' => 'Submission not found or already processed'], 404);
                return;
            }

            // Reject the submission
            DB::query(
                "UPDATE bordereau_submissions
                 SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW()
                 WHERE id = ?",
                [$rejectionReason, $staffId, $submissionId]
            );

            // Update application status based on attempt count
            $newStatus = $submission['submission_attempt'] >= 3 ? 'rejected' : 'pending_review';
            DB::query(
                "UPDATE student_applications
                 SET bordereau_payment_status = ?, updated_at = NOW()
                 WHERE id = ?",
                [$newStatus, $submission['application_id']]
            );

            // Mark verification requests as read
            DB::query(
                "UPDATE bordereau_verification_requests
                 SET is_read = 1, read_at = NOW()
                 WHERE bordereau_submission_id = ?",
                [$submissionId]
            );

            // Log the action
            DB::query(
                "INSERT INTO application_status_log (application_id, status, notes, updated_by, updated_at)
                 VALUES (?, 'bordereau_rejected', ?, ?, NOW())",
                [$submission['application_id'], "Bordereau rejected: $rejectionReason", $staffId]
            );

            jsonResponse([
                'success' => true,
                'message' => 'Bordereau payment rejected. Student has been notified.',
                'can_resubmit' => $submission['submission_attempt'] < 3,
                'remaining_attempts' => max(0, 3 - $submission['submission_attempt']),
                'application_id' => $submission['application_id'],
            ]);
        } catch (\Exception $e) {
            jsonResponse(['error' => 'Internal server error'], 500);
            logError($e);
        }
    }

    /**
     * GET /api/finance/bordereau/dashboard-stats
     * Get dashboard statistics for Finance
     */
    public function getDashboardStats()
    {
        if (!hasPermission('view_bordereau_finance_verification')) {
            jsonResponse(['error' => 'Unauthorized'], 403);
            return;
        }

        try {
            $stats = DB::query(
                "SELECT
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
                    COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
                    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
                    SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as total_approved_amount,
                    DATE(MAX(created_at)) as last_submission_date
                 FROM bordereau_submissions"
            )->fetch();

            jsonResponse(['stats' => $stats]);
        } catch (\Exception $e) {
            jsonResponse(['error' => 'Internal server error'], 500);
            logError($e);
        }
    }
}
