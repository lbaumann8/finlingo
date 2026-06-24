// ============================================================
// personalization.js
// Connects S.onboarding answers to the live course experience.
//
// This file is the content layer only — it contains no DOM logic.
// Every function is pure: reads from S.onboarding + LESSONS, returns
// a string or object. All DOM placement is handled by the callers in
// app.js and quiz.js, which guard every call with typeof checks.
//
// PUBLIC API (called by app.js and quiz.js):
//
//   getPersonalizedContext(lessonId)
//     → string | null
//     One sentence shown as a green callout above the lesson reading.
//     Explains why this lesson matters for the user's stated goal.
//
//   getPersonalizedHomeTip()
//     → string | null
//     Short tip shown below the recent-activity list for users who
//     haven't completed any lessons yet. Disappears after first lesson.
//
//   getPersonalizedPaywallTeaser(tier)
//     → string | null
//     One sentence appended to the paywall modal body. Frames the
//     locked tier as a natural continuation, not a random gate.
//
//   getLessonPreview(lessonId)
//     → string | null
//     One "you'll learn" line shown under the blurb on the tier-locked
//     home card. Shows concrete value before the user upgrades.
//
//   getRecommendedPremiumLesson(tier)
//     → LESSONS object | null
//     The goal-relevant premium lesson to surface in nudges and the
//     paywall. Does not affect which lesson unlocks next (always
//     sequential) — only affects which one is *featured*.
//
//   getResultNudge(completedLessonId)
//     → { headline, body, recommendedLesson } | null
//     Upgrade nudge shown on the result screen when the user is
//     approaching the next live tier boundary in LESSONS.
//     Returns null for all other lesson IDs.
//
//   getRecommendedStartingUnit()
//     → UNITS_DEF object | null
//     Goal-aware unit recommendation for the curriculum screen.
//
// Depends on: state.js (S.onboarding), data.js (LESSONS)
// Load order: after state.js + data.js, before app.js + quiz.js
// ============================================================


// ─────────────────────────────────────────────────────────────
// LESSON × GOAL CONTEXT NOTES
// One sentence per [lessonId][goal] pair, explaining why this
// specific lesson matters for the user's reason for being here.
// '_' is the fallback used when no goal was captured.
// ─────────────────────────────────────────────────────────────
const _LESSON_CONTEXT = {
  1: {
    invest:  'Stocks are the foundation of almost every investment portfolio — the right place to start.',
    career:  'Equity literacy is expected in every finance role. This is where that vocabulary begins.',
    money:   'Stocks are one of the most effective long-term tools for growing money. Here\'s how they actually work.',
    curious: 'This is what most people mean when they say "investing" — explained clearly from first principles.',
    _:       'Understand exactly what you own when you invest in a company.'
  },
  2: {
    invest:  'Bonds balance risk in any serious portfolio. Every investor needs to understand how they work.',
    career:  'Fixed income is central to banking, treasury management, and portfolio strategy roles.',
    money:   'Bonds explain why interest rate changes affect your savings account, mortgage, and loan costs.',
    curious: 'The quiet side of financial markets — and why rates and prices always move in opposite directions.',
    _:       'Learn how bonds work and why they matter to every investor.'
  },
  3: {
    invest:  'ETFs are how most investors get diversified market exposure cheaply and efficiently.',
    career:  'ETF mechanics are fundamental knowledge for asset management and passive strategy roles.',
    money:   'One ETF gives you exposure to hundreds of companies at once — here\'s how that actually works.',
    curious: 'The most widely used investment vehicle in the world — and most people don\'t fully understand it.',
    _:       'The bundle behind modern investing, and why it changed how people invest.'
  },
  4: {
    invest:  'Compounding is why starting early beats investing larger amounts later — the most important investing idea.',
    career:  'The Rule of 72 is a quick mental shortcut that comes up in finance conversations constantly.',
    money:   'This is the engine behind savings accounts, mortgages, and long-term wealth — and it\'s simpler than it sounds.',
    curious: 'One of the most powerful and counterintuitive ideas in all of finance.',
    _:       'The engine behind long-term wealth — and why time in the market matters so much.'
  },
  5: {
    invest:  'Portfolio theory is how professionals balance risk against return — essential for any serious investor.',
    career:  'Beta, Sharpe Ratio, and correlation appear in every CFA exam and finance interview.',
    money:   'Understanding risk helps you choose investments that actually match your comfort level.',
    curious: 'The mathematical framework professionals use to manage financial risk — surprisingly accessible.',
    _:       'How risk is measured, managed, and priced — the framework behind every portfolio.'
  },
  6: {
    invest:  'Options let investors hedge risk and target specific price outcomes — a key tool for advanced investing.',
    career:  'Options mechanics are tested in trading, structuring, and derivatives roles across the industry.',
    money:   'Options are how professionals protect large portfolios from downside risk.',
    curious: 'The building blocks behind Wall Street\'s most powerful and misunderstood instruments.',
    _:       'Calls, puts, and premiums — the mechanics behind options trading.'
  },
  7: {
    invest:  'Fed rate decisions move every market simultaneously: stocks, bonds, real estate, and currencies.',
    career:  'Macro awareness of rate cycles is baseline knowledge in every serious finance role.',
    money:   'Interest rates directly affect your mortgage rate, savings return, and the cost of every loan.',
    curious: 'The single lever that moves all financial markets at once — explained from the ground up.',
    _:       'How the Federal Reserve sets rates, and why every market reacts when they do.'
  },
  8: {
    invest:  'DCF and comps are how professional investors decide whether a company is cheap or expensive.',
    career:  'Valuation is the core technical skill in investment banking, private equity, and equity research.',
    money:   'This is how professionals determine what a business is actually worth — two methods explained.',
    curious: 'How do you put a number on a company? These are the exact frameworks Wall Street uses.',
    _:       'What a company is really worth — and the two main ways to calculate it.'
  },
  9: {
    invest:  'EV/EBITDA is the most widely cited valuation multiple in M&A deals and company comparisons.',
    career:  'EBITDA and EV/EBITDA are covered in virtually every investment banking interview.',
    money:   'EBITDA strips out accounting noise to show how much cash a business actually generates.',
    curious: 'The metric behind almost every corporate valuation headline you\'ve seen.',
    _:       'A core operating metric used daily in banking, private equity, and corporate finance.'
  },
  10: {
    invest:  'IPOs create new investment opportunities — and often significant short-term price volatility.',
    career:  'IPO mechanics are central to equity capital markets (ECM) roles in investment banking.',
    money:   'Understanding IPOs explains how companies become publicly traded — and what that means for investors.',
    curious: 'The moment a private company enters public markets — every moving part explained.',
    _:       'How companies go public — from the decision to the first day of trading.'
  }
};


