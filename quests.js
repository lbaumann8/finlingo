// ============================================================
// quests.js
// Daily Quests system — 3 repeatable daily challenges.
//
// QUESTS (reset each calendar day):
//   Q1 — Complete 1 lesson            → +25 base XP
//   Q2 — Get 4 answers correct        → +25 base XP
//   Q3 — Finish the daily challenge   → +25 base XP
//   Bonus — All 3 done                → +100 base XP + $100 cash
//
// STATE SHAPE (lives at S.quests, persisted by save()):
//   {
//     date:    'YYYY-MM-DD',  — which day these belong to
//     q1Done:  false,         — lesson completed today
//     q2Count: 0,             — correct answers so far (target: 4)
//     q2Done:  false,         — q2 goal reached
//     q3Done:  false,         — daily challenge completed
//     r1:      false,         — quest reward for Q1 claimed
//     r2:      false,         — quest reward for Q2 claimed
//     r3:      false,         — quest reward for Q3 claimed
//     rBonus:  false,         — all-quests bonus claimed
//   }
//
// PUBLIC HOOKS (called from quiz.js):
//   onQuestCorrectAnswer()   — after each correct answer
//   onQuestLessonComplete()  — after a lesson finishes
//   onQuestDailyComplete()   — after the daily challenge finishes
//
// PUBLIC UI:
//   updateQuestCard()        — re-renders the home page card
//   openQuestsModal()        — opens the bottom-sheet modal
//   closeQuestsModal(e)      — closes it (pass event to guard overlay click)
//
// Depends on: state.js (S, save, today), app.js (showToast, updateTopbar)
// ============================================================

const QUEST_CORRECT_TARGET = 4;

function getQuestProgressSummary() {
  const qs = getQuestState();
  const totalCount = 3;
  const doneCount = [qs.q1Done, qs.q2Done, qs.q3Done].filter(Boolean).length;
  const claimedCount = [qs.r1, qs.r2, qs.r3].filter(Boolean).length;
  const remainingCount = totalCount - doneCount;
  const progressPct = Math.round((doneCount / totalCount) * 100);
  const allDone = doneCount === totalCount;
  const pendingClaims = [qs.q1Done && !qs.r1, qs.q2Done && !qs.r2, qs.q3Done && !qs.r3].filter(Boolean).length + (allDone && !qs.rBonus ? 1 : 0);

  return {
    qs,
    doneCount,
    claimedCount,
    totalCount,
    remainingCount,
    progressPct,
    allDone,
    pendingClaims,
    bonusReady: allDone && !qs.rBonus,
    allClaimed: qs.r1 && qs.r2 && qs.r3 && qs.rBonus,
    title: `${doneCount} / ${totalCount} Complete`,
    bonusCopy: pendingClaims > 0
      ? pendingClaims === 1
        ? '1 reward ready to claim'
        : `${pendingClaims} rewards ready to claim`
      : allDone
      ? 'Bonus secured for today'
      : remainingCount === 1
        ? '1 quest left for the bonus reward'
        : `${remainingCount} quests left for the bonus reward`
  };
}


// ── GET OR RESET QUEST STATE ──────────────────────────────────
// Returns today's quest object. If S.quests is missing or its
// date is not today, resets to a blank slate for the new day.
// This is the only place a daily reset can happen — no timer needed.
function getQuestState() {
  const t = today();
  if (!S.quests || S.quests.date !== t) {
    S.quests = {
      date:    t,
      q1Done:  false,
      q2Count: 0,
      q2Done:  false,
      q3Done:  false,
      r1:      false,
      r2:      false,
      r3:      false,
      rBonus:  false,
    };
    save();
  }
  return S.quests;
}


