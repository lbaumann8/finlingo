// ============================================================
// auth.js
// Auth screen rendering and all authentication flows.
//
// SIGNUP FLOW WITH EMAIL VERIFICATION ON:
//   1. authSignUp() → Supabase creates user, sends confirmation email
//   2. Response has NO access_token → show "check your email" screen
//   3. Pending name saved to localStorage for use after verification
//   4. NO DB rows written — no valid token yet, RLS would block anyway
//   5. User clicks confirmation link in email
//   6. User returns and signs in normally
//
// FIRST SIGN-IN AFTER VERIFICATION (lazy initialisation):
//   1. authSignIn() → returns full session with access_token
//   2. setStoredSession() called immediately (before any DB call)
//   3. sbGet('users') → empty → sbUpsert creates the row now
//   4. sbGet('progress') → empty → sbUpsert creates the row now
//   5. User enters the app
//
// ALL SUBSEQUENT SIGN-INS:
//   1-2. Same as above
//   3-4. Rows already exist, just loaded
//   5. User enters the app
//
// FORGOT-PASSWORD FLOW:
//   1. User clicks "Forgot password?" on sign-in form
//   2. authMode → 'forgot', form re-renders with email-only input
//   3. doForgotPassword() → authRequestPasswordReset(email) → 200 always
//   4. Show "check your email" success screen
//   5. User clicks reset link in email → lands back on the app
//   6. DOMContentLoaded hook detects #type=recovery in URL hash
//   7. _recoveryToken stored, hash cleared, authMode → 'reset'
//   8. doResetPassword() → authUpdatePassword(token, password)
//   9. Token stored, user enters app
//
// Depends on:
//   supabase.js — authSignUp, authSignIn, authRequestPasswordReset,
//                 authUpdatePassword, sbGet, sbUpsert,
//                 setStoredSession, clearStoredSession
//   state.js    — S, DEF, save, today
//   app.js      — showToast, showHome (called via enterApp)
//   profile.js  — getAvatarColor
// ============================================================

let authMode = 'signin';
let _authBusy = false;
let _authReturnContext = null;
let _authIntent = {
  kind: '',
  at: 0
};

// Holds the one-time recovery JWT from the password-reset email link.
// Populated by the DOMContentLoaded recovery-token check at the bottom
// of this file, consumed and cleared by doResetPassword().
let _recoveryToken = null;

// Email address from the in-progress signup. Captured the moment the
// "check your email" screen is shown so the Resend button has a reliable
// source of truth that does not depend on parsing visible DOM text.
let _pendingSignupEmail = null;

// Active interval for the resend-button cooldown countdown. Cleared whenever
// the success screen is reset/replaced so timers never leak across screens.
let _resendCooldownTimer = null;

function openAuthModal(mode = 'signin', { dismissible = true, returnTo = '' } = {}) {
  const authScreen = document.getElementById('authScreen');
  if (!authScreen) return;
  const accountOverlay = document.getElementById('accountPageOverlay');
  if (!authScreen.classList.contains('active')) {
    const activeScreen = document.querySelector('.screen.active:not(#authScreen)');
    _authReturnContext = {
      screenId: activeScreen?.id || null,
      screenScrollTop: activeScreen?.scrollTop || 0,
      windowScrollX: window.scrollX || 0,
      windowScrollY: window.scrollY || 0,
      account: accountOverlay?.classList.contains('open') || returnTo === 'account'
    };
  }
  if (accountOverlay?.classList.contains('open') && typeof closeFinlingoAccount === 'function') {
    closeFinlingoAccount();
  }
  document.body.classList.add('auth-modal-visible');
  authMode = mode;
  authScreen.dataset.dismissible = dismissible ? 'true' : 'false';
  _setTabsVisible(mode === 'signin' || mode === 'create');
  document.getElementById('tabSignIn')?.classList.toggle('active', mode === 'signin');
  document.getElementById('tabCreate')?.classList.toggle('active', mode === 'create');
  renderAuthForm();
  if (typeof setScreen === 'function') {
    setScreen('authScreen', { preserveTransientLayers: false, resetScroll: true });
  } else {
    document.querySelectorAll('.screen').forEach(s => {
      const active = s === authScreen;
      s.classList.toggle('active', active);
      s.style.display = active ? '' : 'none';
      s.style.pointerEvents = active ? '' : 'none';
      s.toggleAttribute('inert', !active);
    });
    document.body.dataset.activeScreen = 'authScreen';
    document.body.classList.add('auth-screen-active');
    authScreen.classList.add('active');
    authScreen.removeAttribute('inert');
  }
  authScreen.classList.add('auth-modal-open');
}

function closeAuthModal(event) {
  const authScreen = document.getElementById('authScreen');
  if (!authScreen) return;
  if (event && event.target !== event.currentTarget) return;
  if (authScreen.dataset.dismissible === 'false' && !_authReturnContext?.screenId && !_authReturnContext?.account) {
    return;
  }
  _returnFromAuthScreen();
}

function _returnFromAuthScreen() {
  const authScreen = document.getElementById('authScreen');
  if (!authScreen) return;
  authScreen.classList.remove('auth-modal-open', 'active');
  document.body.classList.remove('auth-modal-visible');
  const returnContext = _authReturnContext || {};
  const targetScreen = returnContext.screenId && document.getElementById(returnContext.screenId)
    ? returnContext.screenId
    : 'coachScreen';
  if (typeof setScreen === 'function') {
    setScreen(targetScreen, { preserveTransientLayers: true, resetScroll: false });
  } else {
    document.body.dataset.activeScreen = targetScreen;
    document.body.classList.remove('auth-screen-active');
    document.querySelectorAll('.screen').forEach(s => {
      const active = s.id === targetScreen;
      s.classList.toggle('active', active);
      s.style.display = active ? '' : 'none';
      s.style.pointerEvents = active ? '' : 'none';
      s.toggleAttribute('inert', !active);
    });
  }
  const restoredScreen = document.getElementById(targetScreen);
  if (restoredScreen) restoredScreen.scrollTop = returnContext.screenScrollTop || 0;
  window.scrollTo(returnContext.windowScrollX || 0, returnContext.windowScrollY || 0);
  if (returnContext.account && typeof openFinlingoAccount === 'function') {
    openFinlingoAccount();
  }
  _authReturnContext = null;
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('authScreen')?.classList.contains('auth-modal-open')) {
    closeAuthModal();
  }
});

function continueWithGoogle() {
  const redirectTo = window.location.origin + window.location.pathname;
  window.location.assign(
    `${SB_AUTH}/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`
  );
}

function _resetAuthIntent() {
  _authIntent = {
    kind: '',
    at: 0
  };
}

function _markAuthIntent(kind, event) {
  if (!kind) return false;
  if (event && event.isTrusted === false) return false;
  _authIntent = {
    kind,
    at: Date.now()
  };
  return true;
}