// ─────────────────────────────────────────────────────────────
// HOME SCREEN TIPS
// Shown below the recent-activity list for users with 0 completed
// lessons. Indexed [goal][level]. Disappears after first lesson.
// ─────────────────────────────────────────────────────────────
const _HOME_TIPS = {
  invest: {
    none:      'Start with Lesson 1 — stocks are the foundation of every investment portfolio.',
    some:      'Lessons 4 and 5 cover compounding and portfolio risk — the core of smart investing.',
    confident: 'Lesson 5 ties together diversification and risk theory — a solid review before the advanced content.'
  },
  career: {
    none:      'Lessons 1–3 build the vocabulary expected in every finance interview and role.',
    some:      'Lesson 5 (Risk & Portfolio Theory) comes up in almost every finance interview — prioritise it.',
    confident: 'Gold and Platinum lessons cover the Wall Street toolkit: options, rates, valuation, and EBITDA.'
  },
  money: {
    none:      'Lessons 1–4 explain how the main savings and investment vehicles around you actually work.',
    some:      'Lesson 4 on compounding is especially relevant — it explains how your savings grow over time.',
    confident: 'Lesson 7 (Interest Rates) explains exactly how the Fed\'s decisions affect your money day-to-day.'
  },
  curious: {
    none:      'Each lesson builds on the last. Start from the beginning and the bigger picture will emerge.',
    some:      'Lessons 4 and 5 go beyond the basics — compounding and risk theory add real depth.',
    confident: 'Gold and Platinum lessons cover the real Wall Street toolkit you\'re probably curious about.'
  }
};


// ─────────────────────────────────────────────────────────────
// PAYWALL TEASERS
// One sentence appended to the paywall modal. Frames upgrade as
// a natural next step based on the user's goal.
// ─────────────────────────────────────────────────────────────
const _PAYWALL_TEASERS = {
  invest: {
    gold:     'Options and interest rates are the next tools every serious investor builds fluency with.',
    platinum: 'Valuation, EBITDA, and IPOs — the framework for evaluating real investment opportunities.'
  },
  career: {
    gold:     'Options mechanics and Fed rate policy are standard knowledge in trading, banking, and research.',
    platinum: 'Valuation methods and EBITDA are core topics tested in every investment banking interview.'
  },
  money: {
    gold:     'Lesson 7 on interest rates directly connects to your mortgage, savings rate, and loan costs.',
    platinum: 'Learn how companies are valued — the framework behind the biggest financial decisions in the news.'
  },
  curious: {
    gold:     'Options and the Federal Reserve are two of the most fascinating mechanisms in modern finance.',
    platinum: 'Valuation, EBITDA, and IPOs — how Wall Street actually works, in clear practical terms.'
  }
};