// ── GRANT INDIVIDUAL QUEST REWARD ────────────────────────────
// Awards +25 XP for one quest. The reward flag makes this idempotent —
// re-calling after a refresh never double-grants.
function _grantQuestReward(rewardKey) {
  const qs = getQuestState();
  if (qs[rewardKey]) return;          // already claimed — do nothing
  qs[rewardKey] = true;
  const award = awardRewards({
    baseXp: 25,
    source: 'quest_reward',
    meta: {
      rewardId: `quest:${qs.date}:${rewardKey}`
    }
  });
  save();
  if (typeof updateTopbar === 'function') updateTopbar();
  updateQuestCard();
  return award;
}


// ── GRANT ALL-QUESTS BONUS ────────────────────────────────────
function _grantAllQuestsBonus() {
  const qs = getQuestState();
  if (qs.rBonus) return;
  qs.rBonus = true;
  const award = awardRewards({
    baseXp: 100,
    baseCash: 100,
    source: 'quest_bonus',
    meta: {
      rewardId: `quest:${qs.date}:bonus`
    }
  });
  if (typeof recordAchievement === 'function') {
    recordAchievement({
      id: 'quests:first-bonus',
      label: 'First Quest Bonus',
      type: 'quest',
      earnedAtXp: S.xp,
      meta: { date: qs.date }
    });
  }
  save();
  if (typeof updateTopbar === 'function') updateTopbar();
  updateQuestCard();
  return award;
}


// ── CHECK QUEST COMPLETION ────────────────────────────────────
// Called after any progress mutation. Evaluates all completion
// conditions and refreshes the quest UI. Rewards are claimed manually.
function _questCheckAndAward() {
  const qs = getQuestState();

  if (!qs.q2Done && (qs.q2Count || 0) >= QUEST_CORRECT_TARGET) {
    qs.q2Done = true;
  }
  save();
  updateQuestCard();

  // Live-refresh modal rows if the modal is currently open
  const modal = document.getElementById('questsModal');
  if (modal && modal.classList.contains('open')) {
    _renderQuestRows();
  }
}

function claimQuestReward(rewardKey) {
  const qs = getQuestState();
  const questMap = {
    r1: { done: qs.q1Done, label: 'Lesson quest' },
    r2: { done: qs.q2Done, label: 'Accuracy quest' },
    r3: { done: qs.q3Done, label: 'Daily quest' },
  };
  const quest = questMap[rewardKey];
  if (!quest || !quest.done || qs[rewardKey]) return null;
  const award = _grantQuestReward(rewardKey);
  if (award && typeof showToast === 'function') {
    showToast(`${quest.label} claimed — +${award.xpAwarded || 25} XP`, 'success');
  }
  if (document.getElementById('questsModal')?.classList.contains('open')) {
    _renderQuestRows();
  }
  return award;
}

function claimQuestBonus() {
  const summary = getQuestProgressSummary();
  if (!summary.bonusReady) return null;
  const award = _grantAllQuestsBonus();
  if (award && typeof showToast === 'function') {
    showToast(`All quests claimed! +${award.xpAwarded || 100} XP & +$${award.cashAwarded || 100}`, 'success');
  }
  if (document.getElementById('questsModal')?.classList.contains('open')) {
    _renderQuestRows();
  }
  return award;
}


// ── PUBLIC HOOKS ──────────────────────────────────────────────

/**
 * Call from quiz.js checkAnswer() immediately after a correct answer
 * is recorded (i.e. after lessonCorrect++ runs).
 */
function onQuestCorrectAnswer() {
  const qs = getQuestState();
  if (qs.q2Done) return;                    // quest already complete today
  qs.q2Count = (qs.q2Count || 0) + 1;
  save();
  _questCheckAndAward();
}

/**
 * Call from quiz.js finishRun() after a LESSON completes
 * (inside the `if (mode === 'lesson')` branch).
 */
function onQuestLessonComplete() {
  const qs = getQuestState();
  if (qs.q1Done) return;                    // idempotent — replay doesn't re-grant
  qs.q1Done = true;
  save();
  _questCheckAndAward();
}

/**
 * Call from quiz.js finishRun() after the DAILY CHALLENGE completes
 * (inside the `else` / daily branch).
 */
