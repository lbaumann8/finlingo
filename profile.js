// ============================================================
// profile.js
// Everything that runs on the Profile screen:
//
//   getInitials(name)    — "Jane Smith" → "JS"
//   getAvatarColor(name) — deterministic colour from name
//   renderProfileScreen() — populate all profile fields
//   showProfile(tab)     — navigate to profile screen
//   switchProfileTab(tab) — switch Account / Progress / Membership
//   renderMembership()   — update tier cards and buttons
//   selectTier(tier)     — confirm upgrade / downgrade modal
//   openEditSheet(mode)  — slide-up editor (name/email/password/avatar)
//   selectAvatarColor(c) — update avatar colour preview
//   closeEditSheet(e)    — dismiss the edit sheet
//   saveEdit()           — persist edits to state
//   confirmReset()       — modal to wipe progress
//   signOut()            — modal to sign out
//
// Depends on: state.js, ui.js (setScreen, setNav, showToast, showAppModal, closeAppModal)
//             data.js (UNITS_DEF)
// ============================================================

// Tracks which field is being edited in the bottom sheet
let editMode = null;
let pendingAvatarColor = null;
const DEV_MODE_STORAGE_KEY = 'finlingo_profile_dev_mode';
const DEV_GRANT_CASH_AMOUNT = 100000;
const DEV_GRANT_XP_AMOUNT = 15000;

function isDeveloperEnvironment() {
  const protocol = window.location.protocol;
  const host = window.location.hostname;
  return protocol === 'file:' || host === 'localhost' || host === '127.0.0.1';
}

function isDeveloperModeEnabled() {
  return isDeveloperEnvironment() && localStorage.getItem(DEV_MODE_STORAGE_KEY) === '1';
}

function setDeveloperModeEnabled(enabled) {
  if (!isDeveloperEnvironment()) return;
  if (enabled) {
    localStorage.setItem(DEV_MODE_STORAGE_KEY, '1');
  } else {
    localStorage.removeItem(DEV_MODE_STORAGE_KEY);
  }
  renderProfileScreen();
}

function toggleDeveloperMode() {
  setDeveloperModeEnabled(!isDeveloperModeEnabled());
}

function _resetDeveloperStreakTransientState({ clearRepair = true } = {}) {
  if (typeof queueResultStreakCelebration === 'function') {
    queueResultStreakCelebration({ changed: false });
  }
  if (typeof clearPendingResultStreakCelebration === 'function') {
    clearPendingResultStreakCelebration();
  }
  if (typeof _streakRepairPromptTimer !== 'undefined' && _streakRepairPromptTimer) {
    clearTimeout(_streakRepairPromptTimer);
    _streakRepairPromptTimer = null;
  }
  if (clearRepair) {
    if (typeof _setStreakRepairState === 'function') _setStreakRepairState(null);
    sessionStorage.removeItem('finlingo_streak_repair_pending');
  }
}

function _commitDeveloperStateChange(successMessage) {
  save();
  renderProfileScreen();
  if (typeof updateTopbar === 'function') updateTopbar();
  if (typeof updateHome === 'function') updateHome();
  if (successMessage) showToast(successMessage, 'success');
}

function _setDeveloperStreakState(nextStreak, nextDate, { clearRepair = true } = {}) {
  if (!isDeveloperModeEnabled()) return;
  _resetDeveloperStreakTransientState({ clearRepair });
  const normalizedStreak = Math.max(0, Math.round(Number(nextStreak) || 0));
  S.streak = normalizedStreak;
  S.streakDate = normalizedStreak > 0 ? nextDate : null;
  S.lastLessonDate = normalizedStreak > 0 ? nextDate : null;
}

function addDeveloperStreakDay() {
  if (!isDeveloperModeEnabled()) return;
  const current = Math.max(0, Number(S.streak) || 0);
  _setDeveloperStreakState(current + 1, today());
  _commitDeveloperStateChange(`Streak set to ${S.streak} day${S.streak === 1 ? '' : 's'}`);
}

function resetDeveloperStreak() {
  if (!isDeveloperModeEnabled()) return;
  _setDeveloperStreakState(0, null);
  _commitDeveloperStateChange('Streak reset to 0');
}

function setDeveloperStreak(days) {
  if (!isDeveloperModeEnabled()) return;
  const target = Math.max(0, Math.round(Number(days) || 0));
  _setDeveloperStreakState(target, today());
  _commitDeveloperStateChange(`Streak set to ${target} day${target === 1 ? '' : 's'}`);
}

function simulateDeveloperMissedDay() {
  if (!isDeveloperModeEnabled()) return;
  const current = Math.max(0, Number(S.streak) || 0);
  if (!current) {
    showToast('Set an active streak first, then simulate a missed day.', 'error');
    return;
  }
  const twoDaysAgo = typeof _getOffsetDate === 'function' ? _getOffsetDate(-2) : today();
  _setDeveloperStreakState(current, twoDaysAgo, { clearRepair: true });
  _commitDeveloperStateChange('Missed-day state prepared. Open Home to test repair.');
}

function triggerDeveloperStreakPopup() {
  if (!isDeveloperModeEnabled()) return;
  _resetDeveloperStreakTransientState({ clearRepair: false });
  const current = Math.max(0, Number(S.streak) || 0);
  const variant = current === 0
    ? 'default'
    : current === 1
      ? 'started'
      : 'continued';
  if (typeof openStreakModal === 'function') {
    openStreakModal({ variant, streakValue: current });
  }
}

function _renderDeveloperTools() {
  const section = document.getElementById('profileDevSection');
  const card = document.getElementById('profileDevCard');
  if (!section || !card) return;
  section.style.display = 'none';
  card.innerHTML = '';
}

