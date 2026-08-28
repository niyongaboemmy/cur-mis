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
Write-Host "Target: $TargetDir`n"

$fileSize = (Get-Item $zipPath).Length / 1MB
Write-Host "Archive size: $([Math]::Round($fileSize, 2)) MB" -ForegroundColor Yellow

# Convert password to base64 for auth header
$pair = "$CpanelUser`:$CpanelPassword"
$encodedCredentials = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($pair))
$basicAuthHeader = "Basic $encodedCredentials"

# Upload zip file
Write-Host "`nUploading frontend-manual-deploy.zip..." -ForegroundColor Cyan

try {
    Write-Host "Sending to cPanel..." -ForegroundColor Yellow

    $uploadUri = "$CpanelUrl/execute/Fileman/upload_files"

    # Read file as bytes
    $fileBytes = [System.IO.File]::ReadAllBytes($zipPath)
    $fileName = [System.IO.Path]::GetFileName($zipPath)

    # Create multipart form data
    $boundary = [System.Guid]::NewGuid().ToString()
    $body = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.StreamWriter($body)

    # Add form fields
    $writer.Write("--$boundary`r`n")
    $writer.Write("Content-Disposition: form-data; name=`"dir`"`r`n`r`n")
    $writer.Write("$TargetDir`r`n")

    $writer.Write("--$boundary`r`n")
    $writer.Write("Content-Disposition: form-data; name=`"overwrite`"`r`n`r`n")
    $writer.Write("1`r`n")

    $writer.Write("--$boundary`r`n")
    $writer.Write("Content-Disposition: form-data; name=`"file-1`"; filename=`"$fileName`"`r`n")
    $writer.Write("Content-Type: application/zip`r`n`r`n")
    $writer.Flush()

    # Add file bytes
    $body.Write($fileBytes, 0, $fileBytes.Length)

    $writer.Write("`r`n--$boundary--`r`n")
    $writer.Flush()

    $bodyBytes = $body.ToArray()
    $body.Close()
    $writer.Dispose()

    # Upload
    $headers = @{
        "Authorization" = $basicAuthHeader
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    }

    $response = Invoke-WebRequest -Uri $uploadUri `
        -Method Post `
        -Body $bodyBytes `
        -Headers $headers `
        -SkipCertificateCheck `
        -ErrorAction Stop

    Write-Host "Upload successful (HTTP $($response.StatusCode))!" -ForegroundColor Green

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
    Write-Host "Sending extractor..." -ForegroundColor Yellow

    $extractorBytes = [System.IO.File]::ReadAllBytes($extractorPath)
    $fileName = "_extract.php"

    $boundary = [System.Guid]::NewGuid().ToString()
    $body = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.StreamWriter($body)

    $writer.Write("--$boundary`r`n")
    $writer.Write("Content-Disposition: form-data; name=`"dir`"`r`n`r`n")
    $writer.Write("$TargetDir`r`n")

    $writer.Write("--$boundary`r`n")
    $writer.Write("Content-Disposition: form-data; name=`"overwrite`"`r`n`r`n")
    $writer.Write("1`r`n")

    $writer.Write("--$boundary`r`n")
    $writer.Write("Content-Disposition: form-data; name=`"file-1`"; filename=`"$fileName`"`r`n")
    $writer.Write("Content-Type: text/plain`r`n`r`n")
    $writer.Flush()

    $body.Write($extractorBytes, 0, $extractorBytes.Length)

    $writer.Write("`r`n--$boundary--`r`n")
    $writer.Flush()

    $bodyBytes = $body.ToArray()
    $body.Close()
    $writer.Dispose()

    $headers = @{
        "Authorization" = $basicAuthHeader
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    }

    $response = Invoke-WebRequest -Uri $uploadUri `
        -Method Post `
        -Body $bodyBytes `
        -Headers $headers `
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
