# Registrar Document Generation - Production Deployment Guide

**Issue:** Registrar users cannot see the "Generate Documents" feature in the sidebar online.  
**Root Cause:** Missing database permission assignment  
**Solution:** Run migration and rebuild frontend

---

## What Was Fixed

### 1. Database Migration (Already Committed)
**File:** `backend/database/migrations/2026_07_02_088_enable_registrar_document_generation.sql`

This migration:
- ✅ Seeds the `GENERATE_DOCUMENTS` permission in the database
- ✅ Assigns it to `superadmin`, `admin`, and `registrar` roles
- ✅ Is fully idempotent (safe to re-run)

### 2. Frontend Sidebar Update (Already Committed)
**File:** `frontend/src/layouts/MainLayout.tsx` (line 149)

This change:
- ✅ Ensures "Students" menu group is visible when registrar has `GENERATE_DOCUMENTS`
- ✅ Displays "Generate Documents" as a child menu item
- ✅ Applies proper permission checks

---

## Production Deployment Steps

### Step 1: Deploy Code Changes
```bash
cd /path/to/cur-mis
git pull origin main
# Latest commits should include:
# - 1ec2b24: Enable Registrar document generation feature with UI fixes
# - 014a90d: Add registrar deployment summary documentation
# - 1db43b0: Add registrar document generation SQL queries
```

### Step 2: Run Database Migration
**Via Web Interface (Recommended):**
1. Open `http://your-production-server/migrate.php`
2. Click "Run Migration" 
3. Select migration `2026_07_02_088_enable_registrar_document_generation.sql`
4. Confirm execution

**Via Command Line:**
```bash
mysql -u curac_save -p'curac_save' cur-mis < backend/database/migrations/2026_07_02_088_enable_registrar_document_generation.sql
```

### Step 3: Verify Database Changes
```sql
-- Check if GENERATE_DOCUMENTS permission exists
SELECT id, slug, name FROM permissions WHERE slug = 'GENERATE_DOCUMENTS';

-- Check if registrar has the permission
SELECT rp.* FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.name = 'registrar' AND p.slug = 'GENERATE_DOCUMENTS';
```

**Expected Output:**
```
id | slug                | name
9  | GENERATE_DOCUMENTS  | Generate Documents

role_id | permission_id
3       | 9
```

### Step 4: Rebuild Frontend (If Using Build Process)
```bash
cd frontend
npm install
npm run build
# Deploy dist/ folder to production web server
```

Or if using development server with hot reload:
```bash
cd frontend
npm run dev
# Changes will be reflected immediately
```

### Step 5: Clear Browser Cache
- Registrar should clear their browser cache or use Ctrl+Shift+Del
- Close and reopen the browser
- Navigate to the system again

### Step 6: Verify the Feature is Visible

**Check 1: Login as Registrar**
1. Log in with a registrar account
2. Look at the sidebar under "Students" menu
3. Should see: "Generate Documents" as a submenu item

**Check 2: Access the Feature**
1. Click on "Students" → "Generate Documents"
2. Should see the document generation interface with:
   - Student search box
   - 8 document type cards (To Whom Visa, Admission Letter, etc.)
   - Preview and Generate buttons

**Check 3: Test Document Generation**
1. Search for and select a student
2. Click "Preview" on any document
3. Should show PDF preview in modal
4. Click "Generate" should download the PDF

---

## Troubleshooting

### Problem: "Generate Documents" Still Not Visible
**Solution:**
1. Verify migration ran: Check if `GENERATE_DOCUMENTS` permission exists in DB
2. Clear browser cache (Ctrl+Shift+Del)
3. Log out and log back in
4. Check user's role is actually "registrar": `SELECT role_id FROM users WHERE id = ?`
5. Verify role_permissions table: See Step 3 above

### Problem: Permission Error (403 Forbidden) When Accessing /documents/generate
**Cause:** The `GENERATE_DOCUMENTS` permission is not assigned to the user's role  
**Solution:** Run the migration (Step 2)

### Problem: Frontend Still Shows Old Sidebar
**Cause:** Browser cache or old build  
**Solution:**
1. Hard refresh: `Ctrl+Shift+R` (Chrome/Firefox) or `Cmd+Shift+R` (Mac)
2. Clear browser storage: DevTools → Application → Clear Storage
3. Rebuild frontend: `npm run build`

### Problem: Cannot Find Student in Search
**Cause:** Student doesn't exist or search parameter is wrong  
**Solution:**
1. Try searching by registration number (e.g., "STU-2024-001")
2. Try searching by first/last name (e.g., "John Smith")
3. Make sure student exists in the `student` table

---

## Features Available After Fix

Once deployed, registrars can generate these documents:

1. **To Whom For Visa** — Official letter for immigration authority
2. **Admission Letter** — Formal admission confirmation
3. **Student Registration Form** — Official enrolment record
4. **English Proficiency Certificate** — Medium of instruction certificate
5. **Completed Modules Report** — All modules with marks and credits
6. **Bachelor's Degree Certificate** — Official degree award
7. **Postgraduate Diploma Certificate** — PGDE certificate
8. **Undergraduate Degree Certificate** — Undergraduate degree award

---

## Related Files

### Backend
- `backend/routes/api/documents.php` — API endpoints for document operations
- `backend/app/Controllers/DocumentController.php` — Document generation logic
- `backend/app/Helpers/TranscriptPdf.php` — PDF generation helper
- `backend/app/Services/documentService.ts` — Service layer

### Frontend
- `frontend/src/pages/DocumentGenerationPage.tsx` — Main UI component
- `frontend/src/services/documentService.ts` — API client
- `frontend/src/layouts/MainLayout.tsx` — Sidebar navigation (updated)
- `frontend/src/constants/permissions.ts` — Permission definitions

---

## Database Tables Used

- `permissions` — GENERATE_DOCUMENTS permission definition
- `permission_categories` — Document Generation category
- `role_permissions` — Links registrar role to GENERATE_DOCUMENTS
- `student` — Student data
- `departments` — Faculty/School information
- `modules` — Course information
- `module_mark_records` — Student grades and marks
- `academic_years` — Year labels and IDs
- `academic_terms` — Term definitions

---

## Rollback Instructions (If Needed)

If you need to roll back these changes:

### Remove Frontend Changes:
```bash
git revert 1ec2b24
npm run build
```

### Remove Database Permission:
```sql
DELETE FROM role_permissions 
WHERE role_id = (SELECT id FROM roles WHERE name = 'registrar')
  AND permission_id = (SELECT id FROM permissions WHERE slug = 'GENERATE_DOCUMENTS');

DELETE FROM permissions WHERE slug = 'GENERATE_DOCUMENTS';

DELETE FROM permission_categories WHERE name = 'Document Generation';
```

---

## Commits Included

- **1ec2b24** — Enable Registrar document generation feature with UI fixes
- **014a90d** — Add registrar deployment summary documentation  
- **1db43b0** — Add registrar document generation SQL queries

---

## Support Contact

For issues or questions:
1. Check the troubleshooting section above
2. Review the migration file for SQL syntax
3. Check browser console (F12) for frontend errors
4. Review application logs on the server

---

**Status:** ✅ Ready for Production Deployment  
**Last Updated:** July 2, 2026
