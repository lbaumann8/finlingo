// ── THEME SYSTEM ──────────────────────────────────────────────

(function initTheme() {
  // Light/white is the default look (matches the premium reference design).
  // Dark remains available via the toggle and is honoured if explicitly saved.
  const saved = localStorage.getItem('finlingo_theme') || 'light';
  if (saved !== 'dark') {
    document.body.dataset.theme = 'light';
  }
})();

function toggleTheme() {
  const currentlyLight = document.body.dataset.theme === 'light';
  document.body.classList.add('theme-transitioning');
  setTimeout(() => document.body.classList.remove('theme-transitioning'), 300);
  if (currentlyLight) {
    delete document.body.dataset.theme;
    localStorage.setItem('finlingo_theme', 'dark');
  } else {
    document.body.dataset.theme = 'light';
    localStorage.setItem('finlingo_theme', 'light');
  }
}

// Called from the Settings row in Profile — same as toggleTheme but also
// refreshes the profile row label so it updates without a full re-render.
function toggleThemeFromSettings() {
  toggleTheme();
  // Update the Settings row label in place
  const _themeRow = document.getElementById('pRowTheme');
  const _themeBtn = document.getElementById('themeToggleBtn');
  const _isLight  = document.body.dataset.theme === 'light';
  if (_themeRow) _themeRow.textContent = _isLight ? 'Light' : 'Dark';
  if (_themeBtn) _themeBtn.textContent = _isLight ? 'Dark mode' : 'Light mode';
}

// ── SETTINGS SHEET ────────────────────────────────────────────
// A small bottom-sheet that reuses the EXISTING functions — it adds no
// duplicate sign-out / account / reset logic, only entry points.

function showSettings() {
  const overlay = document.getElementById('settingsOverlay');
  if (!overlay) return;
  _renderSettingsSheet();
  overlay.classList.add('open');
}

function _syncWorkspaceAccountMenu() {
  const menu = document.getElementById('workspaceAccountMenu');
  if (!menu) return;
  const signOutButton = menu.querySelector('.workspace-account-signout');
  if (signOutButton) signOutButton.textContent = 'Sign out';
}

function closeWorkspaceAccountMenu() {
  document.getElementById('workspaceAccountMenu')?.classList.remove('open');
  document.getElementById('workspaceAccountButton')?.setAttribute('aria-expanded', 'false');
}

function toggleWorkspaceAccountMenu(event) {
  event?.stopPropagation();
  _syncWorkspaceAccountMenu();
  const menu = document.getElementById('workspaceAccountMenu');
  const button = document.getElementById('workspaceAccountButton');
  if (!menu) return;
  const open = !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  button?.setAttribute('aria-expanded', String(open));
}

function openWorkspaceAccount(tab) {
  closeWorkspaceAccountMenu();
  if (!S.user?.id) {
    openAuthModal(tab === 'account' ? 'signin' : 'create');
    return;
  }
  showProfile(tab, { resetScroll: true });
}

function openWorkspaceSettings() {
  closeWorkspaceAccountMenu();
  if (typeof openFinlingoAccount === 'function') openFinlingoAccount();
  else showSettings();
}

function workspaceSignOut() {
  closeWorkspaceAccountMenu();
  if (S.user) signOut();
  else openAuthModal('signin');
}

document.addEventListener('click', event => {
  if (!event.target?.closest?.('.workspace-account')) closeWorkspaceAccountMenu();
});

function closeSettings(event) {
  // When invoked from the overlay backdrop, only close on a true backdrop click.
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('settingsOverlay')?.classList.remove('open');
}

function settingsToggleTheme() {
  if (typeof toggleTheme === 'function') toggleTheme();
  _renderSettingsSheet();
  if (typeof updateTopbar === 'function') updateTopbar();
}

function openSettingsAccount() {
  closeSettings();
  if (typeof showProfile === 'function') showProfile('account');
}

function settingsResetProgress() {
  closeSettings();
  if (typeof confirmReset === 'function') confirmReset();
}

function settingsSignOut() {
  closeSettings();
  if (typeof signOut === 'function') signOut();
}

function _accountEsc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _accountInitials() {
  if (!_accountIsAuthenticated()) return 'GU';
  const name = S.user?.name || S.user?.email || 'User';
  if (typeof getInitials === 'function') {
    try { return getInitials(name) || 'U'; } catch (_) {}
  }
  return String(name).trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'U';
}

function _accountLevel() {
  return S.user?.learningLevel || S.onboarding?.level || 'Beginner';
}

function _accountIsAuthenticated() {
  return Boolean(S.user && (S.user.id || S.user.email));
}

function _accountChevron() {
  return `<i class="account-row-chev" aria-hidden="true">${FinLingoIcons.right()}</i>`;
}

function _accountProgressStats() {
  const microRaw = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('finlingo_micro_progress_v1') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  })();
  const microEntries = Object.values(microRaw).filter(item => item && typeof item === 'object');
  const unitsStarted = microEntries.filter(item =>
    item.startedAt || item.lastOpenedAt || item.completed || Number(item.currentLessonIndex) > 0 ||
    Object.keys(item.quickCheckAnswers || {}).length > 0 ||
    Object.keys(item.recapAnswers || {}).length > 0
  ).length;
  const unitsCompleted = microEntries.filter(item => item.completed || item.completedAt || item.latestScore).length;
  const lessonIds = new Set(
    Array.isArray(S.completedIds)
      ? S.completedIds.map(id => String(id)).filter(Boolean)
      : []
  );
  microEntries.forEach(item => {
    (Array.isArray(item.completedLessonIds) ? item.completedLessonIds : []).forEach(id => lessonIds.add(String(id)));
  });
  const recapScores = microEntries
    .map(item => item.latestScore || item.bestScore)
    .filter(score => score && Number.isFinite(Number(score.total)) && Number(score.total) > 0);
  const recapCorrect = recapScores.reduce((sum, score) => sum + (Number(score.correct) || 0), 0);
  const recapTotal = recapScores.reduce((sum, score) => sum + (Number(score.total) || 0), 0);

  return {
    unitsStarted,
    unitsCompleted,
    lessonsCompleted: lessonIds.size,
    recapLabel: recapTotal > 0 ? `${Math.round((recapCorrect / recapTotal) * 100)}%` : 'No recap quizzes yet'
  };
}

function openAccountSetup() {
  closeFinlingoAccount();
  if (typeof openAuthModal === 'function') openAuthModal('create', { returnTo: 'account' });
}

function editAccountName() {
  if (!_accountIsAuthenticated()) {
    openAccountSetup();
    return;
  }
  closeFinlingoAccount();
  if (typeof openEditSheet === 'function') openEditSheet('name');
}

function editAccountEmail() {
  if (!_accountIsAuthenticated()) {
    openAccountSetup();
    return;
  }
  closeFinlingoAccount();
  if (typeof openEditSheet === 'function') openEditSheet('email');
}

function openAccountProgressSummary() {
  const stats = _accountProgressStats();
  showAppModal({
    icon: 'neutral',
    title: 'Learning progress',
    bodyIsHTML: true,
    body: `
      <div class="account-progress-summary">
        <div><span>Units started</span><strong>${_accountEsc(stats.unitsStarted)}</strong></div>
        <div><span>Units completed</span><strong>${_accountEsc(stats.unitsCompleted)}</strong></div>
        <div><span>Lessons completed</span><strong>${_accountEsc(stats.lessonsCompleted)}</strong></div>
        <div><span>Recap quiz performance</span><strong>${_accountEsc(stats.recapLabel)}</strong></div>
      </div>`,
    actions: [{ label: 'Done', cls: 'btn btn-primary', fn: closeAppModal }]
  });
}

function openFinlingoAccount() {
  let root = document.getElementById('accountPageOverlay');
  if (!root) {
    root = document.createElement('div');
    root.id = 'accountPageOverlay';
    document.body.appendChild(root);
  }
  const isAuthenticated = _accountIsAuthenticated();
  const name = isAuthenticated ? (S.user?.name || 'User') : 'Guest';
  const email = isAuthenticated ? (S.user?.email || 'No email added') : 'No email added';
  const color = isAuthenticated ? (S.user?.avatarColor || '#1F2937') : '#20242B';
  const status = isAuthenticated ? '' : '<span class="account-status">Guest account</span>';
  root.innerHTML = `
    <section class="account-page" role="dialog" aria-modal="true" aria-labelledby="accountPageTitle">
      <header class="account-page-top">
        <button type="button" class="account-back" aria-label="Back" onclick="closeFinlingoAccount()">${FinLingoIcons.left()}</button>
        <h1 id="accountPageTitle">Account</h1>
        <span aria-hidden="true"></span>
      </header>
      <main class="account-page-body">
        <section class="account-profile">
          <div class="account-avatar" style="background:${_accountEsc(color)}">${_accountEsc(_accountInitials())}</div>
          <div class="account-profile-copy">
            <strong>${_accountEsc(name)}</strong>
            <small>${_accountEsc(email)}</small>
            ${status}
          </div>
        </section>

        ${isAuthenticated ? `<section class="account-section" aria-labelledby="accountDetailsLabel">
          <h2 id="accountDetailsLabel">Account details</h2>
          <div class="account-list">
            <button type="button" class="account-row account-row-button" onclick="editAccountName()">
              <span>Name</span>
              <strong>${_accountEsc(name)}</strong>
              ${_accountChevron()}
            </button>
            <button type="button" class="account-row account-row-button" onclick="editAccountEmail()">
              <span>Email</span>
              <strong>${_accountEsc(email)}</strong>
              ${_accountChevron()}
            </button>
          </div>
        </section>` : ''}

        <section class="account-section" aria-labelledby="accountActionsLabel">
          <h2 id="accountActionsLabel">Account</h2>
          <div class="account-list account-action-list">
            ${isAuthenticated
              ? `<button type="button" class="account-row account-row-button" onclick="confirmAccountSignOut()"><span>Sign out</span></button>`
              : `<button type="button" class="account-row account-row-button" onclick="openAccountSetup()"><span>Sign in or create account</span>${_accountChevron()}</button>`}
          </div>
        </section>

        <section class="account-section account-danger-section" aria-labelledby="accountDangerLabel">
          <h2 id="accountDangerLabel">DATA</h2>
          <button type="button" class="account-row account-row-button account-row-danger" onclick="confirmAccountResetProgress()">
            <span>Reset learning progress</span>
          </button>
        </section>
      </main>
    </section>`;
  root.classList.add('open');
  document.body.classList.add('account-page-open');
  setTimeout(() => root.querySelector('.account-back')?.focus(), 20);
}

function closeFinlingoAccount() {
  document.getElementById('accountPageOverlay')?.classList.remove('open');
  document.body.classList.remove('account-page-open');
}

function chooseAccountLearningLevel() {
  const levels = ['Beginner', 'Intermediate', 'Advanced'];
  showAppModal({
    icon: 'neutral',
    title: 'Learning level',
    body: 'Choose the level Finlingo should use for explanations.',
    actions: [
      ...levels.map(level => ({
        label: level,
        cls: level === _accountLevel() ? 'btn btn-primary' : 'modal-cancel',
        fn: () => {
          S.user = S.user || {};
          S.user.learningLevel = level;
          save();
          closeAppModal();
          openFinlingoAccount();
        }
      })),
      { label: 'Cancel', cls: 'modal-cancel', fn: closeAppModal }
    ]
  });
}

function _resetLearningProgressOnly() {
  const user = S.user;
  const joined = S.joinedDate;
  S.completedIds = [];
  S.unlockedIds = [1];
  S.totalCorrect = 0;
  S.totalAnswered = 0;
  S.bestScores = {};
  S.mastery = {};
  S.reviewQueue = [];
  S.lessonMiniProgress = typeof getDefaultLessonMiniProgress === 'function' ? getDefaultLessonMiniProgress() : {};
  S.refresherQuiz = typeof getDefaultRefresherQuiz === 'function' ? getDefaultRefresherQuiz() : {};
  S.pendingUnlocks = [];
  S.rewardsSummary = typeof getDefaultRewardsSummary === 'function' ? getDefaultRewardsSummary() : S.rewardsSummary;
  S.user = user;
  S.joinedDate = joined;
  try { localStorage.removeItem('finlingo_micro_progress_v1'); } catch (_) {}
  save();
  if (typeof updateTopbar === 'function') updateTopbar();
  try { window.dispatchEvent(new CustomEvent('finlingo:custom-units-updated')); } catch (_) {}
}

function confirmAccountResetProgress() {
  showAppModal({
    icon: 'danger',
    title: 'Reset learning progress?',
    body: 'This will remove lesson progress, completed units, quiz results, and learning history. Your generated units and chats will remain.',
    actions: [
      { label: 'Cancel', cls: 'modal-cancel', fn: closeAppModal },
      { label: 'Reset progress', cls: 'btn btn-danger', fn: () => {
          _resetLearningProgressOnly();
          closeAppModal();
          closeFinlingoAccount();
          if (typeof showToast === 'function') showToast('Progress reset', 'success');
        }
      }
    ]
  });
}

function confirmAccountSignOut() {
  showAppModal({
    icon: 'neutral',
    title: 'Sign out?',
    body: 'You can sign back in anytime.',
    actions: [
      { label: 'Cancel', cls: 'modal-cancel', fn: closeAppModal },
      { label: 'Sign out', cls: 'btn btn-danger', fn: () => {
          if (typeof clearStoredSession === 'function') clearStoredSession();
          S.user = null;
          save();
          closeAppModal();
          closeFinlingoAccount();
          if (typeof _showAuthBootScreen === 'function') _showAuthBootScreen();
          else if (typeof openAuthModal === 'function') openAuthModal('signin', { dismissible: false });
        }
      }
    ]
  });
}

function _renderSettingsSheet() {
  const body = document.getElementById('settingsSheetBody');
  if (!body) return;
  const isLight = document.body.dataset.theme === 'light';
  const appearanceIcon = isLight
    ? `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

  body.innerHTML = `
    <div class="profile-card settings-card">
      <button type="button" class="settings-row" onclick="settingsToggleTheme()">
        <span class="settings-row-icon">${appearanceIcon}</span>
        <span class="settings-row-info">
          <span class="settings-row-label">Appearance</span>
          <span class="settings-row-val">${isLight ? 'Light' : 'Dark'} theme</span>
        </span>
        <span class="settings-row-action">${isLight ? 'Switch to dark' : 'Switch to light'}</span>
      </button>
      <button type="button" class="settings-row" onclick="openSettingsAccount()">
        <span class="settings-row-icon"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
        <span class="settings-row-info">
          <span class="settings-row-label">Account</span>
          <span class="settings-row-val">Profile, email, and password</span>
        </span>
        <span class="settings-row-chev">${FinLingoIcons.right()}</span>
      </button>
    </div>

    <div class="profile-card settings-card">
      <button type="button" class="settings-row" onclick="settingsResetProgress()">
        <span class="settings-row-icon"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>
        <span class="settings-row-info">
          <span class="settings-row-label">Reset learning progress</span>
          <span class="settings-row-val">Clears lessons, reviews, and accuracy</span>
        </span>
        <span class="settings-row-action settings-row-action-danger">Reset</span>
      </button>
    </div>

    <button type="button" class="btn btn-danger settings-signout" onclick="settingsSignOut()">Sign Out</button>`;
}

function _showAuthBootScreen() {
  if (typeof _clearAuthenticatedIdentity === 'function') {
    _clearAuthenticatedIdentity();
  }
  document.body.classList.add('entry-gate-visible');
  const mainTopbar = document.getElementById('mainTopbar');
  if (mainTopbar) mainTopbar.style.display = 'none';
  try {
    if (typeof openAuthModal === 'function') {
      openAuthModal('signin', { dismissible: false });
    } else {
      _renderBootFallback('Finlingo could not start because auth did not load.');
    }
  } catch (err) {
    console.error('[boot] auth render failed:', err);
    _renderBootFallback('Finlingo could not start. Please refresh the page.');
  }
}

function enterWorkspaceShell() {
  document.body.classList.remove('entry-gate-visible');
}

function _renderBootFallback(message) {
  const mount = document.querySelector('.app') || document.body;
  if (!mount) return;
  document.body.classList.add('entry-gate-visible');
  let fallback = document.getElementById('bootFallback');
  if (!fallback) {
    fallback = document.createElement('div');
    fallback.id = 'bootFallback';
    fallback.setAttribute('role', 'alert');
    fallback.style.padding = '24px';
    fallback.style.color = '#111';
    fallback.style.background = '#fff';
    mount.prepend(fallback);
  }
  fallback.textContent = message || 'Finlingo could not start. Please refresh the page.';
}
// ============================================================
// app.js
// The central coordinator. Covers everything that doesn't belong
// in a more specific module:
//
//   TOPBAR    updateTopbar()
//   SCREENS   setScreen(), setNav(), showHome(), showPath(), showRanks()
//   TOAST     showToast()
//   MODAL     showAppModal(), closeAppModal()
//   SHARE     generateShareCard(), downloadShareCard(), nativeShare()
//   HOME      updateHome(), getGreeting()
//   RANKS     fetchLeaderboard(), renderRanks(), switchRanksTab()
//   PATH      renderPath()
//   PWA       manifest injection, service worker, install prompt
//   NOTIFS    requestNotifPermission(), scheduleLocalTabReminder()
//   INIT      wire events, boot sequence
//
// Depends on: ALL other modules (data, state, supabase, auth,
//             quiz, profile) — load app.js last.
// ============================================================

let _refresherPromptChecked = false;
let _refresherPromptTimer = null;
let _appModalOnClose = null;
let _streakRepairPromptTimer = null;
let _pendingResultStreakCelebration = null;
let _pendingResultStreakTimer = null;
let careerLadderExpanded = false;

const STREAK_REPAIR_PAYMENT_LINK = 'https://buy.stripe.com/test_cNi9AUdem7pZguH91a1kA02';
const STREAK_REPAIR_PRICE_LABEL = '$0.99';
const STREAK_REPAIR_PENDING_KEY = 'finlingo_streak_repair_pending';
const STREAK_REPAIR_SEEN_PREFIX = 'finlingo_streak_repair_seen_';

// ════════════════════════════════════════════════════════════
// TOPBAR
// ════════════════════════════════════════════════════════════

/** Re-render the topbar pills and progress bar. */
function updateTopbar() {
  const completedCount = Array.isArray(S.completedIds) ? S.completedIds.length : 0;
  const totalLessons = Array.isArray(LESSONS) ? LESSONS.length : 0;
  const answered = Math.max(0, Number(S.totalAnswered) || 0);
  const accuracy = answered > 0
    ? Math.round(((Number(S.totalCorrect) || 0) / answered) * 100)
    : 0;
  const progressPct = totalLessons > 0
    ? Math.round((completedCount / totalLessons) * 100)
    : 0;

  // The streak/accuracy pills were removed from the header; the account control
  // is now an icon button. Keep a stable accessible label on it.
  const accountBtn = document.getElementById('accountBtn');
  if (accountBtn) accountBtn.setAttribute('aria-label', 'Account and settings');

  const _streakVal = document.getElementById('streakVal');
  if (_streakVal) _streakVal.textContent = `${completedCount} lessons`;
  const _xpVal = document.getElementById('xpVal');
  if (_xpVal) _xpVal.textContent = answered > 0 ? `${accuracy}% accuracy` : 'No quiz data';
  const _cashEl = document.getElementById('cashVal');
  if (_cashEl) _cashEl.textContent = 'Account';

  const _levelFill = document.getElementById('levelFill');
  if (_levelFill) _levelFill.style.width = `${progressPct}%`;
  const _accText = document.getElementById('accText');
  if (_accText) _accText.textContent = 'Lessons';
  const _levelRange = document.getElementById('levelRangeText');
  if (_levelRange) _levelRange.textContent = `${completedCount} of ${totalLessons} lessons`;
}

function renderCompoundingBoostMarkup(meta = getCompoundingBoostMeta()) {
  if (!meta) return '';
  // Hide entirely while the multiplier is +0% — surfaces nothing useful at L1-4.
  if (!(Number(meta.multiplier) > 1)) return '';
  const boostValue = `${formatMultiplier(meta.multiplier)} rewards`;
  const boostSub = meta.nextLevel && meta.nextMultiplier
    ? `${meta.sourceName} · next at Level ${meta.nextLevel}`
    : `${meta.sourceName} · max advantage`;

  return `
    <div class="compounding-boost-card">
      <div class="compounding-boost-copy">
        <div class="compounding-boost-label">${COMPOUNDING_BOOST_LABEL}</div>
        <div class="compounding-boost-sub">${boostSub}</div>
      </div>
      <div class="compounding-boost-value">${boostValue}</div>
    </div>`;
}

function renderRankProgressBarMarkup(summary, rankColor = 'var(--green)', { compact = false } = {}) {
  if (!summary?.currentRank) return '';

  const progressPct = Math.max(0, Math.min(100, Number(summary.rankProgressPct) || 0));

  return `
    <div class="rank-progress-bar-shell${compact ? ' rank-progress-bar-shell-compact' : ''}">
      <div class="rank-progress-bar-wrap${compact ? ' rank-progress-bar-wrap-compact' : ''}">
        <div class="rank-progress-bar" style="width:${progressPct}%;background:${rankColor};"></div>
      </div>
    </div>`;
}

function formatDisplayPercent(value) {
  return `${Math.round(Math.max(0, Math.min(100, Number(value) || 0)))}%`;
}

function formatDisplayMoney(value) {
  return `$${Math.max(0, Math.round(Number(value) || 0)).toLocaleString()}`;
}

function renderHomeRankProgressCard(summary = null) {
  const el = document.getElementById('homeRankProgressCard');
  if (!el) return;

  const progress = summary || (typeof getProgressSummary === 'function' ? getProgressSummary() : null);
  if (!progress?.currentRank) {
    el.innerHTML = '';
    return;
  }

  const currentRank = progress.currentRank;
  const nextRank = progress.nextRank;
  const rankColor = (typeof RANK_META !== 'undefined' && RANK_META[currentRank.name]?.color) || 'var(--text)';
  const netWorth = Math.max(0, Number(progress.netWorth || 0));
  const netWorthToNextRank = Math.max(0, Number(progress.netWorthToNextRank || 0));
  const progressPct = Math.max(0, Math.min(100, Number(progress.rankProgressPct) || 0));
  const xpToNextLevel = Math.max(0, Number(progress.xpToNextLevel || 0));
  const level = Math.max(1, Number(progress.level || 1));
  const nextLevel = Math.max(level + 1, Number(progress.nextLevel || (level + 1)));
  const progressLabel = nextRank
    ? `${formatDisplayPercent(progressPct)} to ${nextRank.name}`
    : 'Top rank achieved';

  el.innerHTML = `
    <div class="home-progress-snapshot"
         onclick="showProgress()"
         role="button"
         tabindex="0"
         onkeydown="if(event.key==='Enter'||event.key===' ')showProgress()">
      <div class="home-progress-snapshot-top">
        <div>
          <div class="home-progress-kicker">Progress</div>
          <div class="home-progress-headline" style="color:${rankColor};">${currentRank.name}</div>
          <div class="home-progress-sub">
            ${nextRank ? `Next rank at ${formatDisplayMoney(nextRank.min)}` : 'You reached the top rank'}
          </div>
        </div>
        <div class="home-progress-link">Open Progress</div>
      </div>
      <div class="home-progress-grid">
        <div class="home-progress-tile">
          <span class="home-progress-tile-label">Level</span>
          <strong class="home-progress-tile-value">Lv ${level}</strong>
          <span class="home-progress-tile-sub">${xpToNextLevel > 0 ? `${xpToNextLevel.toLocaleString()} XP to Lv ${nextLevel}` : 'Level cap reached'}</span>
        </div>
        <div class="home-progress-tile">
          <span class="home-progress-tile-label">Net Worth</span>
          <strong class="home-progress-tile-value">${formatDisplayMoney(netWorth)}</strong>
          <span class="home-progress-tile-sub">${formatDisplayMoney(progress.cash || 0)} cash on hand</span>
        </div>
        <div class="home-progress-tile">
          <span class="home-progress-tile-label">Rank</span>
          <strong class="home-progress-tile-value">${currentRank.name}</strong>
          <span class="home-progress-tile-sub">${progressLabel}</span>
        </div>
      </div>
      <div class="home-progress-bar-shell">
        ${renderRankProgressBarMarkup(progress, rankColor, { compact: true })}
      </div>
      <div class="home-progress-foot">
        <span>${nextRank ? `${formatDisplayMoney(netWorthToNextRank)} to ${nextRank.name}` : 'Top rank reached'}</span>
        <span>${nextRank ? formatDisplayPercent(progressPct) : 'Max'}</span>
      </div>
    </div>`;
}

function renderHomeMomentumCard(summary = null) {
  const el = document.getElementById('homeMomentumCard');
  if (!el) return;

  const progress = summary || (typeof getProgressSummary === 'function' ? getProgressSummary() : null);
  const streak = Math.max(0, Number(S.streak) || 0);
  const freezes = Math.max(0, Number(S.inventory?.streakSavers) || 0);
  const dueCount = Math.max(0, Number(progress?.dueReviewCount) || 0);
  const achievementCount = typeof getAchievements === 'function'
    ? getAchievements().length
    : Object.keys(S.achievements || {}).length;
  const milestones = [7, 14, 30];
  const nextMilestone = milestones.find(value => streak < value) || null;
  const leadTitle = streak > 0 ? `${streak}-day streak` : 'Start your streak';
  const leadSub = dueCount > 0
    ? `${dueCount} review ${dueCount === 1 ? 'question' : 'questions'} ready`
    : streak > 0
      ? (nextMilestone
          ? `${nextMilestone - streak} ${nextMilestone - streak === 1 ? 'day' : 'days'} to the next streak marker`
          : 'Core streak milestones completed')
      : 'Finish one lesson today to build momentum.';

  el.innerHTML = `
    <div class="home-momentum-card"
         onclick="showProgress()"
         role="button"
         tabindex="0"
         onkeydown="if(event.key==='Enter'||event.key===' ')showProgress()">
      <div class="home-momentum-top">
        <div class="home-momentum-kicker">Momentum</div>
        <div class="home-momentum-link">Progress</div>
      </div>
      <div class="home-momentum-title">${leadTitle}</div>
      <div class="home-momentum-sub">${leadSub}</div>
      <div class="home-momentum-meta">
        <span>${achievementCount} achievement${achievementCount === 1 ? '' : 's'}</span>
        <span>${freezes} freeze${freezes === 1 ? '' : 's'}</span>
      </div>
    </div>`;
}

function renderHomeMarketShortcutCard(summary = null) {
  const el = document.getElementById('marketUnlockCard');
  if (!el) return;

  const progress = summary || (typeof getProgressSummary === 'function' ? getProgressSummary() : null);
  const portfolioValue = typeof getPortfolioValue === 'function'
    ? Number(getPortfolioValue() || 0)
    : Math.max(0, Number(progress?.netWorth || S.cash || 0));
  const marketFeatures = _getMarketFeatureRegistry();
  const currentXp = Number(S.xp || 0);
  const newFeature = marketFeatures
    .filter(feature => currentXp >= feature.requiredXp)
    .find(feature => !localStorage.getItem(`finlingo_market_seen_${feature.id}`));

  if (newFeature) {
    const seenKey = `finlingo_market_seen_${newFeature.id}`;
    const requiredLevel = typeof getLevelFromXP === 'function' ? getLevelFromXP(newFeature.requiredXp) : null;
    const featureTitle = typeof newFeature.title === 'function' ? newFeature.title() : newFeature.title;
    el.innerHTML = `
      <div class="home-market-shortcut home-market-shortcut-unlock"
           onclick="localStorage.setItem('${seenKey}','1');renderHomeMarketShortcutCard();showMarket();"
           role="button"
           tabindex="0"
           onkeydown="if(event.key==='Enter'||event.key===' '){localStorage.setItem('${seenKey}','1');renderHomeMarketShortcutCard();showMarket();}">
        <div class="home-market-shortcut-copy">
          <div class="home-market-shortcut-kicker">New in Market</div>
          <div class="home-market-shortcut-title">${featureTitle}</div>
          <div class="home-market-shortcut-sub">Unlocked at ${requiredLevel ? `Level ${requiredLevel}` : `${newFeature.requiredXp.toLocaleString()} XP`}.</div>
        </div>
        <div class="home-market-shortcut-cta">Try Now</div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="home-market-shortcut"
         onclick="showMarket()"
         role="button"
         tabindex="0"
         onkeydown="if(event.key==='Enter'||event.key===' ')showMarket()">
      <div class="home-market-shortcut-copy">
        <div class="home-market-shortcut-kicker">Portfolio</div>
        <div class="home-market-shortcut-title">${formatDisplayMoney(portfolioValue)}</div>
        <div class="home-market-shortcut-sub">Open Market for holdings, Blue Chip Picks, and search.</div>
      </div>
      <div class="home-market-shortcut-cta">Open</div>
    </div>`;
}

function openStreakModal({ variant = 'default', streakValue = Math.max(0, Number(S.streak) || 0), afterClose = null } = {}) {
  const number = Math.max(0, Number(streakValue) || 0);
  const line = 'Day Streak!';
  const title = variant === 'continued'
    ? 'Streak extended'
    : variant === 'restarted'
      ? 'Streak restarted'
      : variant === 'started'
        ? 'You started a streak!'
        : 'Current Streak';
  const support = variant === 'continued'
    ? 'First lesson complete for today.'
    : variant === 'restarted'
      ? 'You are back on the board.'
      : variant === 'started'
        ? 'Your daily streak has begun.'
        : (number > 0
            ? 'Complete your first lesson each day to keep it going.'
            : 'Complete your first lesson today to start it.');

  showAppModal({
    icon: 'neutral',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="#d4a000" stroke-width="1.8">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>`,
    title,
    showClose: true,
    onClose: afterClose,
    bodyIsHTML: true,
    body: `
      <div class="streak-modal-shell">
        <div class="streak-modal-number">${number}</div>
        <div class="streak-modal-bolt">
          <svg viewBox="0 0 24 24">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <div class="streak-modal-line">${line}</div>
        <div class="streak-modal-support">${support}</div>
      </div>`,
    actions: [
      {
        label: variant === 'default' ? 'Close' : 'Keep going',
        cls: 'btn btn-primary',
        fn: closeAppModal
      }
    ]
  });
}

