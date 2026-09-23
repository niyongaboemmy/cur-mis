<?php

declare(strict_types=1);

namespace App\Models;

/**
 * One settlement against an application_invoices row (migration 140).
 *
 * `reference_number` is UNIQUE in the schema and carries the gateway
 * transaction code — that constraint is the idempotency guard for a callback
 * UrubutoPay retries, mirroring `fee_payments.reference_number` on the student
 * side.
 */
class ApplicationInvoicePaymentModel extends BaseModel
{
    protected string $table = 'application_invoice_payments';
    protected array $fillable = [
        'application_invoice_id', 'application_id', 'amount', 'currency',
        'payment_method', 'reference_number', 'receipt_number', 'service_code',
        'source', 'recorded_by', 'notes', 'paid_at',
    ];
    protected array $hidden = [];

    /** Has this gateway transaction already been applied to this application? */
    public function existsForReference(string $reference): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `application_invoice_payments`
              WHERE reference_number = ? OR reference_number LIKE ?
              LIMIT 1",
            [$reference, $reference . '-%']
        );
    }

    public function forApplication(int $applicationId): array
    {
        return $this->db->fetchAll(
            "SELECT aip.*, ai.fee_type, ai.label
               FROM `application_invoice_payments` aip
               JOIN `application_invoices` ai ON ai.id = aip.application_invoice_id
              WHERE aip.application_id = ?
              ORDER BY aip.paid_at DESC, aip.id DESC",
            [$applicationId]
        );
    }
}
