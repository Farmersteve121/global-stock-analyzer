'use strict';

const express = require('express');
const path = require('path');
const { STOCKS, INDICES, MARKET_LABEL, yahooSymbol, tencentSymbol, search, findBySymbol, findIndex } = require('./lib/stocks');
const { fetchHistory, fetchYahooHistory } = require('./lib/yahoo');
const { fetchTencentQuotes } = require('./lib/tencent');
const { computeIndicators, predict } = require('./lib/indicators');
const dbmod = require('./lib/db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

function round2(x) { return Math.round(x * 100) / 100; }

function marketStatus(market) {
  const tz = market === 'us' ? 'America/New_York' : 'Asia/Hong_Kong';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (t) => { const p = parts.find((x) => x.type === t); return p ? p.value : ''; };
    const wd = get('weekday');
    const mins = parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10);
    if (wd === 'Sat' || wd === 'Sun') return { open: false, label: '休市' };
    let open;
    if (market === 'us') open = mins >= 570 && mins < 960;
    else if (market === 'hk') open = (mins >= 570 && mins < 720) || (mins >= 780 && mins < 960);
    else open = (mins >= 570 && mins < 690) || (mins >= 780 && mins < 900);
    return { open, label: open ? '交易中' : '已收盘' };
  } catch (e) {
    return { open: false, label: '未知' };
  }
}

function guessMarket(symbol) {
  if (/\.SS$/i.test(symbol)) return 'sh';
  if (/\.SZ$/i.test(symbol)) return 'sz';
  if (/\.HK$/i.test(symbol)) return 'hk';
  return 'us';
}

function resolveMeta(symbol) {
  const s = findBySymbol(symbol);
  if (s) return { symbol, code: s.code, name: s.name, market: s.market, type: 'stock' };
  const ix = findIndex(symbol);
  if (ix) return { symbol, code: '', name: ix.name, market: ix.market, type: 'index' };
  return {
    symbol,
    code: symbol.split('.')[0].replace(/[^A-Za-z0-9]/g, ''),
    name: symbol,
    market: guessMarket(symbol),
    type: 'stock',
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: dbmod.getMode(), uptime: Math.round(process.uptime()), now: Date.now() });
});

