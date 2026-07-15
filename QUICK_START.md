# Quick Start Guide - CUR Fee Billing System

## ⚡ 30-Second Setup

### Terminal 1: Start Backend API
```bash
cd C:\xamppP\htdocs\cur-mis
php backend-dev-server.php
```
**Output**: `Starting PHP development server at 127.0.0.1:9000`

### Terminal 2: Start Frontend
```bash
cd C:\xamppP\htdocs\cur-mis\frontend
npm run dev
```
**Output**: `➜  Local: http://localhost:5180`

### Open Browser
```
http://localhost:5180
```

## 🔑 Login Credentials
- **Email**: `faustinganzasheila@gmail.com`
- **Password**: `Admin@1234`
- **2FA Code**: Check console output for `dev_otp` (appears in network response)

## 📍 Key Pages

| Feature | URL | Permission |
|---------|-----|------------|
| Fee Structures | `/finance/structures` | MANAGE_FINANCE |
| Bulk Import CSV | Click "Import CSV" button | MANAGE_FINANCE |
| Per-Credit Rates | `/finance/per-credit-rates` | MANAGE_FINANCE |
| Student Billing | `/finance/billing` | MANAGE_FINANCE |
| Student Ledger | `/finance/billing/:studentId` | VIEW_FINANCE |
| Download Bill PDF | Click "Download Bill" button | VIEW_FINANCE |

## 📊 Testing the Billing System

### 1. Create a Fee Structure
1. Go to Finance > Fee Structures
2. Click "New structure"
3. Fill in:
   - Academic Year: 2025/2026
   - Department: Any department
   - Level: Year 1
   - Fee Type: TUITION
   - Label: Tuition (2025/2026)
   - Amount: 206250
4. Click "Create structure"

### 2. Bulk Import (CSV)
1. Prepare CSV file with columns:
   ```
   academic_year_label,department_name,level_name,fee_type_code,label,amount,semester,payment_plan,installment_count
   2025/2026,Bachelor's Degree in Computer Science,Year 1,TUITION,Tuition Sem 1,206250,1,per_semester,
   2025/2026,Bachelor's Degree in Computer Science,Year 1,TUITION,Tuition Sem 2,206250,2,per_semester,
   2025/2026,Bachelor's Degree in Computer Science,Year 1,REGISTRATION,Registration,25000,1,full_year,
   ```

2. Click "Import CSV"
3. Select file
4. Review preview
5. Click "Import"

### 3. Manage Per-Credit Rates
1. Go to Finance > Per-Credit Rates
2. Click "New rate"
3. Fill in:
   - Academic Year: 2025/2026
   - Faculty: Engineering
   - Amount per Credit: 5000
4. Click "Create rate"

### 4. Generate & Download Student Bill
1. Go to Finance > Billing
2. Find student in list
3. Click download icon to get PDF, or click arrow to view ledger
4. In ledger view, click "Download Bill" to generate complete statement
5. Individual invoices have download icons on each row

## 🧪 Testing API Directly

### Test Login (Request OTP)
```bash
curl -X POST http://localhost:5180/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"faustinganzasheila@gmail.com","password":"Admin@1234"}'
```
**Response**: Returns `dev_otp` code in data

### Test Fee Types
```bash
curl http://localhost:5180/api/finance/fee-types
```

### Test Per-Credit Rates
```bash
curl http://localhost:5180/api/finance/per-credit-rates?academic_year_id=1
```

### Test Bulk Import
```bash
curl -X POST http://localhost:5180/api/finance/structures/bulk-import \
  -H "Content-Type: application/json" \
  -d '{
    "rows": [
      {
        "academic_year_label": "2025/2026",
        "department_name": "Bachelor'\''s Degree in Computer Science",
        "level_name": "Year 1",
        "fee_type_code": "TUITION",
        "label": "Tuition",
        "amount": 206250,
        "semester": 1,
        "payment_plan": "per_semester"
      }
    ]
  }'
```

## 🐛 Troubleshooting

### "API 404" Error
**Solution**: Check backend is running on port 9000
```bash
curl http://localhost:9000/api/auth/login
```

### "Cannot find module" Error in Frontend
**Solution**: Install dependencies
```bash
cd frontend
npm install
```

### MySQL Connection Error
**Verify**:
```bash
php -r "new PDO('mysql:host=localhost', 'root', ''); echo 'Connected!';"
```

### Port Already in Use
**Frontend (5180)**:
```bash
lsof -i :5180
kill -9 <PID>
```

**Backend (9000)**:
```bash
lsof -i :9000
kill -9 <PID>
```

Or change in `vite.config.ts`:
```typescript
port: 5181  // use different port
```

## 📝 Environment Variables

### Frontend (`.env`)
```
VITE_API_URL=              # Empty for dev (uses proxy)
VITE_BASE_PATH=/           # Frontend base path
```

### Backend (`.env`)
```
DB_HOST=localhost
DB_DATABASE=curac_save
DB_USERNAME=root
DB_PASSWORD=
```

## ✅ Verification Checklist

- [x] MySQL running with curac_save database
- [x] PHP 8.0+ installed and working
- [x] Node.js 16+ and npm working
- [x] Backend on port 9000: `php backend-dev-server.php`
- [x] Frontend on port 5180: `npm run dev`
- [x] Login works with OTP
- [x] Fee types visible (19+ types)
- [x] Per-credit rates table exists
- [x] Can create fee structure
- [x] Can download student bill PDF

## 📚 Full Documentation

See `IMPLEMENTATION_SUMMARY.md` for complete technical documentation.

## 🆘 Need Help?

1. Check browser console (F12) for errors
2. Check PHP dev server terminal for logs
3. Check Vite dev terminal for build errors
4. Query database directly:
   ```bash
   mysql -u root curac_save
   SELECT * FROM fee_types WHERE sort_order >= 11;
   ```

## 🚀 Next Steps

1. **Load Real Fee Schedule**: Update fees from 2025/2026 CUR PDF
2. **Generate Student Invoices**: Use Finance > Billing > Generate Invoices
3. **Record Payments**: Track payments and mark invoices as paid
4. **Generate Reports**: View revenue and collection analytics
5. **Email Students**: (Future feature) Send bill PDFs via email

---

**Ready to go!** 🎉

Backend running on: http://localhost:9000
Frontend running on: http://localhost:5180

Start with the login page and explore the Finance module.
