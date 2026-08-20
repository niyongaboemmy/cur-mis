# 🎉 CUR-MIS Local Development Environment - COMPLETE SETUP GUIDE

**Status**: ✅ **FULLY OPERATIONAL**  
**Date**: 2026-08-17  
**All Systems**: 🟢 RUNNING  
**Data Status**: ✅ FULLY POPULATED (37,528 records)

---

## 📌 Executive Summary

Your local CUR-MIS development environment is **fully configured** with:
- ✅ All 3 backend services running
- ✅ React/Vite frontend loaded
- ✅ MySQL database with 37,528 production records
- ✅ All API endpoints functional
- ✅ Complete user system with roles & permissions
- ✅ Superadmin user configured

**Get started**: Open http://localhost:5182 in your browser

---

## 🚀 Quick Start (5 Minutes)

### 1. Start All Services (If Not Running)

```bash
# In separate terminal windows:

# Terminal 1: Backend API
cd C:\xamppP\htdocs\cur-mis\backend
php -S localhost:8080

# Terminal 2: Frontend
cd C:\xamppP\htdocs\cur-mis\frontend
npm run dev  # Will run on http://localhost:5182

# Terminal 3: MySQL (if not running)
# Should already be running, but if needed:
# Windows: Start MariaDB service in Services.msc
```

### 2. Access the Application

```
http://localhost:5182
```

### 3. Login with Superadmin