function _consumeAuthIntent(kind) {
  const matches = _authIntent.kind === kind && (Date.now() - _authIntent.at) <= 4000;
  _resetAuthIntent();
  return matches;
}

function submitAuthWithIntent(event) {
  if (!_markAuthIntent('auth', event)) return;
  doAuth();
}

function submitForgotPasswordWithIntent(event) {
  if (!_markAuthIntent('forgot', event)) return;
  doForgotPassword();
}

function submitResetPasswordWithIntent(event) {
  if (!_markAuthIntent('reset', event)) return;
  doResetPassword();
}

// ── MERGE REMOTE PROGRESS ─────────────────────────────────────
// Merges Supabase data with localStorage instead of overwriting it.
// Takes the HIGHER value for cumulative fields — a failed sync never loses data.
function _mergeRemoteProgress(progData, authId, profile) {
  const local = typeof loadAuthenticatedState === 'function'
    ? loadAuthenticatedState(profile?.email || null, authId)
    : loadState(profile?.email || null);
  const mergeIds = (a, b) => [...new Set([
    ...(Array.isArray(a) ? a : []),
    ...(Array.isArray(b) ? b : [])
  ])];
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
  const localDate  = local.streakDate      || '';
  const remoteDate = progData.streak_date  || '';
  const useLocal   = localDate >= remoteDate;
  const remoteMastery = parseStructured(progData.mastery_summary);
  const remoteReviewQueue = parseStructured(progData.review_queue);
  const remoteInventory = parseStructured(progData.inventory);
  const remotePendingUnlocks = parseStructured(progData.pending_unlocks);
  const remoteRewardsSummary = parseStructured(progData.rewards_summary);
  const remoteAchievements = parseStructured(progData.achievements);
  const remotePortfolio = parseStructured(progData.portfolio);
  const mergedPortfolio = remotePortfolio && typeof remotePortfolio === 'object'
    ? {
        ...(local.portfolio && typeof local.portfolio === 'object' ? local.portfolio : {}),
        ...remotePortfolio,
        assets: remotePortfolio.assets && typeof remotePortfolio.assets === 'object'
          ? remotePortfolio.assets
          : (local.portfolio?.assets || {}),
        holdings: remotePortfolio.holdings && typeof remotePortfolio.holdings === 'object'
          ? remotePortfolio.holdings
          : (local.portfolio?.holdings || {}),
        history: Array.isArray(remotePortfolio.history)
          ? remotePortfolio.history
          : (local.portfolio?.history || []),
        transactions: Array.isArray(remotePortfolio.transactions)
          ? remotePortfolio.transactions
          : (local.portfolio?.transactions || []),
        customAssets: Array.isArray(remotePortfolio.customAssets)
          ? remotePortfolio.customAssets
          : (local.portfolio?.customAssets || []),
        watchlist: Array.isArray(remotePortfolio.watchlist)
          ? remotePortfolio.watchlist
          : (local.portfolio?.watchlist || [])
      }
    : local.portfolio;

  S = normalizeState({
    xp:            Math.max(local.xp           || 0, progData.xp            || 0),
    cash:          Math.max(local.cash         || 0, progData.cash          || 0),
    totalCorrect:  Math.max(local.totalCorrect || 0, progData.total_correct || 0),
    totalAnswered: Math.max(local.totalAnswered|| 0, progData.total_answered|| 0),
    streak:        useLocal ? (local.streak    || 0) : (progData.streak     || 0),
    streakDate:    useLocal ? (local.streakDate|| null) : (progData.streak_date || null),
    completedIds:  mergeIds(local.completedIds, progData.completed_ids),
    unlockedIds:   mergeIds(local.unlockedIds,  progData.unlocked_ids || [1]),
    dailyOn:       useLocal ? local.dailyOn : (progData.daily_on || null),
    joinedDate:    local.joinedDate || progData.joined_date || new Date().toISOString(),
    bestScores:    local.bestScores    || {},
    onboarding:    local.onboarding   || null,
    lastLessonDate: local.lastLessonDate || null,
    quests:        local.quests       || null,
    streakFreeze:  local.streakFreeze || false,
    mastery:       remoteMastery && typeof remoteMastery === 'object' ? remoteMastery : local.mastery,
    reviewQueue:   Array.isArray(remoteReviewQueue) ? remoteReviewQueue : local.reviewQueue,
    inventory:     remoteInventory && typeof remoteInventory === 'object' ? remoteInventory : local.inventory,
    pendingUnlocks: Array.isArray(remotePendingUnlocks) ? remotePendingUnlocks : local.pendingUnlocks,
    rewardsSummary: remoteRewardsSummary && typeof remoteRewardsSummary === 'object' ? remoteRewardsSummary : local.rewardsSummary,
    achievements:  remoteAchievements && typeof remoteAchievements === 'object' ? remoteAchievements : local.achievements,
    portfolio:     mergedPortfolio
  });
  S.user = {
    id: authId, name: profile.name, email: profile.email,
    tier: progData.tier || 'standard',
    avatarColor: progData.avatar_color || getAvatarColor(profile.name)
  };
}

