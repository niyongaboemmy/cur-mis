<?php

declare(strict_types=1);

namespace App\Models;

class OverdueAlertModel extends BaseModel
{
    protected string $table = 'fee_overdue_alerts';
    protected array $fillable = [
        'invoice_id', 'student_id', 'alert_level', 'channel',
        'sent_at', 'sent_by', 'email_sent',
    ];

    /** List alert history with invoice and student details. */
    public function listWithDetails(array $filters = [], int $page = 1, int $perPage = 50): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['student_id'])) {
            $where[]    = 'oa.student_id = ?';
            $bindings[] = $filters['student_id'];
        }
        if (!empty($filters['alert_level'])) {
            $where[]    = 'oa.alert_level = ?';
            $bindings[] = $filters['alert_level'];
        }
        if (!empty($filters['date_from'])) {
            $where[]    = 'DATE(oa.sent_at) >= ?';
            $bindings[] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $where[]    = 'DATE(oa.sent_at) <= ?';
            $bindings[] = $filters['date_to'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $offset   = ($page - 1) * $perPage;

        $countRow = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `fee_overdue_alerts` oa {$whereSql}",
            $bindings
        );
        $total = (int)($countRow['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT oa.*,
                    CONCAT(s.fname, ' ', s.lname) AS student_name,
                    s.email                        AS student_email,
                    fi.invoice_number,
                    fi.amount_due,
                    fi.amount_paid,
                    fi.due_date,
                    fi.description                 AS invoice_description,
                    ay.label                       AS academic_year_label,
                    u.full_name                    AS sent_by_name
             FROM `fee_overdue_alerts` oa
             LEFT JOIN `fee_invoices` fi ON fi.id = oa.invoice_id
             LEFT JOIN `student` s       ON s.regnumber = oa.student_id
             LEFT JOIN `academic_years` ay ON ay.id = fi.academic_year_id
             LEFT JOIN `users` u         ON u.id = oa.sent_by
             {$whereSql}
             ORDER BY oa.sent_at DESC
             LIMIT ? OFFSET ?",
            array_merge($bindings, [$perPage, $offset])
        );

        return [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ];
    }

    /** Check if an alert was already sent for an invoice within given hours. */
    public function wasRecentlySent(int $invoiceId, string $alertLevel, int $withinHours = 24): bool
    {
        $row = $this->db->fetchOne(
            "SELECT id FROM `fee_overdue_alerts`
             WHERE invoice_id = ? AND alert_level = ?
               AND sent_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
             LIMIT 1",
            [$invoiceId, $alertLevel, $withinHours]
        );
        return (bool)$row;
    }

    public function getAlertCountByInvoice(int $invoiceId): int
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `fee_overdue_alerts` WHERE invoice_id = ?",
            [$invoiceId]
        );
        return (int)($row['cnt'] ?? 0);
    }
}
