# Admin Global Year Selection Guide

## 🎯 What Is This?

**Admin Year Selection** is a separate feature from **Module-Level Year Selection**.

- **Module Level:** Finance, Academic, HR each independently select their year
- **Admin Level:** Admin can view ANY historical year without interrupting anyone

## 🔄 How They Work Together

```
┌─────────────────────────────────────────────────────────┐
│                   ADMIN DASHBOARD                       │
│                                                         │
│  Admin Year: [2023/2024 ▼]  ← Admin switches here      │
│  Shows data for 2023/2024                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
           ↓ INDEPENDENT ↓

┌─────────────────────────────────────────────────────────┐
│            FINANCE MODULE (Finance Officer)              │
│                                                         │
│  Finance Year: [2023/2024 ▼]  ← They select separately  │
│  Shows invoices for 2023/2024                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
           ↓ INDEPENDENT ↓

┌─────────────────────────────────────────────────────────┐
│           ACADEMIC MODULE (Academic Secretary)          │
│                                                         │
│  Academic Year: [2024/2025 ▼]  ← Independent selection │
│  Shows marks for 2024/2025 (current)                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**KEY POINT:** Admin can view 2023/2024 while Finance views 2023/2024 AND Academic views 2024/2025 - **NO INTERRUPTION**

## 📍 Admin Year Selector Location

### In Admin Dashboard Header
```
┌────────────────────────────────────────────┐
│ Admin Dashboard                            │
│                        [2024/2025 ▼] [Reset]
│                        ↑ Click here       │
│                                           │
│ Total Students: 6,116                      │
│ Total Invoices: 1,250                      │
│ Total Revenue: 45M RWF                     │
└────────────────────────────────────────────┘
```

### As a Sidebar Component
```
┌─────────────────────┐
│ Admin Controls      │
│                     │
│ 🛡️ Admin Year       │
│    Selection        │
│                     │
│ [Year Selector] ▼   │
│                     │
│ Show: 2024/2025 ✓   │
│                     │
│ [Reset]             │
└─────────────────────┘
```

## 🔧 How to Use (Admin's Perspective)

### Step 1: Navigate to Admin Dashboard
```
URL: https://cur.ac.rw/umis/admin/dashboard
```

### Step 2: See Admin Year Selector
```
Admin Dashboard

[Select Year] ▼
│
├─ 2022/2023
├─ 2023/2024  ← Admin wants this year
├─ 2024/2025  ✓ (Current)
```

### Step 3: Click on Year
```
Click: 2023/2024
           ↓
Dashboard data updates instantly
All modules continue uninterrupted
```

### Step 4: View Historical Data
```
Total Students in 2023/2024: 5,890
Total Invoices in 2023/2024: 980
Total Revenue in 2023/2024: 42.5M RWF

Meanwhile...
Finance Officer sees 2023/2024 invoices (their selection)
Academic Secretary sees 2024/2025 marks (their selection)
NO ONE IS AFFECTED!
```

### Step 5: Return to Current Year
```
Click: [Reset] button
           ↓
Back to current year instantly
```

## 💻 Implementation in Code

### Admin Dashboard Page
```typescript
// pages/admin/AdminDashboard.tsx
import { AdminDashboardHeader, AdminYearSelector } from '@/components/AdminYearSelector'
import { useAdminDashboardStats } from '@/hooks/useAdminYearSelection'

