# Objava nove verzije na GitHub Pages (grana gh-pages).
# Pokretanje: dvoklik na OBJAVI.cmd ili `npm run objavi`.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$gh = 'C:\Program Files\GitHub CLI\gh.exe'
if (Test-Path $gh) { & $gh auth setup-git | Out-Null }

if (-not (Test-Path "$root\node_modules")) { npm install; if ($LASTEXITCODE) { throw 'npm install nije uspio' } }
npm test;          if ($LASTEXITCODE) { throw 'Testovi nisu prosli - objava prekinuta' }
npm run build;     if ($LASTEXITCODE) { throw 'Izrada nije uspjela' }

$remote = (git remote get-url origin).Trim()
$tmp = Join-Path $env:TEMP ("trener-pages-" + [guid]::NewGuid())
Copy-Item -Recurse "$root\dist" $tmp
New-Item -ItemType File "$tmp\.nojekyll" | Out-Null
Push-Location $tmp
try {
  git init -q -b gh-pages
  git config user.name  (git -C $root config user.name)
  git config user.email (git -C $root config user.email)
  git add -A
  git commit -q -m ("Objava " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
  git push -f $remote gh-pages
  if ($LASTEXITCODE) { throw 'Slanje na GitHub nije uspjelo' }
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $tmp
}
Write-Host ""
Write-Host "Objavljeno. Za 1-2 minuta nova verzija je na:" -ForegroundColor Green
Write-Host "  https://flopicic597-boop.github.io/trener/" -ForegroundColor Green
Write-Host "Aplikacija na tabletu i racunaru ponudice 'Azuriraj'."