// ─────────────────────────────────────────────────────────────
// LESSON CONTENT PREVIEWS
// One "you'll learn" line per premium lesson.
// Shown under the blurb on the tier-locked home card.
// ─────────────────────────────────────────────────────────────
const _LESSON_PREVIEW = {
  6:  'Calls, puts, strike prices — options mechanics from first principles',
  7:  'How the Fed sets rates, and why stocks and bonds always react',
  8:  'DCF and comps — the two methods behind every company valuation',
  9:  'EBITDA and EV/EBITDA — why bankers use these numbers in every deal',
  10: 'IPOs, SPACs, and direct listings — how private companies go public'
};


// ─────────────────────────────────────────────────────────────
// GOAL → RECOMMENDED PREMIUM LESSON
// Which premium lesson to FEATURE for each goal in nudges and
// paywall copy. Sequences are still always sequential (6 → 7 →
// 8 → 9 → 10) — this only affects which lesson is highlighted.
//
//   invest  → Options Basics (6) / Valuation Methods (8)
//   career  → Interest Rates (7) / EBITDA (9)
//   money   → Interest Rates (7) / Valuation Methods (8)
//   curious → Options Basics (6) / IPOs & Capital Markets (10)
// ─────────────────────────────────────────────────────────────
const _GOAL_RECOMMENDED = {
  invest:  { gold: 6, platinum: 8  },
  career:  { gold: 7, platinum: 9  },
  money:   { gold: 7, platinum: 8  },
  curious: { gold: 6, platinum: 10 }
};


// ─────────────────────────────────────────────────────────────
// GOAL / LEVEL / TOPIC → RECOMMENDED STARTING UNIT
// Single source of truth for the path-screen unit highlight.
// ─────────────────────────────────────────────────────────────
const _GOAL_UNIT_SCORES = {
  invest:  { 1: 3, 2: 5, 3: 2, 5: 2, 6: 1 },
  career:  { 1: 2, 3: 5, 4: 4, 5: 1, 6: 1 },
  money:   { 1: 5, 2: 4, 6: 2 },
  curious: { 1: 2, 3: 1, 5: 3, 6: 4 }
};

const _LEVEL_UNIT_SCORES = {
  none:      { 1: 4, 2: 1 },
  some:      { 2: 2, 3: 1, 6: 1 },
  confident: { 3: 2, 4: 2, 5: 2, 6: 2 }
};

const _TOPIC_UNIT_SCORES = {
  stocks:    { 1: 2, 2: 3 },
  budget:    { 1: 3, 2: 2 },
  crypto:    { 5: 2, 6: 3 },
  banking:   { 1: 3, 6: 2 },
  investing: { 1: 2, 2: 3, 3: 1 },
  business:  { 3: 3, 4: 3 }
};

function _applyUnitScores(scoreMap, scoreSet) {
  if (!scoreSet || typeof scoreSet !== 'object') return;
  Object.entries(scoreSet).forEach(([unitId, weight]) => {
    const numericId = Number(unitId);
    if (!Number.isFinite(numericId)) return;
    scoreMap.set(numericId, (scoreMap.get(numericId) || 0) + (Number(weight) || 0));
  });
}


