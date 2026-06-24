(function (global) {
  const RECENT_REWARD_IDS_LIMIT = 50;
  const RECENT_REWARD_HISTORY_LIMIT = 12;
  const LESSON_ACHIEVEMENT_MILESTONES = [5, 25, 50, 100];
  const STREAK_ACHIEVEMENT_MILESTONES = [3, 7, 30];

  function _ensureAchievements() {
    if (!S.achievements || typeof S.achievements !== 'object') {
      S.achievements = {};
    }
    return S.achievements;
  }

  function _ensureRewardsSummary() {
    if (!S.rewardsSummary || typeof S.rewardsSummary !== 'object') {
      S.rewardsSummary = {};
    }
    if (!Array.isArray(S.rewardsSummary.appliedRewardIds)) {
      S.rewardsSummary.appliedRewardIds = [];
    }
    if (!Array.isArray(S.rewardsSummary.history)) {
      S.rewardsSummary.history = [];
    }
    if (!('latest' in S.rewardsSummary)) {
      S.rewardsSummary.latest = null;
    }
    if (!('lastPromotion' in S.rewardsSummary)) {
      S.rewardsSummary.lastPromotion = null;
    }
    return S.rewardsSummary;
  }

  function _buildRewardId(source, meta) {
    if (meta && typeof meta.rewardId === 'string' && meta.rewardId.trim()) {
      return meta.rewardId.trim();
    }
    return '';
  }

  function _hasAppliedReward(rewardId) {
    if (!rewardId) return false;
    const summary = _ensureRewardsSummary();
    return summary.appliedRewardIds.includes(rewardId);
  }

  function _rememberAppliedReward(rewardId) {
    if (!rewardId) return;
    const summary = _ensureRewardsSummary();
    if (summary.appliedRewardIds.includes(rewardId)) return;
    summary.appliedRewardIds.push(rewardId);
    if (summary.appliedRewardIds.length > RECENT_REWARD_IDS_LIMIT) {
      summary.appliedRewardIds = summary.appliedRewardIds.slice(-RECENT_REWARD_IDS_LIMIT);
    }
  }

  function _appendRewardHistory(entry) {
    const summary = _ensureRewardsSummary();
    summary.latest = entry;
    summary.history.unshift(entry);
    if (summary.history.length > RECENT_REWARD_HISTORY_LIMIT) {
      summary.history = summary.history.slice(0, RECENT_REWARD_HISTORY_LIMIT);
    }
  }

  function _shouldSurfaceMarketRewardPrompt(source, cashAwarded, meta = {}) {
    if ((Number(cashAwarded) || 0) <= 0) return false;
    if (meta.surfaceMarketPrompt === false) return false;
    return [
      'question_correct',
      'lesson_complete',
      'daily_complete',
      'daily_question_solved',
      'daily_prediction_correct',
      'fluency_session_complete',
      'perfect_lesson_bonus',
      'hot_streak_bonus',
      'streak_bonus',
      'first_win'
    ].includes(source);
  }

  function _updateMarketRewardPrompt(source, cashAwarded, meta = {}) {
    if (!_shouldSurfaceMarketRewardPrompt(source, cashAwarded, meta)) return null;
    const summary = _ensureRewardsSummary();
    const existing = summary.marketRewardPrompt && typeof summary.marketRewardPrompt === 'object'
      ? summary.marketRewardPrompt
      : null;
    const nowIso = new Date().toISOString();
    const isRecent = existing?.updatedAt
      ? (Date.now() - new Date(existing.updatedAt).getTime()) < (2 * 60 * 60 * 1000)
      : false;

    summary.marketRewardPrompt = existing && isRecent
      ? {
          ...existing,
          amount: Math.max(0, Number(existing.amount) || 0) + Math.max(0, Number(cashAwarded) || 0),
          updatedAt: nowIso,
          source
        }
      : {
          amount: Math.max(0, Number(cashAwarded) || 0),
          source,
          rewardId: typeof meta.rewardId === 'string' ? meta.rewardId : null,
          createdAt: nowIso,
          updatedAt: nowIso
        };

    return summary.marketRewardPrompt;
  }

  function _normalizeCash(value) {
    return Math.max(0, Math.round(Number(value) || 0));
  }

  function recordAchievement({
    id,
    label,
    type = 'general',
    earnedAtXp = S.xp,
    meta = {}
  } = {}) {
    return { achievement: null, isNew: false };
  }

  function getAchievements() {
    return [];
  }

  function recordLessonCompletionMilestones(completedLessons = Array.isArray(S.completedIds) ? S.completedIds.length : 0) {
    return [];
  }

  function recordStreakAchievement(streak = S.streak || 0) {
    return { achievement: null, isNew: false };
  }

  function getRankMultiplier(rank) {
    return 1;
  }

  function applyXp(xp) {
    S.xp = 0;
    S.totalXP = 0;
    return 0;
  }

  function applyCash(cash) {
    S.cash = 0;
    return 0;
  }

  function updateQuestProgress(source, meta = {}) {
    return null;
  }

  function queueUnlock(unlock) {
    return null;
  }

  function awardRewards({
    baseXp = 0,
    baseCash = 0,
    source = 'unknown',
    meta = {}
  } = {}) {
    const rewardId = _buildRewardId(source, meta);
    return {
      source,
      rewardId: rewardId || null,
      deduped: false,
      baseXp: 0,
      xpAwarded: 0,
      baseCash: 0,
      cashAwarded: 0,
      compoundingMultiplier: 1,
      totalMultiplier: 1,
      questUpdate: null,
      meta,
      awardedAt: new Date().toISOString()
    };
  }

  function checkPromotion({
    beforeXp = S.xp,
    afterXp = S.xp,
    beforeNetWorth = null,
    afterNetWorth = null
  } = {}) {
    return null;
  }

  function getLessonsRemainingToTier(targetTier) {
    return 0;
  }

  function getProgressSummary() {
    const levelSummary = typeof getLevelProgress === 'function'
      ? getLevelProgress(S.xp)
      : null;
    const careerSummary = typeof getCareerRankSummary === 'function'
      ? getCareerRankSummary()
      : null;
    const dueReviewCount = typeof getDueReviews === 'function'
      ? getDueReviews(50).length
      : 0;
    const masterySummary = typeof getMasterySummary === 'function'
      ? getMasterySummary()
      : null;

    return {
      xp: 0,
      cash: 0,
      totalXP: 0,
      level: 1,
      nextLevel: 1,
      levelStartXp: levelSummary?.levelStartXp || 0,
      nextLevelXp: levelSummary?.nextLevelXp || 0,
      levelSpan: levelSummary?.levelSpan || 1,
      xpIntoLevel: levelSummary?.xpIntoLevel || 0,
      xpToNextLevel: levelSummary?.xpToNextLevel || 0,
      levelProgressPct: levelSummary?.progressPct || 0,
      currentRank: null,
      nextRank: null,
      netWorth: 0,
      rankSpan: careerSummary?.rankSpan || 1,
      netWorthIntoRank: careerSummary?.valueIntoRank || 0,
      netWorthToNextRank: careerSummary?.netWorthToNextRank || 0,
      rankProgressPct: careerSummary?.progressPct || 0,
      compoundingBoost: getCompoundingBoostMeta(),
      lessonsRemainingToGold: getLessonsRemainingToTier('gold'),
      lessonsRemainingToPlatinum: getLessonsRemainingToTier('platinum'),
      dueReviewCount,
      masterySummary,
      pendingUnlockCount: 0,
      latestReward: null
    };
  }

  function getUserRank(xp = S.xp) {
    return {
      xp: 0,
      name: 'Learning Progress',
      currentRank: null,
      nextRank: null,
      xpIntoRank: 0,
      rankSpan: 1,
      xpToNextRank: 0,
      progressPct: 0,
      progressLabel: 'Learning progress',
      level: 1,
      nextLevel: 1
    };
  }

  global.Progression = {
    getRankMultiplier,
    awardRewards,
    applyXp,
    applyCash,
    updateQuestProgress,
    checkPromotion,
    queueUnlock,
    recordAchievement,
    getAchievements,
    recordLessonCompletionMilestones,
    recordStreakAchievement,
    getLessonsRemainingToTier,
    getProgressSummary,
    getUserRank
  };

  global.getRankMultiplier = getRankMultiplier;
  global.awardRewards = awardRewards;
  global.applyXp = applyXp;
  global.applyCash = applyCash;
  global.updateQuestProgress = updateQuestProgress;
  global.checkPromotion = checkPromotion;
  global.queueUnlock = queueUnlock;
  global.recordAchievement = recordAchievement;
  global.getAchievements = getAchievements;
  global.recordLessonCompletionMilestones = recordLessonCompletionMilestones;
  global.recordStreakAchievement = recordStreakAchievement;
  global.getLessonsRemainingToTier = getLessonsRemainingToTier;
  global.getProgressSummary = getProgressSummary;
  global.getUserRank = getUserRank;
})(typeof window !== 'undefined' ? window : globalThis);
