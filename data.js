// ============================================================
// data.js
// All static / hardcoded data for the app.
// ============================================================

// ── CONFIG ────────────────────────────────────────────────────
const STORAGE_KEY = "finlingo_v4";

// ── LEGACY ACCESS CONSTANT ────────────────────────────────────
// Retained for older call sites; all current lessons are accessible.
const TIER_ORDER = {
  standard: 0
};

const PASSING_SCORE_THRESHOLD = 60;
const RANK_UP_BONUS_XP = 0;

// ── LEGACY MILESTONES ─────────────────────────────────────────
// Kept only so older saved data and helper calls do not break.
const LEVELS = [
  { name:"Learning", min:0, next:null }
];

const XP_LEVEL_BASE_STEP = 200;
const XP_LEVEL_STEP_GROWTH = 50;

// ── LEGACY PROGRESSION CONSTANTS ──────────────────────────────
const COMPOUNDING_BOOST_LABEL = 'Learning Progress';
const COMPOUNDING_BOOST_LEVELS = [
  { level: 1,  multiplier: 1.00 },
];
// ── RANK META ─────────────────────────────────────────────────
// Colour, cash bonus, and perk description for each rank.
// color      — accent used in the roadmap and promotion modal
// cashBonus  — cash awarded on promotion (future: credit S.cash)
// perk       — one-line description of what the role unlocks
const RANK_META = {
  'Learning': { color: '#1f9d55', cashBonus: 0, perk: 'Learning progress' },
};

// ── FINANCIAL CONFIDENCE STATUS ───────────────────────────────
// A mature, non-game replacement for XP levels and ranks. Learners move
// through three plain-language stages based on how much of the curriculum
// they have completed: Beginner → Building → Confident.
// Ordered highest-first so getConfidenceStatus() can pick the first match.
const CONFIDENCE_TIERS = [
  {
    key: 'confident',
    label: 'Confident',
    minLessons: 30,
    color: '#1f9d55',
    blurb: 'You can read the markets and talk finance with real confidence.'
  },
  {
    key: 'building',
    label: 'Building',
    minLessons: 8,
    color: '#1f9d55',
    blurb: 'You are building a solid foundation in the fundamentals.'
  },
  {
    key: 'beginner',
    label: 'Beginner',
    minLessons: 0,
    color: '#6b7280',
    blurb: 'You are getting started with the basics, one lesson at a time.'
  }
];

// Returns the learner's current confidence stage plus progress metadata.
// Reads completed-lesson count from the argument, or from S when omitted.
function getConfidenceStatus(completedCount) {
  const total = (typeof LESSONS !== 'undefined' && Array.isArray(LESSONS)) ? LESSONS.length : 0;
  let completed = Number(completedCount);
  if (!Number.isFinite(completed)) {
    completed = (typeof S !== 'undefined' && Array.isArray(S?.completedIds)) ? S.completedIds.length : 0;
  }
  completed = Math.max(0, Math.round(completed));

  const tier = CONFIDENCE_TIERS.find(t => completed >= t.minLessons)
    || CONFIDENCE_TIERS[CONFIDENCE_TIERS.length - 1];
  const tierIndex = CONFIDENCE_TIERS.indexOf(tier);
  const nextTier = tierIndex > 0 ? CONFIDENCE_TIERS[tierIndex - 1] : null;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((completed / total) * 100))) : 0;

  return {
    key: tier.key,
    label: tier.label,
    color: tier.color,
    blurb: tier.blurb,
    completed,
    total,
    pct,
    nextLabel: nextTier ? nextTier.label : null,
    lessonsToNext: nextTier ? Math.max(0, nextTier.minLessons - completed) : 0
  };
}

// ── SKILL PROGRESS BY CATEGORY ────────────────────────────────
// Dashboard "Skill Progress" maps six plain-language money skills onto the
// most relevant lessons in the curriculum. Lessons can appear in more than
// one skill — foundational ideas (e.g. compound interest) build several at
// once. Each skill reports a Beginner / Building / Confident stage based on
// how much of that skill's lesson set the learner has completed.
const SKILL_CATEGORIES = [
  { key: 'budgeting', label: 'Budgeting', lessonIds: [9, 10, 11, 12],
    blurb: 'Saving, inflation, and making your money go further.' },
  { key: 'credit',    label: 'Credit',    lessonIds: [2, 46, 47, 50, 83],
    blurb: 'Debt, borrowing, and how interest really works.' },
  { key: 'investing', label: 'Investing', lessonIds: [1, 3, 4, 5, 6, 16, 18, 22, 23, 45],
    blurb: 'Stocks, funds, and putting money to work over time.' },
  { key: 'risk',      label: 'Risk',      lessonIds: [13, 14, 15, 20, 40, 42, 78, 81],
    blurb: 'Volatility, diversification, and protecting your downside.' },
  { key: 'taxes',     label: 'Taxes',     lessonIds: [16, 17, 32, 33],
    blurb: 'Dividends, capital gains, and what you actually keep.' },
  { key: 'planning',  label: 'Planning',  lessonIds: [9, 18, 19, 21, 24, 93],
    blurb: 'Long-term habits that compound into real wealth.' }
];

// ── FINANCIAL CONFIDENCE SCORE ────────────────────────────────
// A single 0–100 score showing how capable a learner is becoming with real
// money decisions. It blends LESSON PROGRESS (how much of each skill's
// curriculum is done) with SKILL MASTERY (how well they answered the quick
// checks, via S.bestScores). Read-only — derived entirely from existing
// state, so computing it never changes or breaks saved progress.
//
// Per-category score = completion × (0.65 + 0.35 × mastery). Full completion
// with strong mastery approaches 100; finishing lessons with weaker quiz
// accuracy lands lower. The overall score averages the six categories.
const CONFIDENCE_SCORE_BLURBS = {
  beginner:  "You're just getting started. Every lesson builds a real money skill.",
  building:  "You're building genuine capability with real money decisions. Keep going.",
  confident: "You're handling real money decisions with real confidence."
};

function _confidenceQuestionCounts() {
  const map = {};
  if (typeof LESSONS !== 'undefined' && Array.isArray(LESSONS)) {
    LESSONS.forEach(lesson => {
      const id = Number(lesson?.id);
      if (Number.isFinite(id)) map[id] = Array.isArray(lesson.questions) ? lesson.questions.length : 0;
    });
  }
  return map;
}

function getFinancialConfidence(state) {
  const src = state && typeof state === 'object'
    ? state
    : (typeof S !== 'undefined' ? S : {});
  const completedSet = new Set(
    (Array.isArray(src.completedIds) ? src.completedIds : []).map(Number).filter(Number.isFinite)
  );
  const bestScores = src.bestScores && typeof src.bestScores === 'object' ? src.bestScores : {};
  const questionCounts = _confidenceQuestionCounts();

  const categories = SKILL_CATEGORIES.map(category => {
    const lessonIds = Array.isArray(category.lessonIds) ? category.lessonIds : [];
    const total = lessonIds.length;
    const completed = lessonIds.filter(id => completedSet.has(id)).length;
    const completionPct = total > 0 ? completed / total : 0;

    // Mastery = average correctness on the completed lessons in this skill.
    let masterySum = 0;
    let masteryCount = 0;
    lessonIds.forEach(id => {
      if (!completedSet.has(id)) return;
      const qCount = questionCounts[id] || 0;
      const best = Number(bestScores[id]);
      if (qCount > 0 && Number.isFinite(best)) {
        masterySum += Math.max(0, Math.min(1, best / qCount));
        masteryCount += 1;
      }
    });
    const masteryRatio = masteryCount > 0 ? masterySum / masteryCount : 0;
    const score = Math.round(completionPct * (0.65 + 0.35 * masteryRatio) * 100);

    let statusKey = 'beginner';
    let statusLabel = 'Beginner';
    if (completed > 0 && score >= 60) { statusKey = 'confident'; statusLabel = 'Confident'; }
    else if (completed > 0)           { statusKey = 'building';  statusLabel = 'Building'; }

    return {
      key: category.key,
      label: category.label,
      blurb: category.blurb,
      total,
      completed,
      pct: Math.round(completionPct * 100),
      score,
      statusKey,
      statusLabel
    };
  });

  const score = categories.length
    ? Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length)
    : 0;

  let statusKey = 'beginner';
  let statusLabel = 'Beginner';
  if (score >= 55)      { statusKey = 'confident'; statusLabel = 'Confident'; }
  else if (score >= 10) { statusKey = 'building';  statusLabel = 'Building'; }

  const curriculumTotal = (typeof LESSONS !== 'undefined' && Array.isArray(LESSONS)) ? LESSONS.length : 0;

  return {
    score,
    statusKey,
    statusLabel,
    blurb: CONFIDENCE_SCORE_BLURBS[statusKey],
    categories,
    completedLessons: completedSet.size,
    totalLessons: curriculumTotal
  };
}

// Returns one entry per skill with completion + mastery and a confidence
// stage. Delegates to getFinancialConfidence so the dashboard, profile, and
// overall score always agree. Accepts an optional completedIds array.
function getSkillProgress(completedIds) {
  const state = Array.isArray(completedIds)
    ? { completedIds, bestScores: (typeof S !== 'undefined' ? S.bestScores : null) }
    : undefined;
  return getFinancialConfidence(state).categories;
}

