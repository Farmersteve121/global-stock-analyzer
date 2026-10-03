# 环球股票分析 · 一键部署到 Render（自动读取剪贴板 Key）
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '[错误] 未找到 Node.js，请先安装: https://nodejs.org' -ForegroundColor Red
  Read-Host '按回车退出'
  exit 1
}
$env:RENDER_API_KEY = ''
$clip = ''
try { $clip = (Get-Clipboard -Raw).Trim() } catch {}
if ($clip -match '^rnd_[A-Za-z0-9]{20,}$') {
  Write-Host '检测到剪贴板中的 Key（rnd_...），自动使用；若复制不完整请手动设置后重跑'
  $env:RENDER_API_KEY = $clip
} else {
  Write-Host '剪贴板中未检测到 Key，请复制 Render API Key（rnd_ 开头）后重跑，或手动执行：'
  Write-Host '  $env:RENDER_API_KEY=''rnd_你的Key''; node scripts\deploy-render.js'
}
if (-not $env:RENDER_API_KEY) { Read-Host '按回车退出'; exit 1 }
$mongo = Read-Host '是否粘贴 MongoDB Atlas 连接串？直接回车跳过'
if ($mongo) { $env:MONGODB_URI = $mongo }
Write-Host ''
Write-Host '开始部署（约 3-6 分钟，请勿关闭窗口）...'
Write-Host ''
node scripts\deploy-render.js
Write-Host ''
Read-Host '按回车退出'
