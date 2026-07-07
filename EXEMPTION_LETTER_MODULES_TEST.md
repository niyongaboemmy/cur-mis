# Exemption Letter Modules - Testing Guide

## Quick Test Script

### 1. Verify Database Indexes Exist

```sql
-- Connect to curac_save database
USE curac_save;

-- Check if indexes exist
SHOW INDEX FROM modules WHERE Key_name LIKE 'idx_modules%';

-- Expected output:
-- | Table  | Non_unique | Key_name                           | Seq_in_index | Column_name | Collation | ... |
-- | modules|          1 | idx_modules_code                   |            1 | module_code | A         | ... |
-- | modules|          1 | idx_modules_department_level_status|            1 | department  | A         | ... |
-- | modules|          1 | idx_modules_department_level_status|            2 | level       | A         | ... |
-- | modules|          1 | idx_modules_department_level_status|            3 | status      | A         | ... |
-- | modules|          1 | idx_modules_department_status      |            1 | department  | A         | ... |
-- | modules|          1 | idx_modules_department_status      |            2 | status      | A         | ... |
```

### 2. Test Single Department Query

```sql
-- Find a department ID with modules
SELECT DISTINCT department, COUNT(*) as count
FROM modules
WHERE status = 'active'
GROUP BY department
LIMIT 1;

-- Run optimized query (replace 5 with actual department_id)
SELECT 
    m.module_id,
    m.module_code,
    m.module_name,
    m.module_credits,
    m.department,
    m.level,
    m.status
FROM modules m
WHERE m.department = 5
AND m.status = 'active'
ORDER BY m.module_code ASC;

-- Expected: Returns all active modules for department 5
```

### 3. Test Multiple Departments Query

```sql
-- Query with multiple departments
SELECT 
    m.module_id,
    m.module_code,
    m.module_name,
    m.module_credits,
    m.department,
    m.level,
    m.status
FROM modules m
WHERE m.department IN (1, 2, 3)
AND m.status = 'active'
ORDER BY m.module_code ASC;

-- Expected: Returns all active modules across the 3 departments
```

### 4. Check Query Performance

```sql
-- Analyze index usage
EXPLAIN 
SELECT 
    m.module_id,
    m.module_code,
    m.module_name,
    m.module_credits
FROM modules m
WHERE m.department = 5
AND m.status = 'active';

-- Expected output should show:
-- - type: ref (not All)
-- - possible_keys: idx_modules_department_status
-- - key: idx_modules_department_status
-- - rows: small number (not full table scan)
```

## API Endpoint Tests

### Test 1: Single Department (Working Case)

```bash
curl -X GET "http://localhost:5173/umis/api/documents/exemption-letter/modules?department=5" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Modules for exemption letter fetched.",
  "data": {
    "data": [
      {
        "module_id": 1,
        "module_code": "CS101",
        "module_name": "Introduction to Computer Science",
        "module_credits": 3,
        "department": 5,
        "level": 1,
        "status": "active"
      }
    ],
    "total": 42,
    "per_page": 42,
    "current_page": 1,
    "last_page": 1
  }
}
```

### Test 2: Multiple Departments

```bash
curl -X GET "http://localhost:5173/umis/api/documents/exemption-letter/modules?department=1,2,3" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

**Expected Response:** Same structure with modules from all 3 departments combined

### Test 3: Invalid Department (Error Case)

```bash
curl -X GET "http://localhost:5173/umis/api/documents/exemption-letter/modules?department=invalid" \
  -H "Accept: application/json"
```

**Expected Response:**
```json
{
  "success": false,
  "message": "At least one valid department ID is required.",
  "data": null,
  "status_code": 422
}
```

### Test 4: No Department Parameter (Error Case)

```bash
curl -X GET "http://localhost:5173/umis/api/documents/exemption-letter/modules" \
  -H "Accept: application/json"
```

**Expected Response:**
```json
{
  "success": false,
  "message": "At least one valid department ID is required.",
  "data": null,
  "status_code": 422
}
```

### Test 5: Empty Department (Error Case)

```bash
curl -X GET "http://localhost:5173/umis/api/documents/exemption-letter/modules?department=" \
  -H "Accept: application/json"