// 指数行情
app.get('/api/indices', async (req, res) => {
  try {
    const data = await dbmod.getCached('indices', 5 * 60 * 1000, async () => {
      const out = [];
      await Promise.all(INDICES.map(async (ix) => {
        try {
          const h = await fetchHistory(ix.symbol, ix.market, '3mo');
          const closes = h.bars.map((b) => b[4]);
          const metaPrice = h.meta && h.meta.regularMarketPrice != null ? h.meta.regularMarketPrice : null;
          const price = metaPrice != null ? metaPrice : closes[closes.length - 1];
          const prev = metaPrice != null && h.meta.previousClose != null ? h.meta.previousClose : (closes.length > 1 ? closes[closes.length - 2] : price);
          const chg = price - prev;
          out.push({
            symbol: ix.symbol, name: ix.name, market: ix.market,
            price: round2(price), change: round2(chg),
            changePct: round2(prev ? (chg / prev) * 100 : 0),
            currency: (h.meta && h.meta.currency) || '',
            spark: closes.slice(-30).map(round2),
            status: marketStatus(ix.market),
          });
        } catch (e) {
          out.push({ symbol: ix.symbol, name: ix.name, market: ix.market, error: String(e.message).slice(0, 80) });
        }
      }));
      out.sort((a, b) => INDICES.findIndex((i) => i.symbol === a.symbol) - INDICES.findIndex((i) => i.symbol === b.symbol));
      return out;
    });
    res.json({ items: data, updatedAt: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 热门股票（每市场前 12 只）
app.get('/api/overview', async (req, res) => {
  try {
    const data = await dbmod.getCached('overview', 60 * 1000, async () => {
      const perMarket = {};
      for (const m of ['sh', 'sz', 'hk', 'us']) {
        const list = STOCKS.filter((s) => s.market === m).slice(0, 12);
        const quotes = await fetchTencentQuotes(list.map(tencentSymbol));
        perMarket[m] = list.map((s) => ({
          symbol: yahooSymbol(s), code: s.code, name: s.name,
          quote: quotes[tencentSymbol(s)] || null,
        }));
      }
      return perMarket;
    });
    res.json({
      markets: data,
      status: { sh: marketStatus('sh'), sz: marketStatus('sz'), hk: marketStatus('hk'), us: marketStatus('us') },
      updatedAt: Date.now(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 股票搜索（精选池 + 代码/名称匹配），附带实时报价
app.get('/api/stocks', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const market = String(req.query.market || '');
    const list = search(q, market).slice(0, 30);
    const quotes = await fetchTencentQuotes(list.map(tencentSymbol));
    res.json({
      items: list.map((s) => ({
        symbol: yahooSymbol(s), code: s.code, name: s.name, market: s.market,
        marketLabel: MARKET_LABEL[s.market],
        quote: quotes[tencentSymbol(s)] || null,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 个股详情：历史K线 + 指标 + 涨跌预测
app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  try {
    const meta = resolveMeta(symbol);
    const data = await dbmod.getCached('quote:' + symbol, 15 * 60 * 1000, async () => {
      const h = await fetchHistory(symbol, meta.market, '6mo');
      const indicators = computeIndicators(h.bars);
      const prediction = predict(h.bars);
      return { history: h.bars, indicators, prediction, source: h.source, historyMeta: h.meta };
    });
    let quote = null;
    if (meta.type === 'stock') {
      const tsym = tencentSymbol(meta);
      const map = await fetchTencentQuotes([tsym]);
      quote = map[tsym] || null;
    }
    if (!quote) {
      const hm = data.historyMeta || {};
      quote = {
        name: meta.name,
        price: hm.regularMarketPrice != null ? hm.regularMarketPrice : null,
        prevClose: hm.previousClose != null ? hm.previousClose : null,
        currency: hm.currency || '',
        from: 'yahoo',
      };
      if (quote.price != null && quote.prevClose != null && quote.prevClose) {
        quote.change = round2(quote.price - quote.prevClose);
        quote.changePct = round2((quote.price / quote.prevClose - 1) * 100);
      }
    }
    res.json({
      meta: {
        symbol, name: meta.name, code: meta.code, market: meta.market,
        marketLabel: MARKET_LABEL[meta.market] || '指数',
        type: meta.type,
        status: marketStatus(meta.market),
      },
      quote,
      history: data.history,
      indicators: data.indicators,
      prediction: data.prediction,
      source: data.source,
    });
  } catch (e) {
    res.status(502).json({ error: '行情获取失败: ' + e.message, symbol });
  }
});

// 自选股
app.get('/api/favorites', async (req, res) => {
  const clientId = String(req.query.clientId || '');
  if (!clientId) return res.json({ items: [] });
  const items = await dbmod.listFavorites(clientId);
  const quotes = await fetchTencentQuotes(items.map((f) => f.tsym).filter(Boolean));
  res.json({ items: items.map((f) => Object.assign({}, f, { quote: quotes[f.tsym] || null })) });
});

app.post('/api/favorites', async (req, res) => {
  const body = req.body || {};
  const clientId = String(body.clientId || '');
  const symbol = String(body.symbol || '');
  if (!clientId || !symbol) return res.status(400).json({ error: 'clientId 与 symbol 必填' });
  const meta = resolveMeta(symbol);
  await dbmod.addFavorite({
    clientId, symbol, name: meta.name, market: meta.market,
    tsym: meta.type === 'stock' ? tencentSymbol(meta) : null,
  });
  res.json({ ok: true });
});

app.delete('/api/favorites/:symbol', async (req, res) => {
  const clientId = String(req.query.clientId || '');
  if (!clientId) return res.status(400).json({ error: 'clientId 必填' });
  await dbmod.removeFavorite(clientId, req.params.symbol);
  res.json({ ok: true });
});

app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

dbmod.init().then(() => {
  app.listen(PORT, () => {
    console.log('[server] 已启动: http://localhost:' + PORT + ' (db=' + dbmod.getMode() + ')');
  });
});