function showStreakCelebration(streakUpdate, afterClose = null) {
  if (!streakUpdate?.changed) return;
  const variant = streakUpdate.status === 'continued'
    ? 'continued'
    : streakUpdate.status === 'restarted'
      ? 'restarted'
      : 'started';
  openStreakModal({
    variant,
    streakValue: streakUpdate.streak,
    afterClose
  });
}

function clearPendingResultStreakCelebration() {
  if (_pendingResultStreakTimer) {
    clearTimeout(_pendingResultStreakTimer);
    _pendingResultStreakTimer = null;
  }
  _pendingResultStreakCelebration = null;
}

function pulseStreakPill() {
  const streakPill = document.getElementById('streakPill');
  if (!streakPill) return;
  streakPill.classList.remove('pill-streak-pulse');
  void streakPill.offsetWidth;
  streakPill.classList.add('pill-streak-pulse');
}

function queueResultStreakCelebration(streakUpdate, afterClose = null, delayMs = 1000) {
  clearPendingResultStreakCelebration();
  _pendingResultStreakCelebration = streakUpdate?.changed
    ? { streakUpdate, afterClose }
    : null;
  if (!_pendingResultStreakCelebration) return;

  _pendingResultStreakTimer = setTimeout(() => {
    const pending = _pendingResultStreakCelebration;
    _pendingResultStreakCelebration = null;
    _pendingResultStreakTimer = null;
    if (!pending?.streakUpdate?.changed) return;
    showStreakCelebration(pending.streakUpdate, pending.afterClose);
  }, Math.max(0, Number(delayMs) || 0));
}

function triggerQueuedStreakCelebrationAfterResult(delayMs = 1000) {
  if (!_pendingResultStreakCelebration) return;
  const pending = _pendingResultStreakCelebration;
  queueResultStreakCelebration(pending.streakUpdate, pending.afterClose, delayMs);
}


// ════════════════════════════════════════════════════════════
// SCREEN & NAV HELPERS
// ════════════════════════════════════════════════════════════

function _resetTransientUiLayers({ preserveMarketModal = false } = {}) {
  _clearStreakRepairPromptTimer();

  const appModal = document.getElementById('appModal');
  if (appModal?.classList.contains('open')) {
    closeAppModal();
  }

  const rankModal = document.getElementById('rankModal');
  if (rankModal?.classList.contains('open')) {
    rankModal.classList.remove('open');
  }

  const questsModal = document.getElementById('questsModal');
  if (questsModal?.classList.contains('open')) {
    if (typeof closeQuestsModal === 'function') closeQuestsModal();
    else questsModal.classList.remove('open');
  }

  const editOverlay = document.getElementById('editOverlay');
  if (editOverlay?.classList.contains('open')) {
    if (typeof closeEditSheet === 'function') closeEditSheet();
    else editOverlay.classList.remove('open');
  }

  const marketModal = document.getElementById('marketModal');
  if (!preserveMarketModal && marketModal?.classList.contains('open')) {
    if (typeof _closeMarketModal === 'function') _closeMarketModal();
    else marketModal.classList.remove('open');
  }

  if (window.NavDrawer && typeof window.NavDrawer.close === 'function') {
    window.NavDrawer.close();
  }
}

/** Deactivate all screens, then activate the one with the given id. */
function setScreen(id, { preserveTransientLayers = false, resetScroll = false } = {}) {
  const nextScreen = document.getElementById(id);
  if (!nextScreen) {
    console.warn('[navigation] missing screen:', id);
    return false;
  }

  if (!preserveTransientLayers) {
    _resetTransientUiLayers();
  }

  document.body.dataset.activeScreen = id;
  document.body.classList.toggle('auth-screen-active', id === 'authScreen');
  document.querySelectorAll('.screen').forEach(s => {
    const active = s === nextScreen;
    s.classList.toggle('active', active);
    s.toggleAttribute('inert', !active);
    s.style.display = active ? '' : 'none';
    s.style.pointerEvents = active ? '' : 'none';
  });
  nextScreen.classList.add('active');
  nextScreen.removeAttribute('inert');
  nextScreen.style.display = '';
  nextScreen.style.pointerEvents = '';
  if (id !== 'authScreen' && typeof refreshAskFinLingoContext === 'function') {
    const kind = ['pathScreen', 'courseScreen', 'quizScreen', 'resultScreen'].includes(id)
      ? 'lesson'
      : id === 'marketScreen'
        ? 'market'
        : 'learn';
    setTimeout(() => refreshAskFinLingoContext(kind), 0);
  }

  if (resetScroll) {
    window.scrollTo(0, 0);
    const app = document.querySelector('.app');
    if (app) app.scrollTop = 0;
    nextScreen.scrollTop = 0;
  }
  syncTopbarNewChat();
  try { window.dispatchEvent(new CustomEvent('finlingo:screen-changed', { detail: { id } })); } catch (_) {}
  return true;
}

/**
 * The shared-header "New Chat" button lives only on the Ask page. Show it when
 * the Ask screen is active, hide it everywhere else (Learn, Market, lessons,
 * quizzes, unit-completion). While a Claude request is in flight it is disabled
 * so a new chat can't redirect the pending response.
 */
function syncTopbarNewChat() {
  const btn = document.getElementById('topbarNewChat');
  if (!btn) return;
  const onAsk = !!document.getElementById('coachScreen')?.classList.contains('active');
  btn.hidden = !onAsk;
  const busy = !!(window.CoachPage && typeof window.CoachPage.isBusy === 'function' && window.CoachPage.isBusy());
  btn.disabled = busy;
  btn.setAttribute('aria-disabled', busy ? 'true' : 'false');
}

// Keep the button's disabled state in sync while an Ask request runs.
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('finlingo:coach-busy-changed', syncTopbarNewChat);
}

/** Deactivate all nav buttons, then activate the one with the given id. */
function setNav(id) {
  const section = id === 'navCoach' ? 'ask' : id === 'navPath' ? 'learn' : id === 'navMarket' ? 'market' : '';
  if (section) document.body.dataset.primarySection = section;
  if (window.NavDrawer && typeof window.NavDrawer.refresh === 'function') window.NavDrawer.refresh();
}

function toggleWorkspaceSidebar() {
  const collapsed = !document.body.classList.contains('workspace-sidebar-collapsed');
  document.body.classList.toggle('workspace-sidebar-collapsed', collapsed);
  localStorage.setItem('finlingo_workspace_sidebar', collapsed ? 'collapsed' : 'expanded');
  const button = document.querySelector('.workspace-collapse');
  if (button) button.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
}

let workspaceLearnMenuOpen = false;
let workspaceOpenUnitId = null;
// Temporarily hidden until rebuilt in the canonical slide-based lesson format.
const LEGACY_PRESET_UNIT_IDS = new Set([3, 4, 5, 6]);

function _visiblePresetUnitDefs(units) {
  return (Array.isArray(units) ? units : []).filter(unit => !LEGACY_PRESET_UNIT_IDS.has(Number(unit && unit.id)));
}

function _originalCurriculumUnits() {
  const lessons = (typeof LESSONS !== 'undefined' && Array.isArray(LESSONS))
    ? LESSONS.filter(lesson => lesson && Number.isFinite(Number(lesson.id)))
    : [];
  const units = (typeof UNITS_DEF !== 'undefined' && Array.isArray(UNITS_DEF))
    ? _visiblePresetUnitDefs(UNITS_DEF)
    : [];

  if (units.length) {
    return units.map(unit => {
      const unitLessons = typeof getUnitLessons === 'function'
        ? getUnitLessons(unit)
        : lessons.filter(lesson => lesson.unit && (lesson.unit === unit.name || lesson.unit === unit.title));
      return {
        ...unit,
        lessons: Array.isArray(unitLessons) ? unitLessons.filter(Boolean) : []
      };
    }).filter(unit => unit.lessons.length);
  }

  const byUnit = new Map();
  lessons.forEach(lesson => {
    const name = lesson.unit || 'Finance';
    if (!byUnit.has(name)) {
      byUnit.set(name, {
        id: byUnit.size + 1,
        name,
        title: name,
        description: '',
        lessons: []
      });
    }
    byUnit.get(name).lessons.push(lesson);
  });
  return [...byUnit.values()];
}

function _setWorkspaceLearnMenu(open) {
  workspaceLearnMenuOpen = Boolean(open);
  document.getElementById('workspaceLearnMenu')?.classList.toggle('open', workspaceLearnMenuOpen);
  document.getElementById('workspaceLearnButton')?.setAttribute('aria-expanded', String(workspaceLearnMenuOpen));
}

function toggleWorkspaceLearnMenu(event) {
  event?.stopPropagation();
  const learnIsActive = document.getElementById('pathScreen')?.classList.contains('active');
  if (!learnIsActive) {
    _setWorkspaceLearnMenu(true);
    showLearn({ resetScroll: true });
    return;
  }
  _setWorkspaceLearnMenu(!workspaceLearnMenuOpen);
}

function toggleWorkspaceUnit(unitId) {
  const id = Number(unitId);
  workspaceOpenUnitId = workspaceOpenUnitId === id ? null : id;
  renderWorkspaceCurriculum();
}

function openWorkspaceLesson(lessonId, unitId) {
  learnFilter = Number(unitId);
  learnPreviewLessonId = Number(lessonId);
  workspaceOpenUnitId = Number(unitId);
  _setWorkspaceLearnMenu(true);
  showLearn({ resetScroll: true });
}

function renderWorkspaceCurriculum() {
  const menu = document.getElementById('workspaceLearnMenu');
  if (!menu) return;
  const units = _originalCurriculumUnits();
  const completed = new Set((Array.isArray(S?.completedIds) ? S.completedIds : []).map(Number));
  const selectedLesson = (typeof LESSONS !== 'undefined' && Array.isArray(LESSONS))
    ? LESSONS.find(lesson => lesson.id === Number(learnPreviewLessonId))
    : null;
  const selectedUnit = selectedLesson && typeof getUnitForLesson === 'function'
    ? getUnitForLesson(selectedLesson)
    : null;
  if (!workspaceOpenUnitId) {
    workspaceOpenUnitId = selectedUnit?.id || units.find(unit =>
      unit.lessons.some(lesson => !completed.has(Number(lesson.id)))
    )?.id || units[0]?.id || null;
  }

  menu.innerHTML = units.map(unit => {
    const progress = typeof getUnitProgress === 'function'
      ? getUnitProgress(unit, [...completed])
      : {
          completedCount: unit.lessons.filter(lesson => completed.has(Number(lesson.id))).length,
          total: unit.lessons.length
        };
    const open = workspaceOpenUnitId === unit.id;
    return `<section class="workspace-curriculum-unit${open ? ' open' : ''}">
      <button type="button" class="workspace-unit-toggle" aria-expanded="${open}" onclick="toggleWorkspaceUnit(${unit.id})">
        <span class="workspace-unit-index">${unit.id}</span>
        <span class="workspace-unit-title"><strong>${escapeAppHtml(unit.title || unit.name)}</strong><small>${progress.completedCount} of ${progress.total}</small></span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="workspace-unit-lessons">
        ${unit.lessons.filter(Boolean).map((lesson, index) => {
          const done = completed.has(Number(lesson.id));
          const active = Number(learnPreviewLessonId) === Number(lesson.id);
          return `<button type="button" class="workspace-curriculum-lesson${active ? ' active' : ''}"
                  onclick="openWorkspaceLesson(${lesson.id},${unit.id})">
            <span>${done ? '✓' : index + 1}</span>
            <strong>${escapeAppHtml(lesson.title || `Lesson ${lesson.id}`)}</strong>
          </button>`;
        }).join('')}
      </div>
    </section>`;
  }).join('');
}

function _runScreenEntry(onEnter, screenLabel) {
  if (typeof onEnter !== 'function') return;
  try {
    const result = onEnter();
    if (result && typeof result.then === 'function') {
      result.catch(err => {
        console.error(`[navigation] ${screenLabel} render failed`, err);
        showToast(`Couldn't open ${screenLabel} right now`, 'error');
      });
    }
  } catch (err) {
    console.error(`[navigation] ${screenLabel} render failed`, err);
    showToast(`Couldn't open ${screenLabel} right now`, 'error');
  }
}

function _activateScreen(screenId, navId, onEnter, screenLabel, options = {}) {
  if (!setScreen(screenId, options)) return;
  setNav(navId);
  _runScreenEntry(onEnter, screenLabel || screenId);
}

// The Ask page is the AI-first front door — the default landing after
// onboarding and the former "home". (updateHome() still safely refreshes the
// hidden home DOM when called by other flows.)
function showHome(options = {}) {
  return showCoach(options);
}
function showCoach(options = {}) {
  _activateScreen('coachScreen', 'navCoach', () => {
    if (typeof renderCoach === 'function') renderCoach();
  }, 'Ask', options);
}
function showLearn(options = {}) {
  _activateScreen('pathScreen', 'navPath', () => {
    renderPath();
    _setWorkspaceLearnMenu(false);
  }, 'Learn', options);
}
function showPath() { showLearn(); }
function showLeaderboard() { showPractice(); }
function showMarket(options = {}) {
  _activateScreen('marketScreen', 'navMarket', () => {
    renderMarket();
  }, 'Market', options);
}
function showPractice(options = {}) {
  if (options && typeof options !== 'object') options = {};
  // Journey is no longer in the primary nav (Ask/Learn/Market), so it
  // highlights no nav item.
  _activateScreen('ranksScreen', null, () => {
    renderPracticePage();
  }, 'Mastery', options);
}

/** Animate the "+N XP" bubble floating up over the quiz. */
function showXpPop(value) {
  const pop = document.getElementById('xpPop');
  if (pop) pop.textContent = '';
}

/** Animate the "+$N" cash bubble — same pattern as XP pop. */
function showCashPop(value) {
  const pop = document.getElementById('cashPop');
  if (!pop) return;
  pop.textContent = '';
}


// ════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════

let toastTimer = null;

/**
 * Show a small floating message for ~2.4 seconds.
 * @param {string} msg   - message text
 * @param {string} type  - '' | 'success' | 'error'
 */
function showToast(msg, type = '') {
  const t = document.getElementById('appToast');
  t.textContent = msg;
  t.className   = 'toast' + (type ? ' ' + type : '');
  void t.offsetWidth;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}


// ════════════════════════════════════════════════════════════
// IN-APP MODAL
// ════════════════════════════════════════════════════════════

/**
 * Open the in-app modal dialog.
 * @param {object} opts
 * @param {string}   opts.icon       - 'neutral' | 'danger' | 'gold' | 'platinum'
 * @param {string}   [opts.iconSvg]  - raw SVG string (overrides icon preset)
 * @param {string}   opts.title
 * @param {string}   opts.body
 * @param {boolean}  [opts.bodyIsHTML] - inject body as innerHTML if true
 * @param {Array}    opts.actions    - [{ label, cls, fn, disabled }]
 */