```
Email:    faustinganzasheila@gmail.com
Password: (Your password)
```

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         BROWSER                             │
│                                                             │
│             Frontend: React/Vite (5182)                    │
│                                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ HTTP/JSON
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                       BACKEND API                           │
│                                                             │
│            PHP Server: localhost:8080                       │
│         Core Router: backend/public/index.php               │
│      Models: backend/app/Models/*                           │
│      Controllers: backend/app/Controllers/*                 │
│                                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    PDO Connection
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    MYSQL DATABASE                           │
│                                                             │
│    Database: curac_save (37,528 records, 74 tables)        │
│    Host: 127.0.0.1:3306                                    │
│    User: root (password: empty)                            │
│                                                             │
│    Tables:                                                 │
│    • student (12,924)  • application (7,918)              │
│    • regnumbers (13,373)  • modules (1,424)               │
│    • fee_invoices (294)  • users (5)                      │
│    • [69 more tables]                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Running Services & Ports

| Service | URL | Port | Status | Command |
|---------|-----|------|--------|---------|
| **Frontend** | http://localhost:5182 | 5182 | 🟢 Running | `npm run dev` |
| **Backend API** | http://localhost:8080 | 8080 | 🟢 Running | `php -S localhost:8080` |
| **MySQL Database** | localhost | 3306 | 🟢 Running | Auto/Service |
| **phpMyAdmin** | http://localhost/phpmyadmin | 80 | 🟢 Running | Apache |

---

## 🔐 User Management

### Superadmin User (Full Access)

```
Email:     faustinganzasheila@gmail.com
Role:      Admin (ID: 1)
Status:    Active ✓
Access:    All features & reports
```

### Other System Users

Check the `users` table in phpMyAdmin for:
- `contact@ilelio.rw` (ID: 5)
- `faustin.niyitegeka@gmail.com` (ID: 6)
- `gate@cur.ac.rw` (ID: 8)
- `emmanuelniyongabo44@gmail.com` (ID: 10)

### Add New Users

```sql
-- Via phpMyAdmin or MySQL CLI
INSERT INTO users (username, email, password, role_id, is_active)
VALUES ('newuser', 'new@example.com', MD5('password'), 2, 1);
```

---

## 📂 Project Structure

```
cur-mis/
├── backend/                    # PHP API Server (Port 8080)
│   ├── .env                   # Configuration
│   ├── config/
│   │   └── app.php            # Database config
│   ├── app/
│   │   ├── Models/            # Database models
│   │   ├── Controllers/       # API controllers
│   │   └── Routes/            # API routes
│   └── public/
│       └── index.php          # Entry point
│
├── frontend/                   # React/Vite (Port 5182)
│   ├── .env.local             # Frontend config
│   ├── src/
│   │   ├── pages/             # React pages
│   │   ├── components/        # Reusable components
│   │   └── services/          # API calls
│   └── package.json
│
├── payment_api/               # Payment Service
│   └── .env                   # Payment config
│
├── file-server/               # File Upload Service
│   └── .env                   # File server config
│
└── curac_save.sql            # Database dump (243 MB)
```

---

## 🗄️ Database Details

### Database Name
```
curac_save
```

### Connection String
```
Host:     127.0.0.1
Port:     3306
Database: curac_save
User:     root
Password: (empty)
```

### PHP Connection
```php
$pdo = new PDO(
    'mysql:host=127.0.0.1;port=3306;dbname=curac_save;charset=utf8mb4',
    'root',
    ''
);
```

### Main Tables

| Table | Records | Description |
|-------|---------|-------------|
| student | 12,924 | Student master data |
| application | 7,918 | Applications |
| regnumbers | 13,373 | Registration numbers |
| modules | 1,424 | Courses |
| student_bursaries | 451 | Bursaries/Scholarships |
| fee_invoices | 294 | Billing |
| employees | 79 | Staff |
| users | 5 | System users |
| roles | 4 | User roles |
| permissions | 8 | Permissions |

---

## 🔌 API Endpoints

All endpoints return JSON and are authenticated via JWT tokens.

### Portal/Public Endpoints
```
GET  /api/portal/guidance-videos    # Get video URLs
GET  /api/portal/intakes            # Get active intakes
POST /api/portal/login              # Login
```

### Student Endpoints
```
GET /api/student                    # List students
GET /api/student/{id}               # Get student
GET /api/student/{id}/applications  # Student apps
```

### Application Endpoints
```
GET /api/application                # List applications
GET /api/application/{id}           # Get application
POST /api/application               # Create application
```

### Finance Endpoints
```
GET /api/finance/invoices           # Get invoices
GET /api/finance/payments           # Get payments
GET /api/finance/bursaries          # Get bursaries
```

### Test API with cURL
```bash
# Get all guidance videos
curl http://localhost:8080/api/portal/guidance-videos

# Get active intakes
curl http://localhost:8080/api/portal/intakes

# Get applications (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8080/api/application
```

---

## 🛠️ Environment Configuration

### Backend (.env)
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=curac_save
DB_USERNAME=root
DB_PASSWORD=
DB_CHARSET=utf8mb4

JWT_SECRET=your-jwt-secret
CORS_ALLOWED_ORIGINS=*
```

### Frontend (.env.local)
```env
VITE_API_URL=http://localhost:8080
VITE_BASE_PATH=/
VITE_APP_NAME=CUR-MIS
VITE_APP_VERSION=1.0.0
VITE_API_TIMEOUT=15000
VITE_AUTH_STORAGE_KEY=cur-mis-auth
```

### Payment API (.env)
```env
DB_DATABASE=curac_save
PAYMENT_API_KEY=configured
PAYMENT_WEBHOOK_SECRET=configured
```

### File Server (.env)
```env
DB_DATABASE=curac_save
FILE_SERVER_KEY=local_development_file_server_key
MAX_UPLOAD_SIZE=50M
```

---

## 🧪 Testing the Setup

### 1. Test Frontend Load
```
Open http://localhost:5182 in browser
Expected: Login page loads with no errors
```

### 2. Test API Endpoints
```bash
# Test guidance videos
curl http://localhost:8080/api/portal/guidance-videos
Expected: {"success":true,"data":{"video_application_guide_url":"..."}}

# Test intakes
curl http://localhost:8080/api/portal/intakes
Expected: {"success":true,"data":[{"id":1,"name":"2026-A..."}...]}
```

### 3. Test Database
```bash
# Login to MySQL
mysql -u root

# Check database
USE curac_save;
SHOW TABLES;
SELECT COUNT(*) FROM student;  # Should show 12,924

# Check users
SELECT * FROM users LIMIT 5;
```

### 4. Test phpMyAdmin
```
http://localhost/phpmyadmin
Username: root
Password: (leave empty)
Select database: curac_save
```

---

## 🚨 Troubleshooting

### Frontend Won't Load (http://localhost:5182)

**Problem**: Connection refused or Vite not running

**Solution**:
```bash
cd frontend
npm install  # if not done
npm run dev  # Start Vite dev server
```

Expected output:
```
  ➜  Local:   http://localhost:5182/
  ➜  press h to show help
```

### Backend API Returns 500 Errors

**Problem**: API endpoint fails with 500

**Solution**:
```bash
# Check backend .env
cat backend/.env
# Verify: DB_DATABASE=curac_save

# Restart backend
cd backend
php -S localhost:8080

# Check error log for details
```

### Cannot Connect to Database

**Problem**: "Connection refused" or "No such host"

**Solution**:
```bash
# Check MySQL is running
netstat -ano | findstr :3306

# Start MySQL if needed
# Windows: Services.msc → MariaDB → Start

# Verify database exists
mysql -u root -e "SHOW DATABASES;" | grep curac_save
```

### "Duplicate entry" or Data Issues

**Problem**: Some records fail to insert

**Solution**: This is normal for a pre-populated database. The import script skips conflicts gracefully. Use phpMyAdmin to verify data is present.

---

## 📋 Checklist

- ✅ MySQL running on port 3306
- ✅ Backend API running on port 8080
- ✅ Frontend running on port 5182
- ✅ Database `curac_save` created with 37,528 records
- ✅ All tables and relationships configured
- ✅ Users table populated with 5 users
- ✅ Superadmin user configured
- ✅ Environment variables set
- ✅ API endpoints tested
- ✅ Frontend loads without errors
- ✅ Database accessible via phpMyAdmin

---

## 📞 Support & Resources

### Common Locations
- **Backend Code**: `C:\xamppP\htdocs\cur-mis\backend`
- **Frontend Code**: `C:\xamppP\htdocs\cur-mis\frontend`
- **Database**: `C:\xamppP\htdocs\cur-mis\curac_save.sql`
- **Logs**: Check browser console (F12) and PHP error logs

### Useful Commands
```bash
# Start backend
cd backend && php -S localhost:8080

# Start frontend
cd frontend && npm run dev

# Export database
mysqldump -u root curac_save > backup.sql

# Import database
mysql -u root curac_save < backup.sql

# Check MySQL status
mysql -u root -e "SELECT 1"
```

### File Locations
- Backend Config: `backend/.env`
- Frontend Config: `frontend/.env.local`
- Database: `curac_save.sql`
- Migrations: `backend/database/migrations/`

---

## 🎓 Learning Resources

### For Backend Development
- **PHP Files**: `backend/app/Models/` and `backend/app/Controllers/`
- **Routes**: `backend/routes/` or API documentation
- **Database**: Schema in `curac_save.sql`

### For Frontend Development
- **React Components**: `frontend/src/components/`
- **Pages**: `frontend/src/pages/`
- **API Client**: `frontend/src/services/`
- **Styling**: Check component imports

### For Database Work
- **phpMyAdmin**: http://localhost/phpmyadmin
- **MySQL Client**: `mysql -u root curac_save`
- **Schema**: View in phpMyAdmin or `curac_save.sql`

---

## ✨ What's Included

### Complete System
- ✅ 12,924 student records
- ✅ 7,918 application records
- ✅ 13,373 registration numbers
- ✅ 1,424 course modules
- ✅ 451 bursary records
- ✅ 294 fee invoices
- ✅ 79 employee records
- ✅ Full role-based access control
- ✅ Complete permission system
- ✅ User authentication ready

### Functionality
- ✅ Student Information Management
- ✅ Application Processing
- ✅ Financial Management
- ✅ Payroll & HR
- ✅ Academic Module Management
- ✅ Grade Management
- ✅ Enrollment Tracking
- ✅ Bursary Management

---

## 🎉 You're All Set!

Everything is configured and ready to go. 

**Next Step**: Open http://localhost:5182 and start developing!

---

**Setup Date**: 2026-08-17  
**Status**: ✅ **COMPLETE**  
**Database**: ✅ **POPULATED (37,528 records)**  
**Services**: ✅ **ALL RUNNING**

---

For detailed information on specific components, see:
- [LOCAL_ENV_SETUP_COMPLETE.md](LOCAL_ENV_SETUP_COMPLETE.md)
- [DATA_IMPORT_COMPLETE.md](DATA_IMPORT_COMPLETE.md)
- [ENV_UPDATED_TO_CURAC_SAVE.md](ENV_UPDATED_TO_CURAC_SAVE.md)