// ─────────────────────────────────────────────────────────────
// RESULT SCREEN NUDGE COPY
// Shown after completing lesson 4 (penultimate free) or lesson 5
// (final free). These are the two peak-engagement moments.
//
// headline: short label (shown uppercase above the card body)
// body:     1-2 sentences connecting completion to what's next
// ─────────────────────────────────────────────────────────────
const _RESULT_NUDGE = {
  // Lesson 4 complete — "one more, then the advanced content starts"
  4: {
    invest: {
      headline: 'One free lesson left',
      body:     'After Risk & Portfolio Theory, Gold unlocks Options Basics — the first advanced tool every serious investor should understand.'
    },
    career: {
      headline: 'One free lesson left',
      body:     'After Risk & Portfolio Theory, Gold opens with Interest Rates & the Fed — macro knowledge expected in every finance role.'
    },
    money: {
      headline: 'One free lesson left',
      body:     'After Risk & Portfolio Theory, Gold starts with Interest Rates — explaining exactly how the Fed affects your savings and loans.'
    },
    curious: {
      headline: 'One free lesson left',
      body:     'After Risk & Portfolio Theory, Gold unlocks Options Basics — one of finance\'s most powerful and misunderstood instruments.'
    },
    _: {
      headline: 'One free lesson left',
      body:     'Complete Risk & Portfolio Theory to finish the free curriculum, then see what Gold has in store.'
    }
  },
  // Lesson 5 complete — highest-motivation moment: free content fully done
  5: {
    invest: {
      headline: 'Free lessons complete',
      body:     'You\'ve built the foundations. Gold starts with Options Basics — the first advanced tool in every serious investor\'s toolkit.'
    },
    career: {
      headline: 'Free lessons complete',
      body:     'Strong start. Gold opens with Interest Rates & the Fed — the macro knowledge expected in every serious finance role.'
    },
    money: {
      headline: 'Free lessons complete',
      body:     'Great foundation. Gold starts with Interest Rates — how the Fed\'s decisions flow through your savings, mortgage, and loans.'
    },
    curious: {
      headline: 'Free lessons complete',
      body:     'Solid progress. Gold opens with Options Basics — calls, puts, and the mechanics behind one of Wall Street\'s core instruments.'
    },
    _: {
      headline: 'Free lessons complete',
      body:     'You\'ve covered all the essentials. Gold and Platinum unlock the full advanced curriculum.'
    }
  }
};


// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Returns a one-sentence context note for a specific lesson,
 * based on the user's onboarding goal. Shown as a green left-
 * bordered callout above the lesson reading content.
 *
 * @param {number} lessonId
 * @returns {string|null}
 */
function getPersonalizedContext(lessonId) {
  const goal  = S?.onboarding?.goal;
  const notes = _LESSON_CONTEXT[lessonId];
  if (!notes) return null;
  return (goal && notes[goal]) || notes._ || null;
}

/**
 * Returns a short personalized tip for the home screen.
 * Only meaningful for users who completed onboarding with a goal
 * and haven't finished any lessons yet.
 *
 * @returns {string|null}
 */
function getPersonalizedHomeTip() {
  const ob = S?.onboarding;
  if (!ob?.done || !ob?.goal) return null;
  const level = ob.level || 'none';
  return _HOME_TIPS[ob.goal]?.[level]
      || _HOME_TIPS[ob.goal]?.none
      || null;
}

/**
 * Returns a goal-aware teaser sentence for the paywall modal.
 * Appended below the price line to frame the tier as a natural
 * next step rather than an arbitrary gate.
 *
 * @param {'gold'|'platinum'} tier
 * @returns {string|null}
 */
function getPersonalizedPaywallTeaser(tier) {
  const goal = S?.onboarding?.goal;
  if (!goal) return null;
  return _PAYWALL_TEASERS[goal]?.[tier] || null;
}

/**
 * Returns a one-line "you'll learn" preview for a premium lesson.
 * Shown under the goal-specific blurb on the tier-locked home card,
 * so the user sees concrete value before deciding to upgrade.
 *
 * @param {number} lessonId
 * @returns {string|null}
 */
function getLessonPreview(lessonId) {
  return _LESSON_PREVIEW[lessonId] || null;
}

/**
 * Returns the first lesson for a given tier based on the live course bank.
 *
 * @param {'gold'|'platinum'} tier
 * @returns {object|null}
 */
function _getFirstLessonByTier(tier) {
  if (typeof LESSONS === 'undefined') return null;
  return LESSONS.find(l => {
    const accessTier = typeof getLessonAccessTier === 'function' ? getLessonAccessTier(l) : l.tier;
    return accessTier === tier;
  }) || null;
}

/**
 * Returns live tier-boundary info derived from the current lesson bank.
 * This is the single source of truth for "lessons until Gold/Platinum".
 *
 * @returns {{ targetTier: string, tierName: string, remainingLessons: number, firstTargetLesson: object, nextIncomplete: object|null } | null}
 */
