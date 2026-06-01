# Bootstrap local password vault - creates local-secrets/ (gitignored, never deploys)
# Run from repo root:  .\database\bootstrap-local-vault.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $repoRoot "_local\secrets"
if (-not (Test-Path $dest)) {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
}
# Junction local-secrets -> _local/secrets for older docs
$legacyLink = Join-Path $repoRoot "local-secrets"
if (-not (Test-Path $legacyLink)) {
  cmd /c mklink /J "$legacyLink" "$dest" 2>$null | Out-Null
}
$srcVault = Join-Path $PSScriptRoot "local-vault\portal-vault.html"
$srcTemplate = Join-Path $PSScriptRoot "local-vault\secrets.template.env"

if (-not (Test-Path $srcVault)) {
  Write-Error "Missing template: $srcVault"
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null

Copy-Item -Path $srcVault -Destination (Join-Path $dest "portal-vault.html") -Force

$secretsPath = Join-Path $dest "secrets.env"
if (-not (Test-Path $secretsPath)) {
  Copy-Item -Path $srcTemplate -Destination $secretsPath
  Write-Host "Created secrets.env (edit with your values)"
} else {
  Write-Host "secrets.env already exists - left unchanged"
}

$readme = @"
PORTAL LOCAL SECRETS
====================
This folder is in .gitignore - nothing here is committed or deployed.

Files:
  portal-vault.html   Open in browser (double-click or file://)
  secrets.env         Plain KEY=value list (optional; import into vault)

First time:
  1. Open portal-vault.html in Chrome or Edge
  2. Create a master password (min 8 chars)
  3. Fill entries or Import secrets.env

Data folder: _local/secrets/ (move entire _local/ outside repo when sharing)

Re-run bootstrap to refresh portal-vault.html after repo updates:
  .\database\bootstrap-local-vault.ps1
"@

Set-Content -Path (Join-Path $dest "LEEME.txt") -Value $readme -Encoding UTF8

$htmlPath = Join-Path $dest "portal-vault.html"
Write-Host ""
Write-Host "Ready: $dest"
Write-Host "Open:  file:///$($htmlPath -replace '\\','/')"
Write-Host ""
Write-Host "This folder will NOT be pushed to GitHub."
