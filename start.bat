@echo off
title BAC 2027 Intelligent Study OS
echo.
echo ============================================
echo  🎓 BAC 2027 Intelligent Study OS
echo  Starting server on http://localhost:3000
echo ============================================
echo.
cd /d "%~dp0"
echo Opening browser...
start http://localhost:3000
node server.js
pause