function showAppModal({ icon, iconSvg, title, body, bodyIsHTML, actions, showClose, onClose, boxClass }) {
  const overlay  = document.getElementById('appModal');
  const boxEl    = document.getElementById('appModalBox');
  const iconEl   = document.getElementById('modalIcon');
  const closeBtn = document.getElementById('modalCloseBtn');

  // Fallback SVG icons keyed by icon name
  const fallbacks = {
    neutral:  `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    danger:   `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
    gold:     `<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    platinum: `<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
  };

  iconEl.className = 'modal-icon ' + (icon || 'neutral');
  iconEl.innerHTML = iconSvg || fallbacks[icon] || fallbacks.neutral;
  document.getElementById('modalTitle').textContent = title || '';
  boxEl.className = 'modal-box' + (boxClass ? ` ${boxClass}` : '');
  _appModalOnClose = typeof onClose === 'function' ? onClose : null;
  if (closeBtn) {
    closeBtn.style.display = showClose ? '' : 'none';
    closeBtn.onclick = closeAppModal;
  }

  const bodyEl = document.getElementById('modalBody');
  if (bodyIsHTML) bodyEl.innerHTML    = body || '';
  else            bodyEl.textContent  = body || '';

  const actionsEl = document.getElementById('modalActions');
  actionsEl.innerHTML = '';
  (actions || []).forEach(a => {
    const btn       = document.createElement('button');
    btn.className   = a.cls   || 'btn btn-primary';
    btn.textContent = a.label || 'OK';
    btn.disabled    = !!a.disabled;
    btn.onclick     = a.fn;
    actionsEl.appendChild(btn);
  });

  overlay.classList.add('open');
}

function closeAppModal() {
  const overlay = document.getElementById('appModal');
  const boxEl = document.getElementById('appModalBox');
  const closeBtn = document.getElementById('modalCloseBtn');
  const onClose = _appModalOnClose;
  _appModalOnClose = null;
  overlay.classList.remove('open');
  if (boxEl) boxEl.className = 'modal-box';
  if (closeBtn) closeBtn.style.display = 'none';
  if (typeof onClose === 'function') onClose();
}

// Close modal when clicking the dim overlay background
document.getElementById('appModal').addEventListener('click', function (e) {
  if (e.target === this) closeAppModal();
});


// ════════════════════════════════════════════════════════════
// RANK ROADMAP MODAL
// Opens when the user clicks the XP banner on the home screen.
// Shows a career-style progression roadmap using the LEVELS array.
// ════════════════════════════════════════════════════════════

/**
 * Open the rank roadmap popup.
 * Reads from S (state) and LEVELS (data.js) — no new state needed.
 */
function openRankRoadmap() {
  const modal = document.getElementById('rankModal');
  const statsEl = document.getElementById('rankModalStats');
  const roadmapEl = document.getElementById('rankModalRoadmap');
  if (!modal || !statsEl || !roadmapEl) {
    if (typeof showRanks === 'function') showRanks();
    return;
  }

  const levelSummary = typeof getLevelProgress === 'function' ? getLevelProgress(S.xp) : null;
  const boostMeta = typeof getCompoundingBoostMeta === 'function' ? getCompoundingBoostMeta(S.xp) : null;
  const lessons = (S.completedIds || []).length;
  const streak = S.streak || 0;
  const boostMilestones = Array.isArray(COMPOUNDING_BOOST_LEVELS)
    ? COMPOUNDING_BOOST_LEVELS.filter(tier => tier.level >= (levelSummary?.level || 1)).slice(0, 5)
    : [];

  statsEl.innerHTML = `
    <div style="text-align:center;margin-bottom:14px;">
      <div style="font-family:var(--font-m);font-size:0.58rem;color:var(--muted2);
        text-transform:uppercase;letter-spacing:0.9px;margin-bottom:4px;">Current Level</div>
      <div style="font-family:var(--font-d);font-size:1.4rem;font-weight:800;
        color:var(--green-text);margin-bottom:12px;">Level ${levelSummary?.level || 1}</div>
      <div style="display:flex;gap:7px;margin-bottom:12px;">
        ${[
          { label:'Total XP', val:`${Number(S.xp || 0).toLocaleString()} XP` },
          { label:'Lessons', val:lessons },
          { label:'Streak', val:`${streak}d` },
          { label:'Boost', val:`${formatMultiplier(boostMeta?.multiplier || 1)}` }
        ].map(s => `
          <div style="flex:1;background:var(--bg2);border:1px solid var(--border);
            border-radius:10px;padding:9px 6px;text-align:center;">
            <div style="font-family:var(--font-m);font-size:0.82rem;font-weight:700;
              color:var(--text);margin-bottom:1px;">${s.val}</div>
            <div style="font-family:var(--font-m);font-size:0.55rem;color:var(--muted2);
              text-transform:uppercase;letter-spacing:0.3px;">${s.label}</div>
          </div>`).join('')}
      </div>
    </div>
    <div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;
        font-family:var(--font-m);font-size:0.6rem;color:var(--muted2);margin-bottom:6px;">
        <span>XP Progress</span>
        <span>${Number(levelSummary?.xp || 0).toLocaleString()} / ${Number(levelSummary?.nextLevelXp || 0).toLocaleString()} XP</span>
      </div>
      <div style="height:5px;border-radius:99px;background:var(--border);overflow:hidden;">
        <div style="height:100%;width:${levelSummary?.progressPct || 0}%;border-radius:99px;
          background:var(--green);transition:width 0.4s ease;"></div>
      </div>
      <div style="margin-top:7px;font-family:var(--font-m);font-size:0.58rem;color:var(--muted2);text-align:right;">
        ${Number(levelSummary?.xpToNextLevel || 0).toLocaleString()} XP to Level ${levelSummary?.nextLevel || 2}
      </div>
    </div>`;

  roadmapEl.innerHTML = `
    <div style="font-family:var(--font-m);font-size:0.6rem;font-weight:700;
      color:var(--muted2);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;">
      Compounding Milestones
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${boostMilestones.map((tier, idx) => {
        const isCurrent = tier.level === boostMeta?.level;
        const isReached = (levelSummary?.level || 1) >= tier.level;
        return `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:11px;
            background:${isCurrent ? 'rgba(255,255,255,0.08)' : 'transparent'};
            border:1px solid ${isCurrent ? 'rgba(255,255,255,0.24)' : 'var(--border)'};
            opacity:${isReached || isCurrent ? '1' : '0.7'};">
            <div style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;
              background:${isReached ? 'rgba(255,255,255,0.10)' : 'var(--bg3)'};
              border:1px solid ${isReached ? 'rgba(255,255,255,0.24)' : 'var(--border)'};
              color:${isReached ? 'var(--green-text)' : 'var(--muted2)'};font-family:var(--font-d);font-size:0.72rem;font-weight:800;">
              L${tier.level}
            </div>
            <div style="flex:1;">
              <div style="font-family:var(--font-d);font-size:0.9rem;font-weight:800;color:var(--text);margin-bottom:2px;">
                ${formatMultiplier(tier.multiplier)} rewards
                ${isCurrent ? `<span style="font-family:var(--font-m);font-size:0.55rem;font-weight:700;
                  padding:2px 7px;border-radius:99px;margin-left:6px;vertical-align:middle;
                  background:rgba(255,255,255,0.10);color:var(--green-text);border:1px solid rgba(255,255,255,0.22);">Current</span>` : ''}
              </div>
              <div style="font-family:var(--font-m);font-size:0.61rem;color:var(--muted2);">
                ${isReached ? 'Unlocked through XP progression' : `Unlocks at Level ${tier.level}`}
              </div>
            </div>
            ${idx === 0 && !isCurrent ? `<div style="font-family:var(--font-m);font-size:0.58rem;color:var(--muted2);">
              ${Math.max(0, tier.level - (levelSummary?.level || 1))} level${Math.max(0, tier.level - (levelSummary?.level || 1)) === 1 ? '' : 's'} away
            </div>` : ''}
          </div>`;
      }).join('')}
    </div>`;

  modal.classList.add('open');
}



// ════════════════════════════════════════════════════════════
// RANK PROMOTION MODAL
// Called from quiz.js finishRun() whenever the user crosses a
// rank threshold.  Fires only once per rank (localStorage key).
// ════════════════════════════════════════════════════════════

/**
 * Show a promotion modal when the user reaches a new rank.
 * @param {object} lvBefore  — LEVELS entry before this quiz
 * @param {object} lvAfter   — LEVELS entry after this quiz
 */
function showRankPromotion(lvBefore, lvAfter, promotionData = null) {
  // Guard: only fire once per rank — prevents re-trigger on refresh
  const _key = 'finlingo_promoted_' + lvAfter.name.replace(/\s+/g, '_');
  if (localStorage.getItem(_key)) return;
  localStorage.setItem(_key, '1');

  const meta      = (typeof RANK_META !== 'undefined' && RANK_META[lvAfter.name]) || {};
  const color     = meta.color     || 'var(--green)';
  const cashBonus = promotionData?.cashBonus ?? meta.cashBonus ?? 0;
  const perk      = promotionData?.perk || meta.perk || 'New career milestone unlocked';
  const activeBoost = getCompoundingBoostMeta(S.xp, S.user);
  const rewardId = `promotion-xp:${lvAfter.name}`;
  const boostLine = activeBoost.multiplier > 1
    ? `Your ${COMPOUNDING_BOOST_LABEL} is ${formatMultiplier(activeBoost.multiplier)} rewards at ${activeBoost.sourceName}.`
    : `${COMPOUNDING_BOOST_LABEL} starts growing as you level up.`;
  const applyPromotionBonus = () => {
    const xpReward = awardRewards({
      baseXp: RANK_UP_BONUS_XP,
      source: 'promotion_rank_bonus',
      meta: {
        rewardId,
        includeCompounding: false,
        skipQuestUpdate: true
      }
    });
    if (typeof save === 'function') save();
    if (typeof updateTopbar === 'function') updateTopbar();
    if (typeof renderHomeRankProgressCard === 'function') renderHomeRankProgressCard();
    if ((xpReward?.xpAwarded || 0) > 0) {
      showToast(`+${xpReward.xpAwarded} XP promotion bonus`, 'success');
    }
    return xpReward;
  };

  showAppModal({
    icon:      'neutral',
    iconSvg:   `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8">
                  <path d="M8 21h8M12 17v4M7 4H4a2 2 0 0 0-2 2v1c0 4.4 2.9 8.2 7 9.5
                           M17 4h3a2 2 0 0 1 2 2v1c0 4.4-2.9 8.2-7 9.5M5 4h14"/>
                </svg>`,
    title:     'Progress Milestone',
    onClose:   applyPromotionBonus,
    bodyIsHTML: true,
    body: `
      <div style="text-align:center;">
        <div style="font-family:var(--font-m);font-size:0.6rem;color:var(--muted2);
          text-transform:uppercase;letter-spacing:0.9px;margin-bottom:5px;">New Rank</div>
        <div style="font-family:var(--font-d);font-size:1.35rem;font-weight:800;
          color:${color};margin-bottom:16px;">${lvAfter.name}</div>
        <div style="margin:0 0 14px;font-size:0.8rem;line-height:1.5;color:var(--text-sub);">
          Your net worth just reached the ${lvAfter.name} milestone. ${boostLine}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;text-align:left;
          background:var(--bg2);border:1px solid var(--border);border-radius:11px;
          padding:12px 14px;">
          <div style="display:flex;align-items:center;gap:9px;font-size:0.82rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--green-text)" stroke-width="2.2"
              style="width:13px;height:13px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
            <span style="color:var(--green-text);font-weight:700;">+${RANK_UP_BONUS_XP} XP promotion bonus</span>
          </div>
          <div style="display:flex;align-items:center;gap:9px;font-size:0.82rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--green-text)" stroke-width="2.2"
              style="width:13px;height:13px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
            <span style="color:var(--green-text);font-weight:700;">${COMPOUNDING_BOOST_LABEL}: ${formatMultiplier(activeBoost.multiplier)} rewards</span>
          </div>
          ${cashBonus > 0 ? `
          <div style="display:flex;align-items:center;gap:9px;font-size:0.82rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--green-text)" stroke-width="2.2"
              style="width:13px;height:13px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
            <span style="color:var(--green-text);font-weight:700;">+$${cashBonus} net worth bonus</span>
          </div>` : ''}
          <div style="display:flex;align-items:center;gap:9px;font-size:0.82rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--green-text)" stroke-width="2.2"
              style="width:13px;height:13px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
            <span style="color:var(--text-sub);">${perk}</span>
          </div>
        </div>
      </div>`,
    actions: [
      { label: 'Claim Reward', cls: 'btn btn-primary',
        fn: () => {
          applyPromotionBonus();
          closeAppModal();
        } }
    ]
  });
}

/**
 * Close the rank roadmap modal.
 * Also called when clicking the dim overlay (e.target check in HTML).
 */
function closeRankRoadmap(e) {
  // If called from the overlay click, only close if clicking directly on the overlay
  const modal = document.getElementById('rankModal');
  if (!modal) return;
  if (e && e.target !== modal) return;
  modal.classList.remove('open');
}

/** Draw the stats share card onto the hidden <canvas> and reveal the preview. */
function generateShareCard() {
  const canvas = document.getElementById('shareCanvas');
  const ctx    = canvas.getContext('2d');
  const W = 600, H = 300;
  canvas.width = W; canvas.height = H;

  // Background — matches --bg
  ctx.fillStyle = '#0b0d10'; ctx.fillRect(0, 0, W, H);

  // Top accent bar — matches --green
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, 3);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // Decorative mini chart
  const chartPts = [0.7,0.5,0.65,0.4,0.55,0.3,0.45,0.25,0.35,0.15,0.28,0.1];
  ctx.beginPath(); ctx.strokeStyle = 'rgba(31,157,85,0.32)'; ctx.lineWidth = 2;
  chartPts.forEach((v, i) => {
    const x = 300 + i * 28, y = H - 20 - v * (H * 0.5);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Brand — single color, no Fin/lingo split
  ctx.font = '600 22px Inter, sans-serif';
  ctx.fillStyle = '#e6e8ec';
  ctx.fillText('Finlingo', 36, 56);

  // User name
  const name = S.user?.name || 'Learner';
  ctx.font = '600 30px Inter, sans-serif'; ctx.fillStyle = '#e6e8ec';
  ctx.fillText(name, 36, 108);

  // Level badge
  const xpLevel = typeof getLevelFromXP === 'function' ? getLevelFromXP(S.xp) : 1;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, 36, 124, 110, 26, 4); ctx.fill();
  ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`LEVEL ${xpLevel}`, 46, 142);

  // Streak number (large) — uses --green-text
  ctx.font = '600 64px Inter, sans-serif'; ctx.fillStyle = '#ffffff';
  ctx.fillText(S.streak, 36, 226);
  ctx.font = '13px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('DAY STREAK', 36, 248);

  // Stats row
  const stats = [
    { label: 'XP',       val: S.xp },
    { label: 'LESSONS',  val: S.completedIds.length },
    { label: 'ACCURACY', val: (S.totalAnswered ? Math.round(S.totalCorrect / S.totalAnswered * 100) : 0) + '%' }
  ];
  stats.forEach((s, i) => {
    const x = 200 + i * 110;
    ctx.font = '600 24px Inter, sans-serif'; ctx.fillStyle = '#e6e8ec';
    ctx.fillText(s.val, x, 213);
    ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(s.label, x, 230);
  });

  // Footer tagline
  ctx.font = '12px Inter, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillText('Learn the language of finance. finlingo.app', 36, 285);

  // Show preview and action buttons
  const preview = document.getElementById('sharePreview');
  preview.style.display = 'block';
  preview.innerHTML = `<img src="${canvas.toDataURL('image/png')}" alt="Share card"/>
    <div class="share-actions">
      <button class="share-action-btn" onclick="downloadShareCard()">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download
      </button>
      <button class="share-action-btn" onclick="nativeShare()" id="nativeShareBtn">
        <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Share
      </button>
    </div>`;

  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) shareBtn.textContent = 'Regenerate card';
  if (!navigator.share) document.getElementById('nativeShareBtn')?.setAttribute('style', 'display:none');
}

/** Helper: draw a rounded rectangle path on a canvas context. */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);                    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);                         ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x, y + r);                             ctx.arcTo(x,     y,     x + r,  y,         r);
  ctx.closePath();
}

function downloadShareCard() {
  const canvas = document.getElementById('shareCanvas');
  const a      = document.createElement('a');
  a.download   = 'finlingo-streak.png';
  a.href       = canvas.toDataURL('image/png');
  a.click();
}

async function nativeShare() {
  const canvas = document.getElementById('shareCanvas');
  canvas.toBlob(async blob => {
    const file = new File([blob], 'finlingo-streak.png', { type: 'image/png' });
    try {
      await navigator.share({
        title: 'My Finlingo Streak',
        text:  `I have a ${S.streak}-day streak on Finlingo! Learn finance like a game.`,
        files: [file]
      });
    } catch {
      showToast('Share not available — download instead');
    }
  });
}


// ════════════════════════════════════════════════════════════
// HOME SCREEN
// ════════════════════════════════════════════════════════════

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function _getMarketFeatureRegistry() {
  return typeof getMarketFeatures === 'function' ? getMarketFeatures() : [];
}

// ── STREAK REPAIR ────────────────────────────────────────────
// A missed-day streak can be repaired with a one-time Stripe checkout.
// The app never restores the streak from the redirect alone — it only
// shows success after the verified webhook writes the repair back to
// the progress row.

function _getOffsetDate(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function _getRewardsSummary() {
  if (!S.rewardsSummary || typeof S.rewardsSummary !== 'object') {
    S.rewardsSummary = typeof getDefaultRewardsSummary === 'function'
      ? getDefaultRewardsSummary()
      : { latest: null, history: [], appliedRewardIds: [], lastPromotion: null, streakRepair: null, marketRewardPrompt: null };
  }
  return S.rewardsSummary;
}

function _getStreakRepairState() {
  return _getRewardsSummary().streakRepair && typeof _getRewardsSummary().streakRepair === 'object'
    ? _getRewardsSummary().streakRepair
    : null;
}

function _setStreakRepairState(nextState) {
  const rewardsSummary = _getRewardsSummary();
  rewardsSummary.streakRepair = nextState || null;
}

function _clearStreakRepairPromptTimer() {
  if (_streakRepairPromptTimer) {
    clearTimeout(_streakRepairPromptTimer);
    _streakRepairPromptTimer = null;
  }
}

function _getCurrentStreakRepairOffer() {
  const currentStreak = Math.max(0, Number(S.streak) || 0);
  if (!currentStreak || !S.streakDate) return null;
  if (S.streakDate === today()) return null;

  const yesterday = _getOffsetDate(-1);
  const twoDaysAgo = _getOffsetDate(-2);
  if (S.streakDate !== twoDaysAgo) return null;

  const offerId = `repair:${S.user?.id || 'anon'}:${S.streakDate}:${yesterday}:${currentStreak}`;
  return {
    offerId,
    originalStreak: currentStreak,
    lastActiveDate: S.streakDate,
    missedDate: yesterday,
    resumeFromDate: yesterday,
    eligibleOn: today(),
  };
}

function _hasSeenStreakRepairSession(sessionId) {
  return !!(sessionId && localStorage.getItem(STREAK_REPAIR_SEEN_PREFIX + sessionId));
}

function _markStreakRepairSeen(sessionId) {
  if (!sessionId) return;
  localStorage.setItem(STREAK_REPAIR_SEEN_PREFIX + sessionId, '1');
}

function _showStreakRepairSuccess(repairState) {
  const repairedStreak = Math.max(0, Number(repairState?.restoredStreak || repairState?.originalStreak || S.streak) || 0);
  showAppModal({
    icon: 'neutral',
    iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="#d4a000" stroke-width="1.8">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>`,
    title: 'Streak Repaired',
    showClose: true,
    bodyIsHTML: true,
    body: `
      <div class="streak-modal-shell">
        <div class="streak-modal-number">${repairedStreak}</div>
        <div class="streak-modal-bolt">
          <svg viewBox="0 0 24 24">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <div class="streak-modal-line">Day Streak!</div>
        <div class="streak-modal-support">Your streak is back. Complete a lesson today to keep it moving.</div>
      </div>`,
    actions: [
      { label: 'Keep going', cls: 'btn btn-primary', fn: closeAppModal }
    ]
  });
}

function _applyVerifiedStreakRepair(progressRow) {
  if (!progressRow) return false;

  const parseStructured = value => {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  };

  const rewardsSummary = parseStructured(progressRow.rewards_summary);
  const repairState = rewardsSummary?.streakRepair;
  const restoredSessionId = repairState?.restoredSessionId || null;
  if (!restoredSessionId || _hasSeenStreakRepairSession(restoredSessionId)) return false;

  S.streak = Math.max(0, Number(progressRow.streak) || 0);
  S.streakDate = progressRow.streak_date || null;
  _getRewardsSummary().streakRepair = repairState;
  save();
  updateTopbar();
  _markStreakRepairSeen(restoredSessionId);
  sessionStorage.removeItem(STREAK_REPAIR_PENDING_KEY);
  _showStreakRepairSuccess(repairState);
  return true;
}

function declineStreakRepair() {
  _clearStreakRepairPromptTimer();
  const offer = _getCurrentStreakRepairOffer();
  const current = _getStreakRepairState();
  _setStreakRepairState({
    ...(current || {}),
    ...(offer || {}),
    status: 'declined',
    declinedAt: new Date().toISOString()
  });
  S.streak = 0;
  S.streakDate = null;
  save();
  updateTopbar();
  if (typeof updateHome === 'function') updateHome();
  closeAppModal();
}

function startStreakRepairCheckout() {
  _clearStreakRepairPromptTimer();
  if (!S.user?.id) {
    showToast('Please sign in to repair your streak', 'error');
    return;
  }

  const offer = _getCurrentStreakRepairOffer();
  if (!offer) {
    showToast('No streak repair is available right now', '');
    closeAppModal();
    return;
  }

  _setStreakRepairState({
    ...offer,
    status: 'checkout_started',
    checkoutStartedAt: new Date().toISOString()
  });
  save();
  sessionStorage.setItem(STREAK_REPAIR_PENDING_KEY, '1');
  closeAppModal();

  const checkoutUrl = new URL(STREAK_REPAIR_PAYMENT_LINK);
  checkoutUrl.searchParams.set('client_reference_id', S.user.id);
  window.location.href = checkoutUrl.toString();
}

function useStreakSaverRepair() {
  _clearStreakRepairPromptTimer();
  const offer = _getCurrentStreakRepairOffer();
  const availableSavers = Math.max(0, Number(S.inventory?.streakSavers) || 0);
  if (!offer || availableSavers <= 0) return;

  if (!S.inventory && typeof getDefaultInventory === 'function') {
    S.inventory = getDefaultInventory();
  }
  if (S.inventory) {
    S.inventory.streakSavers = Math.max(0, availableSavers - 1);
  }
  S.streakFreeze = (S.inventory?.streakSavers || 0) > 0;
  S.streak = Math.max(Number(S.streak) || 0, offer.originalStreak);
  S.streakDate = offer.resumeFromDate;
  _setStreakRepairState({
    ...offer,
    status: 'restored_via_saver',
    restoredAt: new Date().toISOString(),
    restoredOfferId: offer.offerId,
    restoredSessionId: null,
    restoredStreak: S.streak
  });
  save();
  updateTopbar();
  if (typeof updateHome === 'function') updateHome();
  closeAppModal();
  _showStreakRepairSuccess({
    ...offer,
    restoredStreak: S.streak
  });
}

function maybeShowStreakRepairPrompt() {
  _clearStreakRepairPromptTimer();
  if (sessionStorage.getItem(STREAK_REPAIR_PENDING_KEY) === '1') return;

  const offer = _getCurrentStreakRepairOffer();
  if (!offer) return;

  const repairState = _getStreakRepairState();
  if (repairState?.offerId === offer.offerId && ['offered', 'declined', 'restored', 'restored_via_saver', 'checkout_started'].includes(repairState.status)) {
    return;
  }

  const openPrompt = () => {
    _streakRepairPromptTimer = null;
    if (!document.getElementById('homeScreen')?.classList.contains('active')) return;
    const activeOffer = _getCurrentStreakRepairOffer();
    if (!activeOffer || activeOffer.offerId !== offer.offerId) return;
    if (document.getElementById('appModal')?.classList.contains('open')) {
      _streakRepairPromptTimer = setTimeout(openPrompt, 600);
      return;
    }

    _setStreakRepairState({
      ...(repairState || {}),
      ...activeOffer,
      status: 'offered',
      promptedAt: new Date().toISOString()
    });
    if (typeof persistLocalState === 'function') persistLocalState();
    else save();

    const actions = [];
    const availableSavers = Math.max(0, Number(S.inventory?.streakSavers) || 0);
    if (availableSavers > 0) {
      actions.push({
        label: `Use Freeze${availableSavers > 1 ? ` (${availableSavers})` : ''}`,
        cls: 'btn btn-secondary',
        fn: useStreakSaverRepair
      });
    }
    actions.push({
      label: `Repair Streak — ${STREAK_REPAIR_PRICE_LABEL}`,
      cls: 'btn btn-primary',
      fn: startStreakRepairCheckout
    });
    actions.push({ label: 'Start New Streak', cls: 'modal-cancel', fn: declineStreakRepair });

    showAppModal({
      icon: 'neutral',
      iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="#d4a000" stroke-width="1.8">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>`,
      title: 'Save Your Streak',
      showClose: true,
      bodyIsHTML: true,
      body: `
        <div class="streak-modal-shell">
          <div class="streak-modal-number">${offer.originalStreak}</div>
          <div class="streak-modal-bolt">
            <svg viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div class="streak-modal-line">Day Streak!</div>
          <div class="streak-modal-support">You missed a day. Repair it for ${STREAK_REPAIR_PRICE_LABEL} or start fresh today.</div>
        </div>`,
      actions,
      onClose: () => {
        _clearStreakRepairPromptTimer();
      }
    });
  };

  _streakRepairPromptTimer = setTimeout(openPrompt, 420);
}

