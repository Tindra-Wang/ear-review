@echo off
setlocal
chcp 65001 >nul
title Ear Review Launcher
cd /d "%~dp0"
echo Preparing Ear Review environment...
call "%~dp0安装环境.bat" --no-pause %*
if errorlevel 1 (
  echo Environment setup failed. Please check the messages above.
  pause
  exit /b 1
)
"%EAR_REVIEW_NODE%" scripts\launch.mjs %*
set "LAUNCH_EXIT=%errorlevel%"
echo.
echo The service URL is shown above. Press any key to close this launcher.
pause >nul
endlocal & exit /b %LAUNCH_EXIT%
