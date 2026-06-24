// ============================================================
// dailyLoop.js
// Distinct once-per-day retention loop:
//   - Finlingo Daily question (7-option, 3 attempts)
//   - Shareable result grid
//   - Local beta accuracy stats
//   - Daily market prediction
//
// Depends on: state.js, progression.js, dailyQuestionBank.js
// Uses app.js modal/toast helpers at runtime.
// ============================================================

const DAILY_LOOP_MAX_ATTEMPTS = 3;
const DAILY_LOOP_COMPLETION_CASH = 50;
const DAILY_LOOP_SOLVE_REWARDS = {
  1: { xp: 25, cash: 25 },
  2: { xp: 18, cash: 20 },
  3: { xp: 12, cash: 15 }
};
const DAILY_LOOP_STATS_STORAGE_KEY = 'finlingo_daily_stats_v1';
const DAILY_PREDICTION_COMMUNITY_STORAGE_KEY = 'finlingo_daily_prediction_community_v1';
const DAILY_MARKET_PREDICTION_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'VOO'];
const DAILY_PREDICTION_STAKE_PRESETS = [10, 25, 50, 100];
const DAILY_PREDICTION_MAX_STAKES = 3;
const DAILY_PREDICTION_MODEL_WEIGHT = 0.7;
const DAILY_PREDICTION_COMMUNITY_WEIGHT = 0.3;
const DAILY_PREDICTION_PAYOUT_EDGE = 0.97;

let _dailyPredictionFetchPending = false;
let _dailyPredictionResolvePending = false;
let _dailyPredictionModalOpen = false;
let _dailyPredictionMarketPending = false;
let _dailyPredictionMarketLastAttemptAt = 0;