// ── ICONS ─────────────────────────────────────────────────────
const ICONS = {
  stock:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  bond:     `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/><path d="M9 11h.01M15 11h.01"/></svg>`,
  etf:      `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/></svg>`,
  compound: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a9 9 0 1 0 2 6"/><polyline points="21 3 21 8 16 8"/><path d="M9 13l2.5 2.5L16 11"/></svg>`,
  ebitda:   `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  options:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  rates:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/></svg>`,
  valuation:`<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  risk:     `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  ipo:      `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><polyline points="17 11 21 7 17 3"/><line x1="21" y1="7" x2="9" y2="7"/><path d="M3 17v-4a4 4 0 0 1 4-4h14"/></svg>`,
  check:    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  user:     `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};

// ── LEADERBOARD PLACEHOLDER ────────────────────────────────────
const FAKE_LB = [];

// ── AVATAR COLOURS ────────────────────────────────────────────
const AVATAR_COLORS = [
  '#1a1a2e','#16213e','#0f3460','#1b4332',
  '#2d3a1e','#3b2f2f','#2c2c54','#4a1942',
  '#003049','#1a1a1a'
];

// ── UNIT DEFINITIONS ──────────────────────────────────────────
// These names must match the `unit` field on each lesson in lessonBank.js exactly.
const UNITS_DEF = [
  {
    id: 1,
    name: "Money & Markets",
    title: "Money & Markets",
    range: [1, 15],
    membershipAccess: "standard",
    previewLessonCount: 15,
    icon: "stock",
    description: "Core market concepts, investing vehicles, and first-principles finance.",
    topicHighlights: ["stocks and bonds", "ETFs and index funds", "risk, inflation, and diversification"]
  },
  {
    id: 2,
    name: "Investing for Everyone",
    title: "Investing for Everyone",
    range: [16, 25],
    membershipAccess: "standard",
    previewLessonCount: 10,
    icon: "etf",
    description: "Portfolio building, investor behavior, and long-term wealth habits.",
    topicHighlights: ["dividends and capital gains", "asset allocation", "market cycles and IPOs"]
  },
  {
    id: 3,
    name: "Reading Companies",
    title: "Reading Companies",
    range: [26, 45],
    membershipAccess: "standard",
    previewLessonCount: 20,
    icon: "ebitda",
    description: "Financial statements, valuation, and company analysis.",
    topicHighlights: ["margins and EPS", "cash flow and EBITDA", "valuation frameworks"]
  },
  {
    id: 4,
    name: "Wall Street & Deals",
    title: "Wall Street & Deals",
    range: [46, 65],
    membershipAccess: "standard",
    previewLessonCount: 20,
    icon: "ipo",
    description: "Capital markets, deal mechanics, and institutional finance.",
    topicHighlights: ["capital structure", "M&A and LBOs", "investment banking and short selling"]
  },
  {
    id: 5,
    name: "Trading & Derivatives",
    title: "Trading & Derivatives",
    range: [66, 82],
    membershipAccess: "standard",
    previewLessonCount: 17,
    icon: "options",
    description: "Options, risk management, and trading mechanics.",
    topicHighlights: ["calls and puts", "Greeks and implied volatility", "hedging and trading psychology"]
  },
  {
    id: 6,
    name: "Macro & Global Markets",
    title: "Macro & Global Markets",
    range: [83, 100],
    membershipAccess: "standard",
    previewLessonCount: 18,
    icon: "rates",
    description: "Rates, macro cycles, commodities, currencies, and global market context.",
    topicHighlights: ["Fed and policy", "yield curve and recession", "commodities, crypto, and bubbles"]
  },
];

if (typeof window !== 'undefined') {
  window.UNITS_DEF = UNITS_DEF;
}

function _lessonArray() {
  return (typeof LESSONS !== 'undefined' && Array.isArray(LESSONS))
    ? LESSONS
    : (typeof window !== 'undefined' && Array.isArray(window.LESSONS) ? window.LESSONS : []);
}

function _unitArray() {
  return Array.isArray(UNITS_DEF)
    ? UNITS_DEF
    : (typeof window !== 'undefined' && Array.isArray(window.UNITS_DEF) ? window.UNITS_DEF : []);
}

function _safeUnitRange(unit) {
  if (!unit || !Array.isArray(unit.range) || unit.range.length < 2) return null;
  const start = Number(unit.range[0]);
  const end = Number(unit.range[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return [Math.min(start, end), Math.max(start, end)];
}

function _resolveUnit(unitOrId) {
  if (!unitOrId) return null;
  if (typeof unitOrId === 'object') return unitOrId;
  const units = _unitArray();
  if (typeof unitOrId === 'number') {
    return units.find(unit => Number(unit.id) === unitOrId) || null;
  }
  return units.find(unit => unit.name === unitOrId || unit.title === unitOrId) || null;
}

function getUnitById(unitId) {
  return _resolveUnit(unitId);
}

function getUnitByName(unitName) {
  return _resolveUnit(unitName);
}

function getUnitForLesson(lessonOrId) {
  const lessons = _lessonArray();
  const lesson = typeof lessonOrId === 'object'
    ? lessonOrId
    : lessons.find(item => Number(item?.id) === Number(lessonOrId));

  if (!lesson) return null;
  return _resolveUnit(lesson.unit)
    || _unitArray().find(unit => {
      const range = _safeUnitRange(unit);
      const lessonId = Number(lesson.id);
      return range && Number.isFinite(lessonId) && lessonId >= range[0] && lessonId <= range[1];
    })
    || null;
}

function getUnitLessons(unitOrId) {
  const unit = _resolveUnit(unitOrId);
  const lessons = _lessonArray();
  if (!unit || !lessons.length) return [];
  const range = _safeUnitRange(unit);
  return lessons
    .filter(lesson => {
      const lessonId = Number(lesson?.id);
      if (!Number.isFinite(lessonId)) return false;
      if (range) return lessonId >= range[0] && lessonId <= range[1];
      return lesson?.unit && (lesson.unit === unit.name || lesson.unit === unit.title);
    })
    .sort((a, b) => Number(a.id) - Number(b.id));
}

function getUnitAccessTier(unitOrId) {
  return 'standard';
}

function getUnitPreviewLessonCount(unitOrId) {
  const unit = _resolveUnit(unitOrId);
  return Math.max(0, Math.round(Number(unit?.previewLessonCount) || 0));
}

function canUserAccessTier(requiredTier, user = (typeof S !== 'undefined' ? S.user : null)) {
  return true;
}

function canUserAccessUnit(unitOrId, user = (typeof S !== 'undefined' ? S.user : null)) {
  const unit = _resolveUnit(unitOrId);
  if (!unit) return false;
  return getUnitLessons(unit).length > 0;
}

function getLessonAccessTier(lessonOrId) {
  return 'standard';
}

function getScorePercentage(correctCount, totalQuestions) {
  const total = Math.max(0, Math.round(Number(totalQuestions) || 0));
  if (!total) return 0;
  const correct = Math.max(0, Number(correctCount) || 0);
  return (correct / total) * 100;
}

function isPassingScore(correctCount, totalQuestions) {
  return getScorePercentage(correctCount, totalQuestions) > PASSING_SCORE_THRESHOLD;
}

function getLessonPathState(lessonOrId, {
  completedIds = (typeof S !== 'undefined' ? S.completedIds : []),
  user = (typeof S !== 'undefined' ? S.user : null)
} = {}) {
  const lessons = _lessonArray();
  const lesson = typeof lessonOrId === 'object'
    ? lessonOrId
    : lessons.find(item => Number(item?.id) === Number(lessonOrId));

  if (!lesson) return null;

  const completedSet = new Set(Array.isArray(completedIds) ? completedIds : []);
  const unit = getUnitForLesson(lesson);
  const unitLessons = getUnitLessons(unit);
  const indexInUnit = unitLessons.findIndex(item => item.id === lesson.id);
  const accessTier = getLessonAccessTier(lesson);
  const completed = completedSet.has(lesson.id);

  return {
    lesson,
    unit,
    accessTier,
    completed,
    tierBlocked: false,
    sequentialUnlocked: true,
    paywallAvailable: false,
    available: true,
    lockedReason: null,
    previousLesson: null,
    indexInUnit
  };
}

function getUnitProgress(unitOrId, completedIds = (typeof S !== 'undefined' ? S.completedIds : [])) {
  const lessons = getUnitLessons(unitOrId);
  const completedSet = new Set(Array.isArray(completedIds) ? completedIds : []);
  const unit = _resolveUnit(unitOrId);
  const completedCount = lessons.filter(lesson => completedSet.has(lesson.id)).length;
  const firstIncompleteLesson = lessons.find(lesson => !completedSet.has(lesson.id)) || null;
  const total = lessons.length;

  return {
    total,
    completedCount,
    previewLessonCount: getUnitPreviewLessonCount(unit),
    progressPct: total ? Math.round((completedCount / total) * 100) : 0,
    allComplete: total > 0 && completedCount === total,
    firstIncompleteLesson
  };
}

function buildDerivedUnlockedIds(
  completedIds = (typeof S !== 'undefined' ? S.completedIds : []),
  user = (typeof S !== 'undefined' ? S.user : null)
) {
  return _lessonArray()
    .map(lesson => Number(lesson?.id))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function getNextAvailableLesson(
  completedIds = (typeof S !== 'undefined' ? S.completedIds : []),
  user = (typeof S !== 'undefined' ? S.user : null)
) {
  const lessons = _lessonArray();
  if (!lessons.length) return null;
  const completedSet = new Set(Array.isArray(completedIds) ? completedIds : []);
  return lessons.find(lesson => !completedSet.has(Number(lesson?.id))) || null;
}

// ── COURSE CONTENT ────────────────────────────────────────────
// Reading content shown before each quiz.
//
// Keys must match lesson IDs in lessonBank.js exactly.
// Only `reading`, `difficulty`, and `body` are rendered by quiz.js.
// `title`, `unit`, and `icon` are documentation only.
//
// Lessons without a COURSES entry skip the reading screen and go
// straight to the quiz — see openCourse() in quiz.js.
//
// Coverage: authored reading content currently exists for lessons 1–25.
// ── UNIT 1: Money & Markets (lessons 1–15) ──────────────────
// ── UNIT 2: Investing for Everyone (lessons 16–25) ──────────
const COURSES = {

  // ── UNIT 1 — Money & Markets ──────────────────────────────

  1:{
    title:"What Is a Stock?", unit:"Money & Markets", icon:"stock",
    reading:5, difficulty:"Beginner",
    body:`
<p>A <strong>stock</strong> (also called a <strong>share</strong> or <strong>equity</strong>) represents a small ownership stake in a company. When a company wants to raise money, it can divide itself into millions of tiny pieces and sell them to the public. Each piece is a share of stock.</p>
<span class="highlight">"When you buy a share of Apple, you don't just own a piece of paper — you own a fraction of every iPhone sold, every product line, and every dollar of profit the company makes."</span>
<h3>Why do companies sell stock?</h3>
<p>Companies sell stock to raise capital — money they can use to grow the business, hire staff, build products, or pay off debt. In exchange, investors get ownership. If the company grows and becomes more valuable, so does your slice.</p>
<h3>How do investors make money?</h3>
<p>Two main ways: <strong>price appreciation</strong> (the stock goes up in value and you sell for more than you paid) and <strong>dividends</strong> (some companies distribute a portion of profits directly to shareholders, usually quarterly).</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Share</div><div class="term-val">A single unit of ownership in a company</div></div>
  <div class="term-row"><div class="term-key">Equity</div><div class="term-val">Ownership interest in a company</div></div>
  <div class="term-row"><div class="term-key">Dividend</div><div class="term-val">Cash paid by a company to its shareholders</div></div>
  <div class="term-row"><div class="term-key">Market cap</div><div class="term-val">Total value of all a company's shares combined</div></div>
</div>
<h3>The risk-return tradeoff</h3>
<p>Stocks can deliver strong long-term returns, but they're not guaranteed. Prices go up and down based on company performance, economic conditions, and investor sentiment. The potential for higher returns comes with higher short-term volatility — that's the tradeoff.</p>`
  },

  2:{
    title:"What Is a Bond?", unit:"Money & Markets", icon:"bond",
    reading:5, difficulty:"Beginner",
    body:`
<p>When governments or corporations need to borrow money, they issue <strong>bonds</strong>. A bond is essentially an IOU — you lend them money today, they promise to pay you back on a set date (the <strong>maturity</strong>) plus regular interest payments along the way.</p>
<span class="highlight">"Buying a bond is like being the bank. You're the one earning interest, not paying it."</span>
<h3>How bonds work</h3>
<p>When you buy a $1,000 bond with a 5% coupon, you receive $50 per year (usually paid twice yearly) until the bond matures. At maturity, you get your $1,000 back. The interest rate on a bond is set when it's issued and doesn't change — that's why bonds are called <strong>fixed income</strong>.</p>
<h3>Bonds vs. stocks</h3>
<p>Bonds are generally considered safer than stocks — you know exactly what you'll earn and when. But that safety comes at a cost: lower long-term returns. Stocks have outperformed bonds over most long time horizons, but with much more volatility.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Coupon</div><div class="term-val">The periodic interest payment on a bond</div></div>
  <div class="term-row"><div class="term-key">Maturity</div><div class="term-val">The date when the bond issuer repays the principal</div></div>
  <div class="term-row"><div class="term-key">Yield</div><div class="term-val">The return an investor gets from a bond, adjusted for price</div></div>
  <div class="term-row"><div class="term-key">Duration</div><div class="term-val">A measure of a bond's sensitivity to interest rate changes</div></div>
</div>
<h3>Why rates and prices move opposite</h3>
<p>This is one of the most important concepts in fixed income: <strong>when interest rates rise, existing bond prices fall</strong>. If new bonds offer 6% but yours only pays 4%, nobody wants yours at face value — its price drops until the yield is competitive again.</p>`
  },

  3:{
    title:"What Is an ETF?", unit:"Money & Markets", icon:"etf",
    reading:4, difficulty:"Beginner",
    body:`
<p>An <strong>Exchange Traded Fund (ETF)</strong> is a basket of investments — typically stocks, bonds, or commodities — that trades on a stock exchange just like a single share. Instead of picking individual stocks, you buy one ETF and instantly own a slice of everything inside it.</p>
<span class="highlight">"An ETF is like ordering a sampler platter instead of choosing one dish. You get a bit of everything, which reduces the risk of any single item being terrible."</span>
<h3>Why ETFs became popular</h3>
<p>Before ETFs, diversification was expensive and complex. You'd need to buy dozens of stocks separately. ETFs changed that — for the price of one share, you can own a piece of 500 companies, an entire bond market, or a basket of commodities. They're also tax-efficient and usually have low management fees.</p>
<h3>Index ETFs vs. active ETFs</h3>
<p><strong>Index ETFs</strong> simply track a market index (like the S&amp;P 500) — no manager is trying to pick winners. <strong>Active ETFs</strong> have a portfolio manager making buy/sell decisions. Index ETFs typically have lower fees and, over time, often outperform their active counterparts.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">ETF</div><div class="term-val">Exchange Traded Fund — a basket of securities</div></div>
  <div class="term-row"><div class="term-key">Index</div><div class="term-val">A benchmark tracking a group of stocks (e.g. S&amp;P 500)</div></div>
  <div class="term-row"><div class="term-key">Expense ratio</div><div class="term-val">Annual fee charged by the fund, expressed as a %</div></div>
  <div class="term-row"><div class="term-key">NAV</div><div class="term-val">Net Asset Value — the per-share value of the fund's holdings</div></div>
</div>`
  },

  4:{
    title:"What Is an Index Fund?", unit:"Money & Markets", icon:"etf",
    reading:4, difficulty:"Beginner",
    body:`
<p>An <strong>index fund</strong> is designed to track the performance of a specific market index — like the S&amp;P 500 — by buying every stock in the index in proportion to its size. Instead of a manager picking winners, the fund simply mirrors the market. You get the whole index in one purchase, automatically diversified, with no active decisions required.</p>
<span class="highlight">"Buying an index fund means betting on capitalism itself — not on any single company to win, but on the entire system to grow over time."</span>
<h3>Why low cost matters so much</h3>
<p>Because index funds require no active management — no analysts, no research teams, no frequent trading — they charge dramatically lower fees than actively managed funds. The average index ETF charges around 0.05% annually. A typical active fund charges 0.75–1.5%. That gap compounds over decades: a 1% fee difference on a $100,000 portfolio over 30 years costs roughly $80,000 in lost growth.</p>
<h3>The case against active management</h3>
<p>S&amp;P's SPIVA report shows that over 15-year periods, more than 85% of actively managed large-cap US funds underperform their benchmark index after fees. The math is unforgiving: in aggregate, active managers collectively earn the market return before fees. After fees, the average active fund must underperform. Index funds win by default.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Index</div><div class="term-val">A benchmark tracking a defined group of stocks</div></div>
  <div class="term-row"><div class="term-key">Expense ratio</div><div class="term-val">Annual fee deducted from fund assets, expressed as a %</div></div>
  <div class="term-row"><div class="term-key">Passive investing</div><div class="term-val">Tracking an index rather than picking individual stocks</div></div>
  <div class="term-row"><div class="term-key">Tracking error</div><div class="term-val">How closely a fund matches its benchmark index</div></div>
</div>`
  },

  5:{
    title:"What Is a Mutual Fund?", unit:"Money & Markets", icon:"etf",
    reading:4, difficulty:"Beginner",
    body:`
<p>A <strong>mutual fund</strong> pools money from thousands of investors and uses it to buy a diversified portfolio of stocks, bonds, or other assets. A professional fund manager makes investment decisions on behalf of everyone in the pool. When the fund's holdings rise in value, so does your slice. When they fall, so does yours.</p>
<span class="highlight">"A mutual fund is the original 'invest like an institution' product for ordinary people — professional management and diversification at a scale individual investors couldn't access alone."</span>
<h3>How mutual funds differ from ETFs</h3>
<p>The key mechanical difference is how they trade. <strong>ETFs</strong> trade on a stock exchange throughout the day at live market prices — you buy and sell like a stock. <strong>Mutual funds</strong> are priced once a day at the close, at their <strong>Net Asset Value (NAV)</strong>. You can't buy a mutual fund at 2pm at the current price; your order executes at the day's closing NAV regardless of when you submit it.</p>
<h3>Active vs. passive mutual funds</h3>
<p>Most mutual funds are <strong>actively managed</strong> — a team decides which securities to hold and when to trade. This costs money, passed to investors as a higher expense ratio. But mutual funds also come in passive form: Vanguard's index mutual funds track benchmarks at very low cost, identical in substance to index ETFs. The vehicle is the same; the strategy differs.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">NAV</div><div class="term-val">Net Asset Value — the per-share value of a fund's holdings, priced daily</div></div>
  <div class="term-row"><div class="term-key">Expense ratio</div><div class="term-val">Annual fee deducted from fund assets as a percentage</div></div>
  <div class="term-row"><div class="term-key">Active management</div><div class="term-val">A fund manager making buy/sell decisions to try to beat the market</div></div>
  <div class="term-row"><div class="term-key">Diversification</div><div class="term-val">Spreading investments across many assets to reduce individual risk</div></div>
</div>`
  },

  6:{
    title:"The S&P 500", unit:"Money & Markets", icon:"stock",
    reading:4, difficulty:"Beginner",
    body:`
<p>The <strong>S&amp;P 500</strong> is an index tracking the 500 largest publicly traded companies in the United States by market capitalisation. Maintained by S&amp;P Global, it covers roughly 80% of the total US stock market value. When people say "the market was up today," they almost always mean the S&amp;P 500.</p>
<span class="highlight">"The S&P 500 is not just a number on a screen — it is a real-time snapshot of what 500 of the world's most powerful companies are collectively worth, updated every second markets are open."</span>
<h3>How it's constructed</h3>
<p>The S&amp;P 500 is <strong>market-cap weighted</strong> — larger companies like Apple, Microsoft, and Nvidia have greater influence on the index than smaller members. A 5% move in Apple affects the index far more than a 5% move in a mid-size member. This means the index naturally concentrates in the biggest winners over time, which is both a feature and a source of concentration risk.</p>
<h3>Why it's the benchmark that matters</h3>
<p>Virtually every professional fund manager's performance is measured against the S&amp;P 500. For individual investors, an S&amp;P 500 index fund is often described as the single best default investment for long-term wealth building. You get 500 companies, instant diversification, and the full return of the US equity market — for a fee as low as 0.03% annually.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Market-cap weighted</div><div class="term-val">Larger companies have proportionally greater influence on the index</div></div>
  <div class="term-row"><div class="term-key">Benchmark</div><div class="term-val">A standard against which investment performance is measured</div></div>
  <div class="term-row"><div class="term-key">Constituent</div><div class="term-val">A company that is a member of an index</div></div>
  <div class="term-row"><div class="term-key">Index rebalancing</div><div class="term-val">Periodic updates to add or remove companies from the index</div></div>
</div>`
  },

  7:{
    title:"Market Capitalisation", unit:"Money & Markets", icon:"stock",
    reading:4, difficulty:"Beginner",
    body:`
<p><strong>Market capitalisation</strong> (market cap) is the simplest measure of a company's size: share price multiplied by total shares outstanding. If a company has 100 million shares trading at $50 each, its market cap is $5 billion. It represents what investors collectively believe the entire company is worth right now — not what the company owns or earns, but what the market is willing to pay for it.</p>
<span class="highlight">"Market cap answers one question: if you wanted to buy the entire company at today's price, what would the equity cost? That's the market's real-time answer."</span>
<h3>The size categories</h3>
<p>Investors classify companies by market cap. <strong>Large-cap</strong> (typically over $10 billion) companies are established, household names — Apple, JPMorgan, Toyota. <strong>Mid-cap</strong> ($2–10 billion) are growing companies with less stability. <strong>Small-cap</strong> (under $2 billion) are higher-risk, higher-potential businesses. Different investors have different preferences — large-caps are safer and more liquid; small-caps can grow faster but fall harder.</p>
<h3>What market cap doesn't tell you</h3>
<p>Market cap ignores debt. A company with a $5B market cap and $3B in net debt costs $8B to fully acquire — that's why analysts use <strong>Enterprise Value</strong> (market cap + debt − cash) for acquisition math. Market cap is the equity value; enterprise value is the total business cost. The distinction is critical in dealmaking and valuation.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Market cap</div><div class="term-val">Share price × total shares outstanding</div></div>
  <div class="term-row"><div class="term-key">Large-cap</div><div class="term-val">Companies with market cap typically above $10 billion</div></div>
  <div class="term-row"><div class="term-key">Float</div><div class="term-val">Shares available for public trading, excluding insider holdings</div></div>
  <div class="term-row"><div class="term-key">Enterprise value</div><div class="term-val">Market cap plus net debt — the full acquisition cost of a business</div></div>
</div>`
  },

  8:{
    title:"Bull vs Bear Market", unit:"Money & Markets", icon:"stock",
    reading:4, difficulty:"Beginner",
    body:`
<p>A <strong>bull market</strong> is a sustained rise in prices — typically defined as a 20% gain from a recent low. A <strong>bear market</strong> is the opposite: a sustained decline of 20% or more from a recent peak. These aren't just percentages — they describe distinct psychological climates, where optimism or fear dominates investor behaviour for months or years at a time.</p>
<span class="highlight">"Bull markets are born in pessimism, grow in scepticism, mature in optimism, and die in euphoria. Bear markets do the reverse." — Sir John Templeton</span>
<h3>What drives each</h3>
<p>Bull markets are typically fuelled by strong economic growth, rising corporate earnings, low interest rates, and expanding investor confidence. Bear markets are often triggered by recessions, rising rates, high inflation, or geopolitical shocks — and are amplified by fear-driven selling. Between the two is a <strong>correction</strong>: a 10–20% decline that doesn't quite reach bear territory and is often healthy.</p>
<h3>How long do they last?</h3>
<p>Since 1928, the average US bull market has lasted roughly 4 years with an average gain of over 150%. The average bear market has lasted about 10 months with an average loss of around 35%. Bull markets last longer and recover more than bears destroy — which is the core argument for staying invested long-term rather than trying to time exits and entries.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Bull market</div><div class="term-val">A rise of 20%+ from a recent trough</div></div>
  <div class="term-row"><div class="term-key">Bear market</div><div class="term-val">A decline of 20%+ from a recent peak</div></div>
  <div class="term-row"><div class="term-key">Correction</div><div class="term-val">A 10–20% decline — less severe than a full bear market</div></div>
  <div class="term-row"><div class="term-key">Market sentiment</div><div class="term-val">The overall mood of investors — optimistic or pessimistic</div></div>
</div>`
  },

  9:{
    title:"Compound Interest", unit:"Money & Markets", icon:"compound",
    reading:5, difficulty:"Beginner",
    body:`
<p><strong>Compound interest</strong> is when your returns generate their own returns. You earn interest not just on your original investment, but on every dollar of interest you've previously accumulated. At first the growth seems slow — then it accelerates dramatically. Einstein allegedly called it "the eighth wonder of the world," though the real wonder is how few people start early enough to fully benefit.</p>
<span class="highlight">"The first $100,000 is the hardest — not because $100K is a lot, but because compounding hasn't had time to do its work. Give it time, and time does most of the heavy lifting."</span>
<h3>A concrete example</h3>
<p>Invest $10,000 at 8% annual returns. Year one: $10,800. Year two: $11,664 — the extra $64 over a flat 8% is compounding at work. Year thirty: over $100,000 without adding another dollar. The same $10,000 sitting in a 1% savings account over 30 years gives you just $13,478. The difference is entirely the rate compounded over time.</p>
<h3>The Rule of 72</h3>
<p>A quick mental shortcut: divide 72 by your annual return rate to estimate how long it takes to double your money. At 8%, your money doubles every 9 years (72 ÷ 8). At 6%, every 12 years. At 12%, every 6 years. The higher the rate — or the earlier you start — the more doublings you get in a lifetime.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Principal</div><div class="term-val">Your original invested amount before any returns</div></div>
  <div class="term-row"><div class="term-key">Compounding</div><div class="term-val">Earning returns on previously earned returns</div></div>
  <div class="term-row"><div class="term-key">Rule of 72</div><div class="term-val">72 ÷ annual rate = approximate years to double your money</div></div>
  <div class="term-row"><div class="term-key">Time horizon</div><div class="term-val">How long you plan to remain invested</div></div>
</div>`
  },

  10:{
    title:"Inflation", unit:"Money & Markets", icon:"rates",
    reading:4, difficulty:"Beginner",
    body:`
<p><strong>Inflation</strong> is the rate at which the general level of prices rises over time, reducing the purchasing power of money. At 3% annual inflation, a $100 basket of groceries costs $103 next year, $109 in three years, and $180 in 20 years. Inflation doesn't just affect the price of things — it quietly erodes the real value of every dollar held as cash.</p>
<span class="highlight">"Inflation is a tax that's never voted on. It's levied not by governments directly, but by the gradual erosion of your money's purchasing power over time."</span>
<h3>How it's measured</h3>
<p>The most common measure is the <strong>Consumer Price Index (CPI)</strong> — a basket of goods and services that typical households buy, tracked monthly. When the CPI rises 4% year-over-year, that's 4% inflation. Central banks target roughly 2% annual inflation as a healthy rate: enough to encourage spending and investment, not so much that savings evaporate.</p>
<h3>Why it matters to investors</h3>
<p>Inflation is why cash sitting in a low-interest account loses value over time. It's why bonds with fixed coupons become less attractive when prices rise. And it's one of the core reasons to invest in assets that grow faster than inflation — like equities and real estate — rather than leaving money in cash where its purchasing power silently shrinks year after year.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">CPI</div><div class="term-val">Consumer Price Index — the most common inflation measure</div></div>
  <div class="term-row"><div class="term-key">Purchasing power</div><div class="term-val">What a given amount of money can actually buy</div></div>
  <div class="term-row"><div class="term-key">Real return</div><div class="term-val">Your investment return minus the inflation rate</div></div>
  <div class="term-row"><div class="term-key">Central bank target</div><div class="term-val">Most central banks aim for ~2% annual inflation</div></div>
</div>`
  },

  11:{
    title:"Nominal vs Real Return", unit:"Money & Markets", icon:"compound",
    reading:4, difficulty:"Beginner",
    body:`
<p>Your <strong>nominal return</strong> is the raw percentage your investment gained — the number quoted in fund brochures and headlines. Your <strong>real return</strong> is what you actually gained in purchasing power after accounting for inflation. A 9% nominal return in a year with 4% inflation is only a 5% real return. That real number is the only one that matters for building actual wealth.</p>
<span class="highlight">"A 10% return in a 9% inflation environment barely keeps pace with rising prices. Real wealth is built by real returns — everything else is just nominal noise."</span>
<h3>The Fisher Equation</h3>
<p>The relationship is captured in the <strong>Fisher Equation</strong>: Real Return ≈ Nominal Return − Inflation Rate. If your portfolio earns 7% and inflation runs at 3%, your real return is approximately 4%. The precise formula is (1 + nominal) ÷ (1 + inflation) − 1, but simple subtraction is accurate enough for most purposes and the mental model that matters.</p>
<h3>Why this reframes long-term investing</h3>
<p>The S&amp;P 500 has averaged roughly 10% nominal returns annually since 1928. With average inflation around 3%, the real return is closer to 7%. That 7% real return, compounded over decades, is what actually transforms small, regular investments into significant wealth. The nominal number flatters; the real number is the truth about what you can buy at the end.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Nominal return</div><div class="term-val">Raw percentage gain before adjusting for inflation</div></div>
  <div class="term-row"><div class="term-key">Real return</div><div class="term-val">Return adjusted for inflation — the true gain in purchasing power</div></div>
  <div class="term-row"><div class="term-key">Fisher Equation</div><div class="term-val">Real return ≈ nominal return minus inflation rate</div></div>
  <div class="term-row"><div class="term-key">Inflation-adjusted</div><div class="term-val">Any figure expressed in constant purchasing power terms</div></div>
</div>`
  },

  12:{
    title:"Liquidity", unit:"Money & Markets", icon:"rates",
    reading:4, difficulty:"Beginner",
    body:`
<p><strong>Liquidity</strong> describes how easily and quickly an asset can be converted into cash without a significant loss in value. Cash is perfectly liquid by definition. A publicly traded stock is highly liquid — you can sell it in seconds. A house, a private company stake, or a painting can take months to sell and only at the right price. Illiquidity has a real cost that is often underestimated.</p>
<span class="highlight">"Liquidity is taken for granted until it disappears. In a crisis, the most dangerous words in finance are: 'I need to sell this now.'"</span>
<h3>The bid-ask spread as a liquidity measure</h3>
<p>For any traded asset, the <strong>bid price</strong> is what buyers will pay and the <strong>ask price</strong> is what sellers want. The gap between them — the <strong>bid-ask spread</strong> — is a direct measure of liquidity. A large-cap stock might have a spread of $0.01. A thinly traded small-cap might have a spread of $0.50. Every time you buy and immediately sell, you lose the spread. Wide spreads mean illiquid markets and higher transaction costs.</p>
<h3>The illiquidity premium</h3>
<p>Because illiquid assets are harder to sell, investors demand higher returns to hold them — the <strong>illiquidity premium</strong>. Private equity, real estate, and venture capital offer higher expected returns partly because investors accept years of lockup with no ability to exit on demand. The extra return is compensation for giving up the option to sell whenever you want.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Liquidity</div><div class="term-val">Ease of converting an asset to cash without significant loss</div></div>
  <div class="term-row"><div class="term-key">Bid-ask spread</div><div class="term-val">Gap between buyers' and sellers' prices — narrower means more liquid</div></div>
  <div class="term-row"><div class="term-key">Market depth</div><div class="term-val">The volume of buy and sell orders available at various prices</div></div>
  <div class="term-row"><div class="term-key">Illiquidity premium</div><div class="term-val">Extra return demanded by investors for holding hard-to-sell assets</div></div>
</div>`
  },

  13:{
    title:"Volatility", unit:"Money & Markets", icon:"risk",
    reading:4, difficulty:"Beginner",
    body:`
<p><strong>Volatility</strong> is the statistical measure of how much an asset's price fluctuates over time. High volatility means large, unpredictable swings in both directions. Low volatility means steady, gradual movement. It is typically measured using <strong>standard deviation</strong> — the more returns deviate from their average, the more volatile the asset. Volatility is neither inherently good nor bad: it is simply the price you pay to earn returns above the risk-free rate.</p>
<span class="highlight">"Volatility is not risk. Risk is the permanent loss of capital. Volatility is just the cost of admission to earn equity returns. The investor who can't tolerate volatility will never earn it."</span>
<h3>Historical vs. implied volatility</h3>
<p><strong>Historical volatility</strong> measures how much an asset has actually moved in the past. <strong>Implied volatility (IV)</strong> is forward-looking — derived from the price of options on that asset, reflecting the market's expectation of future swings. High implied volatility means options are expensive and the market anticipates big moves ahead. The <strong>VIX index</strong> is the implied volatility of the S&amp;P 500 — widely called the "fear gauge."</p>
<h3>Why it matters more than most people think</h3>
<p>A portfolio that falls 50% requires a 100% gain just to recover to breakeven. This mathematical asymmetry is why avoiding extreme drawdowns matters more than maximising average returns. Short-term volatility is mostly noise for long-term investors, but large sustained declines are genuinely destructive — especially for anyone who needs to sell near the trough.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Volatility</div><div class="term-val">The degree of price fluctuation over time</div></div>
  <div class="term-row"><div class="term-key">Standard deviation</div><div class="term-val">Statistical measure of how much returns vary from their average</div></div>
  <div class="term-row"><div class="term-key">VIX</div><div class="term-val">S&P 500 implied volatility index — the market's "fear gauge"</div></div>
  <div class="term-row"><div class="term-key">Implied volatility</div><div class="term-val">Market's forward-looking expectation of price movement, from options pricing</div></div>
</div>`
  },

  14:{
    title:"Risk vs Reward", unit:"Money & Markets", icon:"risk",
    reading:4, difficulty:"Beginner",
    body:`
<p>In finance, <strong>risk and reward are inseparably linked</strong>. Every investment involves accepting uncertainty in exchange for the possibility of return. A government savings account is near-zero risk with near-zero return. Equities carry significant volatility with historically significant returns. Private equity and venture capital carry extreme risk with the potential for extreme returns. There is no free lunch — higher expected return always comes with higher potential loss.</p>
<span class="highlight">"The risk-return tradeoff is the most fundamental relationship in all of finance. Anyone offering high returns without high risk is either wrong, uninformed, or lying."</span>
<h3>The risk-free rate and risk premium</h3>
<p>The <strong>risk-free rate</strong> is the return you'd earn from the safest investment — typically short-term US Treasury bills. It's the baseline: any investment that carries risk must offer an expected return above the risk-free rate, or no rational investor would take it. The extra return above the risk-free rate is called the <strong>risk premium</strong> — the reward for accepting uncertainty.</p>
<h3>The equity risk premium</h3>
<p>Stocks have historically earned about 5–7% annually above the risk-free rate — this is the <strong>equity risk premium</strong>. Investors accept volatility, the possibility of significant losses, and the uncertainty of equity ownership in exchange for this excess return. Understanding this concept is the foundation of why diversified, long-term equity investing is the most proven path to wealth building for most people.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Risk-free rate</div><div class="term-val">Return on the safest investment — usually short-term Treasuries</div></div>
  <div class="term-row"><div class="term-key">Risk premium</div><div class="term-val">Extra expected return above the risk-free rate for bearing risk</div></div>
  <div class="term-row"><div class="term-key">Equity risk premium</div><div class="term-val">Historical extra return of stocks above the risk-free rate (~5–7%)</div></div>
  <div class="term-row"><div class="term-key">Expected return</div><div class="term-val">The probability-weighted average of all possible outcomes</div></div>
</div>`
  },

  15:{
    title:"Diversification", unit:"Money & Markets", icon:"etf",
    reading:5, difficulty:"Beginner",
    body:`
<p><strong>Diversification</strong> is the practice of spreading investments across different assets, sectors, and geographies so that the failure of any single holding doesn't devastate the whole portfolio. It is often called the only free lunch in investing — combining assets that don't move in lockstep with each other reduces overall portfolio risk without necessarily reducing overall return.</p>
<span class="highlight">"Don't put all your eggs in one basket — and ideally, use baskets that break for different reasons. True diversification isn't about quantity. It's about correlation."</span>
<h3>Two kinds of risk</h3>
<p>Diversification eliminates <strong>unsystematic risk</strong> (company-specific risk) — the chance that one company or sector collapses. If you own 30 uncorrelated stocks and one goes bankrupt, the damage is limited. But diversification cannot eliminate <strong>systematic risk</strong> (market risk) — the risk that affects all assets simultaneously, like a global recession. You can diversify within equities but you can't fully escape the risk of all markets falling together.</p>
<h3>The role of correlation</h3>
<p>Assets with a <strong>low or negative correlation</strong> tend to move differently from each other — when one falls, the other may hold or rise. Bonds and stocks have historically had low or negative correlation during recessions, which is why they're commonly combined in portfolios. The lower the correlation between your assets, the more true diversification benefit you capture.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Diversification</div><div class="term-val">Spreading risk across assets that don't move together</div></div>
  <div class="term-row"><div class="term-key">Correlation</div><div class="term-val">How closely two assets move together (−1 to +1)</div></div>
  <div class="term-row"><div class="term-key">Unsystematic risk</div><div class="term-val">Company-specific risk that can be eliminated through diversification</div></div>
  <div class="term-row"><div class="term-key">Systematic risk</div><div class="term-val">Market-wide risk that cannot be diversified away</div></div>
</div>`
  },

  // ── UNIT 2 — Investing for Everyone ───────────────────────

  16:{
    title:"Dividend", unit:"Investing for Everyone", icon:"compound",
    reading:4, difficulty:"Beginner",
    body:`
<p>A <strong>dividend</strong> is a cash payment made by a company to its shareholders, typically funded from profits. When a company earns more than it needs to reinvest, it can return some of that cash directly to the people who own it. Dividends are usually paid quarterly and expressed either as a dollar amount per share or as a percentage of the current stock price — the <strong>dividend yield</strong>.</p>
<span class="highlight">"A dividend is the most honest signal a company can send. You can manipulate earnings on paper, but you can't fake cash being deposited into shareholder accounts every quarter."</span>
<h3>How dividends work in practice</h3>
<p>Three dates matter: the <strong>declaration date</strong> (when the dividend is announced), the <strong>ex-dividend date</strong> (the cutoff — you must own shares before this date to receive payment), and the <strong>payment date</strong> (when cash actually hits accounts). Buy on or after the ex-dividend date and the upcoming payment goes to the previous holder, not you. This date is why stock prices often dip slightly right after it passes.</p>
<h3>Not all companies pay dividends</h3>
<p>Growth companies like Amazon and Alphabet have historically paid no dividends — they reinvest every dollar into expansion. Mature, cash-generative companies — utilities, consumer staples, banks — are the classic dividend payers. A consistent, growing dividend over many years is a strong signal of financial health and management confidence in sustained profitability.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Dividend</div><div class="term-val">Cash payment from a company to its shareholders</div></div>
  <div class="term-row"><div class="term-key">Dividend yield</div><div class="term-val">Annual dividend per share ÷ current stock price × 100</div></div>
  <div class="term-row"><div class="term-key">Ex-dividend date</div><div class="term-val">The cutoff date to qualify for the upcoming dividend</div></div>
  <div class="term-row"><div class="term-key">Payout ratio</div><div class="term-val">Percentage of earnings paid out as dividends</div></div>
</div>`
  },

  17:{
    title:"Capital Gains", unit:"Investing for Everyone", icon:"stock",
    reading:4, difficulty:"Beginner",
    body:`
<p>A <strong>capital gain</strong> is the profit you make when you sell an investment for more than you paid for it. Buy 100 shares at $40, sell them at $65 — you've made a $2,500 capital gain. Until you sell, the gain is <strong>unrealised</strong> — it exists on paper but triggers no tax event. The moment you sell, it becomes <strong>realised</strong>, and most tax authorities want a portion of it.</p>
<span class="highlight">"The single most powerful tax advantage available to most investors is doing nothing. Unrealised gains compound indefinitely tax-deferred — selling resets the clock and hands part of your gain to the government."</span>
<h3>Short-term vs. long-term</h3>
<p>In most tax systems, including the US, how long you held an asset determines the tax rate on the gain. <strong>Short-term capital gains</strong> — assets held under one year — are taxed as ordinary income (often 22–37% in the US). <strong>Long-term capital gains</strong> — held over one year — qualify for preferential rates (0%, 15%, or 20% depending on income). This is a powerful built-in incentive to hold rather than trade frequently.</p>
<h3>Capital losses offset gains</h3>
<p>Selling at a loss creates a <strong>capital loss</strong> that offsets gains and reduces your tax bill. Strategically realising losses to offset gains is called <strong>tax-loss harvesting</strong>. In the US, losses exceeding gains can offset up to $3,000 of ordinary income per year, with any remainder carried forward indefinitely. This turns a losing investment into at least partial tax savings.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Capital gain</div><div class="term-val">Profit from selling an investment above its purchase price</div></div>
  <div class="term-row"><div class="term-key">Unrealised gain</div><div class="term-val">Paper profit on an investment not yet sold</div></div>
  <div class="term-row"><div class="term-key">Cost basis</div><div class="term-val">The original purchase price used to calculate gain or loss</div></div>
  <div class="term-row"><div class="term-key">Tax-loss harvesting</div><div class="term-val">Selling losing positions intentionally to offset taxable gains</div></div>
</div>`
  },

  18:{
    title:"Dollar-Cost Averaging", unit:"Investing for Everyone", icon:"compound",
    reading:4, difficulty:"Beginner",
    body:`
<p><strong>Dollar-cost averaging (DCA)</strong> means investing a fixed amount at regular intervals — regardless of what the market is doing. Put in $500 every month whether the market is up, down, or sideways. When prices are high, your $500 buys fewer shares. When prices are low, it buys more. Over time, your average cost per share smooths out — and you remove the paralysing question of "is now the right time?"</p>
<span class="highlight">"DCA is not a strategy for maximising returns. It's a strategy for maximising the probability that you actually invest — and stay invested — instead of waiting forever for the perfect moment that never comes."</span>
<h3>DCA vs. lump-sum investing</h3>
<p>If you have $10,000 to invest, studies consistently show that investing it all at once outperforms DCA about two-thirds of the time — because markets tend to go up, so earlier deployment wins. But DCA wins behaviorally. Most people don't have a lump sum to deploy. And those who do are often too scared to deploy it all at once, so it sits in cash for months or years, earning almost nothing.</p>
<h3>The psychology is the point</h3>
<p>DCA is the structure behind almost every employer pension plan — a portion of every paycheck goes in automatically. That systematic, emotionless approach is its real power. It removes the temptation to time the market, prevents the most common mistake (waiting for a dip that never comes), and keeps you invested through volatility that would otherwise trigger panic selling.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Dollar-cost averaging</div><div class="term-val">Investing a fixed amount at regular intervals regardless of price</div></div>
  <div class="term-row"><div class="term-key">Lump sum</div><div class="term-val">Investing all available capital at once</div></div>
  <div class="term-row"><div class="term-key">Average cost basis</div><div class="term-val">The blended average price paid per share across multiple purchases</div></div>
  <div class="term-row"><div class="term-key">Market timing</div><div class="term-val">Attempting to buy and sell based on predicted price movements</div></div>
</div>`
  },

  19:{
    title:"Asset Allocation", unit:"Investing for Everyone", icon:"etf",
    reading:5, difficulty:"Beginner",
    body:`
<p><strong>Asset allocation</strong> is how you divide your portfolio across different asset classes — stocks, bonds, cash, real estate, and commodities. It is the single most important decision a long-term investor makes. Research has consistently found that asset allocation explains the vast majority of the variability in a portfolio's returns over time. Which stocks you pick matters far less than how much of your money is in stocks at all.</p>
<span class="highlight">"Asset allocation is not about picking winners. It's about making sure you're in the right game — one that matches your timeline, your goals, and your actual capacity to absorb losses."</span>
<h3>The 60/40 portfolio</h3>
<p>The most famous allocation is <strong>60% stocks / 40% bonds</strong> — a framework designed to balance growth with stability. Stocks provide the growth engine; bonds act as a cushion when equities fall (they typically move in opposite directions in most environments). In 2022, rising rates hit bonds and equities simultaneously — a reminder that no framework is unconditional. The 60/40 is a starting point, not a law.</p>
<h3>Allocation changes with age</h3>
<p>A 25-year-old can hold 90%+ in equities — they have decades to ride out downturns. A 65-year-old approaching retirement cannot afford a 40% drawdown and needs stability. The classic rule of thumb is that your bond allocation equals your age (age 40 → 40% bonds). Many modern advisors consider this too conservative given longer lifespans, but the core principle holds: risk capacity declines as your time horizon shortens.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Asset allocation</div><div class="term-val">The split of a portfolio across different asset classes</div></div>
  <div class="term-row"><div class="term-key">Asset class</div><div class="term-val">A category of investments with similar characteristics (equities, bonds, cash)</div></div>
  <div class="term-row"><div class="term-key">60/40 portfolio</div><div class="term-val">60% stocks, 40% bonds — a classic moderate-risk allocation</div></div>
  <div class="term-row"><div class="term-key">Glide path</div><div class="term-val">The gradual shift to lower-risk allocations as retirement approaches</div></div>
</div>`
  },

  20:{
    title:"Risk Tolerance", unit:"Investing for Everyone", icon:"risk",
    reading:4, difficulty:"Beginner",
    body:`
<p><strong>Risk tolerance</strong> is your personal capacity — both financial and emotional — to handle investment losses without abandoning your strategy. It's not just about what you can afford to lose. It's about what you can psychologically endure watching on a screen without panic-selling. You might have a high financial capacity for risk but a low emotional tolerance, and that mismatch is one of the most common causes of permanently bad investment outcomes.</p>
<span class="highlight">"Risk tolerance is not how you feel about risk during a 15-year bull market. It's how you actually behave when your portfolio drops 35% in six weeks and every headline says it's only going to get worse."</span>
<h3>Financial capacity vs. emotional tolerance</h3>
<p>Your <strong>financial capacity for risk</strong> is objective: your income stability, savings rate, time horizon, emergency fund size, and debt level. A young person with a stable job, no debt, and a 30-year runway has high capacity. Your <strong>emotional tolerance</strong> is subjective and only fully revealed in a real crash — not a questionnaire. Overestimating it leads to the worst possible outcome: selling everything at the bottom.</p>
<h3>Time horizon changes everything</h3>
<p>A 25% portfolio decline is a temporary paper loss if you're 30 with no plans to withdraw — and a near-catastrophic event if you're 65 and need the money next year. Time horizon is the dominant factor in risk tolerance: the longer your runway, the more short-term volatility you can absorb and benefit from, as markets have historically recovered and made new highs over sufficient time periods.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Risk tolerance</div><div class="term-val">Your ability and willingness to endure investment losses</div></div>
  <div class="term-row"><div class="term-key">Risk capacity</div><div class="term-val">The financial ability to absorb losses without altering your lifestyle</div></div>
  <div class="term-row"><div class="term-key">Time horizon</div><div class="term-val">How long before you need to access your invested money</div></div>
  <div class="term-row"><div class="term-key">Loss aversion</div><div class="term-val">The tendency to feel losses more sharply than equivalent gains</div></div>
</div>`
  },

  21:{
    title:"Portfolio Rebalancing", unit:"Investing for Everyone", icon:"etf",
    reading:4, difficulty:"Beginner",
    body:`
<p><strong>Portfolio rebalancing</strong> is the process of restoring your portfolio to its intended allocation after market movements have shifted the weights. If your target is 60% stocks and 40% bonds, and a strong equity rally pushes stocks to 72%, you're now taking more risk than intended. Rebalancing means trimming stocks and adding bonds to get back to 60/40 — systematically selling what has run up and buying what has lagged.</p>
<span class="highlight">"Rebalancing is mechanised contrarianism. It forces you to sell what is relatively expensive and buy what is relatively cheap — the exact opposite of what every instinct tells you to do in the moment."</span>
<h3>When to rebalance</h3>
<p>Two common approaches: <strong>calendar rebalancing</strong> (quarterly or annually on a fixed schedule) and <strong>threshold rebalancing</strong> (whenever any allocation drifts more than 5–10% from target). Calendar rebalancing is simpler; threshold rebalancing is more responsive to volatile markets. Both approaches work. The key is consistency — irregular, emotion-driven rebalancing captures none of the structural benefits.</p>
<h3>Minimising the tax drag</h3>
<p>Selling appreciated assets to rebalance triggers capital gains tax in taxable accounts. Tax-efficient alternatives: direct new contributions toward underweight asset classes (no sale, no tax), or rebalance inside tax-advantaged accounts where gains are deferred. In practice, many long-term investors rebalance primarily through contribution direction, keeping taxable events to a minimum.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Rebalancing</div><div class="term-val">Restoring a portfolio to its target allocation after drift</div></div>
  <div class="term-row"><div class="term-key">Portfolio drift</div><div class="term-val">How allocations shift as different assets grow at different rates</div></div>
  <div class="term-row"><div class="term-key">Target allocation</div><div class="term-val">The intended percentage split across asset classes</div></div>
  <div class="term-row"><div class="term-key">Tax-advantaged account</div><div class="term-val">Account where gains are tax-deferred or tax-free (e.g. IRA, 401k)</div></div>
</div>`
  },

  22:{
    title:"Passive vs Active Investing", unit:"Investing for Everyone", icon:"etf",
    reading:5, difficulty:"Beginner",
    body:`
<p><strong>Passive investing</strong> means tracking a market index — buying every stock in the S&amp;P 500 in proportion to its size, with no manager making buy or sell decisions. <strong>Active investing</strong> employs a portfolio manager to research, select, and trade securities with the goal of beating the market. It sounds obvious which would win. Decades of data say otherwise.</p>
<span class="highlight">"Active management is a zero-sum game before costs and a negative-sum game after. In aggregate, active investors are the market — so the average active manager must underperform by exactly the amount of their fees."</span>
<h3>The evidence for passive</h3>
<p>S&amp;P's SPIVA report — the definitive active-vs-passive scorecard — shows that over 15-year periods, over 85% of large-cap US active funds underperform the S&amp;P 500 after fees. This isn't cherry-picked data; it's the consistent finding across asset classes, geographies, and time periods. Individual outperforming managers exist, but identifying them in advance is nearly impossible, and their advantage tends to erode over time.</p>
<h3>When active might make sense</h3>
<p>In less efficient, less followed markets — small-cap stocks, emerging markets, certain fixed income sectors — there may be more opportunity for skilled managers to find mispriced securities. The information edge is highest where the fewest analysts are looking. Even so, the fee hurdle remains: an active manager needs to consistently outperform by at least 0.75–1.5% annually just to match a low-cost index fund after costs.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Passive investing</div><div class="term-val">Tracking a market index with no active stock selection</div></div>
  <div class="term-row"><div class="term-key">Active management</div><div class="term-val">A manager making investment decisions to try to beat the market</div></div>
  <div class="term-row"><div class="term-key">Alpha</div><div class="term-val">Returns generated above a benchmark on a risk-adjusted basis</div></div>
  <div class="term-row"><div class="term-key">Market efficiency</div><div class="term-val">How quickly and accurately prices reflect all available information</div></div>
</div>`
  },

  23:{
    title:"Growth vs Value Stocks", unit:"Investing for Everyone", icon:"stock",
    reading:5, difficulty:"Beginner",
    body:`
<p><strong>Growth stocks</strong> are companies expected to increase earnings significantly faster than average. Investors pay a premium for that expected future growth — accepting a high current valuation in anticipation of much higher future profits. <strong>Value stocks</strong> are companies trading below what they appear to be intrinsically worth, often due to temporary problems, slow growth, or market neglect. Both approaches have produced exceptional long-term investors. Both have also produced spectacular failures.</p>
<span class="highlight">"Growth investing is paying a premium for an exciting future. Value investing is paying a discount for a boring present. Both approaches have made people very wealthy — and very poor."</span>
<h3>What drives each style's performance</h3>
<p>Growth stocks depend heavily on distant future earnings, making them sensitive to <strong>interest rates</strong> — higher rates reduce the present value of future cash flows, compressing growth multiples sharply. They tend to outperform in low-rate, expanding economies. Value stocks tend to outperform during rising rate environments and early economic recoveries, when current profitability reasserts its importance over speculative narratives.</p>
<h3>The styles aren't mutually exclusive</h3>
<p>Charlie Munger pushed Warren Buffett away from pure "cigar-butt" value toward "buying wonderful companies at fair prices" — essentially growth at a reasonable valuation. The GARP strategy (Growth At a Reasonable Price) seeks companies with strong growth prospects without the extreme premiums that make pure growth stocks so vulnerable to a single missed quarter or a change in the rate environment.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Growth stock</div><div class="term-val">Company expected to grow earnings much faster than average</div></div>
  <div class="term-row"><div class="term-key">Value stock</div><div class="term-val">Company trading below its estimated intrinsic value</div></div>
  <div class="term-row"><div class="term-key">Margin of safety</div><div class="term-val">Buying well below intrinsic value as a buffer against being wrong</div></div>
  <div class="term-row"><div class="term-key">GARP</div><div class="term-val">Growth At a Reasonable Price — a blend of both philosophies</div></div>
</div>`
  },

  24:{
    title:"Market Cycles", unit:"Investing for Everyone", icon:"compound",
    reading:4, difficulty:"Beginner",
    body:`
<p>Economies and markets move in recurring <strong>cycles</strong> — not in perfect circles, but in patterns that repeat: periods of expansion are followed by peaks, contractions, and troughs, before growth resumes. No two cycles are identical in timing or magnitude, but the phases are consistent. Understanding where you are in the cycle doesn't guarantee good decisions, but ignoring cycles entirely means being perpetually surprised by events that have always happened before.</p>
<span class="highlight">"History doesn't repeat in markets, but it rhymes loudly. The investor who reads financial history is always better positioned than the one who believes 'this time is different.'"</span>
<h3>The four phases</h3>
<p><strong>Expansion</strong>: GDP grows, unemployment falls, earnings rise, confidence builds. <strong>Peak</strong>: the economy is at maximum output, inflation often rises, valuations can become stretched. <strong>Contraction</strong> (recession): growth slows or reverses, unemployment rises, earnings fall, and markets price in the decline ahead of the economic data. <strong>Trough</strong>: the low point — the moment of maximum fear and pessimism, and often the best buying opportunity in hindsight.</p>
<h3>Why timing cycles is nearly impossible</h3>
<p>Peaks and troughs are only clearly visible with hindsight. The economy can look strong right until it doesn't. Markets often turn before economic data confirms the turn — equities are a leading indicator. The practical takeaway: stay diversified, rebalance systematically, and avoid making large portfolio shifts based on cycle predictions. Most investors who try to time cycles underperform those who simply stay invested.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">Expansion</div><div class="term-val">Phase of economic growth — rising output, employment, and earnings</div></div>
  <div class="term-row"><div class="term-key">Contraction</div><div class="term-val">Phase of economic slowdown — falling growth, rising unemployment</div></div>
  <div class="term-row"><div class="term-key">Leading indicator</div><div class="term-val">Data that changes before the economy does (equity markets are one)</div></div>
  <div class="term-row"><div class="term-key">Trough</div><div class="term-val">The low point of a cycle — maximum pessimism, often the best entry</div></div>
</div>`
  },

  25:{
    title:"IPO", unit:"Investing for Everyone", icon:"ipo",
    reading:5, difficulty:"Beginner",
    body:`
<p>An <strong>Initial Public Offering (IPO)</strong> is the moment a private company first sells its shares to the general public on a stock exchange. Before the IPO, ownership belongs to founders, employees, and private investors. After it, anyone with a brokerage account can become a shareholder. IPOs create enormous public wealth — and enormous public losses. They are simultaneously the ultimate reward for early investors and a notoriously poor investment for most people who buy on day one.</p>
<span class="highlight">"An IPO is a private company's first opportunity to sell shares to people who know far less about the business than the sellers. Price accordingly."</span>
<h3>Why companies go public</h3>
<p>Going public raises capital for growth, allows early investors and employees to sell their stakes (liquidity), creates publicly traded shares that can be used for acquisitions, and raises the company's profile. But it comes at significant cost: ongoing regulatory reporting, the scrutiny of quarterly earnings, and the need to manage the stock price in addition to managing the actual business.</p>
<h3>Why IPOs often disappoint public buyers</h3>
<p>The people selling in an IPO — founders, venture capitalists, early employees — know the business inside and out. The people buying are getting their first detailed look at the S-1 filing days before pricing. This information asymmetry tends to favour sellers. Academic research consistently shows that on average, IPOs underperform the broader market over 3–5 years following listing, once the initial first-day excitement fades.</p>
<div class="key-terms">
  <h4>Key Terms</h4>
  <div class="term-row"><div class="term-key">IPO</div><div class="term-val">Initial Public Offering — first sale of a private company's shares to the public</div></div>
  <div class="term-row"><div class="term-key">Underwriter</div><div class="term-val">Investment bank that manages and prices the IPO</div></div>
  <div class="term-row"><div class="term-key">Lock-up period</div><div class="term-val">Period after IPO during which insiders cannot sell their shares</div></div>
  <div class="term-row"><div class="term-key">S-1</div><div class="term-val">SEC registration document filed before an IPO — the full public prospectus</div></div>
</div>`
  }

};

// ── LESSON SCENARIOS ──────────────────────────────────────────
// Interactive, real-life opener for a lesson. Replaces the reading screen
// with: a situation → a choice → immediate feedback → a short concept →
// a one-line takeaway. Keyed by lesson id (see openCourse() in quiz.js).
// Each choice has a `verdict`: 'strong' (best), 'risky', or 'incomplete'.
// Coverage: lessons 1–25. Lessons without a scenario keep their old flow.
const LESSON_SCENARIOS = {
  1: {
    situation: "A friend says she 'owns Apple.' You're not sure what that actually means. How would you describe what she owns?",
    choices: [
      { text: "She lent Apple money and they pay her back with interest", verdict: 'incomplete', feedback: "That describes a bond, not a stock. Lending is debt; owning stock is equity." },
      { text: "She owns a small piece of Apple itself", verdict: 'strong', feedback: "Exactly. A share of stock is partial ownership — she owns a slice of the company and its future profits." },
      { text: "She has a guaranteed payout from Apple every year", verdict: 'risky', feedback: "Nothing about stocks is guaranteed. Some pay dividends, but prices and payouts can change." },
      { text: "She has a savings account at Apple", verdict: 'incomplete', feedback: "Stocks aren't deposits. There's no insured balance — her value rises and falls with the company." }
    ],
    concept: "A stock is ownership in a company. Buy a share and you own a tiny fraction of the business, its profits, and its risks.",
    takeaway: "Owning stock means owning a piece of the company — not lending to it."
  },
  2: {
    situation: "Your city is raising money for a new library and offers bonds paying 4% a year for 10 years. What are you actually doing if you buy one?",
    choices: [
      { text: "Buying part-ownership of the library", verdict: 'incomplete', feedback: "That's how stocks work. A bond makes you a lender, not an owner." },
      { text: "Lending the city money in exchange for regular interest", verdict: 'strong', feedback: "Right. A bond is an IOU — you lend now, collect interest along the way, and get your principal back at maturity." },
      { text: "Donating to the city with no return", verdict: 'incomplete', feedback: "It's not a donation. You're promised interest plus your money back." },
      { text: "Gambling on whether the library gets popular", verdict: 'risky', feedback: "Bonds are steady lending, not speculation. You're paid interest as long as the city can pay, popular or not." }
    ],
    concept: "A bond is a loan you make to a government or company. They pay you interest, then return your principal on a set date.",
    takeaway: "With a bond, you're the bank — you earn the interest instead of paying it."
  },
  3: {
    situation: "You have $200 to invest but you're nervous about picking the 'wrong' single stock. What's a simple way to spread that risk?",
    choices: [
      { text: "Put all $200 into the one stock everyone's talking about", verdict: 'risky', feedback: "One stock means one point of failure. If it drops, so does all your money." },
      { text: "Buy an ETF that holds hundreds of companies at once", verdict: 'strong', feedback: "Smart. One ETF gives you instant diversification — a slice of many companies in a single purchase." },
      { text: "Wait until you can afford to buy 50 stocks yourself", verdict: 'incomplete', feedback: "You don't need to. An ETF gives you that spread today, with $200." },
      { text: "Keep it in cash until you feel like an expert", verdict: 'incomplete', feedback: "Waiting has a cost too. An ETF lets a beginner invest broadly without being an expert." }
    ],
    concept: "An ETF is a basket of investments that trades like a single stock. Buy one and you instantly own a bit of everything inside it.",
    takeaway: "An ETF lets you own the whole basket instead of betting on one stock."
  },
  4: {
    situation: "Two funds track large U.S. companies. One charges 0.04% a year and just mirrors the market. The other charges 0.9% and tries to beat it. Which is usually the safer long-term bet?",
    choices: [
      { text: "The expensive one — higher fees mean better managers", verdict: 'risky', feedback: "Higher fees rarely mean higher returns. Most active funds trail the market after costs." },
      { text: "The low-cost index fund that mirrors the market", verdict: 'strong', feedback: "Yes. Index funds keep fees tiny and historically beat most active funds over the long run." },
      { text: "Neither — only individual stocks build wealth", verdict: 'incomplete', feedback: "Index funds are one of the most reliable wealth-builders precisely because they're broad and cheap." },
      { text: "Whichever did best last year", verdict: 'risky', feedback: "Last year's winner often lags next year. Low cost and broad exposure matter more than recent streaks." }
    ],
    concept: "An index fund simply copies a market index like the S&P 500. No stock-picking and very low fees — and over time that usually wins.",
    takeaway: "Low fees and broad exposure beat trying to outsmart the market."
  },
  5: {
    situation: "Your aunt's retirement money is in a mutual fund. You wonder how that differs from an ETF you can buy on an app. What's the key difference?",
    choices: [
      { text: "Mutual funds hold stocks; ETFs only hold bonds", verdict: 'incomplete', feedback: "Both can hold stocks or bonds. The real difference is how and when they trade." },
      { text: "Mutual funds price once a day; ETFs trade live all day like stocks", verdict: 'strong', feedback: "Exactly. A mutual fund order settles at the end-of-day price; an ETF trades continuously during market hours." },
      { text: "Mutual funds are guaranteed not to lose money", verdict: 'risky', feedback: "No fund is guaranteed. Mutual funds rise and fall with their holdings." },
      { text: "They're identical, just different names", verdict: 'incomplete', feedback: "They're similar pooled investments, but trading style and often fees differ." }
    ],
    concept: "A mutual fund pools many investors' money into one managed portfolio, priced once daily. An ETF is similar but trades all day like a stock.",
    takeaway: "Mutual funds and ETFs are both baskets — they mainly differ in how they trade and cost."
  },
  6: {
    situation: "The news says 'the S&P 500 hit a record high today.' A friend asks what that even measures. What's the best plain-English answer?",
    choices: [
      { text: "The price of one big company's stock", verdict: 'incomplete', feedback: "It's not one company — it's 500 of the largest U.S. companies combined." },
      { text: "How 500 of the biggest U.S. companies are doing overall", verdict: 'strong', feedback: "Right. The S&P 500 tracks 500 large U.S. companies and is the go-to gauge for the U.S. stock market." },
      { text: "The total number of stocks traded that day", verdict: 'incomplete', feedback: "It measures value, not trading count — a weighted index of 500 companies." },
      { text: "A government savings program", verdict: 'incomplete', feedback: "It's a market index, not a government program." }
    ],
    concept: "The S&P 500 is an index of 500 large U.S. companies, weighted by size. It's the standard scoreboard for the U.S. market.",
    takeaway: "When people say 'the market,' they usually mean the S&P 500."
  },
  7: {
    situation: "You're comparing two companies. One has a $5 share price, the other $300. A friend says the $300 company must be 'bigger.' Is that right?",
    choices: [
      { text: "Yes, a higher share price always means a bigger company", verdict: 'risky', feedback: "Price alone tells you nothing about size. A $5 stock can be a far bigger company than a $300 one." },
      { text: "Not necessarily — you multiply price by number of shares", verdict: 'strong', feedback: "Exactly. Market cap = price × shares outstanding. That total tells you the company's size." },
      { text: "Yes, because expensive stocks are higher quality", verdict: 'risky', feedback: "Share price reflects price per slice, not quality or size." },
      { text: "You can't compare them at all", verdict: 'incomplete', feedback: "You can — just compare market caps, not raw share prices." }
    ],
    concept: "Market cap is a company's total value: share price times the number of shares. It's the real measure of size, not one share's price tag.",
    takeaway: "A high share price doesn't mean a big company — market cap does."
  },
  8: {
    situation: "Stocks have climbed for months and headlines call it a 'bull market.' A coworker asks what that says about the mood of investors.",
    choices: [
      { text: "Investors are fearful and expect prices to fall", verdict: 'incomplete', feedback: "That's a bear market. A bull market is the optimistic, rising one." },
      { text: "Prices are rising and investors are generally optimistic", verdict: 'strong', feedback: "Right. A bull market is a sustained rise (often 20%+ from lows) with confident investors." },
      { text: "The market has stopped trading", verdict: 'incomplete', feedback: "Bull and bear describe direction and mood, not whether trading happens." },
      { text: "Prices are guaranteed to keep rising", verdict: 'risky', feedback: "No trend is guaranteed. Bull markets eventually turn — optimism can outrun reality." }
    ],
    concept: "A bull market is a sustained rise with optimism; a bear market is a sustained fall (about 20%+) with fear. They describe the market's direction and mood.",
    takeaway: "Bull means rising and confident; bear means falling and fearful."
  },
  9: {
    situation: "You can start investing $100 a month at 18, or wait until 28 once you 'earn more.' A friend says waiting 10 years won't matter much. Is he right?",
    choices: [
      { text: "He's right — 10 years is a small head start", verdict: 'risky', feedback: "Those early years are the most powerful. Compounding rewards time more than amount." },
      { text: "Starting at 18 can mean dramatically more money by retirement", verdict: 'strong', feedback: "Exactly. Early contributions have decades to earn returns on returns — that head start is huge." },
      { text: "It only matters if you invest large amounts", verdict: 'incomplete', feedback: "Even small amounts compound powerfully when given enough time." },
      { text: "Timing doesn't matter, only the interest rate does", verdict: 'incomplete', feedback: "Rate matters, but time is the bigger lever in compounding." }
    ],
    concept: "Compound interest is earning returns on your returns. The longer your money grows, the more it snowballs — so starting early beats starting big.",
    takeaway: "Time is compounding's superpower — start early, even if small."
  },
  10: {
    situation: "Your savings account pays almost nothing, but prices at the store keep creeping up. What's quietly happening to the cash sitting in that account?",
    choices: [
      { text: "It's growing in real value because it's safe", verdict: 'risky', feedback: "Safe from loss, maybe — but its buying power shrinks as prices rise." },
      { text: "It's slowly losing buying power as prices rise", verdict: 'strong', feedback: "Right. That's inflation. If prices rise 3% and your cash earns 0%, it buys less each year." },
      { text: "Nothing — a dollar is always a dollar", verdict: 'incomplete', feedback: "The number stays the same, but what it can buy falls over time." },
      { text: "It's keeping perfect pace with prices", verdict: 'incomplete', feedback: "Only if your interest matches inflation. Near-zero interest can't keep up." }
    ],
    concept: "Inflation is the steady rise in prices over time. It quietly erodes the buying power of cash that isn't earning enough to keep up.",
    takeaway: "Idle cash slowly loses value — inflation is the reason."
  },
  11: {
    situation: "Your investment grew 8% this year, but inflation ran 3%. A friend says you 'made 8%.' How much did your buying power actually grow?",
    choices: [
      { text: "8% — that's what the account shows", verdict: 'incomplete', feedback: "That's the nominal return. It ignores what inflation took away." },
      { text: "About 5%, once you subtract inflation", verdict: 'strong', feedback: "Exactly. Real return ≈ nominal minus inflation. 8% − 3% = about 5% of actual buying power." },
      { text: "11% — you add inflation to the gain", verdict: 'risky', feedback: "Inflation works against you, so you subtract it, not add it." },
      { text: "0% — inflation cancels all gains", verdict: 'incomplete', feedback: "Only if inflation equaled your return. Here you still came out about 5% ahead." }
    ],
    concept: "Nominal return is the raw percentage gain. Real return subtracts inflation, showing how much your actual buying power grew.",
    takeaway: "What matters is your return after inflation, not the headline number."
  },
  12: {
    situation: "An emergency hits and you need $2,000 fast. You have $1,000 in checking and $5,000 of equity in a house you co-own. Which is more useful right now?",
    choices: [
      { text: "The house — it's worth more", verdict: 'risky', feedback: "Worth more, but you can't sell a house in a day. It's illiquid when you need cash now." },
      { text: "The $1,000 in checking — you can use it instantly", verdict: 'strong', feedback: "Right. Liquidity is how fast you can turn something into spendable cash. Checking wins in an emergency." },
      { text: "Neither matters; value is value", verdict: 'incomplete', feedback: "Access speed matters a lot in a crunch. Liquid assets are reachable; illiquid ones aren't." },
      { text: "The house, because you can borrow against it later", verdict: 'incomplete', feedback: "That takes time and approval. For an immediate need, liquid cash is what counts." }
    ],
    concept: "Liquidity is how quickly you can turn an asset into cash without losing value. Cash is instant; property and many assets take time.",
    takeaway: "In an emergency, liquid cash beats a bigger illiquid asset."
  },
  13: {
    situation: "One investment swings up and down 5% almost daily; another barely moves. A friend calls the calm one 'better.' What does the wild one's behavior actually tell you?",
    choices: [
      { text: "It's broken and should be avoided entirely", verdict: 'risky', feedback: "Big swings aren't a defect — they're volatility, and they can come with higher potential return too." },
      { text: "It's more volatile — bigger swings, more risk and potential reward", verdict: 'strong', feedback: "Exactly. Volatility measures how much something moves — more uncertainty in both directions." },
      { text: "It will definitely earn more than the calm one", verdict: 'risky', feedback: "Volatility cuts both ways. More movement isn't a promise of gains." },
      { text: "It's identical to the calm one over time", verdict: 'incomplete', feedback: "They may differ a lot in the ride and the risk, even if returns end up similar." }
    ],
    concept: "Volatility is how much an investment's price swings. High volatility means a bumpier ride and more uncertainty — not automatically better or worse.",
    takeaway: "Volatility measures the size of the swings, not the direction."
  },
  14: {
    situation: "A stranger online promises 'guaranteed 30% returns, no risk.' A savings account offers 4% with essentially no risk. What should the promise tell you?",
    choices: [
      { text: "It's a great deal — grab it before it's gone", verdict: 'risky', feedback: "High return with zero risk doesn't exist. 'Guaranteed and huge' is the classic sign of a scam." },
      { text: "Be very skeptical — higher returns come with higher risk", verdict: 'strong', feedback: "Right. Real investments trade reward for risk. A no-risk 30% promise almost always hides danger." },
      { text: "Returns and risk are unrelated", verdict: 'incomplete', feedback: "They're tightly linked. You can't reliably get high reward without taking on more risk." },
      { text: "The savings account is foolish by comparison", verdict: 'risky', feedback: "The savings account is honest about its low, low-risk return. The promise is the suspicious one." }
    ],
    concept: "Risk and reward move together. To earn higher returns you must accept more risk — so 'high return, no risk' is a red flag.",
    takeaway: "If a return sounds too good to be true with no risk, it is."
  },
  15: {
    situation: "You're excited about one company and think about putting your entire $1,000 into it. What's the main danger, and the simple fix?",
    choices: [
      { text: "No danger — conviction means you should go all in", verdict: 'risky', feedback: "All-in on one stock means one bad surprise can wipe you out. Conviction doesn't remove that risk." },
      { text: "One company can fail; spread the money across many to cut that risk", verdict: 'strong', feedback: "Exactly. Diversification means not betting everything on one outcome — a basket survives one bad apple." },
      { text: "Just pick two stocks instead of one", verdict: 'incomplete', feedback: "Better, but two is still concentrated. A broad fund spreads risk far more." },
      { text: "Keep it all in cash to be safe", verdict: 'incomplete', feedback: "That avoids stock risk but earns little and loses to inflation. Diversifying invests while managing risk." }
    ],
    concept: "Diversification spreads your money across many investments so no single failure can sink you. It's the closest thing to a free lunch in investing.",
    takeaway: "Don't put all your money in one bet — spread it out."
  },
  16: {
    situation: "You own shares in a steady company and receive a small cash payment from it every few months, even though you didn't sell anything. What is that?",
    choices: [
      { text: "A refund because the stock lost value", verdict: 'incomplete', feedback: "It's not a refund. It's a dividend — a share of the company's profits paid to owners." },
      { text: "A dividend — your cut of the company's profits", verdict: 'strong', feedback: "Right. Some companies pay out part of their profits to shareholders, usually quarterly." },
      { text: "A penalty for holding too long", verdict: 'incomplete', feedback: "Holding isn't penalized. A dividend is a reward of ownership, not a fee." },
      { text: "Free money with no connection to the company", verdict: 'risky', feedback: "It's tied directly to the company's profits — not free or guaranteed; dividends can be cut." }
    ],
    concept: "A dividend is a portion of a company's profits paid out to shareholders. It's income you can earn just for owning the stock.",
    takeaway: "Dividends pay you a slice of profits while you hold the stock."
  },
  17: {
    situation: "You bought a stock for $100 and sold it for $160. A friend asks how the tax works on that. What's the taxable part?",
    choices: [
      { text: "The full $160 you received", verdict: 'incomplete', feedback: "You're taxed on the gain, not the whole amount — the profit above what you paid." },
      { text: "The $60 profit — that's your capital gain", verdict: 'strong', feedback: "Exactly. A capital gain is the profit from selling above your purchase price; that $60 is what's taxed." },
      { text: "Nothing, because you already paid for the stock", verdict: 'risky', feedback: "Profit from selling is generally taxable. Ignoring it can mean a surprise tax bill." },
      { text: "Only if you spend the money", verdict: 'incomplete', feedback: "The gain is taxed when you sell, whether or not you spend it." }
    ],
    concept: "A capital gain is the profit when you sell an investment for more than you paid. You're taxed on the gain, not the total — and holding longer often means lower tax.",
    takeaway: "You're taxed on the profit you make, not the full sale price."
  },
  18: {
    situation: "You have $1,200 to invest but you're scared of buying right before a crash. What's a calm way to handle the timing?",
    choices: [
      { text: "Wait for the 'perfect' moment to invest it all", verdict: 'risky', feedback: "Nobody reliably times the bottom. Waiting often means missing gains while you hesitate." },
      { text: "Invest a fixed amount each month, regardless of price", verdict: 'strong', feedback: "Smart. Dollar-cost averaging spreads your buys over time, so you don't bet everything on one day's price." },
      { text: "Put it all in today and hope", verdict: 'risky', feedback: "It might work, but it concentrates all your risk on a single entry point." },
      { text: "Never invest until you're certain prices will rise", verdict: 'incomplete', feedback: "Certainty never comes. Steady, regular investing sidesteps the need to predict." }
    ],
    concept: "Dollar-cost averaging means investing a set amount on a regular schedule. You buy more when prices are low, less when high — and skip the stress of timing.",
    takeaway: "Invest steadily over time instead of trying to time the perfect day."
  },
  19: {
    situation: "You're 22 and saving for retirement decades away. A friend keeps all their long-term money in cash 'to be safe.' What trade-off are they missing?",
    choices: [
      { text: "Nothing — cash is always the smartest choice", verdict: 'risky', feedback: "Cash feels safe but barely grows and loses to inflation over decades." },
      { text: "With a long horizon, mixing in stocks can grow wealth far more", verdict: 'strong', feedback: "Right. Asset allocation balances growth and safety. Young investors can usually hold more stocks for long-term growth." },
      { text: "They should put 100% into one hot stock instead", verdict: 'risky', feedback: "That swaps too-safe for too-risky. Allocation is about balance, not extremes." },
      { text: "Allocation only matters for rich people", verdict: 'incomplete', feedback: "It matters at every level — it's just how you split your money across asset types." }
    ],
    concept: "Asset allocation is how you divide money across stocks, bonds, and cash. The right mix depends on your time horizon and comfort with risk.",
    takeaway: "Match your mix of investments to your timeline and risk comfort."
  },
  20: {
    situation: "A 40% drop in your portfolio would make you panic and sell everything. Knowing that about yourself, how should you invest?",
    choices: [
      { text: "Go all-in on the most aggressive stocks anyway", verdict: 'risky', feedback: "If a big drop makes you sell, an aggressive portfolio sets you up to lock in losses at the worst time." },
      { text: "Choose a mix you can actually hold through a downturn", verdict: 'strong', feedback: "Exactly. Risk tolerance is about what you can stomach. The best portfolio is one you won't abandon in a panic." },
      { text: "Avoid investing entirely, forever", verdict: 'incomplete', feedback: "You can still invest — just at a risk level that lets you stay the course." },
      { text: "Ignore your feelings; only the math matters", verdict: 'risky', feedback: "Behavior is part of the math. A 'perfect' portfolio you bail on at the bottom isn't perfect." }
    ],
    concept: "Risk tolerance is how much volatility you can handle without panicking. Investing within it keeps you from selling at the worst possible moment.",
    takeaway: "The best portfolio is one you can actually stick with in a downturn."
  },
  21: {
    situation: "You aimed for 70% stocks and 30% bonds. After a big stock rally you're now at 85% stocks. What does that drift mean, and what's the fix?",
    choices: [
      { text: "Leave it — winners should be left to run", verdict: 'risky', feedback: "Letting it drift quietly raises your risk above what you chose. One downturn now hurts more." },
      { text: "Rebalance back toward 70/30 by trimming stocks", verdict: 'strong', feedback: "Right. Rebalancing returns you to your target mix, locking in some gains and controlling risk." },
      { text: "Sell everything and start over", verdict: 'incomplete', feedback: "No need for drastic moves. A small adjustment back to target is all it takes." },
      { text: "Change your target to 100% stocks to match it", verdict: 'risky', feedback: "That just chases the rally and abandons the plan that controlled your risk." }
    ],
    concept: "Over time, winners grow and shift your mix away from your target. Rebalancing trims them back to plan — quietly buying low and selling high.",
    takeaway: "Rebalance occasionally to keep your risk where you intended it."
  },
  22: {
    situation: "One approach tries to beat the market by picking winners; the other just buys the whole market cheaply. Decades of data mostly favor which, for the average investor?",
    choices: [
      { text: "Active — paying experts to pick stocks usually wins", verdict: 'risky', feedback: "Most active funds underperform the market after fees. Expertise rarely beats low-cost broad exposure long-term." },
      { text: "Passive — owning the whole market cheaply tends to win over time", verdict: 'strong', feedback: "Right. Low fees and broad exposure mean passive investing beats most active funds over the long run." },
      { text: "Active, because more trading means more profit", verdict: 'risky', feedback: "More trading usually means more fees and taxes, not more profit." },
      { text: "It makes no difference at all", verdict: 'incomplete', feedback: "It makes a real difference — mostly through fees, which compound against you over decades." }
    ],
    concept: "Active investing tries to beat the market through stock-picking; passive just tracks it cheaply. For most people, passive wins because low fees compound.",
    takeaway: "For most investors, cheap and passive beats expensive and active."
  },
  23: {
    situation: "One stock is a fast-growing tech company with no profits yet but big expectations. Another is a boring, profitable company trading cheaply. How would you label them?",
    choices: [
      { text: "Both are the same kind of stock", verdict: 'incomplete', feedback: "They represent two different styles: growth versus value." },
      { text: "The first is a growth stock; the second is a value stock", verdict: 'strong', feedback: "Right. Growth stocks bet on future expansion; value stocks look cheap relative to current earnings." },
      { text: "The cheap one must be a scam", verdict: 'risky', feedback: "Cheap isn't automatically bad — value investing hunts for solid companies priced low." },
      { text: "The growth one is guaranteed to win", verdict: 'risky', feedback: "Growth stocks carry big expectations and can fall hard if they disappoint." }
    ],
    concept: "Growth stocks are priced for fast future expansion; value stocks look cheap versus their current earnings. Different bets, different risks.",
    takeaway: "Growth pays for the future; value hunts for a bargain today."
  },
  24: {
    situation: "The market has boomed for years and a friend says 'it only goes up now.' What does history suggest about that mindset?",
    choices: [
      { text: "He's right — modern markets don't really fall anymore", verdict: 'risky', feedback: "Markets move in cycles. 'It only goes up' is the kind of thinking that tends to precede downturns." },
      { text: "Markets move in cycles — booms don't last forever", verdict: 'strong', feedback: "Exactly. Expansion, peak, decline, recovery — cycles are normal. No boom lasts forever, and neither does any bust." },
      { text: "A crash is coming tomorrow for sure", verdict: 'incomplete', feedback: "Cycles are real but the timing is unpredictable. Expect ups and downs, don't try to predict the day." },
      { text: "Cycles only happen in other countries", verdict: 'incomplete', feedback: "Every market experiences cycles. They're a built-in feature, not a foreign quirk." }
    ],
    concept: "Markets move in cycles — expansion, peak, decline, and recovery. Knowing this helps you stay calm in booms and busts alike.",
    takeaway: "Markets rise and fall in cycles — no boom or bust lasts forever."
  },
  25: {
    situation: "A popular app announces it's 'going public' next month and friends are rushing to buy on day one. What's actually happening, and what's the catch?",
    choices: [
      { text: "The company is shutting down and selling off", verdict: 'incomplete', feedback: "The opposite — it's an IPO, the company's first sale of shares to the public." },
      { text: "It's an IPO — the first public sale of shares, often hyped and volatile early", verdict: 'strong', feedback: "Right. An IPO lets the public buy shares for the first time. Early prices can swing wildly on hype, so caution helps." },
      { text: "Day-one IPO buyers are guaranteed quick profits", verdict: 'risky', feedback: "Many IPOs fall after the initial hype. There's no guaranteed pop." },
      { text: "Only billionaires are allowed to buy", verdict: 'incomplete', feedback: "Ordinary investors can usually buy once it trades, though early access is often limited." }
    ],
    concept: "An IPO (Initial Public Offering) is when a private company first sells shares to the public. Excitement runs high, but early prices can be volatile.",
    takeaway: "An IPO is a company's stock-market debut — exciting, but often bumpy early."
  }
};

// Returns the interactive scenario for a lesson id, or null if none exists.
function getLessonScenario(lessonId) {
  const scenario = LESSON_SCENARIOS[Number(lessonId)];
  return scenario && Array.isArray(scenario.choices) && scenario.choices.length
    ? scenario
    : null;
}

// ── DAILY CHALLENGE ───────────────────────────────────────────
// The daily question bank and getDailyQuestion() selector live in
// dailyQuestionBank.js — loaded before quiz.js.
// The old single-question DAILY constant has been replaced.
