/* ============================================================
   home.js
   The Home screen — the default post-login surface. NOT aliased
   to Coach: it is its own dashboard with two real states.

     • New user      → no saved/generated unit and no active lesson
     • Returning user → has a saved/generated unit or an active lesson

   Everything shown is REAL: user name / streak from state (S), unit &
   lesson progress from MicroData/MicroProgress + CoachUnits, market
   figures from the same live snapshot the Market & Coach screens use
   (ensureMarketSnapshot / _marketRecapMovers / _computeMarketSentiment).
   Nothing here fabricates a price, a streak, a name, or a lesson.

   Handoffs reuse existing flows only:
     • Build a unit / topic rows → the Coach depth-selector builder
     • Ask input / chips / row    → the Coach (showCoach + CoachPage.ask)
     • Continue lesson            → openMicroUnit(id)
     • View all units             → showLearn() (Learn / My Units)
     • Market action              → Coach with a market-tagged prompt
   ============================================================ */
(function (global) {
  'use strict';

  var ICONS = {
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    chevron: '<svg class="home-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="none"><path d="M11 2c.35 4.02 2.48 6.15 6.5 6.5-4.02.35-6.15 2.48-6.5 6.5-.35-4.02-2.48-6.15-6.5-6.5C8.52 8.15 10.65 6.02 11 2z"/><path d="M18.5 13.5c.2 2.1 1.4 3.3 3.5 3.5-2.1.2-3.3 1.4-3.5 3.5-.2-2.1-1.4-3.3-3.5-3.5 2.1-.2 3.3-1.4 3.5-3.5z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3 4 4.5 4 8a4 4 0 0 1-8 0c0-1.2.4-2 1-2.8C8.5 9.5 9 6 12 2z"/><path d="M12 22a5 5 0 0 0 5-5c0-2-1.5-3.5-2.5-4.5-.3 1.6-1.3 2.3-2.5 2.5-1.4.2-2.2-.7-2.2-1.8C8 15 7 16 7 17a5 5 0 0 0 5 5z"/></svg>'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function _state() { return (typeof S !== 'undefined' && S) ? S : {}; }
  function _ts(s) { var t = s ? Date.parse(s) : 0; return isFinite(t) ? t : 0; }

  // ── Greeting / identity ──────────────────────────────────────────────
  function _timeGreeting() {
    var h = 12;
    try { h = new Date().getHours(); } catch (_) {}
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }
  function _firstName() {
    var u = _state().user || {};
    var n = (u.name ? String(u.name) : '').trim();
    if (!n || n.toLowerCase() === 'guest' || n.toLowerCase() === 'user') return '';
    return n.split(/\s+/)[0];
  }
  function _streak() {
    var n = Number(_state().streak);
    return isFinite(n) && n > 0 ? n : 0;
  }

  // ── Unit / lesson progress (real) ────────────────────────────────────
  function _customUnits() {
    try { return (global.CoachUnits ? global.CoachUnits.all() : []) || []; } catch (_) { return []; }
  }
  // Build the list of learnable units (generated + preset micro-units) with
  // canonical progress summaries, so we can pick a real "continue" target.
  function _unitCandidates() {
    var MD = global.MicroData, MP = global.MicroProgress;
    if (!MD || !MP) return [];
    var out = [];
    _customUnits().forEach(function (u) {
      var norm = null;
      try { norm = MD.getMicroUnit(u.id); } catch (_) {}
      if (!norm || !Array.isArray(norm.lessons) || !norm.lessons.length) return;
      var info = null;
      try { info = MP.summary(u.id, norm); } catch (_) {}
      if (!info) return;
      out.push({ id: u.id, title: u.title || norm.title || 'Custom unit', info: info, source: 'custom' });
    });
    [1, 2, 3, 4, 5, 6].forEach(function (n) {
      var norm = null;
      try { norm = MD.getPresetMicroUnitByUnitId(n); } catch (_) {}
      if (!norm || !Array.isArray(norm.lessons) || !norm.lessons.length) return;
      var info = null;
      try { info = MP.summary(norm.id, norm); } catch (_) {}
      if (!info) return;
      out.push({ id: norm.id, title: norm.title || ('Unit ' + n), info: info, source: 'preset', unitNo: n });
    });
    return out;
  }
  // Most sensible unit to resume/continue, or null.
  function _resumeTarget() {
    var cands = _unitCandidates();
    if (!cands.length) return null;
    var inProgress = cands.filter(function (c) { return c.info.started && !c.info.completed; })
      .sort(function (a, b) { return _ts(b.info.lastOpenedAt) - _ts(a.info.lastOpenedAt); });
    if (inProgress[0]) return inProgress[0];
    var customOpen = cands.filter(function (c) { return c.source === 'custom' && !c.info.completed; });
    if (customOpen.length) return customOpen[customOpen.length - 1];
    var presetOpen = cands.filter(function (c) { return c.source === 'preset' && !c.info.completed; });
    if (presetOpen[0]) return presetOpen[0];
    return cands[0];
  }
  // Returning = has a saved/generated unit OR any started/completed learning.
  function _isReturning() {
    if (_customUnits().length > 0) return true;
    var st = _state();
    if (Array.isArray(st.completedIds) && st.completedIds.length > 0) return true;
    return _unitCandidates().some(function (c) { return c.info.started || c.info.completed; });
  }

  // ── Market read (real, shared snapshot) ──────────────────────────────
  var MOOD = {
    'extreme-fear': 'cautious', 'fear': 'cautious',
    'neutral': 'mixed',
    'greed': 'constructive', 'extreme-greed': 'constructive'
  };
  function _fmtPct(pct) {
    var v = Number(pct);
    if (!isFinite(v)) return '—';
    return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%';
  }
  function _marketData() {
    try { if (typeof ensureMarketSnapshot === 'function') ensureMarketSnapshot(); } catch (_) {}
    var movers = (typeof _marketRecapMovers === 'function') ? _marketRecapMovers() : [];
    var sentiment = (typeof _computeMarketSentiment === 'function') ? _computeMarketSentiment() : { available: false };
    var learn = (typeof _marketRecapLearn === 'function') ? _marketRecapLearn(movers) : null;
    var ready = (typeof _marketSnapshot !== 'undefined') && _marketSnapshot && _marketSnapshot.status === 'ready';
    return {
      movers: movers,
      sentiment: sentiment,
      learn: learn,
      ready: ready,
      anyAvail: movers.some(function (m) { return m.available; })
    };
  }
  function _moodWord(d) {
    if (d.sentiment && d.sentiment.available && d.sentiment.band) {
      return MOOD[d.sentiment.band.key] || 'mixed';
    }
    return 'quiet';
  }
  function _tickerRow(m) {
    var cls = m.available ? m.tone : 'flat';
    return '<div class="home-ticker">' +
      '<span class="home-ticker-sym">' + esc(m.symbol) + '</span>' +
      '<span class="home-ticker-pct ' + cls + '">' + (m.available ? _fmtPct(m.pct) : '—') + '</span>' +
      '</div>';
  }
  // variant: 'full' (new user) | 'compact' (returning user)
  function _marketReadInner(variant) {
    var d = _marketData();
    if (!d.anyAvail) {
      return '<div class="home-market-status"><span class="home-market-dot"></span>' +
        '<strong>Market data updates at the next session</strong></div>' +
        '<p class="home-market-copy">Live moves for the S&amp;P 500, Nasdaq-100, and Bitcoin appear here during market hours.</p>' +
        '<button type="button" class="home-market-action" onclick="Home.understandMarket()">Ask about the markets ' + ICONS.arrow + '</button>';
    }
    var mood = _moodWord(d);
    var copy = (d.sentiment && d.sentiment.available && (d.sentiment.meaning || d.sentiment.driver))
      || (d.learn && d.learn.why) || 'Higher-volatility assets are the ones to watch today.';
    var head = '<div class="home-market-status"><span class="home-market-dot"></span>' +
      '<strong>Markets are ' + esc(mood) + ' today</strong></div>';

    if (variant === 'compact') {
      var line = d.movers.filter(function (m) { return m.available; }).map(function (m) {
        return esc(m.symbol) + ' <span class="' + m.tone + '">' + _fmtPct(m.pct) + '</span>';
      }).join(' · ');
      return head +
        (line ? '<p class="home-market-movers">' + line + '</p>' : '') +
        '<p class="home-market-copy">' + esc(copy) + '</p>' +
        '<button type="button" class="home-market-action" onclick="Home.understandMarket()">Understand today’s move ' + ICONS.arrow + '</button>';
    }

    var score = '';
    if (d.sentiment && d.sentiment.available) {
      score = '<div class="home-market-score"><b>' + esc(d.sentiment.band.label) + ' · ' +
        esc(String(d.sentiment.score)) + '</b><span>(Sentiment Index)</span></div>';
    }
    return head + score +
      '<p class="home-market-copy">' + esc(copy) + '</p>' +
      '<div class="home-tickers">' + d.movers.map(_tickerRow).join('') + '</div>' +
      '<button type="button" class="home-market-action" onclick="Home.understandMarket()">Understand today’s move ' + ICONS.arrow + '</button>';
  }

  // Re-paint the market read once the live snapshot loads (mirrors Coach brief).
  var _marketPoll = null;
  function _scheduleMarketRefresh() {
    if (_marketPoll) { clearInterval(_marketPoll); _marketPoll = null; }
    var ready = function () { return (typeof _marketSnapshot !== 'undefined') && _marketSnapshot && _marketSnapshot.status === 'ready'; };
    if (ready()) return;
    var ticks = 0;
    _marketPoll = setInterval(function () {
      ticks += 1;
      var el = document.getElementById('homeMarketRead');
      var stop = ready() || ticks > 14 || !el;
      if (el && ready()) el.innerHTML = _marketReadInner(el.getAttribute('data-variant') || 'full');
      if (stop) { clearInterval(_marketPoll); _marketPoll = null; }
    }, 700);
  }
  function _marketReadBlock(variant) {
    return '<div id="homeMarketRead" data-variant="' + variant + '">' + _marketReadInner(variant) + '</div>';
  }

  // ── Row-list builder ─────────────────────────────────────────────────
  function _topicRows(topics, loose) {
    return '<div class="home-rows' + (loose ? ' home-rows-loose' : '') + '">' +
      topics.map(function (t) {
        return '<button type="button" class="home-row" onclick="Home.buildUnit(' + JSON.stringify(t.topic).replace(/"/g, '&quot;') + ')">' +
          '<span>' + esc(t.label) + '</span>' + ICONS.chevron + '</button>';
      }).join('') + '</div>';
  }

  // ════════════════════════════════════════════════════════════════════
  //  NEW-USER HOME
  // ════════════════════════════════════════════════════════════════════
  function _renderNewUser() {
    var greeting = _timeGreeting();
    var topics = [
      { label: 'How do interest rates affect stocks?', topic: 'how interest rates affect stocks' },
      { label: 'Teach me how to read financial statements', topic: 'how to read financial statements' },
      { label: 'Explain options for a beginner', topic: 'options for a beginner' }
    ];
    return '<div class="home-shell">' +
      // Greeting
      '<section class="home-greeting">' +
        '<p class="home-eyebrow is-accent">Today</p>' +
        '<h2 class="home-greet-title">' + esc(greeting) + '.</h2>' +
        '<p class="home-greet-sub">Keep learning, understand the market, or ask Finlingo a question.</p>' +
      '</section>' +

      // Build your first unit
      '<section class="home-section">' +
        '<div class="home-card home-card-feature">' +
          '<p class="home-eyebrow is-accent">Start learning</p>' +
          '<h3 class="home-card-title">Build your first unit</h3>' +
          '<p class="home-card-desc">Turn any finance question into a short lesson path you can save, revisit, and master.</p>' +
          '<button type="button" class="home-btn home-btn-primary" onclick="Home.buildUnit(\'\')">Build a unit ' + ICONS.arrow + '</button>' +
        '</div>' +
      '</section>' +

      // Starter topic rows (prefill the builder)
      '<section class="home-section">' +
        '<p class="home-eyebrow">Start with a topic</p>' +
        _topicRows(topics, false) +
      '</section>' +

      // Ask Finlingo
      '<section class="home-section">' +
        '<p class="home-eyebrow">Ask Finlingo</p>' +
        '<div class="home-card">' +
          '<h3 class="home-ask-title">Ask Finlingo</h3>' +
          '<p class="home-ask-desc">Get a simple explanation, example, quiz, or personalized lesson.</p>' +
          '<form class="home-ask-field" onsubmit="return Home.askSubmit(event)">' +
            '<input id="homeAskInput" type="text" maxlength="500" autocomplete="off" placeholder="Ask about markets, investing, or finance" aria-label="Ask about markets, investing, or finance"/>' +
            '<button type="submit" class="home-ask-send" aria-label="Ask Finlingo">' + ICONS.send + '</button>' +
          '</form>' +
          '<div class="home-chips">' +
            '<button type="button" class="home-chip" onclick="Home.ask(\'Explain today\\u2019s market move\')">Explain today’s market move</button>' +
            '<button type="button" class="home-chip" onclick="Home.ask(\'Quiz me on interest rates\')">Quiz me on interest rates</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      // Compact Market Read
      '<section class="home-section">' +
        '<p class="home-eyebrow">Market read</p>' +
        '<div class="home-card">' + _marketReadBlock('full') + '</div>' +
      '</section>' +
    '</div>';
  }

  // ════════════════════════════════════════════════════════════════════
  //  RETURNING-USER HOME
  // ════════════════════════════════════════════════════════════════════
  function _continueMeta(info) {
    var total = Number(info.total) || 0;
    if (info.completed) {
      return { lesson: 'Unit complete · review anytime', pct: 100, label: 'Review lesson' };
    }
    var idx = Math.max(0, Math.min(total - 1, Number(info.currentLessonIndex) || 0));
    var lessonNo = Math.min(total, idx + 1);
    var done = Math.min(total, Number(info.completedCount) || 0);
    var pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      lesson: total > 0 ? ('Lesson ' + lessonNo + ' of ' + total) : 'Ready to start',
      pct: pct,
      label: info.started ? 'Continue lesson' : 'Start lesson'
    };
  }

  function _renderReturning() {
    var greeting = _timeGreeting();
    var name = _firstName();
    var streak = _streak();
    var target = _resumeTarget();

    var greetLine = greeting + (name ? (', ' + name) : '') + '.';
    var streakHtml = streak > 0
      ? '<div class="home-streak">' + ICONS.flame + '<span>' + streak + ' Day Streak</span></div>'
      : '';

    // Continue-learning card (only when there's a real unit to resume)
    var continueHtml = '';
    if (target) {
      var meta = _continueMeta(target.info);
      continueHtml =
        '<section class="home-section">' +
          '<div class="home-card home-card-feature">' +
            '<div class="home-continue-top">' +
              '<div>' +
                '<p class="home-eyebrow is-accent" style="margin-bottom:6px;">Continue learning</p>' +
                '<h3 class="home-card-title" style="margin:0;">' + esc(target.title) + '</h3>' +
              '</div>' +
              (target.source === 'preset' && target.unitNo
                ? '<span class="home-continue-unit">Unit ' + esc(String(target.unitNo)) + '</span>'
                : '<span class="home-continue-unit">Your unit</span>') +
            '</div>' +
            '<div class="home-continue-meta">' +
              '<span class="home-continue-lesson">' + esc(meta.lesson) + '</span>' +
              '<span class="home-continue-pct">' + meta.pct + '%</span>' +
            '</div>' +
            '<div class="home-progress"><span style="width:' + meta.pct + '%"></span></div>' +
            '<div class="home-continue-actions">' +
              '<button type="button" class="home-btn home-btn-primary home-btn-block" onclick="Home.continueLesson(' + JSON.stringify(target.id).replace(/"/g, '&quot;') + ')">' + esc(meta.label) + ' ' + ICONS.arrow + '</button>' +
              '<button type="button" class="home-btn home-btn-ghost" onclick="Home.viewAllUnits()">View all units</button>' +
            '</div>' +
          '</div>' +
        '</section>';
    }

    var exploreTopics = [
      { label: 'Understanding market volatility', topic: 'understanding market volatility' },
      { label: 'How compound interest builds wealth', topic: 'how compound interest builds wealth' },
      { label: 'Why interest rates affect stocks', topic: 'why interest rates affect stocks' }
    ];

    return '<div class="home-shell">' +
      // Greeting
      '<section class="home-greeting">' +
        '<p class="home-eyebrow">Welcome back</p>' +
        '<h2 class="home-greet-title">' + esc(greetLine) + '</h2>' +
        streakHtml +
      '</section>' +

      continueHtml +

      // Compact Market Read
      '<section class="home-section">' +
        '<div class="home-section-head"><h3>Market Read</h3><span class="home-section-live">Live</span></div>' +
        '<div class="home-card">' + _marketReadBlock('compact') + '</div>' +
      '</section>' +

      // Compact Ask row
      '<section class="home-section">' +
        '<div class="home-card">' +
          '<button type="button" class="home-ask-row" onclick="Home.openCoach()">' +
            '<span class="home-ask-icon">' + ICONS.spark + '</span>' +
            '<span class="home-ask-row-body"><strong>Ask Finlingo</strong><span>Get help with a lesson or finance question</span></span>' +
            ICONS.chevron +
          '</button>' +
        '</div>' +
      '</section>' +

      // Learn Next
      '<section class="home-section">' +
        '<p class="home-eyebrow">Learn next</p>' +
        '<div class="home-card">' +
          '<button type="button" class="home-learnnext" onclick="Home.buildUnit(\'how interest rates move markets\')">' +
            '<span class="home-learnnext-icon">' + ICONS.analytics + '</span>' +
            '<span class="home-learnnext-body">' +
              '<h4>How interest rates move markets</h4>' +
              '<span class="home-learnnext-meta">4 min · Beginner</span>' +
            '</span>' +
            ICONS.chevron +
          '</button>' +
        '</div>' +
      '</section>' +

      // Explore Topics (text rows only)
      '<section class="home-section">' +
        '<div class="home-section-head"><h3>Explore Topics</h3>' +
          '<button type="button" class="home-section-link" onclick="Home.viewAllUnits()">View all</button></div>' +
        _topicRows(exploreTopics, true) +
      '</section>' +
    '</div>';
  }

  // ── Render ───────────────────────────────────────────────────────────
  function renderHome() {
    var root = document.getElementById('homeRoot');
    if (!root) return;
    root.innerHTML = _isReturning() ? _renderReturning() : _renderNewUser();
    _scheduleMarketRefresh();
  }

  // ── Handoffs (reuse existing flows only) ─────────────────────────────
  function _goCoach() {
    if (typeof showCoach === 'function') showCoach({ resetScroll: true });
  }
  function buildUnit(topic) {
    var t = (topic || '').trim();
    _goCoach();
    setTimeout(function () {
      if (!(global.CoachPage && typeof global.CoachPage.ask === 'function')) return;
      if (t) {
        global.CoachPage.ask(t, { intent: 'build', topic: t, userLabel: 'Build a unit on ' + t, source: 'home' });
      } else {
        // Generic first-unit build — the app's existing default topic.
        global.CoachPage.ask('investing for beginners', { intent: 'build', topic: 'investing for beginners', userLabel: 'Build a beginner unit', source: 'home' });
      }
    }, 0);
  }
  function ask(prompt) {
    var t = (prompt || '').trim();
    if (!t) return;
    _goCoach();
    setTimeout(function () {
      if (global.CoachPage && typeof global.CoachPage.ask === 'function') {
        global.CoachPage.ask(t, { source: 'home' });
      }
    }, 0);
  }
  function askSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();
    var input = document.getElementById('homeAskInput');
    var val = input ? input.value.trim() : '';
    if (input) input.value = '';
    if (val) ask(val);
    return false;
  }
  function openCoach() { _goCoach(); }
  function continueLesson(id) {
    if (typeof openMicroUnit === 'function' && id) openMicroUnit(id);
    else if (typeof showLearn === 'function') showLearn({ resetScroll: true });
  }
  function viewAllUnits() {
    if (typeof showLearn === 'function') showLearn({ resetScroll: true });
  }
  function understandMarket() {
    var d = _marketData();
    var prompt = d.anyAvail
      ? 'Explain today’s market move in plain English and what’s driving it.'
      : 'What should I understand about the markets right now?';
    _goCoach();
    setTimeout(function () {
      if (global.CoachPage && typeof global.CoachPage.ask === 'function') {
        global.CoachPage.ask(prompt, { source: 'home-market', marketTopic: (d.learn && d.learn.name) || '' });
      }
    }, 0);
  }

  // ── Bottom-nav routing + active/visibility sync ──────────────────────
  var NAV_SCREENS = { homeScreen: 'home', pathScreen: 'learn', marketScreen: 'market', coachScreen: 'coach' };
  var NAV_ITEMS = { home: 'abnHome', learn: 'abnLearn', market: 'abnMarket', coach: 'abnCoach' };

  function nav(section) {
    if (section === 'home' && typeof showHome === 'function') showHome({ resetScroll: true });
    else if (section === 'learn' && typeof showLearn === 'function') showLearn({ resetScroll: true });
    else if (section === 'market' && typeof showMarket === 'function') showMarket({ resetScroll: true });
    else if (section === 'coach' && typeof showCoach === 'function') showCoach({ resetScroll: true });
  }

  function _syncNav(screenId) {
    var section = NAV_SCREENS[screenId] || null;
    document.body.classList.toggle('has-app-nav', !!section);
    Object.keys(NAV_ITEMS).forEach(function (key) {
      var el = document.getElementById(NAV_ITEMS[key]);
      if (!el) return;
      var on = key === section;
      el.classList.toggle('is-active', on);
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }

  if (global.addEventListener) {
    global.addEventListener('finlingo:screen-changed', function (event) {
      _syncNav(event && event.detail ? event.detail.id : (document.body.dataset.activeScreen || ''));
    });
  }

  global.renderHome = renderHome;
  global.Home = {
    render: renderHome,
    nav: nav,
    buildUnit: buildUnit,
    ask: ask,
    askSubmit: askSubmit,
    openCoach: openCoach,
    continueLesson: continueLesson,
    viewAllUnits: viewAllUnits,
    understandMarket: understandMarket,
    isReturning: _isReturning
  };
})(typeof window !== 'undefined' ? window : this);
