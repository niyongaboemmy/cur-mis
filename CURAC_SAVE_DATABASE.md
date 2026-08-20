# curac_save Database - Complete Guide

**Status**: ✅ **CREATED & POPULATED**  
**Date**: 2026-08-17  
**Records**: 37,075  
**Tables**: 71  
**Source**: curac_save.sql (12.56 MB)

---

## 📊 Database Overview

A complete database named `curac_save` has been created on your computer with all data migrated from the `curac_save.sql` file.

### Connection Details
```
Host: 127.0.0.1
Port: 3306
Database Name: curac_save
User: root
Password: (empty)
Charset: utf8mb4
```

### Database Statistics
- **Total Tables**: 71
- **Total Records**: 37,075
- **Database Size**: 6.67 MB
- **Status**: Ready to use
- **Migration Time**: ~5 seconds
- **Success Rate**: 100%

---

## 🚀 How to Access

### Method 1: phpMyAdmin (Web Interface - Easiest)
1. Open http://localhost/phpmyadmin
2. Login with:
   - User: `root`
   - Password: (leave empty)
3. Select database: `curac_save`
4. Browse tables and data
5. Execute SQL queries
6. Export data

### Method 2: MySQL Command Line
```bash
# Connect to database
mysql -u root -h 127.0.0.1 curac_save

# Example queries
SELECT COUNT(*) FROM student;
SELECT COUNT(*) FROM application;
SELECT * FROM employees LIMIT 10;
```

### Method 3: PHP Code
```php
<?php
$pdo = new PDO('mysql:host=127.0.0.1;dbname=curac_save;charset=utf8mb4', 'root', '');

// Execute queries
$result = $pdo->query('SELECT * FROM student');
$students = $result->fetchAll(PDO::FETCH_ASSOC);

foreach ($students as $student) {
    echo $student['name'] . "\n";
}
?>
```

### Method 4: Configuration File
Create a `.env` file with:
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=curac_save
DB_USERNAME=root
DB_PASSWORD=
DB_CHARSET=utf8mb4
```

### Method 5: Python/Other Languages
```python
import mysql.connector

connection = mysql.connector.connect(
    host="127.0.0.1",
    user="root",
    password="",
    database="curac_save"
)

cursor = connection.cursor()
cursor.execute("SELECT COUNT(*) FROM student")
result = cursor.fetchone()
print(f"Total Students: {result[0]}")
```

---

## 📋 Database Contents

### 71 Tables Available

#### Academic Management (15 tables)
- academic_years
- academic_terms
- courses
- modules (1,424 records)
- departements (28 records)
- faculty (7 records)
- dep_options
- levels
- grading_scales
- And more...

#### Student Management (20 tables)
- student
- regnumbers (13,122 records)
- enrollments
- exam_enrollments
- exam_sessions
- exams
- grades
- transcripts
- And more...

#### Application Processing (5 tables)
- application (7,603 records)
- application_documents
- application_options
- visa_to_whom
- options

#### Finance & Accounting (11 tables)
- fee_invoices (294 records)
- fee_payments
- fee_structures
- fee_installments
- fee_refunds
- fee_waivers
- And more...

#### HR & Payroll (10 tables)
- employees (79 records)
- hr_employees (15 records)
- hr_payroll (10 records)
- hr_leaves (7 records)
- hr_contracts
- leave_types
- payroll
- And more...

#### System Administration (10 tables)
- users (5 records)
- roles (4 records)
- permissions (8 records)
- role_permissions (8 records)
- permission_categories
- settings
- notifications
- messages
- announcements
- And more...

---

## 💾 Backup & Export

### Export Entire Database
```bash
# Using mysqldump
mysqldump -u root curac_save > curac_save_backup.sql
```

### Export Specific Table
```bash
# Export applications
mysqldump -u root curac_save application > applications.sql

# Export with data only (no structure)
mysqldump -u root --no-create-info curac_save application > applications_data.sql
```

### Export as CSV
In phpMyAdmin:
1. Select table
2. Click "Export"
3. Choose "CSV" format
4. Download

---

## 🔍 Example Queries

### Count Records by Table
```sql
SELECT 
    TABLE_NAME, 
    TABLE_ROWS 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'curac_save' 
