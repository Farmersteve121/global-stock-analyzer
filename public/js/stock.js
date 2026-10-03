'use strict';

const params = new URLSearchParams(location.search);
const symbol = (params.get('s') || '').trim();

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function fmtDate(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function renderHead(d) {
  const q = d.quote || {};
  const name = q.name || d.meta.name;
  const price = q.price != null ? q.price : null;
  const chg = q.change != null ? q.change : null;
  const pct = q.changePct != null ? q.changePct : null;
  const c = cls(pct);
  document.title = name + ' · 环球股票分析';
  document.getElementById('stName').textContent = name;
  document.getElementById('stCode').textContent = d.meta.symbol + ' · ' + (d.meta.code || '') + (q.currency ? ' · ' + q.currency : '');
  document.getElementById('stMarket').textContent = d.meta.marketLabel;
  const st = d.meta.status || {};
  const stEl = document.getElementById('stStatus');
  stEl.textContent = st.label || '';
  stEl.className = 'badge ' + (st.open ? 'badge-open' : '');
  const pEl = document.getElementById('stPrice');
  pEl.textContent = price != null ? fmtNum(price) : '--';
  pEl.className = 'big-price ' + c;
  const cg = document.getElementById('stChg');
  cg.className = 'chg-line ' + c;
  cg.innerHTML = '<span>' + fmtChange(chg) + '</span><span>' + fmtPct(pct) + '</span>' +
    '<span class="muted">高 ' + fmtNum(q.high) + '</span><span class="muted">低 ' + fmtNum(q.low) + '</span>' +
    '<span class="muted">今开 ' + fmtNum(q.open) + '</span><span class="muted">昨收 ' + fmtNum(q.prevClose) + '</span>';

  const favBtn = document.getElementById('favBtn');
  const favs = await getFavs();
  let isFav = favs.some(function (f) { return f.symbol === symbol; });
  function refreshFav() {
    favBtn.textContent = isFav ? '★ 已自选' : '☆ 加自选';
    favBtn.classList.toggle('fav-on', isFav);
  }
  favBtn.onclick = async function () {
    try {
      if (isFav) { await delFav(symbol); } else { await addFav(symbol); }
      isFav = !isFav;
      refreshFav();
    } catch (e) { alert('操作失败：' + e.message); }
  };
  refreshFav();
}

function renderPred(p) {
  const el = document.getElementById('predBody');
  if (!p || p.label === '数据不足') {
    el.innerHTML = '<div class="empty">历史数据不足，暂时无法给出预测。</div>';
    return;
  }
  const dirCls = p.direction === 'up' ? 'up' : p.direction === 'down' ? 'down' : 'flat';
  const dirIcon = p.direction === 'up' ? '▲' : p.direction === 'down' ? '▼' : '—';
  let html = '<div class="pred-dir ' + dirCls + '"><span class="pred-arrow">' + dirIcon + '</span> 预测：' + esc(p.label) + '</div>';
  html += '<div class="pred-conf"><div id="gauge" style="width:150px;height:110px;"></div>' +
    '<div class="pred-conf-side"><div class="conf-num ' + dirCls + '">' + p.confidence + '%</div><div class="muted">信号置信度</div></div></div>';
  if (p.targets) {
    html += '<div class="pred-targets">' +
      '<div class="pt-row"><span>1日参考区间</span><b>' + fmtNum(p.targets.d1[0]) + ' ~ ' + fmtNum(p.targets.d1[1]) + '</b></div>' +
      '<div class="pt-row"><span>5日参考区间</span><b>' + fmtNum(p.targets.d5[0]) + ' ~ ' + fmtNum(p.targets.d5[1]) + '</b></div>' +
      '<div class="pt-row"><span>日波动率</span><b>' + fmtNum(p.volatility) + '%</b></div>' +
      '</div>';
  }
  html += '<div class="pred-factors">' + (p.factors || []).map(function (f) {
    const side = f.score >= 0 ? 'pos' : 'neg';
    const w = Math.min(100, Math.abs(f.score) * 100);
    const label = f.score > 0.25 ? '看多' : f.score < -0.25 ? '看空' : '中性';
    return '<div class="factor" title="' + esc(f.desc) + '"><div class="factor-top"><span>' + esc(f.name) + '</span>' +
      '<span class="tag ' + side + '">' + label + ' ' + (f.score >= 0 ? '+' : '') + f.score.toFixed(2) + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill ' + side + '" style="width:' + w + '%"></div></div></div>';
  }).join('') + '</div>';
  if (p.backtest) {
    html += '<div class="backtest muted">模型回测（近 ' + p.backtest.days + ' 个交易日）：出现 ' + p.backtest.signals + ' 次明确信号，方向胜率 ' +
      (p.backtest.winRate == null ? '--' : p.backtest.winRate + '%') + '</div>';
  }
  html += '<div class="disc">⚠ 预测由技术指标统计模型生成，仅供研究参考，不构成投资建议。</div>';
  el.innerHTML = html;
  if (window.echarts) {
    const g = echarts.init(document.getElementById('gauge'));
    g.setOption({
      series: [{
        type: 'gauge', min: 0, max: 100, startAngle: 210, endAngle: -30,
        axisLine: { lineStyle: { width: 10, color: [[0.4, '#64748b'], [0.7, '#3b82f6'], [1, '#f59e0b']] } },
        pointer: { width: 4, length: '55%' },
        axisTick: { show: false },
        splitLine: { length: 8, lineStyle: { color: '#1f2b45' } },
        axisLabel: { show: false },
        detail: { show: false },
        data: [{ value: p.confidence }],
      }],
    });
  }
}

function renderIndicators(d) {
  const ind = d.indicators || {};
  function last(a) {
    for (let i = a.length - 1; i >= 0; i--) { if (a[i] != null) return a[i]; }
    return null;
  }
  const f = function (v) { return v == null ? '--' : fmtNum(v); };
  const rows = [
    ['MA5 / MA10 / MA20 / MA60', [last(ind.sma5), last(ind.sma10), last(ind.sma20), last(ind.sma60)].map(f).join(' / ')],
    ['MACD DIF / DEA / HIST', [last(ind.macd.dif), last(ind.macd.dea), last(ind.macd.hist)].map(f).join(' / ')],
    ['RSI(14)', f(last(ind.rsi14))],
    ['BOLL 上 / 中 / 下', [last(ind.boll.up), last(ind.boll.mid), last(ind.boll.low)].map(f).join(' / ')],
  ];
  document.getElementById('indBody').innerHTML = rows.map(function (r) {
    return '<div class="ind-row"><span class="muted">' + esc(r[0]) + '</span><b>' + r[1] + '</b></div>';
  }).join('');
}

function renderChart(d) {
  const box = document.getElementById('chart');
  if (!window.echarts) { box.innerHTML = '<div class="empty">图表库加载失败，请检查网络后刷新。</div>'; return; }
  const bars = d.history || [];
  if (!bars.length) { box.innerHTML = '<div class="empty">暂无K线数据</div>'; return; }
  const ind = d.indicators || {};
  const dates = bars.map(function (b) { return fmtDate(b[0]); });
  const k = bars.map(function (b) { return [b[1], b[2], b[3], b[4]]; });
  const vols = bars.map(function (b, i) {
    const up = i > 0 ? b[4] >= bars[i - 1][4] : true;
    return { value: b[5], itemStyle: { color: up ? 'rgba(239,68,68,0.55)' : 'rgba(34,197,94,0.55)' } };
  });
  const macdHist = ((ind.macd && ind.macd.hist) || []).map(function (v) {
    return v == null ? null : { value: v, itemStyle: { color: v >= 0 ? 'rgba(239,68,68,0.7)' : 'rgba(34,197,94,0.7)' } };
  });
  const chart = echarts.init(box);
  chart.setOption({
    animation: false,
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, backgroundColor: '#0f1830', borderColor: '#2a3a5f', textStyle: { color: '#e5eaf3', fontSize: 12 } },
    legend: { data: ['K线', 'MA5', 'MA20', 'MA60'], textStyle: { color: '#8b96ad' }, top: 0 },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    grid: [
      { left: 55, right: 55, top: 34, height: '44%' },
      { left: 55, right: 55, top: '57%', height: '11%' },
      { left: 55, right: 55, top: '75%', height: '16%' },
    ],
    xAxis: [
      { type: 'category', data: dates, boundaryGap: true, axisLine: { lineStyle: { color: '#2a3a5f' } }, axisLabel: { color: '#8b96ad' }, min: 'dataMin', max: 'dataMax' },
      { type: 'category', gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { show: false }, axisLine: { lineStyle: { color: '#2a3a5f' } }, min: 'dataMin', max: 'dataMax' },
      { type: 'category', gridIndex: 2, data: dates, boundaryGap: true, axisLabel: { color: '#8b96ad' }, axisLine: { lineStyle: { color: '#2a3a5f' } }, min: 'dataMin', max: 'dataMax' },
    ],
    yAxis: [
      { scale: true, splitLine: { lineStyle: { color: '#1b2742' } }, axisLabel: { color: '#8b96ad' } },
      { gridIndex: 1, scale: true, axisLabel: { show: false }, splitLine: { show: false } },
      { gridIndex: 2, scale: true, splitLine: { lineStyle: { color: '#1b2742' } }, axisLabel: { color: '#8b96ad' } },
      { gridIndex: 2, scale: true, min: 0, max: 100, splitLine: { show: false }, axisLabel: { show: false } },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1, 2], start: 40, end: 100 },
      { type: 'slider', xAxisIndex: [0, 1, 2], start: 40, end: 100, bottom: 0, height: 18, borderColor: '#2a3a5f', backgroundColor: '#0d1526', fillerColor: 'rgba(59,130,246,0.15)' },
    ],
    series: [
      { name: 'K线', type: 'candlestick', data: k, itemStyle: { color: '#ef4444', color0: '#22c55e', borderColor: '#ef4444', borderColor0: '#22c55e' } },
      { name: 'MA5', type: 'line', data: ind.sma5, smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#f59e0b' } },
      { name: 'MA20', type: 'line', data: ind.sma20, smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#3b82f6' } },
      { name: 'MA60', type: 'line', data: ind.sma60, smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#a855f7' } },
      { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: vols },
      { name: 'MACD', type: 'bar', xAxisIndex: 2, yAxisIndex: 2, data: macdHist },
      { name: 'DIF', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: (ind.macd && ind.macd.dif) || [], showSymbol: false, lineStyle: { width: 1, color: '#eab308' } },
      { name: 'DEA', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: (ind.macd && ind.macd.dea) || [], showSymbol: false, lineStyle: { width: 1, color: '#38bdf8' } },
      { name: 'RSI', type: 'line', xAxisIndex: 2, yAxisIndex: 3, data: ind.rsi14, showSymbol: false, lineStyle: { width: 1, color: '#f472b6' }, markLine: { silent: true, symbol: 'none', lineStyle: { color: '#4b5b7a', type: 'dashed' }, data: [{ yAxis: 70 }, { yAxis: 30 }] } },
    ],
  });
  window.addEventListener('resize', function () { chart.resize(); });
  document.getElementById('chartHint').textContent = '数据源: ' + (d.source || '?');
}

async function init() {
  if (!symbol) {
    document.getElementById('stockHead').innerHTML = '<div class="empty">未指定股票代码，<a href="/">返回总览</a></div>';
    return;
  }
  try {
    const data = await api('/api/quote/' + encodeURIComponent(symbol));
    await renderHead(data);
    renderPred(data.prediction);
    renderIndicators(data);
    renderChart(data);
  } catch (e) {
    document.getElementById('stockHead').innerHTML = '<div class="empty">加载失败：' + esc(e.message) + '，<a href="/">返回总览</a></div>';
    document.getElementById('predBody').innerHTML = '<div class="empty">暂无数据</div>';
    document.getElementById('indBody').innerHTML = '<div class="empty">暂无数据</div>';
  }
}

init();
