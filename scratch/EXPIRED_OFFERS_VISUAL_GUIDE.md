# Visual Step-by-Step Guide - Fixing Expired Offers

## 🎯 Goal
Help a student who sees "This offer has expired" error accept their admission.

---

## Method 1: Using the Web Interface (Fastest)

### Step 1: Open Admissions > Offers
```
URL: https://cur.ac.rw/umis/admin/admissions/offers
```
```
┌─────────────────────────────────────────────────────────┐
│ CUR-MIS - Admin Dashboard                              │
├─────────────────────────────────────────────────────────┤
│ Left Menu:                                              │
│ ├─ Home                                                 │
│ ├─ Students                                             │
│ ├─ HR Management                                        │
│ ├─ Admissions                                           │
│ │  ├─ Applications                                      │
│ │  ├─ Verifications                                     │
│ │  ├─ Merit lists                                       │
│ │  ├─ Offers              ← CLICK HERE                  │
│ │  ├─ Requirements                                      │
│ │  └─ Intakes                                           │
│ └─ ...                                                  │
└─────────────────────────────────────────────────────────┘
```

### Step 2: You See the Offers Page
```
┌──────────────────────────────────────────────────────────────────┐
│  🤝 Registered Applications                                  120  │
│     120 registered students                                      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🔍 Search by name, email, reference... [X]             │   │
│  │     [All statuses ▼]  [Bulk Send Letters] [Bulk Offer] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Table with all offers...                                       │
└──────────────────────────────────────────────────────────────────┘
```

### Step 3: Filter to Show Expired Offers
```
Click on dropdown: [All statuses ▼]

Shows options:
┌──────────────────┐
│ All statuses   ✓ │
│ Pending          │
│ Accepted         │
│ Expired        ← SELECT THIS
│ Declined         │
└──────────────────┘
```

**After selecting "Expired":**
```
┌───────────────────────────────────────────────────────────────────┐
│  Showing 8 expired offers                                         │
└───────────────────────────────────────────────────────────────────┘
```

### Step 4: Search for Student
```
Type in search box: John Doe (or their email)

┌────────────────────────────────────────────────────┐
│ 🔍 John Doe                                    [X]│
└────────────────────────────────────────────────────┘

Results filtered to 1 student:
```

### Step 5: View the Table
```
┌─────────────────────────────────────────────────────────────────────┐
│ REFERENCE   │ APPLICANT        │ PROGRAM    │ STATUS  │ ACTIONS    │
├─────────────────────────────────────────────────────────────────────┤
│ OFF-2026... │ John Doe         │ Computer   │ expired │ [Letter]   │
│             │ john@email.com   │ Science    │         │ [Download] │
│             │                  │            │         │ [Send]     │
│             │                  │            │         │ [EXTEND] ←─┤ CLICK
└─────────────────────────────────────────────────────────────────────┘
```

### Step 6: Click "EXTEND" Button

A modal popup appears:

```
┌──────────────────────────────────────┐
│  ✏️ Extend Offer                    │
├──────────────────────────────────────┤
│                                      │
│ Extending offer for: John Doe       │
│                                      │
│ New Expiration Date:                │
│ ┌────────────────────────────────┐ │
│ │ 2026-12-31        [📅 Pick]   │ │
│ └────────────────────────────────┘ │
│                                      │
│  [✓ Extend Offer]  [✕ Cancel]      │
└──────────────────────────────────────┘
```

### Step 7: Set New Date
```
Click on date field: [2026-12-31]

Calendar appears:
┌──────────────────┐
│  December 2026   │
├──────────────────┤
│ Su Mo Tu We Th..│
│  1  2  3  4  5  │
│  6  7  8  9 10  │
│ ... ... ... ...  │
│ 29 30 31    ← CLICK
└──────────────────┘

Selected: 2026-12-31
```

### Step 8: Click "Extend Offer"
```
✓ Offer extended successfully to: 2026-12-31
```

**Done!** The offer is now extended. ✅

---

## Method 2: Using Admin Tool (Alternative)

### Step 1: Open Admin Tool
```
URL: http://localhost/cur-mis/backend/public/admin-extend-offer.php
```