// ── BACKGROUND PROFILE + PROGRESS SYNC ───────────────────────
// Called immediately after enterApp() on sign-in and password-reset.
// Runs entirely off the critical path — the user is already in the app.
//
// What it does:
//   1. Fetches users and progress rows IN PARALLEL (Promise.all)
//   2. Lazily creates missing rows WITHOUT blocking (fire-and-forget)
//   3. Merges the remote data into S and persists to localStorage
//   4. Re-renders the topbar + the active screen if anything changed
//
// If the whole thing fails (offline, cold-start), local state is
// already correct from the provisional identity applied before enterApp().
async function _syncProfileAndProgress(authId, email) {
  console.log('⏳ Background sync started for', authId);

  // ── Step 1: fetch both tables in parallel ─────────────────
  let userRows, progRows;
  try {
    [userRows, progRows] = await Promise.all([
      sbGet('users',    `?id=eq.${authId}&select=name,email`),
      sbGet('progress', `?user_id=eq.${authId}`)
    ]);
    console.log('✅ Background sync: users', userRows.length, '| progress', progRows.length);
  } catch (err) {
    console.warn('⚠️ Background sync fetch failed (non-fatal — local state kept):', err.message);
    return;
  }

  // ── Step 2: resolve profile (create row if missing) ───────
  let profile;
  if (userRows.length === 0) {
    const displayName = S.user?.name || email.split('@')[0];
    // Fire-and-forget: row creation is important but not critical-path
    sbUpsert('users', { id: authId, name: displayName, email }).catch(err =>
      console.warn('⚠️ Background users row creation failed:', err.message)
    );
    profile = { name: displayName, email };
    console.log('   → users row created in background:', displayName);
  } else {
    profile = userRows[0];
    console.log('   → existing users row loaded:', profile.name);
  }

  // ── Step 3: resolve progress (create row if missing) ──────
  let progData = null;
  if (progRows.length === 0) {
    // Seed with current local state so no progress is lost even if
    // the local→Supabase sync had previously failed.
    sbUpsert('progress', {
      user_id:        authId,
      xp:             S.xp              || 0,
      streak:         Math.max(0, Number(S.streak) || 0),
      streak_date:    S.streakDate      || null,
      completed_ids:  S.completedIds    || [],
      unlocked_ids:   S.unlockedIds     || [1],
      total_correct:  S.totalCorrect    || 0,
      total_answered: S.totalAnswered   || 0,
      tier:           S.user?.tier      || 'standard',
      daily_on:       S.dailyOn         || null,
      joined_date:    S.joinedDate      || new Date().toISOString(),
      avatar_color:   getAvatarColor(profile.name)
    }).catch(err =>
      console.warn('⚠️ Background progress row creation failed:', err.message)
    );
    console.log('   → progress row created in background from local state');
  } else {
    progData = progRows[0];
    console.log('   → existing progress row loaded');
  }

  // ── Step 4: merge remote data into S ──────────────────────
  // Snapshot current values so we can detect if anything actually changed
  const xpBefore   = S.xp;
  const nameBefore = S.user?.name;

  if (progData) {
    _mergeRemoteProgress(progData, authId, profile);
  } else {
    // No remote progress — just update name if it resolved to something better
    if (S.user && profile.name && profile.name !== S.user.name) {
      S.user.name = profile.name;
      S.user.email = profile.email;
    }
  }
  save();
  console.log('✅ Background sync complete');

  // ── Step 5: silent re-render — only if something changed ──
  // Always refresh the topbar (name or XP may have updated)
  if (typeof updateTopbar === 'function') updateTopbar();

  // Only re-render the currently visible screen — no blind full-refresh
  const activeId = document.querySelector('.screen.active')?.id;
  if (activeId === 'homeScreen'    && typeof updateHome          === 'function') updateHome();
  if (activeId === 'pathScreen'    && typeof renderPath          === 'function') renderPath();
  if (activeId === 'profileScreen' && typeof renderProfileScreen === 'function') renderProfileScreen();
  if (activeId === 'ranksScreen'   && typeof showRanks           === 'function') showRanks();
  if (document.getElementById('accountPageOverlay')?.classList.contains('open')
      && typeof openFinlingoAccount === 'function') {
    openFinlingoAccount();
  }
}


// ── BANNER HELPERS ────────────────────────────────────────────

function showAuthBanner(msg, type = 'error') {
  const banner = document.getElementById('authBanner');
  const msgEl  = document.getElementById('authBannerMsg');
  if (!banner || !msgEl) return;
  banner.className = 'auth-banner show ' + type;
  msgEl.onclick = null;
  msgEl.style.cursor = '';
  banner.querySelector('svg').innerHTML = type === 'success'
    ? '<polyline points="20 6 9 17 4 12"/>'
    : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
  msgEl.textContent = msg;
}

function hideAuthBanner() {
  const b = document.getElementById('authBanner');
  const msgEl  = document.getElementById('authBannerMsg');
  if (b) b.className = 'auth-banner';
  if (msgEl) {
    msgEl.onclick = null;
    msgEl.style.cursor = '';
  }
}


// ── FIELD VALIDATION HELPERS ──────────────────────────────────

function setFieldError(id, msg) {
  const input = document.getElementById(id);
  const errEl = document.getElementById(id + 'Err');
  if (input) { input.classList.add('error'); input.classList.remove('valid'); }
  if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
}

function clearFieldError(id) {
  const input = document.getElementById(id);
  const errEl = document.getElementById(id + 'Err');
  if (input) input.classList.remove('error');
  if (errEl) errEl.classList.remove('show');
}

function setFieldValid(id) {
  const input = document.getElementById(id);
  if (input) { input.classList.remove('error'); input.classList.add('valid'); }
  const errEl = document.getElementById(id + 'Err');
  if (errEl) errEl.classList.remove('show');
}

function clearAllFieldStates() {
  document.querySelectorAll('.field-input').forEach(i => i.classList.remove('error', 'valid'));
  document.querySelectorAll('.field-error').forEach(e => e.classList.remove('show'));
  hideAuthBanner();
}


// ── TAB SWITCH ────────────────────────────────────────────────

function switchAuthTab(m) {
  if (_authBusy) return;
  _resetAuthIntent();
  authMode = m;
  document.getElementById('tabSignIn').classList.toggle('active', m === 'signin');
  document.getElementById('tabCreate').classList.toggle('active', m === 'create');

  // Restore tab visibility in case we were in forgot/reset mode
  _setTabsVisible(true);

  // If switching away from the success screen back to the form
  // (e.g. user clicks "Go to Sign In" after signup), restore the form.
  document.getElementById('authSuccessScreen').classList.remove('show');
  document.getElementById('authFormWrap').style.display = '';
  _teardownResendConfirmation();   // stop any resend cooldown timer on the hidden screen

  clearAllFieldStates();
  renderAuthForm();
}

/**
 * Switch to the forgot-password form.
 * Does not affect the tab state — clicking either tab returns to signin/create.
 */
function switchToForgot() {
  if (_authBusy) return;
  _resetAuthIntent();
  authMode = 'forgot';
  _setTabsVisible(false);
  clearAllFieldStates();
  renderAuthForm();
}

/** Show or hide the sign-in / create-account tab bar. */
function _setTabsVisible(visible) {
  const tabRow = document.getElementById('authTabs')
               || document.querySelector('.auth-tabs')
               || document.querySelector('[role="tablist"]');
  if (tabRow) tabRow.style.visibility = visible ? '' : 'hidden';
}

function _isValidAuthEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function _isConnectivityAuthError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('failed to fetch')
    || msg.includes('network')
    || msg.includes('timeout')
    || msg.includes('offline')
    || msg.includes('could not connect');
}

function _authSubmitLabel() {
  if (authMode === 'create') return 'Create account';
  if (authMode === 'signin') return 'Sign in';
  if (authMode === 'forgot') return 'Send reset link';
  if (authMode === 'reset') return 'Set new password';
  return 'Continue';
}

function _isAuthFormComplete() {
  const email = document.getElementById('authEmail')?.value?.trim();
  const pass = document.getElementById('authPass')?.value || '';
  const pass2 = document.getElementById('authPass2')?.value || '';

  if (authMode === 'create') return _isValidAuthEmail(email) && pass.length >= 8 && pass === pass2;
  if (authMode === 'signin') return _isValidAuthEmail(email) && pass.length > 0;
  if (authMode === 'forgot') return _isValidAuthEmail(email);
  if (authMode === 'reset') return pass.length >= 8 && pass === pass2;
  return false;
}

