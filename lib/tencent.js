'use strict';

const BATCH = 50;

// 腾讯行情批量接口（GBK 编码），一次可查多只
async function fetchTencentQuotes(tencentSyms) {
  const out = {};
  const list = [...new Set((tencentSyms || []).filter(Boolean))];
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    let r;
    try {
      r = await fetch('https://qt.gtimg.cn/q=' + chunk.join(','), {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://gu.qq.com/' },
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) continue;
    } catch (e) { continue; }
    const txt = new TextDecoder('gbk').decode(Buffer.from(await r.arrayBuffer()));
    for (const line of txt.split(';')) {
      const m = line.match(/v_(\w+)="([^"]*)"/);
      if (!m) continue;
      const p = m[2].split('~');
      if (p.length < 35 || !p[3]) continue;
      const num = (x) => { const v = parseFloat(x); return Number.isFinite(v) ? v : null; };
      out[m[1]] = {
        name: p[1] || null,
        code: p[2] || null,
        price: num(p[3]),
        prevClose: num(p[4]),
        open: num(p[5]),
        high: num(p[33]),
        low: num(p[34]),
        change: num(p[31]),
        changePct: num(p[32]),
        volume: num(p[36]) || 0,
        amount: num(p[37]) || 0, // 单位：万元（A股/港股）
        pe: num(p[39]),
        time: p[30] || null,
      };
    }
  }
  return out;
}

module.exports = { fetchTencentQuotes };