function grantDeveloperCash() {
  if (!isDeveloperModeEnabled()) return;
  const beforeNetWorth = typeof getPortfolioNetWorth === 'function' ? getPortfolioNetWorth() : 0;
  const granted = typeof applyCash === 'function'
    ? applyCash(DEV_GRANT_CASH_AMOUNT)
    : DEV_GRANT_CASH_AMOUNT;
  if (typeof applyCash !== 'function') {
    S.cash = (S.cash || 0) + granted;
  }
  const promotion = typeof checkPromotion === 'function'
    ? checkPromotion({
        beforeNetWorth,
        afterNetWorth: typeof getPortfolioNetWorth === 'function' ? getPortfolioNetWorth() : beforeNetWorth
      })
    : null;
  save();
  renderProfileScreen();
  if (typeof updateTopbar === 'function') updateTopbar();
  if (typeof renderMarket === 'function') renderMarket();
  showToast(`Granted $${granted.toLocaleString()} cash`, 'success');
  if (promotion && typeof showRankPromotion === 'function') {
    setTimeout(() => showRankPromotion(promotion.beforeLevel, promotion.afterLevel, promotion), 120);
  }
}

function grantDeveloperXp() {
  if (!isDeveloperModeEnabled()) return;
  const beforeXp = S.xp || 0;
  const granted = typeof applyXp === 'function'
    ? applyXp(DEV_GRANT_XP_AMOUNT)
    : DEV_GRANT_XP_AMOUNT;
  if (typeof applyXp !== 'function') {
    S.xp = beforeXp + granted;
  }
  save();
  renderProfileScreen();
  if (typeof updateTopbar === 'function') updateTopbar();
  if (typeof updateHome === 'function') updateHome();
  if (typeof renderMarket === 'function') renderMarket();
  showToast(`Granted ${granted.toLocaleString()} XP`, 'success');
}


// ── AVATAR HELPERS ────────────────────────────────────────────

/**
 * Extract initials from a display name.
 * "Jane Smith" → "JS",  "Madonna" → "MA"
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

/**
 * Pick a deterministic dark colour based on the user's name.
 * Same name always → same colour (stable across page reloads).
 */
function getAvatarColor(name) {
  const colours = ['#1a1a2e','#16213e','#0f3460','#1b4332','#2d3a1e','#3b2f2f','#2c2c54','#1a1a1a'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = (name || '').charCodeAt(i) + ((hash << 5) - hash);
  }
  return colours[Math.abs(hash) % colours.length];
}


