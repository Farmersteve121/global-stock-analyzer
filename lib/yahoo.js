'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function round(x) { return Math.round(x * 1000) / 1000; }

async function httpJson(url, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (r.status === 429) {
        lastErr = new Error('rate-limited');
        await new Promise((res) => setTimeout(res, 700 * (i + 1)));
        continue;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise((res) => setTimeout(res, 400));
    }
  }
  throw lastErr;
}

// 主数据源：Yahoo Finance 日K
async function fetchYahooHistory(symbol, range = '6mo') {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
    '?range=' + encodeURIComponent(range) + '&interval=1d&events=history&includePrePost=false';
  const j = await httpJson(url);
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp || !res.timestamp.length) throw new Error('yahoo: empty result');
  const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const bars = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    const o = q.open ? q.open[i] : null;
    const h = q.high ? q.high[i] : null;
    const l = q.low ? q.low[i] : null;
    const c = q.close ? q.close[i] : null;
    if (o == null || h == null || l == null || c == null) continue;
    const v = q.volume ? q.volume[i] : null;
    bars.push([res.timestamp[i] * 1000, round(o), round(h), round(l), round(c), v == null ? 0 : Math.round(v)]);
  }
  if (!bars.length) throw new Error('yahoo: no bars');
  const m = res.meta || {};
  return {
    source: 'yahoo',
    meta: {
      symbol: m.symbol || symbol,
      currency: m.currency || null,
      exchangeName: m.exchangeName || null,
      shortName: m.shortName || null,
      regularMarketPrice: m.regularMarketPrice != null ? m.regularMarketPrice : null,
      previousClose: m.previousClose != null ? m.previousClose : null,
      regularMarketTime: m.regularMarketTime ? m.regularMarketTime * 1000 : null,
      timeZone: m.exchangeTimezoneName || null,
    },
    bars,
  };
}

// 回退源 1：腾讯日K（A股/港股）
async function fetchTencentKline(tsym, days = 160) {
  const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' +
    encodeURIComponent(tsym) + ',day,,,' + days + ',qfq';
  const j = await httpJson(url);
  const node = j && j.data && j.data[tsym];
  const rows = (node && (node.qfqday || node.day)) || [];
  if (!rows.length) throw new Error('tencent kline empty');
  const bars = rows.map((r) => {
    const d = String(r[0]);
    const iso = d.length === 8 ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + 'T00:00:00+08:00' : d;
    const ts = Date.parse(iso);
    return [ts, round(+r[1]), round(+r[3]), round(+r[4]), round(+r[2]), Math.round(+r[5] || 0)];
  }).filter((b) => Number.isFinite(b[0]));
  if (!bars.length) throw new Error('tencent kline no bars');
  return { source: 'tencent-kline', meta: {}, bars };
}

// 回退源 2：Stooq 日K（美股）
async function fetchStooqHistory(symbol, days = 160) {
  const url = 'https://stooq.com/q/d/l/?s=' + encodeURIComponent(symbol.toLowerCase() + '.us') + '&i=d';
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error('stooq HTTP ' + r.status);
  const lines = (await r.text()).trim().split('\n').slice(1);
  if (!lines.length) throw new Error('stooq empty');
  const bars = [];
  for (const line of lines) {
    const p = line.split(',');
    if (p.length < 5) continue;
    const ts = Date.parse(p[0] + 'T00:00:00Z');
    if (!Number.isFinite(ts)) continue;
    bars.push([ts, round(+p[1]), round(+p[2]), round(+p[3]), round(+p[4]), Math.round(+p[5] || 0)]);
  }
  if (!bars.length) throw new Error('stooq no bars');
  return { source: 'stooq', meta: {}, bars: bars.slice(-days) };
}

function tencentKlineSymbol(symbol, market) {
  const code = symbol.replace(/\.(SS|SZ|HK)$/i, '').replace(/[^A-Za-z0-9]/g, '');
  return market + code;
}

// 统一入口：Yahoo 优先，失败或数据不足时自动回退
async function fetchHistory(symbol, market, range = '6mo') {
  const fallback = async () => {
    if (market === 'us') return await fetchStooqHistory(symbol);
    return await fetchTencentKline(tencentKlineSymbol(symbol, market));
  };
  try {
    const h = await fetchYahooHistory(symbol, range);
    if (h.bars.length >= 40 || market === 'us') return h;
    // Yahoo 历史不足（部分A股/港股指数），尝试腾讯日K
    try {
      const t = await fetchTencentKline(tencentKlineSymbol(symbol, market));
      if (t.bars.length > h.bars.length) return t;
    } catch (e) {}
    return h;
  } catch (e) {
    console.warn('[yahoo] ' + symbol + ' 失败(' + e.message + ')，尝试回退源');
    return await fallback();
  }
}

module.exports = { fetchHistory, fetchYahooHistory, fetchTencentKline, fetchStooqHistory };
