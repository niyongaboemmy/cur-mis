# Login Test Guide - CUR-MIS System

**Date:** August 19, 2026  
**System Status:** ✅ Ready to Test

---

## 🔐 Primary Admin Account

**Account Details:**
```
Email:     faustin.niyitegeka@gmail.com
Role:      admin (ID: 1)
Status:    Active ✓
Permissions: 110 (full system access)
```

**What This User Can Do:**
- ✅ View ALL features in the sidebar
- ✅ Access all modules
- ✅ Manage users and roles
- ✅ Configure permissions
- ✅ View all students and staff
- ✅ Access financial data
- ✅ Manage academic records
- ✅ Assign department/faculty scopes

---

## 🚀 How to Test the Login

### Step 1: Open the Frontend

Open your web browser and navigate to:
```
http://localhost:5173
```

or

```
http://localhost:3000
```

(depending on which port your frontend is running on)

### Step 2: You Should See Login Page

The login page should display:
- CUR-MIS branding
- Email input field
- Password input field
- "Login" button
- "Forgot Password" option

### Step 3: Enter Credentials

```
Email:    faustin.niyitegeka@gmail.com
Password: (your password for this account)
```

> **Note:** If you don't know the password:
> - Ask the original admin who set up this account
> - Or use password reset feature
> - Or ask database administrator to reset it

### Step 4: Click Login

Click the "Login" button.

### Step 5: Wait for OTP

The system will send a 6-digit OTP to the email address.

**Expected:**
- "OTP sent to your email" message
- Input field for 6-digit code

### Step 6: Enter OTP

Check the email account and enter the 6-digit code.

**Expected OTP Email:**
- From: noreply@localhost or your configured mail
- Subject: "Verification Code"
- Contains: 6-digit code (valid for 10 minutes)

### Step 7: Verify Success

After entering OTP, you should see:
- ✅ Dashboard loads
- ✅ Sidebar shows ALL modules
- ✅ User name displays in top-right
- ✅ All admin features visible

---

## ✅ Expected Sidebar Modules for Admin

When logged in as admin, you should see:

```
HOME
└─ Home

DASHBOARD
└─ Dashboard

STUDENTS
├─ All students
├─ International students
└─ Generate Documents

HR MANAGEMENT
├─ All staff
├─ Payroll
├─ Salary
├─ Leave
├─ Leave Approvals
├─ Appraisals
└─ Payroll Settings

ADMISSIONS
├─ Applications
├─ Verifications
├─ Merit lists
├─ Offers
├─ Requirements
├─ Document types
└─ Intakes

ACADEMICS
├─ My modules
├─ Faculties
├─ Departments
├─ Programs
├─ Modules / Courses
├─ Scheduling
├─ Registrations
└─ Years & terms

ACADEMIC RECORDS
├─ Record marks
├─ All marks
├─ Exam results
├─ Deliberation
├─ Graduands
├─ Transcripts
├─ Certificates
└─ Grading scales

FINANCE
├─ Overview
├─ Billing
├─ Approvals
├─ Structures
├─ Bursaries
├─ Sponsors
├─ Expenses
├─ Refunds
├─ Balance
├─ Clearance
├─ Fines
└─ Reports

... and more

ADMINISTRATION
├─ Users
├─ Roles
├─ Permissions
├─ Settings
├─ Announcements
├─ Messages
└─ Logs
```

---

## ⚠️ Troubleshooting

### Issue: "User not found" or "Invalid credentials"

**Cause:** Email address doesn't exist or password is wrong

**Solution:**
1. Double-check the email: `faustin.niyitegeka@gmail.com` (exact spelling)
2. Try password reset if you don't remember it
3. Verify the user was properly promoted to admin (ran the promote script)

### Issue: "OTP not received"

**Cause:** Email system not configured or OTP expired

**Solution:**
1. Check if MAIL_* settings in `.env` are configured
2. Check spam folder for OTP email
3. Try "Resend OTP" button
4. If still fails, check backend logs: `backend/logs/`

