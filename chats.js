// FinLingo — multi-chat store + history panel for the Ask experience.
//
// Pure localStorage (Supabase-portable shape). Two responsibilities:
//   • ChatStore  — the data layer: chats, the one active chat id, CRUD, local
//                  title generation, safe restore, and migration.
//   • ChatHistory — the mobile slide-over panel (Your conversations).
//
// The Ask page (coachPage.js) binds its working `thread` to the active chat's
// `messages` array and calls ChatStore to persist. This file owns storage; it
// never makes AI requests.

(function (global) {
  'use strict';

  var KEY_CHATS = 'finlingo_chats';
  var KEY_ACTIVE = 'finlingo_active_chat_id';
  var LEGACY_KEYS = ['finlingo_ask_thread', 'finlingo_coach_thread'];

  function _now() { return new Date().toISOString(); }
  function _uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e9).toString(36);
  }
  function _emit(name, detail) {
    if (!global || typeof global.dispatchEvent !== 'function') return;
    try { global.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (_) {}
  }
  function _esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Data layer ──────────────────────────────────────────────────────
  var _chats = null; // in-memory cache (live references used by coachPage)

  function _readRaw() {
    try {
      var raw = localStorage.getItem(KEY_CHATS);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(function (c) { return c && typeof c === 'object' && c.id; })
        .map(_normalizeChat);
    } catch (_) {
      return [];
    }
  }

  function _looksLikeMarketTopicPrompt(text, m) {
    var s = String(text || '');
    if (!s) return false;
    if (m && (m.source === 'market_topic' || m.marketTopic || m.topicTitle || (m.apiContext && m.apiContext.source === 'market_topic'))) return true;
    var markers = 0;
    if (/Topic detail:/i.test(s)) markers++;
    if (/Selected market:/i.test(s)) markers++;
    if (/Selected timeframe:/i.test(s)) markers++;
    if (/Current Quick Take:/i.test(s)) markers++;
    if (/Make it beginner-friendly, educational, and not financial advice/i.test(s)) markers++;
    return markers >= 2;
  }

  function _marketTopicFromPrompt(text, m) {
    var explicit = (m && (m.marketTopic || m.topicTitle || (m.apiContext && m.apiContext.topic) || m.topic)) || '';
    explicit = String(explicit || '').trim();
    if (explicit && !/selected market|topic detail|current quick take/i.test(explicit)) return explicit;
    var s = String(text || '');
    var detail = s.match(/Topic detail:\s*([^\n]+)/i);
    var lower = s.toLowerCase();
    if (/\bbonds?\b|rates and prices/.test(lower)) return 'Bonds';
    if (/\binflation\b|data and impact/.test(lower)) return 'Inflation';
    if (/\binterest rates?\b|what moves them/.test(lower)) return 'Interest rates';
    if (/\bearnings?\b|what to watch/.test(lower)) return 'Earnings Season';
    return detail ? detail[1].trim() : 'Today’s market';
  }

  function _marketTopicDisplayMessage(topic, text) {
    var t = String(topic || '').toLowerCase();
    var source = String(text || '').toLowerCase();
    var bitcoin = /\bbitcoin\b|\bbtc\b/.test(source);
    if (t.indexOf('bond') >= 0) return 'Explain how bonds work and how they connect to today’s market.';
    if (t.indexOf('inflation') >= 0) {
      return bitcoin
        ? 'Explain how interest rates and inflation can affect Bitcoin.'
        : 'Explain today’s inflation environment and how it can affect markets.';
    }
    if (t.indexOf('rate') >= 0) {
      return bitcoin
        ? 'Explain how interest rates and inflation can affect Bitcoin.'
        : 'Explain how interest rates affect investments and today’s market.';
    }
    if (t.indexOf('earning') >= 0) return 'Explain earnings season and why it matters for today’s market.';
    return 'Explain this market topic and how it connects to today’s market.';
  }

  function _normalizeMessage(m) {
    var out = Object.assign({}, m);
    if (out.role !== 'user') return out;
    var visible = out.text || out.content || out.displayContent || '';
    if (!_looksLikeMarketTopicPrompt(visible, out)) return out;
    var fullPrompt = out.requestText || out.requestContent || out.apiPrompt || visible;
    var topic = _marketTopicFromPrompt(fullPrompt, out);
    var display = _marketTopicDisplayMessage(topic, fullPrompt);
    out.text = display;
    if ('content' in out) out.content = display;
    if ('displayContent' in out) out.displayContent = display;
    out.requestText = String(fullPrompt || '');
    out.source = out.source || 'market_topic';
    out.marketTopic = out.marketTopic || topic;
    out.promptDisplayMigrated = true;
    out.apiContext = Object.assign({}, out.apiContext || {}, {
      source: 'market_topic',
      topic: (out.apiContext && out.apiContext.topic) || topic,
      fullPrompt: String(fullPrompt || '')
    });
    return out;
  }

  function _normalizeChat(c) {
    var messages = Array.isArray(c.messages)
      ? c.messages.filter(function (m) { return m && typeof m === 'object'; }).map(_normalizeMessage)
      : [];
    var firstUser = messages.find(function (m) { return m && m.role === 'user' && m.text; });
    var title = typeof c.title === 'string' && c.title.trim() ? c.title : 'New conversation';
    if (firstUser && (firstUser.promptDisplayMigrated || _looksLikeMarketTopicPrompt(c.title, firstUser))) title = titleFromQuestion(firstUser.text);
    return {
      id: String(c.id),
      title: title,
      createdAt: c.createdAt || _now(),
      updatedAt: c.updatedAt || c.createdAt || _now(),
      messages: messages,
      generatedUnits: Array.isArray(c.generatedUnits) ? c.generatedUnits : []
    };
  }

  function _migrate() {
    // Older builds kept the Ask thread only in memory (nothing persisted) plus
    // a separate saved-units store (finlingo_custom_units_v1) which we LEAVE
    // untouched. If any legacy transient thread was ever written, fold it into
    // one chat instead of discarding it.
    for (var i = 0; i < LEGACY_KEYS.length; i++) {
      var key = LEGACY_KEYS[i];
      var raw;
      try { raw = localStorage.getItem(key); } catch (_) { raw = null; }
      if (!raw) continue;
      try {
        var msgs = JSON.parse(raw);
        if (Array.isArray(msgs) && msgs.length) {
          var first = msgs.find(function (m) { return m && m.role === 'user' && (m.text || m.content); });
          var chat = _blankChat();
          chat.messages = msgs;
          chat.title = first ? titleFromQuestion(first.text || first.content) : 'Imported conversation';
          _chats.unshift(chat);
        }
      } catch (_) {}
      try { localStorage.removeItem(key); } catch (_) {}
    }
  }

  function _ensureLoaded() {
    if (_chats) return _chats;
    _chats = _readRaw();
    _migrate();
    return _chats;
  }

  function _persist() {
    try { localStorage.setItem(KEY_CHATS, JSON.stringify(_ensureLoaded())); } catch (_) {}
    _emit('finlingo:chats-updated');
  }

  function _blankChat() {
    return { id: _uid('chat'), title: 'New conversation', createdAt: _now(), updatedAt: _now(), messages: [], generatedUnits: [] };
  }

  function _byUpdatedDesc(a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); }

  // Local, no-AI title from the first question. Title-case, keep acronyms,
  // lowercase minor words, cap length, truncate cleanly.
  var MINOR = { a: 1, an: 1, the: 1, and: 1, but: 1, or: 1, nor: 1, for: 1, yet: 1, so: 1, at: 1, by: 1, in: 1, of: 1, on: 1, to: 1, up: 1, as: 1, vs: 1, via: 1, per: 1, from: 1, with: 1, into: 1, onto: 1, over: 1 };
  function titleFromQuestion(question) {
    var s = String(question || '').trim().replace(/^["'“”]+|["'”]+$/g, '').replace(/\s+/g, ' ');
    if (!s) return 'New conversation';
    var words = s.split(' ');
    var cased = words.map(function (w, i) {
      var bare = w.replace(/[^A-Za-z0-9']/g, '');
      if (!bare) return '';
      var trailing = /[?]$/.test(w) ? '?' : '';
      if (/^[A-Z0-9]{2,}$/.test(bare)) return bare + trailing; // acronym (IPO, ETF)
      var lower = bare.toLowerCase();
      var core = (i !== 0 && MINOR[lower]) ? lower : (lower.charAt(0).toUpperCase() + lower.slice(1));
      return core + trailing;
    }).filter(Boolean);
    if (cased.length > 8) cased = cased.slice(0, 8);
    var title = cased.join(' ');
    if (title.length > 45) title = title.slice(0, 45).replace(/\s+\S*$/, '').trim() + '…';
    return title || 'New conversation';
  }

  var ChatStore = {
    KEY_CHATS: KEY_CHATS,
    KEY_ACTIVE: KEY_ACTIVE,
    titleFromQuestion: titleFromQuestion,

    all: function () { return _ensureLoaded().slice().sort(_byUpdatedDesc); },
    get: function (id) { return _ensureLoaded().find(function (c) { return c.id === id; }) || null; },

    activeId: function () { try { return localStorage.getItem(KEY_ACTIVE) || ''; } catch (_) { return ''; } },
    active: function () { return this.get(this.activeId()); },

    setActive: function (id, opts) {
      opts = opts || {};
      try { localStorage.setItem(KEY_ACTIVE, id); } catch (_) {}
      if (!opts.silent) _emit('finlingo:active-chat-changed', { id: id });
    },

    create: function () {
      var c = _blankChat();
      _ensureLoaded().unshift(c);
      _persist();
      return c;
    },

    // Restore rule: stored active → else most recently updated → else create.
    ensureActive: function () {
      _ensureLoaded();
      var c = this.active();
      if (c) return c;
      var newest = this.all()[0];
      if (newest) { this.setActive(newest.id, { silent: true }); return newest; }
      c = this.create();
      this.setActive(c.id, { silent: true });
      return c;
    },

    // New Chat must not spawn duplicate empties — reuse an existing blank one.
    reuseOrCreateEmpty: function () {
      var active = this.active();
      if (active && (!active.messages || active.messages.length === 0)) return active;
      var empty = _ensureLoaded().find(function (c) { return !c.messages || c.messages.length === 0; });
      if (empty) return empty;
      return this.create();
    },

    persist: function () { _persist(); },

    touch: function (id) {
      var c = this.get(id);
      if (c) { c.updatedAt = _now(); _persist(); }
    },

    rename: function (id, title) {
      var c = this.get(id);
      if (!c) return false;
      var t = String(title || '').trim().slice(0, 60);
      if (!t) return false;
      c.title = t;
      c.updatedAt = _now();
      _persist();
      return true;
    },

    remove: function (id) {
      var list = _ensureLoaded();
      var idx = list.findIndex(function (c) { return c.id === id; });
      if (idx < 0) return;
      var wasActive = this.activeId() === id;
      list.splice(idx, 1);
      _persist();
      if (wasActive) {
        var next = this.all()[0];
        if (next) this.setActive(next.id);
        else { var fresh = this.create(); this.setActive(fresh.id); }
      }
    },

    // Preview = the most recent message's readable content.
    previewOf: function (chat) {
      var msgs = (chat && chat.messages) || [];
      for (var i = msgs.length - 1; i >= 0; i--) {
        var m = msgs[i];
        if (m.text) return m.text;
        if (m.content) return m.content;
        if (m.kind === 'unit') return 'Generated a learning unit';
        if (m.kind === 'quiz') return 'Generated a quiz';
        if (m.kind === 'market') return 'Explained today’s market';
      }
      return 'No messages yet';
    }
  };
  global.ChatStore = ChatStore;

  // ── History panel (mobile slide-over) ───────────────────────────────
  var _panelOpen = false;
  var _menuId = null;       // row whose ⋯ menu is open
  var _renameId = null;     // row being renamed inline
  var _confirmId = null;    // row pending delete confirm
  var _lastFocus = null;

  function _relTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var t = d.getTime();
    if (t >= startToday) {
      try { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (_) { return ''; }
    }
    var days = Math.floor((startToday - t) / 86400000);
    if (days < 7) { try { return d.toLocaleDateString([], { weekday: 'short' }); } catch (_) { return days + 'd'; } }
    try { return d.toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch (_) { return ''; }
  }

  function _group(chat) {
    var d = new Date(chat.updatedAt);
    if (isNaN(d.getTime())) return 'Older';
    var now = new Date();
    var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var t = d.getTime();
    if (t >= startToday) return 'Today';
    if ((startToday - t) / 86400000 < 7) return 'Previous 7 days';
    return 'Older';
  }

  function _rowMarkup(chat, activeId) {
    var isActive = chat.id === activeId;
    var preview = ChatStore.previewOf(chat);
    if (_renameId === chat.id) {
      return '' +
        '<li class="ch-row ch-row-rename">' +
        '  <input type="text" class="ch-rename-input" value="' + _esc(chat.title) + '" maxlength="60" aria-label="Rename conversation" ' +
        '         onkeydown="ChatHistory._renameKey(event,\'' + chat.id + '\')" />' +
        '  <div class="ch-rename-actions">' +
        '    <button type="button" class="ch-mini" onclick="ChatHistory._renameCancel()">Cancel</button>' +
        '    <button type="button" class="ch-mini ch-mini-primary" onclick="ChatHistory._renameSave(\'' + chat.id + '\')">Save</button>' +
        '  </div>' +
        '</li>';
    }
    var menu = '';
    if (_confirmId === chat.id) {
      menu = '' +
        '<div class="ch-menu ch-confirm" role="menu">' +
        '  <div class="ch-confirm-text">Delete this conversation?</div>' +
        '  <div class="ch-confirm-actions">' +
        '    <button type="button" class="ch-mini" onclick="ChatHistory._closeMenus()">Cancel</button>' +
        '    <button type="button" class="ch-mini ch-mini-danger" onclick="ChatHistory._delete(\'' + chat.id + '\')">Delete</button>' +
        '  </div>' +
        '</div>';
    } else if (_menuId === chat.id) {
      menu = '' +
        '<div class="ch-menu" role="menu">' +
        '  <button type="button" role="menuitem" onclick="ChatHistory._startRename(\'' + chat.id + '\')">Rename</button>' +
        '  <button type="button" role="menuitem" class="ch-menu-danger" onclick="ChatHistory._askDelete(\'' + chat.id + '\')">Delete</button>' +
        '</div>';
    }
    return '' +
      '<li class="ch-row' + (isActive ? ' is-active' : '') + '">' +
      '  <button type="button" class="ch-row-main" onclick="ChatHistory._open(\'' + chat.id + '\')">' +
      '    <span class="ch-row-title">' + _esc(chat.title) + '</span>' +
      '    <span class="ch-row-preview">' + _esc(preview) + '</span>' +
      '  </button>' +
      '  <span class="ch-row-time">' + _esc(_relTime(chat.updatedAt)) + '</span>' +
      '  <button type="button" class="ch-row-menu-btn" aria-label="Conversation options" aria-haspopup="menu" ' +
      '          onclick="ChatHistory._toggleMenu(\'' + chat.id + '\')">' +
      '    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>' +
      '  </button>' +
      menu +
      '</li>';
  }

  function _listMarkup() {
    var chats = ChatStore.all();
    var activeId = ChatStore.activeId();
    if (!chats.length) {
      return '<div class="ch-empty">No conversations yet.</div>';
    }
    var groups = ['Today', 'Previous 7 days', 'Older'];
    var buckets = { 'Today': [], 'Previous 7 days': [], 'Older': [] };
    chats.forEach(function (c) { buckets[_group(c)].push(c); });
    var html = '';
    groups.forEach(function (g) {
      if (!buckets[g].length) return;
      html += '<div class="ch-group"><div class="ch-group-label">' + g + '</div><ul class="ch-list">' +
        buckets[g].map(function (c) { return _rowMarkup(c, activeId); }).join('') + '</ul></div>';
    });
    return html;
  }

  function _renderPanel() {
    var overlay = document.getElementById('chatHistoryOverlay');
    if (!overlay) return;
    overlay.innerHTML = '' +
      '<div class="ch-backdrop" onclick="ChatHistory.close()"></div>' +
      '<aside class="ch-panel" role="dialog" aria-modal="true" aria-label="Your conversations">' +
      '  <header class="ch-panel-head">' +
      '    <h2 class="ch-panel-title">Your conversations</h2>' +
      '    <button type="button" class="ch-icon-btn ch-close" aria-label="Close chat history" onclick="ChatHistory.close()">' +
      '      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
      '    </button>' +
      '  </header>' +
      '  <button type="button" class="ch-newchat" onclick="ChatHistory._new()">' +
      '    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>' +
      '    <span>New chat</span>' +
      '  </button>' +
      '  <div class="ch-scroll" id="chatHistoryList">' + _listMarkup() + '</div>' +
      '</aside>';
  }

  function _refreshList() {
    var list = document.getElementById('chatHistoryList');
    if (list) list.innerHTML = _listMarkup();
  }

  function _trapFocus(e) {
    if (!_panelOpen || e.key !== 'Tab') return;
    var panel = document.querySelector('#chatHistoryOverlay .ch-panel');
    if (!panel) return;
    var focusable = panel.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function _onKeydown(e) {
    if (!_panelOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); ChatHistory.close(); }
    else _trapFocus(e);
  }

  var ChatHistory = {
    open: function () {
      var overlay = document.getElementById('chatHistoryOverlay');
      if (!overlay) return;
      _lastFocus = document.activeElement;
      _menuId = _renameId = _confirmId = null;
      _renderPanel();
      _panelOpen = true;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('ch-open');
      document.addEventListener('keydown', _onKeydown, true);
      setTimeout(function () {
        var close = overlay.querySelector('.ch-close');
        if (close) close.focus();
      }, 30);
    },
    close: function () {
      var overlay = document.getElementById('chatHistoryOverlay');
      _panelOpen = false;
      _menuId = _renameId = _confirmId = null;
      document.removeEventListener('keydown', _onKeydown, true);
      document.body.classList.remove('ch-open');
      if (overlay) {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
      }
      if (_lastFocus && typeof _lastFocus.focus === 'function') { try { _lastFocus.focus(); } catch (_) {} }
    },
    refresh: function () { if (_panelOpen) _refreshList(); },

    _open: function (id) {
      this.close();
      if (global.CoachPage && typeof global.CoachPage.openChat === 'function') global.CoachPage.openChat(id);
    },
    _new: function () {
      this.close();
      if (global.CoachPage && typeof global.CoachPage.newChat === 'function') global.CoachPage.newChat();
    },
    _toggleMenu: function (id) { _menuId = (_menuId === id ? null : id); _confirmId = null; _renameId = null; _refreshList(); },
    _closeMenus: function () { _menuId = null; _confirmId = null; _refreshList(); },
    _startRename: function (id) { _renameId = id; _menuId = null; _confirmId = null; _refreshList(); setTimeout(function () { var el = document.querySelector('.ch-rename-input'); if (el) { el.focus(); el.select(); } }, 20); },
    _renameCancel: function () { _renameId = null; _refreshList(); },
    _renameSave: function (id) {
      var el = document.querySelector('.ch-rename-input');
      var val = el ? el.value.trim() : '';
      if (!val) { if (el) el.focus(); return; }
      ChatStore.rename(id, val);
      _renameId = null;
      _refreshList();
    },
    _renameKey: function (e, id) {
      if (e.key === 'Enter') { e.preventDefault(); this._renameSave(id); }
      else if (e.key === 'Escape') { e.preventDefault(); this._renameCancel(); }
    },
    _askDelete: function (id) { _confirmId = id; _menuId = null; _refreshList(); },
    _delete: function (id) {
      ChatStore.remove(id);
      _confirmId = _menuId = null;
      _refreshList();
    }
  };
  global.ChatHistory = ChatHistory;

  // Keep the open panel's list fresh when chats change elsewhere.
  if (global.addEventListener) {
    global.addEventListener('finlingo:chats-updated', function () { ChatHistory.refresh(); });
    global.addEventListener('finlingo:active-chat-changed', function () { ChatHistory.refresh(); });
  }
})(typeof window !== 'undefined' ? window : this);
