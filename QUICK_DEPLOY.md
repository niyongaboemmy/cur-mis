# 🚀 QUICK DEPLOYMENT GUIDE

## For Production Server (https://cur.ac.rw/umis)

### **OPTION 1: Automated Deployment (Recommended)**

#### Prerequisites:
You need to know:
- SSH username (e.g., `ubuntu`, `root`, `webadmin`)
- SSH host (e.g., `cur.ac.rw`)
- Full path to CUR-MIS folder (e.g., `/var/www/cur.ac.rw/umis` or `/home/user/public_html/umis`)

#### Steps:

1. **On your local machine**, set environment variables:

```bash
# MacOS/Linux:
export PROD_USER=your_ssh_username
export PROD_HOST=cur.ac.rw
export PROD_PATH=/var/www/cur.ac.rw/umis
# Then run:
bash DEPLOY_PRODUCTION.sh

# Windows PowerShell:
$env:PROD_USER="your_ssh_username"
$env:PROD_HOST="cur.ac.rw"
$env:PROD_PATH="/var/www/cur.ac.rw/umis"
# Then run:
bash DEPLOY_PRODUCTION.sh
```

2. **The script will:**
   - ✅ Test SSH connection
   - ✅ Verify production directory
   - ✅ Pull latest code from main branch
   - ✅ Verify all critical files exist
   - ✅ Set correct permissions
   - ✅ Restart Apache
   - ✅ Test API endpoints
   - ✅ Show deployment summary

3. **When complete, you'll see:**
```
✅ DEPLOYMENT COMPLETED SUCCESSFULLY
```

---

### **OPTION 2: Manual Deployment (If Automated Fails)**

#### Step 1: SSH to Production Server

```bash
# Replace with your credentials
ssh username@cur.ac.rw
```

#### Step 2: Navigate to CUR-MIS Directory

```bash
# Common paths (adjust to your actual path):
cd /var/www/cur.ac.rw/umis
# OR
cd /home/username/public_html/umis
# OR
cd /home/username/public_html
```

#### Step 3: Pull Latest Code

```bash
git pull origin main
```

**Expected output:**
```
From https://github.com/niyongaboemmy/cur-mis
   65368b5..65368b5  main       -> origin/main
Already up to date.
```

#### Step 4: Verify Critical Files

```bash
# Check all 4 critical files exist
ls -la api-router.php .htaccess backend/public/index.php frontend/dist/index.html
```

**Expected:** All 4 files shown

#### Step 5: Set Correct Permissions

```bash
chmod -R 755 backend/
chmod -R 755 frontend/dist/
chmod 644 .htaccess
chmod 644 api-router.php
```

#### Step 6: Restart Apache

```bash
# Try first:
sudo systemctl restart apache2

# If that doesn't work, try:
sudo /scripts/restartsrv_apache

# Or ask hosting to restart Apache for you
```

#### Step 7: Test Deployment

```bash
# Test health endpoint
curl https://cur.ac.rw/umis/api/health

# Expected: JSON response with "success":true
```

---

## ✅ VERIFICATION STEPS

### Via Browser:

1. **Visit:** `https://cur.ac.rw/umis/test-api.html`
2. **Click:** "Test API Health"
3. **Result:** Should show ✅ green checkmark

### Via Command Line:

```bash
# Test 1: Health endpoint
curl https://cur.ac.rw/umis/api/health
# Expected: {"success":true,"data":{"status":"ok"}...}

# Test 2: Portal endpoint
curl https://cur.ac.rw/umis/api/portal/intakes
# Expected: Array of intakes data (not 404)

# Test 3: Frontend
curl -I https://cur.ac.rw/umis/
# Expected: HTTP/1.1 200 OK (not 404)
```

### Via Browser UI:

1. **Visit:** `https://cur.ac.rw/umis/`
2. **You should see:** Login form
3. **Login with:** 
   - Email: `faustinganzasheila@gmail.com`
   - Password: (use your superadmin password)