function _ensureRefresherQuizState() {
  if (!S.refresherQuiz || typeof S.refresherQuiz !== 'object') {
    S.refresherQuiz = typeof getDefaultRefresherQuiz === 'function'
      ? getDefaultRefresherQuiz()
      : {
          lastPromptedOn: null,
          lastStartedOn: null,
          lastCompletedOn: null,
          lastQuestionIds: []
        };
  }
  return S.refresherQuiz;
}

function maybeShowRefresherQuizPrompt() {
  if (_refresherPromptChecked) return;
  _refresherPromptChecked = true;

  const summary = typeof getRefresherQuizSummary === 'function'
    ? getRefresherQuizSummary(4)
    : null;
  const homeActive = document.getElementById('homeScreen')?.classList.contains('active');
  if (!homeActive || !summary?.ready) return;

  const refresherState = _ensureRefresherQuizState();
  const todayKey = today();
  if (
    refresherState.lastPromptedOn === todayKey
    || refresherState.lastStartedOn === todayKey
    || refresherState.lastCompletedOn === todayKey
  ) {
    return;
  }

  const openPrompt = () => {
    if (!document.getElementById('homeScreen')?.classList.contains('active')) return;
    if (document.getElementById('appModal')?.classList.contains('open')) {
      _refresherPromptTimer = setTimeout(openPrompt, 700);
      return;
    }

    const nextState = {
      ..._ensureRefresherQuizState(),
      lastPromptedOn: todayKey,
      updatedAt: new Date().toISOString()
    };
    S.refresherQuiz = nextState;
    if (typeof persistLocalState === 'function') persistLocalState();
    else save();

    const lessonLabel = summary.lessonCount === 1 ? 'lesson' : 'lessons';
    const questionLabel = summary.suggestedCount === 1 ? 'question' : 'questions';
    showAppModal({
      icon: 'neutral',
      title: 'Refresher Quiz Ready',
      body: `
        <span class="modal-price" style="font-size:1rem;color:var(--text)">
          ${summary.suggestedCount} quick ${questionLabel}
        </span>
        <span class="modal-price-sub">
          Pulled from your ${summary.lessonCount} completed ${lessonLabel} so key concepts stay fresh.
        </span>`,
      bodyIsHTML: true,
      showClose: true,
      actions: [
        {
          label: 'Start Refresher',
          cls: 'btn btn-primary',
          fn: () => {
            closeAppModal();
            if (typeof startRefresherQuiz === 'function') startRefresherQuiz(summary.suggestedCount || 4);
          }
        },
        { label: 'Maybe later', cls: 'modal-cancel', fn: closeAppModal }
      ]
    });
  };

  _refresherPromptTimer = setTimeout(openPrompt, 1600);
}

function resetRefresherPromptGate() {
  _refresherPromptChecked = false;
}

// Weekly progress is shown in-context on Mastery. Avoid interrupting the
// user's current task with an automatic summary modal.

function escapeAppHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanGeneratedListItemText(value) {
  if (typeof window !== 'undefined' && window.MicroData && typeof window.MicroData.cleanGeneratedListItem === 'function') {
    return window.MicroData.cleanGeneratedListItem(value);
  }
  return String(value ?? '').trim().replace(/^(?:[•●]\s*|[*]\s+|[-–—]\s+|\d+[.)]\s+)/, '').trim();
}

function getHomeLearningSummary() {
  const completedIds = Array.isArray(S.completedIds) ? S.completedIds : [];
  const completedSet = new Set(completedIds);
  const next = typeof getNextAvailableLesson === 'function'
    ? getNextAvailableLesson(completedIds, S.user)
    : LESSONS.find(lesson => !completedSet.has(lesson.id));
  const totalLessons = Array.isArray(LESSONS) ? LESSONS.length : 0;
  const answered = Math.max(0, Number(S.totalAnswered) || 0);
  const accuracy = answered > 0
    ? Math.round(((Number(S.totalCorrect) || 0) / answered) * 100)
    : null;
  return {
    completedIds,
    completedCount: completedIds.length,
    totalLessons,
    next,
    accuracy,
    progressPct: totalLessons > 0 ? Math.round((completedIds.length / totalLessons) * 100) : 0
  };
}

function getHomeIndicatorRows() {
  const fallbackRows = [
    {
      symbol: 'SPY',
      label: 'S&P 500',
      value: 'Broad U.S. stocks',
      change: 'Core benchmark',
      tone: 'flat',
      lesson: 'Shows the broad direction of large U.S. companies.'
    },
    {
      symbol: 'QQQ',
      label: 'Nasdaq 100',
      value: 'Growth stocks',
      change: 'Tech-heavy',
      tone: 'flat',
      lesson: 'Helps compare growth and technology sentiment with the broader market.'
    },
    {
      symbol: 'BTC',
      label: 'Bitcoin',
      value: 'Digital asset',
      change: 'High volatility',
      tone: 'flat',
      lesson: 'Highlights how speculative assets can move differently from stocks.'
    }
  ];

  if (typeof PRACTICE_MARKET_ASSETS === 'undefined' || !S.portfolio?.assets) {
    return fallbackRows;
  }

  return fallbackRows.map(row => {
    const asset = PRACTICE_MARKET_ASSETS.find(item => item.symbol === row.symbol);
    const quote = S.portfolio.assets?.[row.symbol];
    const price = Number(quote?.price) || Number(asset?.basePrice) || 0;
    const changePct = Number(quote?.dailyChangePct);
    const tone = Number.isFinite(changePct) && changePct > 0 ? 'up' : Number.isFinite(changePct) && changePct < 0 ? 'down' : 'flat';
    return {
      ...row,
      value: price > 0 ? formatDisplayMoney(price) : row.value,
      change: Number.isFinite(changePct) ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : row.change,
      tone
    };
  });
}

// ════════════════════════════════════════════════════════════
// TODAY'S MONEY DECISION
// A short, real-world financial scenario with a few choices and plain
// feedback after the learner picks. Reflective, not graded — there are no
// points. One scenario is surfaced per day (rotates by calendar date).
// ════════════════════════════════════════════════════════════

const MONEY_DECISIONS = [
  {
    id: 'first-paycheck',
    prompt: 'You just got your first real paycheck. What should you do first?',
    choices: [
      { text: 'Spend it on something you have wanted for a while',
        feedback: 'Rewarding yourself is fine in moderation — but doing it first leaves nothing for safety or goals.' },
      { text: 'Cover essentials, then set aside a small cash buffer', best: true,
        feedback: 'Exactly. A small emergency buffer keeps an unexpected bill from turning into debt.' },
      { text: 'Invest all of it immediately',
        feedback: 'Investing matters, but with no cash cushion you may be forced to sell at a bad time. Build the buffer first.' },
      { text: 'Put it all in savings and never touch it',
        feedback: 'Saving is good, but money left idle slowly loses value to inflation. Balance saving with real goals.' }
    ]
  },
  {
    id: 'credit-card-bill',
    prompt: 'Your credit card bill is due and you can only pay part of it. What is the smartest move?',
    choices: [
      { text: 'Pay the minimum and carry the rest',
        feedback: 'This keeps you current, but interest piles up fast — a carried balance is one of the most expensive habits in finance.' },
      { text: 'Pay as much as you can, never less than the minimum', best: true,
        feedback: 'Right. Paying above the minimum shrinks the balance interest is charged on. Always cover at least the minimum on time.' },
      { text: 'Skip it this month and catch up later',
        feedback: 'A missed payment means fees and a lower credit score. Always pay at least the minimum by the due date.' }
    ]
  },
  {
    id: 'debt-vs-invest',
    prompt: 'You have $1,000 spare and a credit card charging 22% interest. What first?',
    choices: [
      { text: 'Invest the $1,000 in the stock market',
        feedback: 'Stocks average well under 22% a year. Clearing 22% debt is a guaranteed return that beats most investments.' },
      { text: 'Pay down the high-interest debt', best: true,
        feedback: 'Yes. Wiping out 22% interest is effectively a risk-free 22% return — very hard to beat anywhere else.' },
      { text: 'Leave it sitting in checking',
        feedback: 'Idle cash earns almost nothing while the debt grows at 22%. Tackle the expensive debt first.' }
    ]
  },
  {
    id: 'market-drop',
    prompt: 'The market falls 10% in a week and your investments are down. What is the wise response?',
    choices: [
      { text: 'Sell everything to stop the losses',
        feedback: 'Selling locks in the loss and you miss the recovery. Reacting to short-term drops is how investors get hurt.' },
      { text: 'Stick to your plan and keep investing steadily', best: true,
        feedback: 'Right. Downturns are normal. Investing steadily through them is how long-term wealth is built.' },
      { text: 'Move it all into one "safe" stock',
        feedback: 'Concentrating in a single stock adds risk, not safety. Diversification is what actually protects you.' }
    ]
  },
  {
    id: 'big-purchase',
    prompt: 'You want a $1,200 phone but do not have the cash. What is the healthiest option?',
    choices: [
      { text: 'Buy it now and pay it off on a credit card',
        feedback: 'Financing a want at high interest can cost far more than the sticker price. Pause before borrowing for non-essentials.' },
      { text: 'Save a set amount each month until you can buy it', best: true,
        feedback: 'Exactly. Saving toward it avoids interest and confirms you really want it — many delayed purchases are skipped entirely.' },
      { text: 'Use a "buy now, pay later" plan',
        feedback: 'These feel painless but split debt into easy-to-forget payments. Missed ones add fees and can hurt your credit.' }
    ]
  },
  {
    id: 'windfall',
    prompt: 'You receive an unexpected $500 gift. What gives you the most long-term value?',
    choices: [
      { text: 'Spend all of it now',
        feedback: 'Enjoying some is fine, but spending the whole windfall leaves no lasting benefit.' },
      { text: 'Split it — a little for fun, the rest toward goals', best: true,
        feedback: 'Great balance. You enjoy the moment and still move toward your bigger financial goals.' },
      { text: 'Lend it to a friend who just asked',
        feedback: 'Helping is generous, but lending money can strain both your finances and the friendship. Only lend what you can afford to lose.' }
    ]
  }
];

// In-memory selection for the current day's decision ({ id, choiceIndex }).
let _moneyDecisionPick = null;

function _getDailyMoneyDecision() {
  if (!MONEY_DECISIONS.length) return null;
  const key = (typeof today === 'function' ? today() : '') || '';
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return MONEY_DECISIONS[hash % MONEY_DECISIONS.length];
}

function selectMoneyDecision(choiceIndex) {
  const scenario = _getDailyMoneyDecision();
  if (!scenario) return;
  _moneyDecisionPick = { id: scenario.id, choiceIndex };
  renderHomeMoneyDecision();
}

function renderHomeMoneyDecision() {
  const el = document.getElementById('todayDecisionCard');
  if (!el) return;
  const scenario = _getDailyMoneyDecision();
  if (!scenario) { el.innerHTML = ''; return; }

  // Reset the selection if the day's scenario has rotated.
  if (_moneyDecisionPick && _moneyDecisionPick.id !== scenario.id) _moneyDecisionPick = null;
  const picked = _moneyDecisionPick && _moneyDecisionPick.id === scenario.id
    ? _moneyDecisionPick.choiceIndex
    : null;
  const answered = Number.isInteger(picked);

  const choicesMarkup = scenario.choices.map((choice, index) => {
    const isPicked = picked === index;
    const revealBest = answered && choice.best;
    const stateCls = isPicked ? ' is-selected' : (revealBest ? ' is-best' : '');
    const mark = revealBest
      ? `<span class="decision-choice-mark"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg></span>`
      : `<span class="decision-choice-letter">${String.fromCharCode(65 + index)}</span>`;
    return `
      <button type="button" class="decision-choice${stateCls}" onclick="selectMoneyDecision(${index})">
        ${mark}
        <span class="decision-choice-text">${escapeAppHtml(choice.text)}</span>
      </button>`;
  }).join('');

  const chosen = answered ? scenario.choices[picked] : null;
  const feedbackMarkup = answered
    ? `<div class="decision-feedback ${chosen.best ? 'is-good' : 'is-note'}">
         <span class="decision-feedback-tag">${chosen.best ? 'Good call' : 'Worth a rethink'}</span>
         ${escapeAppHtml(chosen.feedback)}
       </div>`
    : `<div class="decision-hint">Pick the option you would actually choose — then see how it plays out.</div>`;

  el.innerHTML = `
    <div class="home-simple-card decision-card">
      <div class="decision-prompt">${escapeAppHtml(scenario.prompt)}</div>
      <div class="decision-choices">${choicesMarkup}</div>
      ${feedbackMarkup}
    </div>`;
}

// ════════════════════════════════════════════════════════════
// SKILL PROGRESS
// Six plain-language money skills, each showing a Beginner / Building /
// Confident stage and a quiet progress bar. Tapping a skill opens Learn.
// ════════════════════════════════════════════════════════════

function renderSkillProgress(summary) {
  const el = document.getElementById('skillProgressCard');
  if (!el) return;
  if (typeof getFinancialConfidence !== 'function') { el.innerHTML = ''; return; }

  // Compact summary only — overall score + level + one supporting line.
  // Detailed per-category mastery lives in the Practice tab, not on Home.
  const confidence = getFinancialConfidence();

  el.innerHTML = `
    <div class="home-simple-card confidence-compact">
      <div class="confidence-compact-top">
        <div class="confidence-compact-score">
          <span class="cc-value">${confidence.score}</span><span class="cc-max"> / 100</span>
        </div>
        <span class="confidence-compact-level cc-level-${confidence.statusKey}">${escapeAppHtml(confidence.statusLabel)}</span>
      </div>
      <div class="confidence-compact-sub">Complete lessons and practice to build your confidence.</div>
    </div>`;
}

function renderHomeMarketSnapshot() {
  const el = document.getElementById('homeMarketSnapshot');
  if (!el) return;

  // Read the broad market (S&P 500) and translate it into plain English
  // rather than overwhelming a beginner with a wall of tickers.
  const rows = getHomeIndicatorRows();
  const broad = rows.find(row => row.symbol === 'SPY') || rows[0] || { tone: 'flat' };
  const tone = broad.tone === 'up' || broad.tone === 'down' ? broad.tone : 'flat';

  const read = {
    up: {
      headline: 'Stocks are broadly higher today.',
      copy: 'Large U.S. companies are gaining value on average. Up days are normal and don’t call for any action — long-term investors simply stay the course.'
    },
    down: {
      headline: 'Stocks are broadly lower today.',
      copy: 'Large U.S. companies lost value on average. Short-term dips are a normal part of investing, not a signal to panic-sell.'
    },
    flat: {
      headline: 'The market is having a quiet day.',
      copy: 'Not much is moving in large U.S. stocks right now. Calm stretches are common — most of investing is patient waiting, not constant action.'
    }
  }[tone];

  const changeChip = (broad.change && tone !== 'flat')
    ? `<span class="market-read-chip ${tone}">S&P 500 ${escapeAppHtml(broad.change)}</span>`
    : '';

  el.innerHTML = `
    <div class="home-simple-card market-read-card">
      <div class="market-read-top">
        <span class="market-read-dot ${tone}"></span>
        <div class="market-read-headline">${read.headline}</div>
      </div>
      ${changeChip}
      <div class="market-read-copy">${read.copy}</div>
      <button class="btn btn-secondary home-card-action" onclick="showMarket()">Open Market</button>
    </div>`;
}

/** Re-render all dynamic home screen elements. */
function updateHome() {
  const summary = getHomeLearningSummary();
  const _progressSummary = typeof getProgressSummary === 'function'
    ? getProgressSummary()
    : null;

  // Notification prompt — show once if browser supports it and we haven't asked yet
  const notifPrompt = document.getElementById('notifPrompt');
  if (notifPrompt) {
    notifPrompt.classList.remove('show');
  }

  // Personalized greeting lives in the small kicker; the headline stays a
  // steady brand statement ("Build your financial confidence.").
  const firstName = (S.user?.name || '').trim().split(/\s+/)[0];
  const kickerEl = document.getElementById('homeWelcomeKicker');
  if (kickerEl) {
    kickerEl.textContent = firstName ? `Welcome back, ${firstName}` : 'Welcome to Finlingo';
  }

  const next = summary.next;
  const btn  = document.getElementById('continueBtn');

  // Update eyebrow label and progress line based on where the user is.
  const _eyebrowEl  = document.getElementById('heroEyebrow');
  const _progressEl = document.getElementById('heroProgress');
  if (_eyebrowEl) {
    _eyebrowEl.textContent = next ? 'Continue Learning' : 'Curriculum Complete';
  }
  // Inject lesson progress line "Lesson X of Y"
  if (_progressEl && next) {
    const _unit = typeof getUnitForLesson === 'function' ? getUnitForLesson(next) : null;
    const _unitProgress = _unit && typeof getUnitProgress === 'function'
      ? getUnitProgress(_unit, summary.completedIds)
      : null;
    _progressEl.textContent = _unit
      ? `${_unit.title || _unit.name}${_unitProgress ? ` • ${_unitProgress.completedCount}/${_unitProgress.total} complete` : ''}`
      : next.unit || 'Start your learning path';
  } else if (_progressEl) {
    _progressEl.textContent = '';
  }
  const _dueReviews = _progressSummary?.dueReviewCount || 0;
  if (_dueReviews > 0) {
    document.getElementById('nextTitle').textContent = 'Review key concepts';
    document.getElementById('nextSub').textContent = `You have ${_dueReviews} concept ${_dueReviews === 1 ? 'review' : 'reviews'} ready. Revisit them before starting something new.`;
    if (_eyebrowEl) _eyebrowEl.textContent = 'Recommended Review';
    if (_progressEl) _progressEl.textContent = _progressSummary?.masterySummary?.weakestTopics?.length
      ? `Focus: ${_progressSummary.masterySummary.weakestTopics.map(topic => topic.label || topic.topicId).join(' · ')}`
      : 'Short review session';
    btn.textContent = 'Start Review';
    btn.style.cssText = '';
    btn.onclick = () => startReviewSprint(Math.min(5, _dueReviews));
  } else if (next) {
    document.getElementById('nextTitle').textContent = next.title;
    const _sub     = (typeof getPersonalizedContext === 'function' ? getPersonalizedContext(next.id) : null) || next.blurb;
    const nextSubEl = document.getElementById('nextSub');
    nextSubEl.textContent = _sub;

    btn.textContent    = summary.completedCount > 0 ? 'Continue' : 'Start Learning';
    btn.style.cssText  = '';
    btn.onclick = () => {
      if (typeof openMicroUnit === 'function') openMicroUnit('preset_unit_1');
      else showLearn({ resetScroll: true });
    };

  } else {
    document.getElementById('nextTitle').textContent = "You've finished every lesson";
    document.getElementById('nextSub').textContent   = 'Revisit any lesson anytime for a quick refresher.';
      btn.textContent   = 'Browse Lessons';
      btn.style.cssText = '';
      btn.onclick       = showLearn;
  }
  // "Today's Money Decision" was removed from Home (it overlapped the Market
  // Question and Practice). The underlying data/functions remain for reuse.
  renderSkillProgress(summary);
  renderHomeMarketSnapshot();
  maybeShowRefresherQuizPrompt();
}


