# ==============================================================================
# setup_local_postgres.ps1: Local PostgreSQL 16 Setup for HOTEL_CRM
# Part of Desktop-First Offline Architecture (Phase 1)
# ==============================================================================

param(
    [string]$DbUser = "postgres",
    [string]$DbPassword = "postgres",
    [string]$DbName = "hotel_crm_local",
    [int]$DbPort = 5432
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " HOTEL_CRM: Local PostgreSQL 16 Initialization Helper" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check if PostgreSQL service is installed and running
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue

if ($pgService) {
    Write-Host "[OK] Detected PostgreSQL service: $($pgService.Name) ($($pgService.Status))" -ForegroundColor Green
    if ($pgService.Status -ne "Running") {
        Write-Host "[INFO] Starting PostgreSQL service..." -ForegroundColor Yellow
        Start-Service $pgService.Name
    }
} else {
    Write-Host "[NOTICE] PostgreSQL service not detected on this machine." -ForegroundColor Yellow
    Write-Host "To install PostgreSQL 16 automatically via winget, run:" -ForegroundColor Cyan
    Write-Host "  winget install PostgreSQL.PostgreSQL.16 --silent --accept-package-agreements --accept-source-agreements" -ForegroundColor White
    Write-Host ""
    Write-Host "Alternatively, download the official Windows installer from: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads" -ForegroundColor Gray
}

# 2. Check port 5432 availability
$portConn = Test-NetConnection -ComputerName "localhost" -Port $DbPort -InformationLevel Quiet -WarningAction SilentlyContinue

if ($portConn) {
    Write-Host "[OK] Port $DbPort is listening and accepting local connections." -ForegroundColor Green
    
    # Try creating database if psql is available
    $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($psqlCmd) {
        Write-Host "[INFO] Attempting to create database '$DbName' if not exists..." -ForegroundColor Cyan
        $env:PGPASSWORD = $DbPassword
        & psql -U $DbUser -h localhost -p $DbPort -c "CREATE DATABASE $DbName;" 2>$null
        Write-Host "[OK] Database check complete." -ForegroundColor Green
    }
} else {
    Write-Host "[WARN] Port $DbPort is not yet listening on localhost." -ForegroundColor Yellow
    Write-Host "Once PostgreSQL is running, port $DbPort will activate." -ForegroundColor Gray
}

# 3. Environment configuration template
$envFilePath = Join-Path $PSScriptRoot "..\backend\api\.env"
Write-Host ""
Write-Host "[CONFIG] Recommended environment variable in $envFilePath :" -ForegroundColor Cyan
Write-Host "LOCAL_DATABASE_URL=postgresql://${DbUser}:${DbPassword}@localhost:${DbPort}/${DbName}" -ForegroundColor White
Write-Host "CLOUD_DATABASE_URL=<your-supabase-connection-string>" -ForegroundColor Gray
Write-Host ""
Write-Host "When LOCAL_DATABASE_URL is set, HOTEL_CRM automatically routes all POS, Billing, and Order operations to local PostgreSQL in 100% offline-ready mode." -ForegroundColor Green
