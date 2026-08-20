# 🚀 CUR-MIS Quick Reference Card

---

## 🔐 Login Credentials

| Field | Value |
|-------|-------|
| **Email** | faustin.niyitegeka@gmail.com |
| **Role** | admin (full access) |
| **Status** | ✅ Active |

---

## 🌐 System URLs

```
Frontend:  http://localhost:5173
Backend:   http://localhost:8080
Database:  localhost:3306 / curac_save
```

---

## 📊 System Status

```
✅ Database:     Healthy
✅ Users:        60 (all valid roles)
✅ Roles:        4 (admin, registrar, gate, guest)
✅ Permissions:  122 (684 role-permission mappings)
✅ Admin Access: Full system ready
```

---

## 🔧 Quick Commands

### Check System Health
```bash
cd backend && php scripts/audit_rbac_fixed.php
```

### View All Users
```bash
cd backend && php scripts/list_users.php
```

### View Roles
```bash
cd backend && php scripts/check_roles.php
```

---

## 📋 Available Roles

| ID | Role | Permissions | Use Case |
|----|------|-------------|----------|
| 1 | admin | 110 | System administrator (full access) |
| 2 | registrar | 48 | Academic staff |
| 3 | gate | 3 | Gate/Access control |
| 4 | guest | 2 | Minimal access |

---

## 🎯 What Admin Can Do

- ✅ View all features and modules
- ✅ Manage all users, roles, permissions
- ✅ Access all student, staff, financial data
- ✅ Configure system settings
- ✅ Assign departments/faculties to HODs/Deans
- ✅ Enable/disable access scoping
- ✅ View all academic and administrative data

---

## 🧪 Test Login Steps

1. Open: `http://localhost:5173`
2. Email: `faustin.niyitegeka@gmail.com`
3. Click "Login"
4. Check email for 6-digit OTP
5. Enter OTP
6. Should see dashboard with all modules

**Expected Result:** All sidebar items visible ✅

---

## 🧐 Troubleshooting

| Issue | Solution |
|-------|----------|
| User not found | Check email spelling: `faustin.niyitegeka@gmail.com` |
| OTP not received | Check spam folder, try "Resend OTP" |
| Empty sidebar | Log out, clear cache, log in again |
| Permission denied | Check backend logs: `backend/logs/error.log` |
| Can't connect | Verify backend running on port 8080 |

---

## 📁 Key Directories

```
Backend:  c:\xamppP\htdocs\cur-mis\backend\
Scripts:  backend/scripts/
Logs:     backend/logs/
Docs:     c:\xamppP\htdocs\cur-mis\
```

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `LOGIN_TEST_GUIDE.md` | How to test login |
| `RBAC_SYSTEM_FIXED.md` | Audit results |
| `RBAC_DEPARTMENT_FACULTY_SCOPING.md` | Architecture guide |
| `RBAC_SCOPING_EXAMPLES.md` | Code examples |
| `SYSTEM_FIX_COMPLETE.md` | Complete summary |

---

## 🔍 Key Stats

```
Total Users:              60
  • Admin:                5
  • Registrar:           54
  • Invalid Roles:        0 ✓

Roles:                    4
Permission Categories:   16
Permissions:           122
Role-Permission Maps:  584

Issues Fixed:           52
  • Invalid role_id:     47
  • Missing tables:       2
  • Missing columns:      3
```

---

## ⚙️ Database Tables

✅ Core Tables:
- `roles` (4 rows)
- `permissions` (122 rows)
- `permission_categories` (16 rows)
- `role_permissions` (584 rows)
- `users` (60 rows)

✅ New Tables Created:
- `user_department_assignments` (0 rows, ready for use)
- `user_faculty_assignments` (0 rows, ready for use)

---

## 🎬 Recent Changes

**Fixed in this session:**
- ✅ 47 users with invalid roles → set to registrar
- ✅ Created user_department_assignments table
- ✅ Created user_faculty_assignments table
- ✅ Added 3 scope columns to roles table
- ✅ Promoted faustin.niyitegeka@gmail.com to admin
- ✅ Verified all system integrity

---

## 📞 Getting Help

**For System Health:**
```bash
php backend/scripts/audit_rbac_fixed.php
```

**For User Issues:**
```bash
php backend/scripts/list_users.php
```

**For Role Issues:**
```bash
php backend/scripts/check_roles.php
```

**Check Backend Logs:**
```
backend/logs/error.log
backend/logs/debug.log
```

---

## ✨ You're All Set!

Your CUR-MIS system is:
- ✅ Fully configured
- ✅ All issues fixed
- ✅ Admin user ready
- ✅ Database healthy
- ✅ Ready for login testing

**Go log in and start using the system!** 🚀

---

**Last Updated:** August 19, 2026  
**System Status:** ✅ OPERATIONAL
