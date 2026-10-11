@echo off
title Device Health Monitor - Web
cd /d "%~dp0frontend"
echo.
echo  Menyajikan dasbor web di http://localhost:4173
echo  Buka alamat itu di browser (atau http://<IP-laptop>:4173 dari HP).
echo  Tekan Ctrl+C untuk berhenti.
echo.
npm run preview
pause