function _escapeDailyHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _roundDailyNumber(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function _clampDailyNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function _trimDailyHistory(list, limit = 14) {
  return Array.isArray(list) ? list.slice(0, limit) : [];
}

function _ensureDailyLoopState() {
  if (!S.rewardsSummary || typeof S.rewardsSummary !== 'object') {
    S.rewardsSummary = typeof getDefaultRewardsSummary === 'function'
      ? getDefaultRewardsSummary()
      : {};
  }
  if (!S.rewardsSummary.dailyLoop || typeof S.rewardsSummary.dailyLoop !== 'object') {
    S.rewardsSummary.dailyLoop = typeof getDefaultDailyLoopState === 'function'
      ? getDefaultDailyLoopState()
      : {};
  }

  const state = S.rewardsSummary.dailyLoop;
  const defaults = typeof getDefaultDailyLoopState === 'function'
    ? getDefaultDailyLoopState()
    : {};

  state.question = {
    ...(defaults.question || {}),
    ...(state.question || {})
  };
  state.questionHistory = _trimDailyHistory(state.questionHistory || []);
  state.prediction = {
    ...(defaults.prediction || {}),
    ...(state.prediction || {}),
    history: _trimDailyHistory(state.prediction?.history || [])
  };
  state.chartGuess = {
    ...(defaults.chartGuess || {}),
    ...(state.chartGuess || {})
  };
  return state;
}

function _archiveDailyQuestionRecord(record) {
  if (!record || !record.date) return;
  const state = _ensureDailyLoopState();
  const existing = (state.questionHistory || []).filter(entry => entry?.date !== record.date);
  state.questionHistory = _trimDailyHistory([{ ...record }, ...existing]);
}

function _createDailyQuestionRecord(dateKey = today()) {
  const round = typeof buildDailyQuestionRound === 'function'
    ? buildDailyQuestionRound(dateKey)
    : null;
  return {
    date: dateKey,
    dailyNumber: round?.dailyNumber || (typeof getDailyQuestionNumber === 'function' ? getDailyQuestionNumber(dateKey) : 1),
    status: 'unanswered',
    attemptsUsed: 0,
    usedOptionIndexes: [],
    solvedAt: null,
    failedAt: null,
    reward: null,
    completionReward: null,
    statsRecorded: false,
    shareCopiedAt: null
  };
}

function _ensureCurrentDailyQuestionRecord() {
  const state = _ensureDailyLoopState();
  const dateKey = today();
  if (!state.question?.date) {
    state.question = _createDailyQuestionRecord(dateKey);
  } else if (state.question.date !== dateKey) {
    if (['solved', 'failed'].includes(state.question.status)) {
      _archiveDailyQuestionRecord(state.question);
    }
    state.question = _createDailyQuestionRecord(dateKey);
  }
  return state.question;
}

function getDailyQuestionSummary() {
  const record = _ensureCurrentDailyQuestionRecord();
  const round = typeof buildDailyQuestionRound === 'function'
    ? buildDailyQuestionRound(record.date)
    : null;
  const attemptsUsed = Math.max(0, Number(record.attemptsUsed) || 0);
  const solved = record.status === 'solved';
  const failed = record.status === 'failed';
  const done = solved || failed;
  const nextHint = !done && attemptsUsed > 0 && attemptsUsed <= 2
    ? round?.hints?.[attemptsUsed - 1] || ''
    : '';
  const streak = Math.max(0, Number(S.streak) || 0);
  const freezeCount = Math.max(0, Number(S.inventory?.streakSavers) || 0);
  const milestones = [7, 14, 30];
  const nextMilestone = milestones.find(value => streak < value) || null;

  return {
    record,
    round,
    attemptsUsed,
    attemptsRemaining: Math.max(0, DAILY_LOOP_MAX_ATTEMPTS - attemptsUsed),
    done,
    solved,
    failed,
    nextHint,
    streak,
    freezeCount,
    nextMilestone
  };
}

function _loadDailyStatsStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DAILY_LOOP_STATS_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function _saveDailyStatsStore(store) {
  localStorage.setItem(DAILY_LOOP_STATS_STORAGE_KEY, JSON.stringify(store || {}));
}

function recordDailyQuestionStats(record = _ensureCurrentDailyQuestionRecord()) {
  if (!record || record.statsRecorded || !['solved', 'failed'].includes(record.status)) return;

  const store = _loadDailyStatsStore();
  const entry = store[record.date] && typeof store[record.date] === 'object'
    ? store[record.date]
    : {
        total: 0,
        solved: 0,
        failed: 0,
        solvedIn1: 0,
        solvedIn2: 0,
        solvedIn3: 0
      };

  entry.total += 1;
  if (record.status === 'solved') {
    entry.solved += 1;
    const bucket = Math.max(1, Math.min(3, Number(record.attemptsUsed) || 3));
    entry[`solvedIn${bucket}`] = Math.max(0, Number(entry[`solvedIn${bucket}`]) || 0) + 1;
  } else {
    entry.failed += 1;
  }

  entry.updatedAt = new Date().toISOString();
  store[record.date] = entry;
  _saveDailyStatsStore(store);
  record.statsRecorded = true;
}

function getDailyQuestionStats(dateKey = today()) {
  const entry = _loadDailyStatsStore()[dateKey];
  const total = Math.max(0, Number(entry?.total) || 0);
  if (!total) {
    return {
      sourceLabel: 'Local beta stats',
      hasData: false,
      correctPct: 0,
      incorrectPct: 0,
      solve1Pct: 0,
      solve2Pct: 0,
      solve3Pct: 0
    };
  }

  const solved = Math.max(0, Number(entry?.solved) || 0);
  const failed = Math.max(0, Number(entry?.failed) || 0);
  const solvedIn1 = Math.max(0, Number(entry?.solvedIn1) || 0);
  const solvedIn2 = Math.max(0, Number(entry?.solvedIn2) || 0);
  const solvedIn3 = Math.max(0, Number(entry?.solvedIn3) || 0);

  return {
    sourceLabel: 'Local beta stats',
    hasData: true,
    correctPct: Math.round((solved / total) * 100),
    incorrectPct: Math.round((failed / total) * 100),
    solve1Pct: Math.round((solvedIn1 / total) * 100),
    solve2Pct: Math.round((solvedIn2 / total) * 100),
    solve3Pct: Math.round((solvedIn3 / total) * 100),
    total
  };
}

function buildDailyResultGrid(record = _ensureCurrentDailyQuestionRecord()) {
  const marks = [];
  for (let index = 0; index < DAILY_LOOP_MAX_ATTEMPTS; index += 1) {
    if (index >= (record?.attemptsUsed || 0)) {
      marks.push('⬛');
    } else if (record?.status === 'solved' && index === (record.attemptsUsed - 1)) {
      marks.push('🟩');
    } else {
      marks.push('🟥');
    }
  }

  return [
    `Finlingo Daily #${record?.dailyNumber || 1}`,
    marks.join(''),
    `Streak: ${Math.max(0, Number(S.streak) || 0)}`,
    'finlingo.co'
  ].join('\n');
}

async function copyDailyResultGrid() {
  const record = _ensureCurrentDailyQuestionRecord();
  if (!['solved', 'failed'].includes(record.status)) return;
  const text = buildDailyResultGrid(record);
  try {
    await navigator.clipboard.writeText(text);
    record.shareCopiedAt = new Date().toISOString();
    save();
    showToast('Daily result copied', 'success');
    renderDailyLoopHomeCards();
    if (document.getElementById('appModal')?.classList.contains('open')) {
      openDailyQuestion();
    }
  } catch {
    showToast('Copy failed on this device', 'error');
  }
}

function _renderDailyAttemptPips(record) {
  const solvedAttempt = record.status === 'solved' ? Math.max(1, Number(record.attemptsUsed) || 1) : 0;
  return Array.from({ length: DAILY_LOOP_MAX_ATTEMPTS }).map((_, index) => {
    let cls = 'daily-attempt-pill';
    let label = `Attempt ${index + 1}`;
    if (index < (record.attemptsUsed || 0)) {
      if (record.status === 'solved' && index === solvedAttempt - 1) {
        cls += ' daily-attempt-pill-win';
        label += ' solved';
      } else {
        cls += ' daily-attempt-pill-used';
        label += ' used';
      }
    }
    return `<span class="${cls}" aria-label="${label}">${index + 1}</span>`;
  }).join('');
}

function _renderDailyStatsMarkup(stats) {
  if (!stats?.hasData) {
    return `
      <div class="daily-stats-empty">
        ${stats?.sourceLabel || 'Stats'} will appear after a few results come in.
      </div>`;
  }
  return `
    <div class="daily-stats-grid">
      <div class="daily-stats-item">
        <span class="daily-stats-value">${stats.correctPct}%</span>
        <span class="daily-stats-label">Solved</span>
      </div>
      <div class="daily-stats-item">
        <span class="daily-stats-value">${stats.incorrectPct}%</span>
        <span class="daily-stats-label">Locked</span>
      </div>
      <div class="daily-stats-item">
        <span class="daily-stats-value">${stats.solve1Pct}%</span>
        <span class="daily-stats-label">1 try</span>
      </div>
      <div class="daily-stats-item">
        <span class="daily-stats-value">${stats.solve2Pct}%</span>
        <span class="daily-stats-label">2 tries</span>
      </div>
      <div class="daily-stats-item">
        <span class="daily-stats-value">${stats.solve3Pct}%</span>
        <span class="daily-stats-label">3 tries</span>
      </div>
    </div>
    <div class="daily-stats-source">${stats.sourceLabel}</div>`;
}

function _renderDailyQuestionModalBody(summary = getDailyQuestionSummary()) {
  const { record, round, solved, failed, done, nextHint } = summary;
  const stats = getDailyQuestionStats(record.date);
  const copied = !!record.shareCopiedAt;

  if (!round) {
    return `<div class="daily-loop-shell"><div class="daily-loop-empty">Daily question unavailable right now.</div></div>`;
  }

  if (done) {
    const shareGrid = buildDailyResultGrid(record);
    const solveTitle = solved ? 'Daily Solved' : 'Daily Locked';
    const solveSub = solved
      ? `You got it in ${record.attemptsUsed} ${record.attemptsUsed === 1 ? 'try' : 'tries'}.`
      : 'Three attempts used. Come back tomorrow for a fresh one.';
    const rewardCopy = solved && record.reward
      ? `+${record.reward.xpAwarded || 0} XP and +$${(record.reward.cashAwarded || 0) + (record.completionReward?.cashAwarded || 0)} total rewards.`
      : record.completionReward
        ? `You still banked +$${record.completionReward.cashAwarded || 0} for showing up.`
        : '';

    return `
      <div class="daily-loop-shell">
        <div class="daily-loop-kicker">Finlingo Daily #${record.dailyNumber}</div>
        <div class="daily-loop-title">${solveTitle}</div>
        <div class="daily-loop-sub">${solveSub} ${rewardCopy}</div>
        <div class="daily-attempt-row">${_renderDailyAttemptPips(record)}</div>
        <div class="daily-loop-explanation">${_escapeDailyHtml(round.explanation || '')}</div>
        <div class="daily-share-shell">
          <div class="daily-share-label">Shareable result</div>
          <pre class="daily-share-grid">${_escapeDailyHtml(shareGrid)}</pre>
          <button class="btn btn-primary daily-share-btn" onclick="copyDailyResultGrid()">${copied ? 'Copied' : 'Copy Result'}</button>
        </div>
        <div class="daily-loop-section-label">Accuracy Snapshot</div>
        ${_renderDailyStatsMarkup(stats)}
      </div>`;
  }

  const attemptCopy = record.attemptsUsed === 0
    ? '3 attempts max'
    : `${summary.attemptsRemaining} ${summary.attemptsRemaining === 1 ? 'attempt' : 'attempts'} left`;
  const hintMarkup = nextHint
    ? `<div class="daily-hint-box">${_escapeDailyHtml(nextHint)}</div>`
    : `<div class="daily-hint-box daily-hint-box-muted">Wrong attempts reveal hints. The answer pool is large.</div>`;

  return `
    <div class="daily-loop-shell">
      <div class="daily-loop-kicker">Finlingo Daily #${record.dailyNumber}</div>
      <div class="daily-loop-title">Daily question</div>
      <div class="daily-loop-sub">${attemptCopy} · Three attempts.</div>
      <div class="daily-attempt-row">${_renderDailyAttemptPips(record)}</div>
      <div class="daily-loop-question">${_escapeDailyHtml(round.q || round.question || '')}</div>
      <div class="daily-option-grid">
        ${(round.options || []).map((option, index) => {
          const used = (record.usedOptionIndexes || []).includes(index);
          const cls = `daily-option-btn${used ? ' daily-option-btn-used' : ''}`;
          return `
            <button class="${cls}" onclick="submitDailyQuestionAttempt(${index})" ${used ? 'disabled' : ''}>
              <span class="daily-option-key">${String.fromCharCode(65 + index)}</span>
              <span>${_escapeDailyHtml(option)}</span>
            </button>`;
        }).join('')}
      </div>
      ${hintMarkup}
    </div>`;
}

function openDailyQuestion() {
  const summary = getDailyQuestionSummary();
  showAppModal({
    icon: 'gold',
    title: summary.done ? 'Daily Result' : 'Daily Question',
    body: _renderDailyQuestionModalBody(summary),
    bodyIsHTML: true,
    showClose: true,
    boxClass: 'daily-loop-modal'
  });
}

function submitDailyQuestionAttempt(optionIndex) {
  const summary = getDailyQuestionSummary();
  const record = summary.record;
  const round = summary.round;
  if (!record || !round || ['solved', 'failed'].includes(record.status)) return;
  if ((record.usedOptionIndexes || []).includes(optionIndex)) return;

  record.usedOptionIndexes = [...(record.usedOptionIndexes || []), optionIndex];
  record.attemptsUsed = Math.min(DAILY_LOOP_MAX_ATTEMPTS, Math.max(0, Number(record.attemptsUsed) || 0) + 1);

  const correct = optionIndex === round.answer;
  if (correct) {
    const solveReward = DAILY_LOOP_SOLVE_REWARDS[record.attemptsUsed] || DAILY_LOOP_SOLVE_REWARDS[3];
    record.status = 'solved';
    record.solvedAt = new Date().toISOString();
    record.reward = awardRewards({
      baseXp: solveReward.xp,
      baseCash: solveReward.cash,
      source: 'daily_question_solved',
      meta: {
        rewardId: `daily-question:${record.date}`,
        questionId: round.questionId || round.id,
        topicId: 'daily'
      }
    });
    record.completionReward = awardRewards({
      baseCash: DAILY_LOOP_COMPLETION_CASH,
      source: 'daily_complete',
      meta: {
        rewardId: `daily-complete:${record.date}`
      }
    });
    S.dailyOn = record.date;
    recordDailyQuestionStats(record);
    save();
    if (typeof updateTopbar === 'function') updateTopbar();
    if (typeof updateHome === 'function') updateHome();
    if (record.reward?.xpAwarded) showXpPop(record.reward.xpAwarded);
    if (typeof showCashPop === 'function') {
      const totalCash = (record.reward?.cashAwarded || 0) + (record.completionReward?.cashAwarded || 0);
      if (totalCash > 0) showCashPop(totalCash);
    }
    showToast('Daily solved', 'success');
    openDailyQuestion();
    return;
  }

  if (record.attemptsUsed >= DAILY_LOOP_MAX_ATTEMPTS) {
    record.status = 'failed';
    record.failedAt = new Date().toISOString();
    record.reward = null;
    record.completionReward = awardRewards({
      baseCash: DAILY_LOOP_COMPLETION_CASH,
      source: 'daily_complete',
      meta: {
        rewardId: `daily-complete:${record.date}`
      }
    });
    S.dailyOn = record.date;
    recordDailyQuestionStats(record);
    save();
    if (typeof updateTopbar === 'function') updateTopbar();
    if (typeof updateHome === 'function') updateHome();
    if (typeof showCashPop === 'function' && (record.completionReward?.cashAwarded || 0) > 0) {
      showCashPop(record.completionReward.cashAwarded || 0);
    }
    showToast('Daily locked until tomorrow', 'error');
    openDailyQuestion();
    return;
  }

  record.status = 'in_progress';
  save();
  if (typeof updateHome === 'function') updateHome();
  openDailyQuestion();
}

function _dailyCardActionLabel(summary) {
  if (summary.done) return 'View Result';
  if (summary.record.status === 'in_progress') return 'Resume Daily';
  return "Play Today's Question";
}

function _renderDailyQuestionHomeMarkup(summary = getDailyQuestionSummary()) {
  const { record, solved, failed, attemptsRemaining, nextHint, streak, freezeCount, nextMilestone } = summary;
  const round = summary.round;
  const statusCopy = solved
    ? `Solved in ${record.attemptsUsed} ${record.attemptsUsed === 1 ? 'try' : 'tries'}`
    : failed
      ? 'Locked until tomorrow'
      : record.status === 'in_progress'
        ? `${attemptsRemaining} ${attemptsRemaining === 1 ? 'attempt' : 'attempts'} left`
        : 'Three attempts. New question tomorrow.';
  const streakCopy = streak > 0
    ? `${streak}-day streak${nextMilestone ? ` - next at ${nextMilestone}` : ' - max momentum'}`
    : 'No active streak yet';
  const freezeCopy = freezeCount > 0
    ? `${freezeCount} freeze${freezeCount === 1 ? '' : 's'} ready`
    : 'No freeze ready';
  const copied = !!record.shareCopiedAt;
  const resolvedCopy = solved
    ? `You earned +${record.reward?.xpAwarded || 0} XP and +$${(record.reward?.cashAwarded || 0) + (record.completionReward?.cashAwarded || 0)}.`
    : failed
      ? `You still earned +$${record.completionReward?.cashAwarded || 0} for showing up.`
      : nextHint || 'Wrong answers reveal hints. The pool stays the same size.';

  return `
    <div class="daily-card-top">
      <div class="daily-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="#9a6f00" stroke-width="2.5" style="width:11px;height:11px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Daily Question
      </div>
      <div class="daily-title">Finlingo Daily #${record.dailyNumber}</div>
      <div class="daily-sub">${_escapeDailyHtml(round?.q || round?.question || 'New question every day.')}</div>
    </div>
    <div class="daily-status-row">
      <div class="daily-status-text">${statusCopy}</div>
      <div class="daily-attempt-row">${_renderDailyAttemptPips(record)}</div>
    </div>
    <div class="daily-meta-row">
      <span>${streakCopy}</span>
      <span>${freezeCopy}</span>
    </div>
    <div class="daily-support-copy">${_escapeDailyHtml(resolvedCopy)}</div>
    <div class="daily-home-actions">
      <button class="btn btn-gold" id="dailyBtn" onclick="openDailyQuestion()">${_dailyCardActionLabel(summary)}</button>
      ${summary.done ? `
        <button class="btn btn-secondary daily-copy-btn" onclick="copyDailyResultGrid()">${copied ? 'Copied' : 'Copy Result'}</button>
      ` : ''}
    </div>`;
}

function _isWeekendForPrediction(dateKey) {
  const day = new Date(`${dateKey}T12:00:00`).getDay();
  return day === 5 || day === 6 || day === 0;
}

function _getNyNowParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(now).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0)
  };
}

