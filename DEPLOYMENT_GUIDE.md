# Deployment Guide: Country-Type Visual Differentiation

## Overview
This guide covers deploying the international students feature enhancements to production.

## Pre-Deployment Checklist

### Code Quality
```bash
# Type checking
cd frontend && npm run type-check

# Linting
npm run lint

# Testing (if applicable)
npm test
```

### Build Verification
```bash
# Production build
npm run build

# Verify bundle size
ls -lh dist/
```

## Deployment Steps

### 1. Backend (PHP)
**No backend changes required** for this feature update.
- The existing API endpoints are unchanged
- Database schema remains the same
- No new migrations needed

### 2. Frontend Deployment

#### Option A: Build Locally and Upload
```bash
cd frontend
npm install  # Ensure dependencies are up to date
npm run build  # Creates optimized dist/ folder
```

**Upload to production server:**
```bash
# Copy built files to web server
scp -r dist/* user@production-server:/var/www/cur-mis/
```

#### Option B: Build on Production Server
```bash
# SSH into production server
ssh user@production-server

# Navigate to project
cd /var/www/cur-mis/frontend

# Update code
git pull origin main

# Install dependencies
npm ci  # Use npm ci for production (more strict than npm install)

# Build
npm run build

# Verify build
ls -la dist/
```

#### Option C: Docker/Container Deployment
```dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 3. Verify Deployment

#### Check Page Load
```bash
# Test with curl
curl -s https://your-domain/admin/international-students | grep -i "international"
```

#### Browser Testing
1. Navigate to `https://your-domain/admin/international-students`
2. Verify:
   - Page loads without 404 errors
   - CSS styles are applied (colored borders visible)
   - Data table displays student records
   - Region badges are visible

#### Check Console for Errors
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for red error messages
4. Verify no network 404s for CSS/JS chunks

### 4. Cache Invalidation

#### Browser Cache
- Vite automatically creates versioned files (contains hash)
- No action needed if serving `dist/` directly
- If using caching headers, clear CDN cache:

```bash
# Example: Cloudflare
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
  -H "Authorization: Bearer {api_token}" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://your-domain/assets/*"]}'
```

#### Service Worker Cache (if applicable)
```bash
# Clear any service worker caches
# Usually done via browser DevTools → Application → Service Workers → Unregister
```

### 5. Rollback Plan

If issues occur:

#### Quick Rollback
```bash
# Revert to previous commit
git revert f561d18  # The new feature commit

# Rebuild and redeploy
npm run build
# Upload dist/ to production
```

#### Files to Monitor
- `dist/assets/index-*.js` (main bundle)
- `dist/assets/index-*.css` (styles)
- `dist/index.html` (entry point)

### 6. Post-Deployment Verification

#### Automated Checks
```bash
# Check if build contains the feature code
grep -r "getCountryRegion\|normalizeCountryName" dist/

# Should return matches in dist/assets/*.js
```

#### Manual Verification
1. **Test Country Normalization**
   - Find student from "Rwa" or "Rwanda"
   - Verify displays as "Rwanda | East Africa"

2. **Test Visual Differentiation**
   - Check row left borders are colored correctly
   - East Africa students → Green border
   - Europe students → Orange border
   - Asia-Pacific students → Purple border

3. **Test Filters**
   - Use Country filter
   - Select "Rwanda"
   - Verify only Rwanda students appear with green border

4. **Test Dark Mode** (if available)
   - Toggle dark mode
   - Verify badges adapt to dark theme
   - Text remains readable

5. **Test Responsive Design**
   - Resize to mobile (< 600px)
   - Verify layout still works
   - Borders and badges still visible

#### Performance Monitoring
- Monitor page load time (should be < 3s)
- Check for 404s in browser console
- Monitor memory usage (should be stable)
- Check CSS specificity conflicts

### 7. Monitoring & Alerts

