@echo off
setlocal
chcp 65001 >nul
title Ear Review Launcher
cd /d "%~dp0"
echo Starting Ear Review...
echo Project: %cd%
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js 24.14 or later.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing project dependencies...
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed. Check your network and retry.
    pause
    exit /b 1
  )
)
if not exist dist\server\apps\api\src\startup.js goto build
if not exist dist\web\index.html goto build
goto launch
:build
echo Building the application...
call npm run build
if errorlevel 1 (
  echo Build failed. Please check the messages above.
  pause
  exit /b 1
)
:launch
node scripts\launch.mjs %*
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo The service URL is shown above. Press any key to close this launcher.
pause >nul
endlocal