// ════════════════════════════════════════════════════════════
// RANKS / LEADERBOARD SCREEN

let currentRanksTab = 'alltime';
let liveLeaderboard = [];

/** Fetch the top-20 leaderboard from Supabase. */
async function fetchLeaderboard() {
  try {
    const rows = await sbGet('progress',
      '?select=user_id,xp,streak,tier,users(name)&order=xp.desc&limit=20'
    );
    liveLeaderboard = rows.map((r, i) => ({
      name:   r.users?.name || 'User',
      userId: r.user_id,
      xp:     r.xp    || 0,
      streak: Math.max(0, Number(r.streak) || 0),
      level:  typeof getLevelFromXP === 'function' ? getLevelFromXP(r.xp || 0) : 1,
      tier:   r.tier   || 'standard',
      color:  AVATAR_COLORS[i % AVATAR_COLORS.length],
      isYou:  r.user_id === S.user?.id  // compare by UUID, not name
    }));
  } catch (e) {
    liveLeaderboard = [];
    console.warn('Leaderboard fetch failed:', e.message);
  }
}

/**
 * Build the list of entries for the given tab.
 * Ensures the current user always appears even if not in the top 20.
 */
function getEntries(tab) {
  const me = {
    name:   S.user?.name      || 'You',
    xp:     S.xp,
    streak: S.streak,
    level:  typeof getLevelFromXP === 'function' ? getLevelFromXP(S.xp) : 1,
    tier:   S.user?.tier      || 'standard',
    color:  S.user?.avatarColor || '#1a1a1a',
    isYou:  true
  };

  let entries = liveLeaderboard.length > 0
    ? liveLeaderboard.map(e => e.isYou ? { ...e, xp: S.xp, streak: S.streak } : e)
    : [me];

  // Make sure the current user appears
  if (!entries.some(e => e.isYou)) entries = [...entries, me];

  if (tab === 'weekly') {
    return [...entries].map(e => ({ ...e, xp: e.isYou ? S.xp : Math.max(0, Math.floor(e.xp * 0.12)) })).sort((a, b) => b.xp - a.xp);
  }
  if (tab === 'unit') {
    return [...entries].map(e => ({ ...e, xp: e.isYou ? S.completedIds.length : Math.floor(e.xp / 25) })).sort((a, b) => b.xp - a.xp);
  }
  return [...entries].sort((a, b) => b.xp - a.xp);
}

function getInitialsFromEntry(name) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

/** Re-render the podium and list for the current tab. */
function renderRanks() {
  const entries  = getEntries(currentRanksTab);
  const xpLabel  = currentRanksTab === 'unit' ? 'lessons' : currentRanksTab === 'weekly' ? 'XP this week' : 'XP';
  const top3     = entries.slice(0, 3);

  // Podium (2nd on left, 1st centre, 3rd right)
  const podiumOrder = [top3[1], top3[0], top3[2]];
  const podiumSlot  = ['p2', 'p1', 'p3'];
  const podiumLabel = ['2nd', '1st', '3rd'];
  const podiumH     = [36, 52, 28];
  document.getElementById('ranksPodium').innerHTML = podiumOrder.map((e, i) => {
    if (!e) return '';
    const init = getInitialsFromEntry(e.name);
    return `<div class="podium-slot ${podiumSlot[i]}">
      <div class="podium-av" style="background:${e.color || '#1a1a2e'};${podiumSlot[i] === 'p1' ? 'box-shadow:0 0 0 3px var(--green);' : ''}">
        ${podiumSlot[i] === 'p1' ? '<span class="podium-crown">👑</span>' : ''}
        ${init}
      </div>
      <div class="podium-name">${e.name}${e.isYou ? ' (you)' : ''}</div>
      <div class="podium-xp">${e.xp} ${xpLabel}</div>
      <div class="podium-block" style="height:${podiumH[i]}px;background:${i === 0 ? '#c8c8c8' : i === 1 ? 'var(--text)' : 'var(--bg3)'};color:${i === 2 ? 'var(--muted)' : '#fff'}">${podiumLabel[i]}</div>
    </div>`;
  }).join('');

  // Full list (positions 4+)
  const rest    = entries.slice(3);
  const youRank = entries.findIndex(e => e.isYou) + 1;
  document.getElementById('ranksListFull').innerHTML = `
    ${liveLeaderboard.length === 0
      ? `<div style="text-align:center;padding:16px;font-family:var(--font-m);font-size:0.72rem;color:var(--muted2)">Loading live leaderboard…</div>`
      : ''}
    ${youRank > 3
      ? `<div class="lb-row you" style="margin-bottom:4px;">
          <div class="lb-rank" style="color:var(--green-text)">${youRank}</div>
          <div class="lb-av" style="background:${S.user?.avatarColor || '#1a1a1a'};font-family:var(--font-d);font-size:0.72rem;font-weight:800;color:#fff">${getInitialsFromEntry(S.user?.name || 'You')}</div>
          <div class="lb-info">
            <div class="lb-name">${S.user?.name || 'You'} <span class="lb-you-badge">you</span></div>
            <div class="lb-sub">Level ${typeof getLevelFromXP === 'function' ? getLevelFromXP(S.xp) : 1} · ${S.streak}d streak</div>
          </div>
          <div class="lb-right"><div class="lb-xp">${S.xp} ${xpLabel}</div></div>
        </div>
        <div style="font-family:var(--font-m);font-size:0.6rem;color:var(--muted2);text-align:center;padding:4px 0 8px;">···</div>`
      : ''}
    ${rest.map((e, i) => {
      const rank = i + 4;
      const init = getInitialsFromEntry(e.name);
      return `<div class="lb-row${e.isYou ? ' you' : ''}">
        <div class="lb-rank">${rank}</div>
        <div class="lb-av" style="background:${e.color || '#1a1a1a'};font-family:var(--font-d);font-size:0.72rem;font-weight:800;color:#fff">${init}</div>
        <div class="lb-info">
          <div class="lb-name">${e.name}${e.isYou ? ' <span class="lb-you-badge">you</span>' : ''}</div>
          <div class="lb-sub">Level ${e.level} · ${e.streak}d streak</div>
        </div>
        <div class="lb-right">
          <div class="lb-xp">${e.xp} ${xpLabel}</div>
          <div class="lb-streak">${e.streak}d</div>
        </div>
      </div>`;
    }).join('')}`;
}

function switchRanksTab(tab) {
  currentRanksTab = tab;
  document.querySelectorAll('.ranks-tab').forEach(t => t.classList.remove('active'));
  const map = { alltime: 'tabAllTime', weekly: 'tabWeekly', unit: 'tabUnit' };
  document.getElementById(map[tab])?.classList.add('active');
  renderRanks();
}

function renderLeaderboard() {} // alias kept for compatibility

async function showProgress(defaultTab = 'progress', options = {}) {
  if (defaultTab && typeof defaultTab === 'object') {
    options = defaultTab;
  }
  return showPractice(options);
}

async function showRanks() {
  return showPractice();
}

/** Switch between 'progress' and 'leaderboard' top-level panels. */
function switchRanksTopTab(tab) {
  const normalizedTab = tab === 'career' ? 'progress' : tab;
  document.querySelectorAll('.ranks-top-tab').forEach(t => t.classList.remove('active'));
  const tabId = normalizedTab === 'progress' ? 'rtabCareer' : 'rtabLeaderboard';
  document.getElementById(tabId)?.classList.add('active');
  const careerPanel = document.getElementById('ranksPanel-career');
  const lbPanel     = document.getElementById('ranksPanel-leaderboard');
  if (careerPanel) careerPanel.style.display  = '';
  if (lbPanel)     lbPanel.style.display      = 'none';
  renderPracticePage();
}



// ════════════════════════════════════════════════════════════
// CAREER PAGE
// Renders the career hero card, milestone timeline, and perks.
// Called by switchRanksTopTab('career') and showRanks().
// ════════════════════════════════════════════════════════════

const PRACTICE_SCENARIOS = [
  {
    title: 'You get your first paycheck',
    situation: 'You have $300 left after bills. A friend says to buy one popular stock because it has been going up.',
    prompt: 'What is the better first step?',
    answer: 'Set aside emergency cash, then consider a simple diversified fund before picking individual stocks.',
    note: 'A single stock can be useful to study, but beginners usually learn more by first understanding diversification.'
  },
  {
    title: 'A stock drops after earnings',
    situation: 'A company reports higher revenue, but the stock falls 8% the next morning.',
    prompt: 'What should you notice?',
    answer: 'Markets react to expectations. The company may have grown, but investors may have expected even more.',
    note: 'Good news can still disappoint if the price already assumed great news.'
  },
  {
    title: 'Your savings account pays 1%',
    situation: 'Inflation is running near 3%, and your cash earns about 1% in interest.',
    prompt: 'What is happening in plain English?',
    answer: 'Your cash balance rises slowly, but its buying power is slipping after inflation.',
    note: 'This is why investors compare nominal returns with real returns.'
  },
  {
    title: 'Two funds look similar',
    situation: 'One index fund charges 0.04% per year. Another active fund charges 0.95%. Both own large U.S. stocks.',
    prompt: 'What should a beginner compare?',
    answer: 'Compare cost, holdings, and long-term track record. Fees compound just like returns do.',
    note: 'A small fee difference can become a large dollar difference over decades.'
  }
];

function renderPracticePage() {
  const practiceEl = document.getElementById('careerTimeline');
  if (!practiceEl) return;
  practiceEl.innerHTML = `
    <div class="practice-intro-card">
      <div class="practice-kicker">Real-world practice</div>
      <div class="practice-title">Think it through, then check your call.</div>
      <div class="practice-copy">No scores here — just real money situations you'll actually run into.</div>
    </div>
    <div class="practice-scenario-list">
      ${PRACTICE_SCENARIOS.map((scenario, index) => `
        <details class="practice-scenario-card">
          <summary>
            <span class="practice-scenario-number">${index + 1}</span>
            <span>
              <span class="practice-scenario-title">${escapeAppHtml(scenario.title)}</span>
              <span class="practice-scenario-situation">${escapeAppHtml(scenario.situation)}</span>
            </span>
          </summary>
          <div class="practice-scenario-body">
            <div class="practice-question">${escapeAppHtml(scenario.prompt)}</div>
            <div class="practice-answer">${escapeAppHtml(scenario.answer)}</div>
            <div class="practice-logan-note"><strong>Logan's Note:</strong> ${escapeAppHtml(scenario.note)}</div>
          </div>
        </details>
      `).join('')}
    </div>`;

  const perksEl = document.getElementById('careerPerks');
  if (perksEl) perksEl.innerHTML = '';
  const lbPanel = document.getElementById('ranksPanel-leaderboard');
  if (lbPanel) lbPanel.style.display = 'none';
}

function renderCareerPage() {
  renderPracticePage();
  return;
  const careerSummary = typeof getCareerRankSummary === 'function' ? getCareerRankSummary() : null;
  const progressSummary = typeof getProgressSummary === 'function' ? getProgressSummary() : null;
  const completedCount = Array.isArray(S.completedIds) ? S.completedIds.length : 0;
  const totalLessons = Array.isArray(LESSONS) ? LESSONS.length : 0;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const reviewedCount = Object.keys(S.mastery || {}).length;
  const answered = Math.max(0, Number(S.totalAnswered) || 0);
  const accuracy = answered > 0
    ? Math.round(((Number(S.totalCorrect) || 0) / answered) * 100)
    : null;
  const dueCountSimple = Math.max(0, Number(progressSummary?.dueReviewCount) || 0);
  const units = typeof UNITS_DEF !== 'undefined' ? _visiblePresetUnitDefs(UNITS_DEF) : [];
  const timelineElSimple = document.getElementById('careerTimeline');
  if (timelineElSimple) {
    timelineElSimple.innerHTML = `
      <div class="progress-overview-card">
        <div class="progress-overview-top">
          <div>
            <div class="progress-overview-kicker">Learning progress</div>
            <div class="progress-overview-title">${completedCount} lessons completed</div>
            <div class="progress-overview-copy">Keep the focus on understanding core financial ideas, not chasing points.</div>
          </div>
          <div class="progress-overview-percent">${progressPct}%</div>
        </div>
        <div class="home-simple-track"><div style="width:${progressPct}%;"></div></div>
      </div>
      <div class="progress-pulse-grid progress-pulse-grid-professional">
        <div class="progress-pulse-card">
          <div class="progress-pulse-label">Lessons completed</div>
          <div class="progress-pulse-value">${completedCount}</div>
          <div class="progress-pulse-sub">Out of ${totalLessons}</div>
        </div>
        <div class="progress-pulse-card">
          <div class="progress-pulse-label">Concepts reviewed</div>
          <div class="progress-pulse-value">${reviewedCount}</div>
          <div class="progress-pulse-sub">${dueCountSimple > 0 ? `${dueCountSimple} ready for review` : 'No reviews due'}</div>
        </div>
        <div class="progress-pulse-card">
          <div class="progress-pulse-label">Quiz accuracy</div>
          <div class="progress-pulse-value">${accuracy == null ? '—' : `${accuracy}%`}</div>
          <div class="progress-pulse-sub">${answered > 0 ? `${answered} questions answered` : 'Start a lesson to build history'}</div>
        </div>
        <div class="progress-pulse-card">
          <div class="progress-pulse-label">Practice portfolio</div>
          <div class="progress-pulse-value">${formatDisplayMoney(careerSummary?.netWorth || S.cash || 0)}</div>
          <div class="progress-pulse-sub">Used for market practice only</div>
        </div>
      </div>
      <div class="progress-unit-list">
        <div class="career-section-label">Curriculum</div>
        ${units.map(unit => {
          const unitProgress = typeof getUnitProgress === 'function'
            ? getUnitProgress(unit, S.completedIds || [])
            : null;
          const pct = Math.max(0, Math.min(100, Number(unitProgress?.progressPct) || 0));
          return `
            <div class="progress-unit-row">
              <div class="progress-unit-copy">
                <div class="progress-unit-title">${escapeAppHtml(unit.title || unit.name)}</div>
                <div class="progress-unit-sub">${escapeAppHtml(unit.description || '')}</div>
              </div>
              <div class="progress-unit-meta">${unitProgress?.completedCount || 0}/${unitProgress?.total || 0}</div>
              <div class="home-simple-track progress-unit-track"><div style="width:${pct}%;"></div></div>
            </div>`;
        }).join('')}
      </div>`;
  }
  const perksElSimple = document.getElementById('careerPerks');
  if (perksElSimple) perksElSimple.innerHTML = '';
  return;
  const lv       = careerSummary?.currentRank || LEVELS[0];
  const lvIdx    = LEVELS.indexOf(lv);
  const nextLv   = careerSummary?.nextRank || null;
  const span     = careerSummary?.rankSpan || (lv.next ? lv.next - lv.min : 1);
  const pct      = careerSummary?.progressPct ?? (lv.next ? 0 : 100);
  const netWorth = careerSummary?.netWorth || 0;
  const valueIntoRank = careerSummary?.valueIntoRank || 0;
  const netWorthToNext = careerSummary?.netWorthToNextRank || 0;
  const streak = Math.max(0, Number(S.streak) || 0);
  const achievements = typeof getAchievements === 'function' ? getAchievements() : Object.values(S.achievements || {});
  const dueCount = Math.max(0, Number(progressSummary?.dueReviewCount) || 0);
  const freezes = Math.max(0, Number(S.inventory?.streakSavers) || 0);
  const rm       = (typeof RANK_META !== 'undefined' && RANK_META[lv.name]) || {};
  const rc       = rm.color || 'var(--green)';

  const timelineEl = document.getElementById('careerTimeline');
  if (timelineEl) {
    const visibleRanks = careerLadderExpanded
      ? LEVELS
      : LEVELS.filter((rank, idx) => idx === lvIdx || idx === Math.min(lvIdx + 1, LEVELS.length - 1));

    const milestoneMarkup = visibleRanks.map((rank, idx) => {
      const realIdx  = LEVELS.indexOf(rank);
      const isDone   = realIdx < lvIdx;
      const isCur    = realIdx === lvIdx;
      const isLocked = realIdx > lvIdx;
      const rrm      = (typeof RANK_META !== 'undefined' && RANK_META[rank.name]) || {};
      const rrc      = rrm.color || '#686868';
      const perk     = rrm.perk  || 'Locked';
      const isLast   = idx === visibleRanks.length - 1;
      const connector = !isLast
        ? `<div class="career-connector" style="background:${(isDone || isCur) ? rrc + '45' : 'var(--border)'};"></div>`
        : '';
      const dotIcon = isDone
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="${rrc}" stroke-width="2.5" style="width:13px;height:13px;"><polyline points="20 6 9 17 4 12"/></svg>`
        : isCur
          ? `<svg viewBox="0 0 24 24" fill="none" stroke="${rrc}" stroke-width="2" style="width:13px;height:13px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--muted2)" stroke-width="1.8" style="width:11px;height:11px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

      return `
        <div class="career-milestone ${isDone ? 'ms-done' : isCur ? 'ms-current' : 'ms-locked'}">
          <div class="career-ms-dot" style="
            background:${isDone ? rrc + '22' : isCur ? rrc + '2e' : 'var(--bg3)'};
            border-color:${isDone ? rrc + '66' : isCur ? rrc : 'var(--border)'};
          ">${dotIcon}</div>
          <div class="career-ms-body">
            <div class="career-ms-name" style="color:${isDone ? 'var(--text)' : isCur ? rrc : 'var(--muted)'};">
              ${rank.name}
              ${isCur ? `<span class="career-ms-badge" style="background:${rrc}1e;color:${rrc};border-color:${rrc}44;">Current</span>` : ''}
              ${!careerLadderExpanded && !isCur && nextLv && rank.name === nextLv.name ? `<span class="career-ms-badge" style="background:${rrc}14;color:${rrc};border-color:${rrc}33;">Next</span>` : ''}
            </div>
            <div class="career-ms-xp">
              ${isCur && nextLv
                ? `${formatDisplayMoney(valueIntoRank)} of ${formatDisplayMoney(span)} toward ${nextLv.name}`
                : isDone
                  ? `Unlocked at ${formatDisplayMoney(rank.min)} net worth`
                  : isLocked
                    ? `Promotion at ${formatDisplayMoney(rank.min)}`
                    : `${formatDisplayMoney(rank.min)} · Top rank`}
            </div>
            <div class="career-ms-perk" style="display:flex;align-items:center;gap:5px;margin-top:6px;opacity:${isLocked ? '0.62' : '1'};">
              <svg viewBox="0 0 24 24" fill="none" stroke="${isLocked ? 'var(--muted2)' : rrc}" stroke-width="${isLocked ? '1.6' : '1.8'}" style="width:10px;height:10px;flex-shrink:0;">
                ${isLocked ? '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' : '<polyline points="20 6 9 17 4 12"/>'}
              </svg>
              <span style="font-family:var(--font-m);font-size:0.63rem;color:${isLocked ? 'var(--muted2)' : isDone ? rrc + 'CC' : rrc};line-height:1.3;">${perk}</span>
            </div>
            ${isCur && nextLv ? `
              <div style="margin-top:10px;">
                <div style="display:flex;justify-content:space-between;font-family:var(--font-m);font-size:0.58rem;margin-bottom:5px;color:${rrc}CC;">
                  <span>Progress to ${nextLv.name}</span>
                  <span>${Math.round(pct)}%</span>
                </div>
                <div style="height:4px;border-radius:99px;background:${rrc}20;overflow:hidden;">
                  <div style="height:100%;width:${pct}%;background:${rrc};border-radius:99px;transition:width 0.5s ease;"></div>
                </div>
              </div>` : ''}
          </div>
        </div>
        ${connector}`;
    }).join('');

    timelineEl.innerHTML = `
      <div class="career-hero">
        <div class="career-hero-eyebrow">Progress</div>
        <div class="career-hero-main">
          <div>
            <div class="career-hero-role-label">Current Rank</div>
            <div class="career-hero-role" style="color:${rc};">${lv.name}</div>
          </div>
          <div class="career-hero-xp-val">${formatDisplayMoney(netWorth)} net worth</div>
        </div>
        ${nextLv ? `
          <div class="career-hero-prog-row">
            <span class="career-hero-prog-label">Progress to ${nextLv.name}</span>
            <span class="career-hero-prog-frac">${formatDisplayMoney(netWorth)} / ${formatDisplayMoney(lv.next)}</span>
          </div>
          <div class="career-hero-bar-track">
            <div class="career-hero-bar-fill" style="width:${pct}%;background:${rc};"></div>
          </div>
          <div class="career-hero-footer">
            <div>
              <div class="career-hero-next-label">Next Rank</div>
              <div class="career-hero-next-name">${nextLv.name}</div>
            </div>
            <div class="career-hero-motivate">${formatDisplayMoney(netWorthToNext)} to go</div>
          </div>`
        : `
          <div class="career-hero-footer">
            <span class="career-hero-max-badge" style="color:${rc};border-color:${rc}44;background:${rc}14;">Top rank reached</span>
          </div>`}
      </div>
      <div class="progress-pulse-grid">
        <div class="progress-pulse-card">
          <div class="progress-pulse-label">Streak</div>
          <div class="progress-pulse-value">${streak}d</div>
          <div class="progress-pulse-sub">${streak > 0 ? 'Daily momentum active' : 'Start one today'}</div>
        </div>
        <div class="progress-pulse-card">
          <div class="progress-pulse-label">Achievements</div>
          <div class="progress-pulse-value">${achievements.length}</div>
          <div class="progress-pulse-sub">Unlocked so far</div>
        </div>
        <div class="progress-pulse-card">
          <div class="progress-pulse-label">Net Worth</div>
          <div class="progress-pulse-value">${formatDisplayMoney(netWorth)}</div>
          <div class="progress-pulse-sub">${nextLv ? `${formatDisplayMoney(netWorthToNext)} to ${nextLv.name}` : 'Top rank reached'}</div>
        </div>
        <div class="progress-pulse-card">
          <div class="progress-pulse-label">Status</div>
          <div class="progress-pulse-value">${dueCount}</div>
          <div class="progress-pulse-sub">${dueCount > 0 ? 'Reviews waiting' : `${freezes} freeze${freezes === 1 ? '' : 's'} ready`}</div>
        </div>
      </div>
      <button class="btn btn-secondary career-ladder-toggle" onclick="toggleCareerLadder()">
        ${careerLadderExpanded ? 'Hide Full Rank Ladder' : 'View Full Rank Ladder'}
      </button>
      <div class="career-section-label">${careerLadderExpanded ? 'Full Rank Ladder' : 'Rank Progress'}</div>
      <div class="career-timeline">${milestoneMarkup}</div>`;
  }

  // careerPerks section is now merged into the timeline — clear it if it exists
  const perksEl = document.getElementById('careerPerks');
  if (perksEl) perksEl.innerHTML = '';
}