function updateAuthSubmitState() {
  const btn = document.getElementById('authSubmitBtn');
  if (!btn || _authBusy) return;
  btn.disabled = !_isAuthFormComplete();
}

function handleAuthInput(id) {
  clearFieldError(id);
  updateAuthSubmitState();
}

function toggleAuthPassword(id) {
  const input = document.getElementById(id);
  const button = document.querySelector(`[data-password-toggle="${id}"]`);
  if (!input || !button) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  button.classList.toggle('is-visible', !showing);
}

function _passwordFieldMarkup(id, label, autocomplete, placeholder, onEnter) {
  return `
    <div class="field-wrap">
      <div class="field-label">${label}</div>
      <div class="auth-password-field">
        <input class="field-input" id="${id}" type="password"
          placeholder="${placeholder}" autocomplete="${autocomplete}"
          oninput="handleAuthInput('${id}')"
          ${onEnter ? `onkeydown="if(event.key==='Enter'){event.preventDefault();${onEnter}}"` : ''}/>
        <button class="auth-password-toggle" type="button" aria-label="Show password"
          data-password-toggle="${id}" onclick="toggleAuthPassword('${id}')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/>
            <circle cx="12" cy="12" r="2.5"/>
          </svg>
        </button>
      </div>
      <div class="field-error" id="${id}Err"></div>
    </div>`;
}

function _googleIconMarkup() {
  return `
    <svg class="google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h5.9c-.3 1.4-1 2.5-2.1 3.2v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/>
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.8l-3.5-2.7c-1 .6-2.2 1-3.8 1-2.9 0-5.3-1.9-6.1-4.5H2.3v2.8C4.1 20.5 7.8 23 12 23z"/>
      <path fill="#FBBC05" d="M5.9 14c-.2-.6-.4-1.3-.4-2s.1-1.4.4-2V7.2H2.3C1.5 8.6 1 10.2 1 12s.5 3.4 1.3 4.8L5.9 14z"/>
      <path fill="#EA4335" d="M12 5.5c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.5 2.2 15 1 12 1 7.8 1 4.1 3.5 2.3 7.2L5.9 10c.8-2.6 3.2-4.5 6.1-4.5z"/>
    </svg>`;
}

function _authCommonActionsMarkup(primaryHandler) {
  return `
    <button class="btn btn-primary auth-primary-btn" id="authSubmitBtn" type="button" onclick="${primaryHandler}" disabled>
      ${_authSubmitLabel()}
    </button>
    <div class="auth-divider">or</div>
    <button class="btn btn-outline auth-google-btn" type="button" onclick="continueWithGoogle()">
      ${_googleIconMarkup()}
      <span>Continue with Google</span>
    </button>`;
}


// ── RENDER FORM ───────────────────────────────────────────────

function renderAuthForm() {
  const form = document.getElementById('authForm');
  if (!form) return;
  _resetAuthIntent();
  document.getElementById('authSuccessScreen')?.classList.remove('show');
  const formWrap = document.getElementById('authFormWrap');
  if (formWrap) formWrap.style.display = '';
  hideAuthBanner();

  // ── RECOVERY SELF-HEAL ──────────────────────────────────────
  if (authMode !== 'reset') {
    const pendingToken = sessionStorage.getItem('finlingo_recovery_token');
    if (pendingToken) {
      console.log('🔑 renderAuthForm: re-applying recovery mode from sessionStorage');
      sessionStorage.removeItem('finlingo_recovery_token');
      _recoveryToken = pendingToken;
      authMode       = 'reset';
      _setTabsVisible(false);
    }
  }

  // ── CREATE ACCOUNT ──────────────────────────────────────────
  if (authMode === 'create') {
    form.innerHTML = `
      <div class="field-wrap">
        <div class="field-label">Email</div>
        <input class="field-input" id="authEmail" type="email"
          placeholder="jane@example.com" autocomplete="email"
          oninput="handleAuthInput('authEmail')"/>
        <div class="field-error" id="authEmailErr"></div>
      </div>
      ${_passwordFieldMarkup('authPass', 'Password', 'new-password', 'Password', "submitAuthWithIntent(event)")}
      <div class="auth-requirement">At least 8 characters</div>
      ${_passwordFieldMarkup('authPass2', 'Confirm password', 'new-password', 'Repeat password', "submitAuthWithIntent(event)")}
      ${_authCommonActionsMarkup('submitAuthWithIntent(event)')}
      <div class="auth-note">
        Already have an account?
        <a onclick="switchAuthTab('signin')">Sign in</a>
      </div>`;

  // ── SIGN IN ─────────────────────────────────────────────────
  } else if (authMode === 'signin') {
    form.innerHTML = `
      <div class="field-wrap">
        <div class="field-label">Email</div>
        <input class="field-input" id="authEmail" type="email"
          placeholder="your@email.com" autocomplete="email"
          oninput="handleAuthInput('authEmail')"/>
        <div class="field-error" id="authEmailErr"></div>
      </div>
      ${_passwordFieldMarkup('authPass', 'Password', 'current-password', 'Your password', "submitAuthWithIntent(event)")}
      <div class="auth-forgot-wrap">
        <a class="auth-forgot-link" onclick="switchToForgot()">Forgot password?</a>
      </div>
      ${_authCommonActionsMarkup('submitAuthWithIntent(event)')}
      <div class="auth-note">
        New to Finlingo?
        <a onclick="switchAuthTab('create')">Create account</a>
      </div>`;

  // ── FORGOT PASSWORD ─────────────────────────────────────────
  } else if (authMode === 'forgot') {
    form.innerHTML = `
      <div class="auth-note" style="margin-bottom:4px;">
        <a onclick="switchAuthTab('signin')" style="cursor:pointer;">← Back to sign in</a>
      </div>
      <p class="auth-note" style="margin-bottom:16px;color:var(--color-text-sub,#888);">
        Enter your email and we'll send you a link to reset your password.
      </p>
      <div class="field-wrap">
        <div class="field-label">Email</div>
        <input class="field-input" id="authEmail" type="email"
          placeholder="your@email.com" autocomplete="email"
          oninput="handleAuthInput('authEmail')"
          onkeydown="if(event.key==='Enter'){event.preventDefault();submitForgotPasswordWithIntent(event)}"/>
        <div class="field-error" id="authEmailErr"></div>
      </div>
      <button class="btn btn-primary auth-primary-btn" id="authSubmitBtn" type="button" onclick="submitForgotPasswordWithIntent(event)" disabled>
        Send reset link
      </button>`;

  // ── SET NEW PASSWORD (recovery link landing) ────────────────
  } else if (authMode === 'reset') {
    form.innerHTML = `
      <p class="auth-note" style="margin-bottom:16px;color:var(--color-text-sub,#888);">
        Choose a new password for your account.
      </p>
      ${_passwordFieldMarkup('authPass', 'New password', 'new-password', 'At least 8 characters', '')}
      <div class="auth-requirement">At least 8 characters</div>
      ${_passwordFieldMarkup('authPass2', 'Confirm new password', 'new-password', 'Repeat password', "submitResetPasswordWithIntent(event)")}
      <button class="btn btn-primary auth-primary-btn" id="authSubmitBtn" type="button" onclick="submitResetPasswordWithIntent(event)" disabled>
        Set new password
      </button>`;
  }

  updateAuthSubmitState();
  setTimeout(() => form.querySelector('.field-input')?.focus(), 80);
}

