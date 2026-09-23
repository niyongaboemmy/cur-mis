# Billing Page Enhancement: Opening Balance & Option Filter

## Overview
Enhanced the Finance Billing page to display student opening balances and filter by study option, providing a complete financial picture from the start of the academic year.

## Changes Made

### Backend Changes

#### 1. **FeeService.php** - Added opening balance support

**Method: `getGroupBillingSummary()`**
- Added `$optionId` parameter extraction from filters
- Added JOIN to `student_opening_balance` table:
  ```sql
  LEFT JOIN `student_opening_balance` sob ON sob.student_id = s.regnumber AND sob.academic_year_id = ?
  ```
- Added `opening_balance` to SELECT clause
- Added condition for option_id filtering: `s.option = ?`
- Updated bindings to include yearId for opening_balance join

**Method: `getAllStudentsWithStatus()`**
- Added `$optionId` parameter extraction
- Added option filter condition
- Added opening_balance JOIN and SELECT
- Updated bindings to include yearId

**Method: `exportBillingSummary()`**
- Updated CSV header to include "Opening Balance"
- Added `opening_balance` to CSV export output

#### 2. **FeeController.php** - Added option_id query parameter support

**Method: `listBillingSummary()`**
- Added `option_id` to filters array

**Method: `listAllStudentsWithStatus()`**
- Added `option_id` to filters array

**Method: `exportBillingSummary()`**
- Added `option_id` to filters array for CSV export

### Frontend Changes

#### StudentBillingPage.tsx - Enhanced UI

**State Management**
- Added `optionId` state variable for option filtering

**Data Fetching**
- Added `optionsQ` query to fetch options based on selected department
- Updated `summaryQ` query key to include `optionId`
- Updated API call to pass `option_id` parameter

**UI Components**
- Added Option filter dropdown after Department filter
- Option dropdown:
  - Disabled when no department is selected
  - Clears when department changes
  - Loads options based on selected department

**Table Display**
- Added "Opening Balance" column between "Department" and "Invoiced" columns
- Opening balance cells display:
  - Orange text for balances > 0 (RWF formatted)
  - Dash (—) for zero balances
  
**Table Headers**
- Updated column headers to include "Opening Balance"

### Database Relationship

The implementation leverages the existing `student_opening_balance` table:
```
student_opening_balance
├── id (Primary Key)
├── student_id (VARCHAR 32) → student.regnumber
├── academic_year_id (INT) → academic_years.id
├── opening_balance (DECIMAL 12,2)
├── payment_type
├── sponsor_name
├── due_amount
├── paid_amount
└── ... other fields
```

## API Endpoints Updated

### GET `/api/finance/billing/summary`
**New Query Parameters:**
- `option_id` (optional, INT): Filter by study option

**Response Enhancement:**
- Student records now include `opening_balance` field

### GET `/api/finance/billing/all-students`
**New Query Parameters:**
- `option_id` (optional, INT): Filter by study option

**Response Enhancement:**
- Student records now include `opening_balance` field

### GET `/api/finance/billing/export`
**New Query Parameters:**
- `option_id` (optional, INT): Filter by study option

**Export Enhancement:**
- CSV now includes "Opening Balance" column
- Column position: 6th (after Department, before Expected)

## User Experience Improvements

1. **Complete Financial View**: Users can now see:
   - Opening Balance (start of year debt/credit)
   - Invoiced Amount (expected revenue)
   - Paid Amount (collected)
   - Bursary Credits (applied)
   - Remaining Balance (outstanding)

2. **Better Filtering**: Users can now filter by:
   - Academic Year
   - Semester/Term (1&2, 3&4, etc.)
   - Faculty
   - Department
   - **Option (NEW)** - Study specialization within department

3. **Enhanced Data Export**: CSV exports now include opening balance for financial reconciliation

## Technical Notes

### SQL Query Optimizations
- Opening balance joined only once per student per year
- Uses COALESCE to handle NULL values (defaults to 0.00)
- Maintains existing performance characteristics with indexed lookup

### Binding Order
The bindings for `getGroupBillingSummary()` are now:
1. yearId (for structure_tuition subquery - first parameter)
2. semester (optional, for structure_tuition if filtering by semester)
3. yearId (for opening_balance LEFT JOIN)
4. yearId (for fee_invoices subquery)
5. semester (optional, for fee_invoices if filtering by semester)
6. where clause bindings (faculty, department, option, keyword)

### Backward Compatibility
- All changes are additive; existing code unaffected
- Opening balance defaults to 0.00 if not found
- Option filter is optional; omitting it includes all options

## Testing Checklist

- [x] PHP syntax validation passed
- [ ] API returns opening_balance in response
- [ ] Option filter dropdown appears and loads correctly
- [ ] Opening balance column displays correctly
- [ ] Opening balance values format properly (RWF)
- [ ] CSV export includes opening balance
- [ ] Option filtering works with other filters
- [ ] Database JOIN performs efficiently

## Files Modified

1. `backend/app/Services/FeeService.php`
   - getGroupBillingSummary() - 3 major changes
   - getAllStudentsWithStatus() - 3 major changes
   - exportBillingSummary() - 1 change

2. `backend/app/Controllers/FeeController.php`
   - listBillingSummary() - 1 change
   - listAllStudentsWithStatus() - 1 change
   - exportBillingSummary() - 1 change

3. `frontend/src/pages/finance/StudentBillingPage.tsx`
   - State management - 1 new state variable
   - Data fetching - 2 new queries, 1 updated query
   - UI components - 2 new filter UI elements
   - Table display - 2 changes (headers + cells)

## Future Enhancements

Potential improvements for future iterations:
- Opening balance variance reports
- Historical opening balance tracking
- Opening balance adjustment workflows
- Mass opening balance import from legacy systems
- Opening balance reconciliation dashboard
