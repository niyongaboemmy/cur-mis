# Exemption Letter Document Generation Feature

## Overview
Added automatic exemption letter generation to the Document Generation system. Registrars can now generate official exemption letters for students who have transferred credits from prior institutions.

## Changes Made

### 1. Frontend Changes

#### `frontend/src/services/documentService.ts`
- Added `'exemption_letter'` to the `DocumentType` union type
- This enables the API service to handle exemption letter requests

#### `frontend/src/pages/DocumentGenerationPage.tsx`
- Added exemption letter to the `DOCUMENT_TYPES` array with:
  - Key: `exemption_letter`
  - Label: "Exemption Letter"
  - Description: "Official letter detailing transferred credits from prior institution with exemption status and grading information."
- The exemption letter card now appears in the document generation UI alongside other document types

### 2. Backend Changes

#### `backend/app/Controllers/DocumentController.php`
- Added `'exemption_letter'` to the `ALLOWED_TYPES` constant
- Added exemption letter handling in the `preview()` method (match statement)
- Added exemption letter handling in the `download()` method with filename `Exemption_Letter_{regnum}.pdf`

#### `backend/app/Helpers/DocumentHelper.php`
- Added `fetchTransferredModules()` method to retrieve transferred module data from the database
- Added `buildExemptionLetter()` method that generates the HTML for exemption letters with:
  - Student information (name, registration number, faculty, department, level)
  - Table showing transferred modules with columns: Module Title, Level, Transferred Credits, Marks
  - Total credits calculation
  - QR code for verification
  - Professional letterhead with CUR branding
  - Dean's signature and date

### 3. Database Migration

#### `backend/database/migrations/2026_07_02_089_add_exemption_letter_support.sql`
- Creates `exemption_modules` table to store transferred module data
- Columns:
  - `id` (primary key)
  - `student_id` (foreign key to student table)
  - `module_code` (course code from prior institution)
  - `module_title` (course title)
  - `level` (L8, S1&2, S3&4, etc.)
  - `credits` (transferable credits)
  - `marks` (grade/percentage from prior institution)
  - `institution_name` (prior university name)
  - `created_at`, `updated_at` (timestamps)
- Includes indexes on `student_id` and `level` for efficient querying

## Usage

### For Registrars
1. Navigate to **Documents → Generate Documents**
2. Select a student using the search box
3. In the Available Documents section, find "Exemption Letter"
4. Click **Preview** to see how the letter will look
5. Click **Generate** to download the PDF

### For Developers
To populate exemption letter data:

```sql
INSERT INTO exemption_modules (
  student_id, 
  module_code, 
  module_title, 
  level, 
  credits, 
  marks, 
  institution_name
) VALUES (
  123, 
  'BSC1512', 
  'Behavioral Sciences', 
  'L8 S1&2', 
  10, 
  59.5, 
  'INES RUHENGERI'
);
```

## Document Format

The exemption letter includes:
- CUR letterhead with logo and contact information
- "EXEMPTION LETTER" title
- Student details (name, registration number, faculty, department, level)
- Introductory text explaining the exemption
- Table of transferred modules with:
  - Module number
  - Module title and code
  - Level
  - Transferred credits
  - Marks received
- Total transferred credits summary
- Note about total program credits
- Dean's signature block with date
- QR code for document verification
- Professional styling matching other CUR documents

## Future Enhancements

1. **Data Integration**: Connect to student applications or credit transfer workflows to auto-populate transferred modules
2. **Multiple Institutions**: Support tracking modules from multiple prior institutions
3. **Filtering**: Allow registrars to select which modules to include in the letter
4. **Approval Workflow**: Add approval step for transferred credits before letter generation
5. **Batch Generation**: Generate exemption letters for multiple students at once

## Testing

To test the feature:
1. Ensure migration 089 is run: `migration 2026_07_02_089_add_exemption_letter_support.sql`
2. Add test data to `exemption_modules` table
3. Select a student with exemption data
4. Generate and preview the exemption letter
5. Verify PDF renders correctly with all module data

## Permissions

The exemption letter uses the existing `GENERATE_DOCUMENTS` permission. Users must have this permission assigned to their role to access document generation.

## Files Modified
- `frontend/src/services/documentService.ts`
- `frontend/src/pages/DocumentGenerationPage.tsx`
- `backend/app/Controllers/DocumentController.php`
- `backend/app/Helpers/DocumentHelper.php`
- `backend/database/migrations/2026_07_02_089_add_exemption_letter_support.sql` (new)
