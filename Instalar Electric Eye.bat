@echo off
REM Instala Electric Eye la primera vez (Node.js, dependencias, conexión con Claude, acceso directo).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
pause
