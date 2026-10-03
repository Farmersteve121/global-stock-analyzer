'use strict';

const CLIENT_KEY = 'gsa_client_id';
function clientId() {
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  return r.json();
}

function fmtNum(x, d) {
  d = d == null ? 2 : d;
  if (x == null || !Number.isFinite(x)) return '--';
  return x.toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function cls(v) { return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'; }
function sign(v) { return v > 0 ? '+' : ''; }
function fmtChange(v) { return v == null ? '--' : sign(v) + fmtNum(v); }
function fmtPct(v) { return v == null ? '--' : sign(v) + fmtNum(v) + '%'; }

function sparkline(values, w, h) {
  if (!values || values.length < 2) return '';
  let min = Infinity, max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  const span = max - min || 1;
  const pts = values.map(function (v, i) {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - min) / span) * (h - 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  const color = values[values.length - 1] >= values[0] ? '#ef4444' : '#22c55e';
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.5"/></svg>';
}

async function getFavs() {
  try { return (await api('/api/favorites?clientId=' + encodeURIComponent(clientId()))).items; }
  catch (e) { return []; }
}
async function addFav(symbol) {
  return api('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: clientId(), symbol: symbol }),
  });
}
async function delFav(symbol) {
  return api('/api/favorites/' + encodeURIComponent(symbol) + '?clientId=' + encodeURIComponent(clientId()), { method: 'DELETE' });
}
