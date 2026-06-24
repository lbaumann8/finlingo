// ============================================================
// onboarding.js
// Self-contained first-time user onboarding overlay.
//
// FLOW:
//   0. welcome  — brand intro + three value props
//   1. goal     — single-select: user's main goal
//   2. level    — single-select: prior finance knowledge
//   3. topics   — multi-select: topic interests
//   4. done     — celebration + launch CTA
//
// TRIGGER:
//   Call maybeShowOnboarding() from enterApp() in auth.js.
//   Reads S.onboarding?.done. If true (returning user) → showHome().
//   If false/absent (new user) → shows the onboarding overlay.
//
// DATA SAVED TO S.onboarding:
//   { done, goal, level, topics[], completedAt }
//   Written via save() which syncs to Supabase if signed in.
//
// ISOLATION:
//   Creates its own #onboardingOverlay DOM node appended to .app.
//   Touches no existing screens, nav, or topbar elements.
//   Only dependencies on other modules: S, save(), showHome(), showToast(),
//   showAppModal(), closeAppModal(), awardRewards(), updateTopbar()
// ============================================================


// ── CONTENT DATA ─────────────────────────────────────────────

const OB_GOALS = [
  {
    id: 'invest',
    label: 'Grow my money',
    sub: 'Stocks, investing, portfolios',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`
  },
  {
    id: 'career',
    label: 'Build a finance career',
    sub: 'Skills for jobs in finance',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`
  },
  {
    id: 'money',
    label: 'Master personal money',
    sub: 'Budgeting, credit, saving',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
  },
  {
    id: 'curious',
    label: 'Explore finance',
    sub: 'Learn at my own pace',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
  }
];

const OB_LEVELS = [
  {
    id: 'none',
    label: 'Beginner',
    sub: 'I\'m just getting started',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  },
  {
    id: 'some',
    label: 'Some experience',
    sub: 'I know a few basics',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`
  },
  {
    id: 'confident',
    label: 'Confident',
    sub: 'I understand the fundamentals',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><polyline points="20 6 9 17 4 12"/></svg>`
  }
];

const OB_TOPICS = [
  { id: 'stocks',    label: 'Stocks & shares',   icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>` },
  { id: 'budget',    label: 'Personal budgeting', icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>` },
  { id: 'crypto',    label: 'Crypto & DeFi',      icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>` },
  { id: 'banking',   label: 'Banking & credit',   icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>` },
  { id: 'investing', label: 'Investing basics',   icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>` },
  { id: 'business',  label: 'Business finance',   icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>` }
];


// ── MODULE STATE ──────────────────────────────────────────────
// All state is module-level and private (prefixed with _ob).
// Nothing is written to the global S until _obSave() is called.

let _obStep = 0;
let _obData = { goal: null, level: null, topics: [] };

const _OB_STEPS = ['welcome', 'goal', 'level', 'topics', 'done'];
const _OB_PROGRESS_TOTAL = 4;
const FIRST_WIN_REWARD_XP = 10;
const FIRST_WIN_REWARD_CASH = 100;
const FIRST_WIN_QUESTION = {
  prompt: 'If you invest $100 at 10% for one year, how much do you have?',
  options: ['$105', '$110', '$120'],
  answer: 1
};

let _firstWinSelected = null;
let _firstWinFeedback = '';
let _firstWinCloseTimer = null;


// ── PUBLIC API ────────────────────────────────────────────────

/**
 * Entry point. Called from enterApp() in auth.js.
 *
 * Routes:
 *   1. Explicit onboarding.done flag → showHome() directly
 *   2. Returning user with prior history (existed before onboarding was added,
 *      S.onboarding is null) → mark done silently, showHome()
 *   3. Genuine new user with no history → show onboarding
 */