function getUpcomingTierUnlockInfo() {
  if (typeof LESSONS === 'undefined') return null;

  const currentTier = S?.user?.tier || 'standard';
  const targetTier = [...new Set(LESSONS
    .map(lesson => typeof getLessonAccessTier === 'function' ? getLessonAccessTier(lesson) : lesson.tier)
    .filter(tier => (TIER_ORDER[tier] ?? 0) > (TIER_ORDER[currentTier] ?? 0))
  )]
    .sort((a, b) => (TIER_ORDER[a] ?? 0) - (TIER_ORDER[b] ?? 0))[0] || null;

  if (!targetTier) return null;

  const firstTargetLesson = _getFirstLessonByTier(targetTier);
  if (!firstTargetLesson) return null;

  const completed = new Set(Array.isArray(S?.completedIds) ? S.completedIds : []);
  const remainingLessons = LESSONS.filter(l => {
    const accessTier = typeof getLessonAccessTier === 'function' ? getLessonAccessTier(l) : l.tier;
    return (TIER_ORDER[accessTier] ?? 0) < (TIER_ORDER[targetTier] ?? 0) && !completed.has(l.id);
  }).length;

  return {
    targetTier,
    tierName: targetTier === 'gold' ? 'Gold' : 'Platinum',
    remainingLessons,
    firstTargetLesson,
    nextIncomplete: LESSONS.find(l => !completed.has(l.id)) || null
  };
}

/**
 * Returns the goal-relevant premium lesson object to feature in
 * nudges and paywall copy. If a mapped lesson no longer matches
 * the live tier structure, safely falls back to the first lesson
 * in that tier.
 *
 * This does NOT affect which lesson unlocks next — sequencing comes
 * from the live LESSONS order. This only affects which lesson is
 * highlighted when a tier is being previewed.
 *
 * @param {'gold'|'platinum'} tier
 * @returns {object|null} — a lesson object from the LESSONS array
 */
function getRecommendedPremiumLesson(tier) {
  const goal     = S?.onboarding?.goal;
  const rec      = _GOAL_RECOMMENDED[goal] || {};
  const targetId = rec[tier];
  if (typeof LESSONS === 'undefined') return null;
  const lesson = LESSONS.find(l => {
    const accessTier = typeof getLessonAccessTier === 'function' ? getLessonAccessTier(l) : l.tier;
    return l.id === targetId && accessTier === tier;
  });
  return lesson || _getFirstLessonByTier(tier);
}

/**
 * Returns the data needed to render the result-screen upgrade nudge.
 * Fires only when the user is one lesson away from the next tier,
 * or has just reached the next tier gate.
 *
 * @param {number} completedLessonId
 * @returns {{ headline: string, body: string, recommendedLesson: object|null } | null}
 */
function getResultNudge(completedLessonId) {
  if (typeof completedLessonId !== 'number') return null;

  const tierInfo = getUpcomingTierUnlockInfo();
  if (!tierInfo || tierInfo.remainingLessons > 1) return null;

  const firstLesson = tierInfo.firstTargetLesson;
  const headline = tierInfo.remainingLessons === 1
    ? 'One lesson left'
    : `${tierInfo.tierName} unlocks next`;
  const body = tierInfo.remainingLessons === 1
    ? `Finish one more lesson to unlock ${tierInfo.tierName}. It starts with ${firstLesson.title}.`
    : `${tierInfo.tierName} is your next step. It starts with ${firstLesson.title}.`;

  return {
    headline,
    body,
    recommendedLesson: firstLesson
  };
}

/**
 * Returns the best-fit curriculum unit from onboarding answers.
 * Falls back to the first unit only when a recommendation profile
 * exists but scoring ties or resolves to zero.
 *
 * @returns {object|null}
 */
function getRecommendedStartingUnit() {
  const onboarding = S?.onboarding;
  if (!onboarding?.done || !onboarding?.goal || typeof UNITS_DEF === 'undefined') return null;

  const scores = new Map(UNITS_DEF.map(unit => [unit.id, 0]));
  _applyUnitScores(scores, _GOAL_UNIT_SCORES[onboarding.goal]);
  _applyUnitScores(scores, _LEVEL_UNIT_SCORES[onboarding.level || 'none']);

  const topics = Array.isArray(onboarding.topics) ? onboarding.topics : [];
  topics.forEach(topicId => {
    _applyUnitScores(scores, _TOPIC_UNIT_SCORES[topicId]);
  });

  let bestUnit = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  UNITS_DEF.forEach(unit => {
    const score = scores.get(unit.id) || 0;
    if (!bestUnit || score > bestScore || (score === bestScore && unit.id < bestUnit.id)) {
      bestUnit = unit;
      bestScore = score;
    }
  });

  if (!bestUnit || bestScore <= 0) {
    return typeof getUnitById === 'function' ? getUnitById(1) : (UNITS_DEF[0] || null);
  }

  return typeof getUnitById === 'function' ? getUnitById(bestUnit.id) : bestUnit;
}
