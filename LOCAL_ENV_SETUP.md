# Local Environment Setup - CUR-MIS

## Overview

This guide covers setting up the complete local development environment for the CUR-MIS system with all apps properly configured.

## ✓ Environment Files Created

All necessary `.env` files have been created for local development:

```
backend/.env                 (1054 bytes)
frontend/.env.local          (507 bytes)
file-server/.env            (753 bytes)
payment_api/.env            (1177 bytes)
```

## Configuration Details

### Backend API
- **File**: `backend/.env`
- **Port**: 8080
- **Database**: MySQL on localhost:3306
- **Database Name**: `cur_mis`
- **Features**: Debug mode enabled, CORS configured for local dev

### Frontend (React/Vite)
- **File**: `frontend/.env.local`
- **Port**: 5173 (default Vite port)
- **API URL**: http://localhost:8080/api
- **Features**: Hot module reload, TypeScript support, API proxy configured

### File Server
- **File**: `file-server/.env`
- **Port**: 9000
- **Max Upload Size**: 50MB
- **Features**: CORS enabled for local dev

### Payment API
- **File**: `payment_api/.env`
- **Port**: 8081
- **Gateway**: Mock (for local testing)
- **Features**: Debug mode enabled, webhook secrets configured

### Database
- **Host**: 127.0.0.1
- **Port**: 3306
- **Database**: cur_mis
- **User**: root (XAMPP default)
- **Password**: (empty - XAMPP default)

## Environment Variables by Service

### Backend (.env)
```
APP_NAME="CUR-MIS Backend API"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8080

DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=cur_mis
DB_USERNAME=root
DB_PASSWORD=

JWT_SECRET=local_development_jwt_secret_change_in_production
JWT_EXPIRY=604800

CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080,http://127.0.0.1:3000,http://127.0.0.1:5173

FILE_SERVER_URL=http://localhost:9000
FILE_SERVER_KEY=local_development_file_server_key

PAYMENT_API_URL=http://localhost:8081
PAYMENT_API_KEY=local_development_payment_key

MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_FROM=noreply@localhost
```

### Frontend (.env.local)
```
VITE_API_URL=http://localhost:8080/api
VITE_BASE_PATH=/
VITE_APP_NAME=CUR-MIS
VITE_APP_VERSION=1.0.0
VITE_API_TIMEOUT=15000
VITE_AUTH_STORAGE_KEY=cur-mis-auth
VITE_API_DOCS_URL=http://localhost:8080/api/api-docs.php
```

### File Server (.env)
```
APP_NAME="CUR-MIS File Server"
APP_ENV=local
APP_DEBUG=true

FILE_SERVER_KEY=local_development_file_server_key
MAX_UPLOAD_SIZE=50M

CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080,...

BACKEND_API_URL=http://localhost:8080/api
BACKEND_API_KEY=local_development_backend_key

FILE_STORAGE_PATH=./storage/uploads
MAX_FILE_SIZE=50M
ALLOWED_EXTENSIONS=pdf,doc,docx,xls,xlsx,jpg,jpeg,png,txt,zip
```

### Payment API (.env)
```
APP_NAME="CUR-MIS Payment API"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8081

PAYMENT_API_KEY=local_development_payment_key
PAYMENT_WEBHOOK_SECRET=local_development_webhook_secret

DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=cur_mis_payments
DB_USERNAME=root
DB_PASSWORD=

BACKEND_API_URL=http://localhost:8080/api
BACKEND_API_KEY=local_development_backend_key

PAYMENT_GATEWAY=mock
PAYMENT_GATEWAY_KEY=local_development_gateway_key
PAYMENT_GATEWAY_SECRET=local_development_gateway_secret

CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:8080,...

PAYMENT_CALLBACK_URL=http://localhost:8081/callback
PAYMENT_RETURN_URL=http://localhost:5173/payment/success
PAYMENT_CANCEL_URL=http://localhost:5173/payment/cancel
```

## Startup Instructions

### 1. Start Database (MySQL/MariaDB)
```bash
# Ensure MySQL is running (should start with XAMPP)
# Or manually:
net start MySQL80  # or appropriate MySQL service name
```

### 2. Create Database
```bash
mysql -u root -p
# (Leave password empty if using XAMPP default)

CREATE DATABASE cur_mis;
EXIT;
```

### 3. Run Migrations (if applicable)
```bash
cd backend
# Run your migration script or artisan command
php scripts/migrate.php
```

### 4. Start Backend API (XAMPP Apache)
Use XAMPP Control Panel to start Apache, or:
```bash
# Direct PHP server (from backend/public/)
php -S localhost:8080
```

Backend will be available at: **http://localhost:8080/api**

### 5. Start Frontend Dev Server
```bash
cd frontend
npm install  # if not already done
npm run dev
```

Frontend will be available at: **http://localhost:5173**

### 6. Start File Server (if needed)
```bash
cd file-server
# Follow the file server startup instructions
```

File Server will be available at: **http://localhost:9000**

### 7. Start Payment API (if needed)
```bash
cd payment_api
# Follow the payment API startup instructions
```

Payment API will be available at: **http://localhost:8081**

## Testing Configuration

A test script is available to validate all environment configurations:
```bash
php scratch/test-env-config.php
```

This will verify:
- ✓ All .env files exist
- ✓ Required variables are set
- ✓ Database connectivity
- ✓ Service URLs are correct

## Local Development URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend App | http://localhost:5173 | React development server |
| API Root | http://localhost:8080 | Backend root |
| API Endpoints | http://localhost:8080/api | REST API |
| API Docs | http://localhost:8080/api/api-docs.php | Swagger/OpenAPI docs |
| File Server | http://localhost:9000 | File upload/download |
| Payment API | http://localhost:8081 | Payment processing |
| MySQL | 127.0.0.1:3306 | Database server |

## Troubleshooting

### MySQL Connection Failed
- Ensure MySQL service is running: `services.msc`
- Check port 3306 is not in use
- Verify credentials in `.env`: default user=root, no password

### Frontend Can't Connect to Backend
- Ensure backend is running on port 8080
- Check CORS settings in `backend/.env`
- Verify `VITE_API_URL` in `frontend/.env.local`

### Port Already in Use
- Change port in relevant `.env` and restart service
- Or kill process using the port:
  ```bash
  netstat -ano | findstr :8080  # on Windows
  taskkill /PID <pid> /F
  ```

### Dependency Issues
- Frontend: `npm install && npm run dev`
- Ensure PHP extensions are enabled (PDO, MySQL)

## Security Notes

**⚠️ WARNING: These are development keys only!**

The following values are for local development ONLY:
- `JWT_SECRET`
- `FILE_SERVER_KEY`
- `PAYMENT_API_KEY`
- `PAYMENT_WEBHOOK_SECRET`

**NEVER use these in production.** Generate secure random keys:
```bash
# Generate secure random string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# or
openssl rand -hex 32
```

## Next Steps

1. ✓ Environment files configured
2. ✓ Variables validated
3. → Start services (see Startup Instructions above)
4. → Run migrations/seed data
5. → Access http://localhost:5173
6. → Begin development!

---

**Last Updated**: 2026-08-17
**Configuration Test**: Run `php scratch/test-env-config.php` to validate
