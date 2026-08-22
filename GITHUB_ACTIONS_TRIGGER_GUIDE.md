# GitHub Actions Deploy - Complete Trigger Guide

**Status**: Code is ready. Need to trigger GitHub Actions workflows.

---

## How GitHub Actions Works for This Project

When code is pushed to `main` branch:
1. `deploy-backend.yml` auto-runs if `backend/**` files changed
2. `deploy-frontend.yml` auto-runs if `frontend/**` files changed
3. Both workflows upload to cPanel via UAPI using the `CPANEL_PASS` secret
4. Files are extracted and go live at `https://cur.ac.rw/umis/`

**Current Situation**:
- Code pushed to main ✅
- Workflows triggered automatically ✅
- Workflows running ✅
- **Workflows failing at cPanel upload step** ❌ (need credentials)

---

## The Issue: Missing CPANEL_PASS Secret

The GitHub Secret `CPANEL_PASS` must contain your cPanel password for user `curac`.

**Without it**: Workflows fail when trying to upload to `https://cur.ac.rw:2083/`  
**With it**: Everything deploys automatically in 2-5 minutes

---

## Three Solutions (Pick One)

### Solution 1: Update GitHub Secret (RECOMMENDED)

**Steps**:
1. Go to: `https://github.com/niyongaboemmy/cur-mis`
2. Click **Settings** (top menu)
3. Left sidebar → **Secrets and variables** → **Actions**
4. Look for secret named `CPANEL_PASS`
   - If it exists: Click it → **Update secret** → Enter current password
   - If it doesn't exist: **New repository secret** → Name: `CPANEL_PASS` → Value: (your password)
5. Save
6. Go to: `https://github.com/niyongaboemmy/cur-mis/actions`
7. Click the latest failed workflow run
8. Click **Re-run failed jobs**
9. Wait 2-5 minutes ✓

**Result**: Automatic deployment to production  
**Time**: 2-5 minutes

---

### Solution 2: Manual PowerShell Deployment

**Prerequisites**:
- curl installed (comes with Windows 10+)
- PowerShell 7+ (or Windows PowerShell 5.1)
- cPanel password for user `curac`

**Steps**:

```powershell
# Navigate to repo directory
cd C:\xamppP\htdocs\cur-mis

# Run deployment script
.\deploy-to-cpanel.ps1 -CpanelPassword "your_password_here"
```

**What it does**:
1. Uploads `frontend-manual-deploy.zip` to cPanel via UAPI
2. Creates and runs PHP extractor script
3. Verifies files are live
4. Cleans up temporary files

**Result**: Files deployed to production  
**Time**: 2-5 minutes (depends on file upload speed)

**Troubleshooting**:
```powershell
# If curl not found, use full path
& "C:\Program Files\Git\usr\bin\curl.exe" ...

# If script blocked, bypass
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\deploy-to-cpanel.ps1 -CpanelPassword "password"
```

---

### Solution 3: Manual cPanel File Manager