function setAuthButtonState(btn, busy, label) {
  _authBusy = busy;
  if (!btn) return;
  btn.innerHTML = busy ? `<span>${label}</span>` : label;
  btn.classList.toggle('btn-loading', busy);
  btn.disabled = busy || !_isAuthFormComplete();
}


// ── SHOW EMAIL VERIFICATION PENDING SCREEN ────────────────────
// Replaces the form with a "check your email" confirmation screen.
// Uses the existing #authSuccessScreen element in index.html.

function showVerifyEmailScreen(email) {
  _pendingSignupEmail = email || _pendingSignupEmail;

  const iconEl = document.querySelector('#authSuccessScreen .auth-success-icon svg');
  if (iconEl) {
    iconEl.innerHTML = '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>';
  }

  document.getElementById('authSuccessTitle').textContent = 'Check your email';
  document.getElementById('authSuccessSub').textContent   =
    `We sent a confirmation link to ${email}. Click it to activate your account, then return here to sign in. Check your spam or junk folder if it does not arrive.`;

  const btn = document.querySelector('#authSuccessScreen .btn');
  if (btn) {
    btn.innerHTML = `Go to Sign In ${FinLingoIcons.right()}`;
    btn.onclick     = () => {
      switchAuthTab('signin');
      setTimeout(() => {
        const emailInput = document.getElementById('authEmail');
        if (emailInput) { emailInput.value = email; clearFieldError('authEmail'); }
      }, 50);
    };
  }

  _mountResendConfirmation(email);

  document.getElementById('authFormWrap').style.display = 'none';
  document.getElementById('authSuccessScreen').classList.add('show');
}

// ── RESEND CONFIRMATION EMAIL ─────────────────────────────────
// Builds (once) the subtle secondary "Resend confirmation email" action and
// its inline status line beneath the primary "Go to Sign In" button, then
// wires up send → cooldown behaviour. Reuses existing nodes on re-entry.

function _mountResendConfirmation(email) {
  const screen = document.getElementById('authSuccessScreen');
  if (!screen) return;

  // Any countdown left over from a previous visit must not keep ticking.
  if (_resendCooldownTimer) { clearInterval(_resendCooldownTimer); _resendCooldownTimer = null; }

  let resendBtn = document.getElementById('authResendBtn');
  let msgEl     = document.getElementById('authResendMsg');

  if (!resendBtn) {
    resendBtn = document.createElement('button');
    resendBtn.id = 'authResendBtn';
    resendBtn.type = 'button';
    resendBtn.className = 'auth-resend-btn';
    screen.appendChild(resendBtn);
  }
  if (!msgEl) {
    msgEl = document.createElement('div');
    msgEl.id = 'authResendMsg';
    msgEl.className = 'auth-resend-msg';
    screen.appendChild(msgEl);
  }

  // Reset to the idle state every time the screen opens.
  resendBtn.disabled  = false;
  resendBtn.classList.remove('is-sent');
  resendBtn.textContent = 'Resend confirmation email';
  msgEl.textContent = '';
  msgEl.className = 'auth-resend-msg';
  resendBtn.onclick = () => _handleResendClick(email);
}

function _setResendMsg(msgEl, text, kind) {
  if (!msgEl) return;
  msgEl.textContent = text || '';
  msgEl.className = 'auth-resend-msg' + (text ? ' show' : '') + (kind ? ' ' + kind : '');
}

async function _handleResendClick(emailArg) {
  const resendBtn = document.getElementById('authResendBtn');
  const msgEl     = document.getElementById('authResendMsg');
  if (!resendBtn || resendBtn.disabled) return;   // guard against double-clicks

  const email = emailArg || _pendingSignupEmail;
  if (!email) {
    _setResendMsg(
      msgEl,
      'We lost track of your email. Please return to Create account and sign up again.',
      'error'
    );
    return;
  }

  // Disable + show pending. Prevents duplicate requests for the whole round-trip.
  resendBtn.disabled = true;
  resendBtn.classList.remove('is-sent');
  resendBtn.textContent = 'Sending…';
  _setResendMsg(msgEl, '', '');

  try {
    await authResendConfirmation(email);
  } catch (err) {
    // Failure: never claim success. Re-enable so the user can retry.
    console.error('Resend confirmation failed:', err);
    resendBtn.disabled = false;
    resendBtn.textContent = 'Resend confirmation email';

    let friendly;
    if (err.message === 'RESEND_RATE_LIMIT') {
      friendly = 'Too many requests right now. Please wait about a minute, then try again.';
    } else if (err.message === 'RESEND_NETWORK') {
      friendly = "Couldn't reach our email service. Check your connection and try again.";
    } else if (/already.*(confirmed|registered)|been confirmed/i.test(err.message)) {
      friendly = 'This email is already confirmed — you can go ahead and sign in.';
    } else {
      friendly = err.message || 'Something went wrong sending the email. Please try again.';
    }
    _setResendMsg(msgEl, friendly, 'error');
    return;
  }

  // Success: confirm calmly, then start the 60-second cooldown.
  resendBtn.classList.add('is-sent');
  resendBtn.textContent = 'Email sent';
  _setResendMsg(
    msgEl,
    `A new confirmation email was sent to ${email}. Check your inbox and spam folder.`,
    'success'
  );
  _startResendCooldown(60);
}

function _startResendCooldown(seconds) {
  const resendBtn = document.getElementById('authResendBtn');
  if (!resendBtn) return;

  if (_resendCooldownTimer) { clearInterval(_resendCooldownTimer); _resendCooldownTimer = null; }

  let remaining = seconds;
  resendBtn.disabled = true;
  resendBtn.classList.remove('is-sent');
  resendBtn.textContent = `Resend in ${remaining}s`;

  _resendCooldownTimer = setInterval(() => {
    remaining -= 1;
    // Bail if the screen was torn down mid-countdown.
    if (!document.getElementById('authResendBtn')) {
      clearInterval(_resendCooldownTimer); _resendCooldownTimer = null; return;
    }
    if (remaining <= 0) {
      clearInterval(_resendCooldownTimer); _resendCooldownTimer = null;
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend confirmation email';
      return;
    }
    resendBtn.textContent = `Resend in ${remaining}s`;
  }, 1000);
}

