# Frontend Deployment - Manual Instructions

**Status**: Code is complete and correct (Commit 047a590)  
**Issue**: GitHub Actions deployment failing (cPanel credentials likely missing/wrong)  
**Solution**: Manual upload via cPanel File Manager

---

## What Changed

✅ **Commit 047a590**: Fix TypeScript errors in StudentBillingPage  
✅ **Commit 674a71e**: Part B - Add Generate Invoice and Download Bill PDF buttons  
✅ **Commit 4e102cf**: Part A - Fix billing grid SQL bugs (CRITICAL FIX)  

All code is merged to `main` and ready to deploy.

---

## Manual Deployment Steps (via cPanel)

### Step 1: Download Frontend Build Archive

The frontend build is ready at: `C:\xamppP\htdocs\cur-mis\frontend\dist\`

Built files include:
- `index.html` 
- `assets/` folder with JS and CSS bundles

**OR** download the pre-built archive:
- Path: `C:\xamppP\htdocs\cur-mis\frontend-manual-deploy.zip`

### Step 2: Log into cPanel

1. Go to: `https://cur.ac.rw:2083/`
2. Log in with username: `curac`
3. Password: (your cPanel password)

### Step 3: Navigate to File Manager

1. In cPanel home, click **File Manager**
2. Navigate to: `/home/curac/public_html/umis/`
3. This is where the billing page files go

### Step 4: Upload the Archive

**Option A: Upload ZIP and Extract (Recommended)**

1. Click **Upload** button
2. Select `frontend-manual-deploy.zip` 
3. Wait for upload to complete
4. Right-click the zip file → **Extract** (or use cPanel's extract feature)
5. When prompted, select destination: `/public_html/umis/`
6. Delete the zip file when done

**Option B: Upload Individual Files**

If you prefer uploading files individually:
1. Click **Upload**
2. Select all files from `frontend/dist/`
3. Upload to `/public_html/umis/`

### Step 5: Verify Deployment

1. Open browser: `https://cur.ac.rw/umis/finance/billing`
2. Refresh hard (Ctrl+Shift+R)
3. Verify:
   - Student list loads
   - "Generate Invoice" and "Download Bill PDF" buttons appear in student details modal
   - Billing data displays correctly

---

## What These Changes Fix

### Part A: Critical SQL Bugs (Commit 4e102cf)

**Backend files changed**:
- `backend/app/Services/FeeService.php` — Fixed `getAllStudentsWithFinancialData()` method
- `backend/app/Controllers/FeeController.php` — Fixed self-service `downloadMyBillPdf()` auth

**Bugs fixed**:
1. ✅ Table name: `student_opening_balance` → `student_opening_balances` (SQL error fixed)
2. ✅ JOIN keys: All tables now join on `s.regnumber` (correct foreign key)
3. ✅ Enum values: Status checks use correct values (`'confirmed'` not `'completed'`)
4. ✅ Column names: Fixed `amount_applied` → `amount`
5. ✅ Fan-out bug: Multiple opening balance rows no longer multiply totals
6. ✅ NULL guards: Defensive checks prevent blank regnumber matches
7. ✅ Frontend routing: Now calls real API endpoint (not unauthenticated bypass file)

**Impact**: Billing page now displays correctly with accurate financial data

### Part B: UI Enhancements (Commit 674a71e)

**Frontend files changed**:
- `frontend/src/pages/finance/StudentBillingPage.tsx` — Added action buttons

**New features**:
- ✅ "Generate Invoice" button in student details modal
- ✅ "Download Bill PDF" button in student details modal
- Both buttons use existing, permission-gated backend endpoints

### Part C: TypeScript Fixes (Commit 047a590)

**Frontend files changed**:
- `frontend/src/pages/finance/StudentBillingPage.tsx` — Added proper types

**Fixes**:
- ✅ Added `BillingResponse` interface for API response typing
- ✅ Fixed type-unsafe response handling
- ✅ Removed email field reference (backend doesn't include it)

---

## Production Deployment Status

| Component | Status | Notes |
|-----------|--------|-------|
| **Backend Part A Fix** | ✅ Pushed to main | SQL bugs, auth pattern fixes |
| **Frontend Part B** | ✅ Pushed to main | Invoice generation UI buttons |
| **TypeScript Build** | ✅ Passing | No build errors |
| **GitHub Actions Deploy** | ❌ Failing | cPanel credentials issue (awaiting fix) |
| **Manual Deploy** | 🟡 Ready | Follow steps above to deploy manually |

---

## Troubleshooting

### "Extraction failed" error in cPanel

If extraction fails when unzipping:
1. Make sure `/public_html/umis/` directory exists and is writable
2. Try extracting to a temporary folder, then move files manually
3. Check disk space in cPanel (should have plenty)

### "File not found" after deploying

This might be a cache issue:
1. Hard refresh browser: **Ctrl+Shift+R** (or **Cmd+Shift+R** on Mac)
2. Clear browser cache entirely
3. Wait 30 seconds and retry

### "Permission denied" errors

Contact server admin to verify `/public_html/umis/` is owned by user `curac`

---

## Next Steps

After manual deployment succeeds:

1. **Clean up old files** (optional):
   - Delete `display-students.php` from `/public_html/umis/` (old bypass file, no longer needed)
   - Delete `billing-students.php` from `/public_html/umis/` (old bypass file, no longer needed)

2. **Fix GitHub Actions** (for future automatic deployments):
   - Update GitHub secret `CPANEL_PASS` with current cPanel password
   - See: `https://github.com/niyongaboemmy/cur-mis/settings/secrets/actions`
   - Re-run failed workflows via Actions tab

3. **Verify production changes are live**:
   - Test billing page: `https://cur.ac.rw/umis/finance/billing`
   - Try generating invoice for a test student
   - Try downloading bill PDF

---

## Contact / Questions

If you encounter issues during manual deployment, save the exact error message and provide it for diagnosis.
