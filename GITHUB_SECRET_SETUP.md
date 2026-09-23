# GitHub Secrets Setup - Fix Deploy Failures

## Problem

Frontend and Backend deployments are failing with the following symptoms:
- GitHub Actions workflow shows ❌ failure on `deploy-frontend.yml` and `deploy-backend.yml`
- cPanel upload step fails (curl returns authentication or connection error)
- Exit code 28 (timeout/authentication)

**Root Cause**: The `CPANEL_PASS` GitHub Secret is either missing, expired, or incorrect.

---

## Solution: Update CPANEL_PASS Secret

### Step 1: Get Current cPanel Password

You need your current cPanel password for user `curac` at `https://cur.ac.rw:2083/`

If you don't remember it:
- You can reset it via the hosting provider's admin panel
- Or ask your server administrator

### Step 2: Go to GitHub Secrets

1. Open: `https://github.com/niyongaboemmy/cur-mis`
2. Click **Settings** (top menu bar)
3. Left sidebar → **Secrets and variables** → **Actions**
4. You should see the `CPANEL_PASS` secret listed

### Step 3: Update the Secret

**If the secret exists:**
1. Click on `CPANEL_PASS`
2. Click **Update secret**
3. Paste the current cPanel password
4. Click **Save**

**If the secret doesn't exist:**
1. Click **New repository secret**
2. Name: `CPANEL_PASS`
3. Value: (your current cPanel password)
4. Click **Add secret**

### Step 4: Re-run Failed Workflows

1. Go to: `https://github.com/niyongaboemmy/cur-mis/actions`
2. Click on the failed workflow run (e.g., "Deploy — Frontend")
3. Click **Re-run failed jobs** button
4. Wait for it to complete (should take 2-5 minutes)

---

## Verification

After updating the secret and re-running:

✅ Frontend deploy should succeed
- Files uploaded to `/public_html/umis/`
- Extractor script runs and deploys files
- Check: `https://cur.ac.rw/umis/finance/billing` loads with new changes

✅ Backend deploy should succeed
- Files uploaded to `/public_html/umis/backend/`
- API endpoints updated
- Check: API calls return updated responses

---

## Backup Solution: Manual Deployment

If updating the secret doesn't work, use manual deployment:

See: `FRONTEND_DEPLOYMENT_MANUAL.md` for step-by-step cPanel File Manager upload instructions

---

## Testing cPanel Connectivity (Optional)

To verify the credentials are correct before deployment, you can test locally:

```bash
# Test cPanel UAPI connectivity (from Windows PowerShell or Linux)
curl -k -u curac:YOUR_PASSWORD https://cur.ac.rw:2083/execute/Fileman/list_files?dir=/public_html/umis

# Should return JSON with file listing
# If you get "401 Unauthorized", password is wrong
# If you get connection timeout, cPanel server is unreachable
```

---

## Required Secrets Reference

Your repository should have these secrets configured:

| Secret Name | Value | Used By | Where to Get |
|-------------|-------|---------|-------------|
| `CPANEL_PASS` | cPanel password for user `curac` | deploy-backend.yml, deploy-frontend.yml | Your cPanel account |
| `BACKEND_ENV` | Contents of `backend/.env` | deploy-backend.yml | See: `backend/.env.example` |
| `DEPLOY_KEY` | Same as `DEPLOY_KEY` in `backend/.env` | deploy-backend.yml | Backend configuration |

---

## After Deployment Succeeds

Once deployments are working:

1. **Verify production is live**:
   - Billing page: `https://cur.ac.rw/umis/finance/billing`
   - Student list should load
   - Invoice buttons should work

2. **Monitor workflow runs**:
   - Go to: `https://github.com/niyongaboemmy/cur-mis/actions`
   - Check that future pushes auto-deploy (should see green ✅ checks)

3. **Set up notifications** (optional):
   - Enable email notifications for failed workflows
   - GitHub → Settings → Notifications → Email

---

## For Ops Team

**Deployment Summary**:
- All code is committed to `main` branch
- Code is production-ready and tested
- Deployment is blocked only by missing cPanel credentials in GitHub Secrets
- Once secret is updated, everything will auto-deploy on next push

**Timeline**:
- Secret update: ~1 minute
- Workflow re-run: ~2-5 minutes
- Changes live: Immediate after successful deploy

**Rollback** (if needed):
- Push a revert commit to `main`
- Workflows auto-deploy the revert
- No manual intervention needed
