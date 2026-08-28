// FinLingo — Watchlist screen.
//
// A deliberately minimal, personal ticker list: search stocks/ETFs, add with
// one tap, see them as a clean vertical list. No charts, news, ratings, or
// allocation — richer functionality can layer on top of this later.
//
// Reuses existing app plumbing rather than inventing new infrastructure:
//   - PRACTICE_MARKET_ASSETS (market.js) is the searchable stock/ETF universe.
//   - /api/quotes via _fetchMarketJson (market.js) supplies live price + %.
//   - _formatUsd / _formatSignedPct (market.js) match Market's number formatting.
//   - setScreen/_activateScreen/escapeAppHtml/showToast (app.js) match how
//     every other screen navigates, renders, and reports state.
//
// Data is a flat array of { symbol, name } persisted to localStorage under
// WATCHLIST_STORAGE_KEY. It is intentionally left OUT of APP_DATA_CLEAR_KEYS
// (app.js) — like other Market state, "reset learning progress" preserves it.

(function (global) {
  'use strict';

  var WATCHLIST_STORAGE_KEY = 'finlingo_watchlist_v1';
  var WATCHLIST_REFRESH_MS = 45000;
  var SEARCH_RESULT_LIMIT = 6;
  var SEARCH_DEBOUNCE_MS = 220;

  var _items = null;                 // [{ symbol, name }] — lazy-loaded from storage
  var _quotes = {};                  // symbol -> { price, changePct }
  var _searchQuery = '';
  var _searchDebounceTimer = null;
  var _refreshTimer = null;

  // ── Storage ──────────────────────────────────────────────────────────
  function _load() {
    if (_items) return _items;
    try {
      var raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      _items = Array.isArray(parsed)
        ? parsed
            .filter(function (it) { return it && typeof it.symbol === 'string' && it.symbol.trim(); })
            .map(function (it) {
              var symbol = it.symbol.trim().toUpperCase();
              return { symbol: symbol, name: (it.name && String(it.name).trim()) || symbol };
            })
        : [];
    } catch (_) {
      _items = [];
    }
    return _items;
  }
  function _persist() {
    try { localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(_items || [])); } catch (_) {}
  }

  // ── Search universe: real stocks + ETFs only (skip crypto) ─────────────
  function _universe() {
    var assets = (typeof PRACTICE_MARKET_ASSETS !== 'undefined' && Array.isArray(PRACTICE_MARKET_ASSETS))
      ? PRACTICE_MARKET_ASSETS
      : [];
    return assets.filter(function (a) { return a && a.assetType !== 'crypto'; });
  }

  function _searchMatches(query) {
    var q = String(query || '').trim().toUpperCase();
    if (!q) return [];
    return _universe()
      .filter(function (a) {
        return String(a.symbol).toUpperCase().indexOf(q) !== -1 ||
          String(a.name || '').toUpperCase().indexOf(q) !== -1;
      })
      .sort(function (a, b) {
        var aStarts = String(a.symbol).toUpperCase().indexOf(q) === 0 ? 0 : 1;
        var bStarts = String(b.symbol).toUpperCase().indexOf(q) === 0 ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return String(a.symbol).localeCompare(String(b.symbol));
      })
      .slice(0, SEARCH_RESULT_LIMIT);
  }

  // ── Quotes ───────────────────────────────────────────────────────────
  function _fetchQuotes(symbols) {
    var list = [];
    var seen = {};
    (symbols || []).forEach(function (s) {
      var sym = String(s || '').trim().toUpperCase();
      if (sym && !seen[sym]) { seen[sym] = true; list.push(sym); }
    });
    if (!list.length || typeof _fetchMarketJson !== 'function') return;

    _fetchMarketJson('/api/quotes?symbols=' + encodeURIComponent(list.join(',')), {
      notFoundMessage: 'Quote API route not found.',
      invalidPayloadMessage: 'Quote payload missing'
    }).then(function (payload) {
      list.forEach(function (sym) {
        var q = payload ? payload[sym] : null;
        var price = Number(q && q.price);
        if (!isFinite(price) || price <= 0) return;
        var pct = Number(q && q.dailyChangePct);
        _quotes[sym] = { price: price, changePct: isFinite(pct) ? pct : 0 };
      });
      _paintQuotes();
    }).catch(function () {
      // Live quotes unavailable — rows keep showing a placeholder until the next attempt.
    });
  }

  function _paintQuotes() {
    var results = document.querySelector('[data-watchlist-search-results]');
    if (results) results.innerHTML = _renderSearchResultsMarkup();
    var list = document.querySelector('[data-watchlist-list]');
    if (list) list.innerHTML = _renderListMarkup();
  }

  // ── Formatting (reuses market.js helpers for consistency) ──────────────
  function _esc(v) { return typeof escapeAppHtml === 'function' ? escapeAppHtml(v) : String(v == null ? '' : v); }
  function _priceText(sym) {
    var q = _quotes[sym];
    if (!q) return '···';
    return typeof _formatUsd === 'function' ? _formatUsd(q.price, 2) : ('$' + q.price.toFixed(2));
  }
  function _changeText(sym) {
    var q = _quotes[sym];
    if (!q) return '';
    return typeof _formatSignedPct === 'function' ? _formatSignedPct(q.changePct) : (q.changePct.toFixed(2) + '%');
  }
  function _changeDir(sym) {
    var q = _quotes[sym];
    if (!q || !q.changePct) return '';
    return q.changePct > 0 ? 'up' : 'down';
  }

  var ICON_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></svg>';
  var ICON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
  var ICON_REMOVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  // ── Markup ───────────────────────────────────────────────────────────
  function _renderSearchResultsMarkup() {
    var q = _searchQuery.trim();
    if (!q) return '';
    var matches = _searchMatches(q);
    if (!matches.length) {
      return '<div class="watchlist-search-empty">No matches for “' + _esc(q) + '”.</div>';
    }
    var watched = {};
    _load().forEach(function (it) { watched[it.symbol] = true; });
    return matches.map(function (asset) { return _renderResultRow(asset, !!watched[asset.symbol]); }).join('');
  }

  function _renderResultRow(asset, alreadyAdded) {
    var sym = asset.symbol;
    return (
      '<div class="watchlist-result-row">' +
        '<div class="watchlist-result-id">' +
          '<div class="watchlist-result-symbol">' + _esc(sym) + '</div>' +
          '<div class="watchlist-result-name">' + _esc(asset.name || sym) + '</div>' +
        '</div>' +
        '<div class="watchlist-result-quote">' +
          '<span class="watchlist-result-price">' + _priceText(sym) + '</span>' +
          '<span class="watchlist-result-change ' + _changeDir(sym) + '">' + _changeText(sym) + '</span>' +
        '</div>' +
        '<button type="button" class="watchlist-row-add' + (alreadyAdded ? ' is-added' : '') + '" ' +
          (alreadyAdded ? 'disabled ' : '') +
          'aria-label="' + (alreadyAdded ? _esc(sym + ' is already on your watchlist') : _esc('Add ' + sym)) + '" ' +
          'onclick="Watchlist.add(&#39;' + _esc(sym) + '&#39;,&#39;' + _esc(asset.name || sym) + '&#39;)">' +
          (alreadyAdded ? ICON_CHECK : ICON_PLUS) +
        '</button>' +
      '</div>'
    );
  }

  function _renderListMarkup() {
    var items = _load();
    if (!items.length) {
      return (
        '<div class="watchlist-empty">' +
          '<p class="watchlist-empty-title">Your watchlist is empty.</p>' +
          '<p class="watchlist-empty-sub">Search for a stock or ETF to add it.</p>' +
        '</div>'
      );
    }
    return '<div class="watchlist-rows">' + items.map(_renderRow).join('') + '</div>';
  }

  function _renderRow(item) {
    var sym = item.symbol;
    return (
      '<div class="watchlist-row" data-symbol="' + _esc(sym) + '">' +
        '<div class="watchlist-row-id">' +
          '<div class="watchlist-row-symbol">' + _esc(sym) + '</div>' +
          '<div class="watchlist-row-name">' + _esc(item.name || sym) + '</div>' +
        '</div>' +
        '<div class="watchlist-row-quote">' +
          '<div class="watchlist-row-price">' + _priceText(sym) + '</div>' +
          '<div class="watchlist-row-change ' + _changeDir(sym) + '">' + _changeText(sym) + '</div>' +
        '</div>' +
        '<button type="button" class="watchlist-row-remove" aria-label="' + _esc('Remove ' + sym + ' from watchlist') + '" ' +
          'onclick="Watchlist.remove(&#39;' + _esc(sym) + '&#39;)">' + ICON_REMOVE +
        '</button>' +
      '</div>'
    );
  }

  function _renderShell() {
    return (
      '<div class="watchlist-shell">' +
        '<div class="watchlist-header">' +
          '<button type="button" class="watchlist-back" aria-label="Back to Market" onclick="showMarket()">' + ICON_BACK + '</button>' +
          '<h1 class="watchlist-title">Watchlist</h1>' +
          '<button type="button" class="watchlist-add-btn" aria-label="Search stocks or ETFs" onclick="Watchlist.focusSearch()">' + ICON_PLUS + '</button>' +
        '</div>' +
        '<div class="watchlist-search-shell">' +
          '<div class="watchlist-search-row">' +
            '<span class="watchlist-search-icon">' + ICON_SEARCH + '</span>' +
            '<input class="watchlist-search-input" id="watchlistSearchInput" type="search" inputmode="search" ' +
              'autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="Search stocks or ETFs" ' +
              'value="' + _esc(_searchQuery) + '" ' +
              'oninput="Watchlist.setQuery(this.value)" onkeydown="Watchlist.handleSearchKeydown(event)" />' +
            '<button type="button" class="watchlist-search-add" aria-label="Add" onclick="Watchlist.inlineAdd()">' + ICON_PLUS + '</button>' +
          '</div>' +
          '<div class="watchlist-search-results" data-watchlist-search-results>' + _renderSearchResultsMarkup() + '</div>' +
        '</div>' +
        '<div class="watchlist-list" data-watchlist-list>' + _renderListMarkup() + '</div>' +
      '</div>'
    );
  }

  // ── Rendering / navigation entry points ─────────────────────────────
  function renderWatchlist() {
    var root = document.getElementById('watchlistRoot');
    if (!root) return;
    root.innerHTML = _renderShell();
    var items = _load();
    if (items.length) _fetchQuotes(items.map(function (it) { return it.symbol; }));
  }

  function showWatchlist(options) {
    if (typeof _activateScreen === 'function') {
      _activateScreen('watchlistScreen', 'navMarket', renderWatchlist, 'Watchlist', options || {});
    } else if (typeof setScreen === 'function') {
      setScreen('watchlistScreen', options || {});
      renderWatchlist();
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────
  function add(symbol, name) {
    var sym = String(symbol || '').trim().toUpperCase();
    if (!sym) return;
    var items = _load();
    if (items.some(function (it) { return it.symbol === sym; })) {
      setQuery('');
      return;
    }
    items.push({ symbol: sym, name: (name && String(name).trim()) || sym });
    _persist();
    setQuery('');
    renderWatchlist();
  }

  function remove(symbol) {
    var sym = String(symbol || '').trim().toUpperCase();
    _items = _load().filter(function (it) { return it.symbol !== sym; });
    _persist();
    var list = document.querySelector('[data-watchlist-list]');
    if (list) list.innerHTML = _renderListMarkup();
  }

  function setQuery(value) {
    _searchQuery = String(value || '');
    var results = document.querySelector('[data-watchlist-search-results]');
    if (results) results.innerHTML = _renderSearchResultsMarkup();

    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
    var q = _searchQuery.trim();
    if (!q) return;
    _searchDebounceTimer = setTimeout(function () {
      var symbols = _searchMatches(q).map(function (a) { return a.symbol; });
      if (symbols.length) _fetchQuotes(symbols);
    }, SEARCH_DEBOUNCE_MS);
  }

  function inlineAdd() {
    var q = _searchQuery.trim();
    if (!q) { focusSearch(); return; }
    var matches = _searchMatches(q);
    if (matches.length) { add(matches[0].symbol, matches[0].name); return; }
    var ticker = q.toUpperCase().replace(/[^A-Z.\-]/g, '');
    if (/^[A-Z][A-Z.\-]{0,6}$/.test(ticker)) add(ticker, ticker);
  }

  function handleSearchKeydown(event) {
    if (event && event.key === 'Enter') {
      event.preventDefault();
      inlineAdd();
    }
  }

  function focusSearch() {
    var input = document.getElementById('watchlistSearchInput');
    if (!input) return;
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    if (typeof input.select === 'function') input.select();
  }

  // ── Live refresh while the screen is open ───────────────────────────
  function _stopRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  }
  function _startRefresh() {
    _stopRefresh();
    _refreshTimer = setInterval(function () {
      var items = _load();
      if (items.length) _fetchQuotes(items.map(function (it) { return it.symbol; }));
    }, WATCHLIST_REFRESH_MS);
  }
  if (global.addEventListener) {
    global.addEventListener('finlingo:screen-changed', function (event) {
      var id = event && event.detail ? event.detail.id : '';
      if (id === 'watchlistScreen') _startRefresh();
      else _stopRefresh();
    });
  }

  global.renderWatchlist = renderWatchlist;
  global.showWatchlist = showWatchlist;
  global.Watchlist = {
    add: add,
    remove: remove,
    setQuery: setQuery,
    inlineAdd: inlineAdd,
    handleSearchKeydown: handleSearchKeydown,
    focusSearch: focusSearch
  };
})(typeof window !== 'undefined' ? window : this);