function _nextIsoDate(dateKey, days = 1) {
  const value = new Date(`${dateKey}T00:00:00`);
  value.setDate(value.getDate() + days);
  const mm = String(value.getMonth() + 1).padStart(2, '0');
  const dd = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${mm}-${dd}`;
}

function _nextTradingDate(dateKey) {
  let candidate = _nextIsoDate(dateKey, 1);
  while (_isWeekendForPrediction(candidate)) {
    candidate = _nextIsoDate(candidate, 1);
  }
  return candidate;
}

function _loadDailyPredictionCommunityStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DAILY_PREDICTION_COMMUNITY_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function _saveDailyPredictionCommunityStore(store) {
  localStorage.setItem(DAILY_PREDICTION_COMMUNITY_STORAGE_KEY, JSON.stringify(store || {}));
}

function _hashDailyPredictionKey(value) {
  const source = String(value || '');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getDailyPredictionPrompt(dateKey = today()) {
  const weekendMode = _isWeekendForPrediction(dateKey);
  const nyNow = _getNyNowParts();
  const symbol = weekendMode
    ? 'BTC'
    : DAILY_MARKET_PREDICTION_SYMBOLS[getDailyQuestionSeed(dateKey) % DAILY_MARKET_PREDICTION_SYMBOLS.length];
  const stockRevealOn = (dateKey === nyNow.date && nyNow.hour < 17)
    ? dateKey
    : _nextTradingDate(dateKey);
  const revealOn = weekendMode ? _nextIsoDate(dateKey, 1) : stockRevealOn;
  const prompt = weekendMode
    ? 'Will BTC finish up or down by tomorrow?'
    : revealOn === dateKey
      ? `Will ${symbol} close up or down today?`
      : `Will ${symbol} close up or down by the next close?`;
  const sub = weekendMode
    ? 'One call for the next day. Reveal tomorrow.'
    : revealOn === dateKey
      ? 'One call before the close. Reveal after the bell.'
      : 'One call before the next close. Reveal after the bell.';
  return {
    date: dateKey,
    promptId: `prediction:${dateKey}:${symbol}`,
    symbol,
    revealOn,
    prompt,
    sub
  };
}

function _createDailyPredictionRecord(dateKey = today()) {
  return {
    ...getDailyPredictionPrompt(dateKey),
    submittedChoice: null,
    basePrice: null,
    basePriceAsOf: null,
    submittedAt: null,
    resolved: false,
    resolvedAt: null,
    latestPrice: null,
    actualDirection: null,
    correct: null,
    reward: null,
    rewardId: null,
    stakeAmount: 0,
    potentialPayout: 0,
    settledPayout: 0,
    netReturn: 0,
    marketSnapshot: null,
    communityVoteRecorded: false,
    communitySnapshot: null
  };
}

function _buildMockPredictionCommunityEntry(record) {
  const promptId = String(record?.promptId || '');
  const hash = _hashDailyPredictionKey(promptId);
  const totalCount = 84 + (hash % 121);
  const upPctSeed = 42 + ((Math.floor(hash / 7)) % 19);
  const upCount = Math.max(18, Math.min(totalCount - 18, Math.round((totalCount * upPctSeed) / 100)));
  const downCount = Math.max(1, totalCount - upCount);
  return {
    promptId,
    date: record?.date || today(),
    symbol: record?.symbol || '',
    upCount,
    downCount,
    totalCount: upCount + downCount,
    participantCount: upCount + downCount,
    source: 'local_beta',
    sourceLabel: 'Beta sample',
    updatedAt: new Date().toISOString()
  };
}

function _normalizePredictionCommunityEntry(entry, record) {
  const upCount = Math.max(0, Math.round(Number(entry?.upCount) || 0));
  const downCount = Math.max(0, Math.round(Number(entry?.downCount) || 0));
  const totalCount = Math.max(0, Number(entry?.totalCount) || (upCount + downCount));
  return {
    promptId: record?.promptId || String(entry?.promptId || ''),
    date: record?.date || entry?.date || today(),
    symbol: record?.symbol || entry?.symbol || '',
    upCount,
    downCount,
    totalCount: Math.max(totalCount, upCount + downCount),
    participantCount: Math.max(0, Math.round(Number(entry?.participantCount) || totalCount || (upCount + downCount))),
    source: entry?.source || 'local_beta',
    sourceLabel: entry?.sourceLabel || 'Beta sample',
    updatedAt: entry?.updatedAt || null
  };
}

function _getDailyPredictionCommunityEntry(record) {
  if (!record?.promptId) return null;
  const store = _loadDailyPredictionCommunityStore();
  const existing = store[record.promptId];
  if (existing && typeof existing === 'object') {
    return _normalizePredictionCommunityEntry(existing, record);
  }
  const seeded = _buildMockPredictionCommunityEntry(record);
  store[record.promptId] = seeded;
  _saveDailyPredictionCommunityStore(store);
  return seeded;
}

function _saveDailyPredictionCommunityEntry(entry) {
  if (!entry?.promptId) return;
  const store = _loadDailyPredictionCommunityStore();
  store[entry.promptId] = {
    ...entry,
    totalCount: Math.max(0, Number(entry.totalCount) || (Number(entry.upCount) || 0) + (Number(entry.downCount) || 0)),
    participantCount: Math.max(0, Number(entry.participantCount) || Number(entry.totalCount) || 0)
  };
  _saveDailyPredictionCommunityStore(store);
}

function _buildDailyPredictionCommunitySnapshot(entry, selectedChoice) {
  const upCount = Math.max(0, Math.round(Number(entry?.upCount) || 0));
  const downCount = Math.max(0, Math.round(Number(entry?.downCount) || 0));
  const totalCount = Math.max(0, Number(entry?.totalCount) || (upCount + downCount));
  const upPct = totalCount > 0 ? Math.round((upCount / totalCount) * 100) : 0;
  const downPct = totalCount > 0 ? Math.max(0, 100 - upPct) : 0;
  return {
    promptId: entry?.promptId || '',
    date: entry?.date || today(),
    symbol: entry?.symbol || '',
    upCount,
    downCount,
    totalCount,
    participantCount: Math.max(0, Number(entry?.participantCount) || totalCount),
    upPct,
    downPct,
    source: entry?.source || 'local_beta',
    sourceLabel: entry?.sourceLabel || 'Beta sample',
    updatedAt: entry?.updatedAt || null,
    selectedChoice: selectedChoice || null
  };
}

function _recordDailyPredictionCommunityVote(record, choice = record?.submittedChoice) {
  if (!record?.promptId || !['yes', 'no'].includes(choice || '')) {
    return record?.communitySnapshot || null;
  }
  const entry = _getDailyPredictionCommunityEntry(record);
  if (!entry) return record?.communitySnapshot || null;
  if (!record.communityVoteRecorded) {
    if (choice === 'yes') entry.upCount += 1;
    else entry.downCount += 1;
    entry.totalCount = entry.upCount + entry.downCount;
    entry.participantCount = entry.totalCount;
    entry.updatedAt = new Date().toISOString();
    _saveDailyPredictionCommunityEntry(entry);
    record.communityVoteRecorded = true;
  }
  const snapshot = _buildDailyPredictionCommunitySnapshot(entry, choice);
  record.communitySnapshot = snapshot;
  return snapshot;
}

function getDailyPredictionCommunitySummary(record = _ensureDailyPredictionRecord()) {
  if (!record?.submittedChoice) return null;
  if (!record.communityVoteRecorded) {
    return _recordDailyPredictionCommunityVote(record, record.submittedChoice);
  }
  const entry = _getDailyPredictionCommunityEntry(record);
  if (!entry) return record.communitySnapshot || null;
  const snapshot = _buildDailyPredictionCommunitySnapshot(entry, record.submittedChoice);
  record.communitySnapshot = snapshot;
  return snapshot;
}

function _isDailyPredictionSnapshotFresh(snapshot, maxAgeMs = 45000) {
  const stamp = snapshot?.modeledAt || snapshot?.asOf;
  if (!stamp) return false;
  const timeValue = new Date(stamp).getTime();
  if (Number.isNaN(timeValue)) return false;
  return (Date.now() - timeValue) < maxAgeMs;
}

function _getDailyPredictionVolatilityProfile(symbol) {
  const profiles = {
    BTC: 3.4,
    TSLA: 2.8,
    NVDA: 2.5,
    AMZN: 1.9,
    GOOGL: 1.7,
    AAPL: 1.5,
    VOO: 1.15
  };
  return profiles[symbol] || 1.8;
}

function _getDailyPredictionClockContext(record) {
  const nyNow = _getNyNowParts();
  const currentMinutes = (nyNow.hour * 60) + nyNow.minute;
  if (record?.symbol === 'BTC') {
    const elapsed = _clampDailyNumber(currentMinutes, 0, 1440);
    const remaining = Math.max(0, 1440 - elapsed);
    return {
      minutesRemaining: remaining,
      progress: _clampDailyNumber(elapsed / 1440, 0, 1),
      contextLabel: 'Through today',
      revealLabel: 'Resolves tomorrow'
    };
  }

  const sessionOpen = (9 * 60) + 30;
  const sessionClose = 16 * 60;
  const sessionSpan = sessionClose - sessionOpen;
  const sameRevealDay = record?.revealOn === nyNow.date;
  if (!sameRevealDay) {
    return {
      minutesRemaining: sessionSpan,
      progress: 0.14,
      contextLabel: 'Before the next session',
      revealLabel: 'Resolves after the next close'
    };
  }

  const elapsed = _clampDailyNumber(currentMinutes - sessionOpen, 0, sessionSpan);
  const remaining = Math.max(0, sessionClose - currentMinutes);
  return {
    minutesRemaining: remaining,
    progress: _clampDailyNumber(elapsed / sessionSpan, 0, 1),
    contextLabel: currentMinutes < sessionOpen
      ? 'Before the open'
      : currentMinutes >= sessionClose
        ? 'After the close'
        : 'Through today',
    revealLabel: 'Resolves after the bell'
  };
}

function _buildDailyPredictionMarketSnapshot(record, quote, communityEntry = _getDailyPredictionCommunityEntry(record)) {
  const price = Number(quote?.price) || 0;
  const previousClose = Number(quote?.previousClose) > 0
    ? Number(quote.previousClose)
    : price;
  const openPrice = Number(quote?.open) > 0
    ? Number(quote.open)
    : previousClose;
  const currentMovePct = previousClose > 0
    ? ((price - previousClose) / previousClose) * 100
    : 0;
  const momentumPct = openPrice > 0
    ? ((price - openPrice) / openPrice) * 100
    : currentMovePct;
  const communityUpPct = _buildDailyPredictionCommunitySnapshot(communityEntry, null).upPct;
  const context = _getDailyPredictionClockContext(record);
  const volatility = _getDailyPredictionVolatilityProfile(record?.symbol);
  const rawSignal = ((currentMovePct * 0.64) + (momentumPct * 0.36)) / Math.max(0.9, volatility);
  const timeWeight = 0.38 + (context.progress * 0.72);
  const modelUp = _clampDailyNumber(50 + (rawSignal * 8.4 * timeWeight), 35, 65);
  const weightedUp = (modelUp * DAILY_PREDICTION_MODEL_WEIGHT) + (communityUpPct * DAILY_PREDICTION_COMMUNITY_WEIGHT);
  const marketUp = Math.round(_clampDailyNumber(50 + ((weightedUp - 50) * 0.92), 35, 65));
  return {
    symbol: record?.symbol || '',
    asOf: quote?.asOf || new Date().toISOString(),
    modeledAt: new Date().toISOString(),
    price: _roundDailyNumber(price, 2),
    previousClose: _roundDailyNumber(previousClose, 2),
    openPrice: _roundDailyNumber(openPrice, 2),
    currentMovePct: _roundDailyNumber(currentMovePct, 2),
    momentumPct: _roundDailyNumber(momentumPct, 2),
    timeRemainingMinutes: Math.round(context.minutesRemaining),
    revealLabel: context.revealLabel,
    contextLabel: context.contextLabel,
    modelUpPct: Math.round(modelUp),
    modelDownPct: Math.max(0, 100 - Math.round(modelUp)),
    communityUpPct,
    communityDownPct: Math.max(0, 100 - communityUpPct),
    marketUpPct: marketUp,
    marketDownPct: Math.max(0, 100 - marketUp),
    participantCount: Math.max(0, Number(communityEntry?.participantCount) || Number(communityEntry?.totalCount) || 0)
  };
}

function _getDailyPredictionStakeOptions() {
  const availableCash = Math.max(0, Math.floor(Number(S.cash) || 0));
  if (availableCash <= 0) return [];
  const options = DAILY_PREDICTION_STAKE_PRESETS.filter(amount => amount <= availableCash);
  if (availableCash < DAILY_PREDICTION_STAKE_PRESETS[0]) {
    options.push(availableCash);
  } else if (!options.includes(availableCash) && availableCash < DAILY_PREDICTION_STAKE_PRESETS[DAILY_PREDICTION_STAKE_PRESETS.length - 1]) {
    options.push(availableCash);
  }
  return [...new Set(options.filter(amount => amount > 0).sort((a, b) => a - b))];
}

function _getDefaultDailyPredictionStake() {
  const availableCash = Math.max(0, Math.floor(Number(S.cash) || 0));
  if (availableCash >= 50) return 50;
  if (availableCash >= 25) return 25;
  if (availableCash >= 10) return 10;
  if (availableCash > 0) return availableCash;
  return 0;
}

function _normalizeDailyPredictionStakeCount(value, fallback = DAILY_PREDICTION_MAX_STAKES) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return Math.max(0, Math.round(Number(fallback) || 0));
  return Math.max(0, parsed);
}

function _ensureDailyPredictionStakeState() {
  const state = _ensureDailyLoopState();
  const prediction = state.prediction || (state.prediction = {});
  let changed = false;
  const todayKey = today();
  const max = Math.max(1, _normalizeDailyPredictionStakeCount(prediction.stakesMax, DAILY_PREDICTION_MAX_STAKES));
  if (prediction.stakesMax !== max) {
    prediction.stakesMax = max;
    changed = true;
  }

  let available = _normalizeDailyPredictionStakeCount(prediction.stakesAvailable, max);
  if (String(prediction.stakesRefilledOn || '') !== todayKey) {
    available = max;
    prediction.stakesRefilledOn = todayKey;
    changed = true;
  }
  if (available > max) {
    available = max;
    changed = true;
  }
  if (prediction.stakesAvailable !== available) {
    prediction.stakesAvailable = available;
    changed = true;
  }

  return { available, max, changed };
}

function _getAvailableDailyPredictionStakes() {
  return _ensureDailyPredictionStakeState().available;
}

function _consumeDailyPredictionStake() {
  const state = _ensureDailyLoopState();
  const stakeState = _ensureDailyPredictionStakeState();
  if (stakeState.available <= 0) return 0;
  state.prediction.stakesAvailable = Math.max(0, stakeState.available - 1);
  return state.prediction.stakesAvailable;
}

function _normalizeDailyPredictionStake(amount) {
  const availableCash = Math.max(0, Math.floor(Number(S.cash) || 0));
  if (availableCash <= 0) return 0;
  const normalized = Math.max(0, Math.floor(Number(amount) || 0));
  return _clampDailyNumber(normalized, 0, availableCash);
}

function _getDailyPredictionSelectedStake(record = _ensureDailyPredictionRecord()) {
  const normalized = _normalizeDailyPredictionStake(record?.stakeAmount);
  if (normalized > 0) return normalized;
  return _getDefaultDailyPredictionStake();
}

function _renderDailyPredictionStakesMarkup({ compact = false } = {}) {
  const stakeState = _ensureDailyPredictionStakeState();
  const availableLabel = stakeState.available === 1 ? 'Attempt remaining' : 'Attempts remaining';
  return `
    <div class="daily-stakes-chip${compact ? ' compact' : ''}" aria-label="${stakeState.available} ${availableLabel}">
      <span class="daily-stakes-chip-label">Attempts</span>
      <strong class="daily-stakes-chip-value">${stakeState.available}</strong>
      <span class="daily-stakes-chip-copy">${compact ? `of ${stakeState.max}` : availableLabel}</span>
    </div>`;
}

function _getDailyPredictionPotentialPayout(stakeAmount, selectedPct) {
  const stake = Math.max(0, Math.floor(Number(stakeAmount) || 0));
  const probability = _clampDailyNumber((Number(selectedPct) || 0) / 100, 0.35, 0.65);
  if (stake <= 0) return 0;
  const multiplier = _clampDailyNumber(DAILY_PREDICTION_PAYOUT_EDGE / probability, 1.22, 2.65);
  return Math.max(stake + 1, Math.round(stake * multiplier));
}

function _getDailyPredictionChoicePayout(snapshot, choice, stakeAmount) {
  if (!snapshot) return 0;
  return _getDailyPredictionPotentialPayout(
    stakeAmount,
    choice === 'yes' ? snapshot.marketUpPct : snapshot.marketDownPct
  );
}

function _lockDailyPredictionStake(stakeAmount) {
  const normalized = Math.max(0, Math.floor(Number(stakeAmount) || 0));
  if (normalized <= 0) return 0;
  S.cash = Math.max(0, _roundDailyNumber((Number(S.cash) || 0) - normalized, 2));
  if (typeof recordPortfolioCashFlow === 'function') {
    recordPortfolioCashFlow(-normalized, {
      source: 'daily_prediction_stake',
      recordedAt: new Date().toISOString()
    });
  }
  if (typeof syncDerivedProgressState === 'function') syncDerivedProgressState();
  return normalized;
}

function _applyDailyPredictionPayout(payoutAmount) {
  const normalized = Math.max(0, Math.floor(Number(payoutAmount) || 0));
  if (normalized <= 0) return 0;
  S.cash = _roundDailyNumber((Number(S.cash) || 0) + normalized, 2);
  if (typeof recordPortfolioCashFlow === 'function') {
    recordPortfolioCashFlow(normalized, {
      source: 'daily_prediction_payout',
      recordedAt: new Date().toISOString()
    });
  }
  if (typeof syncDerivedProgressState === 'function') syncDerivedProgressState();
  return normalized;
}

function setDailyPredictionStake(amount) {
  const record = _ensureDailyPredictionRecord();
  if (record?.submittedChoice) return;
  const normalized = _normalizeDailyPredictionStake(amount);
  record.stakeAmount = normalized;
  if (typeof save === 'function') save();
  renderDailyLoopHomeCards();
  if (_dailyPredictionModalOpen) openDailyPredictionModal();
}

async function refreshDailyPredictionMarketSnapshot(force = false) {
  const record = _ensureDailyPredictionRecord();
  if (record?.submittedChoice) return record?.marketSnapshot || null;
  if (!force && _isDailyPredictionSnapshotFresh(record?.marketSnapshot)) return record.marketSnapshot;
  if (_dailyPredictionMarketPending) return record?.marketSnapshot || null;

  _dailyPredictionMarketPending = true;
  _dailyPredictionMarketLastAttemptAt = Date.now();
  try {
    const quote = await fetchDailyPredictionQuote(record.symbol);
    const communityEntry = _getDailyPredictionCommunityEntry(record);
    record.marketSnapshot = _buildDailyPredictionMarketSnapshot(record, quote, communityEntry);
    if (_getDailyPredictionSelectedStake(record) <= 0) {
      record.stakeAmount = _getDefaultDailyPredictionStake();
    }
    if (typeof save === 'function') save();
    return record.marketSnapshot;
  } catch {
    return record?.marketSnapshot || null;
  } finally {
    _dailyPredictionMarketPending = false;
    renderDailyLoopHomeCards();
    if (_dailyPredictionModalOpen) openDailyPredictionModal();
  }
}

function _getDailyPredictionChoiceLabel(choice) {
  return choice === 'yes' ? 'Up' : 'Down';
}

function _renderDailyPredictionOddsMarkup(snapshot, {
  selectedChoice = null,
  stakeAmount = 0,
  showPayout = true
} = {}) {
  if (!snapshot) {
    return `
      <div class="daily-odds-shell">
        <div class="daily-prediction-row-head">
          <div class="daily-loop-section-label">Market Odds</div>
          <div class="daily-odds-source">${_dailyPredictionMarketPending ? 'Loading live data' : 'Live data unavailable'}</div>
        </div>
        <div class="daily-stats-empty">
          ${_dailyPredictionMarketPending ? 'Building today’s market odds…' : 'Market odds will appear once live pricing is available.'}
        </div>
      </div>`;
  }

  const upPayout = _getDailyPredictionChoicePayout(snapshot, 'yes', stakeAmount);
  const downPayout = _getDailyPredictionChoicePayout(snapshot, 'no', stakeAmount);
  return `
    <div class="daily-odds-shell">
      <div class="daily-prediction-row-head">
        <div class="daily-loop-section-label">Market Odds</div>
        <div class="daily-odds-source">${_escapeDailyHtml(snapshot.contextLabel || 'Live read')}</div>
      </div>
      <div class="daily-odds-grid">
        <div class="daily-odds-side down${selectedChoice === 'no' ? ' is-selected' : ''}">
          <span class="daily-odds-label">Down</span>
          <span class="daily-odds-value">${snapshot.marketDownPct}%</span>
          ${showPayout ? `<span class="daily-odds-sub">Pays ${formatDisplayMoney(downPayout)}</span>` : ''}
        </div>
        <div class="daily-odds-side up${selectedChoice === 'yes' ? ' is-selected' : ''}">
          <span class="daily-odds-label">Up</span>
          <span class="daily-odds-value">${snapshot.marketUpPct}%</span>
          ${showPayout ? `<span class="daily-odds-sub">Pays ${formatDisplayMoney(upPayout)}</span>` : ''}
        </div>
      </div>
      <div class="daily-odds-foot">Blended from live market behavior and today’s hidden community positioning.</div>
    </div>`;
}

function _renderDailyPredictionStakeSelectorMarkup(record, snapshot) {
  const stakeAmount = _getDailyPredictionSelectedStake(record);
  const options = _getDailyPredictionStakeOptions();
  const availableStakes = _getAvailableDailyPredictionStakes();
  if (availableStakes <= 0) {
    return `
      <div class="daily-stake-shell">
        <div class="daily-prediction-row-head">
          <div class="daily-loop-section-label">Stake</div>
          <div class="daily-odds-source">Available ${formatDisplayMoney(S.cash || 0)}</div>
        </div>
        <div class="daily-hint-box daily-hint-box-muted">
          You are out of daily prediction stakes for now. Fresh stakes refill on the next daily market cycle.
        </div>
      </div>`;
  }
  if (!options.length) {
    return `
      <div class="daily-stake-shell">
        <div class="daily-prediction-row-head">
          <div class="daily-loop-section-label">Stake</div>
          <div class="daily-odds-source">Available ${formatDisplayMoney(S.cash || 0)}</div>
        </div>
        <div class="daily-hint-box daily-hint-box-muted">
          Earn a little cash in Learn or the Daily Question to place today’s prediction.
        </div>
      </div>`;
  }

  return `
    <div class="daily-stake-shell">
      <div class="daily-prediction-row-head">
        <div class="daily-loop-section-label">Stake</div>
        <div class="daily-odds-source">Available ${formatDisplayMoney(S.cash || 0)}</div>
      </div>
      <div class="daily-stake-chip-row">
        ${options.map(amount => `
          <button
            type="button"
            class="daily-stake-chip${amount === stakeAmount ? ' is-selected' : ''}"
            onclick="setDailyPredictionStake(${amount})">
            ${formatDisplayMoney(amount)}
          </button>
        `).join('')}
      </div>
      <div class="daily-stake-foot">
        Pick a side below. Your stake locks now, and the payout uses the displayed odds.
      </div>
      ${snapshot ? `
        <div class="daily-stake-payout-row">
          <span>Down pays ${formatDisplayMoney(_getDailyPredictionChoicePayout(snapshot, 'no', stakeAmount))}</span>
          <span>Up pays ${formatDisplayMoney(_getDailyPredictionChoicePayout(snapshot, 'yes', stakeAmount))}</span>
        </div>
      ` : ''}
    </div>`;
}

function _renderDailyPredictionWagerSummaryMarkup(record) {
  const stake = Math.max(0, Number(record?.stakeAmount) || 0);
  const payout = Math.max(0, Number(record?.potentialPayout) || 0);
  const settledPayout = Math.max(0, Number(record?.settledPayout) || 0);
  const resultText = !record?.resolved
    ? 'Potential Payout'
    : record.correct
      ? 'Payout'
      : 'Result';
  const resultValue = !record?.resolved
    ? formatDisplayMoney(payout)
    : record.correct
      ? formatDisplayMoney(settledPayout || payout)
      : `-${formatDisplayMoney(stake).replace('$', '$')}`;
  return `
    <div class="daily-wager-shell">
      <div class="daily-wager-grid">
        <div class="daily-wager-item">
          <span class="daily-wager-label">Stake</span>
          <strong>${formatDisplayMoney(stake)}</strong>
        </div>
        <div class="daily-wager-item">
          <span class="daily-wager-label">${resultText}</span>
          <strong>${resultValue}</strong>
        </div>
      </div>
      <div class="daily-wager-foot">
        ${record?.resolved && record.correct
          ? 'Correct calls return the full payout, including your original stake.'
          : !record?.resolved
            ? 'Potential payout includes your locked stake.'
            : 'Missed calls lose the locked stake, but a fresh market appears tomorrow.'}
      </div>
    </div>`;
}

function _renderDailyPredictionCommunityMarkup(record) {
  const summary = getDailyPredictionCommunitySummary(record);
  if (!summary) return '';
  const pickedUp = summary.selectedChoice === 'yes';
  return `
    <div class="daily-community-shell">
      <div class="daily-community-head">
        <div class="daily-community-head-block">
          <div class="daily-loop-section-label">Your Pick</div>
          <div class="daily-community-pick-row">
            <span class="daily-community-pick-chip ${pickedUp ? 'up' : 'down'} is-selected">${pickedUp ? 'Up' : 'Down'}</span>
            <span class="daily-community-pick-copy">${Math.max(0, summary.participantCount || 0)} picks</span>
          </div>
        </div>
        <div class="daily-community-head-block daily-community-head-block-right">
          <div class="daily-loop-section-label">Community Split</div>
          <div class="daily-community-source">${_escapeDailyHtml(summary.sourceLabel || 'Beta sample')}</div>
        </div>
      </div>
      <div class="daily-community-bar" aria-label="Community split">
        <span class="daily-community-bar-fill down" style="width:${summary.downPct}%"></span>
        <span class="daily-community-bar-fill up" style="width:${summary.upPct}%"></span>
      </div>
      <div class="daily-community-stats">
        <div class="daily-community-side down${!pickedUp ? ' is-selected' : ''}">
          <span class="daily-community-side-value">${summary.downPct}%</span>
          <span class="daily-community-side-label">Down</span>
        </div>
        <div class="daily-community-side up${pickedUp ? ' is-selected' : ''}">
          <span class="daily-community-side-value">${summary.upPct}%</span>
          <span class="daily-community-side-label">Up</span>
        </div>
      </div>
    </div>`;
}

function _dailyPredictionHomeActionLabel(record) {
  if (!record?.submittedChoice) return 'Make Pick';
  if (!record.resolved) return 'View Pick';
  return 'View Reveal';
}

function _renderDailyPredictionHomeMarkup(record = _ensureDailyPredictionRecord()) {
  if (record?.submittedChoice && !record.resolved && _isPredictionRevealReady(record)) {
    maybeResolveDailyPrediction(true);
  }

  const snapshot = record?.marketSnapshot;
  const selectedStake = _getDailyPredictionSelectedStake(record);
  const communityMarkup = record?.submittedChoice ? _renderDailyPredictionCommunityMarkup(record) : '';
  const statusCopy = !record?.submittedChoice
    ? snapshot
      ? `Market Odds · ${snapshot.marketDownPct}% Down · ${snapshot.marketUpPct}% Up`
      : 'Pick up or down. Odds load when markets open.'
    : record.resolved
      ? `${record.correct ? 'Prediction hit' : 'Prediction missed'} · ${record.actualDirection === 'yes' ? 'Closed up' : 'Closed down'}`
      : `${_getDailyPredictionChoiceLabel(record.submittedChoice)} · Stake ${formatDisplayMoney(record.stakeAmount || 0)} · Pays ${formatDisplayMoney(record.potentialPayout || 0)}`;
  const supportCopy = !record?.submittedChoice
    ? snapshot
      ? `${record.symbol} at ${formatDisplayMoney(snapshot.price || 0)} · Stake ${formatDisplayMoney(selectedStake)}`
      : `Will ${record.symbol} finish up or down by the next reveal?`
    : record.resolved
      ? `${record.symbol} moved from ${formatDisplayMoney(record.basePrice || 0)} to ${formatDisplayMoney(record.latestPrice || 0)}.${record.correct ? ` Payout ${formatDisplayMoney(record.settledPayout || record.potentialPayout || 0)} and +${record.reward?.xpAwarded || 0} XP.` : ' Fresh read tomorrow.'}`
      : `${record.symbol === 'BTC' ? 'Reveals tomorrow.' : 'Reveals after the next close.'}`;

  return `
    <div class="daily-card-top">
      <div class="daily-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="#00b84a" stroke-width="2.2" style="width:11px;height:11px">
          <path d="M4 18l5-5 4 3 7-8"></path>
          <path d="M14 8h6v6"></path>
        </svg>
        Daily Market Prediction
      </div>
      <div class="daily-title">${_escapeDailyHtml(record.prompt || 'Make today’s market call')}</div>
      <div class="daily-sub">${statusCopy}</div>
    </div>
    <div class="daily-stakes-chip-row">
      ${_renderDailyPredictionStakesMarkup({ compact: true })}
    </div>
    ${communityMarkup}
    <div class="daily-support-copy">${_escapeDailyHtml(supportCopy)}</div>
    <div class="daily-home-actions">
      <button class="btn btn-primary" onclick="openDailyPredictionModal()">${_dailyPredictionHomeActionLabel(record)}</button>
      <button class="btn btn-secondary daily-open-market-btn" onclick="showMarket()">Open Market</button>
    </div>`;
}

function _archivePredictionRecord(record) {
  if (!record?.promptId) return;
  const state = _ensureDailyLoopState();
  const existing = (state.prediction.history || []).filter(entry => entry?.promptId !== record.promptId);
  state.prediction.history = _trimDailyHistory([{ ...record }, ...existing]);
}

function _ensureDailyPredictionRecord() {
  const state = _ensureDailyLoopState();
  const active = state.prediction.active;
  let shouldPersistBackfill = false;
  const hadExplicitStakeCount = Number.isFinite(Number(state.prediction?.stakesAvailable));
  const stakeState = _ensureDailyPredictionStakeState();
  if (stakeState.changed) shouldPersistBackfill = true;
  if (!active) {
    state.prediction.active = _createDailyPredictionRecord();
    if (_getDailyPredictionSelectedStake(state.prediction.active) > 0) {
      state.prediction.active.stakeAmount = _getDailyPredictionSelectedStake(state.prediction.active);
    }
    if (shouldPersistBackfill && typeof save === 'function') save();
    return state.prediction.active;
  }

  const resolvedDay = typeof active.resolvedAt === 'string'
    ? active.resolvedAt.slice(0, 10)
    : null;
  if (active.resolved && active.date !== today() && resolvedDay && resolvedDay < today()) {
    _archivePredictionRecord(active);
    state.prediction.active = _createDailyPredictionRecord();
  }

  state.prediction.active = {
    ..._createDailyPredictionRecord(active.date || today()),
    ...state.prediction.active
  };
  if (
    !hadExplicitStakeCount
    && state.prediction.active.submittedChoice
    && state.prediction.active.date === today()
    && state.prediction.stakesAvailable === state.prediction.stakesMax
  ) {
    state.prediction.stakesAvailable = Math.max(0, Number(state.prediction.stakesMax) - 1);
    shouldPersistBackfill = true;
  }
  if (!state.prediction.active.submittedChoice && _getDailyPredictionSelectedStake(state.prediction.active) > 0) {
    state.prediction.active.stakeAmount = _getDailyPredictionSelectedStake(state.prediction.active);
  }
  if (state.prediction.active.submittedChoice) {
    if (!state.prediction.active.communityVoteRecorded) {
      _recordDailyPredictionCommunityVote(state.prediction.active, state.prediction.active.submittedChoice);
      shouldPersistBackfill = true;
    } else {
      const snapshot = getDailyPredictionCommunitySummary(state.prediction.active);
      if (snapshot) state.prediction.active.communitySnapshot = snapshot;
    }
  }
  if (shouldPersistBackfill && typeof save === 'function') save();
  return state.prediction.active;
}

function _isPredictionRevealReady(record) {
  if (!record?.revealOn) return false;
  if (record.symbol === 'BTC') {
    return today() >= record.revealOn;
  }
  const nyNow = _getNyNowParts();
  return nyNow.date > record.revealOn || (nyNow.date === record.revealOn && nyNow.hour >= 17);
}

function _dailyApiCandidates(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const candidates = [];
  const addCandidate = candidate => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };
  const origin = window?.location?.origin && window.location.origin !== 'null'
    ? window.location.origin
    : '';
  if (origin) addCandidate(`${origin}${normalizedPath}`);
  else addCandidate(normalizedPath);
  addCandidate(`http://127.0.0.1:8000${normalizedPath}`);
  addCandidate(`http://localhost:8000${normalizedPath}`);
  return candidates;
}

