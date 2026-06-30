// ============================================================
// state.js
// App state management:
//   - S  — the single state object (learning progress)
//   - save()  — persist to localStorage + Supabase
//   - today() — returns today's date as "YYYY-MM-DD"
//   - getLevel() — legacy helper retained for compatibility
//   - tryIncrementStreak() — legacy no-op retained for compatibility
//
// NOTE: depends on data.js (STORAGE_KEY, LEVELS) and supabase.js (sbUpsert)
// ============================================================
 
function getDefaultInventory() {
  return {
    streakSavers: 0,
    utilities: {},
    cosmetics: []
  };
}

function getDefaultRewardsSummary() {
  return {
    latest: null,
    history: [],
    appliedRewardIds: [],
    lastPromotion: null,
    streakRepair: null,
    marketRewardPrompt: null,
    dailyLoop: getDefaultDailyLoopState(),
    fluency: getDefaultFluencyState()
  };
}

function getDefaultAchievements() {
  return {};
}

function getDefaultLessonMiniProgress() {
  return {};
}

function getDefaultRefresherQuiz() {
  return {
    lastPromptedOn: null,
    lastStartedOn: null,
    lastCompletedOn: null,
    lastQuestionIds: []
  };
}

function getDefaultPortfolio() {
  return {
    version: 2,
    lastPriceRefreshOn: null,
    lastSimulatedAt: null,
    allTimeHigh: 0,
    allTimeHighOn: null,
    assets: {},
    holdings: {},
    history: [],
    transactions: [],
    customAssets: [],
    watchlist: []
  };
}

function getDefaultDailyLoopState() {
  return {
    question: {
      date: null,
      dailyNumber: 0,
      status: 'unanswered', // unanswered | in_progress | solved | failed
      attemptsUsed: 0,
      usedOptionIndexes: [],
      solvedAt: null,
      failedAt: null,
      reward: null,
      completionReward: null,
      statsRecorded: false,
      shareCopiedAt: null
    },
    questionHistory: [],
    prediction: {
      stakesAvailable: 3,
      stakesMax: 3,
      stakesRefilledOn: null,
      active: null,
      history: []
    },
    chartGuess: {
      enabled: true,
      lastOpenedOn: null,
      active: null,
      history: []
    }
  };
}

function getDefaultFluencyState() {
  return {
    unlockedLessonIds: [],
    terms: {},
    activeSession: null,
    sessionHistory: [],
    lastSurfacedLessonId: null
  };
}

function getDefaultState() {
  return {
    xp: 0,
    totalXP: 0,
    level: 1,
    rank: null,
    streak: 0,
    streakDate: null,
    completedIds: [],         // lesson IDs the user has finished
    unlockedIds: [1],         // compatibility cache; normalized from completedIds + unit access
    totalCorrect: 0,
    totalAnswered: 0,
    cash: 0,
    streakFreeze: false,
    dailyOn: null,            // date the daily challenge was last played
    user: null,               // { id, name, email, tier, avatarColor }
    finlingoMode: 'personal', // 'personal' | 'leader' — Classroom role (Account setting)
    classroomJoinedIds: [],   // classroom ids the user has joined as a learner
    onboarding: null,         // null = not done; { done, goal, level, topics, completedAt } when complete
    firstWinComplete: false,
    firstWinPending: false,
    bestScores: {},           // { lessonId: score } e.g. { 1: 3, 2: 4 }
    lastLessonDate: null,
    quests: null,
    mastery: {},              // { [topicId]: { attempts, correct, wrong, masteryScore, ... } }
    reviewQueue: [],          // [{ questionId, topicId, nextReviewAt, ... }]
    lessonMiniProgress: getDefaultLessonMiniProgress(),
    refresherQuiz: getDefaultRefresherQuiz(),
    inventory: getDefaultInventory(),
    pendingUnlocks: [],
    rewardsSummary: getDefaultRewardsSummary(),
    achievements: getDefaultAchievements(),
    portfolio: getDefaultPortfolio()
  };
}

// ── DEFAULT STATE ─────────────────────────────────────────────
// This is what a brand-new user's state looks like.
const DEF = getDefaultState();

