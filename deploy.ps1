# 环球股票分析 · 一键部署到 Render（PowerShell 版）
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[错误] 未找到 Node.js，请先安装: https://nodejs.org" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}
$env:RENDER_API_KEY = (Read-Host "请粘贴 Render API Key（rnd_ 开头）")
$mongo = Read-Host "是否粘贴 MongoDB Atlas 连接串？直接回车跳过"
if ($mongo) { $env:MONGODB_URI = $mongo }
Write-Host "`n开始部署（约 3-6 分钟，请勿关闭窗口）...`n"
node scripts\deploy-render.js
Write-Host "`n"
Read-Host "按回车退出"
