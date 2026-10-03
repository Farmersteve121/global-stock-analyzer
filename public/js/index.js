'use strict';

let overview = null;
let currentMarket = 'sh';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function quoteLink(s) { return '/stock.html?s=' + encodeURIComponent(s.symbol); }

function renderIndices(items) {
  const el = document.getElementById('indices');
  el.innerHTML = items.map(function (ix) {
    if (ix.error) {
      return '<div class="card idx-card"><div class="idx-name">' + esc(ix.name) + '</div><div class="muted">' + esc(ix.error) + '</div></div>';
    }
    const c = cls(ix.changePct);
    return '<a class="card idx-card" href="/stock.html?s=' + encodeURIComponent(ix.symbol) + '">' +
      '<div class="idx-top"><span class="idx-name">' + esc(ix.name) + '</span><span class="badge ' + (ix.status && ix.status.open ? 'badge-open' : '') + '">' + esc((ix.status && ix.status.label) || '') + '</span></div>' +
      '<div class="idx-price ' + c + '">' + fmtNum(ix.price) + '</div>' +
      '<div class="idx-chg ' + c + '">' + fmtChange(ix.change) + ' (' + fmtPct(ix.changePct) + ')</div>' +
      '<div class="spark">' + sparkline(ix.spark, 130, 36) + '</div>' +
      '</a>';
  }).join('');
}

function renderHot(market) {
  if (!overview) return;
  const rows = overview.markets[market] || [];
  const tbody = document.querySelector('#hotTable tbody');
  tbody.innerHTML = rows.map(function (s) {
    const q = s.quote;
    const c = q && q.changePct != null ? cls(q.changePct) : 'flat';
    return '<tr>' +
      '<td class="mono">' + esc(s.code) + '</td>' +
      '<td><a class="stock-link" href="' + quoteLink(s) + '">' + esc(s.name) + '</a></td>' +
      '<td class="' + c + ' mono">' + (q ? fmtNum(q.price) : '--') + '</td>' +
      '<td class="' + c + ' mono">' + (q && q.changePct != null ? fmtPct(q.changePct) : '--') + '</td>' +
      '<td class="' + c + ' mono">' + (q && q.change != null ? fmtChange(q.change) : '--') + '</td>' +
      '<td class="muted mono">' + (q && q.amount ? fmtNum(q.amount) + '万' : '--') + '</td>' +
      '<td class="muted mono">' + (q && q.pe != null ? fmtNum(q.pe) : '--') + '</td>' +
      '<td><a class="btn-sm" href="' + quoteLink(s) + '">分析</a></td>' +
      '</tr>';
  }).join('');
}

function renderStatusHint(status) {
  if (!status) return;
  document.getElementById('marketStatusHint').textContent =
    '沪/深 ' + status.sh.label + ' · 港股 ' + status.hk.label + ' · 美股 ' + status.us.label;
}

function renderFavs(items) {
  const el = document.getElementById('favList');
  if (!items.length) {
    el.innerHTML = '<div class="empty">暂无自选。点击列表中的「分析」或详情页的 ☆ 加自选。</div>';
    return;
  }
  el.innerHTML = items.map(function (f) {
    const q = f.quote || {};
    const c = q.changePct != null ? cls(q.changePct) : 'flat';
    return '<div class="fav-item card">' +
      '<a class="stock-link" href="/stock.html?s=' + encodeURIComponent(f.symbol) + '"><b>' + esc(f.name) + '</b> <span class="mono muted">' + esc(f.symbol) + '</span></a>' +
      '<span class="mono ' + c + '">' + fmtNum(q.price) + '</span>' +
      '<span class="mono ' + c + '">' + fmtPct(q.changePct) + '</span>' +
      '<button class="btn-sm" data-del="' + esc(f.symbol) + '">移除</button>' +
      '</div>';
  }).join('');
  el.querySelectorAll('[data-del]').forEach(function (b) {
    b.onclick = async function () {
      await delFav(b.getAttribute('data-del'));
      await loadFavs();
    };
  });
}

async function loadFavs() {
  const items = await getFavs();
  renderFavs(items);
}

async function loadIndices() {
  try {
    const d = await api('/api/indices');
    renderIndices(d.items || []);
  } catch (e) {
    document.getElementById('indices').innerHTML = '<div class="empty">指数加载失败：' + esc(e.message) + '</div>';
  }
}

async function loadOverview() {
  try {
    const d = await api('/api/overview');
    overview = d;
    renderStatusHint(d.status);
    renderHot(currentMarket);
  } catch (e) {
    document.querySelector('#hotTable tbody').innerHTML = '<tr><td colspan="8">加载失败：' + esc(e.message) + '</td></tr>';
  }
}

async function doSearch() {
  const q = document.getElementById('q').value.trim();
  const m = document.getElementById('marketSel').value;
  const box = document.getElementById('searchResults');
  if (!q) { box.classList.add('hidden'); return; }
  try {
    const d = await api('/api/stocks?q=' + encodeURIComponent(q) + '&market=' + encodeURIComponent(m));
    const items = d.items || [];
    if (!items.length) {
      box.innerHTML = '<a class="sr-item" href="/stock.html?s=' + encodeURIComponent(q.toUpperCase()) + '">直接查看 <b>' + esc(q.toUpperCase()) + '</b>（不在精选池，尝试按代码解析）</a>';
    } else {
      box.innerHTML = items.map(function (s) {
        const qu = s.quote || {};
        const c = qu.changePct != null ? cls(qu.changePct) : 'flat';
        return '<a class="sr-item" href="/stock.html?s=' + encodeURIComponent(s.symbol) + '">' +
          '<span class="sr-name">' + esc(s.name) + '</span><span class="mono muted">' + esc(s.code) + ' · ' + esc(s.marketLabel) + '</span>' +
          '<span class="mono ' + c + '">' + fmtNum(qu.price) + '</span><span class="mono ' + c + '">' + fmtPct(qu.changePct) + '</span>' +
          '</a>';
      }).join('');
    }
    box.classList.remove('hidden');
  } catch (e) {
    box.innerHTML = '<div class="sr-item muted">搜索失败：' + esc(e.message) + '</div>';
    box.classList.remove('hidden');
  }
}

function debounce(fn, ms) {
  let t;
  return function () { clearTimeout(t); t = setTimeout(fn, ms); };
}

function initTabs() {
  document.querySelectorAll('#marketTabs .tab').forEach(function (t) {
    t.onclick = function () {
      document.querySelectorAll('#marketTabs .tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      currentMarket = t.getAttribute('data-m');
      renderHot(currentMarket);
    };
  });
}

function initSearch() {
  const q = document.getElementById('q');
  q.addEventListener('input', debounce(doSearch, 300));
  q.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
  document.getElementById('searchBtn').onclick = doSearch;
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-box')) document.getElementById('searchResults').classList.add('hidden');
  });
}

(async function () {
  initTabs();
  initSearch();
  loadIndices();
  loadOverview();
  loadFavs();
})();
