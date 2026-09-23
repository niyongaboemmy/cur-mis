#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy CUR-MIS Frontend to Production via cPanel UAPI

.DESCRIPTION
    Uploads frontend build to cPanel and extracts files to production.
    Requires: cPanel password for user 'curac'

.PARAMETER CpanelPassword
    Password for cPanel user 'curac'

.PARAMETER CpanelUrl
    cPanel server URL (default: https://cur.ac.rw:2083)

.EXAMPLE
    .\deploy-to-cpanel.ps1 -CpanelPassword "your_password"
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$CpanelPassword,

    [Parameter(Mandatory=$false)]
    [string]$CpanelUrl = "https://cur.ac.rw:2083",

    [Parameter(Mandatory=$false)]
    [string]$CpanelUser = "curac",

    [Parameter(Mandatory=$false)]
    [string]$TargetDir = "/public_html/umis"
)

# Colors
$Green = "`e[32m"
$Red = "`e[31m"
$Yellow = "`e[33m"
$Blue = "`e[34m"
$Reset = "`e[0m"

function Write-Status {
    param([string]$Message, [string]$Type = "Info")

    $prefix = switch($Type) {
        "Success" { "$Green✅ " }
        "Error" { "$Red❌ " }
        "Warning" { "$Yellow⚠️  " }
        "Info" { "$Blue ℹ️  " }
        default { "" }
    }

    Write-Host "$prefix$Message$Reset"
}

Write-Host "`n╔════════════════════════════════════════════════════════════╗"
Write-Host "║         CUR-MIS Frontend Deployment to cPanel             ║"
Write-Host "╚════════════════════════════════════════════════════════════╝`n"

# Validate password
if ([string]::IsNullOrWhiteSpace($CpanelPassword)) {
    Write-Status "ERROR: cPanel password is required!" "Error"
    Write-Host "`nUsage: .\deploy-to-cpanel.ps1 -CpanelPassword 'your_password'`n"
    exit 1
}

# Check if zip file exists
$zipPath = Join-Path (Get-Location) "frontend-manual-deploy.zip"
if (-not (Test-Path $zipPath)) {
    Write-Status "ERROR: frontend-manual-deploy.zip not found!" "Error"
    Write-Host "Please run: npm run build in frontend/ directory first`n"
    exit 1
}

Write-Status "Starting deployment..." "Info"
Write-Host "  URL: $CpanelUrl"
Write-Host "  User: $CpanelUser"
Write-Host "  Target: $TargetDir`n"

# Prepare credentials
$pair = "$($CpanelUser):$($CpanelPassword)"
$encodedCredentials = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$basicAuthHeader = "Basic $encodedCredentials"

# Get file size
$fileSize = (Get-Item $zipPath).Length / 1MB
Write-Status "Archive size: $([Math]::Round($fileSize, 2)) MB" "Info"

# Upload zip file
Write-Status "Uploading frontend-manual-deploy.zip..." "Info"

try {
    $uploadUri = "$CpanelUrl/execute/Fileman/upload_files"

    # Create form data
    $form = @{
        'dir' = $TargetDir
        'overwrite' = '1'
    }

    # Upload using curl (more reliable than PowerShell for binary files)
    $curlCmd = @(
        'curl',
        '--silent',
        '--insecure',
        '-u', $pair,
        '-F', "dir=$TargetDir",
        '-F', 'overwrite=1',
        '-F', "file-1=@$zipPath",
        $uploadUri
    )

    $uploadResult = & $curlCmd
    $uploadResponse = $uploadResult | ConvertFrom-Json -ErrorAction SilentlyContinue

    if ($uploadResponse.status -eq 1 -or $uploadResponse.status -eq "1") {
        Write-Status "Upload successful!" "Success"
    } else {
        Write-Status "Upload may have issues. Response: $uploadResult" "Warning"
    }
} catch {
    Write-Status "Upload failed: $_" "Error"
    exit 1
}

# Create extractor script
Write-Status "Creating extractor script..." "Info"

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

$it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($staging, RecursiveDirectoryIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST
);

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

$cl = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($staging, RecursiveDirectoryIterator::SKIP_DOTS),
    RecursiveIteratorIterator::CHILD_FIRST
);

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
$token = (([char[]](48..57 + 97..102) | Sort-Object {Get-Random}) -join '' ).substring(0, 32)

# Replace placeholders
$extractorPhp = $extractorPhp -replace "DEPLOY_TOKEN", $token
$extractorPhp = $extractorPhp -replace "DEPLOY_ZIP_NAME", "frontend-manual-deploy.zip"

# Save extractor
$extractorPath = Join-Path (Get-Location) "_extract.php"
Set-Content -Path $extractorPath -Value $extractorPhp -Encoding UTF8

Write-Status "Uploading extractor script..." "Info"

try {
    $curlCmd = @(
        'curl',
        '--silent',
        '--insecure',
        '-u', $pair,
        '-F', "dir=$TargetDir",
        '-F', 'overwrite=1',
        '-F', "file-1=@$extractorPath",
        $uploadUri
    )

    $extractUpload = & $curlCmd
    $extractResponse = $extractUpload | ConvertFrom-Json -ErrorAction SilentlyContinue

    if ($extractResponse.status -eq 1 -or $extractResponse.status -eq "1") {
        Write-Status "Extractor uploaded successfully!" "Success"
    } else {
        Write-Status "Extractor upload may have issues. Response: $extractUpload" "Warning"
    }
} catch {
    Write-Status "Extractor upload failed: $_" "Error"
    exit 1
}

# Call extractor
Write-Status "Extracting files on production server..." "Info"

try {
    $extractUrl = "https://cur.ac.rw/umis/_extract.php?token=$token"

    $curlCmd = @(
        'curl',
        '--silent',
        '--insecure',
        $extractUrl
    )

    $extractResult = & $curlCmd

    if ($extractResult -eq "ok") {
        Write-Status "Extraction successful!" "Success"
    } else {
        Write-Status "Extraction failed or returned: $extractResult" "Error"
        exit 1
    }
} catch {
    Write-Status "Extraction call failed: $_" "Error"
    exit 1
}

# Cleanup local files
Remove-Item -Force $extractorPath -ErrorAction SilentlyContinue

# Verify deployment
Write-Status "Verifying deployment..." "Info"

try {
    $billingUrl = "https://cur.ac.rw/umis/finance/billing"
    $curlCmd = @(
        'curl',
        '--silent',
        '--insecure',
        '-o', '/dev/null',
        '-w', '%{http_code}',
        $billingUrl
    )

    $httpCode = & $curlCmd

    if ($httpCode -eq "200") {
        Write-Status "Billing page is LIVE (HTTP 200)!" "Success"
    } else {
        Write-Status "Billing page returned HTTP $httpCode (may need time to propagate)" "Warning"
    }
} catch {
    Write-Status "Could not verify deployment: $_" "Warning"
}

Write-Host "`n╔════════════════════════════════════════════════════════════╗"
Write-Host "║                   DEPLOYMENT COMPLETE!                      ║"
Write-Host "╚════════════════════════════════════════════════════════════╝`n"

Write-Status "Files deployed to: $TargetDir" "Success"
Write-Status "Check: https://cur.ac.rw/umis/finance/billing" "Info"
Write-Host "`nTips:"
Write-Host "  • Hard refresh browser: Ctrl+Shift+R"
Write-Host "  • Clear cache if needed"
Write-Host "  • Wait 30 seconds for server cache to update`n"
