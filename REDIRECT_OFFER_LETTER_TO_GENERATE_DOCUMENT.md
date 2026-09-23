# 📍 REDIRECT OFFER LETTER TO generate_document.php

## 🎯 GOAL

Change the "Download PDF" link in the Applicant Portal to redirect to:
```
/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id={student_id}&file_name=Admission_Letter_FORMAT.pdf&applicant=1
```

---

## 📋 STEP-BY-STEP IMPLEMENTATION

### **STEP 1: Find Backend API that Returns Offer Details**

**File to check**: Look for the API endpoint that populates the `details` object in ApplicantOverviewPage.tsx

Likely locations:
- `backend/app/Controllers/ApplicationController.php`
- `backend/app/Controllers/AdmissionController.php`
- `backend/routes/api/applications.php`

---

### **STEP 2: Add student_id to API Response**

The API needs to return `student_id` in the offer details. 

**Example backend code to add:**

```php
// In your API endpoint that returns application details:

$query = "
    SELECT 
        a.*,
        u.id as student_id,  -- ADD THIS LINE
        u.email,
        ... (other fields)
    FROM student_applications a
    LEFT JOIN users u ON u.id = a.applicant_id
    WHERE a.id = ?
";

// Now the response will include student_id
$response = [
    'offer' => [
        'letter_token' => $row['letter_token'],
        'expires_at' => $row['expires_at'],
        // ... other fields
    ],
    'student_id' => $row['student_id'],  // <-- Now available
];
```

---

### **STEP 3: Update Frontend Links (TWO LOCATIONS)**

#### **Location 1: Line 602-603 (Enrollment Complete Section)**

**File**: `frontend/src/pages/applicant/ApplicantOverviewPage.tsx`

**Current code:**
```typescript
{(details as any)?.offer?.letter_token && (
  <a
    href={`${import.meta.env.VITE_API_URL ?? ''}/api/portal/admission-letter?token=${(details as any).offer.letter_token}`}
    target="_blank"
    rel="noreferrer"
    className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black uppercase tracking-widest transition-colors"
  >
    <Download className="w-4 h-4" /> Download Letter
  </a>
)}
```

**Change to:**
```typescript
{(details as any)?.offer?.letter_token && (
  <a
    href={`/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=${(details as any).student_id ?? ''}&file_name=Admission_Letter_FORMAT.pdf&applicant=1`}
    target="_blank"
    rel="noreferrer"
    className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black uppercase tracking-widest transition-colors"
  >
    <Download className="w-4 h-4" /> Download Letter
  </a>
)}
```

---

#### **Location 2: Line 750-758 (Offer Banner Section)**

**Current code:**
```typescript
{details.offer?.letter_token && (
  <a
    href={`${import.meta.env.VITE_API_URL ?? ''}/api/portal/admission-letter?token=${details.offer.letter_token}`}
    target="_blank"
    rel="noreferrer"
    className="flex items-center justify-center gap-2 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[12px] bg-white/20 hover:bg-white/30 text-white border border-white/30 transition-colors"
  >
    <Download className="w-4 h-4" /> Download PDF
  </a>
)}
```

**Change to:**
```typescript
{details.offer?.letter_token && (
  <a
    href={`/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=${details.student_id ?? ''}&file_name=Admission_Letter_FORMAT.pdf&applicant=1`}
    target="_blank"
    rel="noreferrer"
    className="flex items-center justify-center gap-2 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[12px] bg-white/20 hover:bg-white/30 text-white border border-white/30 transition-colors"
  >
    <Download className="w-4 h-4" /> Download PDF
  </a>
)}
```

---

## 🔧 IMPLEMENTATION CHECKLIST

- [ ] **Backend Step**: Find the API endpoint returning application details
- [ ] **Backend Step**: Add `student_id` to the response (join with users table)
- [ ] **Frontend Step**: Update line 602-603 (Download Letter in Enrollment section)
- [ ] **Frontend Step**: Update line 750-758 (Download PDF in Offer Banner)
- [ ] **Build**: Run `npm run build` to verify no TypeScript errors
- [ ] **Test**: Apply as student → Get admitted → Click Download → Should open PDF

---

## 📊 PARAMETER EXPLANATION

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `type` | `admission_letter` | Document type |
| `student_id` | From applicant's user ID | Identifies the student |
| `file_name` | `Admission_Letter_FORMAT.pdf` | Default PDF filename |
| `applicant` | `1` | Flag indicating this is an applicant, not a student |

---

## 🎯 WHAT HAPPENS

**Before this change:**
```
Student clicks "Download PDF"
  ↓
Redirects to: /api/portal/admission-letter?token=...
  ↓
Backend API returns PDF via token auth
```

**After this change:**
```
Student clicks "Download PDF"
  ↓
Redirects to: /umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=23&...
  ↓
generate_document.php receives student_id
  ↓
Generates admission letter PDF using generate_document.php logic
```

---

## ⚠️ IMPORTANT NOTES

1. **Both download links must be updated** (lines 602-603 AND 750-758)
2. **Backend API must include student_id** - without it, the links will pass empty value
3. **Test after building** - Make sure TypeScript compiles without errors
4. **Test as a real applicant** - Create test application, get admitted, test download

---

## 🚀 COMPLETE WORKFLOW

1. **Check backend API** → Verify where `details` object is populated
2. **Modify backend** → Add `student_id` JOIN to users table
3. **Modify frontend** → Update both Download links
4. **Build** → `npm run build`
5. **Commit** → `git add . && git commit -m "..."`
6. **Push** → `git push origin main`
7. **Test** → Create test applicant, verify PDF download works

---

## 💻 EXACT CODE CHANGES NEEDED

### Backend (find endpoint that returns `details`):

```php
// Add this to the SELECT clause:
u.id as student_id

// Add this to JOINs:
LEFT JOIN users u ON u.id = a.applicant_id
```

### Frontend (2 locations in ApplicantOverviewPage.tsx):

**Search for:** `import.meta.env.VITE_API_URL` (in context of admission letter)

**Replace with:** `/umis/documents/all_certificate/generate_document.php?type=admission_letter&student_id=${details.student_id ?? ''}&file_name=Admission_Letter_FORMAT.pdf&applicant=1`

---

Would you like me to:
1. Find the exact backend file and line to modify?
2. Make the frontend changes for you?
3. Both?

Just let me know!