function maybeShowOnboarding() {
  // Route 1: already completed onboarding
  if (S.onboarding?.done) {
    if (typeof enterWorkspaceShell === 'function') enterWorkspaceShell();
    showHome();
    if (S.firstWinPending && !S.firstWinComplete) {
      setTimeout(() => maybeShowFirstWinPrompt({ force: true }), 160);
    }
    return;
  }

  // Route 2: returning user who predates the onboarding feature
  // Indicators of prior usage: any XP earned, any lesson completed, streak > 1
  const hasHistory = (S.xp > 0) || (S.completedIds?.length > 0) || (S.streak > 1);
  if (hasHistory) {
    // Silently mark done so we never ask them again
    S.onboarding = {
      done: true, goal: null, level: null, topics: [],
      completedAt: new Date().toISOString()
    };
    S.firstWinComplete = true;
    S.firstWinPending = false;
    save();
    if (typeof enterWorkspaceShell === 'function') enterWorkspaceShell();
    showHome();
    return;
  }

  // Route 3: genuine new user — show the onboarding flow
  _obStep = 0;
  _obData = { goal: null, level: null, topics: [] };
  _obRender();
}

function showWelcomeOnboarding() {
  _obStep = 0;
  _obData = { goal: null, level: null, topics: [] };
  _obRender();
}


// ── DOM ───────────────────────────────────────────────────────

/** Lazily create and return the full-screen overlay element. */
function _obGetOverlay() {
  let el = document.getElementById('onboardingOverlay');
  if (!el) {
    el           = document.createElement('div');
    el.id        = 'onboardingOverlay';
    el.className = 'ob-overlay';
    (document.querySelector('.app') || document.body).appendChild(el);
  }
  return el;
}

/** Re-render the overlay with the current step. */
function _obRender() {
  const overlay         = _obGetOverlay();
  document.body.classList.add('entry-gate-visible');
  overlay.style.display = 'flex';
  overlay.innerHTML     = _obHTML(_OB_STEPS[_obStep]);
}


// ── HTML BUILDERS ─────────────────────────────────────────────

function _obProgress(activeIdx) {
  return `<div class="ob-progress-wrap">
    <div class="ob-progress-label">Step ${activeIdx} of ${_OB_PROGRESS_TOTAL}</div>
    <div class="ob-dots" aria-hidden="true">
      ${Array.from({ length: _OB_PROGRESS_TOTAL }, (_, idx) =>
        `<div class="ob-dot${idx + 1 === activeIdx ? ' active' : idx + 1 < activeIdx ? ' done' : ''}"></div>`
      ).join('')}
    </div>
  </div>`;
}

function _obButtonLabel(step) {
  if (step === 'welcome') return `Start learning ${FinLingoIcons.right()}`;
  if (step === 'done') return `Start learning ${FinLingoIcons.right()}`;
  return '';
}

function _obGoalSummary(goalId) {
  return 'Your path focuses on the finance skills that matter most for your goals.';
}

function _obBackLink() {
  return `<button class="ob-back" onclick="_obBack()">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2">
      <polyline points="15 18 9 12 15 6"/>
    </svg>Back
  </button>`;
}

