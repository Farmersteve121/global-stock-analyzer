@echo off
chcp 65001 >nul
title GlobalStock - Deploy to Render
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org
  pause
  exit /b 1
)
set "MONGODB_URI="
set /p MONGO_INPUT=Paste MongoDB Atlas URI? (optional, press Enter to skip): 
if not "%MONGO_INPUT%"=="" set "MONGODB_URI=%MONGO_INPUT%"
echo.
echo Deploying to Render (about 3-6 minutes, keep this window open)...
echo API key: auto-read from clipboard (rnd_...). If not found, you will be asked to paste it.
echo.
node scripts\deploy-render.js
echo.
pause