// Remove the resend action + countdown so it never bleeds into the
// password-reset or account-created variants of this shared screen.
function _teardownResendConfirmation() {
  if (_resendCooldownTimer) { clearInterval(_resendCooldownTimer); _resendCooldownTimer = null; }
  document.getElementById('authResendBtn')?.remove();
  document.getElementById('authResendMsg')?.remove();
}

function resetSuccessScreen() {
  _teardownResendConfirmation();

  const iconEl = document.querySelector('#authSuccessScreen .auth-success-icon svg');
  if (iconEl) iconEl.innerHTML = '<polyline points="20 6 9 17 4 12"/>';

  const btn = document.querySelector('#authSuccessScreen .btn');
  if (btn) {
    btn.innerHTML = `Get Started ${FinLingoIcons.right()}`;
    btn.onclick     = enterApp;
  }
}

/**
 * Show a "check your inbox" success screen after the reset email is sent.
 * Reuses the same #authSuccessScreen infrastructure as signup confirmation.
 */
function showForgotSuccessScreen(email) {
  _teardownResendConfirmation();
  const iconEl = document.querySelector('#authSuccessScreen .auth-success-icon svg');
  if (iconEl) {
    iconEl.innerHTML = '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>';
  }

  document.getElementById('authSuccessTitle').textContent = 'Check your email';
  document.getElementById('authSuccessSub').textContent   =
    `We sent a password reset link to ${email}. Click the link in that email to choose a new password.`;

  const btn = document.querySelector('#authSuccessScreen .btn');
  if (btn) {
    btn.innerHTML = `Back to Sign In ${FinLingoIcons.right()}`;
    btn.onclick     = () => switchAuthTab('signin');
  }

  document.getElementById('authFormWrap').style.display = 'none';
  document.getElementById('authSuccessScreen').classList.add('show');
}

function _restoreScreenBehindAccount() {
  const returnContext = _authReturnContext || {};
  const targetScreen = returnContext.screenId && document.getElementById(returnContext.screenId)
    ? returnContext.screenId
    : 'coachScreen';
  if (typeof setScreen === 'function') {
    setScreen(targetScreen, { preserveTransientLayers: true, resetScroll: false });
  } else {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(targetScreen)?.classList.add('active');
  }
  if (typeof setNav === 'function') {
    const navId = targetScreen === 'coachScreen'
      ? 'navCoach'
      : targetScreen === 'pathScreen'
        ? 'navPath'
        : targetScreen === 'marketScreen'
          ? 'navMarket'
          : null;
    setNav(navId);
  }
}

function finishSuccessfulAuth(message) {
  document.getElementById('authSuccessScreen')?.classList.remove('show');
  const authFormWrap = document.getElementById('authFormWrap');
  if (authFormWrap) authFormWrap.style.display = '';
  clearAllFieldStates();
  resetSuccessScreen();
  _setTabsVisible(true);

  const authScreen = document.getElementById('authScreen');
  authScreen?.classList.remove('active', 'auth-modal-open');
  document.body.classList.remove('auth-modal-visible', 'entry-gate-visible');

  _restoreScreenBehindAccount();
  if (typeof updateTopbar === 'function') updateTopbar();
  if (window.NavDrawer && typeof window.NavDrawer.refresh === 'function') window.NavDrawer.refresh();
  if (typeof openFinlingoAccount === 'function') openFinlingoAccount();
  _authReturnContext = null;
  if (message && typeof showToast === 'function') showToast(message, 'success');
}


// ── DO AUTH ───────────────────────────────────────────────────
// Main submit handler. Each step has its own try/catch so failures
// always show a specific message, never a vague "connection error".

