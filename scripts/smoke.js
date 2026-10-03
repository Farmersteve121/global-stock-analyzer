'use strict';
// 端到端冒烟测试：对已部署（或本地）站点做全链路验证
// 用法: node scripts/smoke.js [BASE_URL] [--require-mongo]
// 例:   node scripts/smoke.js https://xxx.onrender.com --require-mongo
const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:\/\//.test(a)) || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const REQUIRE_MONGO = args.includes('--require-mongo');
const failures = [];

async function check(name, fn) {
  try { await fn(); console.log('PASS ' + name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('FAIL ' + name + ': ' + e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

(async () => {
  console.log('=== 冒烟测试 ' + BASE + ' ===');
  await check('health', async () => {
    const r = await fetch(BASE + '/api/health');
    assert(r.ok, 'HTTP ' + r.status);
    const j = await r.json();
    assert(j.ok === true, 'ok 字段异常');
    if (REQUIRE_MONGO) assert(j.db === 'mongodb', '未连接 MongoDB（db=' + j.db + '）');
    console.log('  db=' + j.db + ' uptime=' + j.uptime + 's');
  });
  await check('首页', async () => {
    const r = await fetch(BASE + '/');
    assert(r.ok, 'HTTP ' + r.status);
    assert((await r.text()).includes('环球股票分析'), '标题缺失');
  });
  await check('个股页', async () => {
    const r = await fetch(BASE + '/stock.html?s=600519.SS');
    assert(r.ok, 'HTTP ' + r.status);
  });
  await check('指数', async () => {
    const r = await fetch(BASE + '/api/indices');
    assert(r.ok, 'HTTP ' + r.status);
    const j = await r.json();
    assert(Array.isArray(j.items) && j.items.length >= 8, '指数数量不足');
    const errs = j.items.filter((x) => x.error);
    assert(errs.length === 0, '指数出错: ' + errs.map((x) => x.symbol).join(','));
    console.log('  ' + j.items.map((x) => x.symbol + ' ' + x.changePct + '%').join(' | '));
  });
  await check('热门行情', async () => {
    const r = await fetch(BASE + '/api/overview');
    assert(r.ok, 'HTTP ' + r.status);
    const j = await r.json();
    for (const m of ['sh', 'sz', 'hk', 'us']) assert(Array.isArray(j.markets[m]) && j.markets[m].length > 0, m + ' 无数据');
    const withQuote = Object.values(j.markets).flat().filter((s) => s.quote && s.quote.price != null).length;
    console.log('  有效报价 ' + withQuote + ' 只');
  });
  await check('A股详情', async () => {
    const r = await fetch(BASE + '/api/quote/600519.SS');
    assert(r.ok, 'HTTP ' + r.status);
    const j = await r.json();
    assert(j.history && j.history.length > 100, 'K线不足');
    assert(j.prediction && j.prediction.label && j.prediction.confidence != null, '预测缺失');
    assert(j.quote && j.quote.price != null, '实时价缺失');
    console.log('  ' + j.meta.name + ' ' + j.quote.price + ' 预测:' + j.prediction.label + '/' + j.prediction.confidence + '%');
  });
  await check('港股详情', async () => {
    const r = await fetch(BASE + '/api/quote/00700.HK');
    assert(r.ok, 'HTTP ' + r.status);
    const j = await r.json();
    assert(j.history && j.history.length > 100, 'K线不足');
  });
  await check('美股详情', async () => {
    const r = await fetch(BASE + '/api/quote/AAPL');
    assert(r.ok, 'HTTP ' + r.status);
    const j = await r.json();
    assert(j.history && j.history.length > 100, 'K线不足');
  });
  await check('自选收藏（含数据库读写）', async () => {
    const cid = 'smoke-' + Date.now();
    const p = await fetch(BASE + '/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: cid, symbol: 'AAPL' }) });
    assert(p.ok, 'POST HTTP ' + p.status);
    const g = await fetch(BASE + '/api/favorites?clientId=' + cid);
    const gj = await g.json();
    assert(gj.items && gj.items.length === 1, '自选数量异常');
    const d = await fetch(BASE + '/api/favorites/AAPL?clientId=' + cid, { method: 'DELETE' });
    assert(d.ok, 'DELETE HTTP ' + d.status);
  });
  console.log(failures.length ? '=== RESULT: FAIL (' + failures.length + ') ===' : '=== RESULT: ALL PASS ===');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
