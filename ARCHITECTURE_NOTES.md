# CUR MIS - Architecture & Data Flow Issues

## Current Issue: Academic Year Coupling

### Problem Statement
The system is tightly coupled to a **single current academic year** (global selection). When users change the academic year:

1. **Data Visibility Changes Across ALL Departments**
   - Finance sees different invoices/payments
   - Academic sees different marks/modules
   - HR sees different payroll
   - Registry sees different student records
   - Admissions sees different applications

2. **Data Loss/Inconsistency Risk**
   - Switching back to current year may show incomplete historical data
   - Previous year reports may be interrupted by year switches
   - Cross-department reconciliation breaks (Finance + Academic year mismatch)

3. **Department Workflow Disruption**
   - Finance needs current year + historical years simultaneously
   - HR needs to view payroll across multiple years
   - Academic needs marks/transcripts across enrollment years
   - Registry needs complete student history

### Example Scenario
```
Timeline:
- Academic Year 2024/2025 is CURRENT
- Finance officer needs to reconcile 2023/2024 invoices
- They change year filter to 2023/2024
- ALL data changes globally
- Academic staff now sees 2023/2024 marks (wrong year for them)
- HR staff sees 2023/2024 payroll
- If finance clicks away, year reverts, they lose their 2023/2024 view
```

## Proposed Solution: Department-Level Year Selection

### Architecture Change

**Current State (Shared Year):**
```
Global Academic Year State
    ↓
Finance (year-dependent)
Academic (year-dependent)
HR (year-dependent)
Registry (year-dependent)
```

**Proposed State (Independent Department Years):**
```
Global Academic Year (for NEW data entry/current operations)
    ↓
Finance Module
├─ Local Year State (Finance can independently view 2023/24, 2024/25, etc)
├─ Maintains own year context
└─ Reports show selected year only

Academic Module
├─ Local Year State (Academic keeps current year independently)
├─ Marks/Transcripts show selected year
└─ Doesn't affect other departments

HR Module
├─ Local Year State (HR shows payroll year independently)
└─ Can reconcile across years without disrupting others

Registry Module
├─ Local Year State (Registry shows student records for selected year)
└─ Historical data preserved per-year
```

### Implementation Options

#### Option A: Local Storage per Department
```
localStorage:
  finance_selected_year: 2023
  academic_selected_year: 2024 (current)
  hr_selected_year: 2024
  registry_selected_year: 2024
```

**Pros:**
- Simple to implement
- Year preference persists per browser session
- Minimal backend changes
- Each department independent

**Cons:**
- Only per-browser (not synchronized across devices)
- Lost on session/cache clear
- Different users see different years

#### Option B: User Preferences (Recommended)
```
users_module_preferences table:
  user_id | module | selected_year | updated_at
  
Example:
  1234 | finance | 2023 | 2024-09-01
  1234 | academic | 2024 | 2024-09-01
  1234 | hr | 2024 | 2024-09-01
```

**Pros:**
- Persists across sessions
- Works across devices
- Per-user preferences
- Can reset to current year if needed
- Audit trail of year selections

**Cons:**
- Requires database changes
- API changes needed
- Slightly more complex

#### Option C: Module Context Preservation
```
Frontend State Manager:
  modules: {
    finance: {
      selectedYear: 2023,
      context: { ... }
    },
    academic: {
      selectedYear: 2024,
      context: { ... }
    }
  }
```

**Pros:**
- Session-level independence
- Fast switching between modules
- No database changes needed

**Cons:**
- Lost on browser refresh
- Lost on session timeout

### Recommended Approach: **Option B + Option C**

**Hybrid Solution:**
1. **Frontend (Option C):** Each module maintains its own year state
2. **Backend (Option B):** Persist user preferences to database
3. **Global Year:** Still used as default for current operations

**Benefits:**
- ✅ Departments work independently
- ✅ No data interruption between modules
- ✅ Preferences persist across sessions
- ✅ Users can switch years per-module freely
- ✅ Audit trail of year selections
- ✅ Easy rollback to current year
- ✅ Multi-device support
- ✅ Backward compatible

### Implementation Steps

#### Step 1: Database Schema
```sql
CREATE TABLE user_module_preferences (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    module_name VARCHAR(50) NOT NULL,
    selected_academic_year_id INT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY unique_user_module (user_id, module_name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (selected_academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL
);
```

#### Step 2: Backend API Endpoint
```
GET /api/users/me/module-preferences
POST /api/users/me/module-preferences/:module_name
  body: { academic_year_id: 123 }
```

#### Step 3: Frontend State Management
```typescript
// Store per-module year selection
const moduleYearState = {
  finance: useQuery('finance-selected-year'),
  academic: useQuery('academic-selected-year'),
  hr: useQuery('hr-selected-year'),
  registry: useQuery('registry-selected-year'),
};

// Each module queries with its own year, not global year
```

#### Step 4: Navigation Changes
- Finance module: Uses `moduleYearState.finance`
- Academic module: Uses `moduleYearState.academic`
- HR module: Uses `moduleYearState.hr`
- Registry module: Uses `moduleYearState.registry`

### Migration Path

1. **Phase 1:** Add database table (no UI changes yet)
2. **Phase 2:** Add API endpoints (no UI changes yet)
3. **Phase 3:** Update Finance module to use local year + persist preference
4. **Phase 4:** Update Academic module
5. **Phase 5:** Update HR module
6. **Phase 6:** Update Registry module
7. **Phase 7:** Remove dependency on global year state (keep it for backward compatibility)

### Rollback Plan

- Global year state remains as **fallback**
- If local preference not set, use global year
- Can be toggled via feature flag
- No breaking changes to existing code

## Summary

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Year Selection** | Global (all modules) | Per-Module (independent) |
| **Data Visibility** | Changes everywhere | Only in selected module |
| **Department Impact** | High (affects all) | Low (isolated) |
| **Session Persistence** | N/A | Yes (database) |
| **Device Sync** | N/A | Yes (via API) |
| **Audit Trail** | No | Yes |
| **Complexity** | Low | Medium |

This change would allow Finance to view 2023/2024 data, Academic to stay in 2024/2025, and HR to reconcile multiple years - **all simultaneously without interfering with each other**.
