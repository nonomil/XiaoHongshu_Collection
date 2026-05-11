@echo off
setlocal

cd /d "%~dp0"
set "UI_URL=http://127.0.0.1:3030/"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install Node.js first, then run this launcher again.
  pause
  exit /b 1
)

echo Restarting local UI server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 3030 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }" >nul 2>nul

start "XHS UI Server" /MIN cmd /c "cd /d ""%~dp0"" && node ""%~dp0scripts\ui_server.js"""
timeout /t 2 >nul

start "" "%UI_URL%"
exit /b 0
