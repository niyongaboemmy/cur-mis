<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ApplicationInvoiceModel;
use Core\Database;

/**
 * Settles admission fees for the live database, in two steps:
 *
 *   1. Approved bordereau (bank deposit) payments are applied to the open admission
 *      bills, through AdmissionBillingService::allocateApprovedBordereaux().
 *   2. Every admitted applicant whose bills are now fully paid, and who has no
 *      registration number yet, is enrolled, the same as an automatic enrollment
 *      after a gateway payment.
 *
 * Pending bordereau deposits are never approved here; Finance still verifies those.
 * Called by POST /api/deploy/settle-admissions. The same steps are available as
 * scripts/backfill_bordereau_allocations.php and scripts/enroll_settled_applicants.php.
 */
class AdmissionSettlementService
{
    /**
     * @return array{mode:string,application:string,deposits:list<array<string,mixed>>,
     *               enrolled:list<array<string,mixed>>,owing:list<array<string,mixed>>,
     *               failed:list<array<string,mixed>>}
     */
    public function run(bool $apply, string $applicationNumber = ''): array
    {
        $db      = Database::getInstance();
        $billing = new AdmissionBillingService();
        $bills   = new ApplicationInvoiceModel();

        $filter = '';
        $params = [];
        if ($applicationNumber !== '') {
            $filter   = ' AND sa.application_number = ?';
            $params[] = $applicationNumber;
        }

        $report = [
            'mode'        => $apply ? 'apply' : 'dry-run',
            'application' => $applicationNumber !== '' ? $applicationNumber : 'all',
            'deposits'    => [],
            'enrolled'    => [],
            'owing'       => [],
            'failed'      => [],
        ];

        // ── Step 1: approved deposits onto the admission bills ───────────────
        $deposits = $db->fetchAll(
            "SELECT DISTINCT sa.id, sa.application_number
               FROM `bordereau_submissions` bs
               JOIN `student_applications` sa ON sa.id = bs.application_id
              WHERE bs.status = 'approved' {$filter}
              ORDER BY sa.id ASC",
            $params
        );

        foreach ($deposits as $row) {
            $appId = (int)$row['id'];
            $entry = ['application' => $row['application_number']];

            if ($apply) {
                try {
                    $entry['results'] = $billing->allocateApprovedBordereaux($appId, null);
                } catch (\Throwable $e) {
                    $report['failed'][] = ['application' => $row['application_number'], 'step' => 'deposit', 'error' => $e->getMessage()];
                    continue;
                }
            }

            $report['deposits'][] = $entry;
        }

        // ── Step 2: enroll applicants whose admission fees are fully paid ────
        $candidates = $db->fetchAll(
            "SELECT sa.id, sa.application_number, sa.first_name, sa.last_name,
                    ao.id AS offer_id
               FROM `admission_offers` ao
               JOIN `student_applications` sa ON sa.id = ao.application_id
              WHERE ao.enrollment_initiated = 0
                AND ao.status IN ('accepted', 'pending')
                AND EXISTS (SELECT 1 FROM `application_invoices` ai
                             WHERE ai.application_id = sa.id AND ai.status <> 'cancelled')
                    {$filter}
              ORDER BY sa.id ASC",
            $params
        );

        foreach ($candidates as $row) {
            $appId   = (int)$row['id'];
            $name    = trim($row['first_name'] . ' ' . $row['last_name']);
            $summary = $bills->summaryFor($appId);

            if (!$summary['fully_paid']) {
                $pending = $db->fetchOne(
                    "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
                       FROM `bordereau_submissions`
                      WHERE application_id = ? AND status = 'pending'",
                    [$appId]
                ) ?: [];

                $report['owing'][] = [
                    'application'      => $row['application_number'],
                    'name'             => $name,
                    'balance'          => (float)$summary['balance'],
                    'pending_deposits' => (int)($pending['cnt'] ?? 0),
                    'pending_amount'   => (float)($pending['total'] ?? 0),
                ];
                continue;
            }

            if (!$apply) {
                $report['enrolled'][] = ['application' => $row['application_number'], 'name' => $name, 'would_enroll' => true];
                continue;
            }

            try {
                $billing->enrollIfSettled($appId);
            } catch (\Throwable $e) {
                $report['failed'][] = ['application' => $row['application_number'], 'step' => 'enroll', 'error' => $e->getMessage()];
                continue;
            }

            $after = $db->fetchOne(
                "SELECT enrollment_initiated, student_id FROM `admission_offers` WHERE id = ?",
                [(int)$row['offer_id']]
            );

            if ($after && (int)$after['enrollment_initiated'] === 1) {
                $report['enrolled'][] = ['application' => $row['application_number'], 'name' => $name, 'student_id' => (int)$after['student_id']];
            } else {
                $report['failed'][] = ['application' => $row['application_number'], 'step' => 'enroll', 'error' => 'Not enrolled. Check the notification sent to admissions.'];
            }
        }

        return $report;
    }
}