Set up monitoring for:
```
- Page load time > 5s (alert)
- JavaScript errors > 0 (alert)
- API response time > 2s (alert)
- 404 errors on /assets/* (alert)
```

### 8. User Communication

#### Internal (Admin Team)
- Email notifying staff about visual enhancements
- Brief explanation of region color coding
- Screenshot or demo link

**Sample Email:**
```
Subject: New Feature: Regional Color Coding for International Students

Hi Team,

We've enhanced the International Students page with visual region-based 
differentiation to help you quickly identify student origins.

What's New:
✓ Color-coded borders on each student row (by geographic region)
✓ Region badges displaying next to country names
✓ Automatic normalization of country names (Rwanda/Rwa/Rwandan all appear as "Rwanda")

How to Use:
1. Navigate to Registry → International Students
2. Look for colored left borders on rows
3. Each color represents a region: Green=East Africa, Blue=West Africa, etc.

Region Colors:
🟢 East Africa (Rwanda, Uganda, Kenya, Tanzania, etc.)
🔵 West Africa (Liberia, Sierra Leone, Ghana, Nigeria)
🔷 Southern Africa (Zambia, Zimbabwe, South Africa)
🟣 Asia-Pacific (India, China, Japan, etc.)
🟡 Europe (France, Germany, Italy, etc.)
🔴 Middle East (Saudi Arabia, UAE, Qatar, etc.)
🎯 Americas (USA, Canada, etc.)

This feature is now available in production.

Questions? Contact: [support email]
```

### 9. Documentation Updates

Update user guides:
- [ ] Admin handbook
- [ ] International Students page help text
- [ ] Staff training materials
- [ ] Video tutorial (optional)

### 10. Version Information

Record deployment details:
```markdown
## Deployment Record

**Date**: 2026-09-27
**Feature**: Country-Type Visual Differentiation
**Commit**: f561d18
**Branch**: main
**Deployed By**: [Your Name]
**Status**: ✅ Live

### Verification
- [x] Page loads correctly
- [x] All region colors display
- [x] Country normalization works
- [x] Filters work correctly
- [x] No console errors
- [x] Dark mode works
- [x] Mobile responsive works

### Monitoring
- Page load time: [X]ms
- Error rate: 0%
- User feedback: [Pending]
```

## Troubleshooting

### Issue: Styles not loading
**Solution:**
- Clear browser cache (Ctrl+Shift+Del)
- Verify CSS file is in dist/assets/
- Check browser console for 404 errors
- Verify nginx/Apache serves dist/ directory

### Issue: Colors not showing (all black/default)
**Solution:**
- Check Tailwind CSS is compiled
- Verify dark mode toggle isn't stuck
- Clear browser cache
- Rebuild with `npm run build`

### Issue: Region badges not visible
**Solution:**
- Check browser zoom level (should be 100%)
- Verify JavaScript loaded (check dist/assets/*.js exists)
- Check console for JS errors
- Verify React is rendering correctly

### Issue: Performance degradation
**Solution:**
- Check bundle size: `npm run build && du -sh dist/`
- Monitor network requests (DevTools → Network tab)
- Check for memory leaks (DevTools → Memory tab)
- Profile with DevTools → Performance tab

## Rollback Procedure

If deployment fails or causes issues:

```bash
# 1. Identify last working commit
git log --oneline -20

# 2. Revert the feature commit
git revert f561d18

# 3. Rebuild
npm run build

# 4. Redeploy
# Upload dist/ to production

# 5. Verify
# Test international students page
```

## Support & Communication

For issues:
1. **Check logs**: `npm run build` output, server logs
2. **Browser DevTools**: Console, Network, Performance tabs
3. **Post-deployment testing**: Run through all manual tests
4. **Team communication**: Notify admins if rollback needed

## Success Criteria

✅ Deployment complete when:
- Page loads without errors
- All 7 region colors display correctly
- Country names normalize properly
- Filters work as expected
- No increase in error rate
- Page load time < 3 seconds
- All staff can see the feature

