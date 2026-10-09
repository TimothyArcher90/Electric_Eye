@echo off
REM Arranca Electric Eye: se actualiza, abre el editor en el navegador y conecta con Claude.
REM Deja esta ventana abierta mientras lo usas. Para apagarlo, ciérrala.
cd /d "%~dp0"
title Electric Eye
node servidor\actualizar.mjs
call npm run iniciar
if errorlevel 1 pause