// ── FINANCIAL CONFIDENCE CARD ─────────────────────────────────
// The headline of the Progress tab: a 0–100 score, an overall stage, and a
// per-skill breakdown. Mature and encouraging — no points, badges, or XP.
function renderConfidenceScoreCard(confidence) {
  const el = document.getElementById('confidenceScoreCard');
  if (!el) return;
  const c = confidence || (typeof getFinancialConfidence === 'function' ? getFinancialConfidence() : null);
  if (!c) { el.innerHTML = ''; return; }

  const rows = c.categories.map(cat => `
    <div class="confidence-cat-row">
      <div class="confidence-cat-head">
        <span class="skill-name">${cat.label}</span>
        <span class="skill-status skill-status-${cat.statusKey}">${cat.statusLabel}</span>
      </div>
      <div class="skill-track"><div class="skill-fill skill-fill-${cat.statusKey}" style="width:${Math.max(cat.score, cat.completed > 0 ? 8 : 0)}%;"></div></div>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="confidence-card">
      <div class="confidence-card-head">
        <div class="confidence-score-block">
          <span class="confidence-score-value">${c.score}</span>
          <span class="confidence-score-max">/ 100</span>
        </div>
        <div class="confidence-score-meta">
          <div class="confidence-score-kicker">Financial Confidence</div>
          <div class="confidence-score-status confidence-score-status-${c.statusKey}">${c.statusLabel}</div>
        </div>
      </div>
      <div class="confidence-score-track"><div class="confidence-score-fill" style="width:${c.score}%;"></div></div>
      <div class="confidence-score-blurb">${c.blurb}</div>
      <div class="confidence-cat-list">${rows}</div>
    </div>`;
}

// ── RENDER PROFILE SCREEN ─────────────────────────────────────
// Populates every dynamic element on the profile screen.

function renderProfileScreen() {
  {
  const name = S.user?.name || 'Guest';
  const email = S.user?.email || null;
  const initials = getInitials(name);
  const bgColor = S.user?.avatarColor || getAvatarColor(name);
  const completedCount = Array.isArray(S.completedIds) ? S.completedIds.length : 0;
  const reviewedCount = S.mastery && typeof S.mastery === 'object'
    ? Object.keys(S.mastery).length
    : 0;
  const dueReviewCount = typeof getDueReviews === 'function'
    ? getDueReviews(50).length
    : 0;
  const accuracy = S.totalAnswered
    ? `${Math.round((S.totalCorrect / S.totalAnswered) * 100)}%`
    : '—';

  document.getElementById('avatarRing').style.background = bgColor;
  document.getElementById('avatarInitials').textContent = initials;
  document.getElementById('profileNameDisplay').textContent = name;
  document.getElementById('profileEmailDisplay').textContent = email || 'No email set';

  const _confidence = typeof getFinancialConfidence === 'function'
    ? getFinancialConfidence()
    : null;
  const profileBadge = document.getElementById('profileLevelBadge');
  if (profileBadge) {
    profileBadge.textContent = _confidence
      ? `Financial confidence · ${_confidence.statusLabel}`
      : 'Learning profile';
    profileBadge.style.background = 'var(--bg3)';
    profileBadge.style.color = 'var(--text)';
    profileBadge.title = _confidence ? _confidence.blurb : '';
  }
  const boost = document.getElementById('profileBoostBadge');
  if (boost) {
    boost.innerHTML = _confidence
      ? `<div style="margin-top:10px;width:100%;max-width:280px;">
           <div style="height:6px;border-radius:999px;background:var(--bg3);overflow:hidden;">
             <div style="height:100%;width:${_confidence.score}%;background:var(--green);border-radius:999px;transition:width .4s ease;"></div>
           </div>
           <div style="margin-top:7px;font-family:var(--font-m);font-size:0.6rem;color:var(--muted2);text-align:center;letter-spacing:0.02em;">
             Confidence score ${_confidence.score} / 100 · ${_confidence.completedLessons} of ${_confidence.totalLessons} lessons
           </div>
         </div>`
      : '';
  }
  renderConfidenceScoreCard(_confidence);

  const statXp = document.getElementById('pstatXp');
  const statStreak = document.getElementById('pstatStreak');
  const statAcc = document.getElementById('pstatAcc');
  const statCash = document.getElementById('pstatCash');
  if (statXp) statXp.textContent = completedCount;
  if (statStreak) statStreak.textContent = reviewedCount;
  if (statAcc) statAcc.textContent = accuracy;
  if (statCash) statCash.textContent = dueReviewCount;

  document.getElementById('pRowName').textContent = name;
  const emailEl = document.getElementById('pRowEmail');
  if (email) {
    emailEl.textContent = email;
    emailEl.classList.remove('placeholder');
  } else {
    emailEl.textContent = 'Not set';
    emailEl.classList.add('placeholder');
  }
  const joined = S.joinedDate
    ? new Date(S.joinedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'This session';
  document.getElementById('pRowJoined').textContent = joined;

  const masterySummary = typeof getMasterySummary === 'function' ? getMasterySummary() : null;
  const masteryEl = document.getElementById('masterySummaryCard');
  if (masteryEl) {
    const weakest = masterySummary?.weakestTopics || [];
    masteryEl.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:14px 16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">
          <div>
            <div style="font-family:var(--font-m);font-size:0.58rem;color:var(--muted2);text-transform:uppercase;letter-spacing:0.08em;">Review</div>
            <div style="font-family:var(--font-d);font-size:1.05rem;font-weight:700;color:var(--text);margin-top:3px;">
              ${completedCount} lessons completed
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--font-m);font-size:0.8rem;font-weight:700;color:var(--green-text);">${dueReviewCount}</div>
            <div style="font-family:var(--font-m);font-size:0.56rem;color:var(--muted2);text-transform:uppercase;">Reviews due</div>
          </div>
        </div>
        <div style="margin-top:10px;font-family:var(--font-m);font-size:0.64rem;color:var(--muted2);line-height:1.5;">
          ${weakest.length
            ? `Topics to revisit: ${weakest.map(topic => topic.label || topic.topicId).join(' · ')}`
            : 'Finish a few lessons to start building your review history.'}
        </div>
      </div>`;
  }
  if (typeof renderFinanceFluencyProfileCard === 'function') {
    renderFinanceFluencyProfileCard();
  }

  const container = document.getElementById('unitProgressList');
  if (container) {
    container.innerHTML = UNITS_DEF.map(unit => {
      const lessons = typeof getUnitLessons === 'function' ? getUnitLessons(unit) : [];
      const total = lessons.length || (unit.range[1] - unit.range[0] + 1);
      const done = S.completedIds.filter(id => id >= unit.range[0] && id <= unit.range[1]).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return `<div class="prog-row">
        <div class="prog-head">
          <span class="prog-name">${unit.name}</span>
          <span class="prog-pct">${done}/${total}</span>
        </div>
        <div class="prog-track">
          <div class="prog-fill ${pct === 100 ? 'done' : ''}" style="width:${pct}%"></div>
        </div>
      </div>`;
    }).join('');
  }

  _renderDeveloperTools();
  return;
  }

  const levelSummary = typeof getLevelProgress === 'function' ? getLevelProgress(S.xp) : null;
  const name     = S.user?.name  || 'Guest';
  const email    = S.user?.email || null;
  const initials = getInitials(name);
  const bgColor  = S.user?.avatarColor || getAvatarColor(name);
  const boostMeta = getCompoundingBoostMeta();
  const careerSummary = typeof getCareerRankSummary === 'function' ? getCareerRankSummary() : null;
  const masterySummary = typeof getMasterySummary === 'function' ? getMasterySummary() : null;

  // ── Avatar ──────────────────────────────────────────────
  document.getElementById('avatarRing').style.background   = bgColor;
  document.getElementById('avatarInitials').textContent    = initials;
  document.getElementById('profileNameDisplay').textContent = name;
  document.getElementById('profileEmailDisplay').textContent = email || 'No email set';
  // Rank badge — colored by RANK_META
  const _lbColor = boostMeta.multiplier > 1 ? 'var(--green)' : 'var(--bg3)';
  const _lbEl    = document.getElementById('profileLevelBadge');
  if (_lbEl) {
    _lbEl.textContent    = `Level ${levelSummary?.level || 1}`;
    _lbEl.style.background = _lbColor;
    _lbEl.style.color      = '#fff';
    _lbEl.title = 'Current Level';
  }
  const _boostEl = document.getElementById('profileBoostBadge');
  if (_boostEl) {
    _boostEl.innerHTML = typeof renderCompoundingBoostMarkup === 'function'
      ? renderCompoundingBoostMarkup(boostMeta)
      : '';
  }

  // ── Stats row ────────────────────────────────────────────
  document.getElementById('pstatXp').textContent     = S.xp;
  document.getElementById('pstatStreak').textContent = S.streak;

  const _pstatAcc = document.getElementById('pstatAcc');
  const _pstatAccLabel = _pstatAcc ? _pstatAcc.parentElement.querySelector('.pstat-label') : null;
  if (S.totalAnswered) {
    if (_pstatAcc) _pstatAcc.textContent = Math.round((S.totalCorrect / S.totalAnswered) * 100) + '%';
    if (_pstatAccLabel) _pstatAccLabel.textContent = 'Accuracy';
  } else {
    if (_pstatAcc) _pstatAcc.textContent = '—';
    if (_pstatAccLabel) _pstatAccLabel.textContent = 'No quizzes yet';
  }
  const _pstatCash = document.getElementById('pstatCash');
  if (_pstatCash) _pstatCash.textContent = `$${S.cash || 0}`;

  // ── Account rows ──────────────────────────────────────────
  document.getElementById('pRowName').textContent = name;
  const emailEl = document.getElementById('pRowEmail');
  if (email) {
    emailEl.textContent = email;
    emailEl.classList.remove('placeholder');
  } else {
    emailEl.textContent = 'Not set';
    emailEl.classList.add('placeholder');
  }

  // Joined date
  const joined = S.joinedDate
    ? new Date(S.joinedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'This session';
  document.getElementById('pRowJoined').textContent = joined;

  // ── Theme row ─────────────────────────────────────────────
  const _themeRow = document.getElementById('pRowTheme');
  const _themeBtn = document.getElementById('themeToggleBtn');
  const _isLight  = document.body.dataset.theme === 'light';
  if (_themeRow) _themeRow.textContent = _isLight ? 'Light' : 'Dark';
  if (_themeBtn) _themeBtn.textContent = _isLight ? 'Dark mode' : 'Light mode';

  // ── MOMENTUM SECTION ──────────────────────────────────────
  const _streak = S.streak || 0;

  // Streak value row
  const _pRowStreak = document.getElementById('pRowStreak');
  if (_pRowStreak) {
    _pRowStreak.textContent = `${_streak} day${_streak !== 1 ? 's' : ''}`;
    _pRowStreak.style.color = _streak >= 7 ? 'var(--gold-text)' : '';
  }

  // Streak status chip (on fire / active / building)
  const _chipEl = document.getElementById('streakStatusChip');
  if (_chipEl) {
    if (_streak >= 30) {
      _chipEl.innerHTML = `<span style="font-family:var(--font-m);font-size:0.58rem;font-weight:600;letter-spacing:0.08em;
        padding:2px 8px;border-radius:var(--radius-pill);background:var(--green-dim);color:var(--green-text);
        border:1px solid var(--green-dim);">Max</span>`;
    } else if (_streak >= 7) {
      _chipEl.innerHTML = `<span style="font-family:var(--font-m);font-size:0.58rem;font-weight:600;letter-spacing:0.08em;
        padding:2px 8px;border-radius:var(--radius-pill);background:var(--gold-dim);color:var(--gold-text);
        border:1px solid var(--gold-dim);">Hot</span>`;
    } else if (_streak >= 3) {
      _chipEl.innerHTML = `<span style="font-family:var(--font-m);font-size:0.58rem;font-weight:600;letter-spacing:0.08em;
        padding:2px 8px;border-radius:var(--radius-pill);background:var(--bg3);color:var(--muted);
        border:1px solid var(--border);">Active</span>`;
    } else {
      _chipEl.innerHTML = '';
    }
  }

  // Streak milestone progress bar
  const _milestones = [7, 14, 30];
  const _nextMilestone = _milestones.find(m => _streak < m) || null;
  const _prevMilestone = _milestones.filter(m => _streak >= m).pop() || 0;
  const _barEl  = document.getElementById('streakProgressBar');
  const _lblEl  = document.getElementById('streakNextLabel');
  const _pctEl  = document.getElementById('streakNextPct');
  if (_barEl && _nextMilestone) {
    const _pct = Math.round(((_streak - _prevMilestone) / (_nextMilestone - _prevMilestone)) * 100);
    _barEl.style.width = _pct + '%';
    if (_lblEl) _lblEl.textContent = `Next: ${_nextMilestone}-day milestone`;
    if (_pctEl) _pctEl.textContent = `${_streak}/${_nextMilestone}`;
  } else if (_barEl) {
    _barEl.style.width = '100%';
    if (_lblEl) _lblEl.textContent = 'All milestones reached';
    if (_pctEl) _pctEl.textContent = '';
  }

  const _masteryEl = document.getElementById('masterySummaryCard');
  if (_masteryEl) {
    const weakest = masterySummary?.weakestTopics || [];
    _masteryEl.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:14px;
        padding:14px 16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">
          <div>
            <div style="font-family:var(--font-m);font-size:0.58rem;color:var(--muted2);text-transform:uppercase;letter-spacing:0.08em;">Topic Progress</div>
            <div style="font-family:var(--font-d);font-size:1.05rem;font-weight:800;color:var(--text);margin-top:3px;">
              ${masterySummary?.averageMastery || 0}% average
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:var(--font-m);font-size:0.8rem;font-weight:700;color:var(--green-text);">
              ${masterySummary?.dueReviewCount || 0}
            </div>
            <div style="font-family:var(--font-m);font-size:0.56rem;color:var(--muted2);text-transform:uppercase;">Due Reviews</div>
          </div>
        </div>
        <div style="margin-top:10px;font-family:var(--font-m);font-size:0.64rem;color:var(--muted2);line-height:1.5;">
          ${weakest.length
            ? `Weakest topics: ${weakest.map(topic => topic.label || topic.topicId).join(' · ')}`
            : 'Keep answering questions to strengthen your weak topics.'}
        </div>
      </div>`;
  }
  if (typeof renderFinanceFluencyProfileCard === 'function') {
    renderFinanceFluencyProfileCard();
  }

  // Milestone badges (inside the Momentum card)
  const _badgeEl = document.getElementById('streakBadgesInline');
  if (_badgeEl) {
    const _milestoneData = [
      { days: 7,  label: '7-Day',  color: '#b89428', earned: _streak >= 7  },
      { days: 14, label: '14-Day', color: '#7264c4', earned: _streak >= 14 },
      { days: 30, label: '30-Day', color: '#00a844', earned: _streak >= 30 },
    ];
    _badgeEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding:4px 0 2px;">
        ${_milestoneData.map(m => `
          <div style="
            padding:10px 6px 8px;border-radius:9px;text-align:center;
            background:${m.earned ? `${m.color}14` : 'var(--bg3)'};
            border:1px solid ${m.earned ? `${m.color}30` : 'var(--border)'};
            opacity:${m.earned ? '1' : '0.5'};">
            <div style="margin-bottom:4px;display:flex;align-items:center;justify-content:center;">
              ${m.earned
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="1.8" style="width:16px;height:16px">
                     <path d="M12 2C8 2 5 5 5 9c0 3 1.5 5.5 4 7l3 2 3-2c2.5-1.5 4-4 4-7 0-4-3-7-7-7z"/>
                     <polyline points="9 12 11 14 15 10" stroke-width="2"/>
                   </svg>`
                : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--muted2)" stroke-width="1.6" style="width:16px;height:16px">
                     <rect x="3" y="11" width="18" height="11" rx="2"/>
                     <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                   </svg>`
              }
            </div>
            <div style="font-family:var(--font-m);font-size:0.6rem;font-weight:700;color:${m.earned ? m.color : 'var(--muted2)'};">${m.label}</div>
            <div style="font-size:0.57rem;color:var(--muted2);margin-top:1px;font-family:var(--font-m)">${m.earned ? 'Earned' : `${m.days}d`}</div>
          </div>`).join('')}
      </div>`;
  }

  // ── Rank progress card in Progress tab ───────────────────
  const _rpEl = document.getElementById('profileRankCard');
  if (_rpEl) {
    const _level = levelSummary?.level || 1;
    const _nextLevel = levelSummary?.nextLevel || _level + 1;
    const _xpToNextLevel = levelSummary?.xpToNextLevel || 0;
    const _rpct  = levelSummary?.progressPct || 0;
    const _careerRank = careerSummary?.currentRank || null;
    const _careerColor = (typeof RANK_META !== 'undefined' && RANK_META[_careerRank?.name]?.color) || 'var(--text)';

    _rpEl.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:14px;
        padding:14px 16px;margin-bottom:4px;">

        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <div style="font-family:var(--font-d);font-size:1.1rem;font-weight:800;color:var(--text);">
              Level ${_level}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-family:var(--font-m);font-size:0.82rem;font-weight:700;color:var(--green-text);">
              ${S.xp.toLocaleString()} XP
            </div>
            <div style="font-family:var(--font-m);font-size:0.58rem;color:var(--muted2);margin-top:2px;">
              ${_xpToNextLevel.toLocaleString()} XP to Level ${_nextLevel}
            </div>
          </div>
        </div>
        <div style="font-family:var(--font-m);font-size:0.57rem;color:var(--muted2);margin-top:8px;">
          Rank Progress: ${_careerRank?.name || 'Intern'} ${careerSummary?.nextRank ? `· Next at $${Math.round(careerSummary.nextRank.min).toLocaleString()}` : '· Top rank reached'}
        </div>

        ${_careerRank ? `
        <div style="margin-top:10px;padding:8px 10px;background:${_careerColor}12;border:1px solid ${_careerColor}28;
          border-radius:8px;font-family:var(--font-m);font-size:0.62rem;color:${_careerColor};">
          ${(typeof RANK_META !== 'undefined' && RANK_META[_careerRank.name]?.perk) || 'Wealth milestones unlock stronger career titles.'}
        </div>` : ''}
        <div style="margin-top:10px;padding:8px 10px;background:var(--bg3);border:1px solid var(--border);
          border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;
          font-family:var(--font-m);font-size:0.62rem;">
          <span style="color:var(--muted2);">${COMPOUNDING_BOOST_LABEL}</span>
          <span style="font-weight:700;color:${boostMeta.multiplier > 1 ? 'var(--green-text)' : 'var(--text)'};">
            ${formatMultiplier(boostMeta.multiplier)} rewards · ${boostMeta.sourceName}
          </span>
        </div>
        <div style="margin-top:10px;height:5px;border-radius:999px;background:var(--bg3);overflow:hidden;">
          <div style="height:100%;width:${_rpct}%;border-radius:999px;background:var(--green);transition:width .4s ease;"></div>
        </div>
      </div>`;
  }

  // ── Unit progress bars ────────────────────────────────────
  const container = document.getElementById('unitProgressList');
  container.innerHTML = UNITS_DEF.map(unit => {
    const total  = unit.range[1] - unit.range[0] + 1;
    const done   = S.completedIds.filter(id => id >= unit.range[0] && id <= unit.range[1]).length;
    const pct    = Math.round((done / total) * 100);
    const isDone = pct === 100;
    return `<div class="prog-row">
      <div class="prog-head">
        <span class="prog-name">${unit.name}</span>
        <span class="prog-pct">${done}/${total}</span>
      </div>
      <div class="prog-track">
        <div class="prog-fill ${isDone ? 'done' : ''}" style="width:${pct}%"></div>
      </div>
      </div>`;
  }).join('');

  _renderDeveloperTools();
}


// ── SHOW PROFILE ──────────────────────────────────────────────
// Navigate to the profile screen and optionally open a specific tab.

function showProfile(tab, options = {}) {
  if (!S.user?.id) {
    openAuthModal('signin');
    return;
  }
  if (!setScreen('profileScreen', options)) return;
  setNav(null);
  try {
    renderProfileScreen();
    if (tab) switchProfileTab(tab);
  } catch (err) {
    console.error('[navigation] Profile render failed', err);
    showToast("Couldn't open Profile right now", 'error');
  }
}


// ── SWITCH PROFILE TAB ────────────────────────────────────────
// Activates the Account, Progress, or Membership tab.

function switchProfileTab(tab) {
  if (tab === 'membership') tab = 'progress';
  document.querySelectorAll('.profile-tab').forEach((t, i) => {
    const tabs = ['account', 'progress'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.profile-tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('ptab-' + tab);
  if (panel) panel.classList.add('active');
}

// ── RENDER MEMBERSHIP ─────────────────────────────────────────
// Sync the tier cards and buttons to the current S.user.tier.

function renderMembership() {
  return;

  // ── Current plan strip ────────────────────────────────────
  const planNames = { standard: 'Standard — Free', gold: 'Gold — $4.99/mo', platinum: 'Platinum — $7.99/mo' };
  const dotColors = { standard: 'var(--muted2)', gold: 'var(--gold-text)', platinum: 'var(--plat-text)' };

  const memName = document.getElementById('memCurrentName');
  const memDot  = document.getElementById('memCurrentIcon');
  if (memName) memName.textContent      = planNames[tier];
  if (memDot)  memDot.style.background  = dotColors[tier];

  // ── Feature lists per tier ────────────────────────────────
  const goldLocked = typeof LESSONS !== 'undefined'
    ? LESSONS.filter(l => (typeof getLessonAccessTier === 'function' ? getLessonAccessTier(l) : l.tier) === 'gold').length
    : 75;
  const previewLessonTotal = typeof LESSONS !== 'undefined'
    ? LESSONS.filter(l => (typeof getLessonAccessTier === 'function' ? getLessonAccessTier(l) : l.tier) === 'standard').length
    : 12;

  const checkColors = { standard: 'var(--green-text)', gold: 'var(--gold-text)', platinum: 'var(--plat-text)' };

  const tierFeatures = {
    standard: [
      `${previewLessonTotal} preview lessons`,
      'Daily question and streaks',
      'Leaderboard',
    ],
    gold: [
      `${goldLocked} additional lessons across all 6 units`,
      'Company analysis and market mechanics',
      'M&A, IPOs, deal structure',
      'In-lesson hints',
    ],
    platinum: [
      'Everything in Gold',
      'Portfolio simulator',
      'Priority access to new features',
      'Profile badge',
    ],
  };

  // ── Inject feature lists ──────────────────────────────────
  ['standard', 'gold', 'platinum'].forEach(t => {
    const cap       = t.charAt(0).toUpperCase() + t.slice(1);
    const chip      = document.getElementById(`tier${cap}Active`);
    const card      = document.getElementById(`tier${cap}`);
    const featureEl = document.getElementById(`tier${cap}Features`);
    const popular   = document.getElementById('tierGoldPopular');

    // Active chip visibility
    if (chip) chip.style.display = t === tier ? 'inline-flex' : 'none';

    // Active border class
    if (card) card.classList.toggle('active-tier', t === tier);
    // Locked/inactive style for non-current plans — mirrors Path page locked lesson design
    if (card) card.classList.toggle('tier-inactive', t !== tier);

    // Hide "Popular" chip when Gold is already active
    if (popular) popular.style.display = tier === 'gold' ? 'none' : 'inline-flex';

    // Inject feature rows
    if (featureEl && tierFeatures[t]) {
      const stroke = checkColors[t];
      featureEl.innerHTML = tierFeatures[t].map(f => `
        <div class="tier-feature-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.5"
            style="width:12px;height:12px;flex-shrink:0;margin-top:2px">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>${f}</span>
        </div>`).join('');
    }
  });

  // ── CTA buttons ───────────────────────────────────────────
  const btnStandard = document.getElementById('btnTierStandard');
  const btnGold     = document.getElementById('btnTierGold');
  const btnPlatinum = document.getElementById('btnTierPlatinum');

  if (btnStandard) {
    btnStandard.className   = 'btn ' + (tier === 'standard' ? 'btn-tier-current' : 'btn-tier-standard');
    btnStandard.textContent = tier === 'standard' ? 'Current plan' : 'Switch to free';
  }
  if (btnGold) {
    btnGold.className   = 'btn ' + (tier === 'gold' ? 'btn-tier-current' : 'btn-tier-gold');
    btnGold.textContent = tier === 'gold' ? 'Current plan' : tier === 'platinum' ? 'Switch to Gold' : 'Get Gold';
  }
  if (btnPlatinum) {
    btnPlatinum.className   = 'btn ' + (tier === 'platinum' ? 'btn-tier-current' : 'btn-tier-platinum');
    btnPlatinum.textContent = tier === 'platinum' ? 'Current plan' : 'Get Platinum';
  }
}



// ── SELECT TIER ───────────────────────────────────────────────
// For UPGRADES: redirects to Stripe Payment Link.
// For DOWNGRADES: updates tier locally (removes access client-side).
//
// IMPORTANT — Fill in your actual Stripe Payment Link URLs below.
// Create these in: Stripe Dashboard → Payment Links → Create
// Set metadata on each link: key = "tier", value = "gold" or "platinum"
// Set Success URL: https://YOUR-APP/?payment=success&tier=gold
// Set Cancel URL:  https://YOUR-APP/
const _STRIPE_LINKS = {
gold:     'https://buy.stripe.com/test_5kQ6oI4HQeSrban6T21kA00',
platinum: 'https://buy.stripe.com/test_00wbJ28Y6bGf6U72CM1kA01',
};

function selectTier(tier) {
  return;
  const current = S.user?.tier || 'standard';
  if (current === tier) return;

  const order     = ['standard', 'gold', 'platinum'];
  const isUpgrade = order.indexOf(tier) > order.indexOf(current);
  const names     = { standard: 'Standard', gold: 'Gold', platinum: 'Platinum' };
  const prices    = { standard: 'Free',     gold: '$4.99/mo', platinum: '$7.99/mo' };
  const iconType  = { standard: 'neutral',  gold: 'gold',     platinum: 'platinum' }[tier];
  const iconSvg   = {
    standard: `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    gold:     `<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    platinum: `<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
  }[tier];

  if (isUpgrade) {
    // ── UPGRADE: redirect to Stripe Payment Link ──────────
    // The user's Supabase UUID is appended as client_reference_id.
    // The Stripe webhook will read this and update progress.tier.
    // Tier in the success URL is a UX hint only — never trusted for access.

    if (!S.user.id) {
      showToast('Please sign in to upgrade', 'error');
      return;
    }

    const baseLink = _STRIPE_LINKS[tier];
    if (!baseLink || baseLink.includes('REPLACE_WITH')) {
      // Stripe links not yet configured — show a helpful dev message
      showAppModal({
        icon: iconType, iconSvg,
        title: `Upgrade to ${names[tier]}`,
        body:  `Payment links not yet configured. Add your Stripe Payment Link URLs to the _STRIPE_LINKS object in profile.js.`,
        actions: [{ label: 'Got it', cls: 'btn btn-primary', fn: closeAppModal }]
      });
      return;
    }

    showAppModal({
      icon: iconType, iconSvg,
      title: `Upgrade to ${names[tier]}`,
      body:  `<span class="modal-price">${prices[tier]}</span><span class="modal-price-sub">Billed monthly · Cancel anytime · Secure payment via Stripe</span>`,
      bodyIsHTML: true,
      actions: [
        {
          label: `Continue to Payment`,
          cls:   `btn btn-tier-${tier}`,
          fn: () => {
            closeAppModal();
            // Redirect to Stripe with the user's ID so the webhook knows who paid
            const stripeUrl = `${baseLink}?client_reference_id=${encodeURIComponent(S.user.id)}`;
            window.location.href = stripeUrl;
          }
        },
        { label: 'Maybe later', cls: 'modal-cancel', fn: closeAppModal }
      ]
    });

  } else {
    // ── DOWNGRADE: local-only change ──────────────────────
    // Removes the user's own access — no payment involved.
    // Note: in production, pair this with Stripe subscription cancellation.
    showAppModal({
      icon: 'neutral',
      title: `Switch to ${names[tier]}?`,
      body:  `You'll lose access to ${names[current]} features. Your progress is always kept. Your subscription continues until the end of the billing period.`,
      actions: [
        { label: `Switch to ${names[tier]}`, cls: 'btn btn-secondary', fn: () => {
            S.user.tier = tier; save();
            closeAppModal();
            renderMembership(); renderProfileScreen();
            showToast(`Switched to ${names[tier]}`);
          }
        },
        { label: 'Keep current plan', cls: 'modal-cancel', fn: closeAppModal }
      ]
    });
  }
}


// ── OPEN EDIT SHEET ───────────────────────────────────────────
// Slide-up bottom sheet for editing name, email, password, or avatar.

function openEditSheet(mode) {
  editMode = mode;
  if (mode !== 'avatar') pendingAvatarColor = null;
  const overlay = document.getElementById('editOverlay');
  const fields  = document.getElementById('editFields');
  const title   = document.getElementById('editSheetTitle');

  if (mode === 'name') {
    title.textContent = 'Edit Display Name';
    fields.innerHTML = `
      <div class="field-wrap">
        <div class="field-label">Display Name</div>
        <input class="field-input" id="editField1" type="text"
          value="${S.user?.name || ''}" placeholder="Your name"
          maxlength="32" autocomplete="off"/>
      </div>`;

  } else if (mode === 'email') {
    title.textContent = 'Edit Email';
    fields.innerHTML = `
      <div class="field-wrap">
        <div class="field-label">Email Address</div>
        <input class="field-input" id="editField1" type="email"
          value="${S.user?.email || ''}" placeholder="you@example.com"
          autocomplete="email"/>
      </div>`;

  } else if (mode === 'password') {
    title.textContent = 'Change Password';
    fields.innerHTML = `
      <div class="field-wrap">
        <div class="field-label">New Password</div>
        <input class="field-input" id="editField1" type="password"
          placeholder="New password (8+ chars)" autocomplete="new-password"/>
      </div>
      <div class="field-wrap">
        <div class="field-label">Confirm Password</div>
        <input class="field-input" id="editField2" type="password"
          placeholder="Confirm new password" autocomplete="new-password"/>
      </div>`;

  } else if (mode === 'avatar') {
    title.textContent = 'Choose Avatar Color';
    const colours = ['#1a1a2e','#16213e','#0f3460','#1b4332','#2d3a1e','#3b2f2f','#2c2c54','#1a1a1a','#4a1942','#003049'];
    pendingAvatarColor = S.user?.avatarColor || getAvatarColor(S.user?.name || '');
    fields.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:4px 0;">
        ${colours.map(c => `
          <div onclick="selectAvatarColor('${c}')" id="avc-${c.replace('#','')}"
            style="height:48px;border-radius:12px;background:${c};cursor:pointer;
            display:flex;align-items:center;justify-content:center;
            border:2px solid ${c === pendingAvatarColor ? 'var(--green)' : 'transparent'};
            transition:border-color 0.15s;">
            ${c === pendingAvatarColor ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
          </div>`).join('')}
      </div>
      <p style="font-size:0.76rem;color:var(--muted);text-align:center;">Your initials are shown on your avatar.</p>`;
  }

  overlay.classList.add('open');
  setTimeout(() => document.getElementById('editField1')?.focus(), 150);
}


// ── SELECT AVATAR COLOR ───────────────────────────────────────
// Updates the colour swatches and the live avatar preview.

function selectAvatarColor(color) {
  if (!S.user) return;
  pendingAvatarColor = color;
  // Update swatch borders
  document.querySelectorAll('[id^="avc-"]').forEach(el => {
    const c          = '#' + el.id.replace('avc-', '');
    const isSelected = c === color;
    el.style.borderColor = isSelected ? 'var(--green)' : 'transparent';
    el.innerHTML = isSelected
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>`
      : '';
  });
  // Reflect immediately in the profile header
  document.getElementById('avatarRing').style.background = color;
}


