# Database Fix - Quick Start Guide

## 🚀 One-Command Solution

```bash
# SSH into your production server
ssh user@your-domain.com

# Navigate to project
cd /home/curac/public_html/umis

# Run the migration
mysql -h localhost -u root -p curac_save < database/migrations/fix_production_database_issues.sql

# Enter your MySQL password when prompted
```

## ✅ What This Fixes

| Error | Fixed |
|-------|-------|
| `SQLSTATE[HY000]: Illegal mix of collations` | ✅ Standardizes all collations |
| `SQLSTATE[42S02]: Table 'role_permissions' doesn't exist` | ✅ Creates missing table |
| `SQLSTATE[23000]: Column 'bank_slip_file_id' cannot be null` | ✅ Makes column nullable |
| `SQLSTATE[42S22]: Unknown column 'o.title'` | ✅ Adds missing columns |

## 📋 Pre-Migration Checklist

- [ ] Backup your database
- [ ] Schedule maintenance window
- [ ] Put app in maintenance mode
- [ ] Notify users

## 🔍 Post-Migration Verification

```bash
# Check collations are consistent
mysql -u root -p curac_save -e "SELECT TABLE_NAME, COLLATION_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'curac_save';"

# Verify role_permissions table exists
mysql -u root -p curac_save -e "DESCRIBE role_permissions;"

# Test a query that was failing
mysql -u root -p curac_save -e "SELECT u.*, r.name FROM users u JOIN roles r ON u.role_id = r.id LIMIT 1;"
```

## 📊 Migration Statistics

- **Tables Updated:** 13+
- **Indexes Added:** 7
- **New Table:** 1 (role_permissions)
- **Columns Modified:** 5+
- **Foreign Keys:** Updated for consistency
- **Estimated Time:** 2-5 minutes

## 🆘 If Something Goes Wrong

1. **Stop the application** - Put in maintenance mode
2. **Restore from backup:**
   ```bash
   mysql -u root -p curac_save < /path/to/backup.sql
   ```
3. **Check logs:**
   ```bash
   tail -f /home/curac/public_html/umis/backend/storage/logs/laravel.log
   ```
4. **Contact support** if issues persist

## 📖 Full Documentation

See `PRODUCTION_DATABASE_FIX_GUIDE.md` for:
- Detailed issue descriptions
- Multiple installation methods
- Complete verification procedures
- Rollback instructions
- Prevention tips

## 💾 Files in This Migration

```
database/migrations/
└── fix_production_database_issues.sql    ← Run this file

Documentation:
├── PRODUCTION_DATABASE_FIX_GUIDE.md      ← Full guide
├── DATABASE_FIX_QUICKSTART.md            ← This file
```

## ⏱️ Timeline

1. **Backup Database** (5 min)
2. **Run Migration** (2-5 min)
3. **Verification** (5 min)
4. **Testing** (10-15 min)
5. **Resume Operations** (0 min)

**Total Downtime:** ~30 minutes

---

## 🎯 Success Criteria

After migration, verify:

✅ No collation errors in application logs  
✅ Document generation works  
✅ Fee payment recording works (including CASH)  
✅ Role-based access control works  
✅ All queries execute without errors  

---

**Commit:** `5460ae8` | **Branch:** main | **Date:** 2026-07-04
