# Technical Specification: Module-Level Academic Year Selection

## Overview
Implement independent academic year selection per department/module to allow simultaneous access to different years without interrupting other departments.

## 1. Database Schema

### New Table: `user_module_preferences`
```sql
CREATE TABLE user_module_preferences (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    module_name VARCHAR(50) NOT NULL COMMENT 'finance, academic, hr, registry, admissions, etc',
    selected_academic_year_id INT UNSIGNED NULL COMMENT 'NULL = use system current year',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_user_module (user_id, module_name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (selected_academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE INDEX idx_user_module_prefs_user ON user_module_preferences(user_id);
```

### Module Names (Enum-like)
```
finance
academic
hr
registry
admissions
library
hostel
```

## 2. Backend API Endpoints

### Get User's Module Year Selection
```
GET /api/users/me/module-preferences/:module_name

Response:
{
  module_name: "finance",
  selected_academic_year_id: 123,
  selected_academic_year: {
    id: 123,
    name: "2023/2024",
    start_date: "2023-09-01",
    end_date: "2024-06-30"
  },
  current_academic_year_id: 124
}
```

### Set User's Module Year Selection
```
POST /api/users/me/module-preferences/:module_name

Body:
{
  academic_year_id: 123  // null to reset to current year
}

Response:
{
  success: true,
  module_name: "finance",
  selected_academic_year_id: 123
}
```

### Get All Module Preferences for User
```
GET /api/users/me/module-preferences

Response:
{
  finance: { academic_year_id: 123, name: "2023/2024" },
  academic: { academic_year_id: 124, name: "2024/2025" },
  hr: { academic_year_id: 124, name: "2024/2025" },
  registry: { academic_year_id: 124, name: "2024/2025" }
}
```

### Reset Module to Current Year
```
DELETE /api/users/me/module-preferences/:module_name

Response:
{
  success: true,
  module_name: "finance",
  message: "Reset to current academic year"
}
```

## 3. Backend Implementation (PHP/Laravel)

### Model
```php
// app/Models/UserModulePreference.php
class UserModulePreference extends Model {
    protected $table = 'user_module_preferences';
    protected $fillable = ['user_id', 'module_name', 'selected_academic_year_id'];
    
    public function user() {
        return $this->belongsTo(User::class);
    }
    
    public function academicYear() {
        return $this->belongsTo(AcademicYear::class, 'selected_academic_year_id');
    }
}
```

### Controller
```php
// app/Controllers/UserModulePreferenceController.php
class UserModulePreferenceController extends BaseController {
    
    public function getModuleYear($moduleName) {
        $preference = UserModulePreference::where('user_id', auth()->id())
            ->where('module_name', $moduleName)
            ->with('academicYear')
            ->first();
        
        $selectedYear = $preference?->academicYear 
            ?? AcademicYear::current();
        
        return response()->json([
            'module_name' => $moduleName,
            'selected_academic_year_id' => $selectedYear->id,
            'selected_academic_year' => $selectedYear,
            'current_academic_year_id' => AcademicYear::current()->id
        ]);
    }
    
    public function setModuleYear($moduleName) {
        $validated = $this->validate(request(), [
            'academic_year_id' => 'nullable|exists:academic_years,id'
        ]);
        
        $preference = UserModulePreference::updateOrCreate(
            [
                'user_id' => auth()->id(),
                'module_name' => $moduleName
            ],
            [
                'selected_academic_year_id' => $validated['academic_year_id']
            ]
        );
        
        return response()->json([
            'success' => true,
            'module_name' => $moduleName,
            'selected_academic_year_id' => $preference->selected_academic_year_id
        ]);
    }
    
    public function getAllModulePreferences() {
        $preferences = UserModulePreference::where('user_id', auth()->id())
            ->with('academicYear')
            ->get();
        
        $result = [];
        foreach ($preferences as $pref) {
            $result[$pref->module_name] = [
                'academic_year_id' => $pref->selected_academic_year_id,
                'name' => $pref->academicYear?->name ?? AcademicYear::current()->name
            ];
        }
        
        return response()->json($result);
    }
}
```

### Helper Function
```php
// app/Helpers/ModuleYearHelper.php
class ModuleYearHelper {
    
    public static function getModuleAcademicYear($moduleName) {
        $preference = UserModulePreference::where('user_id', auth()->id())
            ->where('module_name', $moduleName)
            ->first();
        
        return $preference?->selected_academic_year_id 
            ?? AcademicYear::current()->id;
    }
    
    public static function setModuleAcademicYear($moduleName, $academicYearId) {
        return UserModulePreference::updateOrCreate(
            ['user_id' => auth()->id(), 'module_name' => $moduleName],
            ['selected_academic_year_id' => $academicYearId]
        );
    }
}
```

## 4. Frontend Implementation (React)

