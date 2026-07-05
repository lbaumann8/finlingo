// ════════════════════════════════════════════════════════════════
// PRACTICE — mastery-based adaptive practice.
//
// Builds entirely on the EXISTING progress systems:
//   • S.mastery     (per-topic 0–100 score, attempts, timestamps)   — reviewEngine.js
//   • S.reviewQueue (per-question spaced-review items)               — reviewEngine.js
//   • recordQuestionResult() updates both and is already persisted
//     to localStorage + Supabase via save().
//
// A "topic" is a lesson (mastery is keyed by each lesson's slugified
// title, set on every question at boot by ensureQuestionMetadata).
// No second progress store is created.
// ════════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;
  const SESSION_SIZE = 5;
  const SECONDS_PER_QUESTION = 36; // ~0.6 min/question → "5 questions · About 3 minutes"

  // 0–100 → state. Order matters for thresholds.
  const MASTERY_STATES = [
    { key: 'new',      label: 'New',      cls: 'pm-new',      min: 0 },
    { key: 'learning', label: 'Learning', cls: 'pm-learning', min: 20 },
    { key: 'familiar', label: 'Familiar', cls: 'pm-familiar', min: 40 },
    { key: 'strong',   label: 'Strong',   cls: 'pm-strong',   min: 60 },
    { key: 'mastered', label: 'Mastered', cls: 'pm-mastered', min: 80 }
  ];

  // Spaced-review interval (days) by mastery state.
  const REVIEW_DAYS = { new: 1, learning: 1, familiar: 3, strong: 7, mastered: 14 };

  // Decorative lock glyph reused by the locked Daily card + locked mastery rows.
  // Always paired with visible "Locked" text, so it is aria-hidden.
  const LOCK_SVG = '<svg class="pm-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';

  // One thin-line icon per unit (single family: viewBox 24, stroke=currentColor,
  // width 1.6, round caps/joins). Colour + opacity come from CSS so the same
  // markup serves the small unit chip AND the faint right-side watermark motif.
  function _icon(inner) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
  }
  const UNIT_ICONS = {
    1: _icon('<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>'),                                  // rising line chart
    2: _icon('<rect x="4" y="14.5" width="16" height="4" rx="1.4"/><rect x="6" y="9.5" width="12" height="4" rx="1.4"/><rect x="8" y="4.5" width="8" height="4" rx="1.4"/>'), // stacked assets
    3: _icon('<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="14 3 14 8 19 8"/><polyline points="9 17 11 14 13 16 16 12"/>'), // document + chart
    4: _icon('<circle cx="6" cy="7" r="2.3"/><circle cx="18" cy="7" r="2.3"/><circle cx="12" cy="17.5" r="2.3"/><line x1="8" y1="8.4" x2="10.4" y2="15.4"/><line x1="16" y1="8.4" x2="13.6" y2="15.4"/><line x1="8.3" y1="7" x2="15.7" y2="7"/>'), // connected deal nodes
    5: _icon('<line x1="8" y1="3.5" x2="8" y2="20.5"/><rect x="6" y="7.5" width="4" height="8" rx="1"/><line x1="16" y1="5.5" x2="16" y2="18.5"/><rect x="14" y="9.5" width="4" height="6" rx="1"/>'), // candlesticks
    6: _icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3.2 2.6 3.2 15.4 0 18M12 3c-3.2 2.6-3.2 15.4 0 18"/>') // globe meridians
  };
  // Small target glyph for the Daily Practice card.
  const DAILY_ICON = _icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none"/>');
  // Small check for the Mastered path node.
  const NODE_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"/></svg>';

  // Large hero illustration — "growth": ascending bars + trend arrow + goal star
  // on a soft tinted backdrop. Custom finance-themed art, layered with soft
  // shadows for depth (premium, not a gamified 3D trophy).
  const MASTERY_HERO = `<svg viewBox="0 0 200 176" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="mhBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2bbd6a"/><stop offset="1" stop-color="#0f8a48"/></linearGradient>
      <filter id="mhSh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#0b3d24" flood-opacity="0.16"/></filter>
    </defs>
    <circle cx="100" cy="84" r="74" fill="#e9f6ee"/>
    <ellipse cx="100" cy="152" rx="66" ry="9" fill="#0b0d10" opacity="0.05"/>
    <g filter="url(#mhSh)">
      <rect x="40" y="104" width="34" height="44" rx="9" fill="#dfe4ea"/>
      <rect x="83" y="80" width="34" height="68" rx="9" fill="#c2cad3"/>
      <rect x="126" y="50" width="34" height="98" rx="9" fill="url(#mhBar)"/>
    </g>
    <path d="M50 100 L98 74 L150 44" stroke="#0b0d10" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M150 44 l-15 1.5 M150 44 l-1.5 15" stroke="#0b0d10" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M150 22 l3.4 6.9 7.6 1.1 -5.5 5.4 1.3 7.6 -6.8 -3.6 -6.8 3.6 1.3 -7.6 -5.5 -5.4 7.6 -1.1 z" fill="#16a34a"/>
  </svg>`;

  function _escape(value) {
    return typeof escapeAppHtml === 'function'
      ? escapeAppHtml(value)
      : String(value == null ? '' : value).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
      ));
  }

  function _now() { return Date.now(); }

  function _masteryStore() {
    return (S && typeof S.mastery === 'object' && S.mastery) ? S.mastery : {};
  }

  function getMasteryState(score) {
    const value = Math.max(0, Math.min(100, Number(score) || 0));
    let state = MASTERY_STATES[0];
    for (const candidate of MASTERY_STATES) {
      if (value >= candidate.min) state = candidate;
    }
    return state;
  }

  // ── Topic ↔ lesson mapping ──────────────────────────────────
  // topicId is set on every question at boot (slug of lesson title);
  // we read it straight off the lesson rather than re-deriving a slug.
  function _lessonTopicId(lesson) {
    const fromQuestion = lesson?.questions?.find(q => q && q.topicId)?.topicId;
    if (fromQuestion) return String(fromQuestion);
    return String(lesson?.title || `lesson-${lesson?.id}`)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `lesson-${lesson?.id}`;
  }

  function _allLessons() {
    // LESSONS is a top-level `const` (lexical global, not a window property),
    // so reference it bare — `global.LESSONS` would be undefined.
    return (typeof LESSONS !== 'undefined' && Array.isArray(LESSONS))
      ? LESSONS.filter(l => l && (l.questions || []).length) : [];
  }

  // ── Centralized skill display name ──────────────────────────
  // ONE place that turns a lesson into a short "skill" name for the mastery
  // map. Precedence: explicit lesson.skill field → curated override by id →
  // a derived short form of the title ("What Is a Stock?" → "Stocks"). The
  // full lesson.title is always kept for tooltips / aria / unlock copy.
  const SKILL_NAME_OVERRIDES = {
    // lessonId: 'Short Name'  — only for cases the derivation gets wrong.
  };
  function _pluralizeSkill(noun) {
    const n = String(noun).trim();
    if (!n) return n;
    if (/s$/i.test(n)) return n;            // already ends in s (ETFs handled by caller adding s to ETF)
    if (/[^aeiou]y$/i.test(n)) return n.replace(/y$/i, 'ies');
    return n + 's';
  }
  function skillName(lesson) {
    if (!lesson) return '';
    if (lesson.skill) return String(lesson.skill);
    if (SKILL_NAME_OVERRIDES[lesson.id]) return SKILL_NAME_OVERRIDES[lesson.id];
    const title = String(lesson.title || '').trim();
    // "What Is a/an/the X?" → pluralized X (Stocks, Bonds, ETFs, Index Funds…).
    const m = title.match(/^what\s+is\s+(?:an?|the)\s+(.+?)\?*$/i);
    if (m) return _pluralizeSkill(m[1].trim());
    return title.replace(/\?+$/, '').trim();
  }

  function _completedIdSet() {
    const ids = (S && Array.isArray(S.completedIds)) ? S.completedIds : [];
    return new Set(ids.map(Number).filter(Number.isFinite));
  }

  // Lessons the user has actually encountered: completed, or with mastery history.
  function _encounteredLessons() {
    const completed = _completedIdSet();
    const mastery = _masteryStore();
    return _allLessons().filter(lesson => {
      if (completed.has(Number(lesson.id))) return true;
      return Boolean(mastery[_lessonTopicId(lesson)]);
    });
  }

  // ── Units (six) ↔ lessons grouping ──────────────────────────
  // UNITS_DEF is the project's single source of unit truth (data.js). We reuse
  // it and the existing getUnitLessons()/getUnitForLesson() helpers rather than
  // introducing a second unit table.
  function _unitsDef() {
    return (typeof UNITS_DEF !== 'undefined' && Array.isArray(UNITS_DEF))
      ? [...UNITS_DEF].sort((a, b) => a.id - b.id) : [];
  }

  function _unitLessons(unit) {
    if (typeof getUnitLessons === 'function') {
      const ls = getUnitLessons(unit);
      if (Array.isArray(ls)) {
        const withQ = ls.filter(l => l && (l.questions || []).length);
        if (withQ.length) return withQ;
      }
    }
    const range = unit && unit.range;
    if (Array.isArray(range)) {
      return _allLessons().filter(l => l.id >= range[0] && l.id <= range[1]);
    }
    return _allLessons().filter(l => l.unit === (unit && (unit.name || unit.title)));
  }

  // A lesson skill is "unlocked" once the lesson is completed (or already has
  // mastery history). Tier/paywall is disabled project-wide, so completion is
  // the only gate — the same rule the rest of Practice already uses.
  function _isUnlocked(lesson, completedSet, mastery) {
    if (completedSet.has(Number(lesson.id))) return true;
    return Boolean(mastery[_lessonTopicId(lesson)]);
  }

  // Per-lesson skill model. Locked skills carry NO score/date/review data so
  // the UI cannot accidentally render fake mastery.
  function _lessonSkill(lesson, unitId, completedSet, mastery) {
    const topicId = _lessonTopicId(lesson);
    const base = {
      lessonId: lesson.id,
      unitId,
      topicId,
      skillId: topicId,
      lesson,
      name: skillName(lesson),
      title: lesson.title
    };
    if (!_isUnlocked(lesson, completedSet, mastery)) {
      return Object.assign(base, { unlocked: false, score: null, state: null });
    }
    const entry = mastery[topicId] || null;
    const score = entry ? Math.max(0, Math.min(100, Number(entry.masteryScore) || 0)) : 0;
    const state = getMasteryState(score);
    const review = _topicReview(entry, state.key);
    const recentWrong = entry && entry.lastWrongAt
      && (_now() - new Date(entry.lastWrongAt).getTime()) < 7 * DAY_MS
      && (Number(entry.wrong) || 0) > 0;
    return Object.assign(base, {
      unlocked: true,
      score,
      state,
      attempts: entry ? Number(entry.attempts) || 0 : 0,
      lastSeenAt: entry ? entry.lastSeenAt : null,
      lastPracticedLabel: _relativeDay(entry ? entry.lastSeenAt : null),
      reviewDue: Boolean(review.due),
      nextReviewAt: review.nextReviewAt,
      needsReview: Boolean(review.due || recentWrong)
    });
  }

  // The "active" unit is the one holding the user's next incomplete lesson —
  // their current learning frontier. Null once every lesson is complete.
  function _activeUnitId() {
    const next = (typeof getNextAvailableLesson === 'function')
      ? getNextAvailableLesson() : null;
    if (!next) return null;
    const unit = (typeof getUnitForLesson === 'function')
      ? getUnitForLesson(next) : null;
    return unit ? unit.id : null;
  }

  // Six units, each with its concept rows and a summary derived ONLY from the
  // unlocked concepts inside it (locked lessons never drag the average down).
  // One coherent metric drives the page: mastered / total concepts.
  //   state ∈ completed | active | available | locked
  //   - completed: every concept mastered
  //   - active:    holds the next incomplete lesson (current frontier)
  //   - available: at least one concept unlocked
  //   - locked:    nothing unlocked yet (concepts still individually openable)
  // Lessons are any-order, so a "locked" unit is only a visual cue — its rows
  // carry the real per-concept unlock requirement.
  function getUnitsModel() {
    const completedSet = _completedIdSet();
    const mastery = _masteryStore();
    const activeId = _activeUnitId();
    return _unitsDef().map(unit => {
      const lessons = _unitLessons(unit)
        .map((l, i) => Object.assign(
          _lessonSkill(l, unit.id, completedSet, mastery),
          { numInUnit: i + 1 }
        ));
      const unlocked = lessons.filter(l => l.unlocked);
      const unlockedCount = unlocked.length;
      const masteredCount = unlocked.filter(l => l.state && l.state.key === 'mastered').length;
      const completedCount = lessons.filter(l => completedSet.has(Number(l.lessonId))).length;
      const total = lessons.length;
      let unitScore = null;
      let unitState = null;
      if (unlockedCount > 0) {
        unitScore = Math.round(unlocked.reduce((s, l) => s + l.score, 0) / unlockedCount);
        unitState = getMasteryState(unitScore);
      }

      let state;
      if (total > 0 && masteredCount === total) state = 'completed';
      else if (unit.id === activeId) state = 'active';
      else if (unlockedCount > 0) state = 'available';
      else state = 'locked';

      return {
        id: unit.id,
        number: unit.id,
        title: unit.title || unit.name || `Unit ${unit.id}`,
        lessons,
        unlockedCount,
        masteredCount,
        completedCount,
        total,
        unitScore,
        unitState,
        state,
        isActive: unit.id === activeId,
        // mastered / total drives the unit bar everywhere on the page.
        masteryPct: total ? Math.round((masteredCount / total) * 100) : 0,
        reviewDueCount: unlocked.filter(l => l.reviewDue).length
      };
    });
  }

  // Overall mastery across the whole course. The ring shows the average mastery
  // of UNLOCKED concepts (so a new user is "0%", not "0 across 100 attempted");
  // the headline counts use mastered / total — the page-wide metric.
  function getOverallMastery(units) {
    const list = units || getUnitsModel();
    const unlocked = list.flatMap(u => u.lessons.filter(l => l.unlocked));
    const totalConcepts = list.reduce((s, u) => s + u.total, 0);
    const masteredCount = list.reduce((s, u) => s + u.masteredCount, 0);
    const pct = unlocked.length
      ? Math.round(unlocked.reduce((s, l) => s + l.score, 0) / unlocked.length)
      : 0;
    return {
      pct,
      totalConcepts,
      totalSkills: totalConcepts, // back-compat alias
      mastered: masteredCount,
      unitCount: list.length,
      unlockedCount: unlocked.length
    };
  }

  // Which unit to auto-expand: the active unit (current frontier) first, then
  // the unit with the most recent practice activity, then the first in-progress
  // unit, else Unit 1. A new user therefore opens Unit 1; a returning user opens
  // whichever unit they're currently working through.
  function _defaultOpenUnitId(units) {
    if (!units.length) return null;
    const active = units.find(u => u.isActive);
    if (active) return active.id;
    let bestId = null;
    let bestTime = -1;
    units.forEach(u => u.lessons.forEach(l => {
      if (l.unlocked && l.lastSeenAt) {
        const t = new Date(l.lastSeenAt).getTime();
        if (Number.isFinite(t) && t > bestTime) { bestTime = t; bestId = u.id; }
      }
    }));
    if (bestId != null) return bestId;
    const inProgress = units.find(u => u.unlockedCount > 0 && u.unlockedCount < u.total);
    return (inProgress || units[0]).id;
  }

  // ── Spaced review (date-based, derived from existing timestamps) ──
  function _topicReview(entry, stateKey) {
    if (!entry || !entry.lastSeenAt) {
      return { nextReviewAt: null, due: false, daysSince: null };
    }
    const lastSeen = new Date(entry.lastSeenAt).getTime();
    if (!Number.isFinite(lastSeen)) return { nextReviewAt: null, due: false, daysSince: null };

    let intervalDays = REVIEW_DAYS[stateKey] != null ? REVIEW_DAYS[stateKey] : 3;
    // After a recent wrong answer, shorten the next interval.
    const lastWrong = entry.lastWrongAt ? new Date(entry.lastWrongAt).getTime() : 0;
    if (lastWrong && lastWrong >= lastSeen - 1000) {
      intervalDays = Math.max(1, Math.round(intervalDays / 2));
    }
    const nextReviewAt = lastSeen + intervalDays * DAY_MS;
    const daysSince = Math.floor((_now() - lastSeen) / DAY_MS);
    return { nextReviewAt, due: _now() >= nextReviewAt, daysSince, intervalDays };
  }

  // "Last practiced Jun 20" / "Not practiced yet" — absolute date for the path.
  function _practicedDate(iso) {
    if (!iso) return 'Not practiced yet';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Not practiced yet';
    return 'Last practiced ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function _relativeDay(iso) {
    if (!iso) return 'Not practiced yet';
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return 'Not practiced yet';
    const days = Math.floor((_now() - t) / DAY_MS);
    if (days <= 0) return 'Practiced today';
    if (days === 1) return 'Practiced yesterday';
    if (days < 7) return `Practiced ${days} days ago`;
    if (days < 14) return 'Practiced last week';
    const weeks = Math.floor(days / 7);
    return `Practiced ${weeks} weeks ago`;
  }

  // ── Topic model for the UI ──────────────────────────────────
  function getPracticeTopics() {
    const mastery = _masteryStore();
    return _encounteredLessons().map(lesson => {
      const topicId = _lessonTopicId(lesson);
      const entry = mastery[topicId] || null;
      const score = entry ? Math.max(0, Math.min(100, Number(entry.masteryScore) || 0)) : 0;
      const state = getMasteryState(score);
      const review = _topicReview(entry, state.key);
      const recentWrong = entry && entry.lastWrongAt
        && (_now() - new Date(entry.lastWrongAt).getTime()) < 7 * DAY_MS
        && (Number(entry.wrong) || 0) > 0;

      let reason = '';
      if (review.due && review.daysSince != null) {
        reason = `Not reviewed in ${review.daysSince} day${review.daysSince === 1 ? '' : 's'}`;
      }
      if (recentWrong) {
        reason = `Missed ${entry.wrong} recent question${entry.wrong === 1 ? '' : 's'}`;
      }

      return {
        topicId,
        lessonId: lesson.id,
        lesson,
        label: lesson.title,
        name: skillName(lesson),
        unit: lesson.unit || '',
        score,
        state,
        attempts: entry ? Number(entry.attempts) || 0 : 0,
        lastSeenAt: entry ? entry.lastSeenAt : null,
        lastPracticedLabel: _relativeDay(entry ? entry.lastSeenAt : null),
        reviewDue: Boolean(review.due),
        nextReviewAt: review.nextReviewAt,
        needsReview: Boolean(review.due || recentWrong),
        reason
      };
    });
  }

  function getPracticeSummary() {
    const topics = getPracticeTopics();
    return {
      total: topics.length,
      mastered: topics.filter(t => t.state.key === 'mastered').length,
      learning: topics.filter(t => t.state.key !== 'mastered').length,
      due: topics.filter(t => t.reviewDue).length,
      needsReview: topics.filter(t => t.needsReview).length
    };
  }

  // Priority sort: review-due first, then recently-missed, then weakest score.
  function _priorityScore(topic) {
    let p = 0;
    if (topic.reviewDue) p += 1000;
    if (topic.reason && topic.reason.startsWith('Missed')) p += 500;
    p += (100 - topic.score); // weaker = higher priority
    return p;
  }

  function _topicQuestions(lesson) {
    return (lesson.questions || []).map((question, index) => ({
      lesson,
      question,
      topicId: question.topicId || _lessonTopicId(lesson),
      questionId: question.questionId || question.id || `lesson-${lesson.id}-q${index + 1}`,
      difficulty: question.difficulty || 'medium'
    }));
  }

  function _shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Daily session: prioritise missed → weakened/due → recent → mixed.
  // Only ever draws from encountered (completed) lessons — never unseen topics.
  function buildDailyPracticeSession(limit = SESSION_SIZE) {
    const topics = getPracticeTopics();
    if (!topics.length) return [];
    const ordered = [...topics].sort((a, b) => _priorityScore(b) - _priorityScore(a));

    const picked = [];
    const usedQ = new Set();
    const addFrom = (topic, max) => {
      const pool = _shuffle(_topicQuestions(topic.lesson));
      let added = 0;
      for (const cand of pool) {
        if (picked.length >= limit || added >= max) break;
        if (usedQ.has(cand.questionId)) continue;
        usedQ.add(cand.questionId);
        picked.push(cand);
        added++;
      }
    };

    // Up to 2 questions per priority topic.
    for (const topic of ordered) {
      if (picked.length >= limit) break;
      addFrom(topic, 2);
    }
    // Fill any remainder with a broad mixed pool.
    if (picked.length < limit) {
      const pool = _shuffle(ordered.flatMap(t => _topicQuestions(t.lesson)));
      for (const cand of pool) {
        if (picked.length >= limit) break;
        if (usedQ.has(cand.questionId)) continue;
        usedQ.add(cand.questionId);
        picked.push(cand);
      }
    }
    return _shuffle(picked).slice(0, limit);
  }

  function buildMixedReviewSession(limit = SESSION_SIZE) {
    const topics = getPracticeTopics();
    const pool = _shuffle(topics.flatMap(t => _topicQuestions(t.lesson)));
    const out = [];
    const usedQ = new Set();
    for (const cand of pool) {
      if (out.length >= limit) break;
      if (usedQ.has(cand.questionId)) continue;
      usedQ.add(cand.questionId);
      out.push(cand);
    }
    return out;
  }

  // Focused topic session: 3–5 questions, no unnecessary repeats.
  function buildTopicSession(topicId) {
    const lesson = _allLessons().find(l => _lessonTopicId(l) === String(topicId));
    if (!lesson) return { items: [], lesson: null };
    const available = _topicQuestions(lesson);
    const want = Math.min(5, Math.max(3, available.length));
    const items = _shuffle(available).slice(0, Math.min(want, available.length));
    return { items, lesson };
  }

  function estimateMinutes(count) {
    return Math.max(1, Math.round((count * SECONDS_PER_QUESTION) / 60));
  }

  function _plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  // Honest, data-derived explanation of WHY today's questions were chosen.
  // Counts come straight from the encountered-topic model — never hardcoded.
  function dailyPracticeReason() {
    const topics = getPracticeTopics();
    if (!topics.length) return '';
    const due = topics.filter(t => t.reviewDue).length;
    const fresh = topics.filter(t => t.attempts === 0).length; // unlocked, not yet practiced
    const parts = [];
    if (due) parts.push(`${_plural(due, 'topic')} due for review`);
    if (fresh) parts.push(`${_plural(fresh, 'new concept')}`);
    if (parts.length) return parts.join(' · ');
    return 'Review based on your recent lessons';
  }

  // What the user should do next. Returns either the next concept to unlock
  // (a lesson to complete) or, once everything is complete, the top review
  // priority. Null only if there is genuinely nothing to surface.
  function getNextAction() {
    const next = (typeof getNextAvailableLesson === 'function')
      ? getNextAvailableLesson() : null;
    if (next) {
      const unit = (typeof getUnitForLesson === 'function') ? getUnitForLesson(next) : null;
      const unitLessons = unit && typeof getUnitLessons === 'function' ? getUnitLessons(unit) : [];
      const numInUnit = Math.max(1, unitLessons.findIndex(l => l.id === next.id) + 1);
      return {
        kind: 'unlock',
        eyebrow: 'Next to unlock',
        title: skillName(next),
        meta: `${unit ? unit.title : 'Lesson'} · Lesson ${numInUnit}`,
        fullTitle: next.title,
        lessonId: next.id
      };
    }
    // All lessons complete → surface the highest review priority instead.
    const topics = getPracticeTopics();
    if (!topics.length) return null;
    const ordered = [...topics].sort((a, b) => _priorityScore(b) - _priorityScore(a));
    const top = ordered.find(t => t.needsReview) || null;
    if (!top) return null;
    return {
      kind: 'review',
      eyebrow: 'Next review',
      title: top.name || top.label,
      meta: `${top.state.label} · ${top.score}% mastery`,
      fullTitle: top.label,
      topicId: top.topicId
    };
  }

  // ── Live session state ──────────────────────────────────────
  const session = {
    active: false,
    items: [],
    idx: 0,
    selected: null,
    locked: false,
    results: [],          // [{ topicId, correct }]
    requeued: new Set(),
    requeueCount: 0,
    title: 'Practice',
    subtitle: '',
    masteryBefore: {}      // topicId -> score at session start
  };

  function _topicScore(topicId) {
    const entry = _masteryStore()[String(topicId)];
    return entry ? Number(entry.masteryScore) || 0 : 0;
  }

  function _beginSession(items, title, subtitle) {
    if (!items || !items.length) {
      if (typeof showToast === 'function') showToast('No practice questions are available yet.', '');
      return false;
    }
    session.active = true;
    session.items = items;
    session.idx = 0;
    session.selected = null;
    session.locked = false;
    session.results = [];
    session.requeued = new Set();
    session.requeueCount = 0;
    session.title = title;
    session.subtitle = subtitle || '';
    session.masteryBefore = {};
    items.forEach(it => { session.masteryBefore[it.topicId] = _topicScore(it.topicId); });

    if (typeof setScreen === 'function') setScreen('practiceSessionScreen', { resetScroll: true });
    if (typeof setNav === 'function') setNav(null);
    _renderSession();
    return true;
  }

  function startDailyPractice() {
    _beginSession(buildDailyPracticeSession(SESSION_SIZE), 'Daily Practice', 'Adaptive review');
  }

  function startMixedReview() {
    _beginSession(buildMixedReviewSession(SESSION_SIZE), 'Mixed Review', 'A spread across what you’ve learned');
  }

  function startTopicPractice(topicId) {
    const { items, lesson } = buildTopicSession(topicId);
    if (!lesson) return;
    const topics = getPracticeTopics();
    const topic = topics.find(t => t.topicId === String(topicId));
    const isReview = topic && topic.needsReview;
    // "Stocks Practice" / "Bonds Review" — never the raw lesson title.
    _beginSession(items, `${skillName(lesson)} ${isReview ? 'Review' : 'Practice'}`, isReview ? 'Targeted review' : 'Focused practice');
  }

  // ── Session interactions ────────────────────────────────────
  function practiceSelect(index) {
    if (session.locked) return;
    session.selected = index;
    _renderSession();
  }

  function practiceCheck() {
    if (session.locked || session.selected == null) return;
    const item = session.items[session.idx];
    if (!item) return;
    const correct = Number(session.selected) === Number(item.question.answer);
    session.locked = true;
    session.results.push({ topicId: item.topicId, correct });

    // Update mastery + spaced review through the EXISTING engine, then persist.
    if (typeof recordQuestionResult === 'function') {
      recordQuestionResult({
        questionId: item.questionId,
        topicId: item.topicId,
        difficulty: item.difficulty,
        correct
      });
    }
    if (typeof save === 'function') save();

    // Re-introduce a missed concept later in the session (bounded).
    if (!correct && !session.requeued.has(item.questionId) && session.requeueCount < 2) {
      session.requeued.add(item.questionId);
      session.requeueCount++;
      session.items.push({ ...item, _isRequeue: true });
    }
    _renderSession();
  }

  function practiceContinue() {
    session.idx++;
    session.selected = null;
    session.locked = false;
    if (session.idx >= session.items.length) {
      _renderComplete();
    } else {
      _renderSession();
    }
  }

  function exitPractice() {
    session.active = false;
    if (typeof showPractice === 'function') showPractice();
  }

  // ── Session rendering ───────────────────────────────────────
  function _renderSession() {
    const root = document.getElementById('practiceSessionRoot');
    if (!root || !session.active) return;
    const total = session.items.length;
    const item = session.items[session.idx];
    if (!item) return;
    const q = item.question;
    const num = session.idx + 1;
    const pct = Math.round(((session.locked ? num : num - 1) / total) * 100);

    const choices = (q.options || []).map((opt, i) => {
      let cls = 'ps-choice';
      let aria = `aria-checked="${session.selected === i ? 'true' : 'false'}"`;
      if (session.locked) {
        if (i === q.answer) cls += ' is-correct';
        else if (i === session.selected) cls += ' is-incorrect';
      } else if (i === session.selected) {
        cls += ' is-selected';
      }
      return `
        <button type="button" class="${cls}" role="radio" ${aria}
                ${session.locked ? 'disabled' : ''} onclick="Practice.select(${i})">
          <span class="ps-choice-letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span>
          <span class="ps-choice-text">${_escape(opt)}</span>
          ${session.locked && i === q.answer ? '<span class="ps-choice-mark" aria-label="Correct answer">✓</span>' : ''}
        </button>`;
    }).join('');

    let feedback = '';
    if (session.locked) {
      const correct = Number(session.selected) === Number(q.answer);
      feedback = `
        <div class="ps-feedback ${correct ? 'is-good' : 'is-note'}" role="status">
          <div class="ps-feedback-tag">${correct ? 'Nice — that’s right' : 'Not quite — take another look'}</div>
          <div class="ps-feedback-body"><strong>Here’s the key idea:</strong> ${_escape(q.explanation || 'Review this concept and try the next one.')}</div>
        </div>`;
    }

    const actions = session.locked
      ? `<button type="button" class="btn btn-primary" id="psContinueBtn" onclick="Practice.continue()">${session.idx + 1 >= total ? 'Finish' : 'Continue'}</button>`
      : `<button type="button" class="btn btn-primary" id="psCheckBtn" onclick="Practice.check()" ${session.selected == null ? 'disabled' : ''}>Check Answer</button>`;

    root.innerHTML = `
      <div class="ps-head">
        <button type="button" class="ps-exit" aria-label="Exit practice" onclick="Practice.exit()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div class="ps-head-meta">
          <div class="ps-head-title">${_escape(session.title)}</div>
          <div class="ps-progress-label">Question ${num} of ${total}</div>
        </div>
      </div>
      <div class="ps-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Session progress, question ${num} of ${total}">
        <div class="ps-track-fill" style="width:${pct}%"></div>
      </div>
      <div class="ps-question">${_escape(q.q || q.prompt || '')}</div>
      <div class="ps-choices" role="radiogroup" aria-label="Answer choices">${choices}</div>
      ${feedback}
      <div class="ps-actions">${actions}</div>`;

    // Move focus to feedback/continue for keyboard users after checking.
    if (session.locked) {
      const cont = document.getElementById('psContinueBtn');
      if (cont) cont.focus();
    }
  }

  function _renderComplete() {
    const root = document.getElementById('practiceSessionRoot');
    if (!root) return;
    const answered = session.results.length;
    const correct = session.results.filter(r => r.correct).length;
    const practicedIds = [...new Set(session.items.map(it => it.topicId))];
    const topics = getPracticeTopics();
    const byId = {};
    topics.forEach(t => { byId[t.topicId] = t; });

    const improved = [];
    const needReview = [];
    const updates = practicedIds.map(id => {
      const before = Number(session.masteryBefore[id] || 0);
      const after = _topicScore(id);
      const topic = byId[id];
      const label = topic ? (topic.name || topic.label) : id;
      if (after > before) improved.push(label);
      if (topic && topic.needsReview) needReview.push(label);
      return { id, label, after, state: getMasteryState(after), delta: after - before, topic };
    });

    const masteryRows = updates.map(u => `
      <div class="pc-mastery-row">
        <div class="pc-mastery-top">
          <span class="pc-mastery-name">${_escape(u.label)}</span>
          <span class="pm-badge ${u.state.cls}">${u.state.label}${u.state.key === 'mastered' ? ' <span aria-hidden="true">✓</span>' : ''}</span>
        </div>
        <div class="pm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${u.after}" aria-label="${_escape(u.label)} mastery ${u.after} of 100">
          <div class="pm-bar-fill ${u.state.cls}" style="width:${u.after}%"></div>
        </div>
        <div class="pc-mastery-meta">${u.state.label} · ${u.after}/100${u.delta > 0 ? ` · +${u.delta}` : ''}</div>
      </div>`).join('');

    root.innerHTML = `
      <div class="pc-wrap">
        <div class="pc-hero">
          <div class="pc-hero-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="pc-hero-title">Practice complete</div>
          <div class="pc-hero-sub">${correct} of ${answered} correct${improved.length ? ` · ${improved.length} topic${improved.length === 1 ? '' : 's'} improved` : ''}</div>
        </div>

        <div class="pc-stat-grid">
          <div class="pc-stat"><div class="pc-stat-val">${correct}/${answered}</div><div class="pc-stat-label">Correct</div></div>
          <div class="pc-stat"><div class="pc-stat-val">${practicedIds.length}</div><div class="pc-stat-label">Topics practiced</div></div>
          <div class="pc-stat"><div class="pc-stat-val">${improved.length}</div><div class="pc-stat-label">Topics improved</div></div>
        </div>

        <div class="pc-section-title">Updated mastery</div>
        <div class="pc-mastery-list">${masteryRows}</div>

        ${needReview.length ? `
          <div class="pc-section-title">Worth another look</div>
          <div class="pc-review-note">${_escape(needReview.join(', '))}</div>` : ''}

        <div class="ps-actions pc-actions">
          <button type="button" class="btn btn-secondary" onclick="Practice.again()">Practice Again</button>
          <button type="button" class="btn btn-primary" onclick="Practice.exit()">Done</button>
        </div>
      </div>`;
    if (typeof save === 'function') save();
  }

  function practiceAgain() {
    startDailyPractice();
  }

  // ── Practice tab page ───────────────────────────────────────
  // Which unit accordion is open. Persists for the session so the last unit the
  // user manually opened is remembered across re-renders. Single-open model.
  let openUnitId = null;
  // Per-unit "show all concepts" toggles (set of unit ids). Persists for the
  // session so the disclosure state survives re-renders while on the page.
  const expandedConcepts = new Set();
  // How many concepts a unit shows before the "Show all" control appears.
  const CONCEPT_PREVIEW = 5;
  // A topic unlocked this session — gets one brief, fading highlight on render.
  let recentlyUnlockedTopic = null;

  // A path node reflecting skill state. Decorative (state is also in text).
  function _nodeMarkup(skill) {
    if (!skill.unlocked) return '<span class="pm-node pm-node-locked" aria-hidden="true"></span>';
    if (skill.state.key === 'mastered') {
      return `<span class="pm-node pm-node-mastered" aria-hidden="true">${NODE_CHECK}</span>`;
    }
    const due = skill.reviewDue ? ' is-due' : '';
    return `<span class="pm-node ${skill.state.cls}${due}" aria-hidden="true"></span>`;
  }

  // One concept row in the unit's vertical mastery path. Unlocked rows are
  // tappable buttons that start a focused session; locked rows are
  // non-interactive <div>s (not focusable, cannot start practice) with no
  // score/date — only a concise unlock requirement ("Unlocks after Lesson N").
  function _skillRowMarkup(skill) {
    const justUnlocked = recentlyUnlockedTopic && skill.unlocked
      && String(skill.topicId) === String(recentlyUnlockedTopic);
    const flash = justUnlocked ? ' pm-skill-flash' : '';

    if (!skill.unlocked) {
      // Concise requirement; the full lesson title is kept for screen readers.
      const sub = `Unlocks after Lesson ${skill.numInUnit}`;
      const aria = `${skill.name}, locked. ${sub} — ${skill.title}.`;
      return `
        <div class="pm-skill pm-skill-locked" aria-label="${_escape(aria)}">
          ${_nodeMarkup(skill)}
          <div class="pm-skill-main">
            <div class="pm-skill-name">${_escape(skill.name)}</div>
            <div class="pm-skill-sub" title="${_escape(skill.title)}">${_escape(sub)}</div>
          </div>
          <span class="pm-skill-lock" aria-hidden="true">${LOCK_SVG}</span>
        </div>`;
    }
    const st = skill.state;
    const reviewFlag = skill.reviewDue
      ? '<span class="pm-badge pm-review">Review due</span>'
      : '';
    // First-time vs practiced copy. Only the state word carries accent colour.
    const fresh = skill.attempts === 0;
    const stateMarkup = fresh
      ? `<span class="pm-state ${st.cls}">Unlocked</span> · Not practiced yet`
      : `<span class="pm-state ${st.cls}">${st.label}</span> · ${skill.score}% mastery`;
    const stateText = fresh ? 'Unlocked, not practiced yet' : `${st.label}, ${skill.score} percent mastery`;
    const dateLabel = fresh ? '' : _practicedDate(skill.lastSeenAt);
    const aria = `Practice ${skill.name}. ${stateText}.${dateLabel ? ' ' + dateLabel + '.' : ''}${skill.reviewDue ? ' Review due.' : ''}`;
    return `
      <button type="button" class="pm-skill pm-skill-open${flash}" onclick="Practice.startTopic('${_escape(skill.topicId)}')" aria-label="${_escape(aria)}">
        ${_nodeMarkup(skill)}
        <div class="pm-skill-main">
          <div class="pm-skill-name-row">
            <span class="pm-skill-name">${_escape(skill.name)}</span>
            ${reviewFlag}
          </div>
          <div class="pm-skill-state">${stateMarkup}</div>
          ${dateLabel ? `<div class="pm-skill-date">${_escape(dateLabel)}</div>` : ''}
        </div>
        <span class="pm-skill-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </button>`;
  }

  // One unit accordion. Single icon family on the left, eyebrow/title/state in
  // the middle, a thin continuous progress bar (mastered / total — the page
  // metric), and a chevron. No watermark, no segmented strip. Concepts use
  // progressive disclosure: the first CONCEPT_PREVIEW show, the rest behind a
  // "Show all" control.
  function _unitAccordionMarkup(unit, isOpen) {
    const headId = `pm-unit-head-${unit.id}`;
    const panelId = `pm-unit-panel-${unit.id}`;
    const icon = UNIT_ICONS[unit.id] || UNIT_ICONS[1];

    // Status line — plain text, never a large pill. State drives styling class.
    let status = '';
    if (unit.state === 'completed') {
      status = `<span class="pm-unit-status is-done">${NODE_CHECK}<span>Completed</span></span>`;
    } else if (unit.state === 'active') {
      status = `<span class="pm-unit-status is-active">Current unit</span>`;
    } else if (unit.state === 'locked') {
      status = `<span class="pm-unit-status is-locked">${LOCK_SVG}<span>Locked</span></span>`;
    }

    const metaText = `${unit.masteredCount} of ${unit.total} concepts mastered`;
    const reviewNote = unit.reviewDueCount > 0
      ? ` · ${_plural(unit.reviewDueCount, 'review')} due`
      : '';

    // Progressive disclosure of the concept rows.
    const showAll = expandedConcepts.has(String(unit.id));
    const hasMore = unit.total > CONCEPT_PREVIEW;
    const shown = (hasMore && !showAll) ? unit.lessons.slice(0, CONCEPT_PREVIEW) : unit.lessons;
    let rows = shown.map(_skillRowMarkup).join('');
    if (hasMore) {
      const label = showAll ? 'Show fewer concepts' : `Show all ${unit.total} concepts`;
      rows += `
        <button type="button" class="pm-skill-more" aria-expanded="${showAll ? 'true' : 'false'}" onclick="Practice.toggleConcepts('${unit.id}')">
          <span>${label}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>`;
    }

    const ariaLabel = `Unit ${unit.number}, ${unit.title}. ${metaText}.`;
    return `
      <div class="pm-unit pm-unit-${unit.state}${isOpen ? ' is-open' : ''}" data-unit="${unit.id}" style="--accent:var(--u${unit.id}-accent)">
        <button type="button" class="pm-unit-head" id="${headId}" aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="${panelId}" aria-label="${_escape(ariaLabel)}" onclick="Practice.toggleUnit('${unit.id}')">
          <span class="pm-unit-icon" aria-hidden="true">${icon}</span>
          <span class="pm-unit-info">
            <span class="pm-unit-eyebrow">Unit ${unit.number}</span>
            <span class="pm-unit-name">${_escape(unit.title)}</span>
            <span class="pm-unit-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${unit.masteryPct}" aria-label="${_escape(metaText)}">
              <span class="pm-unit-bar-fill" style="width:${unit.masteryPct}%"></span>
            </span>
            <span class="pm-unit-meta">${metaText}${reviewNote}</span>
          </span>
          ${status}
          <span class="pm-unit-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
        </button>
        <div class="pm-unit-panel" id="${panelId}" role="region" aria-labelledby="${headId}"${isOpen ? '' : ' hidden'}>
          <div class="pm-skill-list">${rows}</div>
        </div>
      </div>`;
  }

  // Next-action row — one tap to the user's current frontier (or top review).
  function _nextActionMarkup() {
    const action = getNextAction();
    if (!action) return '';
    const handler = action.kind === 'unlock'
      ? `openCourse(${action.lessonId})`
      : `Practice.startTopic('${_escape(action.topicId)}')`;
    const aria = `${action.eyebrow}: ${action.title}, ${action.meta}.`;
    return `
      <button type="button" class="practice-next" onclick="${handler}" aria-label="${_escape(aria)}">
        <span class="practice-next-body">
          <span class="practice-next-eyebrow">${_escape(action.eyebrow)}</span>
          <span class="practice-next-title">${_escape(action.title)}</span>
          <span class="practice-next-meta">${_escape(action.meta)}</span>
        </span>
        <span class="practice-next-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </button>`;
  }

  // Toggle a unit's "show all concepts". Re-renders so the panel reflects the
  // new disclosure state; module-level state survives the re-render.
  function toggleConcepts(unitId) {
    const id = String(unitId);
    if (expandedConcepts.has(id)) expandedConcepts.delete(id);
    else expandedConcepts.add(id);
    renderPracticePage();
  }

  // Toggle one unit open (single-open). DOM-only update so we don't rebuild the
  // page or lose scroll position; keeps aria-expanded + hidden in sync.
  function toggleUnit(unitId) {
    const id = String(unitId);
    openUnitId = (openUnitId === id) ? null : id;
    document.querySelectorAll('.pm-unit').forEach(el => {
      const open = el.getAttribute('data-unit') === openUnitId;
      el.classList.toggle('is-open', open);
      const head = el.querySelector('.pm-unit-head');
      const panel = el.querySelector('.pm-unit-panel');
      if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (panel) { if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', ''); }
    });
  }

  // ── Financial Fluency Ladder ────────────────────────────────
  // Uses the original curriculum units from data.js as the single source of
  // truth. No synthetic level names or lesson regrouping.
  function getFluencyLadder() {
    const completed = _completedIdSet();
    const levels = _unitsDef().map(unit => {
      const lessons = _unitLessons(unit);
      const done = lessons.filter(lesson => completed.has(Number(lesson.id))).length;
      return {
        n: unit.id,
        unitId: unit.id,
        name: unit.title || unit.name,
        description: unit.description || '',
        lessons,
        total: lessons.length,
        completed: done,
        pct: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
        firstLessonId: lessons[0]?.id || null,
        unlocked: typeof canUserAccessUnit === 'function' ? canUserAccessUnit(unit) : true,
        isComplete: lessons.length > 0 && done === lessons.length
      };
    });
    const current = levels.find(level => level.unlocked && !level.isComplete)
      || levels.find(level => level.unlocked)
      || levels[0];
    levels.forEach(lv => {
      if (lv.isComplete) lv.state = 'completed';
      else if (lv === current && lv.unlocked) lv.state = 'current';
      else if (lv.unlocked) lv.state = 'available';
      else lv.state = 'locked';
    });

    const completedTotal = levels.reduce((s, lv) => s + lv.completed, 0);
    const total = levels.reduce((sum, level) => sum + level.total, 0);
    return { levels, current, total, completedTotal };
  }

  // The single "Financial Fluency" metric that replaces the old XP/streak/quiz
  // stat cluster: percent of the course completed, plus the current level.
  function getFinancialFluency(ladder) {
    const l = ladder || getFluencyLadder();
    return {
      pct: l.total ? Math.round((l.completedTotal / l.total) * 100) : 0,
      level: l.current ? l.current.n : 1,
      levelName: l.current ? l.current.name : (_unitsDef()[0]?.title || _unitsDef()[0]?.name || 'Unit 1'),
      completed: l.completedTotal,
      total: l.total
    };
  }

  // Tapping an unlocked level opens the Learn tab focused on that level's
  // lessons (focusLearnLevel is defined by the Learn renderer in app.js).
  function openLevel(n) {
    const num = Number(n);
    if (typeof focusLearnLevel === 'function') focusLearnLevel(num);
    else if (typeof showLearn === 'function') showLearn();
  }

  function _ladderNode(lv) {
    if (lv.state === 'completed') {
      return `<span class="fl-node fl-node-done" aria-hidden="true">${NODE_CHECK}</span>`;
    }
    if (lv.state === 'locked') {
      return `<span class="fl-node fl-node-locked" aria-hidden="true">${LOCK_SVG}</span>`;
    }
    return `<span class="fl-node fl-node-${lv.state}" aria-hidden="true">${lv.n}</span>`;
  }

  function _ladderLevelMarkup(lv, isLast) {
    const rail = `<span class="fl-rail${isLast ? ' is-last' : ''}" aria-hidden="true"></span>`;
    let metaText;
    if (lv.state === 'locked') {
      metaText = `Complete Level ${lv.n - 1} to unlock`;
    } else if (lv.state === 'completed') {
      metaText = `${lv.total} lessons · Complete`;
    } else if (lv.state === 'current') {
      metaText = `${lv.completed} of ${lv.total} lessons · In progress`;
    } else {
      metaText = `${lv.completed} of ${lv.total} lessons`;
    }

    const inner = `
      ${rail}
      ${_ladderNode(lv)}
      <span class="fl-body">
        <span class="fl-eyebrow">Level ${lv.n}${lv.state === 'current' ? ' · Current' : ''}</span>
        <span class="fl-name">${_escape(lv.name)}</span>
        <span class="fl-bar"><span class="fl-bar-fill" style="width:${lv.pct}%"></span></span>
        <span class="fl-meta">${_escape(metaText)}</span>
      </span>`;

    if (lv.state === 'locked') {
      const aria = `Level ${lv.n}, ${lv.name}, locked. ${metaText}.`;
      return `<div class="fl-level fl-level-locked" aria-label="${_escape(aria)}">${inner}</div>`;
    }
    const aria = `Level ${lv.n}, ${lv.name}. ${metaText}. Open lessons.`;
    return `
      <button type="button" class="fl-level fl-level-${lv.state}" onclick="Practice.openLevel(${lv.n})" aria-label="${_escape(aria)}">
        ${inner}
        <span class="fl-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </button>`;
  }

  // Concepts the Coach / market quiz flagged for review. This is what closes
  // the market → lesson → quiz → Journey loop: a miss surfaces here as a
  // clear, actionable "needs review" card.
  function _renderReviewFlagsSection() {
    const store = (typeof window !== 'undefined' && window.CoachReview) ? window.CoachReview : null;
    const flags = store ? store.all() : [];
    if (!flags.length) return '';
    const rows = flags.slice().reverse().map(flag => {
      const topic = _escape(flag.topic);
      const source = _escape(flag.source || 'Coach');
      const note = flag.note ? `<small>${_escape(flag.note)}</small>` : '';
      const safeTopic = _escape(flag.topic).replace(/'/g, '&#39;');
      const action = Number.isFinite(Number(flag.lessonId))
        ? `onclick="coachReviewAct('${safeTopic}', ${Number(flag.lessonId)})"`
        : `onclick="coachReviewAct('${safeTopic}', null)"`;
      return `
        <div class="review-flag-row">
          <div class="review-flag-body">
            <span class="review-flag-topic">${topic} <em>needs review</em></span>
            <span class="review-flag-source">From ${source}</span>
            ${note}
          </div>
          <div class="review-flag-actions">
            <button type="button" class="btn btn-primary" ${action}>Review now</button>
            <button type="button" class="review-flag-dismiss" onclick="coachReviewDismiss('${safeTopic}')" aria-label="Dismiss">Dismiss</button>
          </div>
        </div>`;
    }).join('');
    return `
      <section class="review-flags-card" aria-label="Concepts flagged for review">
        <div class="review-flags-head">
          <span class="review-flags-kicker">Flagged by FinLingo Coach</span>
          <h2>Pick up where the market left you.</h2>
        </div>
        <div class="review-flags-list">${rows}</div>
      </section>`;
  }

  function renderPracticePage() {
    const root = document.getElementById('practiceRoot');
    if (!root) return;

    const units = getUnitsModel();
    const anyUnlocked = units.some(u => u.unlockedCount > 0);
    const ladder = getFluencyLadder();
    const fluency = getFinancialFluency(ladder);
    const nextLesson = (typeof getNextAvailableLesson === 'function') ? getNextAvailableLesson() : null;

    // Daily Practice card — muted/locked until the first lesson is complete,
    // then the most prominent action on the page (full-width primary button).
    let dailyCard;
    if (!anyUnlocked) {
      dailyCard = `
        <section class="practice-daily practice-daily-locked" aria-labelledby="dailyTitle">
          <div class="practice-daily-head">
            <span class="practice-daily-icon" aria-hidden="true">${DAILY_ICON}</span>
            <div class="practice-daily-headings">
              <div class="practice-daily-kicker" id="dailyTitle">Daily Practice</div>
              <p class="practice-daily-copy">Personalized review from completed lessons.</p>
            </div>
          </div>
          <div class="practice-daily-foot">
            <span class="practice-est">${SESSION_SIZE} questions · About ${estimateMinutes(SESSION_SIZE)} minutes</span>
            <button type="button" class="btn btn-locked" disabled aria-disabled="true">${LOCK_SVG}<span>Complete a lesson to unlock</span></button>
          </div>
          <button type="button" class="practice-daily-link" onclick="showLearn()">Go to Lessons</button>
        </section>`;
    } else {
      const dailyCount = buildDailyPracticeSession(SESSION_SIZE).length || SESSION_SIZE;
      const minutes = estimateMinutes(dailyCount);
      const reason = dailyPracticeReason();
      dailyCard = `
        <section class="practice-daily practice-daily-ready" aria-labelledby="dailyTitle">
          <div class="practice-daily-head">
            <span class="practice-daily-icon" aria-hidden="true">${DAILY_ICON}</span>
            <div class="practice-daily-headings">
              <div class="practice-daily-kicker" id="dailyTitle">Daily Practice</div>
              ${reason ? `<p class="practice-daily-copy">${_escape(reason)}</p>` : ''}
              <span class="practice-est">${dailyCount} questions · About ${minutes} minute${minutes === 1 ? '' : 's'}</span>
            </div>
          </div>
          <button type="button" class="btn btn-primary practice-daily-cta" onclick="Practice.startDaily()">Start Practice</button>
        </section>`;
    }

    // Financial Fluency — ONE simple progress metric (replaces the old
    // XP / streak / quizzes-passed cluster). Percent of the course complete.
    const fluencyCard = `
      <section class="fluency-card" aria-labelledby="fluencyTitle">
        <div class="fluency-top">
          <div class="fluency-headings">
            <div class="fluency-kicker" id="fluencyTitle">Financial Fluency</div>
            <div class="fluency-level">Unit ${fluency.level} of ${ladder.levels.length} · ${_escape(fluency.levelName)}</div>
          </div>
          <div class="fluency-pct" aria-hidden="true">${fluency.pct}%</div>
        </div>
        <div class="fluency-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fluency.pct}" aria-label="Financial fluency ${fluency.pct} percent, unit ${fluency.level} of ${ladder.levels.length}">
          <div class="fluency-bar-fill" style="width:${fluency.pct}%"></div>
        </div>
        <div class="fluency-meta">${fluency.completed} of ${fluency.total} lessons complete</div>
      </section>`;

    // The Financial Fluency Ladder — five levels, locked levels greyed out.
    const ladderRows = ladder.levels
      .map((lv, i) => _ladderLevelMarkup(lv, i === ladder.levels.length - 1))
      .join('');
    const journeyPath = (typeof renderFluencyPath === 'function')
      ? renderFluencyPath(ladder) : '';
    const ladderSection = `
      <section class="practice-section fluency-ladder-section" aria-labelledby="ladderTitle">
        <div class="practice-section-head">
          <h2 class="practice-section-title" id="ladderTitle">Your financial journey</h2>
        </div>
        ${journeyPath ? `<div class="fl-journey">${journeyPath}</div>` : ''}
        <div class="fl-ladder">${ladderRows}</div>
      </section>`;

    // Continue Learning — the next lesson, mirroring the reference card.
    let continueCard = '';
    if (nextLesson) {
      const lvl = ladder.levels.find(l => l.lessons.some(ls => ls.id === nextLesson.id));
      const sub = lvl ? `Level ${lvl.n} · ${lvl.name}` : 'Pick up where you left off';
      continueCard = `
        <section class="practice-section" aria-label="Continue learning">
          <div class="practice-section-head">
            <h2 class="practice-section-title">Continue Learning</h2>
          </div>
          <button type="button" class="fl-continue" onclick="openCourse(${nextLesson.id})">
            <span class="fl-continue-icon" aria-hidden="true">${DAILY_ICON}</span>
            <span class="fl-continue-body">
              <span class="fl-continue-title">${_escape(skillName(nextLesson) || nextLesson.title)}</span>
              <span class="fl-continue-sub">${_escape(sub)}</span>
            </span>
            <span class="fl-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
          </button>
        </section>`;
    }

    const currentLevel = ladder.current || ladder.levels[0];
    const completedSet = _completedIdSet();
    const currentNext = currentLevel?.lessons.find(lesson => !completedSet.has(Number(lesson.id))) || nextLesson;
    const currentTopics = getPracticeTopics().filter(topic =>
      currentLevel?.lessons.some(lesson => lesson.id === topic.lessonId)
    );
    const conceptsMastered = currentTopics.filter(topic => topic.state?.key === 'mastered').length;
    const reviewScore = S.totalAnswered
      ? Math.round((S.totalCorrect / S.totalAnswered) * 100)
      : 0;
    const confidence = typeof getFinancialConfidence === 'function'
      ? getFinancialConfidence()
      : { score: fluency.pct };
    const streak = Math.max(0, Number(S.streak) || 0);
    const weeklyDots = Array.from({ length: 7 }, (_, index) => {
      const active = index >= 7 - Math.min(7, streak);
      return `<span class="${active ? 'is-active' : ''}" aria-hidden="true"></span>`;
    }).join('');
    // Core competencies — one ring per curriculum unit. Every value is derived
    // straight from getFluencyLadder(): the ring % is the unit's real
    // lessons-complete ratio (lv.pct = done/total), and the state
    // (completed/current/available/locked) drives a visually distinct, non-
    // color-only treatment (icon + state word + status text). Clicks reuse the
    // existing Practice.openLevel() handler; locked units stay disabled.
    const _COMP_CHECK = '<svg class="comp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
    const _COMP_LOCK = '<svg class="comp-ic comp-ic-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
    const competencyList = ladder.levels.map(lv => {
      const done = lv.state === 'completed';
      const locked = lv.state === 'locked';
      const isCurrent = lv.state === 'current';
      const pct = Math.max(0, Math.min(100, Number(lv.pct) || 0));
      const stateKey = done ? 'done' : locked ? 'locked' : isCurrent ? 'current' : (pct > 0 ? 'partial' : 'zero');
      const stateWord = done ? 'Complete' : locked ? 'Locked' : (pct > 0 ? 'In progress' : 'Not started');
      const inner = done ? _COMP_CHECK : locked ? _COMP_LOCK : `${pct}%`;
      const status = locked ? 'Complete the previous unit to unlock' : `${lv.completed} of ${lv.total} lessons`;
      const aria = locked
        ? `${lv.name}. Locked. Complete the previous unit to unlock.`
        : `${lv.name}. ${stateWord}. ${lv.completed} of ${lv.total} lessons complete, ${pct} percent.`;
      const attrs = locked ? 'disabled aria-disabled="true"' : `onclick="Practice.openLevel(${lv.n})"`;
      return `
        <button type="button" class="comp-row comp-${stateKey}" ${attrs} style="--pct:${pct}" aria-label="${_escape(aria)}">
          <span class="comp-ring" aria-hidden="true"><span class="comp-ring-inner">${inner}</span></span>
          <span class="comp-copy">
            <span class="comp-name">${_escape(lv.name)}</span>
            <span class="comp-status">${_escape(status)}</span>
          </span>
          ${isCurrent ? '<span class="comp-tag">Current</span>' : ''}
          ${locked ? '' : '<span class="fl-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>'}
        </button>`;
    }).join('');

    root.innerHTML = `
      <div class="simple-page-shell simple-journey-shell">
        <main class="simple-page-main">
          <header class="simple-page-header">
            <span class="simple-eyebrow">Journey</span>
            <h1>Build financial fluency.</h1>
            <p>Move through the original FinLingo curriculum one unit at a time.</p>
          </header>

          ${_renderReviewFlagsSection()}

          <section class="simple-journey-score">
            <div>
              <span>Financial fluency</span>
              <strong>${fluency.pct}%</strong>
              <p>Unit ${fluency.level} of ${ladder.levels.length} · ${_escape(fluency.levelName)}</p>
            </div>
            <div class="simple-progress"><span style="width:${fluency.pct}%"></span></div>
          </section>

          <section class="simple-content-section comp-section">
            <div class="simple-section-heading"><span>Core competencies</span><small>${ladder.levels.length} units</small></div>
            <div class="comp-list">${competencyList}</div>
          </section>

          <section class="mastery-current-card simple-current-level">
            <div class="mastery-current-head">
              <div><span class="mastery-current-kicker">Current unit · ${currentLevel.n}</span><h2>${_escape(currentLevel.name)}</h2></div>
              <strong>${currentLevel.pct}%</strong>
            </div>
            <div class="mastery-current-track"><span style="width:${currentLevel.pct}%"></span></div>
            <div class="mastery-current-stats">
              <div><strong>${currentLevel.completed}</strong><span>Lessons completed</span></div>
              <div><strong>${conceptsMastered}</strong><span>Concepts mastered</span></div>
              <div><strong>${reviewScore ? `${reviewScore}%` : '—'}</strong><span>Review score</span></div>
            </div>
            ${currentNext
              ? `<button type="button" class="btn btn-primary mastery-primary-action" onclick="openCourse(${currentNext.id})">Continue unit</button>`
              : `<button type="button" class="btn btn-primary mastery-primary-action" onclick="Practice.startDaily()">Review current unit</button>`}
          </section>
        </main>

        <aside class="simple-page-rail">
          <section class="simple-rail-section simple-daily-practice">
            <span class="simple-rail-label">Daily practice</span>
            <h2>${anyUnlocked ? 'Strengthen what you learned' : 'Complete your first lesson'}</h2>
            <p>${anyUnlocked ? dailyPracticeReason() || 'A short review based on completed lessons.' : 'Practice unlocks after your first completed lesson.'}</p>
            <button type="button" class="btn btn-outline" onclick="${anyUnlocked ? 'Practice.startDaily()' : 'showLearn()'}">${anyUnlocked ? 'Start 3-minute practice' : 'Go to lessons'}</button>
          </section>
        </aside>
      </div>`;

    // The unlock highlight is a one-shot — clear it so it never re-fires on a
    // later re-render (or after refresh).
    recentlyUnlockedTopic = null;
  }

  // Public API
  global.Practice = {
    select: practiceSelect,
    check: practiceCheck,
    continue: practiceContinue,
    exit: exitPractice,
    again: practiceAgain,
    startDaily: startDailyPractice,
    startMixed: startMixedReview,
    startTopic: startTopicPractice,
    toggleUnit,
    toggleConcepts,
    openLevel,
    getLadder: getFluencyLadder,
    getFluency: getFinancialFluency,
    getNextAction,
    dailyReason: dailyPracticeReason,
    // Called when a lesson completes so the matching concept row flashes once.
    flagUnlocked: function (lesson) {
      if (!lesson) return;
      recentlyUnlockedTopic = _lessonTopicId(lesson);
    },
    render: renderPracticePage,
    getTopics: getPracticeTopics,
    getUnits: getUnitsModel,
    getOverall: getOverallMastery,
    getSummary: getPracticeSummary,
    getMasteryState,
    skillName
  };

  // Override the legacy Practice tab renderer (this file loads after app.js).
  global.renderPracticePage = renderPracticePage;

  // Review-flag handlers (used by the Journey "needs review" cards).
  global.coachReviewAct = function (topic, lessonId) {
    if (window.CoachReview) window.CoachReview.clear(topic);
    if (Number.isFinite(Number(lessonId)) && typeof openCourse === 'function') {
      openCourse(Number(lessonId));
    } else {
      startDailyPractice();
    }
  };
  global.coachReviewDismiss = function (topic) {
    if (window.CoachReview) window.CoachReview.clear(topic);
    renderPracticePage();
  };

  // Keep the Journey page live when a concept is flagged elsewhere (e.g. a
  // Coach quiz miss or the guided demo) while this screen is visible.
  if (typeof window !== 'undefined') {
    window.addEventListener('finlingo:review-updated', function () {
      const screen = document.getElementById('ranksScreen');
      if (screen && screen.classList.contains('active')) renderPracticePage();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