async function doAuth() {
  if (!_consumeAuthIntent('auth')) return;
  clearAllFieldStates();

  const email = document.getElementById('authEmail')?.value?.trim().toLowerCase();
  const pass  = document.getElementById('authPass')?.value;
  const name  = document.getElementById('authName')?.value?.trim();
  const pass2 = document.getElementById('authPass2')?.value;
  const btn   = document.getElementById('authSubmitBtn');

  // ── CREATE ACCOUNT ────────────────────────────────────────
  if (authMode === 'create') {

    let valid = true;
    if (!_isValidAuthEmail(email))                              { setFieldError('authEmail', 'Enter a valid email address');            valid = false; }
    if (!pass  || pass.length < 8)                              { setFieldError('authPass',  'Password must be at least 8 characters'); valid = false; }
    if (pass && pass2 !== undefined && pass !== pass2)          { setFieldError('authPass2', 'Passwords do not match');                 valid = false; }
    if (!valid) return;

    if (_authBusy) return;
    setAuthButtonState(btn, true, 'Creating account…');

    let session;
    try {
      session = await authSignUp(email, pass);
    } catch (err) {
      setAuthButtonState(btn, false, 'Create account');
      console.error('❌ STAGE 1 authSignUp failed:', err);

      const msg = err.message.toLowerCase();
      const alreadyExists    = msg.includes('already') || msg.includes('registered') || msg.includes('exists');
      const isRateLimit      = err.message === 'SIGNUP_NETWORK_BLOCKED'
                             || msg.includes('rate limit')
                             || msg.includes('security purposes')
                             || msg.includes('too many');

      if (alreadyExists) {
        setFieldError('authEmail', 'This email is already registered');
        showAuthBanner(
          'This email is already registered. Check your inbox for a confirmation link, or sign in if you\'ve already verified.',
          'error'
        );
        const msgEl = document.getElementById('authBannerMsg');
        if (msgEl) {
          msgEl.style.cursor = 'pointer';
          msgEl.onclick = () => switchAuthTab('signin');
        }
      } else if (isRateLimit) {
        showAuthBanner(
          'Signup is temporarily blocked — Supabase limits confirmation emails to 3 per hour. Please wait a few minutes, then try again.',
          'error'
        );
      } else if (_isConnectivityAuthError(err)) {
        showAuthBanner("Couldn't connect. Try again.", 'error');
      } else {
        showAuthBanner('Could not create account: ' + err.message, 'error');
      }
      return;
    }

    setAuthButtonState(btn, false, 'Create account');
    console.log('✅ STAGE 1 authSignUp API call succeeded');

    if (!session.access_token) {
      console.log('✅ STAGE 2 confirmation email sent to:', email);
      if (name) localStorage.setItem('finlingo_pending_name', name);
      _pendingSignupEmail = email;   // source of truth for the Resend button
      showVerifyEmailScreen(email);
      return;
    }

    const authId = session.user?.id || session.id;
    if (!authId) {
      console.error('❌ STAGE 2 no authId in session:', session);
      showAuthBanner('Auth error: no user ID returned. Please try again.', 'error');
      return;
    }

    setStoredSession(session);
    console.log('✅ STAGE 2 token stored (email confirmation off), authId:', authId);

    const _localSnap = typeof loadAuthenticatedState === 'function'
      ? loadAuthenticatedState(email, authId)
      : loadState(email);
    const _resolvedName = name || _localSnap.user?.name || email.split('@')[0];
    S = { ..._localSnap };
    S.user = {
      id:          authId,
      name:        _resolvedName,
      email:       email,
      tier:        _localSnap.user?.tier || 'standard',
      avatarColor: _localSnap.user?.avatarColor || getAvatarColor(_resolvedName)
    };
    S.joinedDate = S.joinedDate || new Date().toISOString();
    save();

    try {
      await _initUserRows(authId, _resolvedName, email);
    } catch (err) {
      console.error('❌ STAGE 3 _initUserRows failed:', err);
      clearStoredSession();
      S.user = null;
      save();
      setAuthButtonState(btn, false, 'Create account');
      showAuthBanner('Could not finish creating your account. Please try again.', 'error');
      return;
    }

    finishSuccessfulAuth('Account created');


  // ── SIGN IN ───────────────────────────────────────────────
  } else {

    let valid = true;
    if (!_isValidAuthEmail(email)) { setFieldError('authEmail', 'Enter a valid email address'); valid = false; }
    if (!pass)  { setFieldError('authPass',  'Please enter your password');                       valid = false; }
    if (!valid) return;

    if (_authBusy) return;
    setAuthButtonState(btn, true, 'Signing in…');

    // ── STAGE 1: Authenticate (only unavoidable await) ────────
    let session;
    try {
      session = await authSignIn(email, pass);
    } catch (err) {
      setAuthButtonState(btn, false, 'Sign in');
      console.error('❌ STAGE 1 authSignIn failed:', err);

      const msg = err.message.toLowerCase();
      const isWrongPass   = msg.includes('invalid') || msg.includes('credentials');
      const isUnconfirmed = msg.includes('confirm') || msg.includes('not confirmed');

      if (isUnconfirmed && !isWrongPass) {
        showAuthBanner(
          'Your email has not been confirmed yet. Check your inbox for a verification link.',
          'error'
        );
      } else if (isWrongPass) {
        setFieldError('authPass', 'Incorrect email or password');
        showAuthBanner('Incorrect email or password.', 'error');
      } else if (_isConnectivityAuthError(err)) {
        showAuthBanner("Couldn't connect. Try again.", 'error');
      } else {
        showAuthBanner('Sign-in error: ' + err.message, 'error');
      }
      return;
    }

    const authId = session.user?.id;
    if (!authId) {
      setAuthButtonState(btn, false, 'Sign in');
      console.error('❌ STAGE 1 no authId in session:', session);
      showAuthBanner('Auth error: no user ID returned. Please try again.', 'error');
      return;
    }

    // ── STAGE 2: Store token + apply provisional state ────────
    // This is all synchronous and instant. We use what we already know:
    //   - authId from the JWT response
    //   - name from the pending localStorage key (set at signup) or email prefix
    //   - local progress from localStorage (already loaded in S on boot)
    // The user gets into the app on this state immediately.
    setStoredSession(session);

    const _pendingName = localStorage.getItem('finlingo_pending_name') || null;
    localStorage.removeItem('finlingo_pending_name');

    const _localSnap = typeof loadAuthenticatedState === 'function'
      ? loadAuthenticatedState(email, authId)
      : loadState(email);
    S = { ..._localSnap };
    S.user = {
      id:          authId,
      name:        _pendingName || _localSnap.user?.name || email.split('@')[0],
      email:       email,
      tier:        _localSnap.user?.tier        || 'standard',
      avatarColor: _localSnap.user?.avatarColor || getAvatarColor(_pendingName || email.split('@')[0])
    };
    S.joinedDate = S.joinedDate || new Date().toISOString();
    save();

    // ── STAGE 3: Return to Account NOW ────────────────────────
    // Profile + progress sync silently in the background and re-render
    // without interrupting the updated Account page.
    setAuthButtonState(btn, false, 'Sign in');
    resetSuccessScreen();
    finishSuccessfulAuth(`Welcome back, ${S.user.name.split(' ')[0]}!`);

    // ── STAGE 4: Background sync (non-blocking) ───────────────
    // Fetches users + progress in parallel, creates missing rows
    // fire-and-forget, merges remote data, and silently refreshes UI.
    _syncProfileAndProgress(authId, email).catch(() => {});
  }
}


// ── FORGOT PASSWORD SUBMIT ────────────────────────────────────

async function doForgotPassword() {
  if (!_consumeAuthIntent('forgot')) return;
  clearAllFieldStates();

  const email = document.getElementById('authEmail')?.value?.trim().toLowerCase();
  const btn   = document.getElementById('authSubmitBtn');

  if (!_isValidAuthEmail(email)) {
    setFieldError('authEmail', 'Enter a valid email address');
    return;
  }

  if (_authBusy) return;
  setAuthButtonState(btn, true, 'Sending…');

  try {
    await authRequestPasswordReset(email);
    console.log('✅ doForgotPassword: reset email requested for', email);
  } catch (err) {
    setAuthButtonState(btn, false, 'Send reset link');
    console.error('❌ doForgotPassword failed:', err);

    const isRateLimit = err.message === 'RESET_EMAIL_RATE_LIMIT'
                      || err.message.toLowerCase().includes('rate limit')
                      || err.message.toLowerCase().includes('security purposes')
                      || err.message.toLowerCase().includes('too many');

    if (isRateLimit) {
      showAuthBanner(
        'Too many reset emails sent. Supabase allows 3 per hour — please wait at least 1 hour before requesting another.',
        'error'
      );
    } else if (_isConnectivityAuthError(err)) {
      showAuthBanner("Couldn't connect. Try again.", 'error');
    } else {
      showAuthBanner('Could not send reset email: ' + err.message, 'error');
    }
    return;
  }

  setAuthButtonState(btn, false, 'Send reset link');
  _setTabsVisible(true);
  showForgotSuccessScreen(email);
}


// ── RESET PASSWORD SUBMIT ─────────────────────────────────────

