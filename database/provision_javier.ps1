# Creates or resets password for Javier (stf010@staff.import.pending) to match other staff (default 990099).
# Prerequisites: Python 3, and in this shell (replace with your project values from Supabase Dashboard → Settings → API):
#   $env:SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
#   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ... (service_role secret)"
#
# Then from repo root:
#   powershell -ExecutionPolicy Bypass -File database\provision_javier.ps1

$ErrorActionPreference = "Stop"
if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
  Write-Host "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (Dashboard → Settings → API)." -ForegroundColor Yellow
  exit 1
}
$env:PORTAL_STAFF_ONLY_EMAIL = "stf010@staff.import.pending"
if (-not $env:PORTAL_STAFF_BOOTSTRAP_PASSWORD) {
  $env:PORTAL_STAFF_BOOTSTRAP_PASSWORD = "990099"
}
Set-Location (Split-Path -Parent $PSScriptRoot)
python database/provision_staff_auth_users.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ""
Write-Host "If staff_profiles was seeded before this user existed, run staff_profiles_seed.sql again in SQL Editor (upsert joins auth.users by email)." -ForegroundColor Cyan
