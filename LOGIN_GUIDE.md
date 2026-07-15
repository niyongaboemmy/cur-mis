# 🔐 CUR-MIS LOGIN GUIDE
## Step-by-Step Instructions for All Users

---

## 🟢 SYSTEM STATUS: READY FOR LOGIN ✅

The CUR-MIS system is fully operational with all features enabled and tested.

---

## 📍 LOGIN LOCATIONS

### Development/Local Environment
```
URL: http://localhost/cur-mis
```

### Production Environment
```
URL: https://cur.ac.rw/umis
```

---

## 👤 SUPERADMIN LOGIN

### Credentials
```
Email:    faustinganzasheila@gmail.com
Password: [Reset via email if unknown]
Role:     Superadmin (Full System Access)
```

### Step-by-Step Login

1. **Open the Login Page**
   - Production: https://cur.ac.rw/umis
   - Local: http://localhost/cur-mis
   - You should see the CUR logo and login form

2. **Enter Email**
   - Click in the email field
   - Type: `faustinganzasheila@gmail.com`

3. **Enter Password**
   - Click in the password field
   - Type your password
   - (If you don't know it, request a password reset)

4. **Click Login**
   - Press the "Login" button
   - Wait for authentication (usually 2-3 seconds)

5. **Welcome Dashboard**
   - You'll see the main dashboard
   - Your name appears in top-right corner
   - You have access to all system features

---

## 📊 AFTER SUCCESSFUL LOGIN

### What You'll See

```
┌─────────────────────────────────────────────┐
│        CUR-MIS Management System             │
│                                             │
│  Left Sidebar:                              │
│  • Dashboard                                │
│  • Finance                                  │
│  • Academic                                 │
│  • HR Management                            │
│  • Admissions                               │
│  • Modules                                  │
│  • Settings                                 │
│                                             │
│  Top-Right:                                 │
│  • Profile Menu (name dropdown)             │
│  • Notifications                            │
│  • Logout                                   │
└─────────────────────────────────────────────┘
```

### Navigate to Finance Department
1. Click **Finance** in the left sidebar
2. You'll see 18 tabs:
   - Overview, Billing, Approvals, Fee Rates, Fee Types, Per-Credit Rates
   - Bursaries, Sponsors, Expenses, Refunds, Balance, Clearance
   - Reports, Online Payments, App Fee Reconciliation, Fines, Overdue Alerts
   - **Documents 📄** (marked with blue emoji indicator)

### Access Documents Tab
1. Click **Documents** tab (marked with 📄 emoji badge)
2. You'll see:
   - List of uploaded documents
   - "Upload Document" button (top right)
   - Category filters

### Upload Official Fee Schedule
1. Click **"Upload Document"** button
2. Fill in the form:
   ```
   Name:        CUR Academic Fees Structure 2025-2026 (Official)
   Category:    Fee Structure
   Description: Official signed fee schedule from CUR
   File:        Select your PDF
   ```
3. Click **Upload**
4. Document appears in list immediately

---

## ⚠️ TROUBLESHOOTING LOGIN

### Problem: "Invalid Credentials"
**Solution:**
- Verify email is spelled correctly: `faustinganzasheila@gmail.com`
- Check password is entered correctly (case-sensitive)
- Request password reset if forgotten

### Problem: "Internal Server Error"
**Solution:**
- Check database is running (ask IT)
- Try refreshing page (Ctrl+F5)
- Clear browser cache (Ctrl+Shift+Delete)
- Try different browser

### Problem: "Connection Refused"
**Solution (Local):**
- Ensure XAMPP is running
- Check http://localhost/phpmyadmin/ opens
- Restart Apache and MySQL

**Solution (Production):**
- Check internet connection
- Try different network
- Contact IT support with error message

### Problem: Page Loads But Won't Accept Login
**Solution:**
- Clear browser cookies (Settings → Privacy)
- Try incognito/private window
- Check browser console for errors (F12)
- Try different browser

---

## 🔑 ACCOUNT MANAGEMENT

### Change Password
1. Click your name (top-right)
2. Select "Account Settings"
3. Click "Change Password"
4. Enter old password
5. Enter new password twice
6. Click "Save"

### Update Profile
1. Click your name (top-right)
2. Select "Edit Profile"
3. Update details (name, contact info)
4. Click "Save"

### Forgot Password
1. On login page, click "Forgot Password?"
2. Enter your email
3. Check email for reset link
4. Click link in email
5. Enter new password
6. Log in with new password

---

## 👥 FOR FINANCE STAFF & OTHER USERS

### Login Process (Same as Superadmin)
1. Visit: https://cur.ac.rw/umis
2. Enter your email and password
3. Click Login

### Your Permissions
Different user roles have different access:
- **Superadmin:** Full access to everything
- **Finance Staff:** View fees, billing, reports; can't modify/delete
- **Academic Staff:** Access academic modules
- **HR Staff:** Access HR and payroll
- **Students:** View own grades and fees

### You'll Only See Features You Can Access
- Left sidebar only shows available modules
- Feature tabs are hidden if you lack permission
- Some buttons are disabled based on role

---

## 🌐 ENVIRONMENT ENDPOINTS

### Local Development
```
Frontend:     http://localhost:5173
Backend API:  http://localhost/cur-mis/backend/public/api
PhpMyAdmin:   http://localhost/phpmyadmin/
API Docs:     http://localhost/cur-mis/backend/public/api-docs.php
```

### Production
```
Frontend:     https://cur.ac.rw/umis
Backend API:  https://cur.ac.rw/umis/api
API Docs:     https://cur.ac.rw/umis/api/api-docs.php
```

---

## ⚙️ BROWSER REQUIREMENTS

### Recommended Browsers
- ✅ Google Chrome (latest)
- ✅ Mozilla Firefox (latest)
- ✅ Microsoft Edge (latest)
- ✅ Safari (latest)

### Browser Features Required
- JavaScript enabled
- Cookies enabled
- LocalStorage enabled
- HTTPS support (production only)

### If Features Don't Work
1. Check browser console (F12)
2. Disable browser extensions
3. Clear cache and cookies
4. Try incognito/private mode
5. Try different browser

---

## 🔒 SECURITY TIPS

### Protect Your Account
- ✅ Never share your password
- ✅ Log out when leaving computer
- ✅ Use strong passwords (8+ chars, mix case, numbers)
- ✅ Change password regularly
- ✅ Don't use work password on personal accounts

### Suspicious Activity
If you notice unusual activity:
1. Change your password immediately
2. Contact system administrator
3. Don't share login details with anyone
4. Report to IT security team

### Session Timeout
- Sessions expire after 8 hours of inactivity
- You'll be prompted to log in again
- Your data is automatically saved

---

## 📞 GETTING HELP

### If Login Still Doesn't Work

**Step 1:** Run System Check
```bash
# Contact IT with these commands executed:
cd backend
php scripts/test_login.php
```

**Step 2:** Provide Information
- Your email address
- Error message you see
- Browser and version
- Local or production?
- Screenshot of error

**Step 3:** Contact Support
- Email: [IT Support Email]
- Phone: [IT Support Phone]
- Include the test results above

---

## ✅ VERIFICATION CHECKLIST

Before reporting login issues, verify:
- [ ] You're using correct URL (https://cur.ac.rw/umis)
- [ ] Email is correct: faustinganzasheila@gmail.com
- [ ] Password is entered correctly
- [ ] CAPS LOCK is off
- [ ] JavaScript is enabled
- [ ] Cookies are enabled
- [ ] You're not behind unusual firewall
- [ ] Try incognito/private window
- [ ] Try different browser
- [ ] Internet connection is working

---

## 🎉 SUCCESS!

Once logged in, you have access to:
- 📊 Dashboard with system overview
- 💰 Finance Department (18 tabs)
- 📚 Academic Management
- 👥 HR Management
- 📝 Admissions
- 🎓 Modules & Courses
- ⚙️ System Settings

**Enjoy using CUR-MIS!**

---

**System Status:** 🟢 Ready  
**Last Updated:** 2026-07-15  
**Support Available:** 24/7
