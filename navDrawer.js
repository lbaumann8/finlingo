// ============================================================
// navDrawer.js
// Single left-side Recent Chats drawer.
//
// Opened by the recent-conversations button in the header.
//
//   NavDrawer.open() / .close() / .toggle()
//
// Reuses the existing chat system (ChatStore) and Ask page
// (CoachPage) — it does NOT introduce a second chat data source.
//
// Depends on (looked up lazily at call-time):
//   global.ChatStore   — list/create/rename/remove/active chat
//   global.CoachPage   — openChat(id), newChat()
// ============================================================

(function (global) {
  'use strict';

  var _isOpen = false;
  var _lastFocus = null;
  var _menuId = null;      // chat id whose ⋯ menu is open
  var _renameId = null;    // chat id being renamed inline
  var _confirmId = null;   // chat id awaiting delete confirmation
  var _closeTimer = null;

  function _store() { return global.ChatStore || null; }
  function _coach() { return global.CoachPage || null; }

  function _setHamburgerExpanded(expanded) {
    var btns = document.querySelectorAll('.nav-hamburger');
    Array.prototype.forEach.call(btns, function (b) {
      b.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── Icons ──────────────────────────────────────────────────
  var ICON_MORE ='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  // ── Chat list markup ───────────────────────────────────────
  function _chatRows() {
    var store = _store();
    if (!store) return '<li class="nav-drawer-empty">No conversations yet.</li>';
    var chats = store.all().filter(function (c) {
      return c && Array.isArray(c.messages) && c.messages.length > 0;
    }); // already sorted most-recently-updated first
    var activeId = store.activeId();

    if (!chats.length) {
      return '<li class="nav-drawer-empty">No conversations yet.</li>';
    }
    return chats.map(function (c) { return _chatRow(c, c.id === activeId); }).join('');
  }

  function _chatRow(c, isActive) {
    var id = c.id;
    var title = _esc(c.title || 'New conversation');

    if (_renameId === id) {
      return '<li class="nav-chat-row is-renaming">' +
        '<input class="nav-chat-rename-input" type="text" maxlength="60" value="' + _esc(c.title || '') + '" ' +
          'aria-label="Rename conversation" onkeydown="NavDrawer._renameKey(event,&#39;' + id + '&#39;)" />' +
        '<div class="nav-chat-rename-actions">' +
          '<button type="button" class="nav-chat-rename-cancel" onclick="NavDrawer._renameCancel()">Cancel</button>' +
          '<button type="button" class="nav-chat-rename-save" onclick="NavDrawer._renameSave(&#39;' + id + '&#39;)">Save</button>' +
        '</div>' +
      '</li>';
    }

    var menu = '';
    if (_confirmId === id) {
      menu = '<div class="nav-chat-menu nav-chat-confirm" role="dialog" aria-label="Confirm delete">' +
        '<p class="nav-chat-confirm-text">Delete this conversation?</p>' +
        '<div class="nav-chat-confirm-actions">' +
          '<button type="button" class="nav-chat-confirm-cancel" onclick="NavDrawer._closeMenus()">Cancel</button>' +
          '<button type="button" class="nav-chat-confirm-delete" onclick="NavDrawer._delete(&#39;' + id + '&#39;)">Delete</button>' +
        '</div>' +
      '</div>';
    } else if (_menuId === id) {
      menu = '<div class="nav-chat-menu" role="menu">' +
        '<button type="button" role="menuitem" onclick="NavDrawer._startRename(&#39;' + id + '&#39;)">Rename</button>' +
        '<button type="button" role="menuitem" class="nav-chat-menu-danger" onclick="NavDrawer._askDelete(&#39;' + id + '&#39;)">Delete</button>' +
      '</div>';
    }

    return '<li class="nav-chat-row' + (isActive ? ' is-active' : '') + (_menuId === id || _confirmId === id ? ' is-menu-open' : '') + '">' +
      '<button type="button" class="nav-chat-open"' + (isActive ? ' aria-current="true"' : '') +
        ' onclick="NavDrawer._open(&#39;' + id + '&#39;)">' +
        '<span class="nav-chat-title">' + title + '</span>' +
      '</button>' +
      '<button type="button" class="nav-chat-more" aria-label="Conversation options"' +
        ' aria-haspopup="menu" aria-expanded="' + (_menuId === id || _confirmId === id ? 'true' : 'false') + '"' +
        ' onclick="NavDrawer._toggleMenu(event,&#39;' + id + '&#39;)">' + ICON_MORE + '</button>' +
      menu +
    '</li>';
  }

  // ── Full panel render ──────────────────────────────────────
  function _render() {
    var root = document.getElementById('navDrawerRoot');
    if (!root) return;
    root.innerHTML =
      '<div class="nav-drawer-backdrop" onclick="NavDrawer.close()"></div>' +
      '<aside class="nav-drawer-panel" role="dialog" aria-modal="true" aria-label="Recent chats">' +
        '<div class="nav-drawer-head">' +
          '<h2>Recent chats</h2>' +
          '<button type="button" class="nav-drawer-close" aria-label="Close recent chats" onclick="NavDrawer.close()">' + ICON_CLOSE + '</button>' +
        '</div>' +
        '<button type="button" class="nav-drawer-new" onclick="NavDrawer._newChat()">New conversation</button>' +
        '<div class="nav-drawer-recents">' +
          '<div class="nav-drawer-recents-label">Recent</div>' +
          '<ul class="nav-drawer-list" id="navDrawerList" role="list">' + _chatRows() + '</ul>' +
        '</div>' +
      '</aside>';
  }

  function _refreshList() {
    var list = document.getElementById('navDrawerList');
    if (list) list.innerHTML = _chatRows();
  }

  function refresh() {
    if (_isOpen) _render();
  }

  // ── Open / close ───────────────────────────────────────────
  function open() {
    if (_isOpen) return;
    var root = document.getElementById('navDrawerRoot');
    if (!root) return;
    if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
    _lastFocus = document.activeElement;
    _menuId = _renameId = _confirmId = null;
    _render();
    _isOpen = true;
    document.body.classList.add('nav-drawer-lock');
    root.setAttribute('aria-hidden', 'false');
    _setHamburgerExpanded(true);
    // Force a reflow between the initial (off-screen) state and the open
    // class so the slide-in transition runs. More robust than rAF, which
    // does not fire in hidden/backgrounded tabs.
    void root.offsetWidth;
    root.classList.add('open');
    document.addEventListener('keydown', _onKeydown, true);
  }

  function close() {
    if (!_isOpen) return;
    var root = document.getElementById('navDrawerRoot');
    _isOpen = false;
    _menuId = _renameId = _confirmId = null;
    document.removeEventListener('keydown', _onKeydown, true);
    document.body.classList.remove('nav-drawer-lock');
    _setHamburgerExpanded(false);
    if (root) {
      root.classList.remove('open');
      root.setAttribute('aria-hidden', 'true');
      _closeTimer = setTimeout(function () {
        if (!_isOpen && root) root.innerHTML = '';
        _closeTimer = null;
      }, 260);
    }
    if (_lastFocus && typeof _lastFocus.focus === 'function') {
      try { _lastFocus.focus(); } catch (_) {}
    }
    _lastFocus = null;
  }

  function toggle() { if (_isOpen) close(); else open(); }

  // ── Keyboard: Escape + focus trap ──────────────────────────
  function _onKeydown(e) {
    if (!_isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (_menuId || _renameId || _confirmId) { _closeMenus(); }
      else { close(); }
      return;
    }
    if (e.key === 'Tab') {
      var panel = document.querySelector('.nav-drawer-panel');
      if (!panel) return;
      var nodes = panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      var f = Array.prototype.filter.call(nodes, function (el) {
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
      });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  // ── Row actions ────────────────────────────────────────────
  function _open(id) {
    close();
    var coach = _coach();
    if (coach && typeof coach.openChat === 'function') { coach.openChat(id); return; }
    var store = _store();
    if (store) store.setActive(id);
  }

  function _newChat() {
    close();
    var coach = _coach();
    if (coach && typeof coach.newChat === 'function') { coach.newChat(); return; }
    var store = _store();
    if (store) {
      var chat = store.reuseOrCreateEmpty ? store.reuseOrCreateEmpty() : store.create();
      store.setActive(chat.id);
    }
  }

  // ── Three-dot menu ─────────────────────────────────────────
  function _toggleMenu(e, id) {
    if (e && e.stopPropagation) e.stopPropagation();
    _menuId = (_menuId === id ? null : id);
    _confirmId = null;
    _renameId = null;
    _refreshList();
  }
  function _closeMenus() {
    _menuId = _confirmId = null;
    _refreshList();
  }

  // ── Rename ─────────────────────────────────────────────────
  function _startRename(id) {
    _renameId = id;
    _menuId = _confirmId = null;
    _refreshList();
    setTimeout(function () {
      var el = document.querySelector('.nav-chat-rename-input');
      if (el) { el.focus(); el.select(); }
    }, 20);
  }
  function _renameSave(id) {
    var el = document.querySelector('.nav-chat-rename-input');
    var val = el ? el.value.trim() : '';
    if (!val) { if (el) el.focus(); return; } // prevent blank titles
    var store = _store();
    if (store) store.rename(id, val);
    _renameId = null;
    _refreshList(); // drawer stays open after renaming
  }
  function _renameCancel() {
    _renameId = null;
    _refreshList();
  }
  function _renameKey(e, id) {
    if (e.key === 'Enter') { e.preventDefault(); _renameSave(id); }
    else if (e.key === 'Escape') { e.preventDefault(); _renameCancel(); }
  }

  // ── Delete ─────────────────────────────────────────────────
  function _askDelete(id) {
    _confirmId = id;
    _menuId = null;
    _refreshList();
  }
  function _delete(id) {
    var store = _store();
    // ChatStore.remove() reassigns the active chat (or creates a blank one
    // if none remain) and never touches saved Learn units.
    if (store) store.remove(id);
    _confirmId = _menuId = null;
    _refreshList();
  }

  // ── Keep the open drawer in sync with chat changes ─────────
  if (global.addEventListener) {
    global.addEventListener('finlingo:chats-updated', function () { if (_isOpen) _refreshList(); });
    global.addEventListener('finlingo:active-chat-changed', function () { if (_isOpen) _refreshList(); });
  }

  global.NavDrawer = {
    open: open,
    close: close,
    toggle: toggle,
    refresh: refresh,
    _open: _open,
    _newChat: _newChat,
    _toggleMenu: _toggleMenu,
    _closeMenus: _closeMenus,
    _startRename: _startRename,
    _renameSave: _renameSave,
    _renameCancel: _renameCancel,
    _renameKey: _renameKey,
    _askDelete: _askDelete,
    _delete: _delete
  };

})(typeof window !== 'undefined' ? window : this);