function onQuestDailyComplete() {
  const qs = getQuestState();
  if (qs.q3Done) return;
  qs.q3Done = true;
  save();
  _questCheckAndAward();
}


// ══════════════════════════════════════════════════════════════
// HOME PAGE CARD
// ══════════════════════════════════════════════════════════════

/**
 * Re-renders the compact quest card on the home screen.
 * Called by updateHome() and after any reward is granted.
 */
function updateQuestCard() {
  const el = document.getElementById('questCard');
  if (!el) return;

  const questSummary = getQuestProgressSummary();
  const { doneCount, totalCount, progressPct, allDone, title, bonusCopy, pendingClaims } = questSummary;

  el.innerHTML = `
    <div class="quest-card ${allDone ? 'quest-card-done' : ''} ${pendingClaims ? 'quest-card-claimable' : ''}"
         onclick="openQuestsModal()" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter'||event.key===' ')openQuestsModal()">
      <div class="quest-card-head">
        <div class="quest-card-icon">
          <svg viewBox="0 0 24 24" fill="none"
               stroke="${allDone ? 'var(--green-text)' : 'var(--muted)'}" stroke-width="1.8"
               style="width:16px;height:16px">
            <path d="M8 21h8M12 17v4
                     M7 4H4a2 2 0 0 0-2 2v1c0 4.4 2.9 8.2 7 9.5
                     M17 4h3a2 2 0 0 1 2 2v1c0 4.4-2.9 8.2-7 9.5
                     M5 4h14"/>
          </svg>
        </div>
        <div class="quest-card-info">
          <div class="quest-card-eyebrow">Daily Quests</div>
          <div class="quest-card-title">${title}</div>
        </div>
        <div class="quest-card-badge ${allDone ? 'quest-card-badge-done' : ''}">
          ${doneCount}/${totalCount}
        </div>
      </div>
      <div class="quest-card-progress">
        <div class="quest-card-progress-fill" style="width:${progressPct}%"></div>
      </div>
      <div class="quest-card-sub">${bonusCopy}</div>
      <div class="quest-card-foot">
        <span>${pendingClaims ? 'Tap to claim your rewards' : 'Tap to view today&apos;s quests'}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--muted2)" stroke-width="2"
             style="width:13px;height:13px;flex-shrink:0;">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </div>`;
}


// ══════════════════════════════════════════════════════════════
// QUESTS MODAL
// ══════════════════════════════════════════════════════════════

/** Open the quests bottom-sheet modal. */
function openQuestsModal() {
  getQuestState();        // ensure date is current before rendering
  _renderQuestRows();
  document.getElementById('questsModal').classList.add('open');
}

/**
 * Close the modal.
 * Pass the click event to guard against closing when clicking inside the sheet.
 */
function closeQuestsModal(e) {
  if (e && e.target !== document.getElementById('questsModal')) return;
  document.getElementById('questsModal').classList.remove('open');
}

/** Direct close — called by the × button inside the sheet. */
function _closeQuestsBtn() {
  document.getElementById('questsModal').classList.remove('open');
}