function normalizeState(rawState = {}) {
  const next = { ...getDefaultState(), ...(rawState || {}) };
  next.completedIds = Array.isArray(rawState?.completedIds)
    ? [...new Set(rawState.completedIds.map(id => Number(id)).filter(Number.isFinite))].sort((a, b) => a - b)
    : [];
  next.unlockedIds = Array.isArray(rawState?.unlockedIds) && rawState.unlockedIds.length > 0
    ? rawState.unlockedIds
    : [1];
  next.bestScores = rawState?.bestScores && typeof rawState.bestScores === 'object'
    ? rawState.bestScores
    : {};
  next.mastery = rawState?.mastery && typeof rawState.mastery === 'object'
    ? rawState.mastery
    : {};
  next.reviewQueue = Array.isArray(rawState?.reviewQueue)
    ? rawState.reviewQueue
    : [];
  next.lessonMiniProgress = rawState?.lessonMiniProgress && typeof rawState.lessonMiniProgress === 'object'
    ? rawState.lessonMiniProgress
    : getDefaultLessonMiniProgress();
  next.refresherQuiz = {
    ...getDefaultRefresherQuiz(),
    ...(rawState?.refresherQuiz || {})
  };
  next.inventory = {
    ...getDefaultInventory(),
    ...(rawState?.inventory || {})
  };
  next.pendingUnlocks = Array.isArray(rawState?.pendingUnlocks)
    ? rawState.pendingUnlocks
    : [];
  next.rewardsSummary = {
    ...getDefaultRewardsSummary(),
    ...(rawState?.rewardsSummary || {})
  };
  next.achievements = rawState?.achievements && typeof rawState.achievements === 'object'
    ? rawState.achievements
    : getDefaultAchievements();
  next.portfolio = rawState?.portfolio && typeof rawState.portfolio === 'object'
    ? {
        ...getDefaultPortfolio(),
        ...(rawState.portfolio?.version === 2 ? rawState.portfolio : {})
      }
    : getDefaultPortfolio();
  next.rewardsSummary.history = Array.isArray(next.rewardsSummary.history)
    ? next.rewardsSummary.history
    : [];
  next.rewardsSummary.appliedRewardIds = Array.isArray(next.rewardsSummary.appliedRewardIds)
    ? next.rewardsSummary.appliedRewardIds
    : [];
  next.rewardsSummary.streakRepair = next.rewardsSummary?.streakRepair && typeof next.rewardsSummary.streakRepair === 'object'
    ? next.rewardsSummary.streakRepair
    : null;
  next.rewardsSummary.marketRewardPrompt = next.rewardsSummary?.marketRewardPrompt && typeof next.rewardsSummary.marketRewardPrompt === 'object'
    ? next.rewardsSummary.marketRewardPrompt
    : null;
  next.rewardsSummary.dailyLoop = next.rewardsSummary?.dailyLoop && typeof next.rewardsSummary.dailyLoop === 'object'
    ? {
        ...getDefaultDailyLoopState(),
        ...next.rewardsSummary.dailyLoop,
        question: {
          ...getDefaultDailyLoopState().question,
          ...(next.rewardsSummary.dailyLoop.question || {})
        },
        questionHistory: Array.isArray(next.rewardsSummary.dailyLoop.questionHistory)
          ? next.rewardsSummary.dailyLoop.questionHistory
          : [],
        prediction: {
          ...getDefaultDailyLoopState().prediction,
          ...(next.rewardsSummary.dailyLoop.prediction || {}),
          history: Array.isArray(next.rewardsSummary.dailyLoop?.prediction?.history)
            ? next.rewardsSummary.dailyLoop.prediction.history
            : []
        },
        chartGuess: {
          ...getDefaultDailyLoopState().chartGuess,
          ...(next.rewardsSummary.dailyLoop.chartGuess || {}),
          history: Array.isArray(next.rewardsSummary.dailyLoop?.chartGuess?.history)
            ? next.rewardsSummary.dailyLoop.chartGuess.history
            : []
        }
      }
    : getDefaultDailyLoopState();
  next.rewardsSummary.fluency = next.rewardsSummary?.fluency && typeof next.rewardsSummary.fluency === 'object'
    ? {
        ...getDefaultFluencyState(),
        ...next.rewardsSummary.fluency,
        unlockedLessonIds: Array.isArray(next.rewardsSummary.fluency.unlockedLessonIds)
          ? next.rewardsSummary.fluency.unlockedLessonIds
          : [],
        terms: next.rewardsSummary.fluency.terms && typeof next.rewardsSummary.fluency.terms === 'object'
          ? next.rewardsSummary.fluency.terms
          : {},
        activeSession: next.rewardsSummary.fluency.activeSession && typeof next.rewardsSummary.fluency.activeSession === 'object'
          ? next.rewardsSummary.fluency.activeSession
          : null,
        sessionHistory: Array.isArray(next.rewardsSummary.fluency.sessionHistory)
          ? next.rewardsSummary.fluency.sessionHistory
          : []
      }
    : getDefaultFluencyState();
  next.refresherQuiz.lastQuestionIds = Array.isArray(next.refresherQuiz.lastQuestionIds)
    ? next.refresherQuiz.lastQuestionIds
    : [];
  next.portfolio.assets = next.portfolio?.assets && typeof next.portfolio.assets === 'object'
    ? next.portfolio.assets
    : {};
  next.portfolio.holdings = next.portfolio?.holdings && typeof next.portfolio.holdings === 'object'
    ? next.portfolio.holdings
    : {};
  next.portfolio.history = Array.isArray(next.portfolio?.history)
    ? next.portfolio.history
    : [];
  next.portfolio.transactions = Array.isArray(next.portfolio?.transactions)
    ? next.portfolio.transactions
    : [];
  next.portfolio.customAssets = Array.isArray(next.portfolio?.customAssets)
    ? next.portfolio.customAssets
    : [];
  next.portfolio.watchlist = Array.isArray(next.portfolio?.watchlist)
    ? next.portfolio.watchlist
    : [];
  next.portfolio.allTimeHigh = Math.max(0, Number(next.portfolio?.allTimeHigh) || 0);
  next.portfolio.allTimeHighOn = typeof next.portfolio?.allTimeHighOn === 'string'
    ? next.portfolio.allTimeHighOn
    : null;
  next.firstWinComplete = rawState?.firstWinComplete === true;
  next.firstWinPending = rawState?.firstWinPending === true && !next.firstWinComplete;

  next.xp = 0;
  next.totalXP = 0;
  next.level = 1;
  next.rank = null;
  next.streak = 0;
  next.streakDate = null;
  next.cash = 0;
  next.streakFreeze = false;
  next.inventory = getDefaultInventory();
  next.pendingUnlocks = [];
  next.achievements = getDefaultAchievements();
  next.rewardsSummary.latest = null;
  next.rewardsSummary.history = [];
  next.rewardsSummary.appliedRewardIds = [];
  next.rewardsSummary.lastPromotion = null;
  next.rewardsSummary.streakRepair = null;
  next.rewardsSummary.marketRewardPrompt = null;
  if (next.user && typeof next.user === 'object') {
    next.user.tier = 'standard';
  }
  if (typeof buildDerivedUnlockedIds === 'function') {
    next.unlockedIds = buildDerivedUnlockedIds(next.completedIds, next.user);
  }
  delete next.xpBoostEndsAt;
  next.finlingoMode = rawState?.finlingoMode === 'leader' ? 'leader' : 'personal';
  next.classroomJoinedIds = Array.isArray(rawState?.classroomJoinedIds)
    ? [...new Set(rawState.classroomJoinedIds.filter(id => typeof id === 'string' && id))]
    : [];
  return syncDerivedProgressState(next);
}