function toggleCareerLadder() {
  careerLadderExpanded = !careerLadderExpanded;
  renderCareerPage();
}

/// ── PATH SCREEN ───────────────────────────────────────────────
// Renders the full lesson path list.
// Visual state for each lesson card:
//   completed  → green checkmark, "Done" tag
//   available  → dark icon, "Ready" tag, tappable
//   unit-locked (gold) → coloured lock state, tappable (shows paywall)
//   progression-locked → grey, "Locked" tag, not tappable

// ════════════════════════════════════════════════════════════
// PATH SCREEN
// ════════════════════════════════════════════════════════════

// Reusable inline SVG strings for tier badge tags.
// Filled shapes, no stroke — intentionally different from the
// outline icons used elsewhere so they read as "status badges".
const _GOLD_STAR = `<svg viewBox="0 0 24 24" width="9" height="9" fill="#c8a020" stroke="none" style="flex-shrink:0;display:block"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

/**
 * Track which unit is expanded on the Path screen.
 * UI-only state: preserved during navigation, not persisted.
 */
let openPathUnitId = null;

function togglePathUnit(unitId) {
  openPathUnitId = openPathUnitId === unitId ? null : unitId;
  renderPath();
}

/**
 * Render the compact curriculum units and their expandable lesson lists.
 *
 * Card states:
 *   completed       → green check icon, "Done" tag
 *   available       → dark icon, "Ready" tag + arrow
 *   gold-locked     → amber lock icon, filled-star "Gold" tag, tappable → paywall
 *   locked          → greyed out, "Locked" tag, not tappable (progression gate)
 */
// ── Learn page ───────────────────────────────────────────────
// Topic filter: 'all' or a Financial Fluency level number (1–5). The levels
// are shared with the Mastery ladder (Practice.getLadder) so Learn and Mastery
// always group lessons identically.
let learnFilter = 'all';
let learnPreviewLessonId = null;

function previewLearnLesson(id) {
  learnPreviewLessonId = Number(id);
  renderPath();
  if (learnPreviewLessonId) {
    requestAnimationFrame(() => {
      document.querySelector(`[data-lesson-id="${learnPreviewLessonId}"]`)?.focus({ preventScroll: true });
    });
  }
}

// Large hero illustration — "knowledge": open book + glowing lightbulb on a
// soft tinted backdrop, layered with soft shadows for depth.
// ── Horizontal "financial journey" path ───────────────────────
// A market-chart-style progress line that connects the five fluency
// levels: a zig-zag that trends upward, current level in green,
// locked levels gray, ending in a finish flag. Shared by the Learn
// rail and the Mastery page (replaces the old vertical ladder).
function renderFluencyPath(ladder, opts) {
  opts = opts || {};
  const levels = (ladder && ladder.levels) ? ladder.levels : [];
  const n = levels.length;
  if (!n) return '';

  const W = 340, H = 128, padX = 28, flagPad = 20;
  const x0 = padX, x1 = W - padX - flagPad;
  // Heights (0 = low, 1 = high) — a market-like zig-zag trending up.
  const heights = [0.18, 0.62, 0.42, 0.80, 0.66];
  const yTop = 26, yBot = 96;
  const pts = levels.map((lv, i) => {
    const x = n === 1 ? x0 : x0 + (i * (x1 - x0)) / (n - 1);
    const h = heights[i % heights.length];
    const y = yBot - h * (yBot - yTop);
    return { x: +x.toFixed(1), y: +y.toFixed(1), lv };
  });

  // Index up to which the journey is "done" (completed or current).
  let progressEnd = -1;
  levels.forEach((lv, i) => {
    if (lv.state === 'completed' || lv.state === 'current') progressEnd = i;
  });

  const polyAll = pts.map(p => `${p.x},${p.y}`).join(' ');
  const polyDone = pts.slice(0, progressEnd + 1).map(p => `${p.x},${p.y}`).join(' ');

  const nodes = pts.map((p, i) => {
    const lv = p.lv;
    const cls = `fp-node fp-node-${lv.state}`;
    const r = lv.state === 'current' ? 8.5 : 6;
    const halo = lv.state === 'current'
      ? `<circle cx="${p.x}" cy="${p.y}" r="14" class="fp-halo"/>` : '';
    const labelCls = lv.state === 'current' ? 'fp-num fp-num-current'
      : (lv.state === 'locked' ? 'fp-num fp-num-locked' : 'fp-num');
    const handler = ` style="cursor:pointer" onclick="focusLearnLevel(${lv.n})" tabindex="0" role="button" aria-label="View Level ${lv.n}, ${escapeAppHtml(lv.name)} lessons" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();focusLearnLevel(${lv.n})}"`;
    return `<g class="fp-node-g"${handler}>
        ${halo}
        <circle cx="${p.x}" cy="${p.y}" r="13" fill="transparent"/>
        <circle cx="${p.x}" cy="${p.y}" r="${r}" class="${cls}"/>
        <text x="${p.x}" y="116" text-anchor="middle" class="${labelCls}">${lv.n}</text>
      </g>`;
  }).join('');

  // Finish flag just past the last node.
  const last = pts[pts.length - 1];
  const reached = levels[levels.length - 1].state === 'completed';
  const flagCls = reached ? 'fp-flag-reached' : 'fp-flag';
  const fx = last.x + 13, fy = last.y;
  const flag = `<g class="${flagCls}">
      <line x1="${fx}" y1="${fy - 20}" x2="${fx}" y2="${fy + 6}" class="fp-flag-pole"/>
      <path d="M${fx} ${fy - 20} L${fx + 15} ${fy - 15} L${fx} ${fy - 10} Z" class="fp-flag-cloth"/>
    </g>`;

  return `<div class="fp-wrap">
    <svg viewBox="0 0 ${W} ${H}" class="fp-svg" role="img" aria-label="Your learning path: level ${(progressEnd + 1) || 1} of ${n}" preserveAspectRatio="xMidYMid meet">
      <polyline points="${polyAll}" class="fp-line-base"/>
      ${polyDone && progressEnd > 0 ? `<polyline points="${polyDone}" class="fp-line-done"/>` : ''}
      ${flag}
      ${nodes}
    </svg>
  </div>`;
}
window.renderFluencyPath = renderFluencyPath;

function setLearnFilter(f) {
  learnFilter = (f === 'all') ? 'all' : Number(f);
  renderPath();
}

// Called from the Mastery ladder — jump to Learn focused on a level.
function focusLearnLevel(n) {
  const num = Number(n);
  const unit = _originalCurriculumUnits().find(item => item.id === num);
  const validUnit = Boolean(unit);
  learnFilter = validUnit ? num : 'all';
  workspaceOpenUnitId = validUnit ? num : workspaceOpenUnitId;
  if (unit) {
    const completed = new Set((S.completedIds || []).map(Number));
    learnPreviewLessonId = (unit.lessons.find(lesson => !completed.has(Number(lesson.id))) || unit.lessons[0])?.id || learnPreviewLessonId;
  }
  _setWorkspaceLearnMenu(true);
  if (typeof showLearn === 'function') showLearn({ resetScroll: true });
  else renderPath();
}

function _learnDifficulty(levelNum) {
  if (!levelNum || levelNum <= 2) return { key: 'beginner', label: 'Beginner' };
  if (levelNum <= 4) return { key: 'intermediate', label: 'Intermediate' };
  return { key: 'advanced', label: 'Advanced' };
}

function _learnMinutes(lesson) {
  const q = Array.isArray(lesson?.questions) ? lesson.questions.length : 0;
  return Math.max(3, Math.round(q * 1.6));
}

function _learnKeyConcepts(lesson) {
  const authored = (Array.isArray(lesson?.miniLessonContent) ? lesson.miniLessonContent : [])
    .map(item => item?.title)
    .filter(Boolean);
  if (authored.length) return authored.slice(0, 3);
  return (Array.isArray(lesson?.questions) ? lesson.questions : [])
    .map(question => String(question.q || '').replace(/\?$/, ''))
    .filter(Boolean)
    .slice(0, 3);
}

function _focusedLessonPlainEnglish(lesson) {
  const authored = lesson?.miniLessonContent?.find(item => /plain|concept|overview/i.test(item.title || ''));
  if (authored?.text) return authored.text;
  const courseBody = typeof COURSES !== 'undefined' ? COURSES[lesson?.id]?.body : '';
  if (courseBody) {
    const temp = document.createElement('div');
    temp.innerHTML = courseBody;
    const firstParagraph = temp.querySelector('p');
    if (firstParagraph?.textContent) return firstParagraph.textContent.trim();
  }
  return lesson?.questions?.[0]?.explanation || lesson?.blurb || '';
}

function _focusedLessonExample(lesson) {
  const title = String(lesson?.title || '').toLowerCase();
  if (title.includes('stock')) return 'When you own a share of a public company, you own a very small part of that business and share in its risks and potential growth.';
  if (title.includes('bond')) return 'Buying a municipal bond is similar to lending money to a city so it can build roads or schools, then receiving interest while the loan is outstanding.';
  if (title.includes('etf')) return 'An ETF is like buying one basket that already contains many companies instead of selecting every company one at a time.';
  if (title.includes('index fund')) return 'An index fund lets one investment follow a broad market list, such as hundreds of large companies, rather than relying on one winner.';
  if (title.includes('inflation')) return 'If groceries cost more next year while your cash balance stays the same, that money can buy less even though the number in the account did not change.';
  return lesson?.questions?.[0]?.explanation || `This concept appears whenever someone makes a real decision involving ${lesson?.title || 'money'}.`;
}

function _focusedLessonTerms(lesson) {
  const courseBody = typeof COURSES !== 'undefined' ? COURSES[lesson?.id]?.body : '';
  if (courseBody) {
    const temp = document.createElement('div');
    temp.innerHTML = courseBody;
    const terms = [...temp.querySelectorAll('.term-row')].slice(0, 5).map(row => ({
      term: row.querySelector('.term-key')?.textContent?.trim(),
      definition: row.querySelector('.term-val')?.textContent?.trim()
    })).filter(item => item.term && item.definition);
    if (terms.length) return terms;
  }
  return _learnKeyConcepts(lesson).map(term => ({
    term,
    definition: `A key idea used to understand ${lesson?.title || 'this lesson'}.`
  }));
}

let learnUnitsActiveTab = 'my';
// Edit mode reveals per-card delete controls on AI-generated units only. It is
// intentionally transient — never persisted — so a refresh or tab switch exits.
let learnEditMode = false;

function _learnUnitIcon(type = 'ai') {
  if (type === 'preset') {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5A5.5 5.5 0 0 0 6.5 4H4v15h3a5 5 0 0 1 5 3"/><path d="M12 7.5A5.5 5.5 0 0 1 17.5 4H20v15h-3a5 5 0 0 0-5 3"/><path d="M12 7.5V22"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`;
}

function switchLearnUnitsTab(tab) {
  learnUnitsActiveTab = tab === 'preset' ? 'preset' : 'my';
  learnEditMode = false; // Editing only applies to My Units; reset on tab change.
  const container = document.getElementById('lessonPath');
  if (container) renderV3LearnWorkspace(container);
}

// Toggle the transient "Edit" mode beside the My Units heading.
function toggleLearnEditMode() {
  learnEditMode = !learnEditMode;
  const container = document.getElementById('lessonPath');
  if (container) renderV3LearnWorkspace(container);
}
if (typeof window !== 'undefined') window.toggleLearnEditMode = toggleLearnEditMode;

// Navigate to the Learn overview and bring a specific generated unit into view
// WITHOUT opening it. Used by Ask's "View in Learn" action: the user lands on
// the normal My Units list, sees the new unit scrolled into view and briefly
// highlighted, and decides whether to open it themselves.
function focusLearnUnit(unitId) {
  learnUnitsActiveTab = 'my';
  learnEditMode = false;
  if (typeof showLearn === 'function') showLearn({ resetScroll: true });
  else if (typeof showPath === 'function') showPath();
  if (!unitId) return;
  const escId = (window.CSS && typeof CSS.escape === 'function') ? CSS.escape(String(unitId)) : String(unitId).replace(/["\\]/g, '\\$&');
  // The workspace re-renders asynchronously; retry briefly until the card exists.
  const reveal = (attempt = 0) => {
    const card = document.querySelector(`.v3-unit-card-ai[data-unit-id="${escId}"]`);
    if (!card) {
      if (attempt < 10) setTimeout(() => reveal(attempt + 1), 70);
      return;
    }
    try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    catch (_) { card.scrollIntoView(); }
    card.classList.remove('v3-unit-card-just-added');
    // Force reflow so the animation restarts even if the class lingered.
    void card.offsetWidth;
    card.classList.add('v3-unit-card-just-added');
    setTimeout(() => card.classList.remove('v3-unit-card-just-added'), 1900);
  };
  setTimeout(() => reveal(0), 90);
}
if (typeof window !== 'undefined') window.focusLearnUnit = focusLearnUnit;

function focusAskForNewUnit() {
  if (typeof showCoach === 'function') {
    showCoach({ resetScroll: true });
    setTimeout(() => {
      const input = document.getElementById('coachInput');
      if (input) {
        input.focus();
        input.placeholder = 'Ask what you want to learn...';
      }
    }, 120);
  }
}

// Open a brand-new Ask Finlingo chat (used by the empty AI-unit card). Starts a
// fresh conversation when the chat store is available, then falls back to simply
// focusing Ask if it is not.
function startAskForNewUnit() {
  if (typeof window !== 'undefined' && window.CoachPage && typeof window.CoachPage.newChat === 'function') {
    window.CoachPage.newChat();
    return;
  }
  focusAskForNewUnit();
}
if (typeof window !== 'undefined') window.startAskForNewUnit = startAskForNewUnit;

function openPresetUnit(unitId) {
  if (LEGACY_PRESET_UNIT_IDS.has(Number(unitId))) {
    if (typeof showLearn === 'function') showLearn({ resetScroll: true });
    return;
  }
  if (typeof openMicroUnit === 'function' && window.MicroData && window.MicroData.presetUnitHasMicro(unitId)) {
    openMicroUnit('preset_unit_' + Number(unitId));
  }
}

function renderV3LearnWorkspace(container) {
  // Preset tab = the ORIGINAL curriculum units (UNITS_DEF), in order. All six
  // carry authored micro-lessons. We never filter, reorder, or replace the
  // source units here.
  const rawPresetDefs = (typeof window !== 'undefined' && Array.isArray(window.UNITS_DEF))
    ? window.UNITS_DEF
    : (typeof UNITS_DEF !== 'undefined' && Array.isArray(UNITS_DEF) ? UNITS_DEF : []);
  const presetDefs = rawPresetDefs;
  const _md = (typeof window !== 'undefined') ? window.MicroData : null;
  const _hasMicro = id => !!(_md && typeof _md.presetUnitHasMicro === 'function' && _md.presetUnitHasMicro(id));
  const _presetMicroCount = id => {
    const mu = _md && typeof _md.getPresetMicroUnitByUnitId === 'function' ? _md.getPresetMicroUnitByUnitId(id) : null;
    return mu ? mu.lessons.length : 0;
  };
  const _origLessonCount = unit => {
    const lessons = (typeof getUnitLessons === 'function') ? getUnitLessons(unit) : [];
    return (lessons && lessons.length) || (Array.isArray(unit.range) ? Math.max(0, Number(unit.range[1]) - Number(unit.range[0]) + 1) : 0);
  };
  const customUnits = (typeof window !== 'undefined' && window.CoachUnits) ? window.CoachUnits.all() : [];
  const active = learnUnitsActiveTab === 'preset' ? 'preset' : 'my';
  const customCount = customUnits.length;

  // Dev diagnostics (enable with localStorage.setItem('finlingo_debug','1')).
  try {
    if (localStorage.getItem('finlingo_debug') === '1') {
      console.debug('[preset-units]', {
        totalPresetUnits: presetDefs.length,
        firstTwo: presetDefs.slice(0, 2).map(u => ({ id: u.id, title: u.title, hasMicro: _hasMicro(u.id), microLessons: _presetMicroCount(u.id), rawLessons: _origLessonCount(u) }))
      });
    }
  } catch (_) {}

  // ── Completion + progress (shared rule via MicroProgress.isComplete) ──
  const _MD = (typeof window !== 'undefined') ? window.MicroData : null;
  const _MP = (typeof window !== 'undefined') ? window.MicroProgress : null;
  // Returns normalized progress info for any card's underlying micro unit.
  // `completed` follows the single canonical rule in MicroProgress.isComplete.
  const _cardInfo = microUnit => {
    const total = (microUnit && Array.isArray(microUnit.lessons)) ? microUnit.lessons.length : 0;
    const s = (_MP && typeof _MP.summary === 'function' && microUnit && microUnit.id)
      ? _MP.summary(microUnit.id, microUnit)
      : { started: false, completed: false, completedCount: 0, total: total, updatedAt: null };
    return {
      total: s.total || total,
      completedCount: Math.min(Number(s.completedCount) || 0, s.total || total),
      completed: s.completed === true,
      started: !!s.started,
      status: s.status || (s.completed ? 'completed' : s.started ? 'in_progress' : 'not_started'),
      currentLessonIndex: Number(s.currentLessonIndex) || 0,
      currentSlideIndex: Number(s.currentSlideIndex) || 0,
      latestScore: s.latestScore || null,
      bestScore: s.bestScore || null,
      missedConcepts: Array.isArray(s.missedConcepts) ? s.missedConcepts : [],
      attempts: Number(s.attempts) || 0,
      lastOpenedAt: s.lastOpenedAt || s.updatedAt || null,
      completedAt: s.completedAt || null,
      updatedAt: s.updatedAt || null
    };
  };
  const _subtitle = info => {
    if (info.completed) return 'Completed';
    if (info.status === 'recap_pending') return 'Recap quiz next';
    if (info.started) return `Lesson ${Math.min(info.total, info.currentLessonIndex + 1)} of ${info.total}`;
    return `${info.total} lesson${info.total === 1 ? '' : 's'} · Not started`;
  };
  // Progress fill = current lesson / total, so it stays in lockstep with the
  // "Lesson X of Y" line: Lesson 1 of 5 is exactly 20%, not 0%. We intentionally
  // do NOT gate this on a lesson being marked complete.
  const _progressPct = info => {
    if (!info.started || info.completed) return 0;
    const lesson = Math.min(info.total, info.currentLessonIndex + 1);
    return Math.round((lesson / Math.max(1, info.total)) * 100);
  };
  // Subtle right-facing chevron used as an affordance on every unit card.
  const _chevron = '<svg class="v3-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const _a11y = (title, info) => {
    if (info.completed) return `Open review for ${title}, ${_subtitle(info)}`;
    if (info.status === 'recap_pending') return `Open ${title}, recap quiz next`;
    if (info.started) return `Resume ${title}, lesson ${info.currentLessonIndex + 1} of ${info.total}`;
    return `Start ${title}, ${info.total} lesson${info.total === 1 ? '' : 's'}`;
  };
  const _ts = s => { const t = s ? Date.parse(s) : 0; return Number.isFinite(t) ? t : 0; };
  // Continue learning is most-recently-opened first. Completed is sorted by
  // completion date. Untouched units preserve their saved order.
  const _splitAndSort = cards => {
    const inProgress = cards.filter(c => !c.info.completed && c.info.started)
      .sort((a, b) => _ts(b.info.lastOpenedAt) - _ts(a.info.lastOpenedAt));
    const notStarted = cards.filter(c => !c.info.completed && !c.info.started);
    const completed = cards.filter(c => c.info.completed)
      .sort((a, b) => _ts(b.info.completedAt) - _ts(a.info.completedAt));
    return { inProgress, notStarted, completed };
  };

  const editing = active === 'my' && learnEditMode && customUnits.length > 0;
  if (!customUnits.length) learnEditMode = false; // keep transient flag honest

  // ── Card markup ──────────────────────────────────────────────────────
  // AI-created cards support swipe-to-delete. Structure: a fixed delete layer
  // sits behind a sliding surface (the normal card content). Swiping left
  // reveals the trash action; a full swipe deletes with Undo. Preset cards
  // (rendered by _presetCard) never get this treatment and are never deletable.
  const _aiCard = card => {
    const uid = escapeAppHtml(card.unit.id);
    const rawTitle = cleanGeneratedListItemText(card.unit.title || 'Generated unit');
    const title = escapeAppHtml(rawTitle);
    const trashSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
    return `
      <div class="v3-unit-card v3-unit-card-ai${card.info.completed ? ' is-complete' : ''}${card.info.status === 'completed_review' ? ' needs-review' : ''}" data-unit-id="${uid}" data-ai-swipe="1">
        <div class="v3-swipe-action" aria-hidden="true">
          <button type="button" class="v3-swipe-trash" tabindex="-1" aria-label="Delete ${title}" onclick="LearnUnitDelete.fromTrash(event, '${uid}')">${trashSvg}</button>
        </div>
        <div class="v3-swipe-surface">
          <button type="button" class="v3-unit-main" aria-label="${escapeAppHtml(_a11y(rawTitle, card.info))}" onclick="openMicroUnit('${uid}')">
            <span class="v3-unit-icon">${_learnUnitIcon('ai')}</span>
            <span class="v3-unit-copy">
              <strong>${title}</strong>
              <small>${_subtitle(card.info)}</small>
              ${card.info.started && !card.info.completed ? `<span class="v3-unit-progress" aria-hidden="true"><i style="width:${_progressPct(card.info)}%"></i></span>` : ''}
            </span>
            ${_chevron}
          </button>
        </div>
        <button type="button" class="v3-unit-kbd-delete" aria-label="Delete ${title}" onclick="LearnUnitDelete.request('${uid}', { via: 'keyboard' })">Delete unit</button>
      </div>`;
  };
  const _presetCard = card => {
    const rawTitle = card.title || card.unit.title || card.unit.name || 'Preset unit';
    const title = escapeAppHtml(rawTitle);
    return `
      <button type="button" class="v3-unit-card v3-unit-card-preset${card.info.completed ? ' is-complete' : ''}${card.info.status === 'completed_review' ? ' needs-review' : ''}" data-unit-id="${escapeAppHtml(String(card.unit.id))}"
              aria-label="${escapeAppHtml(_a11y(rawTitle, card.info))}" onclick="openMicroUnit('preset_unit_${Number(card.unit.id)}')">
        <span class="v3-unit-icon">${_learnUnitIcon('preset')}</span>
        <span class="v3-unit-copy">
          <strong>${title}</strong>
          <small>${_subtitle(card.info)}</small>
          ${card.info.started && !card.info.completed ? `<span class="v3-unit-progress" aria-hidden="true"><i style="width:${_progressPct(card.info)}%"></i></span>` : ''}
        </span>
        ${_chevron}
      </button>`;
  };
  // Active units (in-progress + not-started) share one unlabeled list so there
  // is no "Continue learning" / "Not started" header. In-progress units lead
  // (most-recently-opened first) so resuming stays at the top, then untouched
  // units. A "Completed" section only appears once a unit is genuinely
  // complete, and always sits below every unfinished unit.
  const _groupedList = (cards, renderCard) => {
    const { inProgress, notStarted, completed } = _splitAndSort(cards);
    const active = inProgress.concat(notStarted);
    let html = '';
    if (active.length) {
      html += `<div class="v3-unit-list">${active.map(renderCard).join('')}</div>`;
    }
    if (completed.length) {
      html += `<h3 class="v3-section-heading v3-section-heading-completed">Completed</h3>` +
        `<div class="v3-unit-list">${completed.map(renderCard).join('')}</div>`;
    }
    return html;
  };

  // My Units (AI-generated only).
  const myCards = customUnits.map(unit => {
    const micro = (_MD && typeof _MD.normalizeUnit === 'function') ? _MD.normalizeUnit(unit) : { id: unit.id, lessons: unit.lessons || [] };
    return { kind: 'ai', unit, info: _cardInfo(micro) };
  });
  // Empty state: a real AI-unit card in its empty form (same outer
  // .v3-unit-card.v3-unit-card-ai shell + .v3-unit-main layout as a generated
  // unit). The whole card is clickable and opens a brand-new Ask Finlingo chat.
  const _emptyAiCard = `
    <div class="v3-unit-list">
      <div class="v3-unit-card v3-unit-card-ai v3-unit-card-empty">
        <button type="button" class="v3-unit-main" aria-label="Create your first AI-generated unit. Ask Finlingo about any finance topic." onclick="startAskForNewUnit()">
          <span class="v3-unit-icon">${_learnUnitIcon('ai')}</span>
          <span class="v3-unit-copy">
            <strong>Create your first AI-generated unit</strong>
            <small>Ask Finlingo about any finance topic</small>
          </span>
        </button>
      </div>
    </div>`;
  const myUnits = customUnits.length
    ? _groupedList(myCards, _aiCard)
    : _emptyAiCard;

  // Preset Units.
  const presetCards = presetDefs.filter(unit => _hasMicro(unit.id)).map(unit => {
    const micro = (_MD && typeof _MD.getPresetMicroUnitByUnitId === 'function') ? _MD.getPresetMicroUnitByUnitId(unit.id) : null;
    return { kind: 'preset', unit, title: (micro && micro.title) || unit.title || unit.name, info: _cardInfo(micro) };
  });
  const presetUnits = _groupedList(presetCards, _presetCard);

  const editBtn = '';

  container.innerHTML = `
    <div class="v3-learn-shell">
      <header class="v3-learn-header">
        <div>
          <span class="v3-learn-kicker">Learn</span>
          <h1>Your learning path,<br>built on demand.</h1>
          <p>Ask a question to build a focused unit, or explore the preset curriculum.</p>
        </div>
      </header>

      <section class="v3-learn-tabs" role="tablist" aria-label="Learn units">
        <button type="button" role="tab" aria-selected="${active === 'my' ? 'true' : 'false'}" class="${active === 'my' ? 'active' : ''}" onclick="switchLearnUnitsTab('my')">
          My Units
        </button>
        <button type="button" role="tab" aria-selected="${active === 'preset' ? 'true' : 'false'}" class="${active === 'preset' ? 'active' : ''}" onclick="switchLearnUnitsTab('preset')">
          Preset Units
        </button>
      </section>

      <section class="v3-units-panel ${active === 'my' ? 'show-my' : 'show-preset'}">
        <div class="v3-units-head">
          <div>
            <span>${active === 'my' ? 'AI-created units' : 'FinLingo curriculum'}</span>
            <h2>${active === 'my' ? 'Built from your questions' : 'Preset units'}</h2>
          </div>
          <div class="v3-units-head-actions">
            <small>${active === 'my' ? (customCount > 0 ? `${customCount} unit${customCount === 1 ? '' : 's'}` : '') : `${presetDefs.length} units`}</small>
            ${editBtn}
          </div>
        </div>
        <div class="v3-units-groups">
          ${active === 'my' ? myUnits : presetUnits}
        </div>
      </section>
    </div>`;
}

// ── My Units: per-card "⋯" menu (AI-generated units only) ──────────────
// Anchored dropdown + a restrained delete confirmation. Deletes ONLY the
// selected unit (by stable unitId) and its micro-lesson progress — never the
// source chat or other units. Persisted via CoachUnits + MicroProgress.
const LearnUnitMenu = {
  _open: false,
  _unitId: null,
  _menu: null,
  _btn: null,
  toggle(event, unitId) {
    if (event) event.stopPropagation();
    if (this._open && this._unitId === unitId) { this.close(); return; }
    this.close();
    this._unitId = unitId;
    this._btn = event ? event.currentTarget : null;
    const menu = document.createElement('div');
    menu.className = 'unit-menu-dropdown';
    menu.setAttribute('role', 'menu');
    menu.innerHTML =
      '<button type="button" role="menuitem" class="unit-menu-item unit-menu-item-danger" onclick="LearnUnitMenu.confirmDelete()">Delete unit</button>';
    document.body.appendChild(menu);
    if (this._btn) {
      const r = this._btn.getBoundingClientRect();
      const width = 168;
      menu.style.top = (r.bottom + 6) + 'px';
      menu.style.left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) + 'px';
      this._btn.setAttribute('aria-expanded', 'true');
    }
    this._menu = menu;
    this._open = true;
    setTimeout(() => {
      document.addEventListener('click', this._onDoc, true);
      document.addEventListener('keydown', this._onKey, true);
      const first = menu.querySelector('button');
      if (first) first.focus();
    }, 0);
  },
  _onDoc(e) {
    if (LearnUnitMenu._menu && !LearnUnitMenu._menu.contains(e.target)) LearnUnitMenu.close();
  },
  _onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); LearnUnitMenu.close(); }
  },
  close() {
    if (this._menu) { this._menu.remove(); this._menu = null; }
    if (this._btn) { this._btn.setAttribute('aria-expanded', 'false'); this._btn = null; }
    this._open = false;
    document.removeEventListener('click', this._onDoc, true);
    document.removeEventListener('keydown', this._onKey, true);
  },
  confirmDelete() {
    const unitId = this._unitId;
    this.close();
    if (!unitId) return;
    this._openConfirm(unitId);
  },
  _openConfirm(unitId) {
    let overlay = document.getElementById('unitDeleteOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'unitDeleteOverlay';
      overlay.className = 'unit-confirm-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      '<div class="unit-confirm-backdrop" onclick="LearnUnitMenu._closeConfirm()"></div>' +
      '<div class="unit-confirm" role="dialog" aria-modal="true" aria-labelledby="unitConfirmTitle">' +
      '  <h3 id="unitConfirmTitle">Delete this unit?</h3>' +
      '  <p>This removes the unit and its saved progress from My Units.</p>' +
      '  <div class="unit-confirm-actions">' +
      '    <button type="button" class="unit-confirm-cancel" onclick="LearnUnitMenu._closeConfirm()">Cancel</button>' +
      '    <button type="button" class="unit-confirm-delete" onclick="LearnUnitMenu._doDelete(\'' + unitId + '\')">Delete</button>' +
      '  </div>' +
      '</div>';
    overlay.classList.add('open');
    document.body.classList.add('unit-confirm-open');
    this._confirmKey = e => { if (e.key === 'Escape') LearnUnitMenu._closeConfirm(); };
    document.addEventListener('keydown', this._confirmKey, true);
    setTimeout(() => { const c = overlay.querySelector('.unit-confirm-cancel'); if (c) c.focus(); }, 20);
  },
  _closeConfirm() {
    const overlay = document.getElementById('unitDeleteOverlay');
    if (overlay) { overlay.classList.remove('open'); overlay.innerHTML = ''; }
    document.body.classList.remove('unit-confirm-open');
    if (this._confirmKey) { document.removeEventListener('keydown', this._confirmKey, true); this._confirmKey = null; }
  },
  _doDelete(unitId) {
    this._closeConfirm();
    if (!unitId) return;
    // If the unit being deleted is currently open in the player, leave it first.
    const openId = (window.MicroUnit && typeof window.MicroUnit.currentUnitId === 'function') ? window.MicroUnit.currentUnitId() : null;
    const microScreen = document.getElementById('microLessonScreen');
    const viewingDeleted = openId === unitId && microScreen && microScreen.classList.contains('active');
    // Remove the unit and its progress (stable id only — never by title).
    if (window.CoachUnits && typeof window.CoachUnits.remove === 'function') window.CoachUnits.remove(unitId);
    if (window.MicroProgress && typeof window.MicroProgress.remove === 'function') window.MicroProgress.remove(unitId);
    try { window.dispatchEvent(new CustomEvent('finlingo:custom-units-updated')); } catch (_) {}
    if (typeof showToast === 'function') showToast('Unit deleted', 'success');
    if (viewingDeleted) {
      if (typeof showLearn === 'function') showLearn({ resetScroll: true });
    } else if (typeof renderPath === 'function') {
      renderPath();
    }
  }
};
if (typeof window !== 'undefined') window.LearnUnitMenu = LearnUnitMenu;