```

**Expected Response:**
```json
{
  "success": false,
  "message": "At least one valid department ID is required.",
  "data": null,
  "status_code": 422
}
```

## Browser Testing (UI)

### Setup

1. Open Chrome DevTools (F12)
2. Go to Network tab
3. Filter by XHR/Fetch requests

### Test Steps

1. **Navigate to Exemption Letter**
   - Go to Student Profile
   - Click "Generate Exemption Letter"
   - Modal should open with "Loading modules…" message

2. **Verify API Call**
   - Check Network tab
   - Look for request to: `/api/documents/exemption-letter/modules?department=X`
   - Should see 200 status and JSON response

3. **Check Module Dropdown**
   - Wait for loading to finish
   - Module dropdown should be populated
   - Should show modules from the student's department
   - Modules should be sorted by code (CS101, CS102, etc.)

4. **Test Module Selection**
   - Select a module from dropdown
   - Level should auto-fill
   - Should be able to add another row
   - Should be able to generate preview

## Performance Testing

### Load Test Query

```sql
-- Time how long a query takes
SELECT COUNT(*) FROM modules WHERE department = 5 AND status = 'active';

-- Then time with EXPLAIN
EXPLAIN
SELECT m.module_id, m.module_code, m.module_name, m.module_credits, m.department, m.level, m.status
FROM modules m
WHERE m.department = 5 AND m.status = 'active';

-- Expected: < 50ms query time even with 10K+ modules
```

### Index Efficiency

```sql
-- See if index is being used
EXPLAIN FORMAT=JSON
SELECT m.module_id, m.module_code, m.module_name
FROM modules m
WHERE m.department IN (1, 2, 3) AND m.status = 'active'
ORDER BY m.module_code ASC;

-- Look for:
-- - "using_index": true (ideally)
-- - "rows": small number
-- - "type": "ref" or "range"
```

## PHP Unit Tests (Optional)

```php
<?php
// tests/Controllers/DocumentControllerTest.php

use App\Controllers\DocumentController;
use App\Models\ModuleModel;
use PHPUnit\Framework\TestCase;

class DocumentControllerExemptionLetterTest extends TestCase
{
    public function testExemptionLetterModulesSingleDepartment()
    {
        $moduleModel = new ModuleModel();
        $modules = $moduleModel->getModulesForExemptionLetter(5);
        
        $this->assertIsArray($modules);
        $this->assertNotEmpty($modules);
        
        foreach ($modules as $module) {
            $this->assertEquals(5, $module['department']);
            $this->assertEquals('active', $module['status']);
            $this->assertArrayHasKey('module_id', $module);
            $this->assertArrayHasKey('module_code', $module);
        }
    }
    
    public function testExemptionLetterModulesMultipleDepartments()
    {
        $moduleModel = new ModuleModel();
        $modules = $moduleModel->getModulesForExemptionLetter([1, 2, 3]);
        
        $this->assertIsArray($modules);
        
        $departments = array_unique(array_map(fn($m) => $m['department'], $modules));
        $this->assertTrue(in_array(1, $departments) || in_array(2, $departments) || in_array(3, $departments));
    }
    
    public function testExemptionLetterModulesEmptyDepartments()
    {
        $moduleModel = new ModuleModel();
        $modules = $moduleModel->getModulesForExemptionLetter([]);
        
        $this->assertIsArray($modules);
        $this->assertEmpty($modules);
    }
}
```

## Troubleshooting

### Problem: Module dropdown shows "No modules found"

**Solution:**
1. Verify student has a valid department_id
2. Check database has modules for that department:
   ```sql
   SELECT COUNT(*) FROM modules WHERE department = X AND status = 'active';
   ```
3. Verify indexes exist
4. Check browser console for API errors (F12)

### Problem: API returns 422 error

**Solution:**
1. Check department parameter is numeric: `?department=5`
2. Don't use text department names: `?department=Department of CS` ❌
3. For multiple departments, use comma-separated: `?department=1,2,3` ✓

### Problem: Slow module loading (> 1 second)

**Solution:**
1. Run EXPLAIN on the query to verify index usage
2. Rebuild index: `REBUILD INDEX idx_modules_department_status ON modules;`
3. Run ANALYZE: `ANALYZE TABLE modules;`

### Problem: Module level not auto-filling

**Solution:**
1. Check selected module has a `level` value in database
2. Verify modal receives module object with level field
3. Check browser console for JavaScript errors (F12)

## Deployment Verification Checklist

- [ ] Run SQL migration successfully
- [ ] Verify 3 new indexes exist
- [ ] Test API endpoint with single department
- [ ] Test API endpoint with multiple departments
- [ ] Test API error cases
- [ ] Verify exemption letter modal works in UI
- [ ] Module dropdown populated correctly
- [ ] Level auto-fills when module selected
- [ ] Can add multiple rows
- [ ] Can generate preview
- [ ] Can download PDF
- [ ] No console errors in browser
- [ ] Monitor error logs for issues
- [ ] Check query performance (< 100ms)

## Contact & Support

If you encounter issues:
1. Check this guide first
2. Review the EXEMPTION_LETTER_MODULES_REFACTOR.md document
3. Check application error logs
4. Verify database migration was applied