// ── CLOSE EDIT SHEET ──────────────────────────────────────────
// Dismisses the bottom sheet.
// When called from the overlay click handler, only closes if the
// click was directly on the dim background (not the sheet itself).

function closeEditSheet(e) {
  if (e && e.target !== document.getElementById('editOverlay')) return;
  document.getElementById('editOverlay').classList.remove('open');
  if (editMode === 'avatar') {
    pendingAvatarColor = null;
    renderProfileScreen();
  }
  editMode = null;
}


// ── SAVE EDIT ─────────────────────────────────────────────────
// Validates and persists changes from the edit sheet.

function saveEdit() {
  if (!S.user) return;

  if (editMode === 'name') {
    const val = document.getElementById('editField1')?.value?.trim();
    if (!val) { showToast('Name cannot be empty', 'error'); return; }
    S.user.name = val;
    showToast('Name updated', 'success');

  } else if (editMode === 'email') {
    const val = document.getElementById('editField1')?.value?.trim();
    if (val && !val.includes('@')) { showToast('Enter a valid email address', 'error'); return; }
    S.user.email = val || null;
    showToast(val ? 'Email updated' : 'Email removed', 'success');

  } else if (editMode === 'password') {
    const p1 = document.getElementById('editField1')?.value;
    const p2 = document.getElementById('editField2')?.value;
    if (!p1 || p1.length < 8) { showToast('Password must be 8+ characters', 'error'); return; }
    if (p1 !== p2)             { showToast('Passwords do not match', 'error');          return; }

    // Use the current access token to update the password in Supabase.
    // authUpdatePassword() calls PUT /auth/v1/user with any valid JWT as Bearer.
    getValidToken().then(token => {
      if (!token) { showToast('Please sign in again to change your password', 'error'); return; }
      authUpdatePassword(token, p1)
        .then(() => {
          showToast('Password changed successfully', 'success');
          document.getElementById('editOverlay').classList.remove('open');
          editMode = null;
        })
        .catch(err => {
          showToast('Could not change password: ' + err.message, 'error');
        });
    });
    return; // async — skip the save() + renderProfileScreen() calls below

  } else if (editMode === 'avatar') {
    if (pendingAvatarColor) S.user.avatarColor = pendingAvatarColor;
    showToast('Avatar updated', 'success');
  }

  save();
  document.getElementById('editOverlay').classList.remove('open');
  pendingAvatarColor = null;
  editMode = null;
  renderProfileScreen();
  updateTopbar();
}


