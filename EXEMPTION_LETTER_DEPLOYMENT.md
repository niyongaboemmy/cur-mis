# Exemption Letter Feature - Deployment Guide

## Quick Start

The exemption letter feature is now fully integrated into the document generation system. Here's what you need to do:

## Step 1: Run the Database Migration

Run migration 089 to create the `exemption_modules` table:

```bash
# Via command line
mysql -u curac_save -p'curac_save' cur-mis < backend/database/migrations/2026_07_02_089_add_exemption_letter_support.sql

# Or copy-paste the SQL from the migration file into your MySQL client
```

## Step 2: Verify the Feature Works

1. **Check the table was created:**
   ```sql
   SHOW TABLES LIKE 'exemption_modules';
   ```

2. **Log in as a registrar** with `GENERATE_DOCUMENTS` permission

3. **Navigate to:** Documents → Generate Documents

4. **You should see:** "Exemption Letter" card in the Available Documents section

5. **Test it:**
   - Select any student
   - Click "Preview" on the Exemption Letter card
   - The letter should display with a placeholder message (no data yet)

## Step 3: Add Exemption Data (Optional)

To populate the exemption letter with actual transferred modules:

```sql
INSERT INTO exemption_modules (
  student_id, 
  module_code, 
  module_title, 
  level, 
  credits, 
  marks, 
  institution_name
) VALUES 
  (
    1, 
    'BSC1512', 
    'Behavioral Sciences', 
    'L8 S1&2', 
    10, 
    59.5, 
    'INES RUHENGERI'
  ),
  (
    1, 
    'ITC1511', 
    'Information Technology and Computer Skills', 
    'L8 S1&2', 
    5, 
    57, 
    'INES RUHENGERI'
  ),
  (
    1, 
    'BCG1513', 
    'Biochemistry & Cell Biology and Genetics', 
    'L8 S1&2', 
    15, 
    65, 
    'INES RUHENGERI'
  );
```

Replace `student_id` with the actual student ID and fill in the transferred modules data.

## Features Included

✅ **Automatic Exemption Letter Generation**
- Select student → Click Generate → Get PDF
- Professional layout with CUR letterhead
- Transferred modules table with details
- QR code for verification

✅ **Database Support**
- Stores transferred module information
- Tracks credits, marks, and prior institution
- Linked to student records

✅ **Permissions**
- Uses existing `GENERATE_DOCUMENTS` permission
- Only registrars can generate these documents

✅ **Professional Formatting**
- Matches other CUR official documents
- Includes signature block
- QR code for authenticity

## Troubleshooting

### "Exemption Letter" option not showing
- Verify migration 089 ran successfully
- Clear browser cache
- Log out and log back in

### No data shows in the letter
- Add exemption module data using the SQL INSERT statement above
- Verify student_id matches actual students in the system
- Check that data is in the `exemption_modules` table

### PDF generation fails
- Ensure DOMPDF library is installed in the backend
- Check error logs for PHP errors
- Verify student exists in the system

## Integration Points

This feature integrates with:
- **Document Generation System** - existing framework handles all PDF generation
- **Permissions System** - uses GENERATE_DOCUMENTS permission
- **Student System** - pulls student data via foreign key relationship
- **Frontend UI** - displays in document cards alongside other documents

## API Endpoints

- **Preview:** `GET /api/documents/preview?student_id=123&document_type=exemption_letter&token=XXX`
- **Download:** `GET /api/documents/download?student_id=123&document_type=exemption_letter&token=XXX`

## Notes for Future Development

1. **Auto-population:** Could connect to student applications workflow to auto-populate transferred modules
2. **Bulk Generation:** Could add batch generation for multiple students
3. **Approval Workflow:** Could add approval step before letter is issued
4. **Multiple Institutions:** Currently supports one set of transfers per student
5. **Filtering:** Registrars could selectively include/exclude modules in the letter

## Testing Checklist

- [ ] Migration 089 runs without errors
- [ ] `exemption_modules` table exists with correct structure
- [ ] Registrar can access Documents > Generate Documents
- [ ] Exemption Letter card appears in available documents
- [ ] Can preview exemption letter for students with exemption data
- [ ] PDF downloads successfully
- [ ] Letter displays student information correctly
- [ ] Transferred modules table shows data
- [ ] QR code is visible
- [ ] Layout matches other CUR documents

## Contact

If you encounter any issues, check the error logs or contact the development team.