/** Returns the complete inner HTML for a named step. */
function _obHTML(step) {
  switch (step) {

    // ── WELCOME ─────────────────────────────────────────────
    case 'welcome':
      return `
        <div class="ob-inner ob-welcome-step ob-product-welcome">
          <div class="ob-welcome-logo">
            <span class="brand-fin">Fin</span><span class="brand-lingo">lingo</span>
          </div>
          <div class="ob-welcome-hero">Finance, explained clearly.</div>
          <div class="ob-welcome-sub">A focused learning workspace for building financial fluency without jargon or noise.</div>
          <div class="ob-features">
            <div class="ob-feature">
              <div class="ob-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><path d="M3 5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H3z"/><path d="M21 5h-5a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h5z"/></svg>
              </div>
              <div>
                <div class="ob-feature-title">Learn finance in plain English</div>
                <div class="ob-feature-sub">Short, structured lessons built around practical concepts.</div>
              </div>
            </div>
            <div class="ob-feature">
              <div class="ob-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><polyline points="4 17 9 12 13 15 20 7"/><polyline points="15 7 20 7 20 12"/></svg>
              </div>
              <div>
                <div class="ob-feature-title">Build financial fluency</div>
                <div class="ob-feature-sub">See steady progress from foundations to advanced topics.</div>
              </div>
            </div>
            <div class="ob-feature">
              <div class="ob-feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></svg></div>
              <div><div class="ob-feature-title">Ask anything</div><div class="ob-feature-sub">Get concise explanations, examples, and quick checks inside each experience.</div></div>
            </div>
            <div class="ob-feature">
              <div class="ob-feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.7"><line x1="6" y1="19" x2="6" y2="13"/><line x1="12" y1="19" x2="12" y2="9"/><line x1="18" y1="19" x2="18" y2="5"/></svg></div>
              <div><div class="ob-feature-title">Understand markets without jargon</div><div class="ob-feature-sub">Read the story first, then the numbers that support it.</div></div>
            </div>
          </div>
          <div class="ob-entry-actions">
            <button class="btn btn-primary" onclick="_obContinueGuest()">Continue as guest</button>
            <button class="btn btn-outline" onclick="_obStartAuth('create')">Create account</button>
            <button class="ob-signin-link" onclick="_obStartAuth('signin')">Already have an account? Sign in</button>
          </div>
        </div>
        `;

    // ── GOAL ────────────────────────────────────────────────
    case 'goal':
      return `
        <div class="ob-inner">
          ${_obProgress(2)}
          ${_obBackLink()}
          <div class="ob-heading">What are you using this for?</div>
          <div class="ob-sub">Pick the closest one.</div>
          <div class="ob-choices">
            ${OB_GOALS.map(g => `
              <button class="ob-choice${_obData.goal === g.id ? ' selected' : ''}" onclick="_obSelectGoal('${g.id}')">
                <div class="ob-choice-icon">${g.icon}</div>
                <div class="ob-choice-text">
                  <div class="ob-choice-label">${g.label}</div>
                  <div class="ob-choice-sub">${g.sub}</div>
                </div>
                <div class="ob-choice-check">
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </button>`).join('')}
          </div>
        </div>
        <div class="ob-footer">
          <button class="btn btn-primary" id="obNextBtn" onclick="_obNext()" ${!_obData.goal ? 'disabled' : ''}>Continue</button>
        </div>`;

    // ── LEVEL ───────────────────────────────────────────────
    case 'level':
      return `
        <div class="ob-inner">
          ${_obProgress(3)}
          ${_obBackLink()}
          <div class="ob-heading">How much finance do you already know?</div>
          <div class="ob-sub">Sets your starting lessons. You can change pace later.</div>
          <div class="ob-choices">
            ${OB_LEVELS.map(l => `
              <button class="ob-choice${_obData.level === l.id ? ' selected' : ''}" onclick="_obSelectLevel('${l.id}')">
                <div class="ob-choice-icon">${l.icon}</div>
                <div class="ob-choice-text">
                  <div class="ob-choice-label">${l.label}</div>
                  <div class="ob-choice-sub">${l.sub}</div>
                </div>
                <div class="ob-choice-check">
                  <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </button>`).join('')}
          </div>
        </div>
        <div class="ob-footer">
          <button class="btn btn-primary" id="obNextBtn" onclick="_obNext()" ${!_obData.level ? 'disabled' : ''}>Continue</button>
        </div>`;

    // ── TOPICS ──────────────────────────────────────────────
    case 'topics':
      return `
        <div class="ob-inner">
          ${_obProgress(4)}
          ${_obBackLink()}
          <div class="ob-heading">Pick a few topics to start.</div>
          <div class="ob-sub">We'll prioritize lessons in these areas first.</div>
          <div class="ob-topics">
            ${OB_TOPICS.map(t => `
              <button class="ob-topic${_obData.topics.includes(t.id) ? ' selected' : ''}" onclick="_obToggleTopic('${t.id}')">
                <div class="ob-topic-icon">${t.icon}</div>
                <div class="ob-topic-label">${t.label}</div>
              </button>`).join('')}
          </div>
        </div>
        <div class="ob-footer">
          <button class="btn btn-primary" onclick="_obNext()">
            ${_obData.topics.length === 0 ? `Skip for now ${FinLingoIcons.right()}` : `Continue &middot; ${_obData.topics.length} selected ${FinLingoIcons.right()}`}
          </button>
        </div>`;

    // ── DONE ────────────────────────────────────────────────
    case 'done': {
      return `
        <div class="ob-inner ob-done-inner">
          <div class="ob-done-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="ob-done-title">You're ready to start learning.</div>
          <div class="ob-done-sub">${_obGoalSummary(_obData.goal)}</div>
          <div class="ob-done-stats">
            <div class="ob-stat"><div class="ob-stat-val">100</div><div class="ob-stat-label">Lessons</div></div>
            <div class="ob-stat"><div class="ob-stat-val">25</div><div class="ob-stat-label">Free</div></div>
            <div class="ob-stat"><div class="ob-stat-val">Daily</div><div class="ob-stat-label">Challenge</div></div>
          </div>
          <div class="ob-footer ob-done-footer">
            <button class="btn btn-primary" onclick="_obFinish()">${_obButtonLabel('done')}</button>
          </div>
        </div>`;
    }

    default:
      return '';
  }
}