// ── CONFIRM RESET ─────────────────────────────────────────────
// Shows a destructive-action modal before wiping progress.

// Delegates to the single canonical confirmation + reset flow in app.js so
// every entry point (Settings, Profile, Account) clears the same verified
// learning-progress keys and re-renders the UI identically.
function confirmReset() {
  if (typeof confirmResetAppData === 'function') {
    confirmResetAppData();
    return;
  }
  if (typeof confirmResetLearningProgress === 'function') {
    confirmResetLearningProgress();
    return;
  }
  // Defensive fallback (canonical flow unavailable): clear main state only.
  showAppModal({
    icon: 'danger',
    title: 'Reset all Finlingo data?',
    body:  'This clears your learning progress, Classroom data, preferences, and local app data, then signs you out. This cannot be undone.',
    actions: [
      { label: 'Cancel', cls: 'modal-cancel', fn: closeAppModal },
      { label: 'Reset and sign out', cls: 'btn btn-danger', fn: () => {
          const user   = S.user;
          const joined = S.joinedDate;
          S = normalizeState();
          S.user = user;
          S.joinedDate = joined;
          save();
          closeAppModal();
          renderProfileScreen(); updateTopbar();
          showToast('Data reset.');
        }
      }
    ]
  });
}

// ── SIGN OUT ──────────────────────────────────────────────────
// Clears the user from state and returns to the auth screen.

function signOut() {
  showAppModal({
    icon: 'neutral',
    title: 'Sign out?',
    body: 'You can always sign back in. Your progress is saved.',
    actions: [
      {
        label: 'Sign Out',
        cls: 'btn btn-primary',
        fn: () => {
          clearStoredSession();

          S.user = null;
          save();
          closeAppModal();

          authMode = 'signin';
          _setTabsVisible(true); // restore tab bar in case user was in forgot/reset mode
          document.getElementById('authSuccessScreen').classList.remove('show');
          document.getElementById('authFormWrap').style.display = '';
          document.getElementById('tabSignIn').classList.add('active');
          document.getElementById('tabCreate').classList.remove('active');
          renderAuthForm();
          clearAllFieldStates();
          if (typeof _showAuthBootScreen === 'function') _showAuthBootScreen();
          else openAuthModal('signin', { dismissible: false });
          showToast('Signed out successfully');
        }
      },
      {
        label: 'Cancel',
        cls: 'modal-cancel',
        fn: closeAppModal
      }
    ]
  });
}
