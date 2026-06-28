// ============================================================
// bookmarks.js
// Reusable, framework-free storage + UI for two features:
//
//   • FinBookmarks  → finlingo_bookmarks  (saved answers / lessons /
//                      market insights / generated units)
//   • FinWatchlist  → finlingo_watchlist  (followed Market instruments)
//
// Plus SavedUI — the shared toggle button + the "Saved" screen render.
//
// Mirrors the existing store pattern in chats.js: an IIFE that exposes
// a small global API, reads/writes localStorage inside try/catch, and
// emits a window CustomEvent so any open surface can re-sync. No new
// framework, backend, or auth dependency — works immediately for every
// user from localStorage.
// ============================================================

(function (global) {
  'use strict';

  // ── Safe storage helpers (single source of truth — no per-screen dupes) ──
  function _readArray(key) {
    try {
      var raw = localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  function _writeArray(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
      return true;
    } catch (_) {
      return false;
    }
  }
  function _emit(name, detail) {
    try { global.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (_) {}
  }
  function _nowIso() {
    try { return new Date().toISOString(); } catch (_) { return ''; }
  }
  function _uid(prefix) {
    return (prefix || 'bm') + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
  }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _truncate(s, n) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t;
  }

  var BOOKMARKS_KEY = 'finlingo_bookmarks';
  var WATCHLIST_KEY = 'finlingo_watchlist';
  var VALID_TYPES = ['answer', 'lesson', 'market', 'unit'];

  // ── Bookmarks store ─────────────────────────────────────────────────
  var Bookmarks = {
    all: function () {
      return _readArray(BOOKMARKS_KEY).filter(function (b) {
        return b && typeof b === 'object' && b.type && (b.sourceId != null);
      });
    },
    byType: function (type) {
      if (!type || type === 'all') return this.all();
      return this.all().filter(function (b) { return b.type === type; });
    },
    has: function (type, sourceId) {
      return this.all().some(function (b) {
        return b.type === type && String(b.sourceId) === String(sourceId);
      });
    },
    get: function (type, sourceId) {
      return this.all().find(function (b) {
        return b.type === type && String(b.sourceId) === String(sourceId);
      }) || null;
    },
    getById: function (id) {
      return this.all().find(function (b) { return b.id === id; }) || null;
    },
    // De-dupe by type + sourceId. Returns the (existing or new) record.
    add: function (bm) {
      if (!bm || !bm.type || VALID_TYPES.indexOf(bm.type) === -1 || bm.sourceId == null) return null;
      var existing = this.get(bm.type, bm.sourceId);
      if (existing) return existing;
      var record = {
        id: bm.id || _uid('bm'),
        type: bm.type,
        sourceId: String(bm.sourceId),
        title: String(bm.title || 'Saved item'),
        preview: String(bm.preview || ''),
        createdAt: bm.createdAt || _nowIso()
      };
      if (bm.content != null) record.content = bm.content;        // only when needed
      if (bm.meta && typeof bm.meta === 'object') record.meta = bm.meta;
      var items = this.all();
      items.push(record);
      _writeArray(BOOKMARKS_KEY, items);
      _emit('finlingo:bookmarks-updated', { action: 'add', bookmark: record });
      return record;
    },
    removeById: function (id) {
      _writeArray(BOOKMARKS_KEY, this.all().filter(function (b) { return b.id !== id; }));
      _emit('finlingo:bookmarks-updated', { action: 'remove', id: id });
    },
    removeBySource: function (type, sourceId) {
      _writeArray(BOOKMARKS_KEY, this.all().filter(function (b) {
        return !(b.type === type && String(b.sourceId) === String(sourceId));
      }));
      _emit('finlingo:bookmarks-updated', { action: 'remove', type: type, sourceId: sourceId });
    },
    // Toggle by type+sourceId. Returns true if now saved, false if removed.
    toggle: function (bm) {
      if (!bm || !bm.type || bm.sourceId == null) return false;
      if (this.has(bm.type, bm.sourceId)) { this.removeBySource(bm.type, bm.sourceId); return false; }
      this.add(bm);
      return true;
    }
  };

  // ── Watchlist store (canonical Market asset keys: sp500 / qqq / btc) ──
  var Watchlist = {
    all: function () {
      return _readArray(WATCHLIST_KEY).filter(function (w) { return w && w.key; });
    },
    keys: function () { return this.all().map(function (w) { return w.key; }); },
    has: function (key) { return this.all().some(function (w) { return w.key === key; }); },
    add: function (key) {
      if (!key || this.has(key)) return false;               // prevent duplicate symbols
      var items = this.all();
      items.push({ key: key, addedAt: _nowIso() });
      _writeArray(WATCHLIST_KEY, items);
      _emit('finlingo:watchlist-updated', { action: 'add', key: key });
      return true;
    },
    remove: function (key) {
      _writeArray(WATCHLIST_KEY, this.all().filter(function (w) { return w.key !== key; }));
      _emit('finlingo:watchlist-updated', { action: 'remove', key: key });
    },
    toggle: function (key) {
      if (this.has(key)) { this.remove(key); return false; }
      return this.add(key);
    }
  };

  // ── Icons (inline SVG; FinLingoIcons is frozen, so they live here) ────
  function bookmarkIcon(filled) {
    return '<svg class="bm-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ' +
      'fill="' + (filled ? 'currentColor' : 'none') + '" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M19 21l-7-4.5L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  }
  function starIcon(filled) {
    return '<svg class="wl-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ' +
      'fill="' + (filled ? 'currentColor' : 'none') + '" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 17.3l-5.6 3.3 1.5-6.4-5-4.3 6.6-.55L12 3.4l2.5 5.95 6.6.55-5 4.3 1.5 6.4z"/></svg>';
  }

  // ── Shared bookmark toggle button (data-attribute driven) ────────────
  // Used for light items (answers, preset lessons, market insights) where
  // the bookmark payload is small enough to live in HTML data-* attributes.
  // Heavy items (generated units) build their record in JS instead.
  function bookmarkButton(opts) {
    opts = opts || {};
    var saved = Bookmarks.has(opts.type, opts.sourceId);
    var label = saved ? 'Remove from Saved' : 'Save';
    var data =
      ' data-bm-type="' + _esc(opts.type) + '"' +
      ' data-bm-source="' + _esc(opts.sourceId) + '"' +
      ' data-bm-title="' + _esc(opts.title || '') + '"' +
      ' data-bm-preview="' + _esc(opts.preview || '') + '"';
    if (opts.content != null) data += ' data-bm-content="' + _esc(opts.content) + '"';
    if (opts.meta) data += " data-bm-meta='" + _esc(JSON.stringify(opts.meta)) + "'";
    return '<button type="button" class="bm-btn' + (saved ? ' is-saved' : '') +
      (opts.extraClass ? ' ' + opts.extraClass : '') + '"' +
      ' aria-pressed="' + (saved ? 'true' : 'false') + '"' +
      ' aria-label="' + _esc(label) + '" title="' + _esc(label) + '"' + data +
      ' onclick="SavedUI.toggle(event, this)">' + bookmarkIcon(saved) +
      (opts.withLabel ? '<span class="bm-btn-label">' + (saved ? 'Saved' : 'Save') + '</span>' : '') +
      '</button>';
  }

  function _applyButtonState(btn, saved) {
    if (!btn) return;
    btn.classList.toggle('is-saved', saved);
    btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
    var label = saved ? 'Remove from Saved' : 'Save';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    var ico = btn.querySelector('.bm-ico');
    if (ico) ico.setAttribute('fill', saved ? 'currentColor' : 'none');
    var lab = btn.querySelector('.bm-btn-label');
    if (lab) lab.textContent = saved ? 'Saved' : 'Save';
  }

  // Re-sync every on-page bookmark button with the store (e.g. after an
  // item is removed from the Saved screen while its source is still visible).
  function refreshAllBookmarkButtons() {
    var btns = document.querySelectorAll('.bm-btn[data-bm-type]');
    Array.prototype.forEach.call(btns, function (btn) {
      var d = btn.dataset || {};
      _applyButtonState(btn, Bookmarks.has(d.bmType, d.bmSource));
    });
  }

  // ── Reopen a saved item at its source ───────────────────────────────
  function openBookmark(id) {
    var bm = Bookmarks.getById(id);
    if (!bm) return;
    if (global.NavDrawer && typeof global.NavDrawer.close === 'function') {
      try { global.NavDrawer.close(); } catch (_) {}
    }
    switch (bm.type) {
      case 'answer': _openAnswer(bm); break;
      case 'lesson': _openLesson(bm); break;
      case 'unit':   _openUnit(bm);   break;
      case 'market': _openMarket(bm); break;
    }
  }

  function _toast(msg) {
    if (typeof global.showToast === 'function') {
      try { global.showToast(msg); } catch (_) {}
    }
  }

  function _openAnswer(bm) {
    var meta = bm.meta || {};
    var hasChat = !!(meta.chatId && global.ChatStore && typeof global.ChatStore.get === 'function' &&
      global.ChatStore.get(meta.chatId));
    if (hasChat && global.CoachPage && typeof global.CoachPage.openChat === 'function') {
      try { global.CoachPage.openChat(meta.chatId); } catch (_) {}
      if (meta.messageId) {
        setTimeout(function () {
          var sel = (global.CSS && typeof global.CSS.escape === 'function')
            ? global.CSS.escape(meta.messageId) : meta.messageId;
          var node = document.querySelector('[data-message-id="' + sel + '"]');
          if (node) {
            try { node.scrollIntoView({ block: 'center' }); } catch (_) { node.scrollIntoView(); }
            node.classList.add('bm-flash');
            setTimeout(function () { node.classList.remove('bm-flash'); }, 1600);
          }
        }, 240);
      }
      return;
    }
    // The original conversation is gone — land on Ask and note it.
    if (typeof global.showCoach === 'function') global.showCoach({ resetScroll: false });
    _toast('The original conversation is no longer available.');
  }

  function _openLesson(bm) {
    var id = Number(bm.sourceId);
    if (typeof global.showLearn === 'function') global.showLearn({ resetScroll: false });
    if (typeof global.previewLearnLesson === 'function') {
      setTimeout(function () { global.previewLearnLesson(id); }, 60);
    }
  }

  function _openUnit(bm) {
    var unitId = bm.sourceId;
    var existing = (global.CoachUnits && typeof global.CoachUnits.get === 'function')
      ? global.CoachUnits.get(unitId) : null;
    // Recover the generated unit from the stored copy if it was never saved
    // into Learn (or its source chat has since been deleted).
    if (!existing && bm.content && global.CoachUnits && typeof global.CoachUnits.save === 'function') {
      try {
        var unit = (typeof bm.content === 'string') ? JSON.parse(bm.content) : bm.content;
        if (unit && unit.id) { global.CoachUnits.save(unit); existing = unit; }
      } catch (_) {}
    }
    if (existing && typeof global.openMicroUnit === 'function') {
      global.openMicroUnit(existing.id || unitId);
      return;
    }
    if (typeof global.showLearn === 'function') global.showLearn({ resetScroll: false });
    _toast('This saved unit could not be reopened.');
  }

  function _openMarket(bm) {
    var key = (bm.meta && bm.meta.assetKey) || bm.sourceId;
    if (typeof global.showMarket === 'function') global.showMarket({ resetScroll: false });
    if (typeof global.selectMarketAsset === 'function') {
      setTimeout(function () { global.selectMarketAsset(key); }, 90);
    }
  }

  // ── "Saved" screen ──────────────────────────────────────────────────
  var SAVED_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'answer', label: 'Answers' },
    { key: 'lesson', label: 'Lessons' },
    { key: 'market', label: 'Market' },
    { key: 'unit', label: 'Units' }
  ];
  var _savedFilter = 'all';

  function setSavedFilter(key) {
    _savedFilter = key;
    renderSaved();
  }

  function _typeLabel(type) {
    return { answer: 'Answer', lesson: 'Lesson', market: 'Market', unit: 'Unit' }[type] || 'Saved';
  }
  function _formatSavedDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) { return ''; }
  }

  function _emptyState(title, copy) {
    return '<div class="saved-empty">' +
      '<div class="saved-empty-icon" aria-hidden="true">' + bookmarkIcon(false) + '</div>' +
      '<div class="saved-empty-title">' + _esc(title) + '</div>' +
      '<div class="saved-empty-copy">' + _esc(copy) + '</div>' +
    '</div>';
  }

  function _savedCard(bm) {
    var date = _formatSavedDate(bm.createdAt);
    return '<article class="saved-card" data-bm-id="' + _esc(bm.id) + '">' +
      '<div class="saved-card-main">' +
        '<div class="saved-card-meta">' +
          '<span class="saved-card-type saved-type-' + _esc(bm.type) + '">' + _esc(_typeLabel(bm.type)) + '</span>' +
          (date ? '<span class="saved-card-date">Saved ' + _esc(date) + '</span>' : '') +
        '</div>' +
        '<h2 class="saved-card-title">' + _esc(bm.title || 'Saved item') + '</h2>' +
        (bm.preview ? '<p class="saved-card-preview">' + _esc(bm.preview) + '</p>' : '') +
      '</div>' +
      '<div class="saved-card-actions">' +
        '<button type="button" class="saved-open" onclick="SavedUI.open(&#39;' + _esc(bm.id) + '&#39;)">Open</button>' +
        '<button type="button" class="saved-remove" aria-label="Remove from Saved" ' +
          'onclick="SavedUI.removeCard(&#39;' + _esc(bm.id) + '&#39;)">Remove</button>' +
      '</div>' +
    '</article>';
  }

  function renderSaved() {
    var root = document.getElementById('savedRoot');
    if (!root) return;
    // Newest first.
    var all = Bookmarks.all().slice().sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    var items = _savedFilter === 'all'
      ? all
      : all.filter(function (b) { return b.type === _savedFilter; });

    var chips = SAVED_FILTERS.map(function (f) {
      var active = f.key === _savedFilter;
      return '<button type="button" class="saved-chip' + (active ? ' is-active' : '') + '" ' +
        'role="tab" aria-selected="' + (active ? 'true' : 'false') + '" ' +
        'onclick="SavedUI.filter(&#39;' + f.key + '&#39;)">' + _esc(f.label) + '</button>';
    }).join('');

    var body;
    if (!all.length) {
      body = _emptyState('Nothing saved yet',
        'Tap the bookmark icon on an Ask answer, a lesson, a market insight, or a generated unit to keep it here.');
    } else if (!items.length) {
      body = _emptyState('No saved ' + _typeLabel(_savedFilter).toLowerCase() + ' items', 'Try a different filter.');
    } else {
      body = '<div class="saved-list">' + items.map(_savedCard).join('') + '</div>';
    }

    root.innerHTML =
      '<header class="saved-head">' +
        '<h1 class="saved-title">Saved</h1>' +
        '<p class="saved-sub">Your bookmarked answers, lessons, market insights, and units.</p>' +
      '</header>' +
      '<div class="saved-filters" role="tablist" aria-label="Filter saved items">' + chips + '</div>' +
      body;
  }

  var SavedUI = {
    toggle: function (ev, btn) {
      if (ev) { if (ev.preventDefault) ev.preventDefault(); if (ev.stopPropagation) ev.stopPropagation(); }
      if (!btn) return;
      var d = btn.dataset || {};
      var meta = null;
      if (d.bmMeta) { try { meta = JSON.parse(d.bmMeta); } catch (_) { meta = null; } }
      var bm = {
        type: d.bmType,
        sourceId: d.bmSource,
        title: d.bmTitle || '',
        preview: d.bmPreview || '',
        meta: meta
      };
      if (d.bmContent != null && d.bmContent !== '') bm.content = d.bmContent;
      var saved = Bookmarks.toggle(bm);
      _applyButtonState(btn, saved);
    },
    filter: setSavedFilter,
    open: openBookmark,
    removeCard: function (id) { Bookmarks.removeById(id); renderSaved(); },
    button: bookmarkButton,
    applyState: _applyButtonState,
    refreshButtons: refreshAllBookmarkButtons,
    bookmarkIcon: bookmarkIcon,
    starIcon: starIcon,
    truncate: _truncate
  };

  // ── Keep open surfaces in sync ──────────────────────────────────────
  if (global.addEventListener) {
    global.addEventListener('finlingo:bookmarks-updated', function () {
      refreshAllBookmarkButtons();
      var s = document.getElementById('savedScreen');
      if (s && s.classList.contains('active')) renderSaved();
    });
    global.addEventListener('finlingo:watchlist-updated', function () {
      if (typeof global.renderYourWatchlist === 'function') {
        try { global.renderYourWatchlist(); } catch (_) {}
      }
    });
  }

  global.FinBookmarks = Bookmarks;
  global.FinWatchlist = Watchlist;
  global.SavedUI = SavedUI;
  global.renderSaved = renderSaved;

})(typeof window !== 'undefined' ? window : this);
