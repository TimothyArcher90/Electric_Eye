@echo off
REM Arranca Electric Eye: editor en el navegador + puente con Claude.
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install
)
call npm run iniciar
pause