function renderFocusedLearnWorkspace(container) {
  renderV3LearnWorkspace(container);
  return;

  const completedSet = new Set(Array.isArray(S?.completedIds) ? S.completedIds : []);
  const allLessons = (typeof LESSONS !== 'undefined' ? LESSONS : [])
    .filter(lesson => lesson && (lesson.questions || []).length);
  const units = _originalCurriculumUnits();
  const nextLesson = typeof getNextAvailableLesson === 'function'
    ? getNextAvailableLesson()
    : allLessons.find(lesson => !completedSet.has(lesson.id));
  const requestedLesson = allLessons.find(item => item.id === Number(learnPreviewLessonId));
  const lesson = requestedLesson || nextLesson || allLessons[0];
  if (!lesson) {
    container.innerHTML = '<div class="learn-empty">No lessons are available yet.</div>';
    return;
  }
  learnPreviewLessonId = lesson.id;
  const currentUnit = typeof getUnitForLesson === 'function'
    ? getUnitForLesson(lesson)
    : units.find(unit => unit.lessons.some(item => item.id === lesson.id));
  const difficulty = _learnDifficulty(Math.ceil((lesson.id / Math.max(1, allLessons.length)) * 5));
  const minutes = _learnMinutes(lesson);
  const currentUnitLessons = currentUnit && typeof getUnitLessons === 'function'
    ? getUnitLessons(currentUnit)
    : allLessons.filter(item => item.unit === lesson.unit);
  const currentUnitProgress = currentUnit && typeof getUnitProgress === 'function'
    ? getUnitProgress(currentUnit, [...completedSet])
    : {
        completedCount: currentUnitLessons.filter(item => completedSet.has(Number(item.id))).length,
        total: currentUnitLessons.length
      };
  const lessonIndex = Math.max(0, currentUnitLessons.findIndex(item => item.id === lesson.id));
  const fluency = {
    pct: Math.round((completedSet.size / Math.max(1, allLessons.length)) * 100),
    unit: currentUnit?.id || 1,
    unitName: currentUnit?.title || currentUnit?.name || lesson.unit,
    completed: completedSet.size,
    total: allLessons.length
  };
  const dayIndex = Math.floor(Date.now() / 86400000) % allLessons.length;
  const dailyConcept = allLessons[dayIndex] || lesson;
  const recommended = allLessons.filter(item => !completedSet.has(item.id) && item.id !== lesson.id).slice(0, 3);
  const visibleLessons = allLessons.slice(0, 4);
  const circlePct = Math.max(0, Math.min(100, fluency.pct));
  const understoodLessons = allLessons.filter(item => completedSet.has(Number(item.id))).slice(-3);
  const roadmapUnderstands = understoodLessons.length
    ? understoodLessons.map(item => item.title)
    : ['No completed lessons yet'];
  const roadmapNext = typeof getNextAvailableLesson === 'function'
    ? getNextAvailableLesson(Array.isArray(S?.completedIds) ? S.completedIds : [], S?.user)
    : recommended[0];
  const roadmapMinutes = _learnMinutes(roadmapNext || recommended[0] || lesson);
  const lessonRow = item => {
    const itemUnit = typeof getUnitForLesson === 'function' ? getUnitForLesson(item) : null;
    const done = completedSet.has(item.id);
    return `<button type="button" class="target-lesson-row" onclick="openCourse(${item.id})">
      <span class="target-lesson-number">${done ? '✓' : item.id}</span>
      <span class="target-lesson-copy"><strong>${escapeAppHtml(item.title)}</strong><small>${escapeAppHtml(item.blurb || '')}</small></span>
      <span class="target-lesson-meta">${_learnMinutes(item)} min <i>•</i> ${escapeAppHtml(itemUnit?.title || item.unit || '')}</span>
      <span class="target-arrow">${FinLingoIcons.right()}</span>
    </button>`;
  };
  const recommendedRow = item => `<button type="button" class="target-rec-row" onclick="openCourse(${item.id})">
    <span class="target-rec-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 13h5M10 17h4"/></svg></span>
    <strong>${escapeAppHtml(item.title)}</strong>
    <small>${_learnMinutes(item)} min</small>
  </button>`;

  // Generated units saved from the Ask front door. Original preset
  // lesson data is never touched — these render in their own section.
  const customUnits = (typeof window !== 'undefined' && window.CoachUnits) ? window.CoachUnits.all() : [];
  const customUnitsMarkup = customUnits.length ? `
        <section class="target-section claude-units-section">
          <div class="target-section-heading"><span>Your generated units</span><small>${customUnits.length} created from Ask</small></div>
          <div class="claude-units-list">
            ${customUnits.map(unit => `
              <article class="claude-unit-card">
                <div class="claude-unit-head">
                  <span class="claude-unit-badge">Generated from Ask</span>
                  <button type="button" class="claude-unit-remove" onclick="CoachUnits.remove('${unit.id}'); showLearn();" aria-label="Remove unit">✕</button>
                </div>
                <h3>${escapeAppHtml(cleanGeneratedListItemText(unit.title))}</h3>
                <p>${escapeAppHtml(cleanGeneratedListItemText(unit.description || ''))}</p>
                <ol class="claude-unit-lessons">
                  ${(unit.lessons || []).map((ls, i) => `<li><button type="button" onclick="coachTeachUnitLesson('${unit.id}',${i})"><span class="claude-unit-num">${i + 1}</span><span>${escapeAppHtml(cleanGeneratedListItemText(typeof ls === 'string' ? ls : (ls.title || '')))}</span></button></li>`).join('')}
                </ol>
                <div class="claude-unit-actions">
                  <button type="button" class="btn btn-primary" onclick="coachTeachUnitLesson('${unit.id}',0)">Start unit</button>
                  <button type="button" class="btn btn-outline" onclick="coachQuizUnit('${unit.id}')">Quiz me</button>
                </div>
              </article>`).join('')}
          </div>
        </section>` : '';

  container.innerHTML = `
    <div class="target-learn-shell">
      <main class="target-learn-main">
        <header class="target-learn-header">
          <span>Learn</span>
          <h1>Continue learning.</h1>
          <p>One clear concept at a time, with help when you need it.</p>
        </header>

        <section class="target-section">
          <div class="target-section-heading"><span>Continue learning</span></div>
          <article class="target-continue-card">
            <span class="target-card-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"/><path d="M6 15l4-4 3 3 6-7"/><path d="M16 7h3v3"/><path d="M6 15v4M12 14v5M18 9v10"/></svg>
            </span>
            <div>
              <h2>${escapeAppHtml(lesson.title)}</h2>
              <p>${escapeAppHtml(lesson.blurb || '')}</p>
              <small>${minutes} min <i>•</i> ${difficulty.label} <i>•</i> ${escapeAppHtml(currentUnit?.title || lesson.unit || '')} <i>•</i> Lesson ${lessonIndex + 1}</small>
            </div>
            <button type="button" class="btn btn-primary" onclick="openCourse(${lesson.id})">${completedSet.has(lesson.id) ? 'Review lesson' : 'Continue lesson'}</button>
          </article>
        </section>

        <section class="target-section target-daily-section">
          <div class="target-section-heading"><span>Today’s concept</span></div>
          <button type="button" class="target-daily-card" onclick="openCourse(${dailyConcept.id})">
            <span class="target-card-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M6 7l-3 7h7z"/><path d="M18 7l-3 7h7z"/><path d="M8 21h8"/></svg>
            </span>
            <div><strong>${escapeAppHtml(dailyConcept.title)}</strong><p>${escapeAppHtml(dailyConcept.blurb || '')}</p></div>
            <span>Explore ${FinLingoIcons.right()}</span>
          </button>
        </section>

        <section class="target-section">
          <div class="target-section-heading target-lessons-heading">
            <span>Your lessons</span>
            <small>${completedSet.size} of ${allLessons.length} completed</small>
          </div>
          <div class="target-lesson-list">
            ${visibleLessons.map(lessonRow).join('')}
            <button type="button" class="target-view-all" onclick="previewLearnLesson(${visibleLessons[0]?.id || lesson.id})">View all lessons <span>${FinLingoIcons.right()}</span></button>
          </div>
        </section>

        ${customUnitsMarkup}
      </main>

      <aside class="target-learn-rail">
        <section class="target-rail-card target-fluency-card">
          <span class="target-rail-label">Financial fluency</span>
          <div class="target-fluency-row">
            <div class="target-fluency-ring" style="--pct:${circlePct}">
              <strong>${fluency.pct}%</strong>
            </div>
          </div>
          <p><strong>Unit ${fluency.unit}</strong> · ${escapeAppHtml(fluency.unitName)}</p>
          <div class="target-progress"><span style="width:${circlePct}%"></span></div>
          <small>${currentUnitProgress?.completedCount || 0} of ${currentUnitProgress?.total || 0} lessons complete</small>
          <button type="button" class="target-text-link" onclick="showPractice({resetScroll:true})">View Journey <span>${FinLingoIcons.right()}</span></button>
        </section>

        <section class="target-rail-card">
          <span class="target-rail-label">Recommended next</span>
          <div class="target-rec-list">
            ${recommended.map(recommendedRow).join('') || '<p>Your next recommendation will appear here.</p>'}
          </div>
          <button type="button" class="target-text-link" onclick="previewLearnLesson(${recommended[0]?.id || lesson.id})">See all recommendations <span>${FinLingoIcons.right()}</span></button>
        </section>

        <section class="target-rail-card target-roadmap-card">
          <span class="target-rail-label">Personal roadmap</span>
          <div class="target-roadmap-block">
            <strong>You understand:</strong>
            <ul>${roadmapUnderstands.map(title => `<li>${escapeAppHtml(title)}</li>`).join('')}</ul>
          </div>
          <div class="target-roadmap-block">
            <strong>Next recommended:</strong>
            <p>${escapeAppHtml((roadmapNext || recommended[0] || lesson)?.title || 'Next lesson')}</p>
          </div>
          <div class="target-roadmap-time">Estimated time: <strong>${roadmapMinutes} minutes</strong></div>
        </section>

        <section class="target-rail-card target-ask-card">
          <div class="target-ask-title">
            <strong>Ask</strong>
          </div>
          <p>Ask anything about this lesson.</p>
          <button type="button" onclick="runAskFinLingoMode('example','lesson')"><span>↗</span> Give me an example</button>
          <button type="button" onclick="runAskFinLingoMode('quiz','lesson')"><span>◈</span> Quiz me</button>
          <button type="button" onclick="runAskFinLingoMode('challenge','lesson')"><span>▱</span> Challenge me</button>
          <button type="button" class="target-ask-input" onclick="openAskFinLingo('lesson')">Ask anything... <span>${FinLingoIcons.right()}</span></button>
        </section>
      </aside>
    </div>`;
  if (typeof refreshAskFinLingoContext === 'function') refreshAskFinLingoContext('lesson');
}

