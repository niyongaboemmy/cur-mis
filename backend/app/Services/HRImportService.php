<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\UserModel;
use App\Models\EmployeeProfileModel;
use App\Models\EmployeeQualificationsModel;
use App\Models\EmployeeFinancialInfoModel;
use App\Helpers\ValidationHelper;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Exception;

/**
 * HR Import Service
 *
 * Handles CSV/Excel file uploads for HR data with validation,
 * duplicate detection, and error reporting.
 */
class HRImportService
{
    private UserModel $userModel;
    private EmployeeProfileModel $profileModel;
    private EmployeeQualificationsModel $qualificationsModel;
    private EmployeeFinancialInfoModel $financialModel;

    public function __construct()
    {
        $this->userModel = new UserModel();
        $this->profileModel = new EmployeeProfileModel();
        $this->qualificationsModel = new EmployeeQualificationsModel();
        $this->financialModel = new EmployeeFinancialInfoModel();
    }

    /**
     * Validate and preview import file before actual import
     *
     * @param string $filePath Path to uploaded file
     * @param string $importType Type of import (employees, payroll, leave, contracts, certificates)
     * @return array Validation result with errors, warnings, and preview
     */
    public function validateImport(string $filePath, string $importType): array
    {
        try {
            $spreadsheet = IOFactory::load($filePath);
            $worksheet = $spreadsheet->getActiveSheet();
            $rows = $worksheet->toArray();

            if (empty($rows)) {
                return [
                    'valid' => false,
                    'errors' => ['File is empty'],
                    'warnings' => [],
                    'preview' => []
                ];
            }

            // Get template based on import type
            $template = $this->getImportTemplate($importType);
            $headerRow = $rows[0];

            // Validate headers
            $headerErrors = $this->validateHeaders($headerRow, $template);
            if (!empty($headerErrors)) {
                return [
                    'valid' => false,
                    'errors' => $headerErrors,
                    'warnings' => [],
                    'preview' => []
                ];
            }

            // Validate data rows
            $validationResult = $this->validateRows($rows, $template, $importType);

            return $validationResult;

        } catch (Exception $e) {
            return [
                'valid' => false,
                'errors' => ['File parsing error: ' . $e->getMessage()],
                'warnings' => [],
                'preview' => []
            ];
        }
    }

    /**
     * Get import template with column definitions
     *
     * @param string $importType
     * @return array
     */
    private function getImportTemplate(string $importType): array
    {
        $templates = [
            'employees' => [
                'columns' => [
                    'staff_id' => ['required' => true, 'type' => 'string'],
                    'full_name' => ['required' => true, 'type' => 'string'],
                    'email' => ['required' => true, 'type' => 'email'],
                    'phone_number' => ['required' => false, 'type' => 'string'],
                    'gender' => ['required' => false, 'type' => 'enum', 'values' => ['Male', 'Female', 'Other', 'Prefer not to say']],
                    'department' => ['required' => true, 'type' => 'string'],
                    'degree' => ['required' => false, 'type' => 'string'],
                    'area_of_specialization' => ['required' => false, 'type' => 'string'],
                    'rssb_number' => ['required' => false, 'type' => 'string'],
                    'bank_account_number' => ['required' => false, 'type' => 'string'],
                    'bank_name' => ['required' => false, 'type' => 'string'],
                    'employment_date' => ['required' => false, 'type' => 'date'],
                ],
                'uniqueFields' => ['staff_id', 'email', 'rssb_number', 'bank_account_number']
            ],
            'payroll' => [
                'columns' => [
                    'staff_id' => ['required' => true, 'type' => 'string'],
                    'full_name' => ['required' => true, 'type' => 'string'],
                    'basic_salary' => ['required' => true, 'type' => 'decimal'],
                    'housing_allowance' => ['required' => false, 'type' => 'decimal'],
                    'transport_allowance' => ['required' => false, 'type' => 'decimal'],
                    'other_allowance' => ['required' => false, 'type' => 'decimal'],
                    'gross_salary' => ['required' => false, 'type' => 'decimal'],
                ],
                'uniqueFields' => ['staff_id']
            ],
            'leave' => [
                'columns' => [
                    'staff_id' => ['required' => true, 'type' => 'string'],
                    'full_name' => ['required' => true, 'type' => 'string'],
                    'leave_type' => ['required' => true, 'type' => 'string'],
                    'start_date' => ['required' => true, 'type' => 'date'],
                    'end_date' => ['required' => true, 'type' => 'date'],
                    'reason' => ['required' => false, 'type' => 'string'],
                ],
                'uniqueFields' => []
            ],
            'contracts' => [
                'columns' => [
                    'staff_id' => ['required' => true, 'type' => 'string'],
                    'full_name' => ['required' => true, 'type' => 'string'],
                    'contract_type' => ['required' => true, 'type' => 'string'],
                    'start_date' => ['required' => true, 'type' => 'date'],
                    'end_date' => ['required' => false, 'type' => 'date'],
                    'position_title' => ['required' => true, 'type' => 'string'],
                ],
                'uniqueFields' => ['staff_id']
            ],
        ];

        return $templates[$importType] ?? [];
    }

