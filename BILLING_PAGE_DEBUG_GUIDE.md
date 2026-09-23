# 🔍 Billing Page Debug Guide

**Status:** Production deployed with debug logging  
**Commit:** 5c5628d  
**Issue:** Students not displaying (showing "No students found")

---

## 📋 Troubleshooting Steps

### **Step 1: Check Browser Console (F12)**

1. Open: https://cur.ac.rw/umis/finance/billing
2. Press: `F12` (Developer Tools)
3. Click: **Console** tab
4. Look for message starting with: `📊 Billing Page Loaded`

**Example output:**
```javascript
📊 Billing Page Loaded {
  studentState: "all",
  debouncedKeyword: "",
  page: 1,
  isLoading: false,
  studentCount: 0,
  totalItems: 0,
  apiError: "..."
}
```

### **Step 2: Check Network Tab**

1. Press: `F12` (Developer Tools)
2. Click: **Network** tab
3. Reload page: `F5`
4. Look for: `all-students` API call
5. Click on it and check:
   - **Response** tab → see returned JSON
   - **Status** → should be 200 (green)
   - Look for error messages

**What to check:**
```
URL: /api/finance/billing/all-students
Method: GET
Status: 200 (should be green)
Response: Should contain student data
```

### **Step 3: Database Query Test**

If API returns empty:

```sql
-- Count total students
SELECT COUNT(*) as total_students FROM student;

-- Count active students
SELECT COUNT(*) as active_students FROM student WHERE student_state = 'active';

-- Get sample students
SELECT student_id, fname, lname, student_state, intake FROM student LIMIT 10;

-- Check if any invoices exist
SELECT COUNT(*) as total_invoices FROM fee_invoices;

-- Check fee types exist
SELECT * FROM fee_types LIMIT 5;
```

---

## 🎯 Common Issues & Fixes

### **Issue: "No students found" but database has students**

**Cause 1:** API endpoint not returning data  
**Fix:** Check `/api/finance/billing/all-students` endpoint response

**Cause 2:** Student status filter blocking results  
**Fix:** Dropdown should show "All Students" by default - check it's set correctly

**Cause 3:** No fee invoices created for students  
**Fix:** Generate invoices first:
```php
POST /api/finance/billing/bulk-generate
{
  "student_ids": ["student_id_1", "student_id_2"],
  "academic_year_id": 1
}
```

**Cause 4:** API credentials/permissions issue  
**Fix:** Check user is logged in as Superadmin or has Finance permission

---

## 🔧 Quick Fixes

### **Fix 1: Change Student Status Filter**

Current: Dropdown set to "Active"  
Try: Click dropdown → Select "All Students"

### **Fix 2: Clear Cache**

```
Ctrl+Shift+Delete → Clear all time → Cached images/files
Then reload page
```

### **Fix 3: Force API Call**

Open browser console (F12 → Console):
```javascript
// Force refresh the student data
// (this will trigger a new API request)
location.reload();
```

---

## 📊 Expected Data Flow

```
1. Page loads
   ↓
2. React Query calls /api/finance/billing/all-students?state=all
   ↓
3. Backend FeeService.getAllStudentsWithFinancialData()
   ↓
4. Query student table + JOINs fee data
   ↓
5. Return {data: [...students], total: N}
   ↓
6. Display in table
```

---

## ✅ Data Requirements

For students to display, you need:

1. ✅ **Student records** in `student` table
2. ✅ **Fee types** in `fee_types` table (optional - for invoicing)
3. ✅ **Fee rates** in `fee_rates` table (optional - for invoicing)
4. ✅ **Fee structures** in relevant tables (optional - for invoicing)

**Minimum required:** Just students in the database

---

## 🚀 Next Steps

### **If console shows data:**
- Problem is in the UI rendering
- Check browser compatibility

### **If console shows error:**
- Error message will tell you the issue
- Share error message in GitHub issue

### **If API returns 0 students:**
- Check database has student records
- Verify permissions (user needs VIEW_FINANCE)
- Check SQL directly on database

---

## 📞 Reporting Issues

When opening a bug report, include:
1. Screenshot of console output (F12 → Console)
2. Network tab response (F12 → Network → all-students → Response)
3. SQL query results showing student count
4. Any error messages visible

---

**Generated:** 2026-08-21  
**Version:** debug-v1  
**Status:** Troubleshooting in progress
