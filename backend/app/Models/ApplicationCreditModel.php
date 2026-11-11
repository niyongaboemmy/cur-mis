<?php

declare(strict_types=1);

namespace App\Models;

/**
 * ApplicationCreditModel
 *
 * The credit ledger for an applicant's admission payments (migration
 * 2026_11_11_001). One row per gateway settlement, holding what was received,
 * what has been allocated to bills, and what is still unapplied.
 *
 * Money is only ever moved by AdmissionBillingService, inside a transaction
 * that has locked the application row. This model is read/write plumbing.
 */
class ApplicationCreditModel extends BaseModel
{
    protected string $table = 'application_credits';
    protected array $fillable = [
        'application_id', 'reference_number', 'payer_code', 'service_code',
        'currency', 'source', 'amount_received', 'amount_allocated',
        'amount_remaining', 'status', 'received_at', 'notes', 'updated_at',
    ];
    protected array $hidden = [];

    public function findByReference(int $applicationId, string $reference): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `application_credits`
              WHERE application_id = ? AND reference_number = ?
              LIMIT 1",
            [$applicationId, $reference]
        );
    }

    /**
     * Credits that still hold unapplied money, oldest first. Called while the
     * application row is locked, so the rows it returns cannot change under the
     * caller.
     */
    public function openForApplication(int $applicationId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `application_credits`
              WHERE application_id = ?
                AND status = 'open'
                AND amount_remaining > 0
              ORDER BY received_at ASC, id ASC
                FOR UPDATE",
            [$applicationId]
        );
    }

    /** Every credit on an application, oldest first, for the audit view. */
    public function forApplication(int $applicationId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `application_credits`
              WHERE application_id = ?
              ORDER BY received_at ASC, id ASC",
            [$applicationId]
        );
    }

    /**
     * @return array{received:float,allocated:float,unapplied:float,entries:list<array<string,mixed>>}
     */
    public function summaryFor(int $applicationId): array
    {
        $entries = $this->forApplication($applicationId);

        $received  = 0.0;
        $allocated = 0.0;
        $unapplied = 0.0;
        foreach ($entries as $entry) {
            $received  += (float)$entry['amount_received'];
            $allocated += (float)$entry['amount_allocated'];
            $unapplied += (float)$entry['amount_remaining'];
        }

        return [
            'received'  => round($received, 2),
            'allocated' => round($allocated, 2),
            'unapplied' => round($unapplied, 2),
            'entries'   => array_map(static fn (array $e): array => [
                'id'               => (int)$e['id'],
                'reference'        => (string)$e['reference_number'],
                'source'           => (string)$e['source'],
                'service_code'     => $e['service_code'] ?: null,
                'amount_received'  => (float)$e['amount_received'],
                'amount_allocated' => (float)$e['amount_allocated'],
                'amount_remaining' => (float)$e['amount_remaining'],
                'status'           => (string)$e['status'],
                'received_at'      => (string)$e['received_at'],
            ], $entries),
        ];
    }
}