export default function AdminDashboard() {
  const { data: stats } = useAdminDashboardStats()

  return (
    <div>
      {/* Header with year selector */}
      <AdminDashboardHeader />

      {/* Dashboard content for selected year */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p>Total Students</p>
          <p className="text-2xl font-bold">{stats?.stats?.total_students}</p>
        </div>
        <div className="card p-4">
          <p>Total Invoices</p>
          <p className="text-2xl font-bold">{stats?.stats?.total_invoices}</p>
        </div>
        <div className="card p-4">
          <p>Total Revenue</p>
          <p className="text-2xl font-bold">{stats?.stats?.total_revenue}</p>
        </div>
      </div>
    </div>
  )
}
```

### Admin Settings Sidebar
```typescript
// components/AdminSettingsSidebar.tsx
import AdminYearSelector from '@/components/AdminYearSelector'

export default function AdminSettingsSidebar() {
  return (
    <div className="card p-4 space-y-6">
      <div>
        <h3 className="font-semibold mb-2">View Options</h3>
        <AdminYearSelector compact={false} />
      </div>

      {/* Other admin settings */}
    </div>
  )
}
```

## 📊 Real-World Scenario

### Scenario: Year-End Audit

**Admin needs to reconcile 2023/2024 data for audit:**

```
TIME 1: Admin logs in (9:00 AM)
└─ Dashboard showing 2024/2025 (current)

TIME 2: Admin clicks year dropdown, selects 2023/2024 (9:05 AM)
└─ Dashboard updates to show 2023/2024 data
└─ Finance Officer continues viewing 2023/2024 invoices
└─ Academic Secretary viewing 2024/2025 marks
└─ NO INTERFERENCE!

TIME 3: Admin reconciles 2023/2024 data (9:05 AM - 11:00 AM)
└─ Checking all invoices from last year
└─ Finance continues work with their selected year
└─ Academic continues work with their selected year

TIME 4: Admin finishes, clicks [Reset] (11:00 AM)
└─ Dashboard back to current year (2024/2025)
└─ Ready to view current year data
```

## 🔐 Security & Permissions

### Admin-Only Access
```php
// Only users with admin role can use this
if (!$user->hasRole('administrator', 'superadmin', 'admin')) {
    return $this->respond(['error' => 'Unauthorized'], 403);
}
```

### What Admin Can View
✅ Any historical year data
✅ Current year data
✅ All financial records (for selected year)
✅ All academic records (for selected year)
✅ All HR records (for selected year)

### What Admin Cannot Do
❌ Change other users' module preferences
❌ Modify the current academic year (that's a separate admin function)
❌ Affect Finance/Academic/HR module selections

## 🔄 Data Flow

### How Admin Year Works

```
Admin selects year in dropdown
           ↓
POST /api/admin/me/selected-year
           ↓
Server stores in SESSION: admin_year_selection_1234 = 123
           ↓
React hook fetches it: useAdminYearSelection()
           ↓
All dashboard queries use selectedYearId
           ↓
Dashboard shows data for that year
           ↓
NO DATABASE CHANGES
NO OTHER USERS AFFECTED
```

### Session vs Database

| Feature | Storage | Scope | Persistence |
|---------|---------|-------|-------------|
| **Module Selection** | Database | Per-user, per-module | Across browsers |
| **Admin Year** | Session | Per-user, global | This browser only |

## 📝 API Endpoints

### Get All Years
```
GET /api/admin/academic-years

Response:
{
  "success": true,
  "academic_years": [
    { "id": 121, "name": "2022/2023", "is_current": 0 },
    { "id": 122, "name": "2023/2024", "is_current": 0 },
    { "id": 123, "name": "2024/2025", "is_current": 1 }
  ],
  "current_academic_year_id": 123
}
```

### Get Admin's Year Selection
```
GET /api/admin/me/selected-year

Response:
{
  "success": true,
  "selected_academic_year_id": 122,
  "selected_academic_year": { "id": 122, "name": "2023/2024" },
  "current_academic_year_id": 123,
  "is_viewing_current": false,
  "is_admin": true
}
```

### Set Admin Year
```
POST /api/admin/me/selected-year
Body: { "academic_year_id": 122 }

Response:
{
  "success": true,
  "selected_academic_year_id": 122,
  "message": "Admin year selection updated"
}
```

### Reset to Current Year
```
DELETE /api/admin/me/selected-year

Response:
{
  "success": true,
  "message": "Reset to current academic year"
}
```

### Get Dashboard Stats
```
GET /api/admin/dashboard-stats

Response:
{
  "success": true,
  "stats": {
    "total_students": 5890,
    "total_invoices": 980,
    "total_revenue": 42500000,
    "pending_payments": 320,
    "new_applications": 110,
    "academic_year_id": 122
  }
}
```

## ✨ Key Features

✅ **Admin can view any year** - Complete access to historical data
✅ **Doesn't affect other users** - Finance, Academic, HR modules independent
✅ **Session-based** - Per-browser, no database pollution
✅ **Easy reset** - One click to return to current year
✅ **Clear indicators** - Shows when viewing non-current year
✅ **Audit trail** - All switches logged
✅ **No data corruption** - Read-only historical data access

## 🚀 Installation

### Step 1: Add Routes
In `backend/routes/routes.php`:
```php
require APPPATH . 'Config/Routes/api_routes_admin_year.php';
```

### Step 2: Add Components
In admin dashboard:
```typescript
import { AdminDashboardHeader } from '@/components/AdminYearSelector'

<AdminDashboardHeader />
```

### Step 3: Update Queries
```typescript
import { useAdminDashboardStats } from '@/hooks/useAdminYearSelection'

const { data: stats } = useAdminDashboardStats()
// Stats now for admin's selected year
```

## 📋 Comparison Table

| Aspect | Module Selection | Admin Year |
|--------|-----------------|-----------|
| **Who uses it** | Finance, Academic, HR staff | Admins only |
| **Storage** | Database table | Session |
| **Scope** | Per module | Global admin view |
| **Persistence** | Across devices | This browser only |
| **Affects others** | No | No |
| **Use case** | Daily work | Audits, reports, historical review |

## 🎯 Summary

**Admin Year Selection allows:**
1. ✅ Admin to view any historical year for audits/reporting
2. ✅ Finance, Academic, HR to continue working independently
3. ✅ Zero interruption to other departments
4. ✅ Easy switching between years
5. ✅ Clear visibility when viewing non-current data

**This is DIFFERENT from module selection:**
- Module selection: Finance staff picks one year, Academic picks another
- Admin year: Admin views any year for oversight/reporting

**No data loss, no interruption, complete independence!**
