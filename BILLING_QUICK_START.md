# Billing Bulk Generation - Quick Start Guide

## 🎯 Quick Actions (Fastest Way to Bill)

### Bill All Students in a Faculty

1. Go to **Finance → Bulk Billing Management**
2. Select **Academic Year** (e.g., "2025/2026")
3. Select **Faculty** (e.g., "Engineering")
4. Click **"Bill All Now"** button (green)
5. Confirm the number of students
6. Done! ✅ All students in that faculty are invoiced

### Bill All Students in a Department

1. Go to **Finance → Bulk Billing Management**
2. Select **Academic Year**
3. Select **Faculty**, then **Department**
4. Click **"Bill All Now"** button
5. Confirm
6. Done! ✅

### Bill All Students in an Option/Specialization

1. Go to **Finance → Bulk Billing Management**
2. Select **Academic Year**
3. Select **Faculty**, **Department**, then **Option**
4. Click **"Bill All Now"** button
5. Confirm
6. Done! ✅

---

## 📋 Manual Selection (For Specific Students)

If you want to bill only some students:

1. Select **Academic Year**
2. Use filters to narrow down list
3. **Check boxes** next to student names (or check "Select All" for current page)
4. Click **"Generate Invoices"** button (blue)
5. Confirm
6. Done! ✅

---

## ⚙️ Filtering Options

### Academic Year
- Shows all intake years from your student database
- Filters students by cohort year
- Format: "2025/2026" or "2023-2024"

### Semester/Term
- "Full Year" = entire academic year
- "Semester 1" = first half
- "Semester 2" = second half

### Faculty, Department, Option
- Cascading dropdowns (must select in order)
- Enables the "Bill All Now" button

### Search Students
- Find by name or registration number
- Real-time filtering

---

## 📊 What You'll See

### KPI Cards (Top)
- **Expected Revenue** - Total tuition amounts
- **Collected** - Payments received
- **Bursary Credits** - Scholarship amounts
- **Pending Balance** - Outstanding
- **Partial Payments** - Partially paid

### Student Table
Shows all students matching your filters:
- Name & Reg #
- Department & Faculty
- Opening balance
- Amount invoiced
- Amount paid
- Bursary applied
- Remaining balance

### Status Badges
- 🟢 **Cleared** - Fully paid
- 🟠 **Balance** - Partially paid or unpaid
- 📄 **Download** - Get PDF invoice
- ➡️ **View Ledger** - See full details

---

## ✅ Confirmation Dialog

Before processing, you'll see:

```
Generate invoices for ALL 1,250 students in this faculty?
This may take a moment.

[Cancel]  [OK]
```

- Shows actual count of students
- Takes 30-60 seconds for 1000+ students
- Safe to click - system verifies everything

---

## ⏱️ How Long Does It Take?

| Students | Time |
|----------|------|
| 100      | 10s  |
| 500      | 30s  |
| 1,000    | 60s  |
| 2,000    | 2m   |

---

## 🔍 After Billing

### Check Results
After clicking "Generate Invoices":
- See summary: "Students processed: 1,250 · New invoices: 1,250 · Unchanged: 0"
- Page automatically refreshes
- Table updates with new invoice amounts

### Download Excel
- Click **"Export CSV"** button
- Get list of all billed students
- Includes balances and payment status

### Individual Invoices
- Click ➡️ icon next to student name
- View detailed ledger
- See all fees and payments
- Download PDF invoice

---

## ❌ Troubleshooting

### "No students found"
- Check you selected an Academic Year
- Verify Faculty/Department exists
- Try removing search filter

### "Bill All Now button is grayed out"
- Select Faculty OR Department OR Option (one of them)
- Academic Year must be selected
- Page needs at least 1 student

### Button says "Generating..." (stuck)
- Be patient! System is processing students
- Don't refresh the page
- May take 1-2 minutes for large batches

### Invoices not showing up
- Refresh the page (F5)
- Check Academic Year is still selected
- Click on a student name to see their details

---

## 💡 Pro Tips

1. **Invoice Only New Students**
   - Filter by Faculty/Dept
   - Uncheck any already invoiced students
   - Use "Generate Invoices" button

2. **Check Before Billing**
   - Use "Pending Balance" filter to see uninvoiced students
   - Verify fee structures are set up
   - Check for any fee overrides

3. **Bill by Cohort**
   - Select academic year (groups by intake cohort)
   - Select faculty
   - Click "Bill All Now"
   - Repeat for each faculty

4. **Generate Report**
   - Select all filters
   - Click "Export CSV"
   - Open in Excel
   - Ready for auditing/reporting

---

## 📞 Support

**Questions?** Contact Finance System Administrator

**Report Issues:**
- Provide Academic Year and Faculty/Dept selected
- Screenshot of error (if any)
- Number of students affected
- Exact time issue occurred

---

## 🚀 New in This Update

✨ **"Bill All Now" button** - Process entire faculty/department/option instantly
✨ **Smart filters** - Automatically detects academic year from student intake
✨ **Confirmation shows count** - See exactly how many students will be billed
✨ **No pagination limits** - Scales to 10,000+ students

---

**Last Updated:** 2026-08-20  
**Version:** 2.0
