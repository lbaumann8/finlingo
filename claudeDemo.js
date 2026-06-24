// FinLingo Coach — guided "Claude Corps" demo.
//
// A polished, scripted walkthrough of the Claude-powered learning loop:
//   Market event → Claude explains it → Explain Simpler (analogy) →
//   Quiz Me → Journey updates ("Inflation needs review").
//
// Every step calls the real same-origin /api/ask-finlingo endpoint (so the
// reviewer sees live Claude output), but each step also ships a written
// fallback so the demo never breaks if the key or network is unavailable.

(function (global) {
  'use strict';

  const STAGES = ['intro', 'explain', 'simpler', 'quiz', 'journey'];
  const STEP_LABELS = ['Open Market', 'Plain English', 'Explain Simpler', 'Quiz Me', 'Journey update'];

  // The demo is intentionally anchored on rates → bonds → inflation so the
  // payoff ("Inflation needs review" on the Journey page) is coherent.
  const DEMO_TOPIC = 'Inflation';
  const DEMO_LESSON_ID = 10;

  const FALLBACK_EXPLAIN = {
    what_happened: 'The 10-year Treasury yield rose today, so interest rates moved higher across the market.',
    why_it_happened: 'Investors expected rates to stay higher for longer, often tied to inflation running warm.',
    why_it_matters: 'Higher rates make borrowing pricier and tend to push existing bond prices down — a direct link to inflation and bond math.',
    beginner_takeaway: 'Rates, bonds, and inflation move together. One day is context to learn from, not a signal to act.'
  };
  const FALLBACK_SIMPLER =
    'Think of interest rates like the price of borrowing money. ' +
    'When that price goes up, older bonds paying the old, lower rate look less attractive, so their price drops — like a coupon for 3% off losing value once everyone else has a 5% coupon. ' +
    'Inflation is the reason the "price of money" changes in the first place. Where the analogy breaks down: real bonds also depend on how long until they pay you back, which a coupon does not.';
  const FALLBACK_QUIZ = {
    title: 'Inflation check',
    questions: [
      {
        question: 'What does inflation describe?',
        choices: ['Prices rising over time', 'The stock market falling', 'A type of bond', 'A bank fee'],
        correct_index: 0,
        explanation: 'Inflation is the general rise in prices over time, which lowers what each dollar can buy.'
      },
      {
        question: 'When interest rates rise, existing bond prices usually…',
        choices: ['Rise', 'Fall', 'Stay exactly the same', 'Disappear'],
        correct_index: 1,
        explanation: 'Newer bonds pay more, so older, lower-paying bonds become less valuable and their price falls.'
      },
      {
        question: 'Why do central banks often raise rates?',
        choices: ['To cool down high inflation', 'To guarantee profits', 'To pick winning stocks', 'To predict the market'],
        correct_index: 0,
        explanation: 'Higher rates slow borrowing and spending, which can ease inflation over time.'
      }
    ]
  };

  const state = {
    stage: 'intro',
    loading: false,
    usedFallback: false,
    explain: null,
    simpler: '',
    quiz: null,
    quizAnswers: {},
    flagged: false
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _today() {
    return typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10);
  }

  function _demoContext(extra) {
    const base = [
      `Date: ${_today()}.`,
      'Observed market story: The 10-year Treasury yield rose today, so interest rates moved higher.',
      'This connects directly to Bonds and Inflation.',
      'The learner is a beginner currently studying the Inflation lesson.'
    ].join(' ');
    return extra ? `${base} ${extra}` : base;
  }

  async function _callCoach(mode, prompt, context) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const res = await fetch('/api/ask-finlingo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify({
          mode,
          context: context || _demoContext(),
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `request failed (${res.status})`);
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Stage advancing ────────────────────────────────────────────────
  async function _runExplain() {
    state.loading = true; _render();
    try {
      const payload = await _callCoach(
        'market_explainer',
        'Explain today’s market story in plain English for a beginner.'
      );
      state.explain = payload.result || FALLBACK_EXPLAIN;
      state.usedFallback = !payload.result;
    } catch (_) {
      state.explain = FALLBACK_EXPLAIN;
      state.usedFallback = true;
    }
    state.loading = false;
    state.stage = 'explain';
    _render();
  }

  async function _runSimpler() {
    state.loading = true; _render();
    try {
      const payload = await _callCoach(
        'analogy',
        'Explain how rising interest rates and inflation connect, using one simple analogy a beginner would get.',
        _demoContext('Concept: inflation and rising interest rates.')
      );
      state.simpler = (payload.answer || '').trim() || FALLBACK_SIMPLER;
      if (!payload.answer) state.usedFallback = true;
    } catch (_) {
      state.simpler = FALLBACK_SIMPLER;
      state.usedFallback = true;
    }
    state.loading = false;
    state.stage = 'simpler';
    _render();
  }

  async function _runQuiz() {
    state.loading = true; _render();
    try {
      const payload = await _callCoach(
        'quiz',
        'Create a three-question beginner quiz about inflation and how rising interest rates connect to it.',
        _demoContext('Treat "Inflation" as the lesson to quiz on.')
      );
      state.quiz = (payload.result && Array.isArray(payload.result.questions))
        ? payload.result
        : FALLBACK_QUIZ;
      if (!payload.result) state.usedFallback = true;
    } catch (_) {
      state.quiz = FALLBACK_QUIZ;
      state.usedFallback = true;
    }
    state.quizAnswers = {};
    state.loading = false;
    state.stage = 'quiz';
    _render();
  }

  function answerQuiz(qIndex, cIndex) {
    if (Number.isInteger(state.quizAnswers[qIndex])) return;
    state.quizAnswers[qIndex] = cIndex;
    _render();
  }

  function _quizComplete() {
    const total = state.quiz && state.quiz.questions ? state.quiz.questions.length : 0;
    return total > 0 && Object.keys(state.quizAnswers).length >= total;
  }

  function _goJourneyStage() {
    // Close the loop: flag Inflation for review so it lands on the Journey page.
    if (!state.flagged && global.CoachReview) {
      global.CoachReview.flag({
        topic: DEMO_TOPIC,
        source: 'your market quiz',
        lessonId: DEMO_LESSON_ID,
        note: 'Surfaced from today’s rates → inflation market story.'
      });
      state.flagged = true;
    }
    state.stage = 'journey';
    _render();
  }

  function _finish() {
    close();
    if (typeof showPractice === 'function') showPractice();
  }

  // ── Rendering ──────────────────────────────────────────────────────
  function _stepper() {
    const current = STAGES.indexOf(state.stage);
    return `
      <ol class="cd-stepper">
        ${STEP_LABELS.map((label, i) => `
          <li class="${i < current ? 'is-done' : ''}${i === current ? ' is-current' : ''}">
            <span class="cd-step-dot">${i < current ? '✓' : i + 1}</span>
            <span class="cd-step-label">${esc(label)}</span>
          </li>`).join('')}
      </ol>`;
  }

  function _loadingBlock(text) {
    return `<div class="cd-loading"><span class="cd-spinner" aria-hidden="true"></span>${esc(text || 'Claude is thinking…')}</div>`;
  }

  function _disclaimer() {
    return `<div class="cd-disclaimer">Educational only. Not financial advice.</div>`;
  }

  function _fallbackNote() {
    return state.usedFallback
      ? `<div class="cd-note">Showing a sample Claude response (live key not configured). The flow is identical with a key set.</div>`
      : '';
  }

  function _stageBody() {
    if (state.loading) return _loadingBlock();

    if (state.stage === 'intro') {
      return `
        <div class="cd-stage">
          <div class="cd-kicker">Step 1 · You open Market</div>
          <h2>Today, the market gave us a teachable moment.</h2>
          <div class="cd-event-card">
            <span class="cd-event-pill">Real market event</span>
            <strong>Rates moved higher today.</strong>
            <p>The 10-year Treasury yield rose — which connects straight to <b>Bonds</b> and <b>Inflation</b>.</p>
          </div>
          <p class="cd-lead">Watch Claude turn that event into a plain-English explanation, a simpler analogy, a quiz, and a personalized review item on your Journey.</p>
          ${_disclaimer()}
        </div>`;
    }

    if (state.stage === 'explain') {
      const r = state.explain || FALLBACK_EXPLAIN;
      const rows = [
        ['What happened', r.what_happened],
        ['Why it happened', r.why_it_happened],
        ['Why it matters', r.why_it_matters],
        ['Beginner takeaway', r.beginner_takeaway]
      ].filter(([, v]) => v);
      return `
        <div class="cd-stage">
          <div class="cd-kicker">Step 2 · Claude explains today’s market</div>
          <h2>Plain English, not jargon.</h2>
          <div class="cd-claude-card">
            ${rows.map(([label, value]) => `<div class="cd-claude-row"><span>${esc(label)}</span><p>${esc(value)}</p></div>`).join('')}
          </div>
          ${_fallbackNote()}
          ${_disclaimer()}
        </div>`;
    }

    if (state.stage === 'simpler') {
      return `
        <div class="cd-stage">
          <div class="cd-kicker">Steps 3–4 · You tap “Explain Simpler” → Claude gives an analogy</div>
          <h2>Same idea, one level simpler.</h2>
          <div class="cd-claude-card cd-analogy">
            <span class="cd-analogy-mark" aria-hidden="true">“</span>
            <p>${esc(state.simpler || FALLBACK_SIMPLER)}</p>
          </div>
          ${_fallbackNote()}
          ${_disclaimer()}
        </div>`;
    }

    if (state.stage === 'quiz') {
      const quiz = state.quiz || FALLBACK_QUIZ;
      const questions = quiz.questions || [];
      const complete = _quizComplete();
      return `
        <div class="cd-stage">
          <div class="cd-kicker">Steps 5–6 · You tap “Quiz Me” → Claude writes a quiz</div>
          <h2>${esc(quiz.title || 'Quick check')}</h2>
          <div class="cd-quiz">
            ${questions.map((q, qi) => {
              const picked = state.quizAnswers[qi];
              const answered = Number.isInteger(picked);
              const correct = Number(q.correct_index);
              return `
                <div class="cd-quiz-q">
                  <strong>${qi + 1}. ${esc(q.question)}</strong>
                  <div class="cd-quiz-choices">
                    ${(q.choices || []).map((choice, ci) => {
                      let cls = '';
                      if (answered && ci === correct) cls = ' is-correct';
                      else if (answered && ci === picked) cls = ' is-wrong';
                      return `<button type="button" class="cd-quiz-choice${cls}" ${answered ? 'disabled' : ''} onclick="ClaudeDemo._answer(${qi},${ci})">${String.fromCharCode(65 + ci)}. ${esc(choice)}</button>`;
                    }).join('')}
                  </div>
                  ${answered ? `<div class="cd-quiz-fb ${picked === correct ? 'ok' : 'no'}"><b>${picked === correct ? 'Correct.' : 'Not quite.'}</b> ${esc(q.explanation)}</div>` : ''}
                </div>`;
            }).join('')}
          </div>
          ${complete ? `<p class="cd-lead">Nice — Claude noticed inflation is still shaky. Watch what happens to your Journey.</p>` : `<p class="cd-hint">Answer all three to continue.</p>`}
          ${_fallbackNote()}
          ${_disclaimer()}
        </div>`;
    }

    // journey
    return `
      <div class="cd-stage cd-journey-stage">
        <div class="cd-kicker">Step 7 · Your Journey updates</div>
        <h2>The loop closes.</h2>
        <div class="cd-journey-update">
          <span class="cd-journey-mark" aria-hidden="true">↻</span>
          <div>
            <strong>${esc(DEMO_TOPIC)} needs review</strong>
            <p>Flagged from today’s market quiz and saved to your Journey — Claude will connect future lessons back to it.</p>
          </div>
        </div>
        <p class="cd-lead">A real market event became a personalized, plain-English learning loop: explain → simplify → quiz → review.</p>
      </div>`;
  }

  function _footer() {
    if (state.loading) return '';
    if (state.stage === 'intro') {
      return `<button type="button" class="btn btn-primary cd-next" onclick="ClaudeDemo._explain()">Explain today’s market with Claude</button>`;
    }
    if (state.stage === 'explain') {
      return `<button type="button" class="btn btn-primary cd-next" onclick="ClaudeDemo._simpler()">Explain Simpler</button>`;
    }
    if (state.stage === 'simpler') {
      return `<button type="button" class="btn btn-primary cd-next" onclick="ClaudeDemo._quiz()">Quiz Me</button>`;
    }
    if (state.stage === 'quiz') {
      const ready = _quizComplete();
      return `<button type="button" class="btn btn-primary cd-next" ${ready ? '' : 'disabled aria-disabled="true"'} onclick="ClaudeDemo._journey()">See my Journey update</button>`;
    }
    return `
      <button type="button" class="btn btn-outline" onclick="ClaudeDemo.close()">Close</button>
      <button type="button" class="btn btn-primary cd-next" onclick="ClaudeDemo._finish()">Go to my Journey</button>`;
  }

  function _render() {
    const overlay = document.getElementById('claudeDemoOverlay');
    if (!overlay) return;
    overlay.innerHTML = `
      <div class="cd-backdrop" onclick="ClaudeDemo.close()"></div>
      <div class="cd-panel" role="document">
        <header class="cd-head">
          <div class="cd-head-title">
            <span class="cd-mark" aria-hidden="true">✳</span>
            <div>
              <strong>FinLingo Coach</strong>
              <span class="cd-sub">Guided demo · Powered by Claude</span>
            </div>
          </div>
          <button type="button" class="cd-close" onclick="ClaudeDemo.close()" aria-label="Close demo">✕</button>
        </header>
        ${_stepper()}
        <div class="cd-body">${_stageBody()}</div>
        <footer class="cd-foot">${_footer()}</footer>
      </div>`;
  }

  function start() {
    state.stage = 'intro';
    state.loading = false;
    state.usedFallback = false;
    state.explain = null;
    state.simpler = '';
    state.quiz = null;
    state.quizAnswers = {};
    state.flagged = false;
    const overlay = document.getElementById('claudeDemoOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cd-open');
    _render();
  }

  function close() {
    const overlay = document.getElementById('claudeDemoOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cd-open');
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      const overlay = document.getElementById('claudeDemoOverlay');
      if (overlay && overlay.classList.contains('open')) close();
    }
  });

  global.ClaudeDemo = {
    start: start,
    close: close,
    _explain: _runExplain,
    _simpler: _runSimpler,
    _quiz: _runQuiz,
    _answer: answerQuiz,
    _journey: _goJourneyStage,
    _finish: _finish
  };
})(typeof window !== 'undefined' ? window : this);
