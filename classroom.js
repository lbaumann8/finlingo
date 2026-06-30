// ============================================================================
// classroom.js
// Finlingo Classroom UI — leader dashboard, create-group, assignment creation,
// learner join + 5-question player, anonymous group insights, follow-up
// generation, and a fully client-side demo classroom.
//
// Renders into #classroomRoot. Entry: renderClassroom(view).
// Data + Claude access goes through window.ClassroomData (classroomData.js).
// Reuses the Market-Mastery quiz visual language (.ml-* classes).
// ============================================================================

(function (global) {
  'use strict';

  var D = function () { return global.ClassroomData; };
  var ROOT = function () { return document.getElementById('classroomRoot'); };

  // Transient flow state (current group / assignment / attempt / answers).
  var CR = { player: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg, kind) {
    if (typeof global.showToast === 'function') global.showToast(msg, kind || 'info');
  }
  function mount(html, after) {
    var root = ROOT();
    if (!root) return;
    root.innerHTML = html;
    root.scrollTop = 0;
    if (typeof after === 'function') after(root);
  }
  // S is a top-level `let` in a classic script — it lives in the shared global
  // lexical environment, NOT on `window`. Reference it bare (resolved up the
  // scope chain), never as `global.S` (which is `undefined`). This was the root
  // cause of Classroom always showing the signed-out gate.
  function appState() {
    return (typeof S !== 'undefined') ? S : null;
  }

  // Three-way auth result so we can tell "still hydrating" apart from
  // "definitively signed out". The canonical signed-in signal is S.user.id;
  // a stored Supabase session token means identity is still resolving on boot.
  function authStatus() {
    var s = appState();
    if (s && s.user && s.user.id) return 'authed';
    if (typeof getStoredSession === 'function' && getStoredSession()) return 'loading';
    return 'signedout';
  }
  function isAuthed() {
    return authStatus() === 'authed';
  }
  function back(label, fn) {
    return '<button type="button" class="cl-back" onclick="' + fn + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' +
      esc(label) + '</button>';
  }
  function loading(text) {
    return '<div class="cl-loading"><div class="cl-spinner"></div><p>' + esc(text || 'Loading…') + '</p></div>';
  }
  function errorBox(text, retryFn) {
    return '<div class="cl-error"><p>' + esc(text) + '</p>' +
      (retryFn ? '<button type="button" class="cl-btn cl-btn-ghost" onclick="' + retryFn + '">Try again</button>' : '') +
      '</div>';
  }

  // ── Entry ──────────────────────────────────────────────────────────────────
  var _authPollTimer = null;
  var _authPollTries = 0;

  function renderClassroom(view) {
    if (!D()) { mount(errorBox('Classroom is still loading. Please retry.', 'renderClassroom()')); return; }

    var status = authStatus();

    // A session token exists but identity hasn't hydrated yet (boot race).
    // Show a brief loading state and re-render once auth resolves — never flash
    // the signed-out gate at an authenticated user.
    if (status === 'loading') {
      mount('<div class="cl-screen">' +
        header('Classroom', 'Create short activities and see where your group needs support.') +
        loading('Loading your account…') + '</div>');
      _scheduleAuthPoll(view);
      return;
    }

    _clearAuthPoll();
    if (status === 'signedout') { renderSignedOut(); return; }

    if (view === 'join') { openJoin(); return; }
    var s = appState();
    var leader = s && s.finlingoMode === 'leader';
    if (leader) renderLeaderDashboard();
    else renderLearnerHome();
  }

  // Bounded retry while the session hydrates on boot (~6s max), then fall
  // through to whatever authStatus() resolves to (authed or signed-out).
  function _scheduleAuthPoll(view) {
    _clearAuthPoll();
    _authPollTries = 0;
    _authPollTimer = global.setInterval(function () {
      _authPollTries++;
      if (authStatus() !== 'loading' || _authPollTries >= 15) {
        _clearAuthPoll();
        if (ROOT()) renderClassroom(view);
      }
    }, 400);
  }
  function _clearAuthPoll() {
    if (_authPollTimer) { global.clearInterval(_authPollTimer); _authPollTimer = null; }
  }

  function renderSignedOut() {
    mount(
      '<div class="cl-screen">' +
        header('Classroom', 'Create short activities and see where your group needs support.') +
        '<div class="cl-empty">' +
          '<p>Sign in to create a group or join one with a code.</p>' +
          '<button type="button" class="cl-btn cl-btn-primary" onclick="openFinlingoAccount()">Sign in</button>' +
        '</div>' +
      '</div>'
    );
  }

  function header(title, sub) {
    return '<header class="cl-header"><h1>' + esc(title) + '</h1>' +
      (sub ? '<p>' + esc(sub) + '</p>' : '') + '</header>';
  }

  // ── Group lookup cache (so overflow-menu actions can resolve a name/code by
  //    id without re-escaping user text into inline handlers) ────────────────
  function setGroups(groups) { CR.groups = groups || []; return CR.groups; }
  function groupById(id) {
    return (CR.groups || []).filter(function (g) { return g && g.id === id; })[0] || null;
  }

  // ── Overflow ("•••") menu ───────────────────────────────────────────────────
  // items: [{ label, onclick, danger }]. onclick is a JS snippet string; ids/
  // join-codes only (never raw names) are interpolated, so no escaping hazard.
  var _menuDismissBound = false;
  function overflowMenu(id, items) {
    return '<div class="cl-menu" data-menu="' + esc(id) + '">' +
      '<button type="button" class="cl-menu-btn" aria-haspopup="true" aria-label="More actions" ' +
        'onclick="ClassroomUI.toggleMenu(\'' + esc(id) + '\', event)">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>' +
        '</svg>' +
      '</button>' +
      '<div class="cl-menu-pop" id="clMenuPop_' + esc(id) + '" role="menu">' +
        items.map(function (it) {
          return '<button type="button" role="menuitem" class="cl-menu-item' +
            (it.danger ? ' cl-menu-item-danger' : '') + '" ' +
            'onclick="ClassroomUI.closeMenus();' + it.onclick + '">' + esc(it.label) + '</button>';
        }).join('') +
      '</div>' +
    '</div>';
  }
  function toggleMenu(id, ev) {
    if (ev) { ev.stopPropagation(); ev.preventDefault(); }
    var pop = document.getElementById('clMenuPop_' + id);
    if (!pop) return;
    var wasOpen = pop.classList.contains('is-open');
    closeMenus();
    if (!wasOpen) { pop.classList.add('is-open'); _bindMenuDismiss(); }
  }
  function closeMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('.cl-menu-pop.is-open'),
      function (p) { p.classList.remove('is-open'); });
  }
  function _bindMenuDismiss() {
    if (_menuDismissBound) return;
    _menuDismissBound = true;
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.cl-menu')) closeMenus();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenus();
    });
  }

  // ── Assignment status helpers ───────────────────────────────────────────────
  // Current flow only produces 'active' (published immediately); 'draft' and
  // 'closed' are mapped too so the labels stay correct if that changes.
  function statusText(a) {
    var s = (a && a.status) || 'active';
    if (s === 'draft') return 'Draft';
    if (s === 'closed') return 'Closed';
    return 'Published';
  }
  function statusPill(a) {
    var s = (a && a.status) || 'active';
    var key = s === 'draft' ? 'draft' : (s === 'closed' ? 'closed' : 'pub');
    return '<span class="cl-status cl-status-' + key + '">' + statusText(a) + '</span>';
  }
  function summaryItem(val, label) {
    return '<div class="cl-summary-item"><div class="cl-summary-val">' + esc(String(val)) +
      '</div><div class="cl-summary-label">' + esc(label) + '</div></div>';
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEADER: dashboard
  // ════════════════════════════════════════════════════════════════════════
  function renderLeaderDashboard() {
    mount(
      '<div class="cl-screen">' +
        header('Classroom', 'Create short activities and see where your group needs support.') +
        '<div class="cl-section-title">Your groups</div>' +
        '<div id="clGroups">' + loading('Loading your groups…') + '</div>' +
      '</div>'
    );
    D().listGroups().then(function (groups) {
      setGroups(groups);
      var box = document.getElementById('clGroups');
      if (!box) return;
      if (!groups.length) { box.innerHTML = leaderEmptyState(); return; }
      box.innerHTML = groups.map(groupCard).join('') +
        '<button type="button" class="cl-btn cl-btn-primary cl-mt" onclick="ClassroomUI.openCreateGroup()">Create group</button>';
    }).catch(function () {
      var box = document.getElementById('clGroups');
      if (box) box.innerHTML = errorBox('Could not load your groups. The classroom database may not be set up yet.', 'renderClassroom()') + leaderEmptyState();
    });
  }

  function leaderEmptyState() {
    return '<div class="cl-empty">' +
      '<h2>Create your first group</h2>' +
      '<p>Assign a short Finlingo activity and see anonymous group-level learning gaps.</p>' +
      '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openCreateGroup()">Create group</button>' +
      '<button type="button" class="cl-btn cl-btn-ghost" onclick="ClassroomUI.openDemo()">Explore demo classroom</button>' +
    '</div>';
  }

  function groupCard(c) {
    var a = c.active_assignment;
    var menu = overflowMenu('card_' + c.id, [
      { label: 'Copy join code', onclick: "ClassroomUI.copyCode('" + esc(c.join_code) + "')" },
      { label: 'Edit group', onclick: "ClassroomUI.openEditGroup('" + c.id + "')" },
      { label: 'Delete group', danger: true, onclick: "ClassroomUI.confirmDeleteGroup('" + c.id + "')" }
    ]);
    return '<div class="cl-card cl-group-card">' +
      '<div class="cl-card-head">' +
        '<div class="cl-card-head-main">' +
          '<strong>' + esc(c.name) + '</strong>' +
          '<span class="cl-code-chip">' + esc(c.join_code) + '</span>' +
        '</div>' +
        menu +
      '</div>' +
      '<div class="cl-card-meta">' +
        '<span>' + (c.learner_count || 0) + ' learner' + ((c.learner_count === 1) ? '' : 's') + '</span>' +
        (a
          ? '<span>•</span><span>' + esc(a.title) + '</span><span>•</span><span>' + (c.completed_count || 0) + ' completed</span>'
          : '<span>•</span><span>No assignment yet</span>') +
      '</div>' +
      '<div class="cl-card-actions">' +
        '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openGroup(\'' + c.id + '\')">View group</button>' +
        '<button type="button" class="cl-btn cl-btn-line" onclick="ClassroomUI.openInsights(\'' + c.id + '\')">Insights</button>' +
      '</div>' +
    '</div>';
  }

  // Group detail: summary row, compact join code, status, CTAs, overflow menu.
  function openGroup(id) {
    mount(loading('Opening group…'));
    D().listGroups().then(function (groups) {
      setGroups(groups);
      var c = groupById(id);
      if (!c) { renderLeaderDashboard(); return; }
      var a = c.active_assignment;
      var menu = overflowMenu('grp_' + c.id, [
        { label: 'Edit group', onclick: "ClassroomUI.openEditGroup('" + c.id + "')" },
        { label: 'Copy join code', onclick: "ClassroomUI.copyCode('" + esc(c.join_code) + "')" },
        { label: 'Delete group', danger: true, onclick: "ClassroomUI.confirmDeleteGroup('" + c.id + "')" }
      ]);
      mount(
        '<div class="cl-screen">' +
          back('Classroom', 'renderClassroom()') +
          '<div class="cl-detail-head">' +
            '<div class="cl-detail-head-main">' +
              '<h1>' + esc(c.name) + '</h1>' +
              (c.description ? '<p>' + esc(c.description) + '</p>' : '') +
            '</div>' +
            menu +
          '</div>' +
          '<div class="cl-summary">' +
            summaryItem(c.learner_count || 0, 'Learners') +
            summaryItem(a ? statusText(a) : 'None', 'Active assignment') +
            summaryItem(a ? (c.completed_count || 0) : 0, 'Completed') +
          '</div>' +
          '<div class="cl-card cl-code-card cl-code-card-sm">' +
            '<div class="cl-code-inline">' +
              '<div><div class="cl-code-label">Join code</div>' +
                '<div class="cl-code-mid">' + esc(c.join_code) + '</div></div>' +
              '<button type="button" class="cl-btn cl-btn-line cl-btn-compact" onclick="ClassroomUI.copyCode(\'' + esc(c.join_code) + '\')">Copy</button>' +
            '</div>' +
          '</div>' +
          '<div class="cl-assign-line">' +
            (a
              ? '<span class="cl-assign-title">' + esc(a.title) + '</span>' + statusPill(a)
              : '<span class="cl-muted">No active assignment yet.</span>') +
          '</div>' +
          '<div class="cl-stack cl-mt">' +
            '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openCreateAssignment(\'' + c.id + '\')">Create assignment</button>' +
            (a ? '<button type="button" class="cl-btn cl-btn-line" onclick="ClassroomUI.openInsights(\'' + c.id + '\')">View insights</button>' : '') +
          '</div>' +
        '</div>'
      );
    }).catch(function () { renderLeaderDashboard(); });
  }

  // ── Edit group ──────────────────────────────────────────────────────────────
  function openEditGroup(id) {
    var c = groupById(id);
    if (c) { editGroupForm(c); return; }
    mount(loading('Opening…'));
    D().listGroups().then(function (groups) {
      setGroups(groups);
      var g = groupById(id);
      if (g) editGroupForm(g); else renderLeaderDashboard();
    }).catch(function () { renderLeaderDashboard(); });
  }
  function editGroupForm(c) {
    var audiences = D().AUDIENCE_TYPES.map(function (a) {
      return '<option value="' + a.id + '"' + (a.id === c.audience_type ? ' selected' : '') + '>' + esc(a.label) + '</option>';
    }).join('');
    mount(
      '<div class="cl-screen">' +
        back('Group', 'ClassroomUI.openGroup(\'' + c.id + '\')') +
        header('Edit group', 'Update the group name and details.') +
        '<form class="cl-form" onsubmit="return false;">' +
          field('Group name', '<input class="cl-input" id="clEditName" type="text" maxlength="80" value="' + esc(c.name) + '" required>') +
          field('Description (optional)', '<textarea class="cl-input" id="clEditDesc" maxlength="400" rows="2">' + esc(c.description || '') + '</textarea>') +
          field('Audience type', '<select class="cl-input" id="clEditAudience">' + audiences + '</select>') +
          '<button type="button" class="cl-btn cl-btn-primary cl-mt" id="clEditBtn" onclick="ClassroomUI.submitEditGroup(\'' + c.id + '\')">Save changes</button>' +
        '</form>' +
      '</div>',
      function () { var el = document.getElementById('clEditName'); if (el) el.focus(); }
    );
  }
  function submitEditGroup(id) {
    var name = (document.getElementById('clEditName') || {}).value || '';
    if (!name.trim()) { toast('Group name can’t be empty', 'error'); return; }
    var desc = (document.getElementById('clEditDesc') || {}).value || '';
    var audience = (document.getElementById('clEditAudience') || {}).value || 'other';
    var btn = document.getElementById('clEditBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    D().updateGroup(id, { name: name, description: desc, audience: audience }).then(function () {
      toast('Group updated', 'success');
      return D().listGroups().then(function (groups) { setGroups(groups); openGroup(id); });
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
      toast((err && err.message) || 'Could not update the group.', 'error');
    });
  }

  // ── Delete group (leader-only, confirmed, server-enforced) ──────────────────
  function confirmDeleteGroup(id) {
    var c = groupById(id);
    var name = (c && c.name) ? c.name : 'this group';
    if (typeof global.showAppModal !== 'function') {
      if (global.confirm && global.confirm('Delete ' + name + '? This cannot be undone.')) performDeleteGroup(id);
      return;
    }
    global.showAppModal({
      icon: 'danger',
      title: 'Delete ' + name + '?',
      body: 'This permanently deletes the group, assignments, learner memberships, attempts, responses, and insights. This cannot be undone.',
      actions: [
        { label: 'Cancel', cls: 'modal-cancel', fn: global.closeAppModal },
        { label: 'Delete group', cls: 'btn btn-danger', fn: function () { performDeleteGroup(id); } }
      ]
    });
  }
  function performDeleteGroup(id) {
    var actionsEl = document.getElementById('modalActions');
    var btns = actionsEl ? actionsEl.querySelectorAll('button') : [];
    var delBtn = btns.length ? btns[btns.length - 1] : null;
    Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
    if (delBtn) delBtn.textContent = 'Deleting…';
    D().deleteGroup(id).then(function () {
      if (typeof global.closeAppModal === 'function') global.closeAppModal();
      CR.groups = (CR.groups || []).filter(function (g) { return g.id !== id; });
      toast('Group deleted', 'success');
      if (global.NavDrawer && NavDrawer.refresh) NavDrawer.refresh();
      renderLeaderDashboard();
    }).catch(function (err) {
      Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
      if (delBtn) delBtn.textContent = 'Delete group';
      var bodyEl = document.getElementById('modalBody');
      if (bodyEl) {
        var e = bodyEl.querySelector('.app-modal-inline-error');
        if (!e) { e = document.createElement('p'); e.className = 'app-modal-inline-error'; bodyEl.appendChild(e); }
        e.textContent = (err && err.message) || 'Could not delete the group. Please try again.';
      }
    });
  }

  function copyCode(code) {
    if (global.navigator && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(function () { toast('Join code copied', 'success'); })
        .catch(function () { toast('Copy failed — code is ' + code, 'error'); });
    } else { toast('Join code: ' + code, 'info'); }
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEADER: create group
  // ════════════════════════════════════════════════════════════════════════
  function openCreateGroup() {
    var audiences = D().AUDIENCE_TYPES.map(function (a) {
      return '<option value="' + a.id + '">' + esc(a.label) + '</option>';
    }).join('');
    mount(
      '<div class="cl-screen">' +
        back('Classroom', 'renderClassroom()') +
        header('Create group', 'Set up a group and share its join code.') +
        '<form class="cl-form" id="clCreateForm" onsubmit="return false;">' +
          field('Group name', '<input class="cl-input" id="clGroupName" type="text" maxlength="80" placeholder="First-Generation Finance Workshop" required>') +
          field('Description (optional)', '<textarea class="cl-input" id="clGroupDesc" maxlength="400" rows="2" placeholder="What is this group about?"></textarea>') +
          field('Audience type', '<select class="cl-input" id="clGroupAudience">' + audiences + '</select>') +
          '<button type="button" class="cl-btn cl-btn-primary cl-mt" id="clCreateBtn" onclick="ClassroomUI.submitCreateGroup()">Create group</button>' +
        '</form>' +
      '</div>',
      function () { var el = document.getElementById('clGroupName'); if (el) el.focus(); }
    );
  }

  function submitCreateGroup() {
    var name = (document.getElementById('clGroupName') || {}).value || '';
    if (!name.trim()) { toast('Give your group a name', 'error'); return; }
    var desc = (document.getElementById('clGroupDesc') || {}).value || '';
    var audience = (document.getElementById('clGroupAudience') || {}).value || 'other';
    var btn = document.getElementById('clCreateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    D().createGroup({ name: name, description: desc, audience: audience }).then(function (c) {
      groupCreatedScreen(c);
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Create group'; }
      toast(err && err.message ? err.message : 'Could not create the group. Is the classroom database set up?', 'error');
    });
  }

  function groupCreatedScreen(c) {
    mount(
      '<div class="cl-screen cl-center">' +
        '<div class="cl-success-badge">✓</div>' +
        '<h1 class="cl-success-title">Your group is ready</h1>' +
        '<p class="cl-success-sub">' + esc(c.name) + '</p>' +
        '<div class="cl-card cl-code-card">' +
          '<div class="cl-code-label">Join code</div>' +
          '<div class="cl-code-big">' + esc(c.join_code) + '</div>' +
        '</div>' +
        '<div class="cl-stack cl-mt">' +
          '<button type="button" class="cl-btn cl-btn-line" onclick="ClassroomUI.copyCode(\'' + esc(c.join_code) + '\')">Copy join code</button>' +
          '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openCreateAssignment(\'' + c.id + '\')">Create assignment</button>' +
          '<button type="button" class="cl-btn cl-btn-ghost" onclick="renderClassroom()">Return to Classroom</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEADER: create assignment
  // ════════════════════════════════════════════════════════════════════════
  function openCreateAssignment(classroomId) {
    CR.titleEdited = false;
    var firstTopic = D().TOPICS[0];
    var suggested = D().suggestAssignmentTitle(firstTopic);
    var topics = D().TOPICS.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('');
    var diffs = D().DIFFICULTIES.map(function (d) { return '<option value="' + d.id + '">' + esc(d.label) + '</option>'; }).join('');
    mount(
      '<div class="cl-screen">' +
        back('Group', 'ClassroomUI.openGroup(\'' + classroomId + '\')') +
        header('Create assignment', 'A five-question concept challenge.') +
        '<form class="cl-form cl-form-spaced" onsubmit="return false;">' +
          '<div class="cl-form-group">' +
            field('Topic', '<select class="cl-input" id="clAsgTopic">' + topics + '</select>') +
            field('Assignment title', '<input class="cl-input" id="clAsgTitle" type="text" maxlength="120" value="' + esc(suggested) + '" placeholder="' + esc(suggested) + '">') +
            field('Difficulty', '<select class="cl-input" id="clAsgDiff">' + diffs + '</select>') +
            field('Due date (optional)', '<input class="cl-input" id="clAsgDue" type="date">') +
          '</div>' +
          '<div class="cl-form-group">' +
            '<button type="button" class="cl-toggle-row is-on" id="clAsgTeachRow" aria-pressed="true" onclick="ClassroomUI.toggleTeach()">' +
              '<span class="cl-toggle-text">Include a teach-it-back question</span>' +
              '<span class="cl-toggle-switch" aria-hidden="true"></span>' +
            '</button>' +
            '<input type="hidden" id="clAsgTeach" value="1">' +
          '</div>' +
          '<div class="cl-form-group">' +
            '<div class="cl-section-title">Question source</div>' +
            '<div class="cl-stack">' +
              '<button type="button" class="cl-btn cl-btn-line" id="clPresetBtn" onclick="ClassroomUI.buildAssignment(\'' + classroomId + '\',\'preset\')">Use preset questions</button>' +
              '<button type="button" class="cl-btn cl-btn-primary" id="clGenBtn" onclick="ClassroomUI.buildAssignment(\'' + classroomId + '\',\'claude\')">Generate with Claude</button>' +
            '</div>' +
          '</div>' +
        '</form>' +
      '</div>',
      function () {
        var topicSel = document.getElementById('clAsgTopic');
        var titleInp = document.getElementById('clAsgTitle');
        // Mark the title as user-owned once they type into it (non-empty), so an
        // auto-suggestion never clobbers a manually edited title.
        if (titleInp) titleInp.addEventListener('input', function () {
          CR.titleEdited = titleInp.value.trim() !== '';
        });
        if (topicSel) topicSel.addEventListener('change', function () {
          if (!CR.titleEdited && titleInp) titleInp.value = D().suggestAssignmentTitle(topicSel.value);
        });
      }
    );
  }

  function toggleTeach() {
    var row = document.getElementById('clAsgTeachRow');
    var hidden = document.getElementById('clAsgTeach');
    if (!row || !hidden) return;
    var on = hidden.value !== '1';
    hidden.value = on ? '1' : '0';
    row.classList.toggle('is-on', on);
    row.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  // Generating state: spinner + progressively-animated status lines + honest
  // "few seconds" hint. No fake percentages.
  function generatingScreen() {
    return '<div class="cl-screen cl-center cl-generating">' +
      '<div class="cl-spinner cl-spinner-lg"></div>' +
      '<h2 class="cl-gen-title">Claude is building your five-question activity</h2>' +
      '<ul class="cl-gen-steps">' +
        '<li class="cl-gen-step"><span class="cl-gen-dot"></span>Creating concept coverage</li>' +
        '<li class="cl-gen-step"><span class="cl-gen-dot"></span>Checking answer quality</li>' +
        '<li class="cl-gen-step"><span class="cl-gen-dot"></span>Preparing the teach-it-back question</li>' +
      '</ul>' +
      '<p class="cl-gen-note">This usually takes a few seconds.</p>' +
    '</div>';
  }

  function buildAssignment(classroomId, mode) {
    var title = (document.getElementById('clAsgTitle') || {}).value || '';
    var topic = (document.getElementById('clAsgTopic') || {}).value || D().TOPICS[0];
    var diff = (document.getElementById('clAsgDiff') || {}).value || 'beginner';
    var due = (document.getElementById('clAsgDue') || {}).value || '';
    var teach = (document.getElementById('clAsgTeach') || {}).value === '1';
    var ctx = { classroomId: classroomId, title: title, due: due };

    if (mode === 'preset') {
      var unit = D().presetUnitFor(topic, diff);
      if (!unit) { toast('No preset for that topic — try Generate with Claude.', 'error'); return; }
      if (!teach) unit.questions = unit.questions.filter(function (q) { return q.type !== 'teachback'; });
      unit.teachItBack = unit.questions.some(function (q) { return q.type === 'teachback'; });
      if (title.trim()) unit.title = title.trim();
      assignmentPreview(unit, ctx);
      return;
    }
    // Claude
    mount(generatingScreen());
    D().classroomAI('generate_assignment', {
      topic: topic, difficulty: diff, teachItBack: teach
    }).then(function (res) {
      var unit = res.assignment;
      if (title.trim()) unit.title = title.trim();
      assignmentPreview(unit, ctx);
    }).catch(function (err) {
      mount(
        '<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
        errorBox((err && err.message) || 'Claude could not build the assignment.',
          'ClassroomUI.openCreateAssignment(\'' + classroomId + '\')') +
        '<button type="button" class="cl-btn cl-btn-ghost cl-mt" onclick="ClassroomUI.openCreateAssignment(\'' + classroomId + '\')">Use a preset instead</button>' +
        '</div>'
      );
    });
  }

  function previewQ(q, i) {
    var typeLabel = q.type === 'teachback' ? 'Teach it back' : 'Multiple choice';
    return '<div class="cl-preview-q">' +
      '<span class="cl-q-num">' + (i + 1) + '</span>' +
      '<div class="cl-q-body">' +
        '<div class="cl-q-tags">' +
          '<span class="cl-q-type">' + typeLabel + '</span>' +
          (q.skill ? '<span class="cl-q-skill">' + esc(q.skill) + '</span>' : '') +
        '</div>' +
        '<div class="cl-q-prompt">' + esc(q.prompt) + '</div>' +
      '</div>' +
    '</div>';
  }

  function assignmentPreview(unit, ctx) {
    CR.pendingUnit = unit; CR.pendingCtx = ctx;
    var mcqCount = unit.questions.filter(function (q) { return q.type === 'mcq'; }).length;
    var teachCount = unit.questions.filter(function (q) { return q.type === 'teachback'; }).length;
    mount(
      '<div class="cl-screen cl-preview-screen">' +
        back('Edit', 'ClassroomUI.openCreateAssignment(\'' + ctx.classroomId + '\')') +
        '<div class="cl-kicker">Assignment preview</div>' +
        '<h1 class="cl-preview-title">' + esc(unit.title) + '</h1>' +
        '<div class="cl-card-meta"><span>' + esc(unit.topic) + '</span><span>•</span><span>' + esc(unit.difficulty) + '</span>' +
          '<span>•</span><span>' + mcqCount + ' questions</span>' +
          (teachCount ? '<span>•</span><span>1 teach-it-back</span>' : '') + '</div>' +
        '<div class="cl-preview-list cl-mt">' +
          unit.questions.map(previewQ).join('') +
        '</div>' +
        '<div class="cl-preview-actions">' +
          '<button type="button" class="cl-btn cl-btn-line" onclick="ClassroomUI.openCreateAssignment(\'' + ctx.classroomId + '\')">Edit</button>' +
          '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.confirmAssignment()">Publish assignment</button>' +
        '</div>' +
      '</div>'
    );
  }

  function confirmAssignment() {
    var unit = CR.pendingUnit, ctx = CR.pendingCtx;
    if (!unit || !ctx) { renderClassroom(); return; }
    mount(loading('Publishing assignment…'));
    D().createAssignment(ctx.classroomId, unit, ctx.due || null).then(function () {
      toast('Assignment published', 'success');
      var title = unit.title;
      CR.pendingUnit = null; CR.pendingCtx = null;
      publishedScreen(ctx.classroomId, title);
    }).catch(function (err) {
      toast((err && err.message) || 'Could not publish. Please try again.', 'error');
      assignmentPreview(unit, ctx);
    });
  }

  // Inline published-success state (not toast-dependent): banner near the top
  // with Copy join code + View group.
  function publishedScreen(classroomId, title) {
    var render = function (code) {
      mount(
        '<div class="cl-screen">' +
          back('Classroom', 'renderClassroom()') +
          '<div class="cl-banner cl-banner-success">' +
            '<div class="cl-banner-icon">✓</div>' +
            '<div class="cl-banner-text">' +
              '<strong>Assignment published</strong>' +
              '<span>Learners can now complete ' + esc(title) + '.</span>' +
            '</div>' +
          '</div>' +
          '<div class="cl-stack cl-mt">' +
            (code ? '<button type="button" class="cl-btn cl-btn-line" onclick="ClassroomUI.copyCode(\'' + esc(code) + '\')">Copy join code</button>' : '') +
            '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openGroup(\'' + classroomId + '\')">View group</button>' +
          '</div>' +
        '</div>'
      );
    };
    var c = groupById(classroomId);
    if (c) { render(c.join_code); return; }
    D().listGroups().then(function (groups) {
      setGroups(groups);
      var g = groupById(classroomId);
      render(g ? g.join_code : '');
    }).catch(function () { render(''); });
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEADER: group insights
  // ════════════════════════════════════════════════════════════════════════
  function openInsights(classroomId) {
    mount(loading('Loading group insights…'));
    var groupName = '';
    D().listGroups().then(function (groups) {
      setGroups(groups);
      var c = groupById(classroomId);
      groupName = c ? c.name : 'Group';
      if (!c || !c.active_assignment) {
        mount('<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
          header('Group insights', groupName) +
          '<div class="cl-empty"><p>No active assignment yet. Create one to start collecting responses.</p>' +
          '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openCreateAssignment(\'' + classroomId + '\')">Create assignment</button></div></div>');
        return;
      }
      var assignment = c.active_assignment;
      var joinCode = c.join_code || '';
      return D().aggregate(assignment.id).then(function (agg) {
        renderInsights(groupName, assignment, agg, classroomId, false, joinCode);
      });
    }).catch(function (err) {
      mount('<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
        errorBox((err && err.message) || 'Could not load insights.', 'ClassroomUI.openInsights(\'' + classroomId + '\')') + '</div>');
    });
  }

  // Shared by live insights and the demo (demo passes isDemo=true + seeded data).
  function renderInsights(groupName, assignment, agg, classroomId, isDemo, joinCode) {
    var content = assignment.content || {};
    var concepts = D().conceptRows(agg);
    var learners = Number(agg.learners) || 0;
    var completedCount = Number(agg.completed) || 0;
    var totalGraded = D().totalGradedResponses(agg);
    var completion = learners ? Math.round((agg.completed / agg.learners) * 100) : 0;
    var avgAcc = Math.round((agg.avg_accuracy || 0) * 100);
    var meets = D().meetsInsightThreshold(agg);
    var strongest = concepts.length ? concepts[0] : null;
    var weakest = concepts.length ? concepts[concepts.length - 1] : null;

    var thresholdMsg = 'More responses are needed before Finlingo can identify a reliable group pattern.';

    // Empty state: no learners AND no responses yet — show a light prompt with
    // the join code instead of four large zero-stat cards.
    var hasData = learners > 0 || totalGraded > 0 || completedCount > 0;
    if (!hasData) {
      mount('<div class="cl-screen">' +
        back('Classroom', 'renderClassroom()') +
        (isDemo ? '<div class="cl-demo-tag">Demo data</div>' : '') +
        header('Group insights', groupName) +
        '<div class="cl-empty">' +
          '<h2>No responses yet</h2>' +
          '<p>Share the join code so learners can complete the activity.</p>' +
          (joinCode
            ? '<div class="cl-card cl-code-card cl-code-card-sm"><div class="cl-code-inline">' +
                '<div><div class="cl-code-label">Join code</div><div class="cl-code-mid">' + esc(joinCode) + '</div></div>' +
                '<button type="button" class="cl-btn cl-btn-line cl-btn-compact" onclick="ClassroomUI.copyCode(\'' + esc(joinCode) + '\')">Copy</button>' +
              '</div></div>'
            : '') +
        '</div>' +
        '<div class="cl-threshold cl-mt">' + esc(thresholdMsg) + '</div>' +
      '</div>');
      return;
    }

    var html = '<div class="cl-screen">' +
      back('Classroom', 'renderClassroom()') +
      (isDemo ? '<div class="cl-demo-tag">Demo data</div>' : '') +
      header('Group insights', groupName) +
      '<div class="cl-stat-grid">' +
        statCard(agg.learners || 0, 'Learners') +
        statCard(completion + '%', 'Completion rate') +
        statCard(avgAcc + '%', 'Average accuracy') +
        statCard(agg.completed || 0, 'Completed') +
      '</div>' +
      '<div class="cl-section-title cl-mt">Concept understanding</div>' +
      (concepts.length ? concepts.map(conceptRow).join('')
        : '<p class="cl-muted">No graded responses yet.</p>') +
      (strongest && weakest && concepts.length ? (
        '<div class="cl-callouts cl-mt">' +
          calloutCard('Strongest concept', strongest.skill, 'up') +
          calloutCard('Needs support', weakest.skill, 'down') +
        '</div>') : '') +
      '<div id="clInsightAI" class="cl-mt">' +
        (meets ? loading('Asking Claude to read the group pattern…')
          : '<div class="cl-threshold">More responses are needed before Finlingo can identify a reliable group pattern.</div>') +
      '</div>' +
    '</div>';
    mount(html);

    if (!meets) return;

    // Claude group insight (anonymized aggregate only).
    var aiBox = document.getElementById('clInsightAI');
    var insightPromise = isDemo && agg._demoInsight
      ? Promise.resolve(agg._demoInsight)
      : D().classroomAI('group_insight', {
          topic: content.topic || assignment.topic,
          objectives: content.objectives || [],
          responseCount: D().totalGradedResponses(agg),
          skillStats: agg.skill_stats || [],
          choiceDistribution: agg.choice_distribution || [],
          teachbackExcerpts: agg.teachback_excerpts || [],
          correctExplanations: (content.questions || [])
            .filter(function (q) { return q.explanation; })
            .map(function (q) { return q.explanation; })
        }).then(function (r) { return r.insight; });

    insightPromise.then(function (ins) {
      if (!aiBox) return;
      CR.lastGap = ins.primaryGap;
      CR.lastTopic = content.topic || assignment.topic;
      CR.lastObjectives = content.objectives || [];
      CR.insightClassroom = classroomId;
      var misconception = deriveMisconception(agg, content);
      aiBox.innerHTML =
        '<div class="cl-insight-card">' +
          '<div class="cl-insight-head">Claude’s group insight <span class="cl-conf cl-conf-' + esc(ins.confidence) + '">' + esc(ins.confidence) + ' confidence</span></div>' +
          '<p class="cl-insight-summary">' + esc(ins.summary) + '</p>' +
          '<div class="cl-insight-row"><span>Primary gap</span><p>' + esc(ins.primaryGap) + '</p></div>' +
          (misconception ? '<div class="cl-insight-row"><span>Most common misconception</span><p>' + esc(misconception) + '</p></div>' : '') +
          '<div class="cl-insight-row"><span>Recommended focus</span><p>' + esc(ins.recommendedFocus) + '</p></div>' +
          '<div class="cl-insight-note">Based on anonymous group responses.</div>' +
        '</div>' +
        '<button type="button" class="cl-btn cl-btn-primary cl-mt" onclick="ClassroomUI.buildFollowup(' + (isDemo ? 'true' : 'false') + ')">Build follow-up activity</button>';
    }).catch(function () {
      if (aiBox) aiBox.innerHTML = errorBox('Claude could not summarize the group right now.',
        isDemo ? 'ClassroomUI.openDemo()' : 'ClassroomUI.openInsights(\'' + classroomId + '\')');
    });
  }

  // Most-chosen WRONG answer across the assignment, mapped to readable text.
  // Returns null unless a clear wrong answer has at least 2 supporting picks.
  function deriveMisconception(agg, content) {
    var dist = agg.choice_distribution || [];
    var qById = {};
    (content.questions || []).forEach(function (q) { qById[q.id] = q; });
    var best = null;
    dist.forEach(function (d) {
      if (d.choice_correct) return;
      var n = Number(d.n) || 0;
      if (n < 2) return;
      if (!best || n > best.n) best = { qid: d.question_id, choice: d.choice, n: n };
    });
    if (!best) return null;
    var q = qById[best.qid];
    if (!q || !q.choices || q.choices[best.choice] == null) return null;
    var prompt = q.prompt.length > 70 ? q.prompt.slice(0, 67) + '…' : q.prompt;
    return '“' + q.choices[best.choice] + '” — chosen by ' + best.n + ' learners on “' + prompt + '”';
  }

  function statCard(val, label) {
    return '<div class="cl-stat"><div class="cl-stat-val">' + esc(String(val)) + '</div><div class="cl-stat-label">' + esc(label) + '</div></div>';
  }
  function conceptRow(c) {
    var tone = c.pct >= 67 ? 'good' : (c.pct >= 45 ? 'mid' : 'low');
    return '<div class="cl-concept">' +
      '<div class="cl-concept-top"><span>' + esc(c.skill) + '</span><strong>' + c.pct + '%</strong></div>' +
      '<div class="cl-bar"><div class="cl-bar-fill cl-bar-' + tone + '" style="width:' + c.pct + '%"></div></div>' +
    '</div>';
  }
  function calloutCard(label, value, dir) {
    return '<div class="cl-callout cl-callout-' + dir + '"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong></div>';
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEADER: follow-up activity
  // ════════════════════════════════════════════════════════════════════════
  function buildFollowup(isDemo) {
    var box = document.getElementById('clInsightAI');
    if (box) box.insertAdjacentHTML('beforeend', '<div id="clFollowLoading" class="cl-mt">' + loading('Claude is building a targeted follow-up…') + '</div>');
    var demo = isDemo ? D().buildDemo() : null;

    var p = D().classroomAI('followup_activity', {
      topic: CR.lastTopic || (demo && demo.followup.topic) || 'this topic',
      gap: CR.lastGap || (demo && demo.insight.primaryGap) || '',
      objectives: CR.lastObjectives || []
    }).then(function (r) { return r.activity; }).catch(function (err) {
      if (isDemo && demo) return demo.followup; // graceful offline fallback for demo
      throw err;
    });

    p.then(function (activity) {
      followupPreview(activity, isDemo);
    }).catch(function (err) {
      var l = document.getElementById('clFollowLoading');
      if (l) l.innerHTML = errorBox((err && err.message) || 'Could not build the follow-up.', '');
    });
  }

  function followupPreview(activity, isDemo) {
    CR.pendingFollowup = activity;
    var mcq = activity.questions.filter(function (q) { return q.type === 'mcq'; }).length;
    var teach = activity.questions.filter(function (q) { return q.type === 'teachback'; }).length;
    mount(
      '<div class="cl-screen">' +
        back('Insights', isDemo ? 'ClassroomUI.openDemo()' : 'ClassroomUI.openInsights(\'' + (CR.insightClassroom || '') + '\')') +
        (isDemo ? '<div class="cl-demo-tag">Demo data</div>' : '') +
        '<div class="cl-kicker">Recommended follow-up</div>' +
        '<h1 class="cl-preview-title" id="clFollowTitle">' + esc(activity.title) + '</h1>' +
        (activity.explanation ? '<div class="cl-card cl-explain"><p>' + esc(activity.explanation) + '</p></div>' : '') +
        '<div class="cl-card-meta cl-mt"><span>2-minute explanation</span><span>•</span><span>' + mcq + ' questions</span>' +
          (teach ? '<span>•</span><span>1 teach-it-back prompt</span>' : '') + '</div>' +
        (activity.chartPrompt ? '<div class="cl-card cl-mt cl-chart-note"><span>Chart check</span><p>' + esc(activity.chartPrompt) + '</p></div>' : '') +
        '<div class="cl-stack cl-mt">' +
          (isDemo
            ? '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.demoAssignNotice()">Assign to group</button>'
            : '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.assignFollowup()">Assign to group</button>') +
          '<button type="button" class="cl-btn cl-btn-line" onclick="ClassroomUI.editFollowupTitle()">Edit title</button>' +
          '<button type="button" class="cl-btn cl-btn-ghost" onclick="' + (isDemo ? 'ClassroomUI.openDemo()' : 'ClassroomUI.openInsights(\'' + (CR.insightClassroom || '') + '\')') + '">Cancel</button>' +
        '</div>' +
      '</div>'
    );
  }

  function editFollowupTitle() {
    var el = document.getElementById('clFollowTitle');
    if (!el || !CR.pendingFollowup) return;
    var current = CR.pendingFollowup.title;
    var next = global.prompt ? global.prompt('Activity title', current) : current;
    if (next && next.trim()) { CR.pendingFollowup.title = next.trim().slice(0, 120); el.textContent = CR.pendingFollowup.title; }
  }

  function assignFollowup() {
    var activity = CR.pendingFollowup, classroomId = CR.insightClassroom;
    if (!activity || !classroomId) { renderClassroom(); return; }
    mount(loading('Assigning follow-up…'));
    D().createAssignment(classroomId, activity, null).then(function () {
      toast('Follow-up assigned', 'success');
      openGroup(classroomId);
    }).catch(function (err) {
      toast((err && err.message) || 'Could not assign. Please try again.', 'error');
      followupPreview(activity, false);
    });
  }

  function demoAssignNotice() {
    toast('In a live group this would publish the follow-up. (Demo data is read-only.)', 'info');
  }

  // ════════════════════════════════════════════════════════════════════════
  // DEMO classroom
  // ════════════════════════════════════════════════════════════════════════
  function openDemo() {
    var demo = D().buildDemo();
    var agg = Object.assign({}, demo.aggregate, { _demoInsight: demo.insight });
    renderInsights(demo.classroom.name, demo.assignment, agg, 'demo', true);
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEARNER: home + join
  // ════════════════════════════════════════════════════════════════════════
  function renderLearnerHome() {
    mount('<div class="cl-screen">' + header('Classroom', 'Your groups and assignments.') +
      '<div id="clLearnerGroups">' + loading('Loading your classrooms…') + '</div></div>');
    D().myMemberships().then(function (rows) {
      var box = document.getElementById('clLearnerGroups');
      if (!box) return;
      if (!rows.length) {
        box.innerHTML = '<div class="cl-empty"><h2>Join a classroom</h2>' +
          '<p>Enter the code your program leader gave you.</p>' +
          '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openJoin()">Join a classroom</button></div>';
        return;
      }
      box.innerHTML = rows.map(function (m) {
        var c = m.classrooms || {};
        return '<div class="cl-card"><div class="cl-card-head"><strong>' + esc(c.name || 'Classroom') + '</strong></div>' +
          (c.description ? '<p class="cl-muted">' + esc(c.description) + '</p>' : '') +
          '<div class="cl-card-actions"><button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openLearnerAssignment(\'' + c.id + '\')">Open</button></div></div>';
      }).join('') +
      '<button type="button" class="cl-btn cl-btn-ghost cl-mt" onclick="ClassroomUI.openJoin()">Join another classroom</button>';
    }).catch(function () {
      var box = document.getElementById('clLearnerGroups');
      if (box) box.innerHTML = '<div class="cl-empty"><button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openJoin()">Join a classroom</button></div>';
    });
  }

  function openJoin() {
    mount(
      '<div class="cl-screen">' +
        back('Classroom', 'renderClassroom()') +
        header('Join a classroom', 'Enter your join code to get started.') +
        '<form class="cl-form" onsubmit="return false;">' +
          field('Join code', '<input class="cl-input cl-input-code" id="clJoinCode" type="text" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="MONEY24">') +
          field('First name or nickname', '<input class="cl-input" id="clJoinName" type="text" maxlength="40" placeholder="Alex">') +
          '<button type="button" class="cl-btn cl-btn-primary cl-mt" id="clJoinBtn" onclick="ClassroomUI.submitJoin()">Join</button>' +
        '</form>' +
      '</div>',
      function () {
        var el = document.getElementById('clJoinCode');
        if (el) { el.focus(); el.addEventListener('input', function () { el.value = el.value.toUpperCase(); }); }
      }
    );
  }

  function submitJoin() {
    var code = (document.getElementById('clJoinCode') || {}).value || '';
    var name = (document.getElementById('clJoinName') || {}).value || '';
    if (!code.trim()) { toast('Enter your join code', 'error'); return; }
    var btn = document.getElementById('clJoinBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
    D().joinGroup(code.trim(), name.trim()).then(function (res) {
      if (global.NavDrawer && NavDrawer.refresh) NavDrawer.refresh();
      joinedScreen(res.classroom);
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Join'; }
      toast((err && err.message) || 'Could not join. Check your code.', 'error');
    });
  }

  function joinedScreen(classroom) {
    mount(loading('Loading your assignment…'));
    D().getActiveAssignment(classroom.id).then(function (assignment) {
      var content = assignment ? (assignment.content || {}) : null;
      var qCount = content ? (content.questions || []).length : 0;
      mount(
        '<div class="cl-screen cl-center">' +
          '<div class="cl-success-badge">✓</div>' +
          '<h1 class="cl-success-title">You joined ' + esc(classroom.name) + '</h1>' +
          (assignment ? (
            '<div class="cl-card cl-mt">' +
              '<div class="cl-kicker">Current assignment</div>' +
              '<div class="cl-q-prompt">' + esc(assignment.title) + '</div>' +
              '<div class="cl-card-meta"><span>' + qCount + ' questions</span><span>•</span><span>About 3 minutes</span></div>' +
            '</div>' +
            '<button type="button" class="cl-btn cl-btn-primary cl-mt" onclick="ClassroomUI.openLearnerAssignment(\'' + classroom.id + '\')">Start assignment</button>'
          ) : '<p class="cl-muted cl-mt">No assignment yet. Check back soon.</p>') +
          '<button type="button" class="cl-btn cl-btn-ghost cl-mt" onclick="renderClassroom()">Go to Classroom</button>' +
        '</div>'
      );
    }).catch(function () {
      mount('<div class="cl-screen cl-center"><h1 class="cl-success-title">You joined ' + esc(classroom.name) + '</h1>' +
        '<button type="button" class="cl-btn cl-btn-ghost cl-mt" onclick="renderClassroom()">Go to Classroom</button></div>');
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEARNER: assignment player (reuses .ml-* quiz styling)
  // ════════════════════════════════════════════════════════════════════════
  function openLearnerAssignment(classroomId) {
    mount(loading('Loading assignment…'));
    var assignment;
    D().getActiveAssignment(classroomId).then(function (a) {
      assignment = a;
      if (!assignment) {
        mount('<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
          '<div class="cl-empty"><p>No active assignment in this group yet.</p></div></div>');
        return null;
      }
      return D().getMemberId(classroomId);
    }).then(function (memberId) {
      if (!assignment) return;
      if (!memberId) { toast('You are not a member of this group.', 'error'); renderClassroom(); return; }
      return D().startAttempt(assignment, memberId, classroomId).then(function (attempt) {
        CR.player = {
          classroomId: classroomId, assignment: assignment, attempt: attempt,
          questions: (assignment.content || {}).questions || [],
          content: assignment.content || {},
          idx: 0, score: 0, graded: 0, answered: false
        };
        renderQuestion();
      });
    }).catch(function (err) {
      mount('<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
        errorBox((err && err.message) || 'Could not start the assignment.', 'ClassroomUI.openLearnerAssignment(\'' + classroomId + '\')') + '</div>');
    });
  }

  function renderQuestion() {
    var p = CR.player;
    if (!p) { renderClassroom(); return; }
    if (p.idx >= p.questions.length) { finishAssignment(); return; }
    var q = p.questions[p.idx];
    var pct = Math.round((p.idx / p.questions.length) * 100);
    p.answered = false; p.selected = null;

    var body;
    if (q.type === 'teachback') {
      body = '<textarea class="cl-input cl-teach" id="clTeach" rows="5" placeholder="Explain in your own words…"></textarea>';
    } else {
      body = '<div class="ml-choices" id="clChoices">' + q.choices.map(function (choice, i) {
        return '<button type="button" class="ml-choice" data-i="' + i + '">' +
          '<span class="ml-choice-letter">' + 'ABCD'[i] + '</span>' +
          '<span class="ml-choice-text">' + esc(choice) + '</span>' +
          '<span class="ml-choice-mark"></span></button>';
      }).join('') + '</div>';
    }

    mount(
      '<div class="cl-screen cl-player">' +
        '<div class="cl-player-top">' +
          '<button type="button" class="cl-back-x" onclick="ClassroomUI.exitPlayer()" aria-label="Exit">✕</button>' +
          '<div class="cl-bar cl-bar-slim"><div class="cl-bar-fill cl-bar-good" style="width:' + pct + '%"></div></div>' +
          '<span class="cl-qcount">' + (p.idx + 1) + '/' + p.questions.length + '</span>' +
        '</div>' +
        '<div class="ml-check">' +
          '<span class="ml-check-kicker">' + esc(q.skill || (q.type === 'teachback' ? 'Teach it back' : 'Quick check')) + '</span>' +
          '<h2 class="ml-question">' + esc(q.prompt) + '</h2>' +
          body +
          '<div class="ml-feedback-slot" id="clFeedback"></div>' +
        '</div>' +
        '<button type="button" class="ml-continue" id="clSubmit" onclick="ClassroomUI.submitAnswer()">Submit</button>' +
      '</div>',
      function () {
        if (q.type !== 'teachback') {
          var choices = document.getElementById('clChoices');
          if (choices) {
            choices.addEventListener('click', function (e) {
              var btn = e.target.closest('.ml-choice');
              if (!btn || p.answered) return;
              Array.prototype.forEach.call(choices.querySelectorAll('.ml-choice'), function (b) { b.classList.remove('is-selected'); });
              btn.classList.add('is-selected');
              p.selected = parseInt(btn.getAttribute('data-i'), 10);
            });
          }
        }
      }
    );
  }

  function submitAnswer() {
    var p = CR.player;
    if (!p) return;
    var q = p.questions[p.idx];

    // Advance to next once already answered.
    if (p.answered) { p.idx++; renderQuestion(); return; }

    if (q.type === 'teachback') {
      var text = (document.getElementById('clTeach') || {}).value || '';
      if (!text.trim()) { toast('Write a short explanation first', 'error'); return; }
      var sub = document.getElementById('clSubmit');
      if (sub) { sub.disabled = true; sub.textContent = 'Checking…'; }
      D().classroomAI('evaluate_teachback', {
        objective: q.objective || '', sourceExplanation: q.explanation || '', response: text
      }).then(function (res) {
        var ev = res.evaluation;
        recordResponse(q, { text: text }, ev.understood, ev);
        if (ev.understood) { p.score++; }
        p.graded++;
        showTeachFeedback(ev);
      }).catch(function () {
        // Don't block completion on an eval failure — store ungraded.
        recordResponse(q, { text: text }, null, null);
        showTeachFeedback({ understood: null, feedback: 'Saved. We couldn’t grade this one automatically.', strengths: '', missing: '' });
      });
      return;
    }

    // MCQ
    if (p.selected == null) { toast('Pick an answer', 'error'); return; }
    var correct = p.selected === q.answerIndex;
    if (correct) p.score++;
    p.graded++;
    recordResponse(q, { selectedIndex: p.selected, correct: correct }, correct, null);
    revealMcq(q, correct);
  }

  function revealMcq(q, correct) {
    var p = CR.player;
    p.answered = true;
    var choices = document.getElementById('clChoices');
    if (choices) {
      Array.prototype.forEach.call(choices.querySelectorAll('.ml-choice'), function (b) {
        var i = parseInt(b.getAttribute('data-i'), 10);
        b.classList.remove('is-selected');
        if (i === q.answerIndex) { b.classList.add('is-correct'); b.querySelector('.ml-choice-mark').textContent = '✓'; }
        else if (i === p.selected) { b.classList.add('is-wrong'); b.querySelector('.ml-choice-mark').textContent = '✕'; }
        b.disabled = true;
      });
    }
    var fb = document.getElementById('clFeedback');
    if (fb) fb.innerHTML = '<div class="ml-feedback ' + (correct ? 'ok' : 'no') + '">' +
      '<strong>' + (correct ? 'Correct.' : 'Not quite.') + '</strong>' +
      (q.explanation ? '<p>' + esc(q.explanation) + '</p>' : '') + '</div>';
    var sub = document.getElementById('clSubmit');
    if (sub) sub.textContent = (p.idx + 1 >= p.questions.length) ? 'Finish' : 'Next question';
  }

  function showTeachFeedback(ev) {
    var p = CR.player;
    p.answered = true;
    var ta = document.getElementById('clTeach');
    if (ta) ta.disabled = true;
    var ok = ev.understood === true;
    var fb = document.getElementById('clFeedback');
    if (fb) fb.innerHTML = '<div class="ml-feedback ' + (ok ? 'ok' : 'no') + '">' +
      '<strong>' + (ev.understood === null ? 'Saved.' : (ok ? 'Nice explanation.' : 'Good start.')) + '</strong>' +
      '<p>' + esc(ev.feedback || '') + '</p>' +
      (ev.missing ? '<p class="cl-muted">Consider: ' + esc(ev.missing) + '</p>' : '') + '</div>';
    var sub = document.getElementById('clSubmit');
    if (sub) { sub.disabled = false; sub.textContent = (p.idx + 1 >= p.questions.length) ? 'Finish' : 'Next question'; }
  }

  function recordResponse(q, responseData, isCorrect, evaluation) {
    var p = CR.player;
    // Best-effort persistence; never block the learner UI on the network.
    D().submitResponse(p.attempt.id, p.classroomId, q, responseData, isCorrect, evaluation)
      .catch(function () { /* swallow — offline tolerance; attempt summary still saved */ });
  }

  function finishAssignment() {
    var p = CR.player;
    mount(loading('Saving your results…'));
    D().completeAttempt(p.attempt.id, p.score, p.graded).then(function () {}).catch(function () {})
      .then(function () {
        mount(
          '<div class="cl-screen cl-center">' +
            '<div class="cl-success-badge">✓</div>' +
            '<h1 class="cl-success-title">Assignment complete</h1>' +
            '<p class="cl-success-sub">You scored ' + p.score + ' of ' + p.graded + '</p>' +
            '<div class="cl-bar cl-mt"><div class="cl-bar-fill cl-bar-good" style="width:' + (p.graded ? Math.round(p.score / p.graded * 100) : 0) + '%"></div></div>' +
            '<p class="cl-muted cl-mt">Your responses are private. Your leader sees only anonymous group results.</p>' +
            '<button type="button" class="cl-btn cl-btn-primary cl-mt" onclick="renderClassroom()">Done</button>' +
          '</div>'
        );
        CR.player = null;
      });
  }

  function exitPlayer() {
    if (CR.player && !confirmExit()) return;
    CR.player = null;
    renderClassroom();
  }
  function confirmExit() {
    return global.confirm ? global.confirm('Leave this assignment? Your progress on unanswered questions won’t be saved.') : true;
  }

  // ── Small markup helper ────────────────────────────────────────────────────
  function field(label, control) {
    return '<label class="cl-field"><span class="cl-field-label">' + esc(label) + '</span>' + control + '</label>';
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  global.renderClassroom = renderClassroom;
  global.ClassroomUI = {
    openCreateGroup: openCreateGroup,
    submitCreateGroup: submitCreateGroup,
    openGroup: openGroup,
    openEditGroup: openEditGroup,
    submitEditGroup: submitEditGroup,
    confirmDeleteGroup: confirmDeleteGroup,
    copyCode: copyCode,
    toggleMenu: toggleMenu,
    closeMenus: closeMenus,
    openCreateAssignment: openCreateAssignment,
    toggleTeach: toggleTeach,
    buildAssignment: buildAssignment,
    confirmAssignment: confirmAssignment,
    openInsights: openInsights,
    buildFollowup: buildFollowup,
    editFollowupTitle: editFollowupTitle,
    assignFollowup: assignFollowup,
    demoAssignNotice: demoAssignNotice,
    openDemo: openDemo,
    openJoin: openJoin,
    submitJoin: submitJoin,
    openLearnerAssignment: openLearnerAssignment,
    submitAnswer: submitAnswer,
    exitPlayer: exitPlayer
  };

})(typeof window !== 'undefined' ? window : this);