```
┌──────────────────────────────────────────────────┐
│  🔧 Admin Tool: Extend Admission Offers         │
├──────────────────────────────────────────────────┤
│                                                  │
│  ⚠️ Use with care: This tool extends admission  │
│     offer expiration dates...                   │
│                                                  │
│  Search By:                                     │
│  [Student Email ▼]                              │
│                                                  │
│  Enter Email Address:                           │
│  [john@email.com]                               │
│                                                  │
│  [🔍 Search Student]                            │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Step 2: Select Search Type (Optional)
```
If searching by application number:
[Application Number ▼]
```

### Step 3: Enter Student Email
```
[🔍 Search by name, email, reference...  ]
 john@email.com
```

### Step 4: Click Search
```
Results appear:

┌────────────────────────────────────────────────┐
│ Name        │ Email         │ Status   │ Action│
├────────────────────────────────────────────────┤
│ John Doe    │ john@email    │ expired  │ [Ext] │
└────────────────────────────────────────────────┘
```

### Step 5: Click "Extend"
```
Modal appears:

┌─────────────────────────────────┐
│  Extend Offer                   │
├─────────────────────────────────┤
│ Extending for: John Doe         │
│                                 │
│ New Expiration Date:            │
│ [2026-12-31_______________]     │
│                                 │
│ [✓ Extend Offer] [✕ Cancel]    │
└─────────────────────────────────┘
```

### Step 6: Pick Date & Confirm
```
Set to: 2026-12-31 (or 30-60 days from today)
Click: [✓ Extend Offer]

Result: ✓ Offer extended successfully to: 2026-12-31
```

**Done!** ✅

---

## What Changed in the Database

### Before:
```
admission_offers table:
┌────┬──────────────┬──────────────┬─────────┐
│ id │ expires_at   │ status       │ updated │
├────┼──────────────┼──────────────┼─────────┤
│  5 │ 2025-09-01   │ expired      │ OLD     │
└────┴──────────────┴──────────────┴─────────┘
```

### After:
```
admission_offers table:
┌────┬──────────────┬──────────────┬─────────┐
│ id │ expires_at   │ status       │ updated │
├────┼──────────────┼──────────────┼─────────┤
│  5 │ 2026-12-31   │ pending      │ NOW ✓   │
└────┴──────────────┴──────────────┴─────────┘
```

**Changes:**
- ✅ `expires_at`: 2025-09-01 → 2026-12-31
- ✅ `status`: expired → pending
- ✅ `updated_at`: Updated to current time

---

## Student's Experience - Before & After

### ❌ BEFORE (Expired Offer):
```
Student logs in to portal → Clicks "Accept Admission"

Error dialog appears:
┌─────────────────────────────────────┐
│ ❌ This offer has expired.          │
│    Please contact the admissions    │
│    office.                          │
│                                     │
│ [Close]                            │
└─────────────────────────────────────┘
```

### ✅ AFTER (Extended Offer):
```
Student logs in to portal → Clicks "Accept Admission"

Dialog appears:
┌──────────────────────────────────────────┐
│ Accept Admission                        │
├──────────────────────────────────────────┤
│ By clicking confirm, you accept our     │
│ offer of admission and agree to abide   │
│ by the university's rules and          │
│ regulations. This action is final.      │
│                                         │
│ [Cancel]  [✓ Confirm Acceptance]       │
└──────────────────────────────────────────┘

✓ Success! Offer accepted.
```

---

## Troubleshooting

### Problem: Can't find the search box
**Solution:** Make sure you're on the "Offers" page, not "Applications"

### Problem: Student still sees "expired" error
**Solution:** 
1. Make sure status changed from "expired" to "pending"
2. Clear browser cache: Ctrl+Shift+Delete
3. Have student log out and log back in

### Problem: Admin tool won't load
**Solution:** Check URL is correct:
```
http://localhost/cur-mis/backend/public/admin-extend-offer.php
```

### Problem: Results show "No offers found"
**Solution:** 
1. Check email spelling exactly
2. Try searching by application number instead
3. Make sure student has an offer record

---

## Summary

| Task | Location | Time |
|------|----------|------|
| Find expired offers | Admissions > Offers | 1 min |
| Search specific student | Use search box | 10 sec |
| Extend one offer | Click button + set date | 30 sec |
| Extend multiple offers | Repeat above for each | 1-2 min |

**Total time to fix one expired offer: ~2 minutes**

---

Last Updated: September 19, 2026
