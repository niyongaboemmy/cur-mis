# Finance Billing Page - Usage Guide

## Overview
The enhanced Finance Billing page now displays a complete financial snapshot for each student, including opening balance from the previous academic year, invoiced amounts, payments, bursaries, and remaining balance.

## URL
`https://cur.ac.rw/umis/finance/billing`

## Filters Available

### 1. Academic Year (Required)
- **Purpose**: Select which academic year to view
- **Default**: Current active academic year
- **Example**: "2025/2026"

### 2. Semester/Term (Optional)
- **Purpose**: Filter by semester or term within the academic year
- **Options**:
  - "All terms" (default)
  - "Semester (1&2)" 
  - "Semester (3&4)"
  - Other term configurations as defined in system
- **Impact**: Shows invoices only for selected term

### 3. Faculty (Optional)
- **Purpose**: Filter students by faculty/school
- **Options**: All faculties in the system
- **Cascades to**: Department dropdown becomes available

### 4. Department (Optional)
- **Purpose**: Filter students by department within faculty
- **Requires**: Faculty to be selected first
- **Cascades to**: Option dropdown becomes available

### 5. Option (NEW - Optional)
- **Purpose**: Filter students by study option/specialization
- **Requires**: Department to be selected first
- **Example**: If department is "Computer Science", options might be:
  - "Software Engineering"
  - "Data Science"
  - "Systems Administration"

### 6. Student Search (Optional)
- **Purpose**: Quick search by student name or registration number
- **Placeholder**: "Name or Reg #…"
- **Example**: Type "1CUR24AK09282" or "Mugenzi"
- **Note**: Searches in real-time with 500ms debounce

## Table Columns Explained

| Column | Description | Values |
|--------|-------------|--------|
| **Student** | Student name and registration number | Name (Reg #) |
| **Department** | Department and Faculty names | Department Name / FACULTY NAME |
| **Opening Balance** ⭐ NEW | Unpaid amount from previous year | RWF amount or — (if zero) |
| **Invoiced** | Total fees billed this year | RWF amount with progress bar |
| **Paid** | Amount of fees collected so far | RWF amount in green or — |
| **Bursary** | Bursary credits/scholarships applied | RWF amount in blue or — |
| **Remaining** | Outstanding balance to pay | "Cleared" badge or RWF amount (red/orange) |

## Table Color Coding

### Remaining Balance Colors
- **Green Badge "Cleared"**: All fees paid (or covered by bursary)
- **Orange Badge**: Partial payment (some paid, some remaining)
- **Red Badge**: No payment yet / Full outstanding balance

### Opening Balance Colors
- **Orange Text**: Positive opening balance (student owes from previous year)
- **Dash (—)**: Zero opening balance (no carryover debt)

### Paid Amount Colors
- **Green Text**: Amount > 0 (some payment received)
- **Dash (—)**: No payment yet

## KPI Cards (Top Right)

When no filter is active, the page shows:
- **Expected Revenue**: Total fees invoiced
- **Collected**: Total fees paid
- **Bursary Credits**: Total bursary applied
- **Partial Payments**: Count of students with partial payments
- **Pending Balance**: Outstanding fees
- Other metrics as available

## Bulk Actions

### Generate Invoices for Multiple Students
1. Select checkboxes next to students who need invoices
2. "Select All" checkbox selects entire current page
3. Blue card appears: "Generate Invoices"
4. Click "Generate Now"
5. Confirms: TUITION and other applicable fees will be created

**Note**: Invoices won't overwrite existing invoices for the same student

## Individual Student Actions

For each row, you have two buttons:

### 📥 Download Bill (Green Button)
- Downloads a PDF bill/receipt for the student
- Shows all invoices and payments for the academic year
- Can be printed or emailed to student

### → View Ledger (Arrow Button)
- Opens the student's detailed financial ledger
- Shows transaction history
- Allows viewing/managing individual invoices and payments

## Common Workflows

### Scenario 1: Bill Students by Department
1. Select Academic Year: "2025/2026"
2. Select Faculty: "Faculty of Education"
3. Select Department: "Didactics"
4. All students in Didactics are displayed
5. Check the "Opening Balance" column to see who owes from last year

### Scenario 2: View Partial Payers
1. Select Academic Year: "2025/2026"
2. (No other filters)
3. Status shows "Partial Payments: 145 students | Balance: 15,450,000 RWF"
4. Can see which students are partially paid in the table

### Scenario 3: Find Students with Opening Balance
1. Select Academic Year: "2025/2026"
2. Scroll through table
3. Opening Balance column shows who carried debt from previous year
4. These students should prioritize paying off old debt first

### Scenario 4: Export Billing Summary
1. Set all desired filters
2. Look for "Download" or "Export" button (may be in table header)
3. Exports CSV with all current students + balances including opening balance

## Understanding the Financial Flow

```
Opening Balance (Previous year debt)
         ↓
    +─────────┐
    ↓         ↓
[Invoiced]  [Paid]
    ↓         ↓
    └────┬────┘
         ↓
    [Bursary Applied]
         ↓
    [Remaining Balance]
```

**Example**:
- Opening Balance: 50,000 RWF (owes from last year)
- Invoiced: 400,000 RWF (new charges)
- **Total Owed**: 450,000 RWF
- Paid: 300,000 RWF
- Bursary: 50,000 RWF
- **Remaining**: 100,000 RWF

## Tips & Tricks

1. **Quick Student Search**: Don't need to select Faculty/Department first
2. **Bulk Operations**: Select multiple students with checkboxes for faster processing
3. **PDF Bills**: Great for sending to students or archiving
4. **Excel Analysis**: Download CSV and open in Excel for pivot tables and analysis
5. **Open Bal Verification**: Use Opening Balance column to ensure year-to-year continuity

## Troubleshooting

### "No students found"
- Verify academic year is selected
- Check if department has any active students
- Try widening the filter (remove Option filter)

### Opening Balance shows 0 for everyone
- Opening balance may not be imported for this year
- Check if student_opening_balance table has data for this year
- Contact finance team

### Numbers don't add up
- Verify semester filter is correct (some charges may be semester-specific)
- Check if bursary covers part of invoiced amount
- Check for refunds or adjustments in ledger

## API Information (For Developers)

### Main Endpoint
```
GET /api/finance/billing/all-students
```

### Query Parameters
- `academic_year_id` (required): Academic year ID
- `semester` (optional): Semester ID (1, 2, 3, 4, etc.)
- `faculty_id` (optional): Faculty ID
- `department_id` (optional): Department ID
- `option_id` (optional): Option/specialization ID
- `keyword` (optional): Student search term
- `page` (optional): Page number (default: 1)
- `per_page` (optional): Results per page (default: 50)

### Response Includes
```json
{
  "data": [
    {
      "regnumber": "1CUR24AK09282",
      "fname": "John",
      "lname": "Doe",
      "faculty": "Faculty of Education",
      "department": "Didactics",
      "opening_balance": 50000,
      "total_expected": 400000,
      "total_collected": 300000,
      "total_bursary": 50000,
      "balance": 100000
    }
  ],
  "total": 2345,
  "per_page": 50,
  "current_page": 1,
  "last_page": 47
}
```

## Contact Support
For issues or feature requests related to the billing page, contact:
- Finance Department
- IT Support
- Development Team
