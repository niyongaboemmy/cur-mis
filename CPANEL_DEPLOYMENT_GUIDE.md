# cPanel Deployment Guide - Production Live

**URL:** https://cur.ac.rw:2083/  
**Status:** Manual deployment via cPanel File Manager  
**Commit:** 062cbf7 - Fix billing year filter to use student.intake

---

## Step-by-Step cPanel Deployment

### Step 1: Access cPanel
1. Go to: **https://cur.ac.rw:2083/**
2. Login with your cPanel credentials
3. You should see the cPanel dashboard

### Step 2: Navigate to File Manager
1. Click **"File Manager"** in cPanel
2. Click **"Go To Public HTML"** or navigate to: `~/public_html/`
3. You should see your website files

### Step 3: Locate the UMIS Application
1. In File Manager, navigate to: `public_html/umis/`
2. You should see folders like:
   - `frontend/` (React app - currently deployed)
   - `backend/` (PHP API)
   - `index.html` (entry point)

### Step 4: Deploy Frontend Build

#### Option A: Upload Pre-built Files (Recommended)

**On your local machine, run:**
```bash
cd c:\xamppP\htdocs\cur-mis
npm run build
```

**This creates `dist/` folder with compiled frontend**

**Then upload to cPanel:**
1. In cPanel File Manager, go to: `public_html/umis/`
2. Delete or backup old frontend files
3. Upload contents of `dist/` folder to `public_html/umis/`

#### Option B: Build on Server (if Node.js available)

**Via cPanel Terminal:**
1. In cPanel, find **"Terminal"** (if available)
2. Run:
```bash
cd ~/public_html/umis
git pull origin main
npm install
npm run build
```

### Step 5: Verify Deployment

1. Navigate to: https://cur.ac.rw/umis/finance/billing
2. Should see: **"Bulk Billing Management"** page
3. Click **"Academic Year"** dropdown
4. Should see years from student.intake table (2023/2024, 2024/2025, etc.)
5. ✅ If visible, deployment is successful!

### Step 6: Clear Browser Cache

**Tell users to:**
- Press: **Ctrl + Shift + Delete** (Windows)
- Or: **Cmd + Shift + Delete** (Mac)
- Clear browsing data → Close browser → Reopen

---

## Quick cPanel Commands

### Via cPanel Terminal (if available)

```bash
# Navigate to app folder
cd ~/public_html/umis

# Check current commit
git log --oneline -1

# Pull latest changes
git pull origin main

# Check if Node.js is installed
node --version

# Install dependencies
npm install

# Build frontend
npm run build

# Verify build succeeded
ls -la dist/
```

### Via File Manager

1. Upload `dist/` folder contents
2. Ensure all `.js`, `.css`, `.html` files are present
3. Check file permissions (should be 644 for files, 755 for folders)

---

## Troubleshooting

### Issue: "npm: command not found"
**Solution:** Node.js not installed on server
- Contact hosting provider to enable Node.js
- Or manually upload pre-built `dist/` folder

### Issue: "Permission denied"
**Solution:** File permissions issue
- Right-click file → Change Permissions
- Files: **644**
- Folders: **755**

### Issue: Page shows blank/error
**Solution:** 
1. Clear browser cache (Ctrl+Shift+Delete)
2. Check browser console (F12) for errors
3. Check server error logs in cPanel

### Issue: Academic year dropdown shows nothing
**Solution:**
- Ensure database has student records with `intake` column filled
- Check `/api/finance/billing/intake-years` endpoint
- Run: `SELECT DISTINCT intake FROM student;` in database

---

## Deployment Checklist

- [ ] Access cPanel at https://cur.ac.rw:2083/
- [ ] Navigate to File Manager
- [ ] Go to `public_html/umis/`
- [ ] Build frontend: `npm run build`
- [ ] Upload `dist/` folder contents
- [ ] Verify file permissions (644/755)
- [ ] Clear browser cache
- [ ] Test at: https://cur.ac.rw/umis/finance/billing
- [ ] Verify Academic Year dropdown works
- [ ] Confirm opening balance shows
- [ ] Test manual student selection
- [ ] ✅ Deployment complete!

---

## What's Deployed

**Commit:** 062cbf7  
**File:** frontend/src/pages/finance/StudentBillingPage.tsx

**Changes:**
- Academic year filter now uses student.intake
- No auto-selection of active year
- Manual year selection required
- Opening balance preserved
- Bursaries preserved
- Manual student selection works
- Bulk generation for selected students only

---

## Production Features Available

1. **Academic Year Filtering**
   - Pulls from student.intake table
   - Shows all student cohorts
   - User manually selects year

2. **Student Display**
   - Name & registration number
   - Department & faculty
   - Opening balance
   - Invoiced amount
   - Paid amount
   - Bursary amount
   - Remaining balance

3. **Bulk Billing**
   - Manual student selection (checkboxes)
   - "Generate Invoices" button
   - Processes selected students only
   - Creates fee invoices

4. **Reporting**
   - Export CSV
   - Download individual bills
   - View student ledger

---

## Support

**Issue during deployment?**

1. Check file permissions
2. Verify git pull succeeded
3. Clear browser cache
4. Check browser console (F12)
5. Check cPanel error logs
6. Verify database has data

**Contact hosting provider if:**
- Node.js not available
- Permission issues persist
- Database connection problems

---

## Next Steps

1. ✅ Push code to GitHub (DONE - commit 062cbf7)
2. 🔄 Deploy via cPanel (THIS STEP)
3. ✅ Verify in browser
4. ✅ Test with Finance team
5. ✅ Monitor for 24 hours
6. ✅ Complete!

---

**Deployment Date:** 2026-08-20  
**Status:** Ready for cPanel deployment  
**Next:** Access cPanel and upload dist/ folder