// ── SELECTION HANDLERS ────────────────────────────────────────
// Mutate _obData then call _obRender() so the UI stays in sync.
// Re-rendering on selection is safe: the click has already fired
// before the replaced DOM element is garbage-collected.

function _obSelectGoal(id) {
  _obData.goal = id;
  _obRender();
}

function _obSelectLevel(id) {
  _obData.level = id;
  _obRender();
}

function _obToggleTopic(id) {
  const idx = _obData.topics.indexOf(id);
  if (idx === -1) _obData.topics.push(id);
  else            _obData.topics.splice(idx, 1);
  _obRender();
}


// ── NAVIGATION ────────────────────────────────────────────────

function _obNext() {
  if (_obStep < _OB_STEPS.length - 1) {
    _obStep++;
    _obRender();
  }
}

function _obBack() {
  if (_obStep > 0) {
    _obStep--;
    _obRender();
  }
}

/** "Skip" on the welcome step — saves a blank onboarding record and enters the app. */
function _obSkip() {
  _obSave();
  _obDismiss(true);
  showHome();
}

function _obContinueGuest() {
  S = normalizeState();
  S.user = { name: 'Guest', email: null, tier: 'standard', avatarColor: '#1a1a1a' };
  S.joinedDate = new Date().toISOString();
  S.onboarding = {
    done: true, goal: null, level: null, topics: [],
    completedAt: new Date().toISOString()
  };
  save();
  _obDismiss(true);
  enterApp();
  showToast('Continuing as guest');
}

function _obStartAuth(mode) {
  sessionStorage.setItem('finlingo_onboarding_entry', '1');
  _obDismiss(false);
  openAuthModal(mode, { dismissible: true });
}

/** Final CTA on the done step — saves full answers and enters the app. */
function _obFinish() {
  S.firstWinPending = !S.firstWinComplete;
  _obSave();
  _obDismiss(true);
  showHome();
  setTimeout(() => maybeShowFirstWinPrompt({ force: true }), 160);
}


// ── PERSISTENCE ───────────────────────────────────────────────