async function doResetPassword() {
  if (!_consumeAuthIntent('reset')) return;
  clearAllFieldStates();

  const pass  = document.getElementById('authPass')?.value;
  const pass2 = document.getElementById('authPass2')?.value;
  const btn   = document.getElementById('authSubmitBtn');

  if (!_recoveryToken) {
    showAuthBanner(
      'Your reset link has expired. Please request a new one.',
      'error'
    );
    setTimeout(() => switchToForgot(), 2500);
    return;
  }

  let valid = true;
  if (!pass || pass.length < 8)  { setFieldError('authPass',  'Password must be at least 8 characters'); valid = false; }
  if (pass && pass !== pass2)    { setFieldError('authPass2', 'Passwords do not match');                  valid = false; }
  if (!valid) return;

  if (_authBusy) return;
  setAuthButtonState(btn, true, 'Saving…');

  let session;
  try {
    session = await authUpdatePassword(_recoveryToken, pass);
    _recoveryToken = null;
    console.log('✅ doResetPassword: password updated');
  } catch (err) {
    setAuthButtonState(btn, false, 'Set new password');
    console.error('❌ doResetPassword failed:', err);

    const msg = err.message.toLowerCase();
    if (msg.includes('expired') || msg.includes('invalid') || msg.includes('jwt')) {
      _recoveryToken = null;
      showAuthBanner(
        'Your reset link has expired. Please request a new one.',
        'error'
      );
      setTimeout(() => switchToForgot(), 2500);
    } else {
      showAuthBanner(_isConnectivityAuthError(err) ? "Couldn't connect. Try again." : 'Could not update password: ' + err.message, 'error');
    }
    return;
  }

  if (session?.access_token) {
    setStoredSession(session);
    console.log('✅ doResetPassword: session stored, entering app');

    const authId = session.user?.id;

    // Apply provisional identity from local state immediately
    if (authId) {
      const _localSnap = typeof loadAuthenticatedState === 'function'
        ? loadAuthenticatedState(session.user?.email || null, authId)
        : loadState(session.user?.email || null);
      const _resolvedName = _localSnap.user?.name || session.user?.email?.split('@')[0] || 'there';
      S = { ..._localSnap };
      S.user = {
        id:          authId,
        name:        _resolvedName,
        email:       session.user?.email   || _localSnap.user?.email || '',
        tier:        _localSnap.user?.tier        || 'standard',
        avatarColor: _localSnap.user?.avatarColor || getAvatarColor(_resolvedName)
      };
      S.joinedDate = S.joinedDate || new Date().toISOString();
      save();
    }

    _setTabsVisible(true);
    resetSuccessScreen();
    setAuthButtonState(btn, false, 'Set new password');
    finishSuccessfulAuth('Password updated. Welcome back!');

    // Background sync — same as regular sign-in
    if (authId) {
      _syncProfileAndProgress(authId, session.user?.email || '').catch(() => {});
    }

  } else {
    setAuthButtonState(btn, false, 'Set new password');
    showAuthBanner('Password updated. Please sign in with your new password.', 'success');
    setTimeout(() => switchAuthTab('signin'), 2000);
  }
}


// ── HELPER: Create users + progress rows ──────────────────────
// Used by the signup flow when email confirmation is OFF.
// When email confirmation is ON, this never runs during signup —
// the rows are created lazily on first verified sign-in instead.

async function _initUserRows(authId, name, email) {
  try {
    await sbUpsert('users', { id: authId, name, email });
    console.log('✅ _initUserRows: users row created');
  } catch (err) {
    console.error('❌ _initUserRows: users row failed:', err.message);
    throw err;
  }

  try {
    await sbUpsert('progress', {
      user_id:        authId,
      xp:             0,
      streak:         0,
      streak_date:    null,
      completed_ids:  [],
      unlocked_ids:   [1],
      total_correct:  0,
      total_answered: 0,
      tier:           'standard',
      daily_on:       null,
      joined_date:    new Date().toISOString(),
      avatar_color:   getAvatarColor(name)
    });
    console.log('✅ _initUserRows: progress row created');
  } catch (err) {
    console.error('❌ _initUserRows: progress row failed:', err.message);
    throw err;
  }
}


// ── GUEST LOGIN ───────────────────────────────────────────────
// Local-only — no Supabase call, no token stored.

function guestLogin() {
  S            = normalizeState();
  S.user       = { name: 'Guest', email: null, tier: 'standard', avatarColor: '#1a1a1a' };
  S.joinedDate = new Date().toISOString();
  S.streak     = 0;
  S.streakDate = null;
  save();
  enterApp();
  showToast('Continue as guest');
}


// ── ENTER APP ─────────────────────────────────────────────────

function enterApp() {
  document.getElementById('authSuccessScreen')?.classList.remove('show');
  const authFormWrap = document.getElementById('authFormWrap');
  if (authFormWrap) authFormWrap.style.display = '';
  clearAllFieldStates();
  resetSuccessScreen();
  _setTabsVisible(true);
  document.getElementById('authScreen')?.classList.remove('active', 'auth-modal-open');
  document.body.classList.remove('auth-modal-visible');
  const mainTopbar = document.getElementById('mainTopbar');
  if (mainTopbar) mainTopbar.style.display = 'block';
  // Onboarding removed — go straight to the default screen.
  if (typeof enterWorkspaceShell === 'function') enterWorkspaceShell();
  if (typeof showHome === 'function') showHome();
}


// ── RECOVERY TOKEN DETECTION (runs once on page load) ─────────

// Check immediately (synchronous) — before ANY boot sequence runs.
// Also backs up the token to sessionStorage so the boot sequence
// can't lose it by re-rendering the auth form.
(function detectRecoveryToken() {
  if (!window.location.hash) return;

  const params = new URLSearchParams(window.location.hash.replace('#', '?'));
  const type   = params.get('type');
  const token  = params.get('access_token');

  if (type === 'recovery' && token) {
    console.log('🔑 Recovery token detected — applying reset mode');

    // Set module variables immediately (synchronous, before any boot code runs).
    // This is the primary mechanism — no dependency on app.js calling anything.
    _recoveryToken = token;
    authMode       = 'reset';

    // Scrub sensitive tokens from the address bar immediately
    history.replaceState(null, '', window.location.pathname + window.location.search);

    // sessionStorage is a safety net: if app.js later calls switchAuthTab('signin')
    // and overrides authMode, the self-heal in renderAuthForm() will re-apply it.
    sessionStorage.setItem('finlingo_recovery_token', token);
  }
})();

(function detectOAuthSession() {
  if (!window.location.hash) return;
  const params = new URLSearchParams(window.location.hash.replace('#', '?'));
  if (params.get('type') === 'recovery') return;
  const accessToken = params.get('access_token');
  if (!accessToken) return;
  setStoredSession({
    access_token: accessToken,
    refresh_token: params.get('refresh_token') || '',
    expires_in: Number(params.get('expires_in')) || 3600
  });
  history.replaceState(null, '', window.location.pathname + window.location.search);
})();

// Called by app.js (or wherever you show the auth screen on boot)
// to check if we should be in reset mode rather than sign-in mode.
function checkAndApplyRecoveryMode() {
  const token = sessionStorage.getItem('finlingo_recovery_token');
  if (!token) return false;

  sessionStorage.removeItem('finlingo_recovery_token'); // one-time use
  _recoveryToken = token;
  authMode = 'reset';
  _setTabsVisible(false);
  renderAuthForm();
  console.log('✅ Reset mode applied from sessionStorage');
  return true;
}
