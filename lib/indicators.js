'use strict';

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function avg(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }

function sma(arr, n) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    out.push(i >= n - 1 ? sum / n : null);
  }
  return out;
}

function ema(arr, n) {
  const out = [];
  const k = 2 / (n + 1);
  let prev = null;
  for (let i = 0; i < arr.length; i++) {
    prev = prev == null ? arr[i] : arr[i] * k + prev * (1 - k);
    out.push(i >= n - 1 ? prev : null);
  }
  return out;
}

function rsi(closes, n = 14) {
  const out = [];
  let g = 0, l = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { out.push(null); continue; }
    const d = closes[i] - closes[i - 1];
    const up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) {
      g += up; l += dn;
      if (i === n) {
        if (l === 0 && g === 0) out.push(50);
        else if (l === 0) out.push(100);
        else out.push(100 - 100 / (1 + g / l));
      } else out.push(null);
      continue;
    }
    g = (g * (n - 1) + up) / n;
    l = (l * (n - 1) + dn) / n;
    out.push(l === 0 ? 100 : 100 - 100 / (1 + g / l));
  }
  return out;
}

function macd(closes, fast = 12, slow = 26, sig = 9) {
  const ef = ema(closes, fast), es = ema(closes, slow);
  const dif = [], dea = [], hist = [];
  for (let i = 0; i < closes.length; i++) {
    dif.push(ef[i] != null && es[i] != null ? ef[i] - es[i] : null);
  }
  const validStart = slow - 1;
  const k = 2 / (sig + 1);
  let prev = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < validStart) { dea.push(null); hist.push(null); continue; }
    prev = prev == null ? dif[i] : dif[i] * k + prev * (1 - k);
    const v = i >= validStart + sig - 1 ? prev : null;
    dea.push(v);
    hist.push(v != null ? (dif[i] - v) * 2 : null);
  }
  return { dif, dea, hist };
}

function boll(closes, n = 20, k = 2) {
  const mid = sma(closes, n), up = [], low = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] == null) { up.push(null); low.push(null); continue; }
    const win = closes.slice(i - n + 1, i + 1);
    const m = mid[i];
    const sd = Math.sqrt(avg(win.map((x) => (x - m) * (x - m))));
    up.push(m + k * sd);
    low.push(m - k * sd);
  }
  return { mid, up, low };
}

function linregSlope(arr) {
  const n = arr.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += arr[i]; sxy += i * arr[i]; sxx += i * i; }
  const den = n * sxx - sx * sx;
  return den === 0 ? 0 : (n * sxy - sx * sy) / den;
}

function std(arr) {
  const m = avg(arr);
  return Math.sqrt(avg(arr.map((x) => (x - m) * (x - m))));
}

function computeIndicators(bars) {
  const closes = bars.map((b) => b[4]);
  const vols = bars.map((b) => b[5]);
  const m = macd(closes);
  const b = boll(closes);
  return {
    sma5: sma(closes, 5),
    sma10: sma(closes, 10),
    sma20: sma(closes, 20),
    sma60: sma(closes, 60),
    ema12: ema(closes, 12),
    ema26: ema(closes, 26),
    macd: m,
    rsi14: rsi(closes, 14),
    boll: b,
    vols,
  };
}

