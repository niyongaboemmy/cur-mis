# Testing Guide: Country-Type Visual Differentiation

## Feature Overview
Enhanced the International Students page to display students grouped by their geographic region with visual differentiation via:
- Color-coded left borders on table rows
- Region badges in the country column
- Automatic country name normalization
- Regional categorization

## Test Coverage

### 1. Country Normalization Tests

#### Test Data
| Input | Expected Output | Region |
|-------|-----------------|--------|
| Rwanda / Rwa / Rwandan | Rwanda | East Africa |
| Tanzania / Tanz / Tanzania | Tanzania | East Africa |
| Uganda / UG | Uganda | East Africa |
| Kenya / Ken | Kenya | East Africa |
| Democratic Republic of the Congo / DRC / Congo | Democratic Republic of the Congo | East Africa |
| South Sudan / S. Sudan | South Sudan | East Africa |
| Liberia | Liberia | West Africa |
| Sierra Leone | Sierra Leone | West Africa |
| Ghana / GH | Ghana | West Africa |
| Nigeria / Nig | Nigeria | West Africa |
| India / IN | India | Asia-Pacific |
| China / CN | China | Asia-Pacific |
| Japan / JP | Japan | Asia-Pacific |
| United States / US / USA | United States | Americas |
| Canada / Can | Canada | Americas |
| France / FR / Fran | France | Europe |
| Germany / DE / Ger | Germany | Europe |
| Saudi Arabia / Saud | Saudi Arabia | Middle East |
| UAE / Emirates / AE | United Arab Emirates | Middle East |
| South Africa / ZA | South Africa | Southern Africa |
| Zambia | Zambia | Southern Africa |

### 2. Visual Differentiation Tests

#### Color-coded Borders
| Region | Border Color | Hex |
|--------|-------------|-----|
| East Africa | Emerald | #10b981 |
| West Africa | Sky | #0ea5e9 |
| Southern Africa | Cyan | #06b6d4 |
| Asia-Pacific | Purple | #a855f7 |
| Europe | Amber | #f59e0b |
| Middle East | Rose | #f43f5e |
| Americas | Brand | #3b82f6 (configurable) |
| Other | Ink | #6b7280 |

#### Region Badges
- Display below country name
- Semi-transparent background matching border color
- Rounded corners with padding
- Responsive text color (light/dark mode aware)

### 3. Functional Tests

#### Page Load
- [ ] Page loads without errors
- [ ] Summary cards display correctly (Matching, With visa uploaded, Expiring ≤7d, Expired)
- [ ] Filter controls render properly
- [ ] Data table loads with student records

#### Country Display
- [ ] Country column shows flag emoji + country name + region badge
- [ ] Multiple country name variations resolve to same normalized country
- [ ] Missing/null countries display as "—" (dash)

#### Row Styling
- [ ] Each row has a 4px colored left border matching the region
- [ ] Hover effect works (opacity transition)
- [ ] Row click navigates to student profile

#### Sorting & Filtering
- [ ] Country filter dropdown shows all normalized countries
- [ ] Region-based visual grouping visible when scrolling
- [ ] Pagination doesn't break visual styling
- [ ] Export CSV includes normalized country names

#### Dark Mode
- [ ] Region badges adapt to dark theme colors
- [ ] Text remains readable in both light and dark modes
- [ ] Border colors maintain contrast

### 4. Browser Compatibility

Test on:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (if available)
- [ ] Mobile browser (responsive)

### 5. Performance Tests

- [ ] Page loads in < 3 seconds on slow 3G
- [ ] No console errors or warnings
- [ ] CSS classes don't bloat bundle size
- [ ] Color computations don't impact scroll performance

### 6. Regression Tests

Ensure existing functionality still works:
- [ ] Search by name/email still works
- [ ] Program filter still works
- [ ] Visa status filter still works
- [ ] Visa uploaded filter still works
- [ ] Export CSV still works
- [ ] Clear filters button still works
- [ ] Pagination still works
- [ ] Clicking row still navigates to student profile

