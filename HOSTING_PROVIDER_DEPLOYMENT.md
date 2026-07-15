# 🚀 CUR-MIS Production Deployment Instructions for Hosting Provider

**For:** Hosting Provider / Server Administrator  
**System:** CUR-MIS (Catholic University of Rwanda - Management Information System)  
**Server:** cur.ac.rw/umis  
**Repository:** https://github.com/niyongaboemmy/cur-mis.git  

---

## 📋 DEPLOYMENT STEPS

### Step 1: Connect to Server via SSH

```bash
ssh username@cur.ac.rw
# OR if using a different port:
ssh -p 2222 username@cur.ac.rw
```

### Step 2: Find the CUR-MIS Installation Path

If you don't know where the files are stored:

```bash
# Try common paths:
find /var/www -name "umis" -type d 2>/dev/null
# OR
find /home -name "umis" -type d 2>/dev/null
# OR
find /opt -name "umis" -type d 2>/dev/null
```

Once you find it, note the full path (e.g., `/var/www/cur.ac.rw/umis`)

### Step 3: Navigate to CUR-MIS Directory

```bash
cd /var/www/cur.ac.rw/umis
# OR your actual path from step 2
```

### Step 4: Verify Git Repository

```bash
git status
# Should show: On branch main
```

### Step 5: Pull Latest Code from Main Branch

```bash
git pull origin main
```

**Expected output:**
```
From https://github.com/niyongaboemmy/cur-mis
   70e274c..63eda9d  main       -> origin/main
Updating 70e274c..63eda9d
Fast-forward
 CRITICAL_FIX_APPLIED.md | 197 +++++++++++++++++++++++++++++
 1 file changed, 197 insertions(+)
```

### Step 6: Install/Update Node Dependencies

```bash
npm install
```

### Step 7: Rebuild Frontend with Production Settings

```bash
NODE_ENV=production npm run build
```

**Expected output:**
```
> cur-mis-frontend@0.1.0 build
> tsc && vite build

vite v5.4.21 building for production...
✓ built in 25.13s
```

### Step 8: Set Correct Permissions

```bash
chmod -R 755 backend/
chmod -R 755 frontend/dist/
chmod 644 .htaccess
chmod 644 api-router.php
```

### Step 9: Restart Apache Web Server

```bash
# For systemd (Ubuntu 16.04+, CentOS 7+):
sudo systemctl restart apache2

# OR for older systems:
sudo service apache2 restart

# OR if using cPanel:
sudo /scripts/restartsrv_apache
```

### Step 10: Verify Deployment

```bash
# Test 1: API Health Check
curl https://cur.ac.rw/umis/api/health

# Expected response (JSON):
# {"success":true,"data":{"status":"ok","timestamp":...},"message":"API is healthy."}

# Test 2: Portal Endpoint
curl https://cur.ac.rw/umis/api/portal/intakes

# Expected: JSON array (not HTML 404 error)
```

### Step 11: Browser Verification

Visit these URLs in a browser:

1. **Login Page:**
   - URL: `https://cur.ac.rw/umis/`
   - Expected: Login form loads without errors

2. **API Test Tool:**
   - URL: `https://cur.ac.rw/umis/test-api.html`
   - Click: "Test API Health"
   - Expected: Green ✅ checkmark

---

## ✅ DEPLOYMENT CHECKLIST

Before confirming deployment is complete, verify:

- [ ] `git pull origin main` succeeded
- [ ] `npm install` completed without errors
- [ ] `npm run build` completed successfully
- [ ] `sudo systemctl restart apache2` succeeded
- [ ] `curl https://cur.ac.rw/umis/api/health` returns JSON
- [ ] Login page loads at `https://cur.ac.rw/umis/`
- [ ] Test tool at `https://cur.ac.rw/umis/test-api.html` shows ✅

---

## 🐛 TROUBLESHOOTING

### Issue: "git pull origin main" fails

**Cause:** Git not installed or repository not initialized

**Solution:**
```bash
# Check if git is installed
git --version

# If not, install it:
sudo apt-get install git  # Ubuntu/Debian
sudo yum install git      # CentOS/RHEL

# If repository not initialized:
cd /path/to/umis
git init
git remote add origin https://github.com/niyongaboemmy/cur-mis.git
git pull origin main
```

### Issue: "npm install" fails or "npm: command not found"

**Cause:** Node.js not installed

**Solution:**
```bash
# Check if Node.js is installed
node --version
npm --version

# If not, install Node.js:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use NVM (Node Version Manager):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

### Issue: "npm run build" fails with TypeScript errors

**Cause:** Type checking errors in TypeScript

**Solution:**
```bash
# Clear node_modules and reinstall:
rm -rf node_modules package-lock.json
npm install
npm run build