function renderPath() {
  const container = document.getElementById('lessonPath');
  if (!container) return;
  try {
    renderFocusedLearnWorkspace(container);
  } catch (err) {
    console.error('[learn] failed to render lesson workspace', err);
    container.innerHTML = '<div class="learn-empty">Lessons are temporarily unavailable. Please refresh and try again.</div>';
  }
  return;

  const completedSet = new Set(S.completedIds || []);
  const allLessons = (typeof LESSONS !== 'undefined' ? LESSONS : [])
    .filter(l => l && (l.questions || []).length);

  // Level grouping shared with the Mastery ladder.
  const ladder = (typeof Practice !== 'undefined' && Practice.getLadder) ? Practice.getLadder() : null;
  const levelOf = new Map();
  if (ladder) ladder.levels.forEach(lv => lv.lessons.forEach(ls => levelOf.set(ls.id, lv.n)));

  if (learnFilter !== 'all' && !(learnFilter >= 1 && learnFilter <= 5)) learnFilter = 'all';
  const inScope = l => learnFilter === 'all' || levelOf.get(l.id) === learnFilter;
  const scope = allLessons.filter(inScope);

  const isCompleted = l => completedSet.has(l.id);
  const isInProgress = l => !isCompleted(l) && S.bestScores && S.bestScores[l.id] != null;

  const incomplete = scope.filter(l => !isCompleted(l));
  const inProgressList = scope.filter(isInProgress);

  // Continue / Today's list — in-progress first, then next up. Max 4.
  const seen = new Set();
  const continueList = [];
  [...inProgressList, ...incomplete].forEach(l => {
    if (!seen.has(l.id) && continueList.length < 4) { seen.add(l.id); continueList.push(l); }
  });

  // Recommended — upcoming lessons not already shown; fall back to recent
  // completed lessons to review when everything in scope is done.
  let recommended = incomplete.filter(l => !seen.has(l.id)).slice(0, 3);
  if (!recommended.length) recommended = scope.filter(isCompleted).slice(-3).reverse();

  const card = (lesson) => {
    const levelNum = levelOf.get(lesson.id);
    const diff = _learnDifficulty(levelNum);
    const min = _learnMinutes(lesson);
    const icon = ICONS[lesson.icon] || ICONS.stock;
    const completed = isCompleted(lesson);
    const status = completed ? 'completed' : (isInProgress(lesson) ? 'inprogress' : 'ready');
    const aria = `${escapeAppHtml(lesson.title)}. ${diff.label}. About ${min} minutes.${completed ? ' Completed.' : ''}`;
    const concepts = _learnKeyConcepts(lesson);
    const selected = learnPreviewLessonId === lesson.id;
    return `
      <article class="ls-card ls-card-${status}${selected ? ' is-selected' : ''}" data-lesson-id="${lesson.id}"
        role="button" tabindex="0" aria-selected="${selected}" aria-label="${aria}"
        onclick="previewLearnLesson(${lesson.id})"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();previewLearnLesson(${lesson.id})}">
        <span class="ls-icon" aria-hidden="true">${icon}</span>
        <span class="ls-body">
          <span class="ls-title">${escapeAppHtml(lesson.title)}${completed ? ' <span class="ls-done" aria-hidden="true">✓</span>' : ''}</span>
          <span class="ls-desc">${escapeAppHtml(lesson.blurb || '')}</span>
          <span class="ls-value-line">${min} min <i>•</i> ${diff.label} <i>•</i> ${concepts.length} key ideas</span>
        </span>
        <span class="ls-side">
          <span class="ls-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
        </span>
      </article>`;
  };

  // Filter chips: All Topics + the five fluency levels (horizontally scrollable).
  const chipDefs = [{ k: 'all', label: 'All Topics' }]
    .concat(ladder ? ladder.levels.map(lv => ({ k: lv.n, label: lv.name })) : []);
  const chips = chipDefs.map(c => {
    const active = (c.k === 'all' && learnFilter === 'all') || c.k === learnFilter;
    return `<button type="button" class="learn-chip${active ? ' is-active' : ''}" role="tab" aria-selected="${active ? 'true' : 'false'}" onclick="setLearnFilter('${c.k}')">${escapeAppHtml(c.label)}</button>`;
  }).join('');

  const fluency = (typeof Practice !== 'undefined' && Practice.getFluency)
    ? Practice.getFluency()
    : { pct: 0, completed: 0, total: allLessons.length, level: 1, levelName: '' };

  const nextLesson = continueList[0] || incomplete[0] || scope[0];
  const dayIndex = Math.floor(new Date(`${today()}T12:00:00`).getTime() / 86400000);
  const dailyLesson = allLessons.length ? allLessons[Math.abs(dayIndex) % allLessons.length] : null;
  const recentlyLearned = (S.completedIds || [])
    .slice(-3)
    .reverse()
    .map(id => allLessons.find(lesson => lesson.id === id))
    .filter(Boolean);
  if (!learnPreviewLessonId || !allLessons.some(lesson => lesson.id === learnPreviewLessonId)) {
    learnPreviewLessonId = nextLesson?.id || scope[0]?.id || null;
  }
  const previewLesson = allLessons.find(lesson => lesson.id === learnPreviewLessonId) || nextLesson;
  const previewConcepts = previewLesson ? _learnKeyConcepts(previewLesson) : [];
  const previewDifficulty = _learnDifficulty(previewLesson ? levelOf.get(previewLesson.id) : 1);
  const currentLevel = ladder?.current || ladder?.levels?.find(level => level.state === 'current') || ladder?.levels?.[0];
  const currentCompleted = currentLevel
    ? currentLevel.lessons.filter(lesson => completedSet.has(lesson.id)).length
    : 0;
  const accuracy = S.totalAnswered
    ? Math.round((S.totalCorrect / S.totalAnswered) * 100)
    : 0;

  // Compact recommendation row for the right rail.
  const railRec = (lesson) => {
    const icon = ICONS[lesson.icon] || ICONS.stock;
    const min = _learnMinutes(lesson);
    return `
      <button type="button" class="rail-rec" onclick="openCourse(${lesson.id})">
        <span class="rail-rec-icon" aria-hidden="true">${icon}</span>
        <span class="rail-rec-body">
          <span class="rail-rec-title">${escapeAppHtml(lesson.title)}</span>
          <span class="rail-rec-min">${min} min</span>
        </span>
        <span class="ls-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </button>`;
  };

  const pathMarkup = (typeof renderFluencyPath === 'function' && ladder)
    ? renderFluencyPath(ladder) : '';

  container.innerHTML = `
    <header class="learn-hero">
      <div>
        <div class="learn-eyebrow">Financial education, made practical</div>
        <h1 class="learn-h1">Build financial <span class="learn-accent">fluency</span>,<br>one concept at a time.</h1>
        <p class="learn-sub">Short lessons and plain-English explanations for better decisions with money, markets, and investing.</p>
        <button type="button" class="ask-finlingo-btn" onclick="openAskFinLingo('learn')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></svg>
          Ask
        </button>
      </div>
    </header>

    <div class="learn-grid">
      <div class="learn-main">
        ${nextLesson ? `
          <section class="continue-learning-card learn-flow-block">
            <div class="continue-learning-copy">
              <span class="learn-card-kicker">Continue learning</span>
              <h2>${escapeAppHtml(nextLesson.title)}</h2>
              <p>${escapeAppHtml(nextLesson.blurb || '')}</p>
              <div class="continue-learning-meta">${_learnMinutes(nextLesson)} min · ${_learnDifficulty(levelOf.get(nextLesson.id)).label} · ${_learnKeyConcepts(nextLesson).length} key ideas</div>
            </div>
            <button type="button" class="btn btn-primary" onclick="openCourse(${nextLesson.id})">${isInProgress(nextLesson) ? 'Continue Lesson' : 'Start Lesson'}</button>
          </section>` : ''}

        <section class="learn-flow-section">
          <div class="learn-flow-heading"><span>Today’s concept</span><small>One useful idea</small></div>
          ${dailyLesson ? `
            <div class="learn-insight-card daily-concept-card">
              <span class="learn-card-kicker">Plain-English concept</span>
              <h3>${escapeAppHtml(dailyLesson.title)}</h3>
              <p>${escapeAppHtml(dailyLesson.blurb || '')}</p>
              <button type="button" class="text-link-button" onclick="openCourse(${dailyLesson.id})">Explore concept ${FinLingoIcons.right()}</button>
            </div>` : ''}
        </section>

        ${currentLevel ? `
          <section class="learn-flow-section">
            <div class="learn-flow-heading"><span>Current level progress</span><small>Level ${currentLevel.n} of 5</small></div>
            <div class="learn-level-card">
              <div class="learn-level-top">
                <div>
                  <span class="learn-card-kicker">Level ${currentLevel.n}</span>
                  <h3>${escapeAppHtml(currentLevel.name)}</h3>
                </div>
                <strong>${currentLevel.pct}%</strong>
              </div>
              <div class="rail-bar"><span style="width:${currentLevel.pct}%"></span></div>
              <div class="learn-level-stats">
                <span><strong>${currentCompleted}</strong> Lessons completed</span>
                <span><strong>${Math.max(0, currentLevel.total - currentCompleted)}</strong> Remaining</span>
                <span><strong>${accuracy ? `${accuracy}%` : '—'}</strong> Review score</span>
              </div>
            </div>
          </section>` : ''}

        ${recommended.length ? `
          <section class="learn-flow-section">
            <div class="learn-flow-heading"><span>Recommended lessons</span><small>Best next concepts</small></div>
            <div class="learn-lessons learn-recommended">${recommended.map(card).join('')}</div>
          </section>` : ''}

        ${scope.length ? `
          <section class="learn-section learn-flow-section">
            <div class="learn-flow-heading"><span>All lessons</span><small>${scope.length} available</small></div>
            <div class="learn-chips" role="tablist" aria-label="Filter lessons by level">${chips}</div>
            <div class="learn-lessons">${scope.slice(0, 12).map(card).join('')}</div>
          </section>` : `
          <section class="learn-section">
            <div class="learn-empty">You've completed every lesson in this topic.</div>
          </section>`}
      </div>

      <aside class="learn-rail" aria-label="Your progress">
        ${previewLesson ? `
        <section class="rail-card lesson-preview-card">
          <div class="lesson-preview-kicker">Lesson preview</div>
          <h2>${escapeAppHtml(previewLesson.title)}</h2>
          <p>${escapeAppHtml(previewLesson.blurb || '')}</p>
          <div class="lesson-preview-meta">${_learnMinutes(previewLesson)} min · ${previewDifficulty.label} · ${escapeAppHtml(previewLesson.unit || 'Finance')}</div>
          <div class="lesson-preview-section">
            <strong>Big idea</strong>
            <span>${escapeAppHtml(previewLesson.blurb || 'Understand the concept in plain English.')}</span>
          </div>
          <div class="lesson-preview-section">
            <strong>What you’ll learn</strong>
            <ul>${previewConcepts.map(concept => `<li>${escapeAppHtml(concept)}</li>`).join('')}</ul>
          </div>
          <div class="lesson-preview-section">
            <strong>Why it matters</strong>
            <span>${escapeAppHtml(previewLesson.questions?.[0]?.explanation || 'Use this concept to make more informed financial decisions.')}</span>
          </div>
          <button type="button" class="btn btn-primary lesson-preview-start" onclick="openCourse(${previewLesson.id})">Start Lesson</button>
          <button type="button" class="lesson-preview-ask" onclick="openAskFinLingo('lesson')">Open Ask</button>
        </section>` : ''}

        <section class="rail-card">
          <div class="rail-card-head">
            <span class="rail-kicker">Financial Fluency</span>
            <span class="rail-pct">${fluency.pct}%</span>
          </div>
          <div class="rail-level">Level ${fluency.level || 1} of 5${fluency.levelName ? ` · ${escapeAppHtml(fluency.levelName)}` : ''}</div>
          <div class="rail-bar"><span style="width:${fluency.pct}%"></span></div>
          <div class="rail-meta">${fluency.completed} of ${fluency.total} lessons complete</div>
        </section>

        ${pathMarkup ? `
        <section class="rail-card">
          <div class="rail-card-head"><span class="rail-kicker">Learning Path</span></div>
          ${pathMarkup}
          <div class="journey-legend"><span><i class="is-complete"></i>Complete</span><span><i class="is-current"></i>Current</span><span><i></i>Upcoming</span></div>
        </section>` : ''}

        <section class="rail-card">
          <div class="rail-card-head"><span class="rail-kicker">Recently learned</span></div>
          ${recentlyLearned.length ? `
            <div class="recent-concepts">
              ${recentlyLearned.map(lesson => `<button type="button" onclick="previewLearnLesson(${lesson.id})"><span>✓</span>${escapeAppHtml(lesson.title)}</button>`).join('')}
            </div>` : `<div class="rail-empty-copy">Completed concepts will appear here for review.</div>`}
        </section>
      </aside>
    </div>`;
}
// ════════════════════════════════════════════════════════════
// MARKET SCREEN
// Feature registry + rendering live in market.js.
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// INIT — Boot sequence
// ════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.toggle(
    'workspace-sidebar-collapsed',
    localStorage.getItem('finlingo_workspace_sidebar') === 'collapsed'
  );
  document.querySelectorAll('button:not([type])').forEach(button => {
    button.type = 'button';
  });
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button:not([type])');
    if (button) button.type = 'button';
  }, true);

  // ── Wire result screen buttons ────────────────────────────
  // These two buttons have no onclick in index.html; must be wired here.
  const backHomeBtn = document.getElementById('backHomeBtn');
  if (backHomeBtn) backHomeBtn.onclick = showHome;
  const nextLessonBtn = document.getElementById('nextLessonBtn');
  if (nextLessonBtn) nextLessonBtn.onclick = () => {
    const nextId = typeof currentLesson?.id === 'number' ? currentLesson.id + 1 : null;
    if (nextId && LESSONS.some(l => l.id === nextId)) openCourse(nextId);
    else showHome();
  };
  const navLB = document.getElementById('navLB');
  if (navLB) navLB.onclick = () => showPractice({ resetScroll: true });
  const navProfile = document.getElementById('navProfile');
  if (navProfile) navProfile.onclick = () => showProfile(null, { resetScroll: true });

  // ── Inject PWA manifest dynamically ──────────────────────
  const manifest = {
    name: 'Finlingo', short_name: 'Finlingo', start_url: new URL('./', window.location.href).href,
    display: 'standalone', background_color: '#ffffff', theme_color: '#0a0a0a',
    icons: [{
      src: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%230a0a0a'/><text y='.9em' font-size='72' x='12'>F</text></svg>",
      sizes: '192x192', type: 'image/svg+xml'
    }]
  };
  const blob       = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
  const manifestEl = document.getElementById('pwaManifest');
  if (manifestEl) manifestEl.href = URL.createObjectURL(blob);

  // ── PWA install prompt ────────────────────────────────────
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window._pwaPrompt = e;
    if (!localStorage.getItem('finlingo_install_dismissed')) {
      setTimeout(() => document.getElementById('installBanner')?.classList.add('show'), 3000);
    }
  });

  // ── Check for password-reset recovery link ────────────────
  const inRecovery = checkAndApplyRecoveryMode();
  if (inRecovery) {
    _showAuthBootScreen();
    openAuthModal('reset', { dismissible: false });
    return;
  }

  const _urlParams  = new URLSearchParams(window.location.search);
  if (_urlParams.get('payment') || _urlParams.get('tier') || _urlParams.get('streak_repaired')) {
    history.replaceState(null, '', window.location.pathname);
  }

  try {
    const storedSession = typeof getStoredSession === 'function'
      ? getStoredSession()
      : null;

    if (!storedSession) {
      // Onboarding removed: first-time / logged-out users enter directly as a
      // guest instead of hitting an onboarding/sign-in gate. Existing local
      // (guest) state is preserved — we only mint a guest identity when none
      // exists, and never reset stored progress here.
      if (!(S.user && !S.user.id)) {
        S.user = { name: 'Guest', email: null, tier: 'standard', avatarColor: '#1a1a1a' };
        if (!S.joinedDate) S.joinedDate = new Date().toISOString();
        if (typeof save === 'function') save();
      }
      enterApp();
      return;
    }

    // ── Restore existing session ────────────────────────────
    const hasValidSession = await restoreSession();

    // ── Route: app or auth ──────────────────────────────────
    if (hasValidSession) {
      const sessionUser = await _resolveSessionUser();
      if (sessionUser?.id) {
        _hydrateStateFromSessionUser(sessionUser);
        await _syncTierFromSupabase();
        enterApp();
        if (typeof _syncProfileAndProgress === 'function') {
          _syncProfileAndProgress(sessionUser.id, sessionUser.email || '').catch(() => {});
        }
      } else {
        _showAuthBootScreen();
      }
    } else {
      _showAuthBootScreen();
    }
  } catch (err) {
    console.error('[boot] auth/boot fallback triggered:', err);
    _showAuthBootScreen();
  }
});


// ════════════════════════════════════════════════════════════
// AUTH BOOT HELPERS
// ════════════════════════════════════════════════════════════

async function _resolveSessionUser() {
  const storedUser = typeof getStoredSessionUser === 'function'
    ? getStoredSessionUser()
    : null;

  if (storedUser?.id) return storedUser;
  if (typeof authGetCurrentUser === 'function') return await authGetCurrentUser();
  return null;
}

function _hydrateStateFromSessionUser(sessionUser) {
  if (!sessionUser?.id) return;
  if (S.user?.id === sessionUser.id) return;

  const local = typeof loadAuthenticatedState === 'function'
    ? loadAuthenticatedState(sessionUser.email || null, sessionUser.id)
    : loadState(sessionUser.email || null);
  const fallbackName = sessionUser.email?.split('@')[0] || 'User';
  const name = local.user?.name || fallbackName;

  S = {
    ...local,
    joinedDate: local.joinedDate || new Date().toISOString(),
    user: {
      id:          sessionUser.id,
      name,
      email:       sessionUser.email || local.user?.email || '',
      tier:        'standard',
      avatarColor: local.user?.avatarColor || getAvatarColor(name)
    }
  };
  save();
}

function _clearAuthenticatedIdentity() {
  if (S.user) {
    S.user = null;
    save();
  }
}


// ════════════════════════════════════════════════════════════
// TIER SYNC HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Re-fetch the user's tier from Supabase and apply it to local state.
 * Called on every boot for signed-in users (security), and on payment return.
 * Silent on network error — keeps whatever local tier is stored.
 */
async function _syncTierFromSupabase() {
  if (S.user) S.user.tier = 'standard';
}

/**
 * Called once after enterApp() — checks whether we just returned from
 * a Stripe payment and shows the appropriate success message.
 *
 * Uses a retry loop with 2-second intervals in case the Stripe webhook
 * has not yet fired and the tier hasn't been written to Supabase yet.
 */
async function checkPendingTierUpgrade() {
  sessionStorage.removeItem('finlingo_payment_success');
  return;
  const pendingTier = sessionStorage.getItem('finlingo_payment_success');
  if (!pendingTier || !S.user?.id) return;

  const tierNames = { gold: 'Gold', platinum: 'Platinum' };
  const tierName  = tierNames[pendingTier] || 'Premium';

  // The tier was already synced in _syncTierFromSupabase() during boot.
  // Check if it matches — if yes, celebrate and we're done.
  if (S.user.tier === pendingTier) {
    sessionStorage.removeItem('finlingo_payment_success');
    setTimeout(() => {
      showToast(`${tierName} unlocked! Premium access is ready.`, 'success');
      // Re-render membership if the user was on that screen
      if (typeof renderMembership === 'function') renderMembership();
      if (typeof renderProfileScreen === 'function') renderProfileScreen();
      if (typeof renderPath === 'function') renderPath();
      if (typeof updateHome === 'function') updateHome();
    }, 500);
    return;
  }

  // Tier not updated yet — webhook may not have fired yet.
  // Retry up to 4 times at 2-second intervals (~8 seconds total).
  let attempts = 0;
  const MAX_ATTEMPTS = 4;

  showToast('Verifying payment…');

  const _poll = async () => {
    attempts++;
    const remoteTier = await fetchTierFromSupabase(S.user.id);
    if (remoteTier === pendingTier) {
      // Tier confirmed — apply and celebrate
      S.user.tier = remoteTier;
      save();
      sessionStorage.removeItem('finlingo_payment_success');
      showToast(`${tierName} unlocked! Premium access is ready.`, 'success');
      if (typeof renderMembership === 'function') renderMembership();
      if (typeof renderProfileScreen === 'function') renderProfileScreen();
      if (typeof renderPath === 'function') renderPath();
      if (typeof updateHome === 'function') updateHome();
      updateTopbar();
    } else if (attempts < MAX_ATTEMPTS) {
      // Still not updated — retry
      setTimeout(_poll, 2000);
    } else {
      // Gave up — payment was probably received but webhook latency is high.
      // Ask the user to reload.
      sessionStorage.removeItem('finlingo_payment_success');
      showAppModal({
        icon:  'gold',
        title: 'Payment Received',
        body:  'Your payment went through. If your plan hasn\'t updated yet, please reload the app — it usually takes just a moment.',
        actions: [
          { label: 'Reload Now', cls: 'btn btn-primary', fn: () => window.location.reload() },
          { label: 'Later',      cls: 'modal-cancel',    fn: closeAppModal }
        ]
      });
    }
  };

  // Start polling after a short delay
  setTimeout(_poll, 2000);
}

async function checkPendingStreakRepair() {
  if (!S.user?.id) return;

  if (_applyVerifiedStreakRepair({
    streak: S.streak,
    streak_date: S.streakDate,
    rewards_summary: S.rewardsSummary
  })) {
    return;
  }

  const pendingReturn = sessionStorage.getItem(STREAK_REPAIR_PENDING_KEY) === '1';
  if (!pendingReturn) return;

  let attempts = 0;
  const MAX_ATTEMPTS = 4;
  showToast('Verifying streak repair…');

  const poll = async () => {
    attempts += 1;
    let rows = [];
    try {
      rows = await sbGet('progress', `?user_id=eq.${S.user.id}&select=streak,streak_date,rewards_summary&limit=1`);
    } catch {
      rows = [];
    }

    const progressRow = Array.isArray(rows) ? rows[0] : null;
    if (_applyVerifiedStreakRepair(progressRow)) {
      if (typeof updateHome === 'function') updateHome();
      return;
    }

    if (attempts < MAX_ATTEMPTS) {
      setTimeout(poll, 2000);
      return;
    }

    sessionStorage.removeItem(STREAK_REPAIR_PENDING_KEY);
    showAppModal({
      icon: 'neutral',
      title: 'Payment Received',
      body: 'Your Streak Repair payment went through. If your streak has not returned yet, reload the app in a moment while the webhook finishes.',
      actions: [
        { label: 'Reload Now', cls: 'btn btn-primary', fn: () => window.location.reload() },
        { label: 'Later', cls: 'modal-cancel', fn: closeAppModal }
      ]
    });
  };

  setTimeout(poll, 1200);
}


// ════════════════════════════════════════════════════════════
// PWA HELPERS
// ════════════════════════════════════════════════════════════

function installPWA() {
  if (window._pwaPrompt) {
    window._pwaPrompt.prompt();
    window._pwaPrompt.userChoice.then(() => { window._pwaPrompt = null; });
  }
  document.getElementById('installBanner')?.classList.remove('show');
}

function dismissInstall() {
  document.getElementById('installBanner')?.classList.remove('show');
  localStorage.setItem('finlingo_install_dismissed', '1');
}


// ════════════════════════════════════════════════════════════
// NOTIFICATION HELPERS
// ════════════════════════════════════════════════════════════

function requestNotifPermission() {
  if (!('Notification' in window)) { showToast('Notifications not supported', 'error'); return; }
  Notification.requestPermission().then(perm => {
    localStorage.setItem('finlingo_notif_asked', '1');
    document.getElementById('notifPrompt')?.classList.remove('show');
    if (perm === 'granted') {
      showToast('Streak reminders enabled!', 'success');
      scheduleLocalTabReminder();
    } else {
      showToast('Notifications blocked');
    }
  });
}

function dismissNotifPrompt() {
  document.getElementById('notifPrompt')?.classList.remove('show');
  localStorage.setItem('finlingo_notif_asked', '1');
}

function scheduleLocalTabReminder() {
  // Placeholder — browser notifications only work while the tab is open.
  // Real push notifications require a service worker + push API + backend.
  // No-op for now; prevents the call from throwing.
}
