# 📋 cPanel Upload - Step by Step Guide

## ✅ Ready? Let's Do This!

Follow these exact steps. Don't skip anything.

---

## 🎯 STEP 1: Access cPanel

### What to do:
1. **Open your browser**
2. **Go to:** `https://cur.ac.rw:2083/`
3. **Enter username:** (your cPanel username)
4. **Enter password:** (your cPanel password)
5. **Click:** Login

### What you should see:
- cPanel dashboard with icons
- List of tools on left sidebar

---

## 🎯 STEP 2: Open File Manager

### What to do:
1. **Look for:** "File Manager" icon
2. **Click it**
3. **New window opens**

### What you should see:
- File browser window
- Current folder shown at top
- Files/folders listed below

---

## 🎯 STEP 3: Navigate to Upload Folder

### Current location check:
- You should be in: `public_html` or similar
- Look at the path bar at top

### What to do:
1. **Look for:** `public_html` in left sidebar OR in file list
2. **Double-click:** `public_html` folder
3. **Inside that, look for:** `umis` folder
4. **Double-click:** `umis` folder

### What you should see:
- Path shows: `.../public_html/umis/`
- OLD files inside (these need replacing):
  - `assets/` folder
  - `index.html`
  - `logo.png`
  - Images (.jpg/.jpeg files)

### ⚠️ IMPORTANT:
These OLD files are from previous version. We're replacing them.

---

## 🎯 STEP 4: Delete Old Files

### Why:
The old files are blocking the new ones. We need to clean up first.

### What to do:

**Delete the assets folder:**
1. **Right-click** on `assets` folder
2. **Select:** "Delete" or "Remove"
3. **Confirm:** Click "Yes" if asked

**Delete index.html:**
1. **Right-click** on `index.html` file
2. **Select:** "Delete"
3. **Confirm:** Click "Yes" if asked

**Delete image files (optional):**
1. Right-click `logo.png`
2. Select "Delete"
3. Repeat for other .jpg/.jpeg files

### What you should see:
- `assets/` folder: GONE ✅
- `index.html`: GONE ✅
- Folder is now mostly empty (maybe just .htaccess left)

---

## 🎯 STEP 5: Upload New Files

### Where to get files:
`c:\xamppP\htdocs\cur-mis\frontend\dist\`

### What to do:

**Click Upload button:**
1. **Look for:** "Upload" button in File Manager
2. **Click it**
3. **Browse window opens**

**Select the files:**
1. **Navigate to:** `c:\xamppP\htdocs\cur-mis\frontend\dist\`
2. **Select all files:**
   - Press: `Ctrl+A` (selects all)
   - Or manually select:
     - ✓ index.html
     - ✓ assets (folder)
     - ✓ logo.png
     - ✓ login-hero.jpg
     - ✓ header_bar.jpeg
     - ✓ .htaccess

**Start upload:**
1. **Click:** "Upload" or "Open" button
2. **Watch the progress bar**
3. **Wait for:** 100% complete
4. **Look for:** "Upload complete" message

### ⏱️ Time needed:
- Usually: 2-5 minutes
- Depends on internet speed
- Large file is: assets/index-C6ZlPUHm.js (4.2 MB)

### ✅ What you should see:
- Progress bar: 0% → 100%
- Files appear in File Manager:
  - ✓ index.html
  - ✓ assets/ (folder with files inside)
  - ✓ logo.png
  - ✓ login-hero.jpg
  - ✓ header_bar.jpeg
  - ✓ .htaccess

---

## 🎯 STEP 6: Clear Browser Cache

### Why:
Browser might show old version. Cache clearing forces new version to load.

### What to do:

**On your computer:**
1. **Press:** `Ctrl + Shift + Delete` (all browsers)
2. **Dialog appears**
3. **Select:** "All time" or "Everything"
4. **Check boxes:**
   - ✓ Cookies and site data
   - ✓ Cached images and files
5. **Click:** "Clear data" or "Clear browsing data"

**Wait a moment...**

---

## 🎯 STEP 7: Test the Live Page

### What to do:
1. **Open new browser tab**
2. **Go to:** `https://cur.ac.rw/umis/finance/billing`
3. **Wait for page to load** (should be < 3 seconds)