### Hook: useModuleYear
```typescript
// hooks/useModuleYear.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useModuleYear(moduleName: string) {
  const qc = useQueryClient();
  
  const yearQuery = useQuery({
    queryKey: ['module-year', moduleName],
    queryFn: async () => {
      const res = await fetch(`/api/users/me/module-preferences/${moduleName}`);
      return res.json();
    },
  });
  
  const setYearMutation = useMutation({
    mutationFn: async (academicYearId: number | null) => {
      const res = await fetch(`/api/users/me/module-preferences/${moduleName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academic_year_id: academicYearId })
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['module-year', moduleName] });
    }
  });
  
  return {
    selectedYearId: yearQuery.data?.selected_academic_year_id,
    selectedYear: yearQuery.data?.selected_academic_year,
    currentYearId: yearQuery.data?.current_academic_year_id,
    isLoading: yearQuery.isLoading,
    setYear: setYearMutation.mutate,
    isSetting: setYearMutation.isPending
  };
}
```

### Component: ModuleYearSelector
```typescript
// components/ModuleYearSelector.tsx
import { useModuleYear } from '@/hooks/useModuleYear';
import { useQuery } from '@tanstack/react-query';

interface ModuleYearSelectorProps {
  moduleName: string;
}

export function ModuleYearSelector({ moduleName }: ModuleYearSelectorProps) {
  const { selectedYearId, currentYearId, setYear, isSetting } = useModuleYear(moduleName);
  
  const yearsQuery = useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => {
      const res = await fetch('/api/academic-years');
      return res.json();
    }
  });
  
  const years = yearsQuery.data?.data || [];
  
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium">Academic Year:</label>
      <select
        value={selectedYearId || ''}
        onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : null)}
        disabled={isSetting}
        className="input text-sm"
      >
        {years.map((year: any) => (
          <option key={year.id} value={year.id}>
            {year.name}
            {year.id === currentYearId ? ' (Current)' : ''}
          </option>
        ))}
      </select>
      {selectedYearId !== currentYearId && (
        <button
          onClick={() => setYear(null)}
          disabled={isSetting}
          className="btn-secondary btn-sm text-xs"
        >
          Reset to Current
        </button>
      )}
    </div>
  );
}
```

### Usage in Modules
```typescript
// pages/finance/FinanceOverviewPage.tsx
import { ModuleYearSelector } from '@/components/ModuleYearSelector';
import { useModuleYear } from '@/hooks/useModuleYear';

export default function FinanceOverviewPage() {
  const { selectedYearId } = useModuleYear('finance');
  
  // Use selectedYearId in all API calls for finance data
  const invoicesQuery = useQuery({
    queryKey: ['invoices', selectedYearId],
    queryFn: () => financeService.getInvoices({ year_id: selectedYearId })
  });
  
  return (
    <div>
      <ModuleYearSelector moduleName="finance" />
      {/* Finance data for selectedYearId */}
    </div>
  );
}
```

## 5. Migration Plan

### Phase 1: Backend Foundation (Week 1)
- [ ] Create database table
- [ ] Write API endpoints
- [ ] Add tests

### Phase 2: Finance Module (Week 2)
- [ ] Add ModuleYearSelector to Finance pages
- [ ] Update all finance queries to use module year
- [ ] Test with historical data

### Phase 3: Academic Module (Week 3)
- [ ] Add ModuleYearSelector to Academic pages
- [ ] Update marks/transcripts queries
- [ ] Test

### Phase 4: HR Module (Week 4)
- [ ] Add ModuleYearSelector to HR pages
- [ ] Test payroll across years

### Phase 5: Registry & Admissions (Week 5)
- [ ] Add ModuleYearSelector
- [ ] Test

### Phase 6: Polish & Documentation (Week 6)
- [ ] User training docs
- [ ] Monitor data consistency
- [ ] Gather feedback

## 6. Testing Checklist

- [ ] User can select different years for different modules
- [ ] Year selection persists across sessions
- [ ] Switching modules doesn't affect other module's year
- [ ] Reports show correct year's data
- [ ] Refresh maintains year selection
- [ ] Reset to current year works
- [ ] Historical data remains accessible
- [ ] No data corruption on year switch
- [ ] Permissions still enforced per year
- [ ] Audit logs record year selections

## 7. Rollback Strategy

- Keep global year state as fallback
- New code checks module preference first
- If not set, falls back to global year
- Can disable feature via flag `ENABLE_MODULE_YEAR_SELECTION=false`
- No data migration needed (new table only)

## 8. Performance Considerations

- Cache module preferences in frontend (5 min TTL)
- Lazy load year selector (code split)
- Index on (user_id, module_name) for fast lookups
- Batch API calls if selecting year for multiple modules

## 9. Security

- Verify user has access to selected year (permissions check)
- Log year selections for audit trail
- Prevent SQL injection via prepared statements
- Sanitize module_name enum values
