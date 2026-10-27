<?php

declare(strict_types=1);

namespace App\Payroll\PartTime;

use App\Payroll\Reports\PayrollPdf;

/**
 * HTML for the part-time invitation letter and contract.
 *
 * The wording is a placeholder until CUR supplies its official templates. Every value is escaped.
 */
final class PartTimeDocuments
{
    /**
     * @param array<string, mixed> $assignment pt_assignments row
     * @param array<string, mixed> $person     employees row (name fields)
     */
    public static function invitationHtml(array $assignment, array $person, string $gradeName): string
    {
        $name = PayrollPdf::e(trim($person['employee_fname'] . ' ' . $person['employee_lname']));
        $origin = PayrollPdf::e((string) ($assignment['origin_place'] ?? ''));
        $home = PayrollPdf::e((string) ($assignment['home_institution'] ?? ''));

        $body = '
            <p>Dear ' . $name . ',</p>
            <p>The Catholic University of Rwanda invites you to teach the module
            <strong>' . PayrollPdf::e((string) $assignment['module_title']) . '</strong>
            (' . PayrollPdf::e((string) $assignment['module_code']) . ') in the ' . PayrollPdf::e((string) $assignment['programme']) . ' programme,
            from ' . PayrollPdf::e((string) $assignment['period_start']) . ' to ' . PayrollPdf::e((string) $assignment['period_end']) . '.</p>
            <table>
              <tr><th>Credits</th><td>' . (int) $assignment['credits'] . '</td></tr>
              <tr><th>Hours paid</th><td>' . PayrollPdf::e((string) ($assignment['hours_paid'] ?? $assignment['hours_default'])) . '</td></tr>
              <tr><th>Grade</th><td>' . PayrollPdf::e($gradeName) . '</td></tr>
              <tr><th>Home institution</th><td>' . ($home !== '' ? $home : '–') . '</td></tr>
              <tr><th>Place of origin</th><td>' . ($origin !== '' ? $origin : '–') . '</td></tr>
            </table>
            <p>Please confirm your acceptance so that a contract can be prepared.</p>';

        return PayrollPdf::document('Invitation to teach', $body);
    }

    /**
     * @param array<string, mixed> $assignment pt_assignments row
     * @param array<string, mixed> $person     employees row
     */
    public static function contractHtml(array $assignment, array $person, string $gradeName, int $ratePerHour): string
    {
        $name = PayrollPdf::e(trim($person['employee_fname'] . ' ' . $person['employee_lname']));
        $hours = PayrollPdf::e((string) ($assignment['hours_paid'] ?? $assignment['hours_default']));

        $body = '
            <p>This contract is made between the Catholic University of Rwanda and <strong>' . $name . '</strong>.</p>
            <p>Module: ' . PayrollPdf::e((string) $assignment['module_title']) . ' (' . PayrollPdf::e((string) $assignment['module_code']) . ').
            Teaching period: ' . PayrollPdf::e((string) $assignment['period_start']) . ' to ' . PayrollPdf::e((string) $assignment['period_end']) . '.</p>
            <p>Payment: ' . $hours . ' hours at ' . number_format($ratePerHour) . ' RWF per hour (' . PayrollPdf::e($gradeName) . ').
            Income tax and social security are deducted as required by law.</p>
            <p>Signed for the University: ____________________ &nbsp;&nbsp; Lecturer: ____________________</p>';

        return PayrollPdf::document('Part-time teaching contract', $body);
    }
}
