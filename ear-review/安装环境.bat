@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Ear Review Environment Setup
set "SETUP_EXIT=1"
where node >nul 2>nul
if errorlevel 1 goto install_node
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>24||(a===24&&b>=14)?0:1)"
if not errorlevel 1 goto ready
:install_node
echo Installing Node.js LTS using Windows Package Manager...
where winget >nul 2>nul
if errorlevel 1 (
  echo winget is unavailable. Install Node.js LTS from https://nodejs.org/en/download
  goto finish
)
winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js installation did not complete. Restart this launcher after installing Node.js.
  goto finish
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>24||(a===24&&b>=14)?0:1)"
if errorlevel 1 (
  echo Node.js version is still too old. Install Node.js 24.14 or later and retry.
  goto finish
)
:ready
for /f "delims=" %%N in ('node -p "process.execPath"') do set "EAR_REVIEW_NODE=%%N"
"%EAR_REVIEW_NODE%" scripts\setup.mjs %*
set "SETUP_EXIT=%errorlevel%"
:finish
if /i "%~1"=="--no-pause" goto return
echo.
echo Press any key to close the environment setup window.
pause >nul
:return
endlocal & set "EAR_REVIEW_NODE=%EAR_REVIEW_NODE%" & exit /b %SETUP_EXIT%