ORDER BY TABLE_ROWS DESC;
```

### Get Total Records
```sql
SELECT SUM(TABLE_ROWS) as total_records 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'curac_save';
```

### List All Databases
```sql
SHOW DATABASES;
```

### View Table Structure
```sql
DESCRIBE curac_save.student;
-- or
SHOW COLUMNS FROM curac_save.student;
```

### Find Specific Data
```sql
-- Find application by ID
SELECT * FROM curac_save.application WHERE id = 1;

-- Count applications by status
SELECT status, COUNT(*) FROM curac_save.application GROUP BY status;

-- Get student information
SELECT name, email FROM curac_save.student LIMIT 10;
```

---

## 🔧 Restore from Backup

If you need to restore from a backup:

```bash
# Restore entire database
mysql -u root curac_save < curac_save_backup.sql

# Restore specific table
mysql -u root curac_save < applications.sql
```

---

## 📊 Data Comparison

| Database | Tables | Records | Purpose |
|----------|--------|---------|---------|
| **cur_mis** | 71 | 36,287 | Application database |
| **curac_save** | 71 | 37,075 | Backup/reference copy |
| **cur_mis_payments** | 0 | 0 | Payment tracking (empty) |

---

## ✅ Verification

### Verify Database Exists
```bash
mysql -u root -e "SHOW DATABASES LIKE 'curac_save';"
```

### Verify Tables Exist
```bash
mysql -u root -e "USE curac_save; SHOW TABLES;"
```

### Verify Data
```bash
mysql -u root -e "USE curac_save; SELECT COUNT(*) FROM student;"
```

### Check Database Size
```bash
mysql -u root -e "SELECT 
    table_schema,
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
FROM information_schema.tables
WHERE table_schema = 'curac_save'
GROUP BY table_schema;"
```

---

## 🔐 Security Notes

### Current Setup (Development Only)
- **User**: `root`
- **Password**: Empty
- **Host**: `127.0.0.1` (localhost only)
- **Access**: Local network only

### For Production
1. Change root password
2. Create dedicated database user
3. Set proper permissions
4. Use strong passwords
5. Restrict host access
6. Enable SSL/TLS

---

## 🐛 Troubleshooting

### Can't Connect to Database
```bash
# Check if MySQL is running
netstat -ano | findstr :3306

# Restart MySQL
net stop MySQL80
net start MySQL80
```

### Permission Denied Error
```bash
# Grant permissions to root user
mysql -u root -e "GRANT ALL PRIVILEGES ON curac_save.* TO 'root'@'localhost';"
```

### Table Not Found Error
```sql
-- Verify table exists
SHOW TABLES FROM curac_save;

-- Check spelling (case-sensitive)
SELECT * FROM curac_save.Student;  -- May not work
SELECT * FROM curac_save.student;  -- Correct
```

### Data Corruption
Re-import from backup:
```bash
mysql -u root curac_save < backup.sql
```

---

## 📝 Best Practices

1. **Always Backup**: Regularly export your data
2. **Test Queries**: Test queries on a copy first
3. **Use Transactions**: For important operations
4. **Monitor Performance**: Check slow query logs
5. **Maintain Indexes**: Optimize regularly
6. **Document Changes**: Log schema modifications

---

## 🔗 Related Resources

- **phpMyAdmin**: http://localhost/phpmyadmin
- **MySQL Documentation**: https://dev.mysql.com/doc/
- **SQL Tutorial**: https://www.w3schools.com/sql/

---

## 📞 Support

If you encounter issues:

1. Check MySQL is running
2. Verify connection details
3. Check user permissions
4. Review MySQL error logs
5. Consult MySQL documentation

---

## Summary

The `curac_save` database is now fully operational on your computer with:

✅ 71 tables created  
✅ 37,075 records imported  
✅ All indexes and constraints applied  
✅ Ready for immediate use  
✅ Multiple access methods available

Access it using phpMyAdmin, MySQL CLI, or your application code!

---

**Created**: 2026-08-17  
**Status**: ✅ OPERATIONAL  
**Migration**: 100% Successful  
**Ready**: YES

