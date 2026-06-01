# Bootstrap _local/ — all private data in one folder (gitignored, never deploys).
# Run from repo root:  .\database\bootstrap-local-data.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $repoRoot "_local"

$dirs = @(
  "secrets",
  "hr",
  "payments",
  "scratch",
  "spreadsheets",
  "roster-work"
)

foreach ($d in $dirs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $localRoot $d) | Out-Null
}

function Move-TreeContents($fromDir, $toDir) {
  if (-not (Test-Path $fromDir)) { return }
  $fromItem = Get-Item -LiteralPath $fromDir -Force
  if ($fromItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Write-Host "Skip reparse point: $fromDir"
    return
  }
  New-Item -ItemType Directory -Force -Path $toDir | Out-Null
  Get-ChildItem -LiteralPath $fromDir -Force | ForEach-Object {
    $dest = Join-Path $toDir $_.Name
    if (Test-Path $dest) {
      Write-Host "Skip (exists): $dest"
    } else {
      Move-Item -LiteralPath $_.FullName -Destination $dest -Force
      Write-Host "Moved -> $dest"
    }
  }
  if ((Get-ChildItem -LiteralPath $fromDir -Force | Measure-Object).Count -eq 0) {
    Remove-Item -LiteralPath $fromDir -Force -Recurse
  }
}

function Move-IfFile($from, $toDir) {
  if (-not (Test-Path $from)) { return }
  if (-not (Test-Path $from -PathType Leaf)) { return }
  New-Item -ItemType Directory -Force -Path $toDir | Out-Null
  $dest = Join-Path $toDir (Split-Path $from -Leaf)
  if (Test-Path $dest) {
    Write-Host "Skip (exists): $dest"
    return
  }
  Move-Item -LiteralPath $from -Destination $dest -Force
  Write-Host "Moved -> $dest"
}

# Legacy folders -> _local/*
Move-TreeContents (Join-Path $repoRoot "local-secrets") (Join-Path $localRoot "secrets")
Move-TreeContents (Join-Path $repoRoot "hr_source") (Join-Path $localRoot "hr")
Move-TreeContents (Join-Path $repoRoot "payments_source") (Join-Path $localRoot "payments")

# Root scratch files
Get-ChildItem -Path $repoRoot -Filter ".tmp_*" -File -ErrorAction SilentlyContinue | ForEach-Object {
  Move-IfFile $_.FullName (Join-Path $localRoot "scratch")
}

# Stray xlsx (gitignored) under repo
$xlRoots = @($repoRoot, (Join-Path $repoRoot "database"), (Join-Path $repoRoot "working_ui"))
foreach ($root in $xlRoots) {
  if (-not (Test-Path $root)) { continue }
  Get-ChildItem -Path $root -Filter "*.xlsx" -File -ErrorAction SilentlyContinue | ForEach-Object {
    Move-IfFile $_.FullName (Join-Path $localRoot "spreadsheets")
  }
}

function Ensure-Junction($linkPath, $targetPath) {
  New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
  if (Test-Path $linkPath) {
    $item = Get-Item -LiteralPath $linkPath -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      Write-Host "Junction OK: $linkPath"
      return
    }
    if ((Get-ChildItem -LiteralPath $linkPath -Force | Measure-Object).Count -eq 0) {
      Remove-Item -LiteralPath $linkPath -Force -Recurse
    } else {
      Write-Host "Skip junction (folder not empty): $linkPath"
      return
    }
  }
  cmd /c mklink /J "$linkPath" "$targetPath" | Out-Null
  Write-Host "Junction: $linkPath -> $targetPath"
}

# Backward-compatible paths for docs/scripts
Ensure-Junction (Join-Path $repoRoot "local-secrets") (Join-Path $localRoot "secrets")
Ensure-Junction (Join-Path $repoRoot "hr_source") (Join-Path $localRoot "hr")
Ensure-Junction (Join-Path $repoRoot "payments_source") (Join-Path $localRoot "payments")

# Vault HTML if missing
& (Join-Path $PSScriptRoot "bootstrap-local-vault.ps1")

$readme = @"
PORTAL — carpeta local privada
==============================
NO commitear. NO desplegar en Vercel.

Puedes mover toda la carpeta _local fuera del proyecto cuando compartas el repo.

Ver LOCAL-DATA.template.txt en la raiz del repo.
"@
Set-Content -Path (Join-Path $localRoot "LEEME.txt") -Value $readme -Encoding UTF8

Write-Host ""
Write-Host "Local data root: $localRoot"
Write-Host "To keep secrets outside the clone, move _local to e.g. C:\Users\info\PORTAL-local\"
Write-Host ""
