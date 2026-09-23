#!/usr/bin/env pwsh
param(
    [Parameter(Mandatory=$true)]
    [string]$CpanelPassword
)

$CpanelUrl = "https://cur.ac.rw:2083"
$CpanelUser = "curac"
$TargetDir = "/public_html/umis"

Write-Host "`n=== CUR-MIS FRONTEND DEPLOYMENT ===" -ForegroundColor Green

# Check if zip file exists
$zipPath = "frontend-manual-deploy.zip"
if (-not (Test-Path $zipPath)) {
    Write-Host "ERROR: $zipPath not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Starting deployment..." -ForegroundColor Cyan
Write-Host "URL: $CpanelUrl"
Write-Host "User: $CpanelUser`n"

$fileSize = (Get-Item $zipPath).Length / 1MB
Write-Host "Archive size: $([Math]::Round($fileSize, 2)) MB" -ForegroundColor Yellow

# Create credentials
$securePassword = ConvertTo-SecureString $CpanelPassword -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential($CpanelUser, $securePassword)

# Upload zip file
Write-Host "`nUploading frontend-manual-deploy.zip..." -ForegroundColor Cyan

try {
    $uploadUri = "$CpanelUrl/execute/Fileman/upload_files"

    $form = @{
        dir = $TargetDir
        overwrite = '1'
        'file-1' = Get-Item $zipPath
    }

    Write-Host "Sending to cPanel..." -ForegroundColor Yellow

    $response = Invoke-WebRequest -Uri $uploadUri `
        -Method Post `
        -Form $form `
        -Authentication Basic `
        -Credential $credential `
        -SkipCertificateCheck `
        -ErrorAction Stop

    Write-Host "Upload response: $($response.StatusCode)" -ForegroundColor Green
    $responseJson = $response.Content | ConvertFrom-Json

    if ($responseJson.status -eq 1 -or $responseJson.status -eq "1") {
        Write-Host "Upload successful!" -ForegroundColor Green
    } else {
        Write-Host "Status: $($responseJson.status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Upload error: $_" -ForegroundColor Red
    exit 1
}

# Create extractor script
Write-Host "`nCreating extractor script..." -ForegroundColor Cyan

$extractorPhp = @'
<?php
if (($_GET['token'] ?? '') !== 'DEPLOY_TOKEN') {
    http_response_code(403);
    die('forbidden');
}
$zip = __DIR__ . '/DEPLOY_ZIP_NAME';
$staging = __DIR__ . '/_ds_' . time();
$z = new ZipArchive;
if ($z->open($zip) !== TRUE) {
    http_response_code(500);
    echo 'failed: ' . $z->getStatusString();
    exit;
}
if (!mkdir($staging, 0755, true)) {
    http_response_code(500);
    echo 'failed: staging';
    exit;
}
$z->extractTo($staging);
$z->close();
unlink($zip);
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($staging, RecursiveDirectoryIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
foreach ($it as $f) {
    $rel = substr($f->getPathname(), strlen($staging) + 1);
    $d = __DIR__ . '/' . $rel;
    if ($f->isDir()) {
        if (!is_dir($d)) mkdir($d, 0755, true);
    } else {
        $dd = dirname($d);
        if (!is_dir($dd)) mkdir($dd, 0755, true);
        rename($f->getPathname(), $d);
    }
}
$cl = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($staging, RecursiveDirectoryIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
foreach ($cl as $f) {
    $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
}
@rmdir($staging);
if (function_exists('opcache_reset')) opcache_reset();
unlink(__FILE__);
echo 'ok';
?>
'@

# Generate token
$token = -join ((48..57) + (97..102) | Get-Random -Count 32 | ForEach-Object {[char]$_})

# Replace placeholders
$extractorPhp = $extractorPhp -replace "DEPLOY_TOKEN", $token
$extractorPhp = $extractorPhp -replace "DEPLOY_ZIP_NAME", "frontend-manual-deploy.zip"

# Save extractor
$extractorPath = "_extract.php"
Set-Content -Path $extractorPath -Value $extractorPhp -Encoding UTF8

# Upload extractor
Write-Host "Uploading extractor script..." -ForegroundColor Cyan

try {
    $form = @{
        dir = $TargetDir
        overwrite = '1'
        'file-1' = Get-Item $extractorPath
    }

    Write-Host "Sending extractor..." -ForegroundColor Yellow

    $response = Invoke-WebRequest -Uri $uploadUri `
        -Method Post `
        -Form $form `
        -Authentication Basic `
        -Credential $credential `
        -SkipCertificateCheck `
        -ErrorAction Stop

    Write-Host "Extractor uploaded successfully!" -ForegroundColor Green
} catch {
    Write-Host "Extractor upload error: $_" -ForegroundColor Red
    exit 1
}

# Call extractor
Write-Host "`nExtracting files on production server..." -ForegroundColor Cyan

try {
    $extractUrl = "https://cur.ac.rw/umis/_extract.php?token=$token"
    Write-Host "Calling extractor..." -ForegroundColor Yellow

    $response = Invoke-WebRequest -Uri $extractUrl `
        -SkipCertificateCheck `
        -ErrorAction Stop

    $result = $response.Content

    if ($result -eq "ok") {
        Write-Host "Extraction successful!" -ForegroundColor Green
    } else {
        Write-Host "Extraction returned: $result" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Extraction error: $_" -ForegroundColor Red
    exit 1
}

# Cleanup
Remove-Item -Force $extractorPath -ErrorAction SilentlyContinue

# Verify deployment
Write-Host "`nVerifying deployment..." -ForegroundColor Cyan

try {
    $billingUrl = "https://cur.ac.rw/umis/finance/billing"
    Write-Host "Checking $billingUrl..." -ForegroundColor Yellow

    $response = Invoke-WebRequest -Uri $billingUrl `
        -SkipCertificateCheck `
        -ErrorAction Stop

    Write-Host "Billing page is LIVE (HTTP $($response.StatusCode))!" -ForegroundColor Green
} catch {
    Write-Host "Verification inconclusive: $_" -ForegroundColor Yellow
}

Write-Host "`n=== DEPLOYMENT COMPLETE ===" -ForegroundColor Green
Write-Host "Files deployed to: $TargetDir" -ForegroundColor Green
Write-Host "Check: https://cur.ac.rw/umis/finance/billing" -ForegroundColor Cyan
Write-Host "`nNext steps:"
Write-Host "- Hard refresh browser: Ctrl+Shift+R"
Write-Host "- Clear cache if needed"
Write-Host "- Wait 30 seconds for server cache to update`n"
