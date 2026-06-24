// FinLingo — Claude Corps "Demo Mode".
//
// A guided spotlight tour over the REAL app (real S&P 500 chart, the real
// Claude Market Coach, the real Journey) with tasteful callout tooltips. It
// drives the genuine product so a reviewer understands the story in under a
// minute: market event → Claude explanation → quiz → learning progress →
// next lesson. No flashy animation; Apple-like coachmarks.
//
// Every Claude step calls the real endpoint; if the key is missing the step
// still completes (the response area shows its own message) so the tour never
// dead-ends. The Journey "needs review" payoff is written client-side, so the
// loop always closes.

(function (global) {
  'use strict';

  const state = { active: false, idx: 0, busy: false, concept: null, repositionTimer: null };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _demoConcept() {
    if (state.concept) return state.concept;
    let concept = { label: 'Inflation', lessonId: 10 };
    try {
      if (typeof _getMarketConnection === 'function') {
        const conn = _getMarketConnection();
        const first = conn && conn.links && conn.links[0];
        if (first && first.lessonId) concept = { label: first.label, lessonId: first.lessonId };
      }
    } catch (_) { /* keep default */ }
    state.concept = concept;
    return concept;
  }

  // ── small async helpers ────────────────────────────────────────────
  function _sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function _waitFor(selector, timeout = 6000) {
    return new Promise(resolve => {
      const start = Date.now();
      (function poll() {
        const el = document.querySelector(selector);
        if (el && el.getBoundingClientRect().width > 0) return resolve(el);
        if (Date.now() - start > timeout) return resolve(null);
        setTimeout(poll, 120);
      })();
    });
  }

  function _waitForCoach(timeout = 22000) {
    return new Promise(resolve => {
      const start = Date.now();
      (function poll() {
        const c = (typeof _marketCoach !== 'undefined') ? _marketCoach : null;
        const settled = c && !c.busy && (c.structured || c.answer || c.quiz || c.error);
        if (settled) return resolve(true);
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(poll, 200);
      })();
    });
  }

  function _scrollIntoView(el) {
    if (el && typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { el.scrollIntoView(); }
    }
  }

  // ── steps ───────────────────────────────────────────────────────────
  // Each step: { target, title, body, cta, chain, before() }
  const STEPS = [
    {
      target: '.market-chart-card',
      label: 'Market',
      title: 'Real market data → real learning',
      body: 'FinLingo turns real market data into plain-English learning. This is the live S&P 500 chart, with the Claude Market Coach right below it.',
      async before() {
        if (typeof showMarket === 'function') showMarket({ resetScroll: true });
        await _waitFor('.market-chart-card');
        await _waitFor('#marketCoachCard');
      }
    },
    {
      target: '#marketCoachCard',
      label: 'Explain',
      title: 'Claude explains today’s market',
      body: 'One tap on “Explain Today’s Market” and Claude writes a concise, beginner-friendly explanation — generated live from today’s real data.',
      async before() {
        const card = await _waitFor('#marketCoachCard');
        _scrollIntoView(card);
        await _sleep(300);
        if (typeof askMarketCoach === 'function') {
          askMarketCoach('explain');
          await _waitForCoach();
        }
      }
    },
    {
      target: '#marketCoachCard',
      label: 'Quiz',
      title: 'The same context becomes a quiz',
      body: 'Now “Quiz Me” — Claude turns the very same market context into a short quiz to check understanding. Market data, not a static question bank.',
      async before() {
        const card = await _waitFor('#marketCoachCard');
        _scrollIntoView(card);
        await _sleep(250);
        if (typeof askMarketCoach === 'function') {
          askMarketCoach('quiz');
          await _waitForCoach();
        }
        // Drive the loop: a missed question flags the concept for review.
        await _demoAnswerQuizWrong();
      }
    },
    {
      target: '.review-flags-card',
      label: 'Journey',
      title: 'Your Journey updates',
      get body() {
        const c = _demoConcept();
        return `Because the quiz surfaced a gap, your Journey now shows “${c.label} needs review.” Real performance updates real progress.`;
      },
      async before() {
        const c = _demoConcept();
        if (global.CoachReview) {
          global.CoachReview.flag({
            topic: c.label,
            source: 'your market quiz',
            lessonId: c.lessonId,
            note: 'Surfaced from today’s market quiz in Demo Mode.'
          });
        }
        if (typeof showPractice === 'function') showPractice({ resetScroll: true });
        const card = await _waitFor('.review-flags-card');
        _scrollIntoView(card);
      }
    },
    {
      target: null,
      label: 'Learn',
      get title() { return `Recommended next lesson: ${_demoConcept().label}`; },
      body: 'FinLingo closes the loop with a personalized recommendation — the exact lesson that fixes the gap the market quiz just revealed.',
      get cta() {
        const c = _demoConcept();
        return { label: `Open the ${c.label} lesson`, run: () => { if (typeof openCourse === 'function') openCourse(c.lessonId); } };
      },
      async before() {
        if (typeof showLearn === 'function') showLearn({ resetScroll: true });
        await _sleep(250);
      }
    },
    {
      target: null,
      label: 'Coach',
      title: 'This is FinLingo, powered by Claude',
      body: 'Claude connects the whole chain — so a real market event becomes personalized financial education, every single day.',
      chain: ['Market event', 'Claude explains', 'Quiz', 'Progress', 'Next lesson']
    }
  ];

  async function _demoAnswerQuizWrong() {
    try {
      const c = (typeof _marketCoach !== 'undefined') ? _marketCoach : null;
      if (!c || !c.quiz || !Array.isArray(c.quiz.questions) || !c.quiz.questions.length) return;
      if (Object.keys(c.quizAnswers || {}).length) return; // already answered
      const q0 = c.quiz.questions[0];
      const correct = Number(q0.correct_index);
      const wrong = correct === 0 ? 1 : 0;
      if (typeof selectMarketCoachQuizChoice === 'function') {
        selectMarketCoachQuizChoice(0, wrong);
        await _sleep(500);
      }
    } catch (_) { /* non-fatal */ }
  }

  // ── overlay + positioning ───────────────────────────────────────────
  function _ensureOverlay() {
    let overlay = document.getElementById('demoTourOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'demoTourOverlay';
      overlay.className = 'demo-tour';
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function _renderCallout() {
    const step = STEPS[state.idx];
    const total = STEPS.length;
    const isLast = state.idx === total - 1;
    const chain = step.chain
      ? `<div class="dt-chain">${step.chain.map((node, i) => `${i ? '<span class="dt-chain-arrow">→</span>' : ''}<span class="dt-chain-node">${esc(node)}</span>`).join('')}</div>`
      : '';
    const cta = (step.cta && step.cta.label) ? step.cta : null;
    const ctaBtn = cta ? `<button type="button" class="dt-cta" onclick="DemoTour._cta()">${esc(cta.label)}</button>` : '';
    const dots = STEPS.map((_, i) => `<span class="dt-dot${i === state.idx ? ' is-active' : ''}${i < state.idx ? ' is-done' : ''}"></span>`).join('');
    return `
      <div class="dt-callout" role="dialog" aria-label="Demo Mode">
        <div class="dt-callout-head">
          <span class="dt-badge">✳ Demo Mode</span>
          <span class="dt-step">${state.idx + 1} / ${total}</span>
          <button type="button" class="dt-exit" onclick="DemoTour.stop()" aria-label="Exit demo">✕</button>
        </div>
        <h3 class="dt-title">${esc(typeof step.title === 'string' ? step.title : '')}</h3>
        <p class="dt-body">${esc(typeof step.body === 'string' ? step.body : '')}</p>
        ${chain}
        ${ctaBtn}
        <div class="dt-foot">
          <div class="dt-dots">${dots}</div>
          <div class="dt-nav">
            ${state.idx > 0 ? `<button type="button" class="dt-back" onclick="DemoTour._back()" ${state.busy ? 'disabled' : ''}>Back</button>` : ''}
            <button type="button" class="dt-next" onclick="DemoTour._next()" ${state.busy ? 'disabled' : ''}>${isLast ? 'Finish' : (state.busy ? 'Working…' : 'Next')}</button>
          </div>
        </div>
      </div>`;
  }

  function _render() {
    const overlay = _ensureOverlay();
    overlay.innerHTML = `<div class="dt-veil" aria-hidden="true"></div><div class="dt-spot" aria-hidden="true"></div>${_renderCallout()}`;
    _position();
  }

  function _position() {
    const overlay = document.getElementById('demoTourOverlay');
    if (!overlay || !state.active) return;
    const step = STEPS[state.idx];
    const spot = overlay.querySelector('.dt-spot');
    const callout = overlay.querySelector('.dt-callout');
    if (!spot || !callout) return;

    let rect = null;
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) rect = r;
      }
    }

    overlay.classList.toggle('dt-has-spot', !!rect);
    if (rect) {
      const pad = 8;
      spot.style.display = 'block';
      spot.style.top = (rect.top - pad) + 'px';
      spot.style.left = (rect.left - pad) + 'px';
      spot.style.width = (rect.width + pad * 2) + 'px';
      spot.style.height = (rect.height + pad * 2) + 'px';

      callout.classList.remove('dt-callout-center');
      const cW = callout.offsetWidth || 340;
      const cH = callout.offsetHeight || 180;
      let top = rect.bottom + 12;
      if (top + cH > window.innerHeight - 12) {
        top = rect.top - cH - 12;
        if (top < 12) top = Math.max(12, (window.innerHeight - cH) / 2);
      }
      let left = rect.left + rect.width / 2 - cW / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - cW - 12));
      callout.style.top = top + 'px';
      callout.style.left = left + 'px';
    } else {
      spot.style.display = 'none';
      callout.classList.add('dt-callout-center');
      callout.style.top = '';
      callout.style.left = '';
    }
  }

  // ── flow control ────────────────────────────────────────────────────
  async function _show(idx) {
    state.idx = idx;
    state.busy = true;
    _render();
    const step = STEPS[idx];
    if (typeof step.before === 'function') {
      try { await step.before(); } catch (_) { /* keep going */ }
    }
    state.busy = false;
    if (!state.active) return;
    _render();
  }

  function _next() {
    if (state.busy) return;
    if (state.idx >= STEPS.length - 1) { stop(); return; }
    _show(state.idx + 1);
  }

  function _back() {
    if (state.busy || state.idx === 0) return;
    _show(state.idx - 1);
  }

  function _cta() {
    const step = STEPS[state.idx];
    const cta = step.cta;
    if (cta && typeof cta.run === 'function') {
      stop();
      cta.run();
    }
  }

  function start() {
    if (state.active) return;
    state.active = true;
    state.idx = 0;
    state.concept = null;
    document.body.classList.add('demo-tour-open');
    _ensureOverlay().setAttribute('aria-hidden', 'false');
    state.repositionTimer = setInterval(_position, 250);
    global.addEventListener('resize', _position, true);
    global.addEventListener('scroll', _position, true);
    _show(0);
  }

  function stop() {
    state.active = false;
    if (state.repositionTimer) { clearInterval(state.repositionTimer); state.repositionTimer = null; }
    global.removeEventListener('resize', _position, true);
    global.removeEventListener('scroll', _position, true);
    document.body.classList.remove('demo-tour-open');
    const overlay = document.getElementById('demoTourOverlay');
    if (overlay) { overlay.innerHTML = ''; overlay.setAttribute('aria-hidden', 'true'); }
  }

  document.addEventListener('keydown', function (event) {
    if (!state.active) return;
    if (event.key === 'Escape') stop();
    else if (event.key === 'ArrowRight' || event.key === 'Enter') _next();
    else if (event.key === 'ArrowLeft') _back();
  });

  global.DemoTour = { start: start, stop: stop, _next: _next, _back: _back, _cta: _cta };
})(typeof window !== 'undefined' ? window : this);
