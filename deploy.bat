@echo off
chcp 65001 >nul
title 环球股票分析 - 一键部署到 Render
cd /d "%~dp0"
echo ============================================
echo   环球股票分析 · 一键部署到 Render
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装: https://nodejs.org
  pause
  exit /b 1
)
set /p KEY_INPUT=请粘贴 Render API Key（rnd_ 开头）然后回车: 
set "RENDER_API_KEY=%KEY_INPUT:"=%"
set /p MONGO_INPUT=是否粘贴 MongoDB Atlas 连接串？直接回车跳过: 
set "MONGODB_URI=%MONGO_INPUT:"=%"
echo.
echo 开始部署（约 3-6 分钟，请勿关闭窗口）...
echo.
node scripts\deploy-render.js
echo.
pause