// ── LOAD STATE ───────────────────────────────────────────────
// Reads the most relevant local snapshot for the current user.
// If an email-specific backup exists, prefer it. If not, fall back to
// the shared app state unless it clearly belongs to a different account.
function loadState(email = null) {
  const normalizedEmail = typeof email === 'string'
    ? email.trim().toLowerCase()
    : '';

  const parseState = raw => {
    if (!raw) return null;
    try {
      return normalizeState(JSON.parse(raw));
    } catch {
      return null;
    }
  };

  if (normalizedEmail) {
    const userScoped = parseState(localStorage.getItem('finlingo_v4_' + normalizedEmail));
    if (userScoped) return userScoped;
  }

  const shared = parseState(localStorage.getItem(STORAGE_KEY));
  if (!shared) return normalizeState();

  if (
    normalizedEmail &&
    shared.user?.email &&
    shared.user.email.trim().toLowerCase() !== normalizedEmail &&
    shared.user.id
  ) {
    return normalizeState();
  }

  return shared;
}

// Reads local state for an authenticated account without inheriting
// anonymous/shared progress from a guest or a different user.
function loadAuthenticatedState(email = null, authId = null) {
  const normalizedEmail = typeof email === 'string'
    ? email.trim().toLowerCase()
    : '';

  if (!normalizedEmail && !authId) return normalizeState();

  const candidate = loadState(normalizedEmail);
  const candidateEmail = typeof candidate.user?.email === 'string'
    ? candidate.user.email.trim().toLowerCase()
    : '';
  const candidateAuthId = candidate.user?.id || null;

  return (normalizedEmail && candidateEmail === normalizedEmail) || (authId && candidateAuthId === authId)
    ? candidate
    : normalizeState();
}
 