4. **You should see:** Dashboard

---

## 🐛 IF DEPLOYMENT FAILS

### Problem 1: "SSH connection failed"

**Solution:**
- Verify SSH username is correct
- Verify SSH host is correct
- Check your SSH key is configured
- Ask hosting provider for SSH access

### Problem 2: "Directory not found"

**Solution:**
```bash
# SSH to server and find the path:
find /var -name "umis" -type d 2>/dev/null
# OR
find /home -name "umis" -type d 2>/dev/null
```

Then use that path in the deployment script.

### Problem 3: "Git pull failed"

**Solution:**
- Make sure git is installed: `git --version`
- Make sure you're in the right directory: `pwd`
- Make sure it's a git repo: `git status`

### Problem 4: "Still Getting 404 After Deployment"

**Solution:**
1. Visit: `https://cur.ac.rw/umis/test-api.html`
2. Click "Test API Health"
3. It will show you the exact problem
4. Check "TROUBLESHOOTING" section in DEPLOYMENT_AND_TESTING.md

### Problem 5: "Permission Denied When Setting Permissions"

**Solution:**
- These commands might need sudo: `sudo chmod ...`
- Or ask your hosting provider to set permissions
- Minimum required: backend files readable (644), directories executable (755)

---

## 📊 WHAT GETS DEPLOYED

When you run `git pull origin main`, these files are deployed:

**NEW:**
- ✅ `api-router.php` - Smart API router
- ✅ `test-api.html` - Testing tool
- ✅ `README_FINAL.md` - Solution guide
- ✅ `DEPLOYMENT_AND_TESTING.md` - Detailed guide
- ✅ `DEPLOY_PRODUCTION.sh` - This deployment script

**UPDATED:**
- ✅ `.htaccess` - Universal rewrite rules
- ✅ `frontend/dist/` - React app (rebuilt)
- ✅ All backend files in `/backend/`

**NO CHANGES NEEDED:**
- ✅ `backend/.env` - Already configured
- ✅ Database schema - Already migrated
- ✅ Database data - Preserved

---

## 🎯 DEPLOYMENT CHECKLIST

After deployment, verify:

- [ ] SSH connection works
- [ ] `git pull origin main` succeeds
- [ ] All 4 critical files exist
- [ ] Permissions set correctly
- [ ] Apache restarted
- [ ] `curl https://cur.ac.rw/umis/api/health` returns JSON
- [ ] `https://cur.ac.rw/umis/test-api.html` works
- [ ] Frontend loads at `https://cur.ac.rw/umis/`
- [ ] Login form appears
- [ ] Can login with superadmin credentials
- [ ] Finance module accessible
- [ ] No console errors in browser

---

## 📱 AFTER DEPLOYMENT

### First Login:
```
URL: https://cur.ac.rw/umis/
Email: faustinganzasheila@gmail.com
Password: [your superadmin password]
```

### What Users Can Do:
- ✅ View Finance dashboard
- ✅ Manage fees and billing
- ✅ Upload documents
- ✅ View reports
- ✅ Process payments
- ✅ Manage academic records
- ✅ Access HR features
- ✅ And much more...

---

## 🆘 GETTING HELP

If you get stuck:

1. **Read the error message** - It usually tells you what's wrong
2. **Visit test tool** - `https://cur.ac.rw/umis/test-api.html` 
3. **Check logs** - `tail -50 /var/log/apache2/error.log`
4. **Review guides** - Read DEPLOYMENT_AND_TESTING.md
5. **Contact hosting** - They can help with server configuration

---

## ✨ SUCCESS

When deployment is complete:

✅ System is live on production  
✅ All APIs responding  
✅ Frontend accessible  
✅ Users can login  
✅ Features working  

**Time to go live: 5-10 minutes** ⏱️

---

**Questions?** Check README_FINAL.md or DEPLOYMENT_AND_TESTING.md