// 多因子打分（0..i 区间的数据计算，供实时预测与回测共用）
function factorScores(closes, vols, i) {
  const upTo = closes.slice(0, i + 1);
  if (upTo.length < 35) return null;
  const win = upTo.slice(-20);
  const mean = avg(win);
  const slope = mean > 0 ? linregSlope(win) / mean : 0;
  const fTrend = clamp(slope / 0.0035, -1, 1);
  const m = macd(upTo);
  const histN = m.hist[m.hist.length - 1] || 0;
  const histP = m.hist[m.hist.length - 2] || 0;
  const fMacd = clamp((histN > 0 ? 0.4 : -0.4) + clamp((histN - histP) * 40, -0.6, 0.6), -1, 1);
  const r = rsi(upTo, 14).slice(-1)[0];
  const fRsi = r == null ? 0 : r < 25 ? 0.5 : r > 75 ? -0.5 : ((r - 50) / 50) * 0.25;
  const s20 = sma(upTo, 20).slice(-1)[0];
  const last = upTo[upTo.length - 1];
  const fSma = clamp(((last / s20) - 1) / 0.02, -1, 1);
  const vAvg = avg(vols.slice(Math.max(0, i - 5), i));
  const vToday = vols[i] || 0;
  const chg = i > 0 ? closes[i] - closes[i - 1] : 0;
  const fVol = vAvg > 0 ? clamp(((vToday / vAvg) - 1) * (chg >= 0 ? 1 : -1), -1, 1) : 0;
  const factors = [
    { name: '趋势动量', score: fTrend, weight: 0.9, desc: '近20日线性回归斜率' },
    { name: 'MACD', score: fMacd, weight: 0.9, desc: '柱体方向与变化' },
    { name: 'RSI(14)', score: fRsi, weight: 0.6, desc: '超买超卖状态' },
    { name: '均线位置', score: fSma, weight: 0.7, desc: '收盘价相对20日均线' },
    { name: '量能确认', score: fVol, weight: 0.4, desc: '放量方向验证' },
  ];
  const wsum = factors.reduce((s, f) => s + f.score * f.weight, 0);
  const w = factors.reduce((s, f) => s + f.weight, 0);
  const total = wsum / w;
  const confidence = Math.round(clamp(50 + total * 32, 8, 92));
  return {
    factors: factors.map((f) => ({ name: f.name, score: Math.round(f.score * 100) / 100, weight: f.weight, desc: f.desc })),
    total,
    confidence,
  };
}

function directionOf(confidence) {
  return confidence >= 55 ? 'up' : confidence <= 45 ? 'down' : 'flat';
}

function predict(bars) {
  const closes = bars.map((b) => b[4]);
  const vols = bars.map((b) => b[5]);
  const last = closes[closes.length - 1];
  if (closes.length < 35) {
    return { direction: 'flat', label: '数据不足', confidence: 50, factors: [], targets: null, backtest: null, generatedAt: Date.now() };
  }
  const now = factorScores(closes, vols, closes.length - 1);
  const confidence = now ? now.confidence : 50;
  const direction = directionOf(confidence);
  const rets = [];
  for (let i = Math.max(1, closes.length - 60); i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1);
  const sigma = std(rets) || 0.01;
  const drift = avg(rets.slice(-20));
  const d1 = [last * (1 + drift - sigma), last * (1 + drift + sigma)];
  const d5 = [last * (1 + drift * 5 - sigma * Math.sqrt(5)), last * (1 + drift * 5 + sigma * Math.sqrt(5))];
  let signals = 0, wins = 0;
  const start = 100;
  for (let i = start; i < closes.length - 1; i++) {
    const f = factorScores(closes, vols, i);
    if (!f) continue;
    const dir = directionOf(f.confidence);
    if (dir === 'flat') continue;
    const actual = closes[i + 1] - closes[i];
    signals++;
    if ((dir === 'up' && actual > 0) || (dir === 'down' && actual < 0)) wins++;
  }
  return {
    direction,
    label: direction === 'up' ? '上涨' : direction === 'down' ? '下跌' : '震荡',
    confidence,
    factors: now ? now.factors : [],
    targets: {
      d1: d1.map((x) => Math.round(x * 100) / 100),
      d5: d5.map((x) => Math.round(x * 100) / 100),
    },
    volatility: Math.round(sigma * 10000) / 100,
    backtest: {
      days: closes.length - 1 - start,
      signals,
      wins,
      winRate: signals ? Math.round((wins / signals) * 1000) / 10 : null,
    },
    generatedAt: Date.now(),
  };
}

module.exports = { computeIndicators, predict, sma, ema, rsi, macd, boll, clamp };
