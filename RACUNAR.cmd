@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo == Prva priprema: npm install ==
  call npm install || goto greska
)
echo == Izrada aplikacije ==
call npm run build || goto greska
echo.
echo Otvara se Chrome/Edge na http://localhost:4173
echo Kliknite ikonu "Instaliraj" u adresnoj traci.
echo Ovaj prozor ostavite otvoren dok ne instalirate; zatim ga mozete zatvoriti.
echo.
start "" http://localhost:4173
call npm run preview -- --strictPort
goto kraj
:greska
echo Doslo je do greske.
:kraj
pause