## Manual Testing Steps

### Step 1: Navigate to International Students Page
1. Log in as admin
2. Go to Registry → International students
3. Verify page loads without errors

### Step 2: Verify Region Categorization
1. Look at students with different countries
2. Verify row left borders match expected colors:
   - Rwanda/Uganda/Kenya/Tanzania students → Green (Emerald)
   - Liberia/Sierra Leone/Ghana students → Blue (Sky)
   - India/China/Japan students → Purple (Purple)
   - US/Canada students → Brand blue (Brand)
   - France/Germany/Italy students → Orange (Amber)
   - Saudi Arabia/UAE students → Pink (Rose)
   - Zambia/Zimbabwe students → Teal (Cyan)

### Step 3: Test Country Normalization
1. Add test data with variations:
   - "Rwanda" and "Rwa" and "Rwandan" → All show as "Rwanda" | East Africa
   - "DRC" and "Congo" → Both show as "Democratic Republic of the Congo" | East Africa
   - "Tanz" and "Tanzania" → Both show as "Tanzania" | East Africa
2. Verify they all display with correct region badge

### Step 4: Test Filters
1. Filter by "Country: Rwanda" → Only Rwanda students appear with green border
2. Filter by "Country: India" → Only India students appear with purple border
3. Clear filters → All students reappear

### Step 5: Test Responsive Design
1. Resize browser to mobile width (< 600px)
2. Verify:
   - Table scrolls horizontally if needed
   - Region badges stay visible
   - Left borders stay visible
   - Text remains readable

### Step 6: Test Dark Mode
1. Toggle dark mode (if available)
2. Verify:
   - Badge backgrounds adapt to dark theme
   - Text color remains readable
   - Border colors maintain contrast
   - All colors look correct

## Expected Results

✅ **Success Criteria:**
1. All country name variations normalize to consistent display
2. Row left borders accurately reflect student's region
3. Region badges display with correct colors and text
4. No visual glitches or layout breaking
5. All existing filters/searches continue to work
6. Page performance is acceptable
7. Dark mode colors look good
8. Mobile responsive design works

## Known Limitations

- Region categorization is simplified (e.g., all East African countries in one region)
- Country codes must exist in `COUNTRY_BY_NAME` or `COUNTRY_BY_NATIONALITY` for flag emoji
- Countries not in predefined lists fall into "Other" category
- Region names are in English only

## Future Enhancements

- [ ] Add "Filters by Region" dropdown (hide detailed country list)
- [ ] Add region statistics cards
- [ ] Add region-based sorting
- [ ] Add ability to customize region definitions per institution
- [ ] Support for multi-region mapping (some countries could be in multiple regions)
- [ ] Region-based export grouping

## Files Modified

- `frontend/src/pages/admin/InternationalStudentsPage.tsx`
  - Added `normalizeCountryName()` function
  - Added `getCountryRegion()` function
  - Added `getRegionColorClass()` function
  - Enhanced `countryCell()` renderer
  - Updated table row styling with region-based borders

## Commit Information

- **Commit**: f561d18
- **Branch**: faustin
- **Date**: 2026-09-27
- **Author**: Claude Haiku 4.5

## Deployment Checklist

Before deploying to production:

- [ ] Code review approved
- [ ] All manual tests passed
- [ ] No console errors in browser DevTools
- [ ] No TypeScript compilation errors (`npm run type-check`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Unit/integration tests pass (if any)
- [ ] E2E tests pass
- [ ] Bundle size impact reviewed
- [ ] Dark mode tested in browser
- [ ] Mobile responsive tested
- [ ] All browsers tested
- [ ] Commit pushed to main
- [ ] Built for production (`npm run build`)
- [ ] Static assets deployed to server
- [ ] Browser cache invalidated (new hash in filenames)
- [ ] Backend API endpoints verified responding
- [ ] Database has international students data
- [ ] Staff given access to new feature
- [ ] User documentation updated
- [ ] Monitoring/analytics set up (if needed)