**Steps**:
1. Log into: `https://cur.ac.rw:2083/`
2. Click **File Manager**
3. Navigate to: `/home/curac/public_html/umis/`
4. Click **Upload**
5. Select: `C:\xamppP\htdocs\cur-mis\frontend-manual-deploy.zip`
6. Wait for upload
7. Right-click the zip → **Extract** (or use cPanel's extract feature)
8. Choose destination: same folder (`/public_html/umis/`)
9. Delete the zip file when done
10. Hard refresh: `https://cur.ac.rw/umis/finance/billing` (Ctrl+Shift+R)

**Result**: Files deployed manually  
**Time**: 10-15 minutes (manual process)

---

## What Each Solution Requires

| Solution | Requires | Time | Skill Level |
|----------|----------|------|-------------|
| Update GitHub Secret | cPanel password + GitHub login | 2-5 min | Easy |
| PowerShell Script | cPanel password + curl + PowerShell | 2-5 min | Medium |
| Manual cPanel Upload | cPanel login (no password needed from CLI) | 10-15 min | Easy |

---

## Current Code Status

**All commits are on `main` and ready**:
```
32d14d1 🚨 Add urgent deployment action document
92fcf11 📌 Final summary: Billing system fix complete
092cd5c 📋 Add deployment documentation
047a590 🔧 Fix TypeScript errors
674a71e ✨ Part B: Add invoice buttons
4e102cf 🔧 Part A: Fix critical SQL bugs (MAIN FIX)
```

**What's ready to deploy**:
- ✅ Frontend build: `frontend/dist/` (built and ready)
- ✅ Frontend archive: `frontend-manual-deploy.zip` (1.3 MB)
- ✅ Backend changes: In `backend/app/Services/FeeService.php` and `backend/app/Controllers/FeeController.php`
- ✅ Deployment scripts: `deploy-to-cpanel.ps1` (PowerShell)

---

## After Deployment - Verification

Once deployed, verify it worked:

```bash
# Check if files are on server
curl -k https://cur.ac.rw/umis/ | head -20

# Check billing page
curl -k https://cur.ac.rw/umis/finance/billing | grep -i "student"

# Check API
curl -k https://cur.ac.rw/umis/api/finance/billing/all-students | jq '.success'
```

**Visual verification**:
1. Open: `https://cur.ac.rw/umis/finance/billing`
2. Student list should appear
3. Click a student → details modal opens
4. "Generate Invoice" button should be visible
5. "Download Bill PDF" button should be visible

---

## Recommended Path Forward

**IF** you have cPanel password:
1. Update GitHub Secret `CPANEL_PASS` (2 minutes)
2. Re-run workflows (automatic, 2-5 minutes)
3. Verify on production

**IF** you don't have/want to share cPanel password:
1. Use cPanel File Manager to manually upload `frontend-manual-deploy.zip`
2. Extract and verify (10 minutes)

**IF** you want immediate automation:
1. Use PowerShell script with password (2-5 minutes)
2. No browser login needed

---

## Files In This Repo

**For GitHub Actions**:
- `.github/workflows/deploy-frontend.yml` — Automatic frontend deploy
- `.github/workflows/deploy-backend.yml` — Automatic backend deploy

**For Manual Deployment**:
- `deploy-to-cpanel.ps1` — PowerShell script to deploy
- `frontend-manual-deploy.zip` — Complete frontend build archive
- `FRONTEND_DEPLOYMENT_MANUAL.md` — cPanel File Manager instructions

**Documentation**:
- `BILLING_SYSTEM_FIX_COMPLETE.md` — Complete implementation summary
- `GITHUB_SECRET_SETUP.md` — How to setup credentials
- `URGENT_DEPLOYMENT_ACTION_REQUIRED.md` — What's needed
- `GITHUB_ACTIONS_TRIGGER_GUIDE.md` — This file

---

## FAQ

**Q: Can I deploy both backend and frontend at once?**  
A: Yes! Both workflows run automatically when code is pushed to `main`. Backend and frontend deploy independently:
- Backend deploy happens if `backend/**` changed
- Frontend deploy happens if `frontend/**` changed

**Q: How long does deployment take?**  
A: Typically 2-5 minutes from when you click "re-run" or update the secret.

**Q: What if deployment fails again?**  
A: Check GitHub Actions logs (in the workflow run) for the exact error. Usually it's:
- Wrong password (update secret)
- Network timeout (retry)
- File permission issue (contact hosting provider)

**Q: Can I rollback if something breaks?**  
A: Yes! Push a revert commit:
```bash
git revert 4e102cf  # Revert Part A fix
git push origin main
# GitHub Actions auto-deploys old version
```

**Q: Is the cPanel password saved securely?**  
A: Yes! GitHub Secrets are encrypted. Only GitHub Actions workflows can access them. They never appear in logs.

**Q: Can I test this locally first?**  
A: Yes! Run `npm run build` in `frontend/` to create `frontend/dist/`, then use PowerShell script to upload.

---

## Next Steps

Choose one option above and proceed:

1. **Update GitHub Secret** → Quickest & most automatic
2. **Use PowerShell Script** → Fast if you know password
3. **Manual cPanel Upload** → Simplest (no script needed)

After deployment, billing page will be live at:
```
https://cur.ac.rw/umis/finance/billing
```

With all features working:
- Student list ✓
- Invoice generation ✓
- Bill PDF download ✓
- Accurate financial data ✓

---

**Ready to deploy? Choose an option above!** 🚀
