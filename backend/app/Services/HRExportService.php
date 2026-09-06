<?php

declare(strict_types=1);

namespace App\Services;

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Exception;

/**
 * HR Export Service
 *
 * Handles CSV/Excel export of HR data from database views
 */
class HRExportService
{
    private $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * Export HR data to file
     *
     * @param string $exportType Type of export (employees, payroll, leave, contracts)
     * @param string $format File format (xlsx or csv)
     * @return string Path to generated file
     */
    public function exportData(string $exportType, string $format = 'xlsx'): string
    {
        $view = $this->getViewForExportType($exportType);

        if (!$view) {
            throw new Exception("Invalid export type: {$exportType}");
        }

        // Fetch data from view
        $data = $this->db->table($view)->get()->getResultArray();

        if ($format === 'csv') {
            return $this->exportToCSV($data, $exportType);
        } else {
            return $this->exportToExcel($data, $exportType);
        }
    }

    /**
     * Get the database view name for export type
     *
     * @param string $exportType
     * @return string|null
     */
    private function getViewForExportType(string $exportType): ?string
    {
        $views = [
            'employees' => 'v_employee_master_list',
            'payroll' => 'v_payroll_summary',
            'leave' => 'v_leave_request_summary',
            'contracts' => 'v_contract_expiry_summary',
        ];

        return $views[$exportType] ?? null;
    }

    /**
     * Export data to CSV file
     *
     * @param array $data
     * @param string $exportType
     * @return string Path to CSV file
     */
    private function exportToCSV(array $data, string $exportType): string
    {
        $filename = "hr_export_{$exportType}_" . date('Ymd_His') . '.csv';
        $filepath = sys_get_temp_dir() . '/' . $filename;

        $fp = fopen($filepath, 'w');

        if (empty($data)) {
            fclose($fp);
            return $filepath;
        }

        // Write header row
        $header = array_keys($data[0]);
        fputcsv($fp, $header);

        // Write data rows
        foreach ($data as $row) {
            fputcsv($fp, $row);
        }

        fclose($fp);
        return $filepath;
    }

    /**
     * Export data to Excel file
     *
     * @param array $data
     * @param string $exportType
     * @return string Path to Excel file
     */
    private function exportToExcel(array $data, string $exportType): string
    {
        $spreadsheet = new Spreadsheet();
        $worksheet = $spreadsheet->getActiveSheet();

        if (empty($data)) {
            // Create empty template with just headers
            $filename = "hr_export_{$exportType}_" . date('Ymd_His') . '.xlsx';
            $filepath = sys_get_temp_dir() . '/' . $filename;

            $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
            $writer->save($filepath);

            return $filepath;
        }

        // Write header row
        $header = array_keys($data[0]);
        $columnLetter = 'A';

        foreach ($header as $columnName) {
            $worksheet->setCellValue($columnLetter . '1', $columnName);
            $columnLetter++;
        }

        // Write data rows
        $rowNum = 2;
        foreach ($data as $row) {
            $columnLetter = 'A';
            foreach ($row as $value) {
                $worksheet->setCellValue($columnLetter . $rowNum, $value);
                $columnLetter++;
            }
            $rowNum++;
        }

        // Set column widths
        foreach (range('A', chr(ord('A') + count($header) - 1)) as $col) {
            $worksheet->getColumnDimension($col)->setAutoSize(true);
        }

        // Save file
        $filename = "hr_export_{$exportType}_" . date('Ymd_His') . '.xlsx';
        $filepath = sys_get_temp_dir() . '/' . $filename;

        $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
        $writer->save($filepath);

        return $filepath;
    }
}