/** Write answers to S.onboarding and persist via save(). */
function _obSave() {
  S.onboarding = {
    done:        true,
    goal:        _obData.goal  || null,
    level:       _obData.level || null,
    topics:      [..._obData.topics],
    completedAt: new Date().toISOString()
  };
  save(); // ← state.js: persists to localStorage + Supabase
}

/** Hide the overlay (home screen content is already rendered underneath). */
function _obDismiss(enterWorkspace = false) {
  const overlay = document.getElementById('onboardingOverlay');
  if (overlay) overlay.style.display = 'none';
  if (enterWorkspace && typeof enterWorkspaceShell === 'function') enterWorkspaceShell();
}

function _clearFirstWinTimer() {
  if (_firstWinCloseTimer) {
    clearTimeout(_firstWinCloseTimer);
    _firstWinCloseTimer = null;
  }
}

function maybeShowFirstWinPrompt({ force = false } = {}) {
  if (!S.onboarding?.done) return false;
  if (S.firstWinComplete) return false;
  if (!force && !S.firstWinPending) return false;

  _clearFirstWinTimer();
  _firstWinSelected = null;
  _firstWinFeedback = '';
  _renderFirstWinModal();
  return true;
}

function _renderFirstWinModal() {
  const canSubmit = Number.isInteger(_firstWinSelected);
  const feedbackClass = _firstWinFeedback ? ' show' : '';

  showAppModal({
    icon: 'neutral',
    title: 'One question to start',
    showClose: false,
    onClose: () => {
      if (S.firstWinPending && !S.firstWinComplete) {
        setTimeout(() => maybeShowFirstWinPrompt({ force: true }), 0);
      }
    },
    boxClass: 'first-win-modal',
    bodyIsHTML: true,
    body: `
      <div class="first-win-card">
        <div class="first-win-kicker">1 question · 30 seconds</div>
        <div class="first-win-question">${FIRST_WIN_QUESTION.prompt}</div>
        <div class="first-win-options">
          ${FIRST_WIN_QUESTION.options.map((option, index) => `
            <button class="first-win-option${_firstWinSelected === index ? ' selected' : ''}"
                    onclick="_selectFirstWinAnswer(${index})">
              <span>${option}</span>
              <span class="first-win-option-check">
                <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </span>
            </button>`).join('')}
        </div>
        <div class="first-win-feedback${feedbackClass}">${_firstWinFeedback || '&nbsp;'}</div>
        <button class="btn btn-primary first-win-submit" onclick="_submitFirstWinAnswer()" ${canSubmit ? '' : 'disabled'}>
          Check answer
        </button>
      </div>`,
    actions: []
  });
}

function _selectFirstWinAnswer(index) {
  if (S.firstWinComplete) return;
  _firstWinSelected = index;
  _firstWinFeedback = '';
  _renderFirstWinModal();
}

function _submitFirstWinAnswer() {
  if (!Number.isInteger(_firstWinSelected) || S.firstWinComplete) return;

  if (_firstWinSelected !== FIRST_WIN_QUESTION.answer) {
    _firstWinFeedback = 'Not quite. Try one more time.';
    _renderFirstWinModal();
    return;
  }

  S.firstWinComplete = true;
  S.firstWinPending = false;
  if (typeof syncDerivedProgressState === 'function') syncDerivedProgressState();
  save();
  if (typeof updateTopbar === 'function') updateTopbar();
  if (typeof updateHome === 'function') updateHome();

  showAppModal({
    icon: 'neutral',
    title: 'Great start!',
    showClose: false,
    boxClass: 'first-win-modal first-win-modal-success',
    bodyIsHTML: true,
    body: `
      <div class="first-win-success">
        <div class="first-win-success-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="first-win-success-copy">That is exactly right — you have taken the first step toward building your financial confidence.</div>
      </div>`,
    actions: []
  });

  _clearFirstWinTimer();
  _firstWinCloseTimer = setTimeout(() => {
    closeAppModal();
    _clearFirstWinTimer();
  }, 1350);
}