### Issue: "Sidebar is empty" or "Only seeing home"

**Cause:** User doesn't have admin role or JWT token issue

**Solution:**
1. Log out and log in again
2. Clear browser cookies/cache
3. Check that user role is `admin` (ID: 1):
   ```bash
   php backend/scripts/list_users.php
   ```
4. Verify JWT token is being sent (check browser DevTools → Network tab)

### Issue: "Permission denied" on admin pages

**Cause:** Middleware not loading permissions correctly

**Solution:**
1. Check that AuthService loads permissions in JWT
2. Verify role_permissions table has admin permissions
3. Run audit:
   ```bash
   php backend/scripts/audit_rbac_fixed.php
   ```

---

## 🧪 Quick Verification Checklist

After successful login, verify these features work:

- [ ] Can access Dashboard
- [ ] Can open Students module
- [ ] Can open HR Management
- [ ] Can open Finance section
- [ ] Can open Administration section
- [ ] Can see Users panel
- [ ] Can see Roles panel
- [ ] Can see Permissions panel
- [ ] Logout works
- [ ] Can login again

---

## 📊 System Architecture Check

### Backend API Health

Check if backend is running:
```bash
curl http://localhost:8080/api/health
```

Expected response: HTTP 200 with health status

### Database Connection

Check database connection:
```bash
php backend/scripts/check_roles.php
```

Should show:
```
Available Roles:
ID: 1  | Name: admin
ID: 2  | Name: registrar
ID: 3  | Name: gate
ID: 4  | Name: guest
```

### JWT Token

After login, check the JWT token in browser:
```javascript
// Run in browser console after login
localStorage.getItem('auth_token')  // or 'cur-mis-auth' depending on storage key
```

Should return a token like: `eyJhbGciOiJIUzI1NiIs...`

---

## 🔍 Testing Admin Features

### Test 1: View Users
1. Click Administration → Users
2. Should see list of 60 users
3. Click on a user → should see details

### Test 2: View Roles
1. Click Administration → Roles
2. Should see 4 roles: admin, registrar, gate, guest
3. Click on "admin" → should see 110 permissions

### Test 3: View Permissions
1. Click Administration → Permissions
2. Should see list of 122 permissions
3. Should see permission categories

### Test 4: View Dashboard
1. Click Dashboard
2. Should see system metrics
3. Should see admin-only widgets

---

## 🛠️ If Login Fails Completely

### Step 1: Check Backend Logs

```bash
cat backend/logs/error.log  # Latest errors
```

### Step 2: Run System Audit

```bash
php backend/scripts/audit_rbac_fixed.php
```

### Step 3: Check Database Connection

```bash
php backend/scripts/check_roles.php
```

### Step 4: Check User Status

```bash
php backend/scripts/list_users.php
# Should show faustin.niyitegeka@gmail.com with Role: 1 (admin)
```

### Step 5: Review .env Configuration

Check `backend/.env`:
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=curac_save
DB_USERNAME=root
DB_PASSWORD=
JWT_SECRET=local_development_jwt_secret_change_in_production
```

---

## 🎯 Success Criteria

✅ Login successful when ALL of these work:

1. User can navigate to login page
2. User can enter email and click login
3. OTP is received in email
4. User can enter OTP and verify
5. User is redirected to dashboard
6. All admin modules visible in sidebar
7. User can click on different modules
8. User can access admin panels (Users, Roles, Permissions)
9. User can logout
10. User can login again

---

## 📞 Additional Help

### Useful Scripts

Check user roles:
```bash
php backend/scripts/list_users.php
```

View system configuration:
```bash
php backend/scripts/audit_rbac_fixed.php
```

Check table structure:
```bash
php backend/scripts/check_table_names.php
```

### Logs to Check

```
backend/logs/error.log       # PHP errors
backend/logs/debug.log       # Debug output
browser console              # Frontend errors
browser Network tab          # API calls
```

---

**System Status:** ✅ Ready for login testing  
**Last Updated:** 2026-08-19  
**Admin Email:** faustin.niyitegeka@gmail.com