# If still failing, check TypeScript version:
npm ls typescript
# Should be 5.x or higher
```

### Issue: "sudo systemctl restart apache2" fails

**Cause:** Apache not installed or service name different

**Solution:**
```bash
# Check if Apache is installed:
apache2ctl -v

# If not installed:
sudo apt-get install apache2  # Ubuntu/Debian

# Check service name:
sudo systemctl list-unit-files | grep apache

# Restart with correct service name:
sudo systemctl restart apache2
# OR
sudo systemctl restart httpd  # CentOS/RHEL
```

### Issue: Still Getting 404 on API Calls

**Cause:** .htaccess not working (mod_rewrite not enabled)

**Solution:**
```bash
# Check if mod_rewrite is enabled:
sudo apache2ctl -M | grep rewrite

# If not shown, enable it:
sudo a2enmod rewrite
sudo systemctl restart apache2

# Check .htaccess exists:
ls -la /path/to/umis/.htaccess
# Should show: -rw-r--r-- 1 www-data ...

# Verify .htaccess permissions:
chmod 644 /path/to/umis/.htaccess

# Check api-router.php exists:
ls -la /path/to/umis/api-router.php
```

### Issue: "sudo systemctl restart apache2" - Permission Denied

**Cause:** Not running with sudo or sudo not configured

**Solution:**
```bash
# Try with sudo:
sudo systemctl restart apache2

# If sudo not available, use service command:
service apache2 restart

# Or ask hosting provider to restart Apache via control panel
```

---

## 📊 DEPLOYMENT SUMMARY

| Step | Command | Status |
|------|---------|--------|
| 1. SSH | `ssh username@cur.ac.rw` | ✅ |
| 2. Navigate | `cd /path/to/umis` | ✅ |
| 3. Pull Code | `git pull origin main` | ✅ |
| 4. Install Deps | `npm install` | ✅ |
| 5. Build Frontend | `NODE_ENV=production npm run build` | ✅ |
| 6. Set Permissions | `chmod -R 755 backend/` | ✅ |
| 7. Restart Apache | `sudo systemctl restart apache2` | ✅ |
| 8. Verify API | `curl https://cur.ac.rw/umis/api/health` | ✅ |

---

## 🎯 WHAT GETS DEPLOYED

**New/Updated Files:**
- ✅ `api-router.php` - Smart API entry point
- ✅ `test-api.html` - API testing tool
- ✅ `.htaccess` - Universal rewrite rules
- ✅ `frontend/dist/` - React app (rebuilt)
- ✅ All backend routes and controllers
- ✅ All documentation files

**Unchanged:**
- ✅ `backend/.env` - Already configured
- ✅ Database schema - Preserved
- ✅ Database data - Unchanged

---

## 📱 AFTER DEPLOYMENT

### Login Credentials

**Superadmin Account:**
- Email: `faustinganzasheila@gmail.com`
- Password: (check your password manager or password reset email)

### Verify Everything Works

1. **Visit login page:**
   ```
   https://cur.ac.rw/umis/
   ```

2. **Enter credentials:**
   ```
   Email: faustinganzasheila@gmail.com
   Password: [your password]
   ```

3. **Click Sign In**

4. **Expected:** Dashboard loads, Finance module accessible

---

## 🆘 SUPPORT

If deployment fails:

1. **Check error logs:**
   ```bash
   tail -50 /var/log/apache2/error.log
   # OR
   tail -50 /var/log/httpd/error_log
   ```

2. **Check PHP version:**
   ```bash
   php -v
   # Should be 8.0 or higher
   ```

3. **Verify MySQL connection:**
   ```bash
   mysql -h localhost -u dbuser -p dbname -e "SELECT 1;"
   ```

4. **Run API test:**
   ```bash
   curl -v https://cur.ac.rw/umis/api/health 2>&1 | head -50
   ```

5. **Check file structure:**
   ```bash
   ls -la /path/to/umis/
   # Should show: api-router.php, .htaccess, backend/, frontend/
   ```

---

## ✅ SUCCESS CRITERIA

Deployment is complete when:

✅ All 7 deployment steps completed successfully  
✅ `curl https://cur.ac.rw/umis/api/health` returns JSON  
✅ Login page loads at `https://cur.ac.rw/umis/`  
✅ Test tool shows ✅ on API Health Check  
✅ Users can login with superadmin credentials  
✅ Finance module loads and is accessible  
✅ No console errors in browser  

---

**Deployment Time:** 5-10 minutes  
**Estimated Downtime:** None (zero-downtime deployment)  
**Rollback:** If needed, run `git reset --hard HEAD~1` and restart Apache  

---

**Questions?** Contact: faustin.niyitegeka@gmail.com  
**Repository:** https://github.com/niyongaboemmy/cur-mis.git  
**Documentation:** See CRITICAL_FIX_APPLIED.md in repository