    /**
     * Validate file headers match template
     *
     * @param array $headerRow
     * @param array $template
     * @return array Errors found
     */
    private function validateHeaders(array $headerRow, array $template): array
    {
        $errors = [];
        $headerRow = array_map('strtolower', $headerRow);

        // Check required columns
        foreach ($template['columns'] as $columnName => $columnDef) {
            if ($columnDef['required']) {
                $normalized = strtolower($columnName);
                if (!in_array($normalized, $headerRow)) {
                    $errors[] = "Missing required column: {$columnName}";
                }
            }
        }

        return $errors;
    }

    /**
     * Validate all data rows
     *
     * @param array $rows
     * @param array $template
     * @param string $importType
     * @return array
     */
    private function validateRows(array $rows, array $template, string $importType): array
    {
        $errors = [];
        $warnings = [];
        $preview = [];
        $seenUnique = [];

        // Get column indexes from header
        $headerRow = array_map('strtolower', $rows[0]);
        $columnMap = array_flip($headerRow);

        // Validate each data row
        for ($i = 1; $i < count($rows); $i++) {
            $row = $rows[$i];
            $rowNum = $i + 1; // Line number for users (starting from 1)
            $rowErrors = [];

            // Skip empty rows
            if (array_filter($row) === array_filter(array_fill(0, count($row), null))) {
                continue;
            }

            // Validate each column
            foreach ($template['columns'] as $columnName => $columnDef) {
                $colIndex = $columnMap[strtolower($columnName)] ?? null;

                if ($colIndex === null) {
                    continue;
                }

                $value = $row[$colIndex] ?? '';

                // Check required
                if ($columnDef['required'] && empty($value)) {
                    $rowErrors[] = "{$columnName} is required";
                    continue;
                }

                // Skip validation if empty and not required
                if (empty($value)) {
                    continue;
                }

                // Type validation
                switch ($columnDef['type']) {
                    case 'email':
                        if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
                            $rowErrors[] = "{$columnName} is not a valid email";
                        }
                        break;
                    case 'date':
                        if (!$this->isValidDate($value)) {
                            $rowErrors[] = "{$columnName} is not a valid date (use YYYY-MM-DD)";
                        }
                        break;
                    case 'decimal':
                    case 'numeric':
                        if (!is_numeric($value)) {
                            $rowErrors[] = "{$columnName} must be numeric";
                        }
                        break;
                    case 'enum':
                        if (!in_array($value, $columnDef['values'])) {
                            $rowErrors[] = "{$columnName} must be one of: " . implode(', ', $columnDef['values']);
                        }
                        break;
                }
            }

            // Check for duplicates
            foreach ($template['uniqueFields'] as $field) {
                $colIndex = $columnMap[strtolower($field)] ?? null;
                if ($colIndex !== null && !empty($row[$colIndex])) {
                    $value = $row[$colIndex];
                    $key = "{$field}:{$value}";

                    if (isset($seenUnique[$key])) {
                        $rowErrors[] = "Duplicate {$field}: {$value} (also appears on line {$seenUnique[$key]})";
                    } else {
                        $seenUnique[$key] = $rowNum;
                    }
                }
            }

            // Check for existing records in database
            if ($importType === 'employees') {
                $staffIdCol = $columnMap['staff_id'] ?? null;
                if ($staffIdCol !== null && !empty($row[$staffIdCol])) {
                    $existing = $this->userModel->findByUsername($row[$staffIdCol]);
                    if ($existing) {
                        $warnings[] = "Line {$rowNum}: Staff {$row[$staffIdCol]} already exists (will update)";
                    }
                }
            }

            if (!empty($rowErrors)) {
                foreach ($rowErrors as $error) {
                    $errors[] = "Line {$rowNum}: {$error}";
                }
            } else {
                // Add to preview if no errors
                $preview[] = array_combine($headerRow, $row);
            }
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
            'warnings' => $warnings,
            'preview' => array_slice($preview, 0, 5) // Show first 5 valid rows
        ];
    }

    /**
     * Check if string is a valid date
     *
     * @param string $date
     * @return bool
     */
    private function isValidDate(string $date): bool
    {
        $formats = ['Y-m-d', 'Y/m/d', 'm/d/Y', 'd/m/Y'];

        foreach ($formats as $format) {
            $parsed = \DateTime::createFromFormat($format, $date);
            if ($parsed && $parsed->format($format) === $date) {
                return true;
            }
        }

        return false;
    }

    /**
     * Generate import template file
     *
     * @param string $importType
     * @return string Path to generated file
     */
    public function generateTemplate(string $importType): string
    {
        $template = $this->getImportTemplate($importType);
        $spreadsheet = new Spreadsheet();
        $worksheet = $spreadsheet->getActiveSheet();

        // Add header row with formatting
        $columnLetter = 'A';
        $headerRow = array_keys($template['columns']);

        foreach ($headerRow as $columnName) {
            $worksheet->setCellValue($columnLetter . '1', $columnName);
            $columnLetter++;
        }

        // Add sample row with instructions
        $sampleData = [];
        foreach ($template['columns'] as $columnName => $columnDef) {
            if ($columnDef['required']) {
                $sampleData[] = "[Required] Example value";
            } else {
                $sampleData[] = "[Optional] Example value";
            }
        }

        $columnLetter = 'A';
        foreach ($sampleData as $value) {
            $worksheet->setCellValue($columnLetter . '2', $value);
            $columnLetter++;
        }

        // Set column widths
        foreach (range('A', chr(ord('A') + count($headerRow) - 1)) as $col) {
            $worksheet->getColumnDimension($col)->setAutoSize(true);
        }

        // Save file
        $filename = "hr_import_template_{$importType}_" . date('Ymd_His') . '.xlsx';
        $filepath = sys_get_temp_dir() . '/' . $filename;

        $writer = IOFactory::createWriter($spreadsheet, 'Xlsx');
        $writer->save($filepath);

        return $filepath;
    }

    /**
     * Import validated data
     *
     * @param string $filePath
     * @param string $importType
     * @param int $actorId User performing the import
     * @return array Import result summary
     */
    public function importData(string $filePath, string $importType, int $actorId): array
    {
        $spreadsheet = IOFactory::load($filePath);
        $worksheet = $spreadsheet->getActiveSheet();
        $rows = $worksheet->toArray();

        $imported = 0;
        $updated = 0;
        $failed = 0;
        $errors = [];

        $headerRow = array_map('strtolower', $rows[0]);
        $columnMap = array_flip($headerRow);

        // Process each row
        for ($i = 1; $i < count($rows); $i++) {
            $row = $rows[$i];
            $rowNum = $i + 1;

            // Skip empty rows
            if (array_filter($row) === array_filter(array_fill(0, count($row), null))) {
                continue;
            }

            try {
                $this->importRow($row, $columnMap, $importType);
                $imported++;
            } catch (Exception $e) {
                $failed++;
                $errors[] = "Line {$rowNum}: " . $e->getMessage();
            }
        }

        return [
            'success' => true,
            'imported' => $imported,
            'updated' => $updated,
            'failed' => $failed,
            'errors' => $errors
        ];
    }

    /**
     * Import a single row of data
     *
     * @param array $row
     * @param array $columnMap
     * @param string $importType
     * @throws Exception
     */
    private function importRow(array $row, array $columnMap, string $importType): void
    {
        switch ($importType) {
            case 'employees':
                $this->importEmployeeRow($row, $columnMap);
                break;
            case 'payroll':
                $this->importPayrollRow($row, $columnMap);
                break;
            case 'leave':
                $this->importLeaveRow($row, $columnMap);
                break;
            case 'contracts':
                $this->importContractRow($row, $columnMap);
                break;
            default:
                throw new Exception("Unknown import type: {$importType}");
        }
    }

    /**
     * Import employee row
     *
     * @param array $row
     * @param array $columnMap
     * @throws Exception
     */
    private function importEmployeeRow(array $row, array $columnMap): void
    {
        $staffId = $row[$columnMap['staff_id']] ?? null;
        if (!$staffId) {
            throw new Exception("Staff ID is required");
        }

        // Check if employee exists
        $existing = $this->userModel->findByUsername($staffId);

        $data = [
            'username' => $staffId,
            'full_name' => $row[$columnMap['full_name']] ?? '',
            'email' => $row[$columnMap['email']] ?? '',
            'phone_number' => $row[$columnMap['phone_number']] ?? null,
            'gender' => $row[$columnMap['gender']] ?? null,
            'degree' => $row[$columnMap['degree']] ?? null,
            'area_of_specialization' => $row[$columnMap['area_of_specialization']] ?? null,
            'rssb_number' => $row[$columnMap['rssb_number']] ?? null,
            'employment_date' => $row[$columnMap['employment_date']] ?? null,
        ];

        if ($existing) {
            $this->userModel->update($existing['id'], $data);
        } else {
            $this->userModel->create($data);
        }

        // Update financial info if provided
        $userId = $existing['id'] ?? $this->userModel->findByUsername($staffId)['id'];
        if ($userId) {
            $financialData = [
                'user_id' => $userId,
                'rssb_number' => $row[$columnMap['rssb_number']] ?? null,
                'bank_name' => $row[$columnMap['bank_name']] ?? null,
                'bank_account_number' => $row[$columnMap['bank_account_number']] ?? null,
            ];

            $existing_financial = $this->financialModel->findByUserId($userId);
            if ($existing_financial) {
                $this->financialModel->update($existing_financial['id'], $financialData);
            } else {
                $this->financialModel->create($financialData);
            }
        }
    }

    /**
     * Placeholder for payroll import
     *
     * @param array $row
     * @param array $columnMap
     */
    private function importPayrollRow(array $row, array $columnMap): void
    {
        // TODO: Implement payroll import
    }

    /**
     * Placeholder for leave import
     *
     * @param array $row
     * @param array $columnMap
     */
    private function importLeaveRow(array $row, array $columnMap): void
    {
        // TODO: Implement leave import
    }

    /**
     * Placeholder for contract import
     *
     * @param array $row
     * @param array $columnMap
     */
    private function importContractRow(array $row, array $columnMap): void
    {
        // TODO: Implement contract import
    }
}
