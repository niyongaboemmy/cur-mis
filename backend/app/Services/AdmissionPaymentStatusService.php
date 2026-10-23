<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * What an applicant has paid against what they owe, read straight from the
 * payment ledgers, so the staff screen and the enrollment gate can never
 * disagree about whether the money is in.
 *
 *   required  = total of the admission bills raised for the application
 *               (Registration, CURSU …). Applicants who were never billed
 *               owe nothing here, which matches the enrollment gate.
 *   paid      = every recorded payment against those bills, whatever its
 *               source (gateway, confirmed offline, claim approval).
 *   sufficient = paid covers required.
 *
 * The application fee (processing fee) is reported on its own: it is settled
 * before the application is submitted, so it is not part of the admission gate.
 */
class AdmissionPaymentStatusService
{
    /** Amounts within this much of each other are the same amount (RWF, 2dp). */
    private const EPSILON = 0.009;

    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * @return array<string,mixed>|null null when the application does not exist
     */
    public function forApplication(int $applicationId): ?array
    {
        $app = $this->db->fetchOne(
            "SELECT id, application_number, first_name, last_name, status,
                    payment_amount, payment_currency, transaction_id, paid_at
               FROM `student_applications`
              WHERE id = ?
              LIMIT 1",
            [$applicationId]
        );
        if (!$app) {
            return null;
        }

        $bills = $this->db->fetchAll(
            "SELECT id, fee_type, label, amount_due, amount_paid, status
               FROM `application_invoices`
              WHERE application_id = ? AND status <> 'cancelled'
              ORDER BY id ASC",
            [$applicationId]
        );

        $admissionPayments = $this->db->fetchAll(
            "SELECT aip.id, aip.application_invoice_id, aip.amount, aip.currency,
                    aip.reference_number, aip.receipt_number, aip.source,
                    aip.payment_method, aip.paid_at, ai.fee_type, ai.label
               FROM `application_invoice_payments` aip
               JOIN `application_invoices` ai ON ai.id = aip.application_invoice_id
              WHERE aip.application_id = ?
              ORDER BY aip.paid_at ASC, aip.id ASC",
            [$applicationId]
        );

        $feePayments = $this->db->fetchAll(
            "SELECT id, amount, currency, reference_number, receipt_number, source,
                    payment_method, paid_at
               FROM `application_fee_payments`
              WHERE application_id = ?
              ORDER BY paid_at ASC, id ASC",
            [$applicationId]
        );

        $required = 0.0;
        $billPaid = 0.0;
        $billRows = [];
        foreach ($bills as $bill) {
            $due  = (float)$bill['amount_due'];
            $paid = (float)$bill['amount_paid'];
            $required += $due;
            $billPaid += $paid;
            $billRows[] = [
                'id'       => (int)$bill['id'],
                'fee_type' => (string)$bill['fee_type'],
                'label'    => (string)($bill['label'] ?: $bill['fee_type']),
                'due'      => round($due, 2),
                'paid'     => round($paid, 2),
                'balance'  => round(max(0.0, $due - $paid), 2),
                'status'   => (string)$bill['status'],
            ];
        }

        $paidAdmission = 0.0;
        foreach ($admissionPayments as $p) {
            $paidAdmission += (float)$p['amount'];
        }

        $paidApplicationFee = 0.0;
        foreach ($feePayments as $p) {
            $paidApplicationFee += (float)$p['amount'];
        }

        $balance    = round(max(0.0, $required - $paidAdmission), 2);
        $sufficient = $paidAdmission + self::EPSILON >= $required;

        // The flat columns on the application keep one cumulative figure. When
        // it disagrees with the ledgers, the ledgers win and staff are told.
        $flatPaid    = (float)($app['payment_amount'] ?? 0);
        $ledgerTotal = round($paidAdmission + $paidApplicationFee, 2);

        return [
            'application_id'     => (int)$app['id'],
            'application_number' => (string)$app['application_number'],
            'applicant_name'     => trim((string)$app['first_name'] . ' ' . (string)$app['last_name']),
            'status'             => (string)$app['status'],
            'billed'             => $bills !== [],
            'required'           => round($required, 2),
            'paid'               => round($paidAdmission, 2),
            'balance'            => $balance,
            'sufficient'         => $sufficient,
            'bills'              => $billRows,
            'payments'           => $this->merge($admissionPayments, $feePayments),
            'application_fee'    => [
                'paid' => round($paidApplicationFee, 2),
            ],
            'recorded_on_application' => [
                'amount'         => round($flatPaid, 2),
                'transaction_id' => $app['transaction_id'] ?? null,
                'paid_at'        => $app['paid_at'] ?? null,
                'matches_ledger' => abs($flatPaid - $ledgerTotal) <= self::EPSILON
                    || abs($flatPaid - $paidAdmission) <= self::EPSILON,
            ],
            'message'            => $this->message($bills !== [], $sufficient, $balance, $paidAdmission, $required),
        ];
    }

    /**
     * One list of every payment, newest first, in the shape the screen shows.
     *
     * @param list<array<string,mixed>> $admission
     * @param list<array<string,mixed>> $fee
     * @return list<array<string,mixed>>
     */
    private function merge(array $admission, array $fee): array
    {
        $rows = [];
        foreach ($admission as $p) {
            $rows[] = [
                'kind'           => 'admission',
                'label'          => (string)($p['label'] ?: $p['fee_type']),
                'amount'         => round((float)$p['amount'], 2),
                'reference'      => (string)$p['reference_number'],
                'receipt_number' => $p['receipt_number'] ?? null,
                'source'         => (string)$p['source'],
                'paid_at'        => (string)$p['paid_at'],
            ];
        }
        foreach ($fee as $p) {
            $rows[] = [
                'kind'           => 'application_fee',
                'label'          => 'Application fee',
                'amount'         => round((float)$p['amount'], 2),
                'reference'      => (string)$p['reference_number'],
                'receipt_number' => $p['receipt_number'] ?? null,
                'source'         => (string)$p['source'],
                'paid_at'        => (string)$p['paid_at'],
            ];
        }

        usort($rows, static fn (array $a, array $b): int => strcmp($b['paid_at'], $a['paid_at']));

        return $rows;
    }

    private function message(bool $billed, bool $sufficient, float $balance, float $paid, float $required): string
    {
        if (!$billed) {
            return 'No admission fees have been billed for this applicant yet, so there is nothing to check against.';
        }
        if ($sufficient) {
            return 'Paid ' . number_format($paid, 0) . ' of ' . number_format($required, 0)
                . ' RWF. The admission fees are settled, so the next step can proceed.';
        }

        return 'Insufficient payment: ' . number_format($paid, 0) . ' of ' . number_format($required, 0)
            . ' RWF has been received. Remaining balance ' . number_format($balance, 0) . ' RWF. '
            . 'The next step cannot proceed until the balance is paid.';
    }
}
