# Pokretanje aplikacije za tablet preko USB kabla (adb reverse).
# Pokrece se dvoklikom na TABLET.cmd u fascikli gotovo.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$PORT = 4173

function Find-Adb {
  $c = Get-Command adb -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $cands = @(
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe",
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    "C:\platform-tools\adb.exe"
  )
  foreach ($p in $cands) { if (Test-Path $p) { return $p } }
  return $null
}

$adb = Find-Adb
if (-not $adb) {
  Write-Host "adb nije pronadjen. Instalirajte ga komandom:" -ForegroundColor Red
  Write-Host "  winget install Google.PlatformTools"
  Read-Host "Enter za izlaz"; exit 1
}

if (-not (Test-Path "$root\node_modules")) {
  Write-Host "== npm install ==" -ForegroundColor Cyan
  npm install; if ($LASTEXITCODE) { Read-Host "Greska. Enter za izlaz"; exit 1 }
}

Write-Host "== Izrada aplikacije (npm run build) ==" -ForegroundColor Cyan
npm run build; if ($LASTEXITCODE) { Read-Host "Greska pri izradi. Enter za izlaz"; exit 1 }

Write-Host ""
Write-Host "== Povezivanje tableta ==" -ForegroundColor Cyan
Write-Host "Prikljucite tablet USB kablom. Na tabletu dozvolite 'USB otklanjanje gresaka' za ovaj racunar."
while ($true) {
  $lines = & $adb devices | Select-Object -Skip 1 | Where-Object { $_.Trim() }
  $ok = $lines | Where-Object { $_ -match "\tdevice$" }
  if ($ok) { break }
  if ($lines | Where-Object { $_ -match "unauthorized" }) {
    Write-Host "  Tablet ceka odobrenje: na ekranu tableta dodirnite 'Dozvoli'." -ForegroundColor Yellow
  } else {
    Write-Host "  Tablet nije pronadjen, cekam..." -ForegroundColor DarkGray
  }
  Start-Sleep -Seconds 3
}

& $adb reverse "tcp:$PORT" "tcp:$PORT"
if ($LASTEXITCODE) { Read-Host "adb reverse nije uspio. Enter za izlaz"; exit 1 }

Write-Host ""
Write-Host "Tablet je povezan." -ForegroundColor Green
Write-Host "Na tabletu u Chrome-u otvorite:  http://localhost:$PORT" -ForegroundColor Green
Write-Host "Sacekajte poruku da je aplikacija spremna za rad bez interneta, pa Meni > Dodaj na pocetni ekran > Instaliraj."
Write-Host "Ovaj prozor ostavite otvoren dok ne zavrsite; zatvaranjem se server gasi (instalirana aplikacija i dalje radi)."
Write-Host ""
npm run preview -- --strictPort
