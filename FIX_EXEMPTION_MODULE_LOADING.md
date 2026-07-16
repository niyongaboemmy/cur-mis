# Fix: Exemption Letter Module Loading Issue

## Problem
The exemption letter modal shows "Failed to load modules" error when trying to fetch modules for a student's department.

## Root Causes
Based on the screenshot and database structure, the issue could be:

1. **No modules exist for the department**
   - The student's department has no modules in the `modules` table
   - Department ID mismatch between student record and modules table

2. **Module status issue**
   - Modules exist but have `status != 'active'`
   - Our optimized query filters by `status = 'active'`

3. **Department field type mismatch**
   - Student's `department` field might be storing text instead of numeric ID
   - Example: "Biomedical Laboratory Sciences" instead of "7"

4. **API endpoint error**
   - Department parameter not being sent correctly
   - API returning 422 or 500 error

5. **Missing migration**
   - Optimized indexes not yet created
   - Old query method failing with new parameters

## Diagnostic Steps

### Step 1: Run Diagnostic Query
Execute: `DIAGNOSE_EXEMPTION_MODULES.sql`

This will show:
- All departments and their module counts
- Whether the student's department has modules
- Student's department assignment
- Whether indexes exist

### Step 2: Check Browser Console
Open DevTools (F12 → Console) and look for:
```
❌ Failed to load modules: {message: "...", department: "..."}
```

This shows the exact error and department being sent.

### Step 3: Check API Response
In Network tab (F12 → Network):
1. Filter by XHR requests
2. Click on `/api/documents/exemption-letter/modules` request
3. Check Response tab for error message

## Common Fixes

### Fix 1: Populate Modules for Department
If the diagnostic shows no modules for the department:

```sql
-- Find the department ID
SELECT dep_id FROM departements 
WHERE dep_name LIKE '%Biomedical%';

-- Result might be: 7

-- Create sample modules for department 7
INSERT INTO modules (module_code, module_name, module_credits, department, level, status)
VALUES 
  ('BMS101', 'Introduction to Biomedical Sciences', 3, 7, 1, 'active'),
  ('BMS102', 'Human Anatomy', 4, 7, 1, 'active'),
  ('BMS103', 'Clinical Laboratory Techniques', 4, 7, 2, 'active'),
  ('BMS201', 'Advanced Clinical Biochemistry', 3, 7, 2, 'active'),
  ('BMS202', 'Hematology & Coagulation', 3, 7, 2, 'active');
```

### Fix 2: Set Module Status to Active
If modules exist but are inactive:

```sql
UPDATE modules 
SET status = 'active' 
WHERE department = 7 AND status IS NULL;
```

### Fix 3: Fix Student Department Assignment
If student's department is text instead of ID:

```sql
-- Find department ID for "Biomedical Laboratory Sciences"
SELECT dep_id FROM departements WHERE dep_name = 'Biomedical Laboratory Sciences';
-- Result: 7

-- Update student to use numeric ID
UPDATE student 
SET department = 7 
WHERE regnumber = 'ICUR26AK012082';
```

### Fix 4: Verify API Endpoint
Test the API directly:

```bash
# Get departments available
curl "http://localhost:5173/umis/api/documents/exemption-letter/modules?department=7"

# Should return modules or 422 error with clear message
```

### Fix 5: Apply Database Migration
If indexes don't exist, run:

```bash
mysql -u root -p curac_save < backend/database/migrations/2026_07_07_001_optimize_exemption_letter_modules.sql
```

## Resolution Workflow

1. **Identify the issue**
   ```bash
   # Run diagnostic
   mysql -u root -p < DIAGNOSE_EXEMPTION_MODULES.sql
   ```

2. **Based on results, apply fix**
   - No modules? → Fix 1 (populate modules)
   - Inactive modules? → Fix 2 (set status)
   - Department mismatch? → Fix 3 (fix assignment)
   - API error? → Fix 4 (test API)
   - No indexes? → Fix 5 (apply migration)

3. **Test in UI**
   - Refresh browser (Ctrl+F5 hard refresh)
   - Open exemption letter modal
   - Module dropdown should load

## Example: Complete Fix for Biomedical Lab Sciences

```sql
USE curac_save;

-- Step 1: Find department ID
SET @dept_id = (SELECT dep_id FROM departements 
                WHERE LOWER(dep_name) LIKE '%biomedical%');

-- Step 2: Ensure student has correct department ID
UPDATE student 
SET department = @dept_id 
WHERE regnumber = 'ICUR26AK012082' AND department IS NULL;

-- Step 3: Activate any existing modules for this department
UPDATE modules 
SET status = 'active' 
WHERE department = @dept_id AND (status IS NULL OR status = '');

-- Step 4: Add sample modules if none exist
INSERT INTO modules (module_code, module_name, module_credits, department, level, status)
SELECT 'BMS101', 'Introduction to Biomedical Sciences', 3, @dept_id, 1, 'active'
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE department = @dept_id LIMIT 1);

-- Step 5: Verify
SELECT COUNT(*) as module_count FROM modules 
WHERE department = @dept_id AND status = 'active';
```

## Verification

After applying fix:

```bash
# Test API
curl "http://localhost:5173/umis/api/documents/exemption-letter/modules?department=7" \
  -H "Accept: application/json"

# Should return:
# {
#   "success": true,
#   "message": "Modules for exemption letter fetched.",
#   "data": {
#     "data": [... modules array ...],
#     "total": 5,
#     ...
#   }
# }
```

Then refresh UI and test exemption letter modal.

## Prevention

To prevent this in the future:

1. **Always populate modules** when creating a department
2. **Set status='active'** explicitly for new modules
3. **Use numeric department IDs** in student records
4. **Apply database migration** immediately after code deployment
5. **Test API endpoints** before UI testing

## Files to Check

- `backend/database/migrations/2026_07_07_001_optimize_exemption_letter_modules.sql`
- `backend/app/Controllers/DocumentController.php` (exemptionLetterModules method)
- `backend/app/Models/ModuleModel.php` (getModulesForExemptionLetter method)
- Browser console (F12) for detailed error messages

## Contact

Run the diagnostic and check which of the 5 fixes applies to your situation, then apply the appropriate solution.