### What you should see:

**✅ GOOD (New page):**
- Title: "Student Bulk Billing"
- Subtitle: "Select students and generate invoices..."
- Filter dropdowns:
  - Student Status
  - Intake Year
  - Faculty
  - Department
  - Option
  - Search box
- Student table with data
- Checkboxes to select students
- "Generate Invoices" button (appears when students selected)

**❌ BAD (Old page):**
- Confusing layout with 5 KPI cards
- Financial numbers (0 RWF)
- "No students found" message
- Complex interface

**❌ REALLY BAD:**
- 404 error (Page not found)
- Blank white page
- JavaScript errors (F12 → Console)

---

## 🎯 STEP 8: If Page Shows OLD Version Still

### Don't worry! This is normal. Do this:

1. **Press:** `Ctrl + F5` (hard refresh)
2. **Wait:** 3-5 seconds
3. **Check:** If new page appears

**If still old:**
1. **Close browser completely**
2. **Reopen browser**
3. **Go to:** `https://cur.ac.rw/umis/finance/billing`

**If STILL old:**
1. **Go back to File Manager**
2. **Verify files uploaded:**
   - Look for: `assets/index-C6ZlPUHm.js` file
   - Should be: 4.2 MB in size
3. **Check index.html exists**
4. **Wait 5 minutes** (servers cache files)
5. **Try again**

---

## 🎯 TROUBLESHOOTING

### Problem: Page shows 404 (Not Found)
**Solution:**
- Check files are in: `public_html/umis/`
- Verify `index.html` exists
- Verify `.htaccess` exists
- Refresh File Manager (F5)

### Problem: Page is blank/white
**Solution:**
- Clear cache again (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+F5)
- Check browser console (F12) for errors
- Verify `assets/` folder uploaded

### Problem: Styles look broken
**Solution:**
- Verify `assets/` folder uploaded
- Check CSS file exists: `index-B3am6WJK.css`
- Clear cache and refresh
- Hard refresh (Ctrl+F5)

### Problem: Page loads but no student data
**Solution:**
- This is normal first load (data loads separately)
- Wait 3-5 more seconds
- Scroll down to see student list
- Check browser console (F12) for errors

---

## ✅ VERIFICATION CHECKLIST

After uploading, verify:

### Files on cPanel:
- ✓ `index.html` exists
- ✓ `assets/` folder exists
- ✓ `assets/index-C6ZlPUHm.js` exists (4.2 MB)
- ✓ `logo.png` exists
- ✓ `login-hero.jpg` exists
- ✓ `header_bar.jpeg` exists
- ✓ `.htaccess` exists

### Page loads:
- ✓ URL works: `https://cur.ac.rw/umis/finance/billing`
- ✓ Page title: "Student Bulk Billing"
- ✓ No 404 error
- ✓ No blank page

### Features visible:
- ✓ Filter dropdowns show
- ✓ Search box visible
- ✓ Student table displays
- ✓ Checkboxes work
- ✓ "Generate Invoices" button appears (when students selected)

### Page works:
- ✓ Filters respond to clicks
- ✓ Search works
- ✓ Page loads fast (< 3 seconds)
- ✓ No JavaScript errors (F12 → Console)

---

## 🎉 SUCCESS!

If you see "Student Bulk Billing" with student list:
✅ **DEPLOYMENT SUCCESSFUL!**

Your new billing page is LIVE! 🚀

---

## 📞 If You Get Stuck

Tell me:
1. **What step are you on?**
2. **What do you see?**
3. **What error message (if any)?**

I'll help you fix it immediately!

---

## ⏱️ Timeline

- Access cPanel: 1 minute
- Navigate to folder: 1 minute
- Delete old files: 2 minutes
- Upload new files: 5 minutes
- Clear cache: 1 minute
- Test: 2 minutes

**Total time: 10-15 minutes**

---

**Ready? Let's start! Go to https://cur.ac.rw:2083/**
