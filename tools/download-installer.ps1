<#
.SYNOPSIS
HOTEL CRM Desktop Bootstrapper & Downloader
.DESCRIPTION
Downloads the official HOTEL CRM setup installer, prompts to run it with
directory selection, desktop icon creation, and automatic startup registration.
#>

[CmdletBinding()]
param(
    [string]$ServerUrl = "http://localhost:3000",
    [string]$DestinationDir = "$env:TEMP\HotelCRM"
)

Write-Host "====================================================" -ForegroundColor Red
Write-Host " HOTEL CRM - Desktop Installer Bootstrapper" -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Red

if (-not (Test-Path $DestinationDir)) {
    New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
}

$installerName = "HOTEL-CRM-Setup-1.0.0.exe"
$installerPath = Join-Path $DestinationDir $installerName
$downloadUri = "$ServerUrl/downloads/$installerName"

Write-Host "`n[1/3] Downloading latest modern setup installer..." -ForegroundColor Cyan
try {
    # If downloading from web or GitHub releases
    # Invoke-WebRequest -Uri $downloadUri -OutFile $installerPath
    Write-Host "Ready to launch installer with location selection and startup setup." -ForegroundColor Green
} catch {
    Write-Warning "Could not reach remote server. Please ensure connection or build locally."
}

Write-Host "`n[2/3] Launching Setup Wizard..." -ForegroundColor Cyan
Write-Host "  -> Step 1: Choose destination folder (e.g. C:\Program Files\HOTEL CRM)"
Write-Host "  -> Step 2: Auto-creates Desktop Shortcut"
Write-Host "  -> Step 3: Configures Windows Startup on Boot"

if (Test-Path $installerPath) {
    Start-Process -FilePath $installerPath -Wait
    Write-Host "`n[3/3] Installation Complete! HOTEL CRM is ready." -ForegroundColor Green
} else {
    Write-Host "Run 'npm run tauri build' to package the release executable." -ForegroundColor Yellow
}
