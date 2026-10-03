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
set "RENDER_API_KEY="
for /f "delims=" %%i in ('powershell -NoProfile -STA -Command "try { (Get-Clipboard -Raw) } catch { }"') do (
  if not defined RENDER_API_KEY set "RENDER_API_KEY=%%i"
)
if not defined RENDER_API_KEY goto :askkey
echo 检测到剪贴板中的 Key（%RENDER_API_KEY:~0,4%...）。
echo 按回车直接使用；若上次复制不完整，请粘贴完整 Key 替换:
set /p KEY_INPUT=
if not "%KEY_INPUT%"=="" set "RENDER_API_KEY=%KEY_INPUT%"
goto :mongoprompt
:askkey
set /p RENDER_API_KEY=请粘贴 Render API Key（rnd_ 开头）: 
:mongoprompt
set "MONGODB_URI="
set /p MONGO_INPUT=是否粘贴 MongoDB Atlas 连接串？直接回车跳过: 
if not "%MONGO_INPUT%"=="" set "MONGODB_URI=%MONGO_INPUT%"
echo.
echo 开始部署（约 3-6 分钟，请勿关闭窗口）...
echo.
node scripts\deploy-render.js
echo.
pause