async function _fetchDailyJson(path) {
  let lastError = null;
  const candidates = _dailyApiCandidates(path);
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const response = await fetch(candidate, { credentials: 'same-origin' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        lastError = new Error(payload?.error || `Request failed (${response.status})`);
        if ([404, 500, 502, 503].includes(response.status) && index < candidates.length - 1) {
          continue;
        }
        throw lastError;
      }
      return await response.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Request failed');
}

async function fetchDailyPredictionQuote(symbol) {
  const path = `/api/quotes?symbols=${encodeURIComponent(symbol)}`;
  const payload = typeof _fetchMarketJson === 'function'
    ? await _fetchMarketJson(path, {
      notFoundMessage: 'Quote API route not found. Start python3 server.py so /api/quotes is available.',
      invalidPayloadMessage: 'Quote payload missing'
    })
    : await _fetchDailyJson(path);
  const symbolError = payload?._errors?.[symbol];
  if (symbolError) {
    throw new Error(symbolError);
  }
  const quote = payload?.[symbol];
  const price = Number(quote?.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Live quote unavailable');
  }
  return quote;
}

function isDailyPredictionPending() {
  return _dailyPredictionFetchPending;
}

async function submitDailyPrediction(choice) {
  const record = _ensureDailyPredictionRecord();
  if (!choice || record?.submittedChoice || _dailyPredictionFetchPending) return;
  const availableStakes = _getAvailableDailyPredictionStakes();
  if (availableStakes <= 0) {
    showToast('No attempts available right now. Fresh attempts refill tomorrow.', 'error');
    return;
  }
  const normalizedStake = _getDailyPredictionSelectedStake(record);
  if (normalizedStake <= 0) {
    showToast('Earn a little cash first to place today’s prediction', 'error');
    return;
  }
  _dailyPredictionFetchPending = true;
  renderDailyLoopHomeCards();
  if (typeof renderMarket === 'function') renderMarket();
  try {
    const quote = await fetchDailyPredictionQuote(record.symbol);
    const snapshot = _buildDailyPredictionMarketSnapshot(
      record,
      quote,
      _getDailyPredictionCommunityEntry(record)
    );
    const potentialPayout = _getDailyPredictionChoicePayout(snapshot, choice, normalizedStake);
    if (potentialPayout <= 0) {
      throw new Error('Market odds unavailable right now');
    }

    _lockDailyPredictionStake(normalizedStake);
    _consumeDailyPredictionStake();
    record.submittedChoice = choice;
    record.basePrice = Number(quote.price);
    record.basePriceAsOf = quote.asOf || new Date().toISOString();
    record.submittedAt = new Date().toISOString();
    record.resolved = false;
    record.stakeAmount = normalizedStake;
    record.marketSnapshot = snapshot;
    record.potentialPayout = potentialPayout;
    record.settledPayout = 0;
    record.netReturn = -normalizedStake;
    record.communityVoteRecorded = false;
    record.communitySnapshot = _recordDailyPredictionCommunityVote(record, choice);
    save();
    if (typeof updateTopbar === 'function') updateTopbar();
    showToast(`Prediction locked · ${formatDisplayMoney(normalizedStake)} staked`, 'success');
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Prediction quote unavailable', 'error');
  } finally {
    _dailyPredictionFetchPending = false;
    renderDailyLoopHomeCards();
    if (typeof renderMarket === 'function') renderMarket();
    if (_dailyPredictionModalOpen) openDailyPredictionModal();
  }
}

async function maybeResolveDailyPrediction(force = false) {
  const record = _ensureDailyPredictionRecord();
  if (!record?.submittedChoice || record.resolved) return record;
  if (!force && !_isPredictionRevealReady(record)) return record;
  if (_dailyPredictionResolvePending) return record;

  _dailyPredictionResolvePending = true;
  try {
    const quote = await fetchDailyPredictionQuote(record.symbol);
    const latestPrice = Number(quote.price);
    if (!Number.isFinite(latestPrice) || latestPrice <= 0) return record;

    const actualUp = latestPrice > Number(record.basePrice || 0);
    const pickedUp = record.submittedChoice === 'yes';
    record.resolved = true;
    record.resolvedAt = new Date().toISOString();
    record.latestPrice = latestPrice;
    record.actualDirection = actualUp ? 'yes' : 'no';
    record.correct = actualUp === pickedUp;
    record.settledPayout = 0;
    record.netReturn = -Math.max(0, Number(record.stakeAmount) || 0);

    if (record.correct) {
      const payout = record.settledPayout > 0
        ? record.settledPayout
        : _applyDailyPredictionPayout(record.potentialPayout || 0);
      record.settledPayout = payout;
      record.netReturn = payout - Math.max(0, Number(record.stakeAmount) || 0);
      if (!record.rewardId) {
        const reward = awardRewards({
          baseXp: 15,
          baseCash: 0,
          source: 'daily_prediction_correct',
          meta: {
            rewardId: `daily-prediction:${record.promptId}`
          }
        });
        record.rewardId = `daily-prediction:${record.promptId}`;
        record.reward = reward;
        if (reward?.xpAwarded) showXpPop(reward.xpAwarded);
      }
      if (typeof showCashPop === 'function' && payout > 0) showCashPop(payout);
    }

    save();
    if (typeof updateTopbar === 'function') updateTopbar();
    if (typeof renderMarket === 'function') renderMarket();
    renderDailyLoopHomeCards();
    if (_dailyPredictionModalOpen) openDailyPredictionModal();
    return record;
  } catch {
    return record;
  } finally {
    _dailyPredictionResolvePending = false;
  }
}

function _renderDailyPredictionModalBody() {
  const record = _ensureDailyPredictionRecord();
  const revealReady = _isPredictionRevealReady(record);
  const pending = _dailyPredictionFetchPending;
  const selectedStake = _getDailyPredictionSelectedStake(record);
  const availableStakes = _getAvailableDailyPredictionStakes();
  const canPlace = selectedStake > 0 && availableStakes > 0 && !pending;
  const pendingAttr = canPlace ? '' : 'disabled';
  const snapshot = record?.marketSnapshot;
  const communityMarkup = record?.submittedChoice ? _renderDailyPredictionCommunityMarkup(record) : '';

  if (record?.submittedChoice && !record.resolved && revealReady) {
    maybeResolveDailyPrediction(true);
  }

  if (!record?.submittedChoice) {
    return `
      <div class="daily-loop-shell">
        <div class="daily-loop-kicker">Daily Market Prediction</div>
        <div class="daily-loop-title">${_escapeDailyHtml(record.prompt)}</div>
        <div class="daily-loop-sub">${_escapeDailyHtml(record.sub)}</div>
        <div class="daily-stakes-chip-row">
          ${_renderDailyPredictionStakesMarkup()}
        </div>
        ${_renderDailyPredictionOddsMarkup(snapshot, { stakeAmount: selectedStake })}
        ${_renderDailyPredictionStakeSelectorMarkup(record, snapshot)}
        <div class="daily-prediction-actions">
          <button class="btn btn-secondary" onclick="submitDailyPrediction('no')" ${pendingAttr}>Pick Down</button>
          <button class="btn btn-primary" onclick="submitDailyPrediction('yes')" ${pendingAttr}>Pick Up</button>
        </div>
      </div>`;
  }

  if (!record.resolved) {
    return `
      <div class="daily-loop-shell">
        <div class="daily-loop-kicker">Daily Market Prediction</div>
        <div class="daily-loop-title">${record.symbol} locked</div>
        <div class="daily-loop-sub">
          You picked <strong>${_getDailyPredictionChoiceLabel(record.submittedChoice)}</strong> from ${formatDisplayMoney(record.basePrice || 0)}.
        </div>
        <div class="daily-stakes-chip-row">
          ${_renderDailyPredictionStakesMarkup()}
        </div>
        ${_renderDailyPredictionOddsMarkup(record.marketSnapshot, { selectedChoice: record.submittedChoice, showPayout: false })}
        ${_renderDailyPredictionWagerSummaryMarkup(record)}
        ${communityMarkup}
        <div class="daily-hint-box daily-hint-box-muted">
          ${record.marketSnapshot?.revealLabel || (record.symbol === 'BTC' ? 'Reveals tomorrow.' : 'Reveals after the next close.')}
        </div>
        <button class="btn btn-secondary" onclick="showMarket()">Back to Market</button>
      </div>`;
  }

  return `
    <div class="daily-loop-shell">
      <div class="daily-loop-kicker">Daily Market Prediction</div>
      <div class="daily-loop-title">${record.correct ? 'Prediction Hit' : 'Prediction Missed'}</div>
      <div class="daily-loop-sub">
        ${record.symbol} moved ${record.actualDirection === 'yes' ? 'higher' : 'lower'} from ${formatDisplayMoney(record.basePrice || 0)} to ${formatDisplayMoney(record.latestPrice || 0)}.
      </div>
      <div class="daily-stakes-chip-row">
        ${_renderDailyPredictionStakesMarkup()}
      </div>
      ${_renderDailyPredictionOddsMarkup(record.marketSnapshot, { selectedChoice: record.submittedChoice, showPayout: false })}
      ${_renderDailyPredictionWagerSummaryMarkup(record)}
      ${communityMarkup}
      <div class="daily-hint-box ${record.correct ? '' : 'daily-hint-box-muted'}">
        ${record.correct
          ? `+${record.reward?.xpAwarded || 0} XP and ${formatDisplayMoney(record.settledPayout || record.potentialPayout || 0)} returned to your balance.`
          : `Your ${formatDisplayMoney(record.stakeAmount || 0)} stake was lost. Tomorrow brings a fresh call.`}
      </div>
      <button class="btn btn-secondary" onclick="showMarket()">Back to Market</button>
    </div>`;
}

function openDailyPredictionModal() {
  _dailyPredictionModalOpen = true;
  showAppModal({
    icon: 'neutral',
    title: 'Daily Market Prediction',
    body: _renderDailyPredictionModalBody(),
    bodyIsHTML: true,
    actions: [],
    showClose: true,
    boxClass: 'daily-loop-modal',
    onClose: () => {
      _dailyPredictionModalOpen = false;
    }
  });
  if (!_ensureDailyPredictionRecord()?.submittedChoice) {
    refreshDailyPredictionMarketSnapshot(false);
  }
}

function renderDailyLoopHomeCards() {
  const predictionCard = document.getElementById('dailyPredictionCard');
  if (predictionCard) {
    const record = _ensureDailyPredictionRecord();
    if (
      !record?.submittedChoice
      && !record.marketSnapshot
      && !_dailyPredictionMarketPending
      && ((Date.now() - _dailyPredictionMarketLastAttemptAt) > 60000)
    ) {
      refreshDailyPredictionMarketSnapshot(false);
    }
    predictionCard.className = `daily-card daily-card-featured daily-card-secondary${record?.submittedChoice ? (record.resolved ? (record.correct ? ' daily-card-win' : ' daily-card-loss') : ' daily-card-muted') : ''}`;
    predictionCard.innerHTML = _renderDailyPredictionHomeMarkup(record);
  }
  const dailyCard = document.getElementById('dailyQuestionCard');
  if (dailyCard) {
    dailyCard.className = 'daily-card daily-card-compact';
    dailyCard.innerHTML = _renderDailyQuestionHomeMarkup();
  }
}
