# CPanel Deployment Script for Billing Page
# This script helps upload the production build to cPanel

$buildPath = "c:\xamppP\htdocs\cur-mis\frontend\dist"
$cpanelUrl = "https://cur.ac.rw:2083/"
$uploadPath = "public_html/umis/"

Write-Host "========================================" -ForegroundColor Green
Write-Host "  BILLING PAGE - PRODUCTION DEPLOYMENT" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "✅ Build Location: $buildPath" -ForegroundColor Green
Write-Host "✅ Files Ready: $(Get-ChildItem $buildPath -Recurse -File | Measure-Object).Count files" -ForegroundColor Green
Write-Host ""

Write-Host "DEPLOYMENT STEPS:" -ForegroundColor Yellow
Write-Host "1. Open cPanel: $cpanelUrl" -ForegroundColor Yellow
Write-Host "2. Login with your credentials" -ForegroundColor Yellow
Write-Host "3. Click 'File Manager'" -ForegroundColor Yellow
Write-Host "4. Navigate to: $uploadPath" -ForegroundColor Yellow
Write-Host "5. Upload all files from: $buildPath" -ForegroundColor Yellow
Write-Host ""

Write-Host "FILES TO UPLOAD:" -ForegroundColor Cyan
Get-ChildItem $buildPath -Recurse -File | ForEach-Object {
    $relative = $_.FullName -replace [regex]::Escape($buildPath), ""
    Write-Host "  ✓ $relative" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "DEPLOYMENT TIME: ~10 minutes" -ForegroundColor Green
Write-Host "STATUS: READY TO DEPLOY" -ForegroundColor Green
Write-Host ""

Write-Host "After Upload:" -ForegroundColor Yellow
Write-Host "1. Clear browser cache (Ctrl+Shift+Delete)" -ForegroundColor Yellow
Write-Host "2. Test: https://cur.ac.rw/umis/finance/billing" -ForegroundColor Yellow
Write-Host "3. Verify students display" -ForegroundColor Yellow
Write-Host "4. Test 'Generate Invoices'" -ForegroundColor Yellow
Write-Host ""

Write-Host "🚀 READY TO DEPLOY NOW!" -ForegroundColor Green
