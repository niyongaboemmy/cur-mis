#!/bin/bash
# Test the actual running exemption letter feature

echo "✅ Testing Exemption Letter Feature"
echo ""
echo "1. Checking Backend Server..."
curl -s http://localhost:8000/api/documents/exemption-letter/preview -X POST \
  -H "Content-Type: application/json" \
  -d '{"student_id":1}' | grep -q "Unauthorized\|Forbidden" && echo "   ✅ Backend API responsive" || echo "   ❌ Backend not responding"

echo ""
echo "2. Checking Frontend Server..."
curl -s http://localhost:5176/umis/ | grep -q "cur-mis\|CUR-MIS" && echo "   ✅ Frontend running on port 5176" || echo "   ❌ Frontend not found"

echo ""
echo "3. Checking Component Files..."
test -f frontend/src/components/documents/ExemptionLetterModal.tsx && echo "   ✅ Modal component exists" || echo "   ❌ Modal component missing"

echo ""
echo "4. Checking Service Methods..."
grep -q "previewExemptionLetter\|downloadExemptionLetter" frontend/src/services/documentService.ts && echo "   ✅ API service methods added" || echo "   ❌ API service methods missing"

echo ""
echo "5. Checking DocumentGenerationPage Integration..."
grep -q "ExemptionLetterModal" frontend/src/pages/DocumentGenerationPage.tsx && echo "   ✅ Modal imported in page" || echo "   ❌ Modal not imported"

echo ""
echo "6. Checking PHP Backend Files..."
php -l backend/app/Controllers/DocumentController.php 2>&1 | grep -q "No syntax" && echo "   ✅ DocumentController syntax OK" || echo "   ❌ DocumentController has errors"
php -l backend/app/Helpers/DocumentHelper.php 2>&1 | grep -q "No syntax" && echo "   ✅ DocumentHelper syntax OK" || echo "   ❌ DocumentHelper has errors"
php -l backend/routes/api/documents.php 2>&1 | grep -q "No syntax" && echo "   ✅ Routes syntax OK" || echo "   ❌ Routes have errors"

echo ""
echo "✅ All checks complete!"
