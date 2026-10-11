@echo off
title Device Health Monitor - Agent OS
cd /d "%~dp0"
echo.
echo  Menjalankan agent OS di http://127.0.0.1:8000
echo  (Kalau muncul "address in use", berarti agent sudah berjalan - abaikan.)
echo  Uji: http://127.0.0.1:8000/health
echo.
python -m agent.main
pause
