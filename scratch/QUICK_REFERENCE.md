# Quick Reference Card - Expired Offers

## 🔴 Problem: "This offer has expired"

A student sees this error when trying to accept admission.

## ✅ Quick Fix: Extend the Offer (2 minutes)

### Option A: Web Interface (Recommended)
```
1. Go: Admissions > Offers
2. Filter: "Expired"
3. Search: Student name
4. Click: [Extend]
5. Set: New date (e.g., Dec 31, 2026)
6. Done! ✓
```

### Option B: Admin Tool
```
1. Open: http://localhost/cur-mis/backend/public/admin-extend-offer.php
2. Enter: Student email
3. Click: [Search Student]
4. Click: [Extend]
5. Set: New date
6. Done! ✓
```

---

## 📋 Checklist

- [ ] I can see "Expired" offers in the admin panel
- [ ] I can search for students by name/email
- [ ] I can extend an offer expiration date
- [ ] Student can now accept the offer
- [ ] Database was updated (status: pending, expires_at: new date)

---

## 🔑 Key Features

| Feature | What It Does |
|---------|-------------|
| **Search Box** | Find students by name, email, reference |
| **Status Filter** | Show only Expired/Pending/Accepted offers |
| **Extend Button** | Opens modal to set new expiration date |
| **Admin Tool** | Standalone tool for extending offers (URL) |

---

## 🎯 Common Tasks

### View All Expired Offers
```
Admissions > Offers > [All statuses ▼] > Expired
```

### Find Specific Student
```
[🔍 Search box] > Type name/email > Enter
```

### Extend One Offer
```
[Extend] > [Pick date] > [Extend Offer] > ✓ Done
```

### Extend Multiple Offers
```
Repeat "Extend One Offer" for each student
```

---

## ⚠️ Important Notes

- Expired offers have status: "expired"
- After extending, status becomes: "pending"
- Set new date at least 30-60 days in future
- Student must log out and back in to see changes
- Email notifies student automatically (optional)

---

## 🆘 Troubleshooting

### Search returns no results
- Check spelling of email/name
- Try alternative search (email vs name)

### Can't find admin tool
- URL: `http://localhost/cur-mis/backend/public/admin-extend-offer.php`

### Student still sees expired error
- Clear browser cache (Ctrl+Shift+Delete)
- Have student log out and back in
- Refresh the admin page to verify change

---

## 📊 What Gets Updated

**Before:**
- expires_at: 2025-09-01
- status: expired

**After:**
- expires_at: 2026-12-31 ← NEW
- status: pending ← CHANGED

---

## ⏱️ Time Estimates

- Find expired offers: 1 min
- Locate student: 30 sec
- Extend offer: 30 sec
- **Total: ~2 minutes**

---

## 📞 Who Can Extend Offers

- ✅ Admissions Office Staff
- ✅ System Administrators
- ✅ Anyone with MANAGE_ADMISSIONS permission

---

## 🚀 Next Steps

1. **Try it:** Use the admin interface
2. **Test:** Search for an expired offer
3. **Practice:** Extend a date
4. **Confirm:** Check database updated

---

## 📖 Full Documentation

- **Visual Guide:** `EXPIRED_OFFERS_VISUAL_GUIDE.md`
- **API Reference:** `EXPIRED_OFFERS_API_REFERENCE.md`
- **Solution Details:** `EXPIRED_OFFERS_SOLUTION.md`
- **Completion Summary:** `COMPLETION_SUMMARY.md`

---

**Version:** 1.0  
**Date:** September 19, 2026  
**Status:** Active ✅
