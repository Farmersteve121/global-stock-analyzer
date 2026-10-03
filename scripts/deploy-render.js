'use strict';
// Render 全自动部署脚本：创建/复用服务、等待上线、输出服务地址
// 用法（PowerShell 可用 $env:RENDER_API_KEY='rnd_...' 设置）：
//   node scripts/deploy-render.js
// 环境变量：
//   RENDER_API_KEY  必填，Render 控制台 → Account Settings → API Keys 创建（rnd_ 开头）
//   MONGODB_URI     可选，MongoDB Atlas 连接串，提供则一并配置
//   SERVICE_NAME    可选，默认 global-stock-analyzer
//   RENDER_REGION   可选，默认 singapore
const { execSync } = require('node:child_process');

const KEY = process.env.RENDER_API_KEY || '';
const MONGO_URI = process.env.MONGODB_URI || '';
const SERVICE_NAME = process.env.SERVICE_NAME || 'global-stock-analyzer';
const REPO = process.env.REPO || 'https://github.com/Farmersteve121/global-stock-analyzer';
const BRANCH = process.env.BRANCH || 'main';
const REGION = process.env.RENDER_REGION || 'singapore';

function fail(msg) {
  console.error('[deploy] 失败: ' + msg);
  process.exitCode = 1;
  throw new Error('FAILED');
}

function runSmoke(url) {
  console.log('[deploy] 服务已上线，执行冒烟验证...');
  const extra = MONGO_URI ? ' --require-mongo' : '';
  try {
    execSync('node scripts/smoke.js ' + url + extra, { stdio: 'inherit' });
    console.log('[deploy] 冒烟验证全部通过！部署完成。');
  } catch (e) {
    console.error('[deploy] 冒烟验证未通过，请查看上方输出');
    process.exitCode = 1;
  }
}

async function api(path, opts) {
  opts = opts || {};
  const headers = { Authorization: 'Bearer ' + KEY, Accept: 'application/json' };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const r = await fetch('https://api.render.com' + path, { method: opts.method || 'GET', headers, body: opts.body });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}

(async () => {
  if (!KEY || KEY.indexOf('rnd_') !== 0) fail('缺少有效的 RENDER_API_KEY（必须以 rnd_ 开头，请确认复制完整）');
  console.log('[deploy] 检查是否已有同名服务...');
  const list = await api('/v1/services?limit=20&name=' + encodeURIComponent(SERVICE_NAME));
  if (list.status === 401) fail('API Key 无效（HTTP 401），请到 Render → Account Settings → API Keys 重新复制完整 Key');
  if (list.status === 200 && Array.isArray(list.json)) {
    const exist = list.json.find((s) => s.service && s.service.name === SERVICE_NAME);
    if (exist && exist.service) {
      const d = exist.service.serviceDetails || {};
      console.log('[deploy] 已存在服务，状态=' + (d.status || '?') + (d.url ? '，地址=' + d.url : ''));
      if (d.url) { console.log('URL=' + d.url); if (d.status === 'live') runSmoke(d.url); return; }
    }
  }
  console.log('[deploy] 获取 owners...');
  const owners = await api('/v1/owners');
  const arr = Array.isArray(owners.json) ? owners.json : [];
  console.log('[deploy] owners: ' + arr.map((o) => o.type + ':' + o.id).join(', '));
  const owner = arr.find((o) => o.type === 'user');
  if (!owner) fail('未找到 user 类型 owner（HTTP ' + owners.status + '），请检查 Key 归属账户');
  const body = {
    type: 'web_service',
    name: SERVICE_NAME,
    ownerId: owner.id,
    repo: REPO,
    branch: BRANCH,
    runtime: 'node',
    buildCommand: 'npm install',
    startCommand: 'node server.js',
    healthCheckPath: '/api/health',
    plan: 'free',
    region: REGION,
    envVars: [{ key: 'NODE_VERSION', value: '22' }],
  };
  if (MONGO_URI) body.envVars.push({ key: 'MONGODB_URI', value: MONGO_URI });
  console.log('[deploy] 创建服务（region=' + REGION + '，MongoDB=' + (MONGO_URI ? '已配置' : '内存模式') + '）...');
  const created = await api('/v1/services', { method: 'POST', body: JSON.stringify(body) });
  if (created.status >= 400) fail('创建失败 HTTP ' + created.status + '：' + JSON.stringify(created.json).slice(0, 300));
  const svcId = created.json && (created.json.id || (created.json.service && created.json.service.id));
  if (!svcId) fail('创建响应缺少服务 id：' + JSON.stringify(created.json).slice(0, 200));
  console.log('[deploy] 服务 id=' + svcId + '，等待构建上线（最长约10分钟）...');
  for (let i = 0; i < 40; i++) {
    await new Promise((res) => setTimeout(res, 15000));
    const st = await api('/v1/services/' + svcId);
    const svc = (st.json && st.json.service) || {};
    const det = svc.serviceDetails || {};
    const status = det.status || '?';
    console.log('[deploy] ' + String(i + 1).padStart(2, '0') + 'x15s 状态=' + status + (det.url ? ' url=' + det.url : ''));
    if (status === 'live') { console.log('URL=' + det.url); runSmoke(det.url); return; }
    if (['build_failed', 'deploy_failed', 'crashed'].includes(status)) fail('部署失败: ' + status);
  }
  fail('10 分钟内未上线，请稍后重跑本脚本（会复用已创建的服务）或到 Render 控制台查看');
})().catch((e) => {
  const m = String((e && e.message) || e);
  if (m !== 'FAILED') { console.error('[deploy] 失败: ' + m); process.exitCode = 1; }
});
