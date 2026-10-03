# 环球股票分析 · 一键部署到 Render（PowerShell 版，自动读取剪贴板 Key）
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[错误] 未找到 Node.js，请先安装: https://nodejs.org" -ForegroundColor Red
  Read-Host "按回车退出"
  exit 1
}
$clip = ""
try { $clip = (Get-Clipboard -Raw).Trim() } catch {}
if ($clip -match '^rnd_[A-Za-z0-9]{20,}$') {
  Write-Host "检测到剪贴板中的 Key（rnd_...），按回车直接使用；若复制不完整请粘贴完整 Key 替换:"
  $input = Read-Host
  if ($input) { $env:RENDER_API_KEY = $input } else { $env:RENDER_API_KEY = $clip }
} else {
  $env:RENDER_API_KEY = (Read-Host "请粘贴 Render API Key（rnd_ 开头）")
}
$mongo = Read-Host "是否粘贴 MongoDB Atlas 连接串？直接回车跳过"
if ($mongo) { $env:MONGODB_URI = $mongo }
Write-Host "`n开始部署（约 3-6 分钟，请勿关闭窗口）...`n"
node scripts\deploy-render.js
Write-Host "`n"
Read-Host "按回车退出"
