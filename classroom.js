// ============================================================================
// classroom.js
// Finlingo Classroom UI — leader dashboard, create-group, assignment creation,
// learner join + assignment player, anonymous assignment results, follow-up
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
  function stateIcon(kind) {
    var path = kind === 'check' ? '<polyline points="5 12 10 17 19 7"/>' : '<path d="M7 7l10 10M17 7L7 17"/>';
    return '<svg class="cl-state-icon" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
  }
  function cleanText(s) {
    return D() && D().normalizeGeneratedText ? D().normalizeGeneratedText(s) : String(s == null ? '' : s);
  }
  function modelText(s) { return esc(cleanText(s)); }
  function richText(s) {
    var lines = cleanText(s).split(/\n+/).filter(function (line) { return line.trim(); });
    var html = '', bullets = [];
    function flush() {
      if (!bullets.length) return;
      html += '<ul class="cl-rich-list">' + bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>';
      bullets = [];
    }
    lines.forEach(function (line) {
      if (/^•\s*/.test(line)) bullets.push(line.replace(/^•\s*/, ''));
      else { flush(); html += '<p>' + esc(line) + '</p>'; }
    });
    flush();
    return html;
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

  // ── Small language helpers (small-group-safe grammar) ───────────────────────
  function lcFirst(s) {
    s = String(s == null ? '' : s);
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }
  function plural(n, word) { return word + ((Number(n) === 1) ? '' : 's'); }
  function joinWithAnd(parts) {
    parts = (parts || []).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] + ' and ' + parts[1];
    return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
  }
  // Estimated learner completion time (minutes) for an activity unit.
  function estimateMinutes(unit) {
    var qs = (unit && unit.questions) || [];
    var mcq = qs.filter(function (q) { return q.type !== 'teachback'; }).length;
    var teach = qs.filter(function (q) { return q.type === 'teachback'; }).length;
    var readMin = (unit && (unit.explanation || unit.scenario)) ? 2 : 0;
    return Math.max(2, Math.round(mcq * 0.5 + teach * 1.5 + readMin));
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
        header('Classroom', 'Create short activities and see where your classroom needs support.') +
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
        header('Classroom', 'Create short activities and see where your classroom needs support.') +
        '<div class="cl-empty">' +
          '<p>Sign in to create a classroom or join one with a code.</p>' +
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
    if (!wasOpen) {
      // Reset direction, reveal, then flip upward if the menu would overflow the
      // bottom of the viewport — keeps it from being clipped or hidden behind the
      // sticky action bar.
      pop.classList.remove('is-up');
      pop.classList.add('is-open');
      var rect = pop.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (rect.bottom > vh - 12 && rect.top - rect.height > 12) pop.classList.add('is-up');
      _bindMenuDismiss();
    }
  }
  function closeMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('.cl-menu-pop.is-open'),
      function (p) { p.classList.remove('is-open'); p.classList.remove('is-up'); });
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
    return '';
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
        header('Classroom', 'Create short activities and see where your classroom needs support.') +
        '<div class="cl-section-title">Your classrooms</div>' +
        '<div id="clGroups">' + loading('Loading your classrooms…') + '</div>' +
      '</div>'
    );
    D().listGroups().then(function (groups) {
      setGroups(groups);
      var box = document.getElementById('clGroups');
      if (!box) return;
      if (!groups.length) { box.innerHTML = leaderEmptyState(); return; }
      box.innerHTML = groups.map(groupCard).join('') +
        '<button type="button" class="cl-btn cl-btn-primary cl-mt" onclick="ClassroomUI.openCreateGroup()">Create classroom</button>' +
        demoEntry();
    }).catch(function () {
      var box = document.getElementById('clGroups');
      if (box) box.innerHTML = errorBox('Could not load your classrooms. The classroom database may not be set up yet.', 'renderClassroom()') + leaderEmptyState();
    });
  }

  function leaderEmptyState() {
    return '<div class="cl-empty">' +
      '<h2>Create your first classroom</h2>' +
          '<p>Assign a short Finlingo activity and see anonymous assignment-level learning gaps.</p>' +
      '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openCreateGroup()">Create classroom</button>' +
      '<div class="cl-demo-entry">' +
        '<button type="button" class="cl-btn cl-btn-ghost" onclick="ClassroomUI.openDemo()">Explore demo classroom</button>' +
        '<span class="cl-demo-entry-copy">See how anonymous assignment results work with sample data.</span>' +
      '</div>' +
      '<div class="cl-mission-note">Designed for classrooms, nonprofits, and community financial-literacy programs.</div>' +
    '</div>';
  }

  // Lower-emphasis demo entry shown beneath a leader's real groups. The demo
  // is always opt-in: it never appears in real group/learner/assignment counts
  // and never writes to Supabase.
  function demoEntry() {
    return '<div class="cl-demo-entry cl-demo-entry-link cl-mt">' +
      '<button type="button" class="cl-demo-link" onclick="ClassroomUI.openDemo()">Explore demo classroom</button>' +
      '<span class="cl-demo-entry-copy">See how anonymous assignment results work with sample data.</span>' +
    '</div>';
  }

  // One real-data intelligence line per group card (latest completed assignment).
  // Demo insights never reach this — it reads only `c.intel` from the aggregate.
  function intelLine(item) {
    var intel = item && item.intel;
    if (!intel) return '';
    return '<div class="cl-intel cl-intel-' + esc(intel.state) + '">' +
      '<span class="cl-intel-dot"></span>' + esc(intel.label) + '</div>';
  }

  function latestLine(c) {
    var a = c.latest_assignment;
    if (!a) return '<div class="cl-latest-line">No assignments yet</div>';
    var completed = Number(a.completed_count) || 0;
    return '<div class="cl-latest-line"><span>Latest:</span> ' + esc(a.title || 'Untitled assignment') +
      ' · ' + completed + ' completed</div>';
  }

  function groupCard(c) {
    var menu = overflowMenu('card_' + c.id, [
      { label: 'Copy join code', onclick: "ClassroomUI.copyCode('" + esc(c.join_code) + "')" },
      { label: 'Edit classroom', onclick: "ClassroomUI.openEditGroup('" + c.id + "')" },
      { label: 'Delete classroom', danger: true, onclick: "ClassroomUI.confirmDeleteGroup('" + c.id + "')" }
    ]);
    return '<div class="cl-card cl-group-card cl-click-card" role="button" tabindex="0" ' +
      'onclick="ClassroomUI.cardOpen(event,\'group\',\'' + c.id + '\')" ' +
      'onkeydown="ClassroomUI.cardKey(event,\'group\',\'' + c.id + '\')">' +
      '<div class="cl-card-head">' +
        '<div class="cl-card-head-main">' +
          '<strong>' + esc(c.name) + '</strong>' +
        '</div>' +
        menu +
      '</div>' +
      '<div class="cl-card-meta">' +
        '<span>' + (c.learner_count || 0) + ' learner' + ((c.learner_count === 1) ? '' : 's') + '</span>' +
        '<span>·</span><span>' + (c.assignment_count || 0) + ' assignment' + ((c.assignment_count === 1) ? '' : 's') + '</span>' +
      '</div>' +
      latestLine(c) +
      '<div class="cl-card-link">Open classroom <span aria-hidden="true">→</span></div>' +
    '</div>';
  }

  // One plain-language "latest finding" line, derived from the no-AI intel only.
  function findingSentence(intel) {
    if (!intel) return '';
    if (intel.state === 'ontrack') return 'No major gaps detected yet.';
    if (intel.state === 'waiting') return 'Waiting for the first responses.';
    var concept = intel.concept || 'this concept';
    var lead = /^(recognizing|explaining|identifying|applying|defining)\b/i.test(concept)
      ? 'Learners need support ' : 'Learners need support with ';
    return lead + lcFirst(concept) + '.';
  }

  function assignmentProgress(a, learners) {
    return (Number(a.completed_count) || 0) + ' of ' + (Number(learners) || 0) + ' completed';
  }

  function assignmentFinding(a) {
    if (!a || !(Number(a.completed_count) || 0)) return 'Waiting for responses';
    return findingSentence(a.intel) || 'No major gaps detected yet.';
  }

  function assignmentCard(a, c) {
    var completed = Number(a.completed_count) || 0;
    var avg = Math.round((Number(a.avg_accuracy) || 0) * 100);
    var hasResults = completed > 0;
    var isDraft = (a.status || 'active') === 'draft';
    var target = isDraft ? 'draft' : (hasResults ? 'results' : 'assignment');
    var menu = overflowMenu('asg_' + a.id, [
      { label: 'View assignment', onclick: "ClassroomUI.openAssignmentPreview('" + c.id + "','" + a.id + "')" },
      { label: 'Duplicate', onclick: "ClassroomUI.duplicateAssignment('" + c.id + "','" + a.id + "')" }
    ]);
    return '<div class="cl-card cl-assignment-card cl-click-card" role="button" tabindex="0" ' +
      'onclick="ClassroomUI.cardOpen(event,\'' + target + '\',\'' + c.id + '\',\'' + a.id + '\')" ' +
      'onkeydown="ClassroomUI.cardKey(event,\'' + target + '\',\'' + c.id + '\',\'' + a.id + '\')">' +
      '<div class="cl-card-head">' +
        '<div class="cl-card-head-main"><strong>' + esc(a.title || 'Untitled assignment') + '</strong></div>' +
        menu +
      '</div>' +
      '<div class="cl-card-meta"><span>' + assignmentProgress(a, c.learner_count) + '</span>' +
        (hasResults ? '<span>·</span><span>Average score: ' + avg + '%</span>' : '') + '</div>' +
      '<div class="cl-finding cl-assignment-finding"><div class="cl-finding-kicker">' + (hasResults ? 'Latest finding' : 'Status') + '</div>' +
        '<p class="cl-finding-text">' + esc(assignmentFinding(a)) + '</p></div>' +
      '<div class="cl-card-link">' + (isDraft ? 'Continue draft' : (hasResults ? 'View results' : 'View assignment')) + ' <span aria-hidden="true">→</span></div>' +
    '</div>';
  }

  function assignmentsList(c) {
    var assignments = c.assignments || [];
    if (!assignments.length) {
      return '<div class="cl-empty cl-empty-compact cl-mt">' +
        '<h2>No assignments yet</h2>' +
        '<p>Create a short activity for this classroom.</p></div>';
    }
    var groups = [
      { label: 'Published assignments', items: assignments.filter(function (a) { return (a.status || 'active') === 'active'; }) },
      { label: 'Drafts', items: assignments.filter(function (a) { return a.status === 'draft'; }) },
      { label: 'Closed', items: assignments.filter(function (a) { return a.status === 'closed'; }) }
    ];
    return groups.filter(function (g) { return g.items.length; }).map(function (g) {
      return '<div class="cl-assignment-section">' +
        '<div class="cl-assignment-section-title">' + esc(g.label) + '</div>' +
        g.items.map(function (a) { return assignmentCard(a, c); }).join('') +
      '</div>';
    }).join('');
  }

  function shouldIgnoreCardEvent(ev) {
    var t = ev && ev.target;
    return !!(t && t.closest && t.closest('button,a,input,textarea,select,label,.cl-menu'));
  }
  function cardOpen(ev, kind, id, assignmentId) {
    if (shouldIgnoreCardEvent(ev)) return;
    if (kind === 'group') openGroup(id);
    else if (kind === 'results') openInsights(id, assignmentId);
    else if (kind === 'draft') openDraftAssignment(id, assignmentId);
    else if (kind === 'learnerAssignments') openLearnerAssignments(id);
    else if (kind === 'learnerStart') openLearnerAssignment(id, assignmentId);
    else openAssignmentPreview(id, assignmentId);
  }
  function cardKey(ev, kind, id, assignmentId) {
    if (!ev || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    cardOpen(ev, kind, id, assignmentId);
  }

  function openAssignmentPreview(classroomId, assignmentId) {
    mount(loading('Opening assignment…'));
    D().getAssignment(assignmentId).then(function (a) {
      if (!a) { openGroup(classroomId); return; }
      var unit = Object.assign({}, a.content || {}, {
        title: a.title || ((a.content || {}).title) || 'Assignment',
        topic: a.topic || ((a.content || {}).topic) || '',
        difficulty: a.difficulty || ((a.content || {}).difficulty) || 'beginner'
      });
      CR.pendingUnit = unit;
      CR.pendingCtx = { classroomId: classroomId, sourceAssignmentId: assignmentId, readonly: true };
      assignmentPreview(unit, CR.pendingCtx);
    }).catch(function () { openGroup(classroomId); });
  }

  function duplicateAssignment(classroomId, assignmentId) {
    mount(loading('Preparing duplicate…'));
    D().getAssignment(assignmentId).then(function (a) {
      if (!a) { openGroup(classroomId); return; }
      var unit = Object.assign({}, a.content || {});
      unit.title = 'Copy of ' + (a.title || unit.title || 'Assignment');
      unit.questions = ((a.content || {}).questions || []).map(function (q) {
        var copy = Object.assign({}, q);
        copy.selected = true;
        return copy;
      });
      candidateSelection(unit, { classroomId: classroomId, mode: 'preset', title: unit.title, due: null });
    }).catch(function () { openGroup(classroomId); });
  }

  function openDraftAssignment(classroomId, assignmentId) {
    mount(loading('Opening draft…'));
    D().getAssignment(assignmentId).then(function (a) {
      if (!a) { openGroup(classroomId); return; }
      var unit = Object.assign({}, a.content || {});
      unit.title = a.title || unit.title || 'Draft assignment';
      unit.questions = ((a.content || {}).questions || []).map(function (q) {
        var copy = Object.assign({}, q);
        copy.selected = true;
        return copy;
      });
      candidateSelection(unit, {
        classroomId: classroomId,
        mode: unit.source === 'claude-followup' ? 'claude' : 'preset',
        draftAssignmentId: assignmentId,
        sourceAssignmentId: unit.sourceAssignmentId || '',
        isFollowup: unit.source === 'claude-followup',
        gapShort: unit.gapConcept || '',
        objective: (unit.objectives || [])[0] || ''
      });
    }).catch(function () { openGroup(classroomId); });
  }

  // Group detail: group identity, summary, compact join code, then assignment list.
  function openGroup(id) {
    mount(loading('Opening classroom…'));
    D().listGroups().then(function (groups) {
      setGroups(groups);
      var c = groupById(id);
      if (!c) { renderLeaderDashboard(); return; }
      var menu = overflowMenu('grp_' + c.id, [
        { label: 'Edit classroom', onclick: "ClassroomUI.openEditGroup('" + c.id + "')" },
        { label: 'Delete classroom', danger: true, onclick: "ClassroomUI.confirmDeleteGroup('" + c.id + "')" }
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
            summaryItem(c.assignment_count || 0, 'Assignments') +
            summaryItem(c.completed_count || 0, 'Completed') +
          '</div>' +
          '<div class="cl-card cl-code-card cl-code-card-sm">' +
            '<div class="cl-code-inline">' +
              '<div><div class="cl-code-label">Join code</div>' +
                '<div class="cl-code-mid">' + esc(c.join_code) + '</div></div>' +
              '<button type="button" class="cl-btn cl-btn-line cl-btn-compact" onclick="ClassroomUI.copyCode(\'' + esc(c.join_code) + '\')">Copy</button>' +
            '</div>' +
          '</div>' +
          '<div class="cl-section-title cl-mt">Assignments</div>' +
          assignmentsList(c) +
          '<button type="button" class="cl-btn cl-btn-primary cl-mt" onclick="ClassroomUI.openCreateAssignment(\'' + c.id + '\')">+ Create assignment</button>' +
        '</div>'
      );
    }).catch(function () { renderLeaderDashboard(); });
  }

  // ── Edit classroom ──────────────────────────────────────────────────────────────
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
        back('Classroom', 'ClassroomUI.openGroup(\'' + c.id + '\')') +
        header('Edit classroom', 'Update the classroom name and details.') +
        '<form class="cl-form" onsubmit="return false;">' +
          field('Classroom name', '<input class="cl-input" id="clEditName" type="text" maxlength="80" value="' + esc(c.name) + '" required>') +
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
    if (!name.trim()) { toast('Classroom name can’t be empty', 'error'); return; }
    var desc = (document.getElementById('clEditDesc') || {}).value || '';
    var audience = (document.getElementById('clEditAudience') || {}).value || 'other';
    var btn = document.getElementById('clEditBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    D().updateGroup(id, { name: name, description: desc, audience: audience }).then(function () {
      toast('Classroom updated', 'info');
      return D().listGroups().then(function (groups) { setGroups(groups); openGroup(id); });
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
      toast((err && err.message) || 'Could not update the classroom.', 'error');
    });
  }

  // ── Delete classroom (leader-only, confirmed, server-enforced) ──────────────────
  function confirmDeleteGroup(id) {
    var c = groupById(id);
    var name = (c && c.name) ? c.name : 'this classroom';
    if (typeof global.showAppModal !== 'function') {
      if (global.confirm && global.confirm('Delete ' + name + '? This cannot be undone.')) performDeleteGroup(id);
      return;
    }
    global.showAppModal({
      icon: 'danger',
      title: 'Delete ' + name + '?',
      body: 'This permanently deletes the classroom, assignments, learner memberships, attempts, responses, and insights. This cannot be undone.',
      actions: [
        { label: 'Cancel', cls: 'modal-cancel', fn: global.closeAppModal },
        { label: 'Delete classroom', cls: 'btn btn-danger', fn: function () { performDeleteGroup(id); } }
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
      toast('Classroom deleted', 'info');
      if (global.NavDrawer && NavDrawer.refresh) NavDrawer.refresh();
      renderLeaderDashboard();
    }).catch(function (err) {
      Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
      if (delBtn) delBtn.textContent = 'Delete classroom';
      var bodyEl = document.getElementById('modalBody');
      if (bodyEl) {
        var e = bodyEl.querySelector('.app-modal-inline-error');
        if (!e) { e = document.createElement('p'); e.className = 'app-modal-inline-error'; bodyEl.appendChild(e); }
        e.textContent = (err && err.message) || 'Could not delete the classroom. Please try again.';
      }
    });
  }

  function copyCode(code) {
    if (global.navigator && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(function () { toast('Join code copied', 'info'); })
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
        header('Create classroom', 'Set up a classroom and share its join code.') +
        '<form class="cl-form" id="clCreateForm" onsubmit="return false;">' +
          field('Classroom name', '<input class="cl-input" id="clGroupName" type="text" maxlength="80" placeholder="First-Generation Finance Workshop" required>') +
          field('Description (optional)', '<textarea class="cl-input" id="clGroupDesc" maxlength="400" rows="2" placeholder="What is this classroom about?"></textarea>') +
          field('Audience type', '<select class="cl-input" id="clGroupAudience">' + audiences + '</select>') +
          '<button type="button" class="cl-btn cl-btn-primary cl-mt" id="clCreateBtn" onclick="ClassroomUI.submitCreateGroup()">Create classroom</button>' +
        '</form>' +
      '</div>',
      function () { var el = document.getElementById('clGroupName'); if (el) el.focus(); }
    );
  }

  function submitCreateGroup() {
    var name = (document.getElementById('clGroupName') || {}).value || '';
    if (!name.trim()) { toast('Give your classroom a name', 'error'); return; }
    var desc = (document.getElementById('clGroupDesc') || {}).value || '';
    var audience = (document.getElementById('clGroupAudience') || {}).value || 'other';
    var btn = document.getElementById('clCreateBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    D().createGroup({ name: name, description: desc, audience: audience }).then(function (c) {
      groupCreatedScreen(c);
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Create classroom'; }
      toast(err && err.message ? err.message : 'Could not create the classroom. Is the classroom database set up?', 'error');
    });
  }

  function groupCreatedScreen(c) {
    mount(
      '<div class="cl-screen cl-center">' +
        '<div class="cl-success-badge">' + stateIcon('check') + '</div>' +
        '<h1 class="cl-success-title">Your classroom is ready</h1>' +
        (c.name ? '<p class="cl-success-sub">' + esc(c.name) + '</p>' : '') +
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
    var savedDiff = CR.draftDiff || 'beginner';
    var diffs = D().DIFFICULTIES.map(function (d) {
      return '<option value="' + d.id + '"' + (d.id === savedDiff ? ' selected' : '') + '>' + esc(d.label) + '</option>';
    }).join('');
    mount(
      '<div class="cl-screen">' +
        back('Classroom', 'ClassroomUI.openGroup(\'' + classroomId + '\')') +
        header('Create assignment', 'Build a reviewed activity before publishing.') +
        '<form class="cl-form cl-form-spaced" onsubmit="return false;">' +
          '<div class="cl-form-group">' +
            field('Topic', '<select class="cl-input" id="clAsgTopic">' + topics + '</select>') +
            field('Assignment title', '<input class="cl-input" id="clAsgTitle" type="text" maxlength="120" value="' + esc(suggested) + '" placeholder="' + esc(suggested) + '">') +
            field('Difficulty', '<select class="cl-input" id="clAsgDiff">' + diffs + '</select>') +
            field('Learning objective', '<textarea class="cl-input" id="clAsgObjective" rows="2" maxlength="220" placeholder="What should learners be able to do after this assignment?"></textarea>') +
            field('Number of candidates', '<input class="cl-input" id="clAsgCount" type="number" min="6" max="10" value="8">') +
          '</div>' +
          '<div class="cl-form-group">' +
            '<div class="cl-stack">' +
              '<button type="button" class="cl-toggle-row is-on" id="clAsgTeachRow" aria-pressed="true" onclick="ClassroomUI.toggleTeach()">' +
                '<span class="cl-toggle-text">Include a teach-it-back question</span>' +
                '<span class="cl-toggle-switch" aria-hidden="true"></span>' +
              '</button>' +
              '<input type="hidden" id="clAsgTeach" value="1">' +
              '<div>' +
                '<button type="button" class="cl-toggle-row" id="clDueRow" aria-pressed="false" aria-controls="clDueWrap" onclick="ClassroomUI.toggleDue()">' +
                  '<span class="cl-toggle-text">Add a due date</span>' +
                  '<span class="cl-toggle-switch" aria-hidden="true"></span>' +
                '</button>' +
                '<div class="cl-reveal" id="clDueWrap">' +
                  '<label class="cl-field cl-reveal-inner"><span class="cl-field-label">Due date</span>' +
                    '<input class="cl-input" id="clAsgDue" type="date"></label>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="cl-form-group">' +
            '<div class="cl-section-title">Creation path</div>' +
            '<div class="cl-path-cards">' +
              pathCard(classroomId, 'scratch',
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
                'Start from scratch', 'Write and organize the questions yourself.') +
              pathCard(classroomId, 'claude',
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
                'Generate with AI', 'Create a reviewed set of candidate questions for this topic.') +
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
        // Keep the session due-date draft in sync as the user types, so toggling
        // the switch off and back on restores it.
        var dueInp = document.getElementById('clAsgDue');
        if (dueInp) dueInp.addEventListener('input', function () { CR.dueDraft = dueInp.value || ''; });
      }
    );
  }

  // Two equal, selectable creation-path cards (icon · title · one-line · chevron).
  function pathCard(classroomId, mode, icon, title, desc) {
    return '<button type="button" class="cl-path-card" ' +
      'onclick="ClassroomUI.buildAssignment(\'' + classroomId + '\',\'' + mode + '\')">' +
      '<span class="cl-path-icon">' + icon + '</span>' +
      '<span class="cl-path-body"><strong>' + esc(title) + '</strong><small>' + esc(desc) + '</small></span>' +
      '<span class="cl-path-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg></span>' +
    '</button>';
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

  // Due-date switch: off by default. No date is stored while off; the typed
  // value is preserved in CR.dueDraft during the session so toggling off/on
  // restores it. Reveal animates via the .cl-reveal wrapper.
  function toggleDue() {
    var row = document.getElementById('clDueRow');
    var wrap = document.getElementById('clDueWrap');
    var input = document.getElementById('clAsgDue');
    if (!row || !wrap || !input) return;
    var on = row.getAttribute('aria-pressed') !== 'true';
    row.classList.toggle('is-on', on);
    row.setAttribute('aria-pressed', on ? 'true' : 'false');
    wrap.classList.toggle('is-open', on);
    if (on) {
      if (!input.value && CR.dueDraft) input.value = CR.dueDraft;
      global.setTimeout(function () { try { input.focus(); } catch (e) {} }, 80);
    } else {
      CR.dueDraft = input.value || CR.dueDraft || '';
      input.value = '';
    }
  }
  // Read the draft due date only when the switch is on (never publish it while off).
  function currentDueDate() {
    var row = document.getElementById('clDueRow');
    if (!row || row.getAttribute('aria-pressed') !== 'true') return '';
    return (document.getElementById('clAsgDue') || {}).value || '';
  }

  // Generating state: spinner + progressively-animated status lines + honest
  // "few seconds" hint. No fake percentages.
  function generatingScreen() {
    return '<div class="cl-screen cl-center cl-generating">' +
      '<div class="cl-spinner cl-spinner-lg"></div>' +
      '<h2 class="cl-gen-title">Generating candidate questions</h2>' +
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
    CR.draftDiff = diff;
    var due = currentDueDate();
    var teach = (document.getElementById('clAsgTeach') || {}).value === '1';
    var candidateCount = Number((document.getElementById('clAsgCount') || {}).value) || 8;
    candidateCount = Math.max(6, Math.min(10, candidateCount));
    var objective = ((document.getElementById('clAsgObjective') || {}).value || '').trim();
    var ctx = { classroomId: classroomId, title: title, due: due, mode: mode, objective: objective };

    // Start from scratch — open the review workspace with an empty question set.
    if (mode === 'scratch') {
      var blank = {
        title: title.trim() || (topic + ' assignment'), topic: topic, difficulty: diff,
        questions: [], teachItBack: false, objectives: objective ? [objective] : []
      };
      candidateSelection(blank, ctx);
      return;
    }
    // Curated set (retained for duplicate/draft flows; not exposed as a path).
    if (mode === 'preset') {
      var unit = D().presetUnitFor(topic, diff);
      if (!unit) { toast('No curated set for that topic — try Generate with AI.', 'error'); return; }
      if (!teach) unit.questions = unit.questions.filter(function (q) { return q.type !== 'teachback'; });
      unit.teachItBack = unit.questions.some(function (q) { return q.type === 'teachback'; });
      if (title.trim()) unit.title = title.trim();
      candidateSelection(unit, ctx);
      return;
    }
    // Generate with AI
    mount(generatingScreen());
    D().classroomAI('generate_assignment', {
      topic: topic, difficulty: diff, teachItBack: teach, count: candidateCount, objective: objective
    }).then(function (res) {
      var unit = res.assignment;
      if (title.trim()) unit.title = title.trim();
      candidateSelection(unit, ctx);
    }).catch(function (err) {
      mount(
        '<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
        errorBox((err && err.message) || 'The assignment could not be generated.',
          'ClassroomUI.openCreateAssignment(\'' + classroomId + '\')') +
        '<button type="button" class="cl-btn cl-btn-ghost cl-mt" onclick="ClassroomUI.openCreateAssignment(\'' + classroomId + '\')">Start from scratch instead</button>' +
        '</div>'
      );
    });
  }

  function candidateMeta(q) {
    var skill = String(q.skill || '').toLowerCase();
    if (q.type === 'teachback') return 'teachback';
    if (/scenario|case|real/.test(skill + ' ' + q.prompt)) return 'scenario';
    if (/misconception|limits|risk|wrong|cannot/.test(skill + ' ' + q.prompt)) return 'misconception';
    if (/apply|application|practical/.test(skill + ' ' + q.prompt)) return 'application';
    return 'fundamentals';
  }

  function ensureCandidateState(unit) {
    unit.questions = (unit.questions || []).slice(0, 10).map(function (q, i) {
      if (q.selected == null) q.selected = i < 5 || q.type === 'teachback';
      q._cat = q._cat || candidateMeta(q);
      return q;
    });
    return unit;
  }

  function candidateSelection(unit, ctx) {
    if (!unit) unit = CR.pendingUnit;
    if (!ctx) ctx = CR.pendingCtx;
    if (!unit || !ctx) return;
    CR.inQuestionSelection = true;
    CR.pendingUnit = ensureCandidateState(unit);
    CR.pendingCtx = ctx;
    CR.candidateUnit = CR.pendingUnit;
    // Default to All ONLY the first time this screen is opened. Once a filter has
    // been chosen it must survive every re-render (edit / refine / select /
    // duplicate / delete / reorder / add). 'teachback' is the single internal
    // value for Teach it back — filter button, question _cat, filtering logic,
    // and this saved state all use it; only the label ever reads "Teach it back".
    if (CR.questionFilter == null) CR.questionFilter = 'all';
    var qs = CR.pendingUnit.questions || [];
    var selected = qs.filter(function (q) { return q.selected !== false; });
    var filters = [
      ['all', 'All'],
      ['fundamentals', 'Fundamentals'],
      ['application', 'Application'],
      ['misconception', 'Misconception check'],
      ['scenario', 'Scenario'],
      ['teachback', 'Teach it back']
    ].map(function (f) {
      return '<button type="button" class="' + (CR.questionFilter === f[0] ? 'is-active' : '') +
        '" onclick="ClassroomUI.setQuestionFilter(\'' + f[0] + '\')">' + esc(f[1]) + '</button>';
    }).join('');
    var visible = qs.map(function (q, i) { return { q: q, i: i }; }).filter(function (item) {
      return CR.questionFilter === 'all' || item.q._cat === CR.questionFilter;
    });

    var MIN_SEL = 3;
    var teachSel = selected.filter(function (q) { return q.type === 'teachback'; }).length;
    var canPublish = selected.length >= MIN_SEL && selected.length <= 10 && teachSel <= 1;
    var reason = selected.length < MIN_SEL
      ? ('Select at least ' + MIN_SEL + ' questions'
        ) : (selected.length > 10 ? 'Use 10 questions or fewer'
        : (teachSel > 1 ? 'Use one teach-it-back question' : ''));
    // Bottom bar reports the TOTAL selection; the recommended range is fixed
    // guidance (replaces the old "N selected · 5 recommended" duplication).
    var hint = reason || 'Recommended: 5–7';

    // Count of questions matching the active filter, shown near the filter row —
    // the currently displayed (filtered) results, distinct from the total
    // selection reported in the bottom bar.
    var filterCountLine = CR.questionFilter !== 'all'
      ? '<div class="cl-filter-count">Showing ' + visible.length + ' ' +
          esc(humanCategory(CR.questionFilter)) + ' ' + plural(visible.length, 'question') + '</div>'
      : '';

    var listInner = visible.length
      ? visible.map(function (item) { return candidateCard(item.q, item.i, ctx); }).join('')
      : emptyQuestionState(qs.length, ctx);

    // Preserve scroll position across re-renders (toggle / edit / reorder / add /
    // delete). mount() resets scrollTop to 0, so re-apply the previous position
    // when we are re-rendering the same screen rather than arriving fresh.
    var rootEl = ROOT();
    var isRerender = !!(rootEl && rootEl.querySelector('.cl-question-select'));
    var prevScroll = rootEl ? rootEl.scrollTop : 0;

    mount(
      '<div class="cl-screen cl-question-select">' +
        back('Create assignment', 'ClassroomUI.exitReview()') +
        (ctx.gapShort ? '<div class="cl-gap-banner"><div class="cl-gap-banner-kicker">Based on assignment gap</div><div class="cl-gap-banner-concept">' + esc(ctx.gapShort) + '</div></div>' : '') +
        header('Choose questions', 'Select the questions you want to publish.') +
        '<div class="cl-filter-wrap"><div class="cl-filter-row" role="tablist" aria-label="Filter questions by type">' + filters + '</div></div>' +
        filterCountLine +
        '<div class="cl-candidate-list">' + listInner + '</div>' +
        '<button type="button" class="cl-add-q" onclick="ClassroomUI.openQuestionEditor(\'' + ctx.classroomId + '\')">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add question</button>' +
        '<div class="cl-bottom-bar">' +
          '<div class="cl-review-count"><strong>' + selected.length + ' ' + plural(selected.length, 'question') + ' selected</strong>' +
            '<span class="cl-review-hint">' + esc(hint) + '</span></div>' +
          '<div class="cl-review-actions">' +
            '<button type="button" class="cl-btn cl-btn-line cl-btn-compact" onclick="ClassroomUI.previewSelectedQuestions()"' +
              (canPublish ? '' : ' disabled') + '>Preview</button>' +
            '<button type="button" class="cl-btn cl-btn-primary cl-btn-compact" onclick="ClassroomUI.publishFromReview()"' +
              (canPublish ? '' : ' disabled aria-disabled="true" title="' + esc(reason) + '"') + '>Publish assignment</button>' +
          '</div>' +
        '</div>' +
      '</div>',
      function () {
        var list = document.querySelector('.cl-candidate-list');
        if (list) bindCandidateDrag(list);
        if (isRerender && rootEl) rootEl.scrollTop = prevScroll;
        // The filter row scrolls horizontally and "Teach it back" is the last
        // pill. mount() rebuilds it with scrollLeft 0, so the active pill can
        // land off-screen and read as a reset to "All". Keep it in view — the
        // filter STATE is already preserved above; this only fixes visibility.
        var activePill = rootEl && rootEl.querySelector('.cl-filter-row button.is-active');
        var filterRow = rootEl && rootEl.querySelector('.cl-filter-row');
        if (activePill && filterRow && CR.questionFilter !== 'all') {
          filterRow.scrollLeft = Math.max(0, activePill.offsetLeft - 16);
        }
      }
    );
  }

  // Compact empty state for the review workspace (Start-from-scratch or an
  // over-filtered list).
  function emptyQuestionState(total, ctx) {
    if (total > 0) {
      return '<div class="cl-empty cl-empty-compact"><p>No questions match this filter.</p></div>';
    }
    return '<div class="cl-empty cl-empty-compact">' +
      '<h2>No questions yet</h2>' +
      '<p>Add your first question to start building this assignment.</p>' +
      '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openQuestionEditor(\'' + ctx.classroomId + '\')">Add question</button>' +
    '</div>';
  }

  // Refine menu — only for AI-generated questions. Opens on demand; never shows
  // all refinement controls at once.
  function refineMenu(i, q) {
    var id = 'qr_' + i;
    var isTeach = q && q.type === 'teachback';
    var isScenario = q && q._cat === 'scenario';
    var item = function (label, onclick) {
      return '<button type="button" role="menuitem" class="cl-menu-item" ' +
        'onclick="ClassroomUI.closeMenus();' + onclick + '">' + esc(label) + '</button>';
    };
    return '<div class="cl-menu cl-refine-menu" data-menu="' + id + '">' +
      '<button type="button" class="cl-qc-refine" aria-haspopup="true" ' +
        'onclick="ClassroomUI.toggleMenu(\'' + id + '\', event)">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l1.2 3L9 7 6.2 8 5 11 3.8 8 1 7l2.8-1z"/><path d="M17 9l1.6 4L23 14.5 18.6 16 17 20l-1.6-4L11 14.5 15.4 13z"/></svg>' +
        'Refine</button>' +
      '<div class="cl-menu-pop" id="clMenuPop_' + id + '" role="menu">' +
        item('Regenerate', 'ClassroomUI.regenerateQuestion(' + i + ')') +
        item('Make easier', 'ClassroomUI.adjustQuestion(' + i + ',\'easier\')') +
        item('Make harder', 'ClassroomUI.adjustQuestion(' + i + ',\'harder\')') +
        item('Make more practical', 'ClassroomUI.adjustQuestion(' + i + ',\'practical\')') +
        (isScenario ? '' : item('Convert to scenario', 'ClassroomUI.adjustQuestion(' + i + ',\'scenario\')')) +
        (isTeach ? '' : item('Convert to teach it back', 'ClassroomUI.adjustQuestion(' + i + ',\'teachback\')')) +
      '</div>' +
    '</div>';
  }

  // Compact metadata pills: category + response type, standardized across every
  // question card. Teach-it-back uses the exact same wording as the filter.
  function metaPills(q) {
    var isTeach = q.type === 'teachback';
    var category = isTeach ? 'Teach it back' : humanCategory(q._cat);
    var responseType = isTeach ? 'Written response' : 'Multiple choice';
    return '<span class="cl-qc-pill">' + esc(category) + '</span>' +
      '<span class="cl-qc-pill">' + esc(responseType) + '</span>';
  }

  function candidateCard(q, i, ctx) {
    var selected = q.selected !== false;
    var isClaude = ctx.mode === 'claude';
    var meta = metaPills(q);
    var menu = overflowMenu('qc_' + i, [
      { label: 'Move up', onclick: 'ClassroomUI.moveCandidate(' + i + ',-1)' },
      { label: 'Move down', onclick: 'ClassroomUI.moveCandidate(' + i + ',1)' },
      { label: 'Duplicate', onclick: 'ClassroomUI.duplicateCandidate(' + i + ')' },
      { label: 'Delete', danger: true, onclick: 'ClassroomUI.deleteCandidate(' + i + ')' }
    ]);
    return '<div class="cl-qc' + (selected ? ' is-selected' : '') + (q.loading ? ' is-loading' : '') + '" data-qi="' + i + '" draggable="true">' +
      '<div class="cl-qc-top">' +
        '<label class="cl-qc-check"><input type="checkbox"' + (selected ? ' checked' : '') +
          ' onchange="ClassroomUI.toggleCandidate(' + i + ')" aria-label="Include this question"></label>' +
        '<span class="cl-qc-handle" aria-hidden="true" title="Drag to reorder">' +
          '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>' +
        '</span>' +
        '<div class="cl-qc-headings">' +
          '<div class="cl-qc-title">' + esc(D().humanizeSkill(q.skill || 'Question')) + '</div>' +
          '<div class="cl-qc-meta">' + meta + '</div>' +
        '</div>' +
        menu +
      '</div>' +
      '<p class="cl-qc-prompt">' + modelText(q.loading ? 'Updating this question…' : q.prompt) + '</p>' +
      '<div class="cl-qc-actions">' +
        '<button type="button" class="cl-qc-edit" onclick="ClassroomUI.editQuestion(' + i + ',true)">Edit</button>' +
        (isClaude ? refineMenu(i, q) : '') +
      '</div>' +
    '</div>';
  }

  // Native drag-to-reorder for the candidate list (desktop). Move up / Move down
  // in the ••• menu remain the universal (touch-safe) path.
  function bindCandidateDrag(list) {
    var dragI = null;
    list.addEventListener('dragstart', function (e) {
      var card = e.target.closest && e.target.closest('.cl-qc');
      if (!card) return;
      dragI = parseInt(card.getAttribute('data-qi'), 10);
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragI)); } catch (_) {} }
      card.classList.add('is-dragging');
    });
    list.addEventListener('dragend', function (e) {
      var card = e.target.closest && e.target.closest('.cl-qc');
      if (card) card.classList.remove('is-dragging');
    });
    list.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; });
    list.addEventListener('drop', function (e) {
      e.preventDefault();
      var card = e.target.closest && e.target.closest('.cl-qc');
      if (!card || dragI == null) return;
      var toI = parseInt(card.getAttribute('data-qi'), 10);
      var qs = CR.pendingUnit && CR.pendingUnit.questions;
      if (!qs || isNaN(toI) || toI === dragI) { dragI = null; return; }
      var moved = qs.splice(dragI, 1)[0];
      qs.splice(toI, 0, moved);
      dragI = null;
      candidateSelection(CR.pendingUnit, CR.pendingCtx);
    });
  }

  function humanCategory(cat) {
    return {
      fundamentals: 'Fundamentals',
      application: 'Application',
      misconception: 'Misconception check',
      scenario: 'Scenario',
      teachback: 'Teach it back'
    }[cat] || 'Fundamentals';
  }

  function setQuestionFilter(filter) {
    CR.questionFilter = filter || 'all';
    if (CR.pendingUnit && CR.pendingCtx) candidateSelection(CR.pendingUnit, CR.pendingCtx);
  }
  function toggleCandidate(i) {
    var q = CR.pendingUnit && CR.pendingUnit.questions && CR.pendingUnit.questions[i];
    if (!q) return;
    q.selected = q.selected === false;
    candidateSelection(CR.pendingUnit, CR.pendingCtx);
  }
  function deleteCandidate(i) {
    if (!CR.pendingUnit || !CR.pendingUnit.questions[i]) return;
    var doDelete = function () {
      CR.pendingUnit.questions.splice(i, 1);
      if (typeof global.closeAppModal === 'function') global.closeAppModal();
      toast('Question deleted', 'info');
      candidateSelection(CR.pendingUnit, CR.pendingCtx);
    };
    if (typeof global.showAppModal === 'function') {
      global.showAppModal({
        icon: 'danger',
        title: 'Delete this question?',
        body: 'This removes the question from the assignment draft.',
        actions: [
          { label: 'Cancel', cls: 'modal-cancel', fn: global.closeAppModal },
          { label: 'Delete', cls: 'btn btn-danger', fn: doDelete }
        ]
      });
    } else if (!global.confirm || global.confirm('Delete this question?')) {
      doDelete();
    }
  }
  function duplicateCandidate(i) {
    var qs = CR.pendingUnit && CR.pendingUnit.questions;
    if (!qs || !qs[i]) return;
    var copy = Object.assign({}, qs[i]);
    if (copy.choices) copy.choices = copy.choices.slice();
    delete copy.id;
    copy.selected = true;
    qs.splice(i + 1, 0, copy);
    toast('Question duplicated', 'info');
    candidateSelection(CR.pendingUnit, CR.pendingCtx);
  }
  function moveCandidate(i, dir) {
    var qs = CR.pendingUnit && CR.pendingUnit.questions;
    if (!qs) return;
    var j = i + dir;
    if (j < 0 || j >= qs.length) return;
    var tmp = qs[i]; qs[i] = qs[j]; qs[j] = tmp;
    candidateSelection(CR.pendingUnit, CR.pendingCtx);
  }
  function adjustQuestion(i, kind) {
    var q = CR.pendingUnit && CR.pendingUnit.questions && CR.pendingUnit.questions[i];
    if (!q) return;
    if (kind === 'scenario') {
      q._cat = 'scenario';
      if (!/^Scenario:/i.test(q.prompt)) q.prompt = 'Scenario: ' + q.prompt;
    } else if (kind === 'teachback') {
      // Convert a multiple-choice question into an open written response.
      q.type = 'teachback';
      q._cat = 'teachback';
      delete q.choices; delete q.answerIndex;
      q.objective = q.objective || D().humanizeSkill(q.skill || '') || q.prompt;
    } else if (kind === 'practical') {
      q._cat = 'application';
      q.prompt = q.prompt.replace(/\?$/, '') + ' in a real financial decision?';
    } else {
      q.skill = D().humanizeSkill(q.skill || '') + (kind === 'easier' ? ' basics' : ' application');
    }
    toast('Draft updated', 'info');
    candidateSelection(CR.pendingUnit, CR.pendingCtx);
  }
  function regenerateQuestion(i) {
    var unit = CR.pendingUnit, ctx = CR.pendingCtx;
    var q = unit && unit.questions && unit.questions[i];
    if (!q || !ctx || ctx.mode !== 'claude') return;
    var selected = q.selected !== false;
    q.loading = true;
    candidateSelection(unit, ctx);
    D().classroomAI('generate_assignment', {
      topic: unit.topic, difficulty: unit.difficulty || 'beginner', teachItBack: q.type === 'teachback', count: q.type === 'teachback' ? 1 : 6,
      objective: ctx.objective || ''
    }).then(function (res) {
      var replacement = ((res.assignment || {}).questions || []).filter(function (qq) { return q.type === 'teachback' ? qq.type === 'teachback' : qq.type !== 'teachback'; })[0];
      if (replacement) {
        replacement.selected = selected;
        replacement._cat = candidateMeta(replacement);
        unit.questions[i] = replacement;
      } else q.loading = false;
      candidateSelection(unit, ctx);
    }).catch(function (err) {
      q.loading = false;
      toast((err && err.message) || 'Could not regenerate that question.', 'error');
      candidateSelection(unit, ctx);
    });
  }
  // Validate the current selection and return a publish-ready unit (selection/
  // loading/category flags stripped), or null after showing the reason.
  function buildCleanSelectedUnit() {
    var unit = CR.pendingUnit;
    if (!unit) return null;
    var selected = (unit.questions || []).filter(function (q) { return q.selected !== false; });
    var teachCount = selected.filter(function (q) { return q.type === 'teachback'; }).length;
    if (selected.length < 3) { toast('Select at least 3 questions', 'error'); return null; }
    if (selected.length > 10) { toast('Use 10 questions or fewer', 'error'); return null; }
    if (teachCount > 1) { toast('Use one teach-it-back question by default', 'error'); return null; }
    return Object.assign({}, unit, {
      questions: selected.map(function (q, i) {
        var copy = Object.assign({}, q);
        delete copy.selected; delete copy.loading; delete copy._cat;
        copy.id = copy.id || ('q' + (i + 1));
        return copy;
      }),
      teachItBack: teachCount > 0
    });
  }
  function previewSelectedQuestions() {
    var cleanUnit = buildCleanSelectedUnit();
    if (!cleanUnit) return;
    CR.candidateUnit = CR.pendingUnit;
    assignmentPreview(cleanUnit, CR.pendingCtx);
  }
  // Publish directly from the sticky review bar (Preview stays available too).
  function publishFromReview() {
    var cleanUnit = buildCleanSelectedUnit();
    if (!cleanUnit) return;
    CR.candidateUnit = CR.pendingUnit;
    CR.pendingUnit = cleanUnit;
    confirmAssignment();
  }

  // Leaving the review workspace discards the unpublished draft — warn first
  // when there is work to lose.
  function exitReview() {
    var unit = CR.pendingUnit;
    var ctx = CR.pendingCtx || {};
    var hasWork = unit && (unit.questions || []).length > 0;
    var go = function () { CR.inQuestionSelection = false; openCreateAssignment(ctx.classroomId); };
    if (!hasWork) { go(); return; }
    if (typeof global.showAppModal === 'function') {
      global.showAppModal({
        icon: 'neutral',
        title: 'Discard this draft?',
        body: 'These questions have not been published yet. Leaving will discard them.',
        actions: [
          { label: 'Keep editing', cls: 'modal-cancel', fn: global.closeAppModal },
          { label: 'Discard', cls: 'btn btn-danger', fn: function () { global.closeAppModal(); go(); } }
        ]
      });
    } else if (!global.confirm || global.confirm('Discard this draft? Unpublished questions will be lost.')) {
      go();
    }
  }

  function backToQuestionSelection() {
    if (CR.candidateUnit && CR.pendingCtx) candidateSelection(CR.candidateUnit, CR.pendingCtx);
    else if (CR.pendingUnit && CR.pendingCtx) candidateSelection(CR.pendingUnit, CR.pendingCtx);
    else renderClassroom();
  }

  function previewQ(q, i) {
    var typeLabel = q.type === 'teachback' ? 'Teach it back' : 'Multiple choice';
    // Concept/category first (high-contrast light), then a muted separator and
    // the question type (muted). Never green for the category label.
    return '<button type="button" class="cl-preview-q" onclick="ClassroomUI.editQuestion(' + i + ')" aria-label="Edit question ' + (i + 1) + '">' +
      '<span class="cl-q-num">' + (i + 1) + '</span>' +
      '<div class="cl-q-body">' +
        '<div class="cl-q-tags">' +
          (q.skill ? '<span class="cl-q-cat">' + esc(D().humanizeSkill(q.skill)) + '</span><span class="cl-q-sep">·</span>' : '') +
          '<span class="cl-q-type">' + typeLabel + '</span>' +
        '</div>' +
        '<div class="cl-q-prompt">' + modelText(q.prompt) + '</div>' +
      '</div>' +
    '</button>';
  }

  function expandableCopy(label, value, cls) {
    var text = cleanText(value);
    if (!text) return '';
    var words = text.split(/\s+/).length;
    var inner = richText(text);
    if (words <= 80) return '<section class="cl-copy-section ' + (cls || '') + '"><div class="cl-copy-label">' + esc(label) + '</div>' + inner + '</section>';
    var preview = text.split(/\s+/).slice(0, 55).join(' ') + '…';
    return '<section class="cl-copy-section ' + (cls || '') + '"><div class="cl-copy-label">' + esc(label) + '</div>' +
      '<p>' + esc(preview) + '</p><details class="cl-disclosure"><summary>Show more</summary><div class="cl-disclosure-body">' + inner + '</div></details></section>';
  }

  function compareOutcomes(value) {
    var text = cleanText(value).replace(/\b(?:bar )?chart\b/gi, 'comparison')
      .replace(/which line shows/gi, 'Consider what happens to').replace(/the one sloping up or down/gi, 'whether the value rises or falls');
    if (!text) return '';
    var rows = text.split(/\.\s+/).map(function (part) { var i = part.indexOf(':'); return i > 0 ? [part.slice(0, i), part.slice(i + 1)] : null; }).filter(Boolean);
    var content = rows.length >= 2 ? rows.slice(0, 4).map(function (row) {
      return '<div class="cl-compare-row"><span>' + esc(row[0]) + '</span><strong>' + esc(row[1].replace(/\.$/, '')) + '</strong></div>';
    }).join('') : richText(text);
    return '<section class="cl-copy-section cl-compare"><div class="cl-copy-label">Compare the outcomes</div>' + content + '</section>';
  }

  // Unified preview for both a new assignment and a grounded targeted follow-up.
  // Follow-ups (ctx.isFollowup) get a "Based on classroom gap" banner, the AI's
  // explanation / real-world scenario / chart check, an estimated time, an
  // editable title, and an Add-question editor — the leader can edit everything
  // before publishing.
  function assignmentPreview(unit, ctx) {
    CR.inQuestionSelection = false;
    unit.title = cleanText(unit.title);
    unit.topic = cleanText(unit.topic);
    unit.explanation = cleanText(unit.explanation || '');
    unit.example = cleanText(unit.example || '');
    unit.scenario = cleanText(unit.scenario || '');
    unit.chartPrompt = cleanText(unit.chartPrompt || '');
    (unit.questions || []).forEach(function (q) {
      q.skill = D().humanizeSkill(q.skill || ''); q.prompt = cleanText(q.prompt);
      q.explanation = cleanText(q.explanation || '');
      if (q.choices) q.choices = q.choices.map(cleanText);
    });
    CR.pendingUnit = unit; CR.pendingCtx = ctx;
    // Counts recompute on every render, so manually-added questions update the
    // metadata line immediately. Question type is no longer hard-capped at five.
    var mcqCount = unit.questions.filter(function (q) { return q.type === 'mcq'; }).length;
    var teachCount = unit.questions.filter(function (q) { return q.type === 'teachback'; }).length;
    var isFollow = !!ctx.isFollowup;
    var backHandler = ctx.readonly ? "ClassroomUI.openGroup('" + ctx.classroomId + "')" : (isFollow
      ? (ctx.isDemo ? 'ClassroomUI.openDemo()' : "ClassroomUI.openInsights('" + ctx.classroomId + "','" + (ctx.sourceAssignmentId || CR.insightAssignment || '') + "')")
      : "ClassroomUI.backToQuestionSelection()");

    var banner = (isFollow && ctx.gapShort)
      ? '<div class="cl-gap-banner">' +
          '<div class="cl-gap-banner-kicker">Based on classroom gap</div>' +
          '<div class="cl-gap-banner-concept">' + esc(ctx.gapShort) + '</div>' +
          (ctx.objective ? '<div class="cl-gap-banner-obj"><span>Suggested objective</span>' + esc(ctx.objective) + '</div>' : '') +
        '</div>'
      : '';

    var est = estimateMinutes(unit);
    var meta = '<span>' + esc(unit.topic || '') + '</span>' +
      (unit.difficulty ? '<span>•</span><span>' + esc(unit.difficulty) + '</span>' : '') +
      '<span>•</span><span>' + mcqCount + ' ' + plural(mcqCount, 'question') + '</span>' +
      (teachCount ? '<span>•</span><span>' + teachCount + ' teach-it-back</span>' : '') +
      '<span>•</span><span>≈ ' + est + ' min</span>';

    var followTabs = '';
    var followContent = '';
    if (isFollow) {
      var brief = CR.brief || {};
      followTabs = '<div class="cl-segments" role="tablist">' +
        '<button class="is-active" data-follow-tab="activity" onclick="ClassroomUI.switchFollowupTab(\'activity\')">Activity</button>' +
        '<button data-follow-tab="facilitator" onclick="ClassroomUI.switchFollowupTab(\'facilitator\')">Facilitator</button>' +
        '<button data-follow-tab="settings" onclick="ClassroomUI.switchFollowupTab(\'settings\')">Settings</button></div>';
      followContent = '<div class="cl-follow-panel" data-follow-panel="activity">' +
          expandableCopy('Key idea', unit.explanation, 'cl-key-idea') +
          expandableCopy('Example', unit.example || brief.realWorldExample || '', '') +
          expandableCopy('Scenario', unit.scenario, '') + compareOutcomes(unit.chartPrompt) +
        '</div>' +
        '<div class="cl-follow-panel" data-follow-panel="facilitator" hidden>' +
          expandableCopy('Learning objective', ctx.objective || '', '') +
          expandableCopy('Observed misconception', brief.misconception || CR.lastGap || '', '') +
          expandableCopy('Suggested explanation', brief.plainExplanation || unit.explanation, '') +
          expandableCopy('Discussion prompt', brief.discussionQuestion || '', '') +
          expandableCopy('Follow-up check question', brief.followUpCheck || '', '') +
        '</div>' +
        '<div class="cl-follow-panel" data-follow-panel="settings" hidden>' +
          '<div class="cl-setting-row"><span>Difficulty</span><strong>' + esc(unit.difficulty || 'beginner') + '</strong></div>' +
          '<div class="cl-setting-row"><span>Estimated time</span><strong>' + est + ' minutes</strong></div>' +
          '<button type="button" class="cl-setting-row cl-setting-button" onclick="ClassroomUI.toggleDraftTeachback()"><span>Teach-it-back</span><strong>' + (teachCount ? 'On' : 'Off') + '</strong></button>' +
          '<button type="button" class="cl-btn cl-btn-line" onclick="ClassroomUI.editPreviewTitle()">Edit title</button>' +
          '<button type="button" class="cl-btn cl-btn-line cl-mt" onclick="ClassroomUI.openQuestionEditor(\'' + ctx.classroomId + '\')">Add question</button>' +
          '<button type="button" class="cl-btn cl-btn-line cl-mt" onclick="ClassroomUI.regenerateDraft()">Regenerate activity</button>' +
        '</div>' +
        '<div class="cl-draft-tools"><span>Claude draft tools</span>' +
          '<button onclick="ClassroomUI.transformDraft(\'shorten\')">Shorten</button>' +
          '<button onclick="ClassroomUI.transformDraft(\'easier\')">Make easier</button>' +
          '<button onclick="ClassroomUI.transformDraft(\'harder\')">More challenging</button>' +
          '<button onclick="ClassroomUI.regenerateDraft()">Regenerate questions</button></div>';
    }

    mount(
      '<div class="cl-screen cl-preview-screen">' +
        back(isFollow ? 'Insights' : 'Edit', backHandler) +
        (ctx.isDemo ? '<div class="cl-demo-tag">Demo data</div>' : '') +
        banner +
        '<div class="cl-kicker">' + (isFollow ? 'Targeted follow-up' : 'Assignment preview') + '</div>' +
        '<h1 class="cl-preview-title" id="clPreviewTitle">' + esc(unit.title) + '</h1>' +
        '<div class="cl-card-meta">' + meta + '</div>' +
        '<div class="cl-preview-facts">' +
          '<div><span>Topic</span><strong>' + esc(unit.topic || 'Assignment') + '</strong></div>' +
          '<div><span>Difficulty</span><strong>' + esc(unit.difficulty || 'beginner') + '</strong></div>' +
          '<div><span>Estimated time</span><strong>' + est + ' min</strong></div>' +
          '<div><span>Questions</span><strong>' + unit.questions.length + '</strong></div>' +
          '<div><span>Teach-it-back</span><strong>' + (teachCount ? 'Included' : 'Not included') + '</strong></div>' +
        '</div>' +
        '<div class="cl-preview-list cl-mt">' +
          unit.questions.map(previewQ).join('') +
          '<button type="button" class="cl-add-q" onclick="ClassroomUI.openQuestionEditor(\'' + ctx.classroomId + '\')">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
            'Add question</button>' +
        '</div>' +
        '<div class="cl-preview-actions">' +
          '<button type="button" class="cl-btn cl-btn-line" onclick="' + backHandler + '">' + (ctx.readonly ? 'Back to classroom' : (isFollow ? 'Back' : 'Back to question selection')) + '</button>' +
          (ctx.readonly ? '' : '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.confirmAssignment()">' + (isFollow ? 'Publish follow-up' : 'Publish assignment') + '</button>') +
        '</div>' +
      '</div>'
    );
  }

  function switchFollowupTab(tab) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-follow-tab]'), function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-follow-tab') === tab);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-follow-panel]'), function (p) {
      p.hidden = p.getAttribute('data-follow-panel') !== tab;
    });
  }

  // Finlingo-styled edit modal (replaces the native prompt). Because it is an
  // overlay layered over the current screen, the underlying filter and scroll
  // position are preserved automatically; Save re-renders in place and Cancel
  // simply closes.
  function editQuestionBody(q) {
    var isMcq = q.type !== 'teachback';
    var titleVal = esc(D().humanizeSkill(q.skill || ''));
    var promptVal = esc(cleanText(q.prompt || ''));
    var typeSel =
      '<option value="mcq"' + (isMcq ? ' selected' : '') + '>Multiple choice</option>' +
      '<option value="teachback"' + (!isMcq ? ' selected' : '') + '>Written response</option>';
    var rows = '';
    for (var i = 0; i < 4; i++) {
      var cv = esc((q.choices || [])[i] || '');
      var isCorrect = (q.answerIndex || 0) === i;
      rows += '<div class="cl-opt-row">' +
        '<input type="radio" name="clEditCorrect" value="' + i + '" id="clEditC' + i + '"' + (isCorrect ? ' checked' : '') +
          ' aria-label="Mark option ' + 'ABCD'[i] + ' correct">' +
        '<input class="cl-input" id="clEditOpt' + i + '" type="text" maxlength="160" placeholder="Option ' + 'ABCD'[i] + '" value="' + cv + '">' +
      '</div>';
    }
    var choicesBlock = '<div id="clEditChoices" class="cl-edit-choices"' + (isMcq ? '' : ' hidden') + '>' +
      field('Answer choices', '<div>' + rows + '</div>') +
      '<p class="cl-opt-hint">Select the radio beside the correct answer. Empty options are dropped.</p>' +
    '</div>';
    return '<form class="cl-form" onsubmit="return false;">' +
      field('Title', '<input class="cl-input" id="clEditTitle" type="text" maxlength="80" value="' + titleVal + '" placeholder="Concept or category">') +
      field('Question text', '<textarea class="cl-input" id="clEditPrompt" rows="3" maxlength="400" placeholder="The question learners see">' + promptVal + '</textarea>') +
      field('Response type', '<select class="cl-input" id="clEditType" onchange="ClassroomUI.toggleEditType()">' + typeSel + '</select>') +
      choicesBlock +
    '</form>';
  }

  function editQuestion(index, fromSelection) {
    var q = CR.pendingUnit && CR.pendingUnit.questions && CR.pendingUnit.questions[index];
    if (!q) return;
    // Fallback for environments with no modal host (keeps editing usable).
    if (typeof global.showAppModal !== 'function') {
      if (!global.prompt) return;
      var next = global.prompt('Question text', q.prompt);
      if (next && next.trim()) {
        q.prompt = cleanText(next).slice(0, 400);
        if (fromSelection || CR.inQuestionSelection) candidateSelection(CR.pendingUnit, CR.pendingCtx);
        else assignmentPreview(CR.pendingUnit, CR.pendingCtx);
      }
      return;
    }
    CR.editIndex = index;
    CR.editFromSelection = !!(fromSelection || CR.inQuestionSelection);
    global.showAppModal({
      icon: 'neutral',
      iconSvg: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
      title: 'Edit question',
      bodyIsHTML: true,
      body: editQuestionBody(q),
      boxClass: 'cl-edit-modal',
      actions: [
        { label: 'Cancel', cls: 'modal-cancel', fn: global.closeAppModal },
        { label: 'Save changes', cls: 'btn btn-primary', fn: function () { saveEditQuestion(); } }
      ]
    });
  }

  function toggleEditType() {
    var sel = document.getElementById('clEditType');
    var block = document.getElementById('clEditChoices');
    if (!sel || !block) return;
    block.hidden = sel.value === 'teachback';
  }

  function saveEditQuestion() {
    var q = CR.pendingUnit && CR.pendingUnit.questions && CR.pendingUnit.questions[CR.editIndex];
    if (!q) { if (global.closeAppModal) global.closeAppModal(); return; }
    var title = (((document.getElementById('clEditTitle') || {}).value) || '').trim();
    var prompt = (((document.getElementById('clEditPrompt') || {}).value) || '').trim();
    var type = (((document.getElementById('clEditType') || {}).value) === 'teachback') ? 'teachback' : 'mcq';
    if (!prompt) { toast('Add the question text', 'error'); return; }
    if (type === 'mcq') {
      var raw = [];
      for (var i = 0; i < 4; i++) raw.push((((document.getElementById('clEditOpt' + i) || {}).value) || '').trim());
      if (raw.filter(function (c) { return c; }).length < 2) { toast('Add at least two answer options', 'error'); return; }
      var correctEl = document.querySelector('input[name="clEditCorrect"]:checked');
      var correctIdx = correctEl ? parseInt(correctEl.value, 10) : 0;
      if (!raw[correctIdx]) { toast('The correct option can’t be empty', 'error'); return; }
      var choices = [], answerIndex = 0;
      raw.forEach(function (c, ix) { if (!c) return; if (ix === correctIdx) answerIndex = choices.length; choices.push(c); });
      q.type = 'mcq'; q.choices = choices; q.answerIndex = answerIndex;
    } else {
      q.type = 'teachback'; q._cat = 'teachback';
      delete q.choices; delete q.answerIndex;
      q.objective = q.objective || title || prompt;
    }
    q.skill = title || q.skill;
    q.prompt = cleanText(prompt).slice(0, 400);
    if (type === 'mcq' && q._cat === 'teachback') q._cat = candidateMeta(q);
    if (CR.pendingUnit) CR.pendingUnit.teachItBack = (CR.pendingUnit.questions || []).some(function (qq) { return qq.type === 'teachback'; });
    if (global.closeAppModal) global.closeAppModal();
    toast('Question updated', 'info');
    if (CR.editFromSelection || CR.inQuestionSelection) candidateSelection(CR.pendingUnit, CR.pendingCtx);
    else assignmentPreview(CR.pendingUnit, CR.pendingCtx);
  }

  function transformDraft(kind) {
    var unit = CR.pendingUnit;
    if (!unit) return;
    if (kind === 'shorten') {
      ['explanation', 'example', 'scenario'].forEach(function (key) {
        var limit = key === 'explanation' ? 60 : (key === 'example' ? 80 : 100);
        var words = cleanText(unit[key] || '').split(/\s+/);
        if (words.length > limit) unit[key] = words.slice(0, limit).join(' ').replace(/[,:;]$/, '') + '.';
      });
    } else {
      var ladder = ['beginner', 'intermediate', 'advanced'];
      var at = Math.max(0, ladder.indexOf(unit.difficulty || 'beginner'));
      var next = kind === 'easier' ? Math.max(0, at - 1) : Math.min(ladder.length - 1, at + 1);
      unit.difficulty = ladder[next];
    }
    toast('Draft updated', 'info');
    assignmentPreview(unit, CR.pendingCtx);
  }

  function toggleDraftTeachback() {
    var unit = CR.pendingUnit; if (!unit) return;
    var has = unit.questions.some(function (q) { return q.type === 'teachback'; });
    if (has) unit.questions = unit.questions.filter(function (q) { return q.type !== 'teachback'; });
    else unit.questions.push({ id: 'qteach' + Date.now(), type: 'teachback', skill: unit.topic + ' explain',
      prompt: 'Explain the main idea in one or two sentences.', objective: (unit.objectives || [])[0] || unit.topic, explanation: '' });
    unit.teachItBack = !has; toast('Draft updated', 'info'); assignmentPreview(unit, CR.pendingCtx);
  }

  function regenerateDraft() {
    var ctx = CR.pendingCtx, brief = CR.brief || {};
    if (!ctx || !ctx.isFollowup) return;
    var savedUnit = CR.pendingUnit;
    mount(loading('Regenerating the draft…'));
    D().classroomAI('followup_activity', {
      topic: brief.topic || (savedUnit && savedUnit.topic) || 'this topic',
      gap: brief.misconception || CR.lastGap || '', gapConcept: brief.gapConcept || '',
      objective: brief.objective || ctx.objective || '', objectives: CR.lastObjectives || []
    }).then(function (res) { assignmentPreview(res.activity, ctx); toast('Draft updated', 'info'); })
      .catch(function (err) { CR.pendingUnit = savedUnit; assignmentPreview(savedUnit, ctx); toast((err && err.message) || 'Could not regenerate the draft.', 'error'); });
  }

  // Inline title edit available on the follow-up preview.
  function editPreviewTitle() {
    var el = document.getElementById('clPreviewTitle');
    if (!el || !CR.pendingUnit) return;
    var next = global.prompt ? global.prompt('Activity title', CR.pendingUnit.title) : CR.pendingUnit.title;
    if (next && next.trim()) { CR.pendingUnit.title = next.trim().slice(0, 120); el.textContent = CR.pendingUnit.title; }
  }

  // ── Manual question editor (adds to the current draft; included on publish) ──
  function openQuestionEditor(classroomId, type) {
    if (!CR.pendingUnit) { renderClassroom(); return; }
    CR.qEditorType = type || CR.qEditorType || 'mcq';
    var isMcq = CR.qEditorType !== 'teachback';
    var typeOpts =
      '<option value="mcq"' + (isMcq ? ' selected' : '') + '>Multiple choice</option>' +
      '<option value="teachback"' + (!isMcq ? ' selected' : '') + '>Teach it back</option>';
    var optionsHtml = '';
    if (isMcq) {
      var rows = '';
      for (var i = 0; i < 4; i++) {
        rows += '<div class="cl-opt-row">' +
          '<input type="radio" name="clQECorrect" value="' + i + '" id="clQEC' + i + '"' + (i === 0 ? ' checked' : '') +
            ' aria-label="Mark option ' + 'ABCD'[i] + ' correct">' +
          '<input class="cl-input" id="clQEOpt' + i + '" type="text" maxlength="160" placeholder="Option ' + 'ABCD'[i] + '">' +
        '</div>';
      }
      optionsHtml = field('Answer options', '<div>' + rows + '</div>') +
        '<p class="cl-opt-hint">Select the radio beside the correct option. Empty options are dropped.</p>';
    }
    mount(
      '<div class="cl-screen">' +
        back('Preview', 'ClassroomUI.backToPreview()') +
        header('Add question', 'This question is added to the current assignment draft.') +
        '<form class="cl-form" onsubmit="return false;">' +
          field('Question type', '<select class="cl-input" id="clQEType" onchange="ClassroomUI.switchQuestionType(\'' + classroomId + '\')">' + typeOpts + '</select>') +
          field('Concept / category', '<input class="cl-input" id="clQECat" type="text" maxlength="80" placeholder="' + (isMcq ? 'Diversification basics' : 'Diversification explain') + '">') +
          field('Question text', '<textarea class="cl-input" id="clQEPrompt" rows="3" maxlength="400" placeholder="' + (isMcq ? 'What does diversification mainly do?' : 'In your own words, explain…') + '"></textarea>') +
          optionsHtml +
          field('Explanation' + (isMcq ? '' : ' (optional)'), '<textarea class="cl-input" id="clQEExpl" rows="2" maxlength="400" placeholder="' + (isMcq ? 'Why the correct answer is right.' : 'A model answer learners can compare against.') + '"></textarea>') +
          '<button type="button" class="cl-btn cl-btn-primary cl-mt" id="clQEBtn" onclick="ClassroomUI.submitNewQuestion(\'' + classroomId + '\')">Add to assignment</button>' +
        '</form>' +
      '</div>',
      function () { var el = document.getElementById('clQECat'); if (el) el.focus(); }
    );
  }

  function switchQuestionType(classroomId) {
    var sel = document.getElementById('clQEType');
    CR.qEditorType = (sel && sel.value === 'teachback') ? 'teachback' : 'mcq';
    openQuestionEditor(classroomId, CR.qEditorType);
  }

  function backToPreview() {
    if (CR.pendingUnit && CR.pendingCtx && CR.inQuestionSelection) candidateSelection(CR.pendingUnit, CR.pendingCtx);
    else if (CR.pendingUnit && CR.pendingCtx) assignmentPreview(CR.pendingUnit, CR.pendingCtx);
    else renderClassroom();
  }

  function submitNewQuestion(classroomId) {
    var unit = CR.pendingUnit;
    if (!unit) { renderClassroom(); return; }
    var type = ((document.getElementById('clQEType') || {}).value === 'teachback') ? 'teachback' : 'mcq';
    var cat = (((document.getElementById('clQECat') || {}).value) || '').trim();
    var prompt = (((document.getElementById('clQEPrompt') || {}).value) || '').trim();
    var expl = (((document.getElementById('clQEExpl') || {}).value) || '').trim();
    if (!prompt) { toast('Add the question text', 'error'); return; }
    CR.customSeq = (CR.customSeq || 0) + 1;
    var id = 'qcustom' + CR.customSeq;
    var q;
    if (type === 'teachback') {
      q = { id: id, type: 'teachback', skill: cat, prompt: prompt, objective: cat || prompt, explanation: expl };
    } else {
      var raw = [];
      for (var i = 0; i < 4; i++) raw.push((((document.getElementById('clQEOpt' + i) || {}).value) || '').trim());
      if (raw.filter(function (c) { return c; }).length < 2) { toast('Add at least two answer options', 'error'); return; }
      var correctEl = document.querySelector('input[name="clQECorrect"]:checked');
      var correctIdx = correctEl ? parseInt(correctEl.value, 10) : 0;
      if (!raw[correctIdx]) { toast('The correct option can’t be empty', 'error'); return; }
      // Drop empty options, keeping the correct answer aligned to its new index.
      var choices = [], answerIndex = 0;
      raw.forEach(function (c, idx) {
        if (!c) return;
        if (idx === correctIdx) answerIndex = choices.length;
        choices.push(c);
      });
      q = { id: id, type: 'mcq', skill: cat, prompt: prompt, choices: choices, answerIndex: answerIndex, explanation: expl };
    }
    unit.questions.push(q);
    unit.teachItBack = unit.questions.some(function (qq) { return qq.type === 'teachback'; });
    toast('Question added', 'info');
    if (CR.inQuestionSelection) candidateSelection(unit, CR.pendingCtx);
    else assignmentPreview(unit, CR.pendingCtx);
  }

  function confirmAssignment() {
    var unit = CR.pendingUnit, ctx = CR.pendingCtx;
    if (!unit || !ctx) { renderClassroom(); return; }
    // Demo follow-ups are read-only — never write demo data into a real group.
    if (ctx.isDemo) { demoAssignNotice(); return; }
    var isFollow = !!ctx.isFollowup;
    mount(loading(isFollow ? 'Publishing follow-up…' : 'Publishing assignment…'));
    var savePromise = ctx.draftAssignmentId
      ? D().updateAssignment(ctx.draftAssignmentId, unit, ctx.due || null, 'active')
      : D().createAssignment(ctx.classroomId, unit, ctx.due || null, 'active');
    var qCount = (unit.questions || []).length;
    savePromise.then(function (saved) {
      var title = unit.title;
      var assignmentId = (saved && saved.id) || ctx.draftAssignmentId || '';
      CR.pendingUnit = null; CR.pendingCtx = null;
      publishedScreen(ctx.classroomId, title, qCount, assignmentId);
    }).catch(function (err) {
      toast((err && err.message) || 'Could not publish. Please try again.', 'error');
      assignmentPreview(unit, ctx);
    });
  }

  // Inline published-success state (not toast-dependent): banner near the top
  // with Copy join code + View group.
  function publishedScreen(classroomId, title, count, assignmentId) {
    var viewHandler = assignmentId
      ? "ClassroomUI.openAssignmentPreview('" + classroomId + "','" + assignmentId + "')"
      : "ClassroomUI.openGroup('" + classroomId + "')";
    var render = function (code) {
      var countLabel = count ? (count + ' ' + plural(count, 'question')) : '';
      mount(
        '<div class="cl-screen">' +
          back('Classroom', 'renderClassroom()') +
          '<div class="cl-banner cl-banner-success">' +
            '<div class="cl-banner-icon">' + stateIcon('check') + '</div>' +
            '<div class="cl-banner-text">' +
              '<strong>Assignment published</strong>' +
              '<span>' + esc(title) + (countLabel ? ' · ' + countLabel : '') + '</span>' +
            '</div>' +
          '</div>' +
          (code ?
            '<div class="cl-card cl-code-card cl-code-card-sm cl-mt">' +
              '<div class="cl-code-inline">' +
                '<div><div class="cl-code-label">Join code</div>' +
                  '<div class="cl-code-mid">' + esc(code) + '</div></div>' +
                '<button type="button" class="cl-btn cl-btn-line cl-btn-compact" onclick="ClassroomUI.copyCode(\'' + esc(code) + '\')">Copy</button>' +
              '</div>' +
            '</div>' : '') +
          '<div class="cl-stack cl-mt">' +
            '<button type="button" class="cl-btn cl-btn-primary" onclick="' + viewHandler + '">View assignment</button>' +
            '<button type="button" class="cl-btn cl-btn-line" onclick="renderClassroom()">Return to classroom</button>' +
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
  // LEADER: assignment results
  // ════════════════════════════════════════════════════════════════════════
  function openInsights(classroomId, assignmentId) {
    mount(loading('Loading assignment results…'));
    var groupName = '';
    D().listGroups().then(function (groups) {
      setGroups(groups);
      var c = groupById(classroomId);
      groupName = c ? c.name : 'Classroom';
      var assignment = assignmentId && c
        ? (c.assignments || []).filter(function (a) { return a.id === assignmentId; })[0]
        : (c && c.latest_assignment);
      if (!c || !assignment) {
        mount('<div class="cl-screen">' + back('Classroom', "ClassroomUI.openGroup('" + classroomId + "')") +
          header('Assignment results', groupName) +
          '<div class="cl-empty"><p>No assignment selected. Create an assignment to start collecting responses.</p>' +
          '<button type="button" class="cl-btn cl-btn-primary" onclick="ClassroomUI.openCreateAssignment(\'' + classroomId + '\')">Create assignment</button></div></div>');
        return;
      }
      var joinCode = c.join_code || '';
      return D().aggregate(assignment.id).then(function (agg) {
        renderInsights(groupName, assignment, agg, classroomId, false, joinCode);
      });
    }).catch(function (err) {
      mount('<div class="cl-screen">' + back('Classroom', "ClassroomUI.openGroup('" + classroomId + "')") +
        errorBox((err && err.message) || 'Could not load assignment results.', 'ClassroomUI.openInsights(\'' + classroomId + '\',\'' + (assignmentId || '') + '\')') + '</div>');
    });
  }

  // Anonymized aggregate → group_insight payload (no names ever included).
  function insightPayload(content, assignment, agg) {
    return {
      topic: content.topic || assignment.topic,
      objectives: content.objectives || [],
      responseCount: D().totalGradedResponses(agg),
      skillStats: agg.skill_stats || [],
      choiceDistribution: agg.choice_distribution || [],
      teachbackExcerpts: agg.teachback_excerpts || [],
      correctExplanations: (content.questions || [])
        .filter(function (q) { return q.explanation; })
        .map(function (q) { return q.explanation; })
    };
  }

  // Shared by assignment results and the demo (demo passes isDemo=true + seeded data).
  // Hierarchy: A summary metrics → B what needs attention → C concept groups →
  // D Claude intervention brief → grounded actions.
  function renderInsights(groupName, assignment, agg, classroomId, isDemo, joinCode) {
    var content = assignment.content || {};
    var learners = Number(agg.learners) || 0;
    var completedCount = Number(agg.completed) || 0;
    var totalGraded = D().totalGradedResponses(agg);
    var completion = learners ? Math.round((agg.completed / agg.learners) * 100) : 0;
    var avgAcc = Math.round((agg.avg_accuracy || 0) * 100);
    var meets = D().meetsInsightThreshold(agg);

    var backBar = isDemo
      ? back('Exit demo', 'ClassroomUI.exitDemo()')
      : back('Classroom', "ClassroomUI.openGroup('" + classroomId + "')");
    var thresholdMsg = 'More responses are needed before Finlingo can identify a reliable pattern across learners.';

    // Empty state: no learners AND no responses yet.
    var hasData = learners > 0 || totalGraded > 0 || completedCount > 0;
    if (!hasData) {
      mount('<div class="cl-screen">' +
        backBar +
        (isDemo ? '<div class="cl-demo-tag">Demo data</div>' : '') +
        header('Assignment results', assignment.title || groupName) +
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
        '<div class="cl-mission-note">Designed for classrooms, nonprofits, and community financial-literacy programs.</div>' +
      '</div>');
      return;
    }

    var groups = D().groupConcepts(agg);
    var earlyTag = D().isEarlyResults(completedCount)
      ? '<span class="cl-early-tag" title="Fewer than 3 completed learners">Early results</span>' : '';

    var html = '<div class="cl-screen">' +
      backBar +
      (isDemo ? '<div class="cl-demo-tag">Demo data</div>' : '') +
      '<header class="cl-header cl-insights-header"><h1>' + esc(assignment.title || 'Assignment results') + '</h1>' +
        '<p>' + esc(groupName) + (statusText(assignment) ? ' · ' + esc(statusText(assignment)) : '') + earlyTag + '</p></header>' +
      // A. Summary metrics
      '<div class="cl-stat-grid">' +
        statCard(agg.learners || 0, 'Learners') +
        statCard(completion + '%', 'Completion rate') +
        statCard(avgAcc + '%', 'Average accuracy') +
        statCard(agg.completed || 0, 'Completed') +
      '</div>' +
      // B + D. Filled once Claude responds.
      '<div id="clAttention" class="cl-mt">' +
        (meets ? loading('Claude is reading learner responses…')
          : '<div class="cl-threshold">' + esc(thresholdMsg) + '</div>') +
      '</div>' +
      // C. Concept understanding (no AI required)
      conceptUnderstandingHtml(groups) +
      // D. Intervention brief + grounded actions
      '<div id="clBrief" class="cl-mt"></div>' +
      '<div class="cl-privacy-note">Based on anonymous learner responses.</div>' +
    '</div>';
    mount(html);

    if (!meets) return;

    var insightPromise = isDemo && agg._demoInsight
      ? Promise.resolve(agg._demoInsight)
      : D().classroomAI('group_insight', insightPayload(content, assignment, agg)).then(function (r) { return r.insight; });

    insightPromise.then(function (ins) {
      var brief = buildBrief(agg, content, ins, completedCount);
      CR.brief = brief;
      CR.insightClassroom = classroomId;
      CR.insightAssignment = assignment.id;
      CR.insightIsDemo = !!isDemo;
      CR.lastGap = ins.primaryGap;
      CR.lastTopic = brief.topic;
      CR.lastObjectives = content.objectives || [];

      var att = document.getElementById('clAttention');
      if (att) att.innerHTML = attentionHtml(brief);
      var bx = document.getElementById('clBrief');
      if (bx) bx.innerHTML = briefHtml(brief) + actionsHtml(isDemo) + '<div id="clActionOutput"></div>';
    }).catch(function () {
      var att = document.getElementById('clAttention');
      if (att) att.innerHTML = errorBox('Claude could not summarize the assignment right now.',
        isDemo ? 'ClassroomUI.openDemo()' : "ClassroomUI.openInsights('" + classroomId + "','" + assignment.id + "')");
    });
  }

  // ── Normalized intervention brief (prefers AI fields, falls back gracefully) ─
  function buildBrief(agg, content, ins, completed) {
    ins = ins || {};
    var topic = content.topic || '';
    var weak = D().weakestConcept(agg);
    var gapConcept = D().humanizeSkill(ins.gapConcept || (weak ? weak.skill : (topic || 'this concept')));
    return {
      topic: topic,
      completed: Number(completed) || 0,
      learners: Number(agg.learners) || 0,
      gapConcept: gapConcept,
      gapShort: gapConcept,
      objective: cleanText(ins.suggestedObjective || ins.recommendedFocus || ('Strengthen understanding of ' + lcFirst(gapConcept) + '.')),
      knows: cleanText(ins.whatTheyKnow || ins.summary || ''),
      misconception: cleanText(ins.primaryMisconception || ins.primaryGap || ''),
      whyItMatters: cleanText(ins.whyItMatters || ''),
      recommendedMove: cleanText(ins.recommendedMove || ins.recommendedFocus || ''),
      confidenceLabel: D().confidenceLabel(completed),
      confidenceTone: D().confidenceTone(completed),
      evidenceLine: D().gapEvidenceLine(weak, completed),
      evidenceUsed: deriveEvidenceUsed(agg),
      detailed: buildDetailed(ins),
      needsAttention: cleanText(needsAttentionHeadline(ins, gapConcept, completed)),
      // Facilitator-note source fields (AI-grounded, else concept-grounded fallback).
      discussionQuestion: cleanText(ins.discussionQuestion || ('Where does “' + gapConcept + '” hold up, and where does it break down?')),
      plainExplanation: cleanText(ins.plainExplanation || ins.whyItMatters || ins.recommendedMove || ('Learners need a clearer model of ' + lcFirst(gapConcept) + '.')),
      realWorldExample: cleanText(ins.realWorldExample || ('Think of an everyday situation where ' + lcFirst(gapConcept) + ' changes the outcome.')),
      followUpCheck: cleanText(ins.followUpCheck || ('Which statement best captures ' + lcFirst(gapConcept) + '?'))
    };
  }

  // One-sentence headline; stays measured for tiny groups (no "the group demonstrates").
  function needsAttentionHeadline(ins, gapConcept, completed) {
    var c = Number(completed) || 0;
    var concept = String(gapConcept || '').replace(/\.+$/, '');
    if (c <= 2 && concept) {
      var lead = (c <= 1) ? 'One completed response suggests' : 'Early responses suggest';
      return lead + ' a gap in ' + lcFirst(concept) + '.';
    }
    return ins.needsAttention || ins.primaryGap ||
      (concept ? ('Learners need support with ' + lcFirst(concept) + '.') : 'A shared learning gap is emerging.');
  }

  // "Evidence used" line for the brief, derived from the anonymized aggregate.
  function deriveEvidenceUsed(agg) {
    var dist = agg.choice_distribution || [];
    var wrong = dist.filter(function (d) { return !d.choice_correct; })
      .reduce(function (s, d) { return s + (Number(d.n) || 0); }, 0);
    var teachN = (agg.teachback_excerpts || []).length;
    var parts = [];
    if (wrong > 0) parts.push(wrong + ' incorrect multiple-choice ' + plural(wrong, 'response'));
    if (!parts.length) {
      var tg = D().totalGradedResponses(agg);
      if (tg > 0) parts.push(tg + ' graded ' + plural(tg, 'response'));
    }
    if (teachN > 0) parts.push('the teach-it-back ' + plural(teachN, 'explanation'));
    if (!parts.length) return 'Based on the responses collected so far.';
    return 'Based on ' + joinWithAnd(parts) + '.';
  }

  // Long-form analysis kept behind a "View detailed analysis" disclosure.
  function buildDetailed(ins) {
    var bits = [];
    if (ins.summary) bits.push(ins.summary);
    if (ins.primaryGap && ins.primaryGap !== ins.primaryMisconception) bits.push('Primary gap: ' + ins.primaryGap);
    if (ins.recommendedFocus && ins.recommendedFocus !== ins.recommendedMove) bits.push('Recommended focus: ' + ins.recommendedFocus);
    return bits.join('\n\n');
  }

  // ── B. What needs attention (visually dominant) ─────────────────────────────
  function attentionHtml(brief) {
    return '<section class="cl-attention">' +
      '<div class="cl-attention-kicker">What needs attention</div>' +
      '<h2 class="cl-attention-headline">' + esc(brief.needsAttention) + '</h2>' +
      '<div class="cl-attention-meta">' +
        (brief.evidenceLine ? '<span class="cl-attention-evidence">' + esc(brief.evidenceLine) + '</span>' : '') +
        '<span class="cl-conf cl-conf-' + esc(brief.confidenceTone) + '">' + esc(brief.confidenceLabel) + '</span>' +
      '</div>' +
    '</section>';
  }

  // ── C. Concept understanding (grouped, polished labels, % only when useful) ──
  function conceptUnderstandingHtml(groups) {
    if (!groups.rows.length) return '';
    var chip = function (it, tone) {
      return '<li class="cl-concept-chip cl-concept-chip-' + tone + '">' +
        '<span class="cl-concept-dot"></span>' +
        '<span class="cl-concept-name">' + esc(it.label) + '</span>' +
        (tone === 'needs' ? '<span class="cl-concept-pct">' + it.pct + '%</span>' : '') +
      '</li>';
    };
    var html = '<details class="cl-disclosure cl-concepts-disclosure cl-mt"><summary>View all concepts</summary><div class="cl-disclosure-body">';
    if (groups.understood.length) {
      html += '<div class="cl-concept-group">' +
        '<div class="cl-concept-group-label cl-concept-group-good">Understood</div>' +
        '<ul class="cl-concept-list">' + groups.understood.map(function (it) { return chip(it, 'good'); }).join('') + '</ul></div>';
    }
    if (groups.needs.length) {
      html += '<div class="cl-concept-group">' +
        '<div class="cl-concept-group-label cl-concept-group-needs">Needs reinforcement</div>' +
        '<ul class="cl-concept-list">' + groups.needs.map(function (it) { return chip(it, 'needs'); }).join('') + '</ul></div>';
    }
    html += groups.rows.map(conceptRow).join('') + '</div></details>';
    return html;
  }

  // ── D. Claude intervention brief ────────────────────────────────────────────
  function briefHtml(brief) {
    var block = function (label, text) {
      if (!text) return '';
      return '<div class="cl-brief-block"><div class="cl-brief-label">' + esc(label) + '</div>' +
        '<div class="cl-brief-text">' + richText(text) + '</div></div>';
    };
    return '<section class="cl-brief">' +
      '<div class="cl-brief-head"><span class="cl-brief-badge">Claude</span>Recommendation</div>' +
      '<div class="cl-brief-block cl-brief-move"><div class="cl-brief-label">Recommended move</div>' +
        '<div class="cl-brief-text">' + richText(brief.recommendedMove) + '</div></div>' +
      '<details class="cl-disclosure cl-disclosure-tight"><summary>See Claude’s reasoning</summary><div class="cl-disclosure-body">' +
        block('What learners know', brief.knows) + block('Primary misconception', brief.misconception) + block('Why it matters', brief.whyItMatters) +
        (brief.detailed ? brief.detailed.split('\n\n').map(function (p) { return '<p>' + modelText(p) + '</p>'; }).join('') : '') + '</div></details>' +
      '<details class="cl-disclosure cl-disclosure-tight"><summary>View evidence</summary><div class="cl-disclosure-body"><p>' + esc(brief.evidenceUsed) + '</p></div></details>' +
    '</section>';
  }

  // ── Grounded actions ────────────────────────────────────────────────────────
  function actionsHtml(isDemo) {
    return '<div class="cl-actions-grid cl-mt">' +
      '<button type="button" class="cl-btn cl-btn-primary cl-action-primary" onclick="ClassroomUI.buildFollowup(' + (isDemo ? 'true' : 'false') + ')">Build targeted follow-up</button>' +
      '<button type="button" class="cl-btn cl-btn-line" onclick="ClassroomUI.showAction(\'discussion\')">Create discussion prompt</button>' +
      '<button type="button" class="cl-btn cl-btn-line" onclick="ClassroomUI.showAction(\'explain\')">Explain this misconception</button>' +
      '<button type="button" class="cl-btn cl-btn-line" onclick="ClassroomUI.copyNotes()">Copy facilitator notes</button>' +
    '</div>';
  }

  function showAction(kind) {
    var brief = CR.brief; if (!brief) return;
    var out = document.getElementById('clActionOutput'); if (!out) return;
    var title, body, copyText;
    if (kind === 'discussion') {
      title = 'Discussion prompt';
      body = '<p class="cl-action-body">' + esc(brief.discussionQuestion) + '</p>';
      copyText = brief.discussionQuestion;
    } else {
      title = 'Explaining the misconception';
      var paras = [brief.plainExplanation];
      if (brief.realWorldExample) paras.push('Example: ' + brief.realWorldExample);
      body = paras.map(function (p) { return '<p class="cl-action-body">' + esc(p) + '</p>'; }).join('');
      copyText = paras.join('\n\n');
    }
    CR.actionCopyText = copyText;
    out.innerHTML = '<div class="cl-action-card">' +
      '<div class="cl-action-head">' + esc(title) +
        '<button type="button" class="cl-action-copy" onclick="ClassroomUI.copyActionText()">Copy</button></div>' +
      body +
      '<div class="cl-action-note">Grounded in the detected gap · anonymous learner responses.</div>' +
    '</div>';
    if (out.scrollIntoView) out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function copyActionText() {
    var t = CR.actionCopyText || '';
    if (!t) return;
    if (global.navigator && navigator.clipboard) {
      navigator.clipboard.writeText(t).then(function () { toast('Copied', 'info'); })
        .catch(function () { toast('Copy failed', 'error'); });
    } else { toast('Copied text is ready below', 'info'); }
  }

  // Concise, copyable facilitator notes built entirely from the grounded brief.
  function facilitatorNotes(brief) {
    return [
      'Objective:', brief.objective, '',
      'Observed misconception:', brief.misconception || ('Learners need support with ' + lcFirst(brief.gapConcept) + '.'), '',
      'Explanation:', brief.plainExplanation, '',
      'Real-world example:', brief.realWorldExample, '',
      'Discussion question:', brief.discussionQuestion, '',
      'Follow-up check question:', brief.followUpCheck, '',
      'Based on anonymous learner responses.'
    ].join('\n');
  }

  function copyNotes() {
    var brief = CR.brief; if (!brief) return;
    var notes = facilitatorNotes(brief);
    CR.actionCopyText = notes;
    if (global.navigator && navigator.clipboard) {
      navigator.clipboard.writeText(notes).then(function () { toast('Facilitator notes copied', 'info'); })
        .catch(function () { toast('Copy failed — notes are shown below', 'error'); });
    } else { toast('Facilitator notes are ready below', 'info'); }
    var out = document.getElementById('clActionOutput');
    if (out) {
      out.innerHTML = '<div class="cl-action-card">' +
        '<div class="cl-action-head">Facilitator notes' +
          '<button type="button" class="cl-action-copy" onclick="ClassroomUI.copyActionText()">Copy again</button></div>' +
        '<pre class="cl-notes">' + esc(notes) + '</pre>' +
      '</div>';
      if (out.scrollIntoView) out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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
    var label = D().humanizeSkill(c.skill);
    var tone = c.pct >= 67 ? 'good' : (c.pct >= 45 ? 'mid' : 'low');
    return '<div class="cl-concept">' +
      '<div class="cl-concept-top"><span>' + esc(label) + '</span><strong>' + c.pct + '%</strong></div>' +
      '<div class="cl-bar"><div class="cl-bar-fill cl-bar-' + tone + '" style="width:' + c.pct + '%"></div></div>' +
    '</div>';
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEADER: targeted follow-up (grounded in the detected gap)
  // ════════════════════════════════════════════════════════════════════════
  function buildFollowup(isDemo) {
    var brief = CR.brief;
    var demo = isDemo ? D().buildDemo() : null;
    mount('<div class="cl-screen cl-center cl-generating">' +
      '<div class="cl-spinner cl-spinner-lg"></div>' +
      '<h2 class="cl-gen-title">Claude is drafting follow-up candidates for ' + esc((brief && brief.gapShort) || 'this gap') + '</h2>' +
      '<p class="cl-gen-note">Targeting the detected gap — this usually takes a few seconds.</p>' +
    '</div>');

    var p = D().classroomAI('followup_activity', {
      topic: (brief && brief.topic) || CR.lastTopic || (demo && demo.followup.topic) || 'this topic',
      gap: CR.lastGap || (brief && brief.misconception) || (demo && demo.insight.primaryGap) || '',
      gapConcept: (brief && brief.gapConcept) || (demo && demo.insight.gapConcept) || '',
      objective: (brief && brief.objective) || '',
      objectives: CR.lastObjectives || []
    }).then(function (r) { return r.activity; }).catch(function (err) {
      if (isDemo && demo) return demo.followup; // graceful offline fallback for demo
      throw err;
    });

    p.then(function (activity) {
      openFollowupPreview(activity, isDemo);
    }).catch(function (err) {
      mount('<div class="cl-screen">' +
        back('Results', isDemo ? 'ClassroomUI.openDemo()' : "ClassroomUI.openInsights('" + (CR.insightClassroom || '') + "','" + (CR.insightAssignment || '') + "')") +
        errorBox((err && err.message) || 'Could not build the follow-up.',
          'ClassroomUI.buildFollowup(' + (isDemo ? 'true' : 'false') + ')') + '</div>');
    });
  }

  // Route the generated follow-up through the unified editor with a grounding
  // banner; the leader can edit the title, add questions, and publish.
  function openFollowupPreview(activity, isDemo) {
    var brief = CR.brief || {};
    var ctx = {
      classroomId: CR.insightClassroom || '',
      due: null,
      isFollowup: true,
      isDemo: !!isDemo,
      mode: 'claude',
      sourceAssignmentId: CR.insightAssignment || '',
      gapShort: activity.gapConcept || brief.gapShort || '',
      objective: brief.objective || (activity.objectives && activity.objectives[0]) || ''
    };
    if (ctx.sourceAssignmentId) activity.sourceAssignmentId = ctx.sourceAssignmentId;
    if (isDemo) { candidateSelection(activity, ctx); return; }
    D().createAssignment(ctx.classroomId, activity, null, 'draft').then(function (draft) {
      ctx.draftAssignmentId = draft && draft.id;
      candidateSelection(activity, ctx);
    }).catch(function () {
      candidateSelection(activity, ctx);
    });
  }

  // Group-detail "Build targeted follow-up": load the AI insight, then build —
  // so the follow-up is grounded even when the leader hasn't opened insights.
  function buildTargetedFollowup(classroomId, assignmentId) {
    mount(loading('Reading learner responses…'));
    D().listGroups().then(function (groups) {
      setGroups(groups);
      var c = groupById(classroomId);
      var assignment = assignmentId && c
        ? (c.assignments || []).filter(function (a) { return a.id === assignmentId; })[0]
        : (c && c.latest_assignment);
      if (!c || !assignment) { openInsights(classroomId, assignmentId); return; }
      var content = assignment.content || {};
      return D().aggregate(assignment.id).then(function (agg) {
        if (!D().meetsInsightThreshold(agg)) { openInsights(classroomId, assignment.id); return; }
        return D().classroomAI('group_insight', insightPayload(content, assignment, agg)).then(function (r) {
          var ins = r.insight;
          var brief = buildBrief(agg, content, ins, Number(agg.completed) || 0);
          CR.brief = brief;
          CR.insightClassroom = classroomId;
          CR.insightAssignment = assignment.id;
          CR.insightIsDemo = false;
          CR.lastGap = ins.primaryGap;
          CR.lastTopic = brief.topic;
          CR.lastObjectives = content.objectives || [];
          buildFollowup(false);
        });
      });
    }).catch(function (err) { toast((err && err.message) || 'Could not build the follow-up.', 'error'); openInsights(classroomId, assignmentId); });
  }

  function demoAssignNotice() {
    toast('In a real classroom this would publish the follow-up. (Demo data is read-only.)', 'info');
  }


  // ════════════════════════════════════════════════════════════════════════
  // DEMO classroom
  // ════════════════════════════════════════════════════════════════════════
  function openDemo() {
    var demo = D().buildDemo();
    var agg = Object.assign({}, demo.aggregate, { _demoInsight: demo.insight });
    renderInsights(demo.classroom.name, demo.assignment, agg, 'demo', true);
  }

  // Leave the read-only demo and return to the real classroom home. The toast
  // plus the relabelled "Exit demo" back button make the transition obvious.
  function exitDemo() {
    toast('Back to your classroom', 'info');
    renderClassroom();
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEARNER: home + join
  // ════════════════════════════════════════════════════════════════════════
  // Personal (learner) Classroom page: inline join-code entry, then the
  // classrooms already joined with their assigned activities. No creation or
  // authoring tools are shown in this mode.
  function renderLearnerHome() {
    mount('<div class="cl-screen">' +
      header('Classroom', 'Join a classroom and complete assigned activities.') +
      joinInlineCard() +
      '<div class="cl-section-title cl-mt">Classrooms you’ve joined</div>' +
      '<div id="clLearnerGroups">' + loading('Loading your classrooms…') + '</div></div>',
      bindJoinCodeInput);
    D().myMemberships().then(function (rows) {
      var box = document.getElementById('clLearnerGroups');
      if (!box) return;
      if (!rows.length) {
        box.innerHTML = '<div class="cl-empty cl-empty-compact"><p>You haven’t joined a classroom yet. Enter a join code above to get started.</p></div>';
        return;
      }
      box.innerHTML = rows.map(function (m) {
        var c = m.classrooms || {};
        return '<div class="cl-card cl-click-card" role="button" tabindex="0" onclick="ClassroomUI.cardOpen(event,\'learnerAssignments\',\'' + c.id + '\')" onkeydown="ClassroomUI.cardKey(event,\'learnerAssignments\',\'' + c.id + '\')">' +
          '<div class="cl-card-head"><strong>' + esc(c.name || 'Classroom') + '</strong></div>' +
          (c.description ? '<p class="cl-muted">' + esc(c.description) + '</p>' : '') +
          '<div class="cl-card-link">View assignments <span aria-hidden="true">→</span></div></div>';
      }).join('');
    }).catch(function () {
      var box = document.getElementById('clLearnerGroups');
      if (box) box.innerHTML = errorBox('Could not load your classrooms.', 'renderClassroom()');
    });
  }

  function joinInlineCard() {
    return '<div class="cl-card cl-join-card">' +
      '<div class="cl-join-fields">' +
        '<label class="cl-field"><span class="cl-field-label">Join code</span>' +
          '<input class="cl-input cl-input-code" id="clJoinCode" type="text" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="MONEY24"></label>' +
        '<label class="cl-field"><span class="cl-field-label">First name or nickname</span>' +
          '<input class="cl-input" id="clJoinName" type="text" maxlength="40" placeholder="Alex"></label>' +
      '</div>' +
      '<button type="button" class="cl-btn cl-btn-primary" id="clJoinBtn" onclick="ClassroomUI.submitJoin()">Join classroom</button>' +
    '</div>';
  }
  function bindJoinCodeInput() {
    var el = document.getElementById('clJoinCode');
    if (el) el.addEventListener('input', function () { el.value = el.value.toUpperCase(); });
  }

  function openJoin() {
    mount(
      '<div class="cl-screen">' +
        back('Classroom', 'renderClassroom()') +
        header('Join a classroom', 'Enter your join code to get started.') +
        '<form class="cl-form" onsubmit="return false;">' +
          field('Join code', '<input class="cl-input cl-input-code" id="clJoinCode" type="text" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="MONEY24">') +
          field('First name or nickname', '<input class="cl-input" id="clJoinName" type="text" maxlength="40" placeholder="Alex">') +
          '<button type="button" class="cl-btn cl-btn-primary cl-mt" id="clJoinBtn" onclick="ClassroomUI.submitJoin()">Join classroom</button>' +
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
      if (btn) { btn.disabled = false; btn.textContent = 'Join classroom'; }
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
          '<div class="cl-success-badge">' + stateIcon('check') + '</div>' +
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

  function openLearnerAssignments(classroomId) {
    mount(loading('Loading assignments…'));
    Promise.all([
      D().listAssignments(classroomId),
      D().myCompletedAssignmentIds(classroomId)
    ]).then(function (out) {
      var assignments = (out[0] || []).filter(function (a) { return (a.status || 'active') === 'active'; });
      var done = out[1] || {};
      if (!assignments.length) {
        mount('<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
          '<div class="cl-empty cl-empty-compact"><p>No published assignments in this classroom yet.</p></div></div>');
        return;
      }
      mount('<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
        header('Assignments', 'Choose an activity to complete.') +
        assignments.map(function (a) {
          var qCount = ((a.content || {}).questions || []).length;
          var isDone = !!done[a.id];
          return '<div class="cl-card cl-assignment-card cl-click-card" role="button" tabindex="0" onclick="ClassroomUI.cardOpen(event,\'learnerStart\',\'' + classroomId + '\',\'' + a.id + '\')" onkeydown="ClassroomUI.cardKey(event,\'learnerStart\',\'' + classroomId + '\',\'' + a.id + '\')">' +
            '<div class="cl-card-head"><div class="cl-card-head-main"><strong>' + esc(a.title || 'Assignment') + '</strong></div>' +
              (isDone ? '<span class="cl-status-pill cl-status-done">Completed</span>' : '<span class="cl-status-pill">Not started</span>') + '</div>' +
            '<div class="cl-card-meta"><span>' + qCount + ' questions</span>' + (statusText(a) ? '<span>·</span><span>' + esc(statusText(a)) + '</span>' : '') + '</div>' +
            '<div class="cl-card-link">' + (isDone ? 'Review' : 'Start') + ' <span aria-hidden="true">→</span></div></div>';
        }).join('') + '</div>');
    }).catch(function (err) {
      mount('<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
        errorBox((err && err.message) || 'Could not load assignments.', 'ClassroomUI.openLearnerAssignments(\'' + classroomId + '\')') + '</div>');
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // LEARNER: assignment player (reuses .ml-* quiz styling)
  // ════════════════════════════════════════════════════════════════════════
  function openLearnerAssignment(classroomId, assignmentId) {
    mount(loading('Loading assignment…'));
    var assignment;
    (assignmentId ? D().getAssignment(assignmentId) : D().getActiveAssignment(classroomId)).then(function (a) {
      assignment = a;
      if (!assignment) {
        mount('<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
          '<div class="cl-empty"><p>No published assignment in this classroom yet.</p></div></div>');
        return null;
      }
      return D().getMemberId(classroomId);
    }).then(function (memberId) {
      if (!assignment) return;
      if (!memberId) { toast('You are not a member of this classroom.', 'error'); renderClassroom(); return; }
      return D().startAttempt(assignment, memberId, classroomId).then(function (attempt) {
        CR.player = {
          classroomId: classroomId, assignment: assignment, attempt: attempt,
          questions: (assignment.content || {}).questions || [],
          content: assignment.content || {},
          idx: 0, score: 0, graded: 0, answered: false,
          results: [] // per-question {skill, type, prompt, correct, understood, evaluation}
        };
        renderQuestion();
      });
    }).catch(function (err) {
      mount('<div class="cl-screen">' + back('Classroom', 'renderClassroom()') +
        errorBox((err && err.message) || 'Could not start the assignment.', 'ClassroomUI.openLearnerAssignment(\'' + classroomId + '\'' + (assignmentId ? ',\'' + assignmentId + '\'' : '') + ')') + '</div>');
    });
  }

  function renderQuestion() {
    var p = CR.player;
    if (!p) { renderClassroom(); return; }
    if (p.idx >= p.questions.length) { finishAssignment(); return; }
    var q = p.questions[p.idx];
    // Progress reflects the CURRENT question number / total (Q2 of 5 = 40%),
    // not completed-so-far. Works for any total, not just five.
    var pct = Math.round(((p.idx + 1) / p.questions.length) * 100);
    p.answered = false; p.selected = null;

    var body;
    if (q.type === 'teachback') {
      body = '<textarea class="cl-input cl-teach" id="clTeach" rows="5" placeholder="Explain in your own words…"></textarea>';
    } else {
      body = '<div class="ml-choices" id="clChoices">' + q.choices.map(function (choice, i) {
        return '<button type="button" class="ml-choice" data-i="' + i + '">' +
          '<span class="ml-choice-letter">' + 'ABCD'[i] + '</span>' +
          '<span class="ml-choice-text">' + modelText(choice) + '</span>' +
          '<span class="ml-choice-mark"></span></button>';
      }).join('') + '</div>';
    }

    mount(
      '<div class="cl-screen cl-player">' +
        '<div class="cl-player-top">' +
          '<button type="button" class="cl-back-x" onclick="ClassroomUI.exitPlayer()" aria-label="Exit">' + stateIcon('cross') + '</button>' +
          '<div class="cl-bar cl-bar-slim"><div class="cl-bar-fill cl-bar-white" style="width:' + pct + '%"></div></div>' +
          '<span class="cl-qcount">' + (p.idx + 1) + '/' + p.questions.length + '</span>' +
        '</div>' +
        '<div class="ml-check">' +
          '<span class="ml-check-kicker">' + esc(D().humanizeSkill(q.skill || (q.type === 'teachback' ? 'Teach it back' : 'Quick check'))) + '</span>' +
          '<h2 class="ml-question">' + modelText(q.prompt) + '</h2>' +
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
        p.results.push({ skill: q.skill || '', type: 'teachback', prompt: q.prompt, understood: ev.understood, evaluation: ev });
        showTeachFeedback(ev);
      }).catch(function () {
        // Don't block completion on an eval failure — store ungraded.
        recordResponse(q, { text: text }, null, null);
        p.results.push({ skill: q.skill || '', type: 'teachback', prompt: q.prompt, understood: null, evaluation: null });
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
    p.results.push({ skill: q.skill || '', type: 'mcq', prompt: q.prompt, correct: correct, explanation: q.explanation || '' });
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
        var mark = b.querySelector('.ml-choice-mark');
        if (i === q.answerIndex) { b.classList.add('is-correct'); mark.innerHTML = stateIcon('check'); }
        else if (i === p.selected) {
          b.classList.add('is-wrong');
          // Red ✕ (matches the red card/feedback) — not the default green check.
          mark.classList.add('is-wrong');
          mark.innerHTML = stateIcon('cross');
        }
        b.disabled = true;
      });
    }
    var fb = document.getElementById('clFeedback');
    if (fb) fb.innerHTML = '<div class="ml-feedback ' + (correct ? 'ok' : 'no') + '">' +
      '<strong>' + (correct ? 'Correct.' : 'Not quite.') + '</strong>' +
      (q.explanation ? richText(q.explanation) : '') + '</div>';
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
      '<p>' + modelText(ev.feedback || '') + '</p>' +
      (ev.missing ? '<p class="cl-muted">Consider: ' + modelText(ev.missing) + '</p>' : '') + '</div>';
    var sub = document.getElementById('clSubmit');
    if (sub) { sub.disabled = false; sub.textContent = (p.idx + 1 >= p.questions.length) ? 'Finish' : 'Next question'; }
  }

  function recordResponse(q, responseData, isCorrect, evaluation) {
    var p = CR.player;
    // Best-effort persistence; never block the learner UI on the network.
    D().submitResponse(p.attempt.id, p.classroomId, q, responseData, isCorrect, evaluation)
      .catch(function () { p.persistFailed = true; toast('This response could not be saved. Check your connection.', 'error'); });
  }

  function finishAssignment() {
    var p = CR.player;
    var summary = buildLearnerSummary(p);
    mount(loading('Saving your results…'));
    D().completeAttempt(p.attempt.id, p.score, p.graded).then(function () {
        mount(
          '<div class="cl-screen cl-center">' +
            '<div class="cl-success-badge">' + stateIcon('check') + '</div>' +
            '<h1 class="cl-success-title">Assignment complete</h1>' +
            '<p class="cl-success-sub">You scored ' + p.score + ' of ' + p.graded + '</p>' +
            '<div class="cl-bar cl-mt"><div class="cl-bar-fill cl-bar-white" style="width:' + (p.graded ? Math.round(p.score / p.graded * 100) : 0) + '%"></div></div>' +
            '<p class="cl-muted cl-mt">Your responses are private. Your leader sees only anonymous learner results.</p>' +
            learnerSummaryHtml(summary) +
            '<button type="button" class="cl-btn cl-btn-primary cl-mt" onclick="renderClassroom()">Done</button>' +
          '</div>'
        );
        CR.player = null;
      }).catch(function (err) {
        mount('<div class="cl-screen">' + errorBox((err && err.message) || 'Could not save your completed assignment.', 'ClassroomUI.retryFinishAssignment()') +
          '<p class="cl-muted cl-mt">Your results are still open in this session.</p></div>');
      });
  }

  function retryFinishAssignment() { if (CR.player) finishAssignment(); else renderClassroom(); }

  // Derive a private, response-specific learning summary from the just-completed
  // attempt only. Objective concepts come from correct/incorrect MCQ data;
  // teach-it-back feedback reuses the structured AI grade when present. No fake
  // percentages or confidence scores, and no "mastered"-style overclaiming.
  function buildLearnerSummary(p) {
    var results = (p && p.results) || [];
    var bySkill = {};
    results.forEach(function (r) {
      if (r.type !== 'mcq') return;
      var key = D().humanizeSkill(r.skill || 'This concept');
      var s = bySkill[key] || (bySkill[key] = { skill: key, correct: 0, total: 0, correctExpl: '', missExpl: '' });
      s.total++;
      if (r.correct) { s.correct++; if (!s.correctExpl && r.explanation) s.correctExpl = r.explanation; }
      else if (!s.missExpl && r.explanation) s.missExpl = r.explanation;
    });
    var skills = Object.keys(bySkill).map(function (k) {
      var s = bySkill[k]; s.pct = s.total ? (s.correct / s.total) : 0; return s;
    });

    var know = skills.filter(function (s) { return s.correct >= 1 && s.pct >= 0.6; })
      .sort(function (a, b) { return b.pct - a.pct; }).slice(0, 2)
      .map(function (s) {
        return { title: s.skill, desc: s.correctExpl || ('You answered the ' + s.skill.toLowerCase() + ' question' + (s.correct === 1 ? '' : 's') + ' correctly.') };
      });
    var knowKeys = {}; know.forEach(function (k) { knowKeys[k.title] = true; });
    var review = skills.filter(function (s) { return (s.total - s.correct) >= 1 && !knowKeys[s.skill]; })
      .sort(function (a, b) { return a.pct - b.pct; }).slice(0, 2)
      .map(function (s) {
        return { title: s.skill, desc: s.missExpl ? ('Review: ' + s.missExpl) : ('Revisit ' + s.skill.toLowerCase() + ' and why the correct answer holds.') };
      });

    var teach = null;
    var tb = results.filter(function (r) { return r.type === 'teachback' && r.evaluation; })[0];
    if (tb) {
      var ev = tb.evaluation;
      teach = {
        good: ev.strengths || ev.feedback || 'You put the idea into your own words.',
        improve: ev.missing || ''
      };
    }
    return { know: know, review: review, teach: teach };
  }

  function learnerSummaryHtml(summary) {
    if (!summary || (!summary.know.length && !summary.review.length && !summary.teach)) return '';
    var html = '<div class="cl-ls">';
    if (summary.know.length) {
      html += '<div class="cl-ls-section"><div class="cl-ls-label">What you know</div>' +
        summary.know.map(function (it) {
          return '<div class="cl-ls-item cl-ls-item-know"><div class="cl-ls-title">' + esc(D().humanizeSkill(it.title)) + '</div>' +
            '<div class="cl-ls-desc">' + modelText(it.desc) + '</div></div>';
        }).join('') + '</div>';
    }
    if (summary.review.length) {
      html += '<div class="cl-ls-section"><div class="cl-ls-label">Review next</div>' +
        summary.review.map(function (it) {
          return '<div class="cl-ls-item cl-ls-item-review"><div class="cl-ls-title">' + esc(D().humanizeSkill(it.title)) + '</div>' +
            '<div class="cl-ls-desc">' + modelText(it.desc) + '</div></div>';
        }).join('') + '</div>';
    }
    if (summary.teach) {
      html += '<div class="cl-ls-section"><div class="cl-ls-label">Teach-it-back feedback</div>' +
        '<div class="cl-ls-item cl-ls-item-teach">' +
          '<div class="cl-ls-desc">' + modelText(summary.teach.good) + '</div>' +
          (summary.teach.improve ? '<div class="cl-ls-desc">To sharpen it: ' + modelText(summary.teach.improve) + '</div>' : '') +
        '</div></div>';
    }
    return html + '</div>';
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
    cardOpen: cardOpen,
    cardKey: cardKey,
    openGroup: openGroup,
    openAssignmentPreview: openAssignmentPreview,
    openDraftAssignment: openDraftAssignment,
    duplicateAssignment: duplicateAssignment,
    openEditGroup: openEditGroup,
    submitEditGroup: submitEditGroup,
    confirmDeleteGroup: confirmDeleteGroup,
    copyCode: copyCode,
    toggleMenu: toggleMenu,
    closeMenus: closeMenus,
    openCreateAssignment: openCreateAssignment,
    toggleTeach: toggleTeach,
    toggleDue: toggleDue,
    buildAssignment: buildAssignment,
    candidateSelection: candidateSelection,
    setQuestionFilter: setQuestionFilter,
    toggleCandidate: toggleCandidate,
    deleteCandidate: deleteCandidate,
    duplicateCandidate: duplicateCandidate,
    moveCandidate: moveCandidate,
    adjustQuestion: adjustQuestion,
    regenerateQuestion: regenerateQuestion,
    previewSelectedQuestions: previewSelectedQuestions,
    publishFromReview: publishFromReview,
    exitReview: exitReview,
    backToQuestionSelection: backToQuestionSelection,
    openQuestionEditor: openQuestionEditor,
    switchQuestionType: switchQuestionType,
    backToPreview: backToPreview,
    submitNewQuestion: submitNewQuestion,
    confirmAssignment: confirmAssignment,
    editPreviewTitle: editPreviewTitle,
    editQuestion: editQuestion,
    toggleEditType: toggleEditType,
    switchFollowupTab: switchFollowupTab,
    transformDraft: transformDraft,
    toggleDraftTeachback: toggleDraftTeachback,
    regenerateDraft: regenerateDraft,
    openInsights: openInsights,
    showAction: showAction,
    copyActionText: copyActionText,
    copyNotes: copyNotes,
    buildFollowup: buildFollowup,
    buildTargetedFollowup: buildTargetedFollowup,
    demoAssignNotice: demoAssignNotice,
    openDemo: openDemo,
    exitDemo: exitDemo,
    openJoin: openJoin,
    submitJoin: submitJoin,
    openLearnerAssignments: openLearnerAssignments,
    openLearnerAssignment: openLearnerAssignment,
    submitAnswer: submitAnswer,
    retryFinishAssignment: retryFinishAssignment,
    exitPlayer: exitPlayer
  };

})(typeof window !== 'undefined' ? window : this);