// ── STATE OBJECT (S) ──────────────────────────────────────────
// On page load we try to restore state from localStorage.
// If nothing is saved (or it's corrupt), we fall back to DEF.
let S = loadState();
 
// ── QUIZ SESSION VARIABLES ────────────────────────────────────
// These are reset at the start of every quiz, so they live here
// as module-level variables rather than inside S.
let mode          = 'lesson'; // 'lesson' | 'daily' | 'review' | 'refresher'
let currentLesson = null;     // the full lesson object currently being played
let qIdx          = 0;        // current question index (0-based)
let selected      = null;     // index of the currently selected answer choice
let locked        = false;    // true after the user has checked an answer
let lessonCorrect = 0;        // correct answers in the current quiz run
let lessonXp      = 0;
let lessonBaseXp  = 0;
let lessonStartXp = 0;
let runCorrectStreak = 0;
let runBestCorrectStreak = 0;
let runMomentumBonusXp = 0;
let runPerfectBonusXp = 0;
let runHotStreakAwarded = false;
let runMegaStreakShown = false;

let _extendedProgressSyncTimer = null;

function _queueExtendedProgressSync() {
  if (!S.user?.id || typeof sbPatch !== 'function') return;
  if (_extendedProgressSyncTimer) clearTimeout(_extendedProgressSyncTimer);

  _extendedProgressSyncTimer = setTimeout(() => {
    sbPatch('progress', `?user_id=eq.${S.user.id}`, {
      mastery_summary: S.mastery || {},
      review_queue: S.reviewQueue || [],
      inventory: S.inventory || getDefaultInventory(),
      pending_unlocks: S.pendingUnlocks || [],
      rewards_summary: S.rewardsSummary || getDefaultRewardsSummary(),
      achievements: S.achievements || getDefaultAchievements()
    }).catch(() => {});
  }, 450);
}
 
 
// ── SAVE ──────────────────────────────────────────────────────
// Writes the current state to localStorage.
// Also writes to a user-scoped key (for multi-account support)
// and syncs to Supabase if the user is logged in.
function persistLocalState() {
  S = normalizeState(S);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(S));
 
  // Extra per-email backup key (survives a logout)
  if (S.user?.email) {
    localStorage.setItem('finlingo_v4_' + S.user.email, JSON.stringify(S));
  }
}