// ── RENDER MODAL CONTENT ──────────────────────────────────────
function _renderQuestRows() {
  const qs = getQuestState();
  const summary = getQuestProgressSummary();
  const doneCount = summary.doneCount;
  const hintEl = document.getElementById('questsModalHint');

  const ckSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
    style="width:11px;height:11px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>`;

  if (hintEl) {
    hintEl.innerHTML = summary.pendingClaims > 0
      ? `<strong>${summary.pendingClaims} reward${summary.pendingClaims === 1 ? '' : 's'} ready</strong> · Tap any completed quest to claim it.`
      : '<strong>Daily reset</strong> · Finish all 3 quests for the bonus.';
  }

  // Quest row data
  const quests = [
    {
      label:    'Complete 1 lesson',
      done:     qs.q1Done,
      rewarded: qs.r1,
      rewardKey: 'r1',
      progress: null,
    },
    {
      label:    'Get 4 answers correct',
      done:     qs.q2Done,
      rewarded: qs.r2,
      rewardKey: 'r2',
      progress: `${Math.min(qs.q2Count || 0, QUEST_CORRECT_TARGET)} / ${QUEST_CORRECT_TARGET}`,
    },
    {
      label:    'Finish the daily challenge',
      done:     qs.q3Done,
      rewarded: qs.r3,
      rewardKey: 'r3',
      progress: null,
    },
  ];

  // ── Quest rows ────────────────────────────────────────────
  const rowsContainer = document.getElementById('questRows');
  if (rowsContainer) {
    rowsContainer.innerHTML = quests.map(q => `
      <div class="quest-modal-row ${q.done ? 'quest-modal-row-done' : ''} ${q.done && !q.rewarded ? 'quest-modal-row-claimable' : ''} ${q.rewarded ? 'quest-modal-row-claimed' : ''}"
        ${q.done && !q.rewarded ? `onclick="claimQuestReward('${q.rewardKey}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' ')claimQuestReward('${q.rewardKey}')"` : ''}>
        <div class="quest-modal-icon" style="
            background: ${q.rewarded ? 'var(--bg3)' : q.done ? 'var(--green)' : 'var(--bg3)'};
            border-color: ${q.rewarded ? 'rgba(0,168,68,0.22)' : q.done ? 'var(--green)' : 'var(--border)'};">
          <svg viewBox="0 0 24 24" fill="none"
               stroke="${q.done && !q.rewarded ? '#fff' : q.rewarded ? 'var(--green-text)' : 'var(--muted2)'}" stroke-width="2.2"
               style="width:12px;height:12px">
            ${q.done
              ? '<polyline points="20 6 9 17 4 12"/>'
              : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/>'}
          </svg>
        </div>
        <div class="quest-modal-info">
          <div class="quest-modal-label">${q.label}</div>
          ${!q.done && q.progress
            ? `<div class="quest-modal-prog">${q.progress}</div>`
            : ''}
        </div>
        <div class="quest-modal-xp ${q.rewarded ? 'quest-modal-xp-done' : ''} ${q.done && !q.rewarded ? 'quest-modal-xp-claimable' : ''}">
          ${q.rewarded ? `${ckSvg}&nbsp;Claimed` : q.done ? 'Claim reward' : 'Reward'}
        </div>
      </div>`).join('');
  }

  // ── Bonus row ─────────────────────────────────────────────
  const allDone  = doneCount === 3;
  const bonusEl  = document.getElementById('questBonusRow');
  if (bonusEl) {
    bonusEl.innerHTML = `
      <div class="quest-bonus-row ${allDone ? 'quest-bonus-row-done' : ''} ${summary.bonusReady ? 'quest-bonus-row-claimable' : ''} ${qs.rBonus ? 'quest-bonus-row-claimed' : ''}"
        ${summary.bonusReady ? `onclick="claimQuestBonus()" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' ')claimQuestBonus()"` : ''}>
        <div class="quest-bonus-icon">
          <svg viewBox="0 0 24 24" fill="none"
               stroke="${qs.rBonus ? 'var(--gold-text)' : allDone ? 'var(--gold-text)' : 'var(--muted2)'}" stroke-width="1.8"
               style="width:15px;height:15px">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </div>
        <div class="quest-bonus-info">
          <div class="quest-bonus-title">Complete all 3 quests</div>
          <div class="quest-bonus-sub">Base +100 XP &amp; +$100 cash</div>
        </div>
        <div class="quest-bonus-pill ${qs.rBonus ? 'quest-bonus-pill-done' : ''} ${summary.bonusReady ? 'quest-bonus-pill-claimable' : ''}">
          ${qs.rBonus ? 'Claimed' : summary.bonusReady ? 'Claim' : `${doneCount} / 3`}
        </div>
      </div>`;
  }

  // ── Header progress counter ───────────────────────────────
  const progEl = document.getElementById('questsModalProg');
  if (progEl) progEl.textContent = `${doneCount} / 3`;
}