function save() {
  persistLocalState();
 
  // Sync to Supabase (non-blocking — errors are silently swallowed)
  if (S.user?.id) {
    sbUpsert('progress', {
      user_id:       S.user.id,
      xp:            S.xp,
      streak:        S.streak,
      streak_date:   S.streakDate || null,
      completed_ids: S.completedIds,
      unlocked_ids:  S.unlockedIds,
      total_correct: S.totalCorrect,
      total_answered:S.totalAnswered,
      cash:          S.cash || 0,
      tier:          'standard',
      daily_on:      S.dailyOn,
      joined_date:   S.joinedDate,
      avatar_color:  S.user.avatarColor || '#1a1a1a',
      updated_at:    new Date().toISOString()
    }).catch(() => {});
    _queueExtendedProgressSync();
  }
}
 
 
// ── TODAY ─────────────────────────────────────────────────────
// Returns today's date as a zero-padded ISO string "YYYY-MM-DD".
// Zero-padding matters: "2026-3-4" !== "2026-03-04".
function today() {
  const d  = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
 
 
// ── XP LEVEL HELPERS ──────────────────────────────────────────
function getXPForLevel(level = 1) {
  const normalizedLevel = Math.max(1, Math.round(Number(level) || 1));
  let xpRequired = 0;
  let step = XP_LEVEL_BASE_STEP;
  for (let currentLevel = 1; currentLevel < normalizedLevel; currentLevel++) {
    xpRequired += step;
    step += XP_LEVEL_STEP_GROWTH;
  }
  return xpRequired;
}

function getLevelFromXP(xp = S.xp) {
  const normalizedXp = Math.max(0, Math.round(Number(xp) || 0));
  let level = 1;
  let nextThreshold = XP_LEVEL_BASE_STEP;
  let step = XP_LEVEL_BASE_STEP;

  while (normalizedXp >= nextThreshold) {
    level += 1;
    step += XP_LEVEL_STEP_GROWTH;
    nextThreshold += step;
  }

  return level;
}

function getXPToNextLevel(xp = S.xp) {
  const normalizedXp = Math.max(0, Math.round(Number(xp) || 0));
  const level = getLevelFromXP(normalizedXp);
  return Math.max(0, getXPForLevel(level + 1) - normalizedXp);
}

function getLevelProgress(xp = S.xp) {
  const normalizedXp = 0;
  const level = getLevelFromXP(normalizedXp);
  const levelStartXp = getXPForLevel(level);
  const nextLevel = level + 1;
  const nextLevelXp = getXPForLevel(nextLevel);
  const levelSpan = Math.max(1, nextLevelXp - levelStartXp);
  const xpIntoLevel = Math.max(0, normalizedXp - levelStartXp);
  const progressPct = Math.max(0, Math.min(100, (xpIntoLevel / levelSpan) * 100));

  return {
    xp: normalizedXp,
    level,
    nextLevel,
    levelStartXp,
    nextLevelXp,
    levelSpan,
    xpIntoLevel,
    xpToNextLevel: Math.max(0, nextLevelXp - normalizedXp),
    progressPct,
    progressLabel: `${normalizedXp.toLocaleString()} / ${nextLevelXp.toLocaleString()} XP`
  };
}

// ── CAREER RANK HELPERS ──────────────────────────────────────
function getPortfolioNetWorth(state = S) {
  const cash = 0;
  const holdings = state?.portfolio?.holdings && typeof state.portfolio.holdings === 'object'
    ? state.portfolio.holdings
    : {};
  const assets = state?.portfolio?.assets && typeof state.portfolio.assets === 'object'
    ? state.portfolio.assets
    : {};

  let holdingsValue = 0;
  Object.values(holdings).forEach(rawHolding => {
    const symbol = rawHolding?.symbol;
    const quantity = Math.max(0, Number(rawHolding?.quantity) || 0);
    const livePrice = Number(assets?.[symbol]?.price);
    const fallbackValue = Math.max(0, Number(rawHolding?.totalCost) || 0);
    const holdingValue = quantity > 0 && Number.isFinite(livePrice) && livePrice > 0
      ? quantity * livePrice
      : fallbackValue;
    holdingsValue += holdingValue;
  });

  return Math.round((cash + holdingsValue) * 100) / 100;
}

function getCareerRank(netWorth = getPortfolioNetWorth()) {
  const normalizedNetWorth = Math.max(0, Number(netWorth) || 0);
  let current = LEVELS[0];
  for (const rank of LEVELS) {
    if (normalizedNetWorth >= rank.min) current = rank;
  }
  return current;
}

function getCareerRankSummary(netWorth = getPortfolioNetWorth()) {
  const normalizedNetWorth = Math.max(0, Number(netWorth) || 0);
  const currentRank = getCareerRank(normalizedNetWorth);
  const currentIndex = LEVELS.indexOf(currentRank);
  const nextRank = currentRank?.next ? LEVELS[currentIndex + 1] : null;
  const rankSpan = currentRank?.next ? currentRank.next - currentRank.min : 1;
  const valueIntoRank = Math.max(0, normalizedNetWorth - (currentRank?.min || 0));
  const progressPct = nextRank
    ? Math.max(0, Math.min(100, (valueIntoRank / rankSpan) * 100))
    : 100;

  return {
    netWorth: normalizedNetWorth,
    currentRank,
    nextRank,
    valueIntoRank,
    rankSpan,
    netWorthToNextRank: nextRank ? Math.max(0, currentRank.next - normalizedNetWorth) : 0,
    progressPct,
    progressLabel: nextRank
      ? `$${Math.round(normalizedNetWorth).toLocaleString()} / $${currentRank.next.toLocaleString()}`
      : `$${Math.round(normalizedNetWorth).toLocaleString()}`
  };
}

// ── LEGACY CAREER HELPER ─────────────────────────────────────
// Preserved for older call sites; now expects net worth rather than XP.
function getLevel(netWorth) {
  return getCareerRank(netWorth);
}

function syncDerivedProgressState(target = S) {
  if (!target || typeof target !== 'object') return target;
  target.xp = 0;
  target.totalXP = 0;
  target.level = 1;
  target.rank = null;
  target.streak = 0;
  target.streakDate = null;
  target.cash = 0;
  target.streakFreeze = false;
  target.pendingUnlocks = [];
  target.inventory = getDefaultInventory();
  if (target.user && typeof target.user === 'object') target.user.tier = 'standard';
  if (target.firstWinComplete) target.firstWinPending = false;
  return target;
}
 
 
// ── TRY INCREMENT STREAK ──────────────────────────────────────
// Called after the first qualifying lesson completion of the day.
// Increments the streak at most ONCE per calendar day and returns
// a small status object so UI celebrations can fire only when the
// streak actually changes.
function tryIncrementStreak() {
  const t = today();
  return {
    changed: false,
    status: 'disabled',
    streak: 0,
    previousStreak: 0,
    countedOn: t
  };
}

// ── COMPOUNDING BOOST HELPERS ────────────────────────────────
function getCompoundingLevel(xp = S.xp) {
  return getLevelFromXP(xp);
}

function getCompoundingBoost(level = getCompoundingLevel()) {
  const normalizedLevel = Math.max(1, Math.round(Number(level) || 1));
  let multiplier = 1;
  for (const threshold of COMPOUNDING_BOOST_LEVELS) {
    if (normalizedLevel >= threshold.level) multiplier = threshold.multiplier;
  }
  return multiplier;
}

function getNextCompoundingBoost(level = getCompoundingLevel()) {
  const normalizedLevel = Math.max(1, Math.round(Number(level) || 1));
  return COMPOUNDING_BOOST_LEVELS.find(threshold => threshold.level > normalizedLevel) || null;
}

function getCompoundingBoostMeta(xp = S.xp) {
  const level = getCompoundingLevel(typeof xp === 'number' ? xp : S.xp);
  const multiplier = getCompoundingBoost(level);
  const next = getNextCompoundingBoost(level);

  return {
    label: COMPOUNDING_BOOST_LABEL,
    source: 'level',
    sourceName: 'Learning profile',
    level,
    multiplier,
    nextLevel: next?.level || null,
    nextMultiplier: next?.multiplier || null
  };
}

function getCompoundingBoostMultiplier(xp = S.xp) {
  return getCompoundingBoostMeta(xp).multiplier || 1;
}

function formatMultiplier(multiplier) {
  const pct = Math.round((Math.max(0, Number(multiplier) || 1) - 1) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

// ── REWARD CALCULATION HELPER ────────────────────────────────
// Calculates boosted XP and portfolio cash from base rewards without mutating state.
function calculateReward(baseXp, baseCash, {
  includeCompounding = true,
  xp = S.xp,
} = {}) {
  return {
    baseXp: 0,
    xpAwarded: 0,
    baseCash: 0,
    cashAwarded: 0,
    compoundingMultiplier: 1,
    totalMultiplier: 1
  };
}

// ── XP AWARD HELPER ──────────────────────────────────────────
// Backward-compatible XP-only wrapper used in previews and older award sites.
function calculateXpAward(baseXp, options = {}) {
  const reward = calculateReward(baseXp, 0, options);
  return {
    baseXp: reward.baseXp,
    xpAwarded: reward.xpAwarded,
    compoundingMultiplier: reward.compoundingMultiplier,
    totalMultiplier: reward.totalMultiplier
  };
}

// Backward-compatible helper used in older award sites.
function getXpMultiplier() {
  return calculateXpAward(1).totalMultiplier;
}
