// ============================================================
// quiz.js
// Everything that drives the quiz and course screens:
//
//   canAccess(requiredTier) — checks if user's tier meets requirement
//   showPaywall(tier, lesson) — polished upgrade modal
//   openCourse(id)    — show the lesson reading/intro page
//   getLessonVisual() — generate the inline SVG chart/graphic
//   startLesson(id)   — begin a lesson quiz
//   startDaily()      — begin the daily challenge quiz
//   renderQuestion()  — draw the current question on screen
//   selectChoice(i)   — user taps an answer
//   checkAnswer()     — evaluate the selected answer
//   nextStep()        — advance to next question or finish
//   finishRun()       — show the result screen
//
// Depends on: state.js, data.js (LESSONS, COURSES, ICONS, TIER_ORDER)
//             dailyQuestionBank.js (getDailyQuestion)
//             app.js (setScreen, setNav, showXpPop, showToast, showAppModal, closeAppModal)
// ============================================================

// ── TIER ACCESS HELPER ────────────────────────────────────────
// Returns true if the current user can access a lesson with the
// given required tier. Uses TIER_ORDER from data.js.
//
//   standard (0) >= standard (0) → true  (standard user, free lesson)
//   standard (0) >= gold     (1) → false (standard user, gold lesson)
//   gold     (1) >= gold     (1) → true  (gold user, gold lesson)
//   gold     (1) >= platinum (2) → false (gold user, platinum lesson)
//   platinum (2) >= platinum (2) → true  (platinum user, any lesson)

// ── WRONG ANSWER TRACKER ─────────────────────────────────────
// Collects mistakes during a lesson run. Reset at quiz start.
// Each entry: { q, yourAnswer, correctAnswer, explanation }
let lessonMistakes = [];
let lessonCash     = 0;     // cash earned in the current quiz run
let lessonBaseCash = 0;     // pre-multiplier cash earned in the current quiz run
let lessonDirectCashBonus = 0; // direct cash bonuses added outside boosted reward math
let lessonStartNetWorth = 0;
let hintUsesRemaining = 1;  // reset per question; starts with 1 free hint
let hintExtraPurchased = false;
let hintPurchasePending = false;
const HOT_STREAK_TRIGGER     = 5;
const HOT_STREAK_BONUS_XP    = 5;
const PERFECT_LESSON_BONUS_XP = 10;
const REFRESHER_QUESTION_LIMIT = 4;
const LESSON_HINT_PURCHASE_COST = 25;
let courseLesson = null;
let courseCards = [];
let courseCardIdx = 0;
let courseContextNote = '';
let refresherCompletedThisSession = false;
let refresherPendingPromotion = null;

function canAccess(requiredTier) {
  return true;
}

function _escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getRemainingHintChoiceIndexes() {
  const q = currentLesson?.questions?.[qIdx];
  if (!q?.options?.length) return [];
  return q.options
    .map((_, i) => i)
    .filter(i => i !== q.answer)
    .filter(i => {
      const btn = document.getElementById(`c${i}`);
      return btn && !btn.disabled;
    });
}

function renderHintRow() {
  const hintRow = document.getElementById('hintRow');
  if (!hintRow) return;

  if (mode === 'daily' || mode === 'review' || mode === 'refresher') {
    hintRow.innerHTML = '';
    return;
  }

  const hasHintReady = hintUsesRemaining > 0;
  const actionName = hasHintReady ? 'useHint()' : '';
  const disabled = locked || !hasHintReady;
  const tone = hasHintReady ? 'rgba(31,157,85,0.08)' : 'rgba(255,255,255,0.03)';
  const border = hasHintReady ? 'rgba(31,157,85,0.22)' : 'rgba(255,255,255,0.07)';
  const textColor = hasHintReady ? 'var(--green,#00b84a)' : 'rgba(255,255,255,0.25)';
  const counterCopy = hasHintReady ? `${hintUsesRemaining} hint available` : 'Hint used';
  const supportCopy = hasHintReady
    ? 'Remove up to 2 incorrect choices'
    : 'Continue with the remaining choices';
  const buttonLabel = hasHintReady ? 'Use hint' : 'Hint used';
  const pillText = hasHintReady ? 'Ready' : 'Used';

  hintRow.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:0.66rem;color:rgba(255,255,255,0.42);font-family:inherit;">
        <span>${counterCopy}</span>
        <span>${supportCopy}</span>
      </div>
      <button id="hintBtn" onclick="${actionName}" ${disabled ? 'disabled' : ''} style="
          width:100%;padding:9px 14px;
          background:${tone};
          border:1px solid ${border};
          border-radius:8px;
          color:${textColor};
          font-size:0.74rem;font-weight:600;
          cursor:${disabled ? 'default' : 'pointer'};
          font-family:inherit;
          display:flex;align-items:center;justify-content:space-between;gap:8px;
          transition:background 0.15s,border-color 0.15s;">
        <span style="display:flex;align-items:center;gap:6px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:13px;height:13px;flex-shrink:0">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          ${buttonLabel}
        </span>
        <span style="
            padding:2px 7px;border-radius:99px;font-size:0.67rem;font-weight:700;
            background:${hasHintReady ? 'rgba(31,157,85,0.12)' : 'rgba(255,255,255,0.05)'};
            color:${hasHintReady ? 'var(--green,#00b84a)' : 'rgba(255,255,255,0.2)'};">
          ${pillText}
        </span>
      </button>
    </div>`;
}


// ── PAYWALL MODAL ─────────────────────────────────────────────
// Shown when a user taps a lesson their tier doesn't cover.
// The modal icon SVG communicates the tier visually — no emojis needed.

function showPaywall(requiredTier, lessonOrTitle) {
  const lesson = typeof lessonOrTitle === 'object' ? lessonOrTitle : null;
  if (lesson?.id) openCourse(lesson.id);
}


// ── OPEN COURSE ───────────────────────────────────────────────
// Entry point for all lesson access.
// Sequential unit locks resolve first. Once the user has reached the
// current lesson, tier gating decides whether to open the lesson or
// show the upgrade prompt.

function openCourse(id) {
  const lesson = LESSONS.find(l => l.id === id);
  const lessonState = typeof getLessonPathState === 'function'
    ? getLessonPathState(lesson)
    : null;
  const requiredTier = typeof getLessonAccessTier === 'function'
    ? getLessonAccessTier(lesson)
    : lesson?.tier;

  // Lesson not in data yet → Coming Soon
  if (!lesson) {
    showAppModal({
      icon:  'neutral',
      title: 'Coming Soon',
      body:  'This lesson is not available yet. More lessons are being added soon.',
      actions: [{ label: 'Got it', cls: 'btn btn-primary', fn: closeAppModal }]
    });
    return;
  }

  if (lessonState?.lockedReason === 'sequence' && !lessonState.completed) {
    const priorTitle = lessonState.previousLesson
      ? `Finish Lesson ${lessonState.previousLesson.id} — ${lessonState.previousLesson.title} first.`
      : 'Finish the previous lesson in this unit first.';
    showAppModal({
      icon: 'neutral',
      title: 'Lesson order',
      body: `${priorTitle} Lessons inside each unit are designed to be taken in sequence.`,
      actions: [{ label: 'Got it', cls: 'btn btn-primary', fn: closeAppModal }]
    });
    return;
  }

  // User's tier is too low → paywall
  // Unit access is the source of truth for lesson entry.
  if (requiredTier && !canAccess(requiredTier)) {
    showPaywall(requiredTier, lesson);
    return;
  }

  // Interactive real-life scenario opener (lessons that have one) replaces
  // the reading screen, then flows into the existing quick-check quiz.
  const scenario = typeof getLessonScenario === 'function' ? getLessonScenario(id) : null;
  if (scenario) {
    renderScenarioCourse(lesson, scenario);
    setScreen('courseScreen', { resetScroll: true });
    setNav(null);
    return;
  }

  const course = COURSES[id];
  const miniCards = getLessonMiniCards(lesson);
  const visual = getLessonVisual(id, lesson);
  courseContextNote = typeof getPersonalizedContext === 'function'
    ? (getPersonalizedContext(id) || '')
    : '';

  if (miniCards.length) {
    const stored = getLessonMiniProgressEntry(id);
    courseLesson = lesson;
    courseCards = miniCards;
    courseCardIdx = stored.completed
      ? Math.max(0, miniCards.length - 1)
      : Math.max(0, Math.min(Number(stored.currentCard) || 0, miniCards.length - 1));
    renderMiniCourseScreen(course, visual);
    setScreen('courseScreen', { resetScroll: true });
    setNav(null);
    return;
  }

  // No reading content → go straight to the quiz
  if (!course) { startLesson(id); return; }
  renderLegacyCourseIntro(lesson, course, visual);
  setScreen('courseScreen', { resetScroll: true });
  setNav(null);
}

function getLessonMiniCards(lesson) {
  return Array.isArray(lesson?.miniLessonContent)
    ? lesson.miniLessonContent.filter(card => card?.title && card?.text)
    : [];
}

function getLessonMiniProgressEntry(lessonId) {
  if (!S.lessonMiniProgress || typeof S.lessonMiniProgress !== 'object') {
    S.lessonMiniProgress = {};
  }
  const entry = S.lessonMiniProgress[lessonId];
  return entry && typeof entry === 'object'
    ? entry
    : { currentCard: 0, completed: false };
}

function persistLessonMiniProgress(lessonId, patch = {}) {
  if (typeof lessonId !== 'number') return;
  if (!S.lessonMiniProgress || typeof S.lessonMiniProgress !== 'object') {
    S.lessonMiniProgress = {};
  }
  const prev = getLessonMiniProgressEntry(lessonId);
  S.lessonMiniProgress[lessonId] = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  if (typeof persistLocalState === 'function') persistLocalState();
  else save();
}

function getCourseDifficultyLabel(lesson, course) {
  if (course?.difficulty) return course.difficulty;
  if (lesson?.tier === 'platinum') return 'Advanced';
  if (lesson?.tier === 'gold') return 'Intermediate';
  return 'Foundations';
}

function getLessonUnitDisplay(lesson) {
  const unit = lesson && typeof getUnitForLesson === 'function'
    ? getUnitForLesson(lesson)
    : null;
  return unit
    ? `Unit ${unit.id} • ${unit.title || unit.name}`
    : (lesson?.unit || 'Finance Foundations');
}

function getLessonHeaderTitle(lesson) {
  if (!lesson) return 'Lesson';
  return `Lesson ${lesson.id} — ${lesson.title}`;
}

function _scrollCourseToTop() {
  const app = document.querySelector('.app');
  if (app) app.scrollTop = 0;
  const screen = document.getElementById('courseScreen');
  if (screen) screen.scrollTop = 0;
  window.scrollTo(0, 0);
}

function renderLegacyCourseIntro(lesson, course, visual) {
  courseLesson = lesson;
  courseCards = [];
  courseCardIdx = 0;
  document.getElementById('courseUnit').textContent  = getLessonUnitDisplay(lesson);
  document.getElementById('courseTitle').textContent = getLessonHeaderTitle(lesson);
  document.getElementById('courseMeta').innerHTML = `
    <div class="course-chip">
      <svg viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      ${course.reading} min read
    </div>
    <div class="course-chip">
      <svg viewBox="0 0 24 24" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
      ${lesson.questions.length} questions
    </div>
    <div class="course-chip">
      <svg viewBox="0 0 24 24" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      ${course.difficulty}
    </div>`;

  const contextHtml = courseContextNote
    ? `<div style="margin:0 0 20px;padding:12px 14px;border-left:3px solid var(--green);
         background:rgba(0,184,74,0.07);border-radius:0 6px 6px 0;
         font-size:0.78rem;line-height:1.55;
         color:var(--text-sub,rgba(255,255,255,0.7))">${courseContextNote}</div>`
    : '';

  document.getElementById('courseBody').innerHTML =
    `<div class="course-img-wrap">${visual}</div>${contextHtml}${course.body}`;

  const prevBtn = document.getElementById('coursePrevBtn');
  if (prevBtn) {
    prevBtn.style.display = 'none';
    prevBtn.onclick = null;
  }
  const startBtn = document.getElementById('startQuizBtn');
  startBtn.style.display = '';
  startBtn.textContent = 'Start Quiz';
  startBtn.onclick = () => startLesson(lesson.id);
}

// ════════════════════════════════════════════════════════════
// INTERACTIVE SCENARIO OPENER
// Real-life situation → choice → immediate feedback → short concept →
// takeaway, then "Start Quiz". Reflective (no score). State lives in
// module variables so re-renders preserve the user's selection.
// ════════════════════════════════════════════════════════════

let scenarioLesson = null;
let scenarioData = null;
let scenarioPick = null;

const _SCENARIO_VERDICTS = {
  strong:     { label: 'Strong choice', cls: 'good' },
  risky:      { label: 'Risky move',    cls: 'risk' },
  incomplete: { label: 'Incomplete',    cls: 'note' }
};

function renderScenarioCourse(lesson, scenario) {
  scenarioLesson = lesson;
  scenarioData = scenario;
  scenarioPick = null;
  courseLesson = lesson;
  courseCards = [];
  courseCardIdx = 0;

  document.getElementById('courseUnit').textContent  = getLessonUnitDisplay(lesson);
  document.getElementById('courseTitle').textContent = getLessonHeaderTitle(lesson);
  document.getElementById('courseMeta').innerHTML = `
    <div class="course-chip">
      <svg viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
      Real-life scenario
    </div>
    <div class="course-chip">
      <svg viewBox="0 0 24 24" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
      ${lesson.questions.length} quick check questions
    </div>`;

  const prevBtn = document.getElementById('coursePrevBtn');
  if (prevBtn) { prevBtn.style.display = 'none'; prevBtn.onclick = null; }

  _renderScenarioBody();
}

function selectScenarioChoice(index) {
  if (!scenarioData) return;
  scenarioPick = index;
  _renderScenarioBody();
  _scrollCourseToTop();
}

function _renderScenarioBody() {
  if (!scenarioData) return;
  const answered = Number.isInteger(scenarioPick);

  const choicesMarkup = scenarioData.choices.map((choice, index) => {
    const isPicked = scenarioPick === index;
    const revealStrong = answered && choice.verdict === 'strong';
    const stateCls = isPicked ? ' is-selected' : (revealStrong ? ' is-strong' : '');
    const mark = revealStrong
      ? `<span class="scenario-choice-mark"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg></span>`
      : `<span class="scenario-choice-letter">${String.fromCharCode(65 + index)}</span>`;
    return `
      <button type="button" class="scenario-choice${stateCls}" onclick="selectScenarioChoice(${index})"${answered ? ' disabled' : ''}>
        ${mark}
        <span class="scenario-choice-text">${_escapeHtml(choice.text)}</span>
      </button>`;
  }).join('');

  let revealMarkup = '';
  if (answered) {
    const chosen = scenarioData.choices[scenarioPick];
    const verdict = _SCENARIO_VERDICTS[chosen.verdict] || _SCENARIO_VERDICTS.incomplete;
    revealMarkup = `
      <div class="scenario-feedback ${verdict.cls}">
        <div class="scenario-feedback-verdict">${verdict.label}</div>
        <div class="scenario-feedback-text">${_escapeHtml(chosen.feedback)}</div>
      </div>
      <div class="scenario-block">
        <div class="scenario-block-label">The concept</div>
        <div class="scenario-block-text">${_escapeHtml(scenarioData.concept)}</div>
      </div>
      <div class="scenario-block scenario-takeaway">
        <div class="scenario-block-label">Takeaway</div>
        <div class="scenario-block-text">${_escapeHtml(scenarioData.takeaway)}</div>
      </div>`;
  }

  document.getElementById('courseBody').innerHTML = `
    <div class="lesson-scenario">
      <div class="scenario-situation-card">
        <div class="scenario-kicker">Your situation</div>
        <div class="scenario-situation">${_escapeHtml(scenarioData.situation)}</div>
      </div>
      <div class="scenario-choices">${choicesMarkup}</div>
      ${answered ? '' : `<div class="scenario-hint">Pick the option you'd actually go with — then see how it plays out.</div>`}
      ${revealMarkup}
    </div>`;

  const startBtn = document.getElementById('startQuizBtn');
  if (startBtn) {
    startBtn.textContent = 'Start Quiz';
    startBtn.style.display = answered ? '' : 'none';
    startBtn.onclick = () => startLesson(scenarioLesson.id);
  }
}

function setCourseCardIndex(nextIndex) {
  if (!courseLesson || !courseCards.length) return;
  const clampedIndex = Math.max(0, Math.min(nextIndex, courseCards.length - 1));
  const prev = getLessonMiniProgressEntry(courseLesson.id);
  courseCardIdx = clampedIndex;
  persistLessonMiniProgress(courseLesson.id, {
    currentCard: clampedIndex,
    completed: Boolean(prev.completed) || clampedIndex >= courseCards.length - 1
  });
  renderMiniCourseScreen(COURSES[courseLesson.id], getLessonVisual(courseLesson.id, courseLesson));
  _scrollCourseToTop();
}

function startCourseQuiz() {
  if (!courseLesson) return;
  persistLessonMiniProgress(courseLesson.id, {
    currentCard: Math.max(0, courseCards.length - 1),
    completed: true
  });
  startLesson(courseLesson.id);
}

function renderMiniCourseScreen(course, visual) {
  if (!courseLesson || !courseCards.length) return;

  const totalCards = courseCards.length;
  const firstQuestion = courseLesson.questions?.[0];
  const conceptText = courseLesson.title || 'Finance concept';
  const plainEnglishText = courseLesson.blurb || courseCards[0]?.text || `A plain-language introduction to ${courseLesson.title}.`;
  const whyText = courseCards[1]?.text || firstQuestion?.explanation || 'This matters because finance words usually point to real tradeoffs: risk, return, time, cost, or behavior.';
  const exampleText = courseCards[2]?.text || firstQuestion?.explanation || 'Look for this idea in a company headline, a fund description, or a personal money decision.';
  const loganNote = getLoganLessonNote(courseLesson);
  const lessonSections = [
    {
      title: 'Concept',
      text: conceptText
    },
    {
      title: 'Plain English',
      text: plainEnglishText
    },
    {
      title: 'Why it matters',
      text: whyText
    },
    {
      title: 'Real-world example',
      text: exampleText
    },
    {
      title: "Logan's Note",
      text: loganNote
    },
    {
      title: 'Quick Check',
      text: firstQuestion?.q || 'Answer a few quick questions to check your understanding.'
    }
  ];

  document.getElementById('courseUnit').textContent = getLessonUnitDisplay(courseLesson);
  document.getElementById('courseTitle').textContent = getLessonHeaderTitle(courseLesson);
  document.getElementById('courseMeta').innerHTML = `
    <div class="course-chip">
      <svg viewBox="0 0 24 24" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
      Short lesson
    </div>
    <div class="course-chip">
      <svg viewBox="0 0 24 24" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
      ${courseLesson.questions.length} questions
    </div>
    <div class="course-chip">
      <svg viewBox="0 0 24 24" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      ${getCourseDifficultyLabel(courseLesson, course)}
    </div>`;

  document.getElementById('courseBody').innerHTML = `
    <div class="course-img-wrap">${visual}</div>
    <div class="mini-lesson-shell lesson-structure-shell">
      ${courseContextNote ? `<div class="mini-lesson-note">${courseContextNote}</div>` : ''}
      ${lessonSections.map(section => `
        <div class="mini-lesson-card lesson-structure-card">
          <div class="mini-lesson-card-title">${section.title}</div>
          <div class="mini-lesson-card-text">${section.text}</div>
        </div>
      `).join('')}
    </div>`;

  const prevBtn = document.getElementById('coursePrevBtn');
  if (prevBtn) {
    prevBtn.style.display = 'none';
    prevBtn.onclick = null;
  }

  const startBtn = document.getElementById('startQuizBtn');
  startBtn.style.display = '';
  startBtn.textContent = 'Start Quick Check';
  startBtn.onclick = () => startCourseQuiz();
}

function getLoganLessonNote(lesson) {
  const title = String(lesson?.title || 'this concept').toLowerCase();
  if (title.includes('stock')) {
    return 'When I first learned stocks, the helpful shift was thinking "ownership" before thinking "price chart."';
  }
  if (title.includes('bond')) {
    return 'Bonds make more sense when you picture yourself as the lender. The interest payment is the tradeoff for letting someone else use your money.';
  }
  if (title.includes('etf') || title.includes('index')) {
    return 'For beginners, broad funds are often easier to understand than a pile of individual stock opinions.';
  }
  if (title.includes('inflation') || title.includes('real return')) {
    return 'Always ask what the money can buy after inflation. The headline return is only part of the story.';
  }
  if (title.includes('risk') || title.includes('volatility')) {
    return 'Risk is not just a scary word. It is the reason an investment might pay more, and the reason it might hurt if you need the money soon.';
  }
  return 'Try to connect the term to a real decision: what would you buy, avoid, compare, or ask before putting money at risk?';
}


// ── LESSON VISUAL ─────────────────────────────────────────────
// ... (getLessonVisual and all functions below stay exactly the same)


// ── LESSON VISUAL ─────────────────────────────────────────────
// Returns an inline SVG string for the hero graphic on each course.
// Each lesson ID has a hand-crafted chart; everything else gets a
// procedurally generated fallback based on the lesson's unit.

function getLessonVisual(id, lesson) {
  const dark   = '#0a0a0a', green  = '#00b84a', blue = '#3b82f6',
        amber  = '#d4a000', red    = '#e53535', purple = '#7c6fd4',
        muted  = 'rgba(255,255,255,0.18)';

  // Small helper to draw a text label
  const label = (x, y, txt, col = 'rgba(255,255,255,0.35)', sz = 11) =>
    `<text x="${x}" y="${y}" fill="${col}" font-size="${sz}" font-family="monospace" text-anchor="middle">${txt}</text>`;

  const visuals = {
    // 1 — Stock price chart with volume bars
    1: `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      ${[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17].map(i => {
        const h = 20 + Math.round(Math.abs(Math.sin(i * 0.7 + 1) * 25));
        return `<rect x="${40 + i * 38}" y="${155 - h}" width="16" height="${h}" rx="2" fill="rgba(0,184,74,0.25)"/>`;
      }).join('')}
      <polyline points="48,130 86,110 124,120 162,80 200,95 238,60 276,75 314,45 352,65 390,40 428,55 466,35 504,50 542,30 580,42 618,25 656,35 694,20" fill="none" stroke="${green}" stroke-width="2.5" stroke-linejoin="round"/>
      <polyline points="48,130 86,110 124,120 162,80 200,95 238,60 276,75 314,45 352,65 390,40 428,55 466,35 504,50 542,30 580,42 618,25 656,35 694,20 694,165 48,165" fill="rgba(0,184,74,0.07)"/>
      ${label(694,14,'+24.6%',green,12)}${label(100,172,'JAN',undefined,9)}${label(290,172,'JUN',undefined,9)}${label(500,172,'SEP',undefined,9)}${label(680,172,'DEC',undefined,9)}</svg>`,

    // 2 — Bond yield vs price inverse relationship
    2: `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      <line x1="50" y1="20" x2="50" y2="155" stroke="${muted}" stroke-width="1"/>
      <line x1="50" y1="155" x2="710" y2="155" stroke="${muted}" stroke-width="1"/>
      <polyline points="80,40 200,70 320,100 440,125 560,145 680,158" fill="none" stroke="${blue}" stroke-width="2.5" stroke-linejoin="round"/>
      <polyline points="80,158 200,140 320,110 440,80 560,52 680,28" fill="none" stroke="${red}" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="6 3"/>
      ${label(100,170,'LOW RATE',undefined,9)}${label(680,170,'HIGH RATE',undefined,9)}
      ${label(700,24,'YIELD',red,10)}${label(700,163,'PRICE',blue,10)}
      <text x="50" y="14" fill="${muted}" font-size="10" font-family="monospace">BOND PRICE ↓ WHEN RATES ↑</text></svg>`,

    // 3 — ETF basket diversification
    3: `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      ${['TECH','HEALTH','FINANCE','ENERGY','CONSUMER','MATERIALS','UTILITIES','REAL EST'].map((s, i) => {
        const col = [blue,'#00b84a',amber,red,purple,'#f97316',blue,green][i];
        const h   = [40,25,20,15,25,10,15,20][i];
        return `<rect x="${20+i*82}" y="30" width="74" height="${35+h}" rx="6" fill="${col}" opacity="${0.15+i*0.03}"/>
                <text x="${57+i*82}" y="${52+h/2}" fill="${col}" font-size="9" font-family="monospace" text-anchor="middle">${s}</text>`;
      }).join('')}
      <text x="380" y="160" fill="${muted}" font-size="10" font-family="monospace" text-anchor="middle">S&amp;P 500 ETF — ONE PURCHASE, INSTANT DIVERSIFICATION</text></svg>`,

    // 4 — Compound growth curve vs linear
    4: `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      <line x1="50" y1="20" x2="50" y2="150" stroke="${muted}" stroke-width="1"/>
      <line x1="50" y1="150" x2="720" y2="150" stroke="${muted}" stroke-width="1"/>
      <polyline points="50,150 116,146 182,138 248,126 314,110 380,90 446,65 512,36 578,18 644,8 710,4" fill="none" stroke="${green}" stroke-width="3" stroke-linejoin="round"/>
      <polyline points="50,150 116,146 182,138 248,126 314,110 380,90 446,65 512,36 578,18 644,8 710,4 710,155 50,155" fill="rgba(0,184,74,0.08)"/>
      <line x1="50" y1="150" x2="710" y2="50" stroke="${muted}" stroke-width="1.5" stroke-dasharray="5 4"/>
      ${label(680,20,'COMPOUND',green,10)}${label(680,46,'LINEAR',muted,10)}
      ${label(380,170,'YEAR 1',undefined,9)}${label(560,170,'YEAR 20',undefined,9)}${label(700,170,'YEAR 30',undefined,9)}
      <text x="55" y="14" fill="${muted}" font-size="10" font-family="monospace">$10,000 AT 8% — 30 YEARS</text></svg>`,

    // 5 — Market cap size comparison bars
    5: `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      ${[['APPLE','$3.0T',green,145],['MICROSOFT','$2.8T',blue,136],['GOOGLE','$2.1T',blue,102],['AMAZON','$1.9T',blue,92],['NVIDIA','$1.8T',amber,88],['BERKSHIRE','$0.9T',muted,44],['NETFLIX','$0.4T','rgba(255,255,255,0.3)',20]].map(([name,cap,col,w],i) =>
        `<rect x="140" y="${18+i*22}" width="${w*3.5}" height="16" rx="3" fill="${col}" opacity="0.8"/>
         <text x="135" y="${30+i*22}" fill="${muted}" font-size="9" font-family="monospace" text-anchor="end">${name}</text>
         <text x="${148+w*3.5}" y="${30+i*22}" fill="${col}" font-size="9" font-family="monospace">${cap}</text>`
      ).join('')}
      <text x="380" y="172" fill="${muted}" font-size="10" font-family="monospace" text-anchor="middle">MARKET CAPITALIZATION — TOP US COMPANIES</text></svg>`,

    // 6 — Bid/ask spread visual
    6: `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      ${[5,4,3,2,1].map((depth,i) => `<rect x="${100+i*18}" y="${80-depth*8}" width="16" height="${depth*8+20}" rx="2" fill="${blue}" opacity="${0.3+i*0.12}"/>`).join('')}
      ${[5,4,3,2,1].map((depth,i) => `<rect x="${420+i*18}" y="${80-depth*8}" width="16" height="${depth*8+20}" rx="2" fill="${red}"  opacity="${0.3+(4-i)*0.12}"/>`).join('')}
      <rect x="200" y="40" width="215" height="80" rx="8" fill="rgba(255,255,255,0.03)" stroke="${muted}" stroke-width="1"/>
      ${label(307,75,'SPREAD',muted,10)}${label(307,90,'$0.02',green,16)}
      ${label(160,160,'BID ORDERS',blue,10)}${label(460,160,'ASK ORDERS',red,10)}
      <text x="380" y="172" fill="${muted}" font-size="10" font-family="monospace" text-anchor="middle">NARROW SPREAD = HIGH LIQUIDITY</text></svg>`,

    // 7 — Volatility comparison: high vs low
    7: `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      <polyline points="40,90 80,45 120,120 160,30 200,110 240,55 280,130 320,25 360,100 400,40 440,115 480,20 520,95 560,50 600,125 640,35 700,110" fill="none" stroke="${red}" stroke-width="2" stroke-linejoin="round"/>
      <polyline points="40,90 100,85 160,88 220,82 280,87 340,83 400,86 460,81 520,88 580,84 640,86 700,83" fill="none" stroke="${green}" stroke-width="2.5" stroke-linejoin="round"/>
      ${label(370,160,'HIGH VOLATILITY (CRYPTO)',red,10)}${label(550,74,'LOW VOL (BOND)',green,10)}
      <text x="40" y="14" fill="${muted}" font-size="10" font-family="monospace">VOLATILITY = PRICE SWINGS — MEASURED BY STD DEVIATION</text></svg>`,

    // 8 — Diversification: correlated vs uncorrelated portfolios
    8: `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      <polyline points="40,90 100,130 160,80 220,140 280,70 340,150 400,60 460,145 520,55 580,140 640,50" fill="none" stroke="${red}" stroke-width="2" opacity="0.7"/>
      <polyline points="40,90 100,85 160,88 220,86 280,90 340,84 400,89 460,85 520,88 580,86 640,89" fill="none" stroke="${green}" stroke-width="3" stroke-linejoin="round"/>
      <line x1="380" y1="20" x2="380" y2="165" stroke="${muted}" stroke-width="1" stroke-dasharray="4 3"/>
      ${label(190,160,'CORRELATED ASSETS',red,10)}${label(550,160,'DIVERSIFIED',green,10)}
      <text x="40" y="14" fill="${muted}" font-size="10" font-family="monospace">DIVERSIFICATION REDUCES PORTFOLIO VOLATILITY</text></svg>`,

    // 9 — Compound interest bar chart: $10k at 8% over 30 years
    9: `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      <line x1="60" y1="155" x2="700" y2="155" stroke="${muted}" stroke-width="1"/>
      ${[0,5,10,15,20,25,30].map((yr, i) => {
        const val    = 10000 * Math.pow(1.08, yr);
        const maxVal = 10000 * Math.pow(1.08, 30);
        const x      = 60 + i * 107;
        const barH   = Math.min(120, (val / maxVal) * 120);
        const display = val >= 1000000 ? `$${(val/1000000).toFixed(1)}M` : `$${Math.round(val/1000)}k`;
        return `<rect x="${x-14}" y="${155-barH}" width="28" height="${barH}" rx="4" fill="${green}" opacity="${0.3+i*0.11}"/>
                <text x="${x}" y="${152-barH}" fill="${green}" font-size="${i>4?10:9}" font-family="monospace" text-anchor="middle">${display}</text>
                <text x="${x}" y="168" fill="${muted}" font-size="9" font-family="monospace" text-anchor="middle">Yr${yr}</text>`;
      }).join('')}
      <text x="380" y="14" fill="${muted}" font-size="10" font-family="monospace" text-anchor="middle">$10,000 AT 8% ANNUAL RETURN — COMPOUND EFFECT</text></svg>`,

    // 10 — Purchasing power erosion at 3% inflation
    10: `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      <polyline points="60,30 150,52 240,72 330,90 420,106 510,121 600,134 690,145" fill="none" stroke="${red}" stroke-width="3" stroke-linejoin="round"/>
      <polyline points="60,30 150,52 240,72 330,90 420,106 510,121 600,134 690,145 690,160 60,160" fill="rgba(229,53,53,0.08)"/>
      ${[[60,30,'$100'],[240,72,'$74'],[420,106,'$55'],[600,134,'$41'],[690,145,'$31']].map(([x,y,v]) => `<text x="${x}" y="${y-6}" fill="${red}" font-size="10" font-family="monospace" text-anchor="middle">${v}</text>`).join('')}
      ${[[60,170,'TODAY'],[240,170,'10 YRS'],[420,170,'20 YRS'],[600,170,'30 YRS']].map(([x,y,v]) => `<text x="${x}" y="${y}" fill="${muted}" font-size="9" font-family="monospace" text-anchor="middle">${v}</text>`).join('')}
      <text x="380" y="14" fill="${muted}" font-size="10" font-family="monospace" text-anchor="middle">PURCHASING POWER OF $100 AT 3% INFLATION</text></svg>`,
  };

  // Return the hand-crafted visual if it exists
  if (visuals[id]) return visuals[id];

  // ── Procedural fallback ────────────────────────────────────
  const unitColors = {
    'Money & Markets':        green,
    'Investing for Everyone': blue,
    'Reading Companies':      amber,
    'Wall Street & Deals':    amber,
    'Trading & Derivatives':  red,
    'Macro & Global Markets': purple
  };
  const col     = unitColors[lesson.unit] || green;
  const pts     = Array.from({length:18},(_,i) => `${40+i*38},${90+Math.sin(i*0.9+id*0.3)*45}`).join(' ');
  const barData = Array.from({length:12},(_,i) => ({h:20+Math.round(Math.abs(Math.sin(i*0.7+id)*35)),x:80+i*50}));

  if (id % 2 === 0) {
    return `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
      ${barData.map(({h,x}) => `<rect x="${x}" y="${140-h}" width="32" height="${h}" rx="3" fill="${col}" opacity="0.35"/>`).join('')}
      <text x="380" y="170" fill="${muted}" font-size="10" font-family="monospace" text-anchor="middle">${lesson.title.toUpperCase()}</text></svg>`;
  }
  return `<svg viewBox="0 0 760 180" xmlns="http://www.w3.org/2000/svg"><rect width="760" height="180" fill="${dark}"/>
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>
    <polyline points="${pts} 720,160 40,160" fill="${col}" opacity="0.06"/>
    <text x="380" y="170" fill="${muted}" font-size="10" font-family="monospace" text-anchor="middle">${lesson.title.toUpperCase()}</text></svg>`;
}


// ── START LESSON ──────────────────────────────────────────────
// Begin a regular lesson quiz. Guards against lessons with no questions.

function startLesson(id) {
  const lesson = LESSONS.find(l => l.id === id);
  if (!lesson || !lesson.questions || lesson.questions.length === 0) {
    showAppModal({
      icon: 'neutral',
      title: 'Coming Soon',
      body: 'This lesson has no questions yet. Check back soon.',
      actions: [{ label: 'OK', cls: 'btn btn-primary', fn: closeAppModal }]
    });
    return;
  }
  mode = 'lesson'; currentLesson = lesson;
  _renderKeepGoingCard({ show: false });
  lessonStartXp = S.xp || 0;
  lessonStartNetWorth = typeof getPortfolioNetWorth === 'function' ? getPortfolioNetWorth() : 0;
  qIdx = 0; selected = null; locked = false; lessonCorrect = 0; lessonXp = 0; lessonBaseXp = 0; lessonCash = 0; lessonBaseCash = 0; lessonDirectCashBonus = 0; lessonMistakes = [];
  resetRunMomentum();
  setScreen('quizScreen', { resetScroll: true }); setNav(null);
  renderQuestion();
}


// ── START DAILY ───────────────────────────────────────────────
// Begin the daily challenge quiz.
// getDailyQuestion() in dailyQuestionBank.js selects today's question
// deterministically from the bank — same for all users on the same date.

function startDaily() {
  if (typeof openDailyQuestion === 'function') {
    openDailyQuestion();
    return;
  }

  const todayQ = getDailyQuestion();
  mode = 'daily';
  _renderKeepGoingCard({ show: false });
  currentLesson = { id: 'daily', title: 'Daily Challenge', unit: 'Daily', questions: [todayQ] };
  lessonStartXp = S.xp || 0;
  lessonStartNetWorth = typeof getPortfolioNetWorth === 'function' ? getPortfolioNetWorth() : 0;
  qIdx = 0; selected = null; locked = false; lessonCorrect = 0; lessonXp = 0; lessonBaseXp = 0; lessonCash = 0; lessonBaseCash = 0; lessonDirectCashBonus = 0; lessonMistakes = [];
  resetRunMomentum();
  setScreen('quizScreen', { resetScroll: true }); setNav(null);
  renderQuestion();
}

function startReviewSprint(limit = 5) {
  const sprint = typeof buildReviewSprint === 'function'
    ? buildReviewSprint(limit)
    : [];
  if (!sprint.length) {
    showToast('No review questions are due right now', '');
    return;
  }

  mode = 'review';
  _renderKeepGoingCard({ show: false });
  lessonStartXp = S.xp || 0;
  lessonStartNetWorth = typeof getPortfolioNetWorth === 'function' ? getPortfolioNetWorth() : 0;
  currentLesson = {
    id: 'review',
    title: 'Review Sprint',
    unit: 'Weak Areas',
    questions: sprint.map(item => item.question)
  };
  qIdx = 0; selected = null; locked = false; lessonCorrect = 0; lessonXp = 0; lessonBaseXp = 0; lessonCash = 0; lessonBaseCash = 0; lessonDirectCashBonus = 0; lessonMistakes = [];
  resetRunMomentum();
  setScreen('quizScreen', { resetScroll: true }); setNav(null);
  renderQuestion();
}

function startRefresherQuiz(limit = REFRESHER_QUESTION_LIMIT) {
  const refresher = typeof buildRefresherQuiz === 'function'
    ? buildRefresherQuiz(limit)
    : [];
  if (!refresher.length) {
    showToast('Complete a few lessons to unlock your refresher quiz', '');
    return;
  }

  mode = 'refresher';
  _renderKeepGoingCard({ show: false });
  lessonStartXp = S.xp || 0;
  lessonStartNetWorth = typeof getPortfolioNetWorth === 'function' ? getPortfolioNetWorth() : 0;
  currentLesson = {
    id: 'refresher',
    title: 'Refresher Quiz',
    unit: 'Completed Lessons',
    questions: refresher.map(item => item.question)
  };
  if (!S.refresherQuiz || typeof S.refresherQuiz !== 'object') {
    S.refresherQuiz = typeof getDefaultRefresherQuiz === 'function'
      ? getDefaultRefresherQuiz()
      : {};
  }
  S.refresherQuiz = {
    ...S.refresherQuiz,
    lastStartedOn: today(),
    lastQuestionIds: refresher.map(item => item.questionId).filter(Boolean),
    updatedAt: new Date().toISOString()
  };
  qIdx = 0; selected = null; locked = false; lessonCorrect = 0; lessonXp = 0; lessonBaseXp = 0; lessonCash = 0; lessonBaseCash = 0; lessonDirectCashBonus = 0; lessonMistakes = [];
  resetRunMomentum();
  refresherCompletedThisSession = false;
  refresherPendingPromotion = null;
  save();
  renderRefresherModal();
}

function getRunMomentumMeta() {
  if (runCorrectStreak < 2) return null;

  let label = 'Building Momentum';
  let tone = 'warm';
  if (runCorrectStreak >= 10) {
    label = 'Unstoppable';
    tone = 'fire';
  } else if (runCorrectStreak >= HOT_STREAK_TRIGGER) {
    label = 'Hot Streak';
    tone = 'hot';
  } else if (runCorrectStreak >= 3) {
    label = 'On a Roll';
    tone = 'roll';
  }

  return { label, tone, streak: runCorrectStreak };
}

function _resetRefresherSessionState() {
  if (mode !== 'refresher') return;
  mode = 'lesson';
  currentLesson = null;
  qIdx = 0;
  selected = null;
  locked = false;
  lessonCorrect = 0;
  lessonXp = 0;
  lessonBaseXp = 0;
  lessonCash = 0;
  lessonBaseCash = 0;
  lessonDirectCashBonus = 0;
  lessonMistakes = [];
  resetRunMomentum();
}

function handleRefresherModalClose() {
  if (mode !== 'refresher') return;

  if (!refresherCompletedThisSession) {
    if (!S.refresherQuiz || typeof S.refresherQuiz !== 'object') {
      S.refresherQuiz = typeof getDefaultRefresherQuiz === 'function'
        ? getDefaultRefresherQuiz()
        : {};
    }
    S.refresherQuiz = {
      ...S.refresherQuiz,
      lastPromptedOn: null,
      lastStartedOn: null,
      lastQuestionIds: [],
      updatedAt: new Date().toISOString()
    };
    if (typeof resetRefresherPromptGate === 'function') resetRefresherPromptGate();
    save();
  } else {
    const promotion = refresherPendingPromotion;
    refresherPendingPromotion = null;
    if (promotion) {
      setTimeout(() => {
        if (typeof showRankPromotion === 'function') {
          showRankPromotion(promotion.beforeLevel, promotion.afterLevel, promotion);
        } else {
          showToast(`Promoted to ${promotion.afterLevel.name}!`, 'success');
        }
      }, 120);
    }
  }

  refresherCompletedThisSession = false;
  _resetRefresherSessionState();
}

function renderRefresherModal() {
  if (mode !== 'refresher' || !currentLesson?.questions?.length) return;

  if (qIdx >= currentLesson.questions.length) {
    finishRefresherQuiz();
    return;
  }

  const q = currentLesson.questions[qIdx];
  const total = currentLesson.questions.length;
  const progressPct = Math.max(0, Math.min(100, ((qIdx + 1) / total) * 100));
  const momentum = getRunMomentumMeta();
  const correct = locked ? selected === q.answer : null;
  const explanation = locked
    ? `
      <div class="refresher-feedback ${correct ? 'correct' : 'incorrect'}">
        <span class="refresher-feedback-label">${correct ? 'Correct' : 'Correct answer'}</span>
        ${!correct ? `<div style="margin-bottom:6px;font-weight:700;color:var(--text)">${_escapeHtml(q.options[q.answer])}</div>` : ''}
        ${_escapeHtml(q.explanation || '')}
      </div>`
    : `<div class="refresher-feedback">
         <span class="refresher-feedback-label">Quick check</span>
         Pick the best answer. You can close this any time.
       </div>`;

  showAppModal({
    icon: 'neutral',
    title: 'Refresher Quiz',
    showClose: true,
    onClose: handleRefresherModalClose,
    bodyIsHTML: true,
    body: `
      <div class="refresher-modal">
        <div class="refresher-topline">
          <span>Question ${qIdx + 1} of ${total}</span>
          ${momentum ? `<span class="refresher-momentum">${_escapeHtml(momentum.label)}</span>` : ''}
        </div>
        <div class="refresher-track"><div class="refresher-fill" style="width:${progressPct}%"></div></div>
        <div class="refresher-question">${_escapeHtml(q.question || q.q || '')}</div>
        <div class="refresher-choices">
          ${(q.options || []).map((option, i) => {
            let cls = 'refresher-choice';
            if (locked && i === q.answer) cls += ' correct';
            else if (locked && i === selected && i !== q.answer) cls += ' incorrect';
            return `
              <button class="${cls}" onclick="selectRefresherChoice(${i})" ${locked ? 'disabled' : ''}>
                <span class="refresher-choice-letter">${String.fromCharCode(65 + i)}</span>
                <span>${_escapeHtml(option)}</span>
              </button>`;
          }).join('')}
        </div>
        ${explanation}
      </div>`,
    actions: [
      { label: 'Not now', cls: 'modal-cancel', fn: closeAppModal },
      {
        label: qIdx === total - 1 ? 'Finish' : 'Next',
        cls: 'btn btn-primary',
        fn: nextRefresherStep,
        disabled: !locked
      }
    ]
  });
}

function selectRefresherChoice(i) {
  if (mode !== 'refresher' || locked) return;
  selected = i;
  checkRefresherAnswer();
}

function checkRefresherAnswer() {
  if (mode !== 'refresher' || selected === null || locked) return;
  locked = true;

  const q = currentLesson.questions[qIdx];
  const correct = selected === q.answer;
  let reward = { xpAwarded: 0, cashAwarded: 0, baseXp: 0, baseCash: 0 };

  S.totalAnswered++;
  if (correct) {
    S.totalCorrect++;
    reward = awardRewards({
      baseXp: 10,
      baseCash: 10,
      source: 'question_correct',
      meta: getQuestionProgressMeta(q)
    });
    lessonXp += reward.xpAwarded || 0;
    lessonBaseXp += reward.baseXp || 0;
    lessonBaseCash += reward.baseCash || 0;
    lessonCorrect += 1;
    lessonCash += reward.cashAwarded || 0;
    showXpPop(reward.xpAwarded || 0);
    showCashPop(reward.cashAwarded || 0);
  } else {
    lessonMistakes.push({
      q: q.question || q.q,
      yourAnswer: q.options[selected],
      correctAnswer: q.options[q.answer],
      explanation: q.explanation
    });
  }

  logReviewResult(q, correct);
  handleRunMomentum(correct);
  save();
  updateTopbar();
  renderRefresherModal();
}

function nextRefresherStep() {
  if (mode !== 'refresher' || !locked) return;
  qIdx += 1;
  selected = null;
  locked = false;
  if (qIdx >= currentLesson.questions.length) {
    finishRefresherQuiz();
    return;
  }
  renderRefresherModal();
}

function finishRefresherQuiz() {
  if (mode !== 'refresher' || !currentLesson) return;

  const questionCount = currentLesson.questions.length;
  const scorePct = typeof getScorePercentage === 'function'
    ? getScorePercentage(lessonCorrect, questionCount)
    : (questionCount ? (lessonCorrect / questionCount) * 100 : 0);
  const scorePctRounded = Math.round(scorePct);

  if (!S.refresherQuiz || typeof S.refresherQuiz !== 'object') {
    S.refresherQuiz = typeof getDefaultRefresherQuiz === 'function'
      ? getDefaultRefresherQuiz()
      : {};
  }
  S.refresherQuiz = {
    ...S.refresherQuiz,
    lastStartedOn: null,
    lastCompletedOn: today(),
    lastQuestionIds: [],
    updatedAt: new Date().toISOString()
  };
  refresherCompletedThisSession = true;
  refresherPendingPromotion = null;
  save();
  updateTopbar();

  showAppModal({
    icon: 'neutral',
    title: 'Refresher Quiz Complete',
    showClose: true,
    onClose: handleRefresherModalClose,
    bodyIsHTML: true,
    body: `
      <div class="refresher-modal">
        <div class="refresher-question" style="margin-bottom:8px;">
          ${lessonCorrect === questionCount
            ? 'Sharp work. You cleared every refresher question.'
            : `Nice reset. ${lessonCorrect}/${questionCount} concepts held up.`}
        </div>
        <div class="refresher-feedback correct">
          <span class="refresher-feedback-label">Session summary</span>
          ${promotion?.afterLevel?.name
            ? `Promotion ready: ${_escapeHtml(promotion.afterLevel.name)}.`
            : 'Your progress is updated and saved.'}
        </div>
        <div class="refresher-summary-grid">
          <div class="refresher-summary-stat">
            <span class="refresher-summary-value">${scorePctRounded}%</span>
            <span class="refresher-summary-label">Score</span>
          </div>
          <div class="refresher-summary-stat">
            <span class="refresher-summary-value">${questionCount}</span>
            <span class="refresher-summary-label">Questions</span>
          </div>
          <div class="refresher-summary-stat">
            <span class="refresher-summary-value">${Object.keys(S.mastery || {}).length}</span>
            <span class="refresher-summary-label">Concepts</span>
          </div>
        </div>
      </div>`,
    actions: [
      { label: 'Done', cls: 'btn btn-primary', fn: closeAppModal }
    ]
  });
}

function getQuestionProgressMeta(q) {
  return {
    questionId: q?.questionId || q?.id || `${currentLesson?.id || 'lesson'}-q${qIdx + 1}`,
    topicId: q?.topicId || q?.topic || currentLesson?.title || 'general',
    difficulty: q?.difficulty || (mode === 'daily' ? 'hard' : 'medium')
  };
}

function logReviewResult(q, correct) {
  if (typeof recordQuestionResult !== 'function' || !q) return null;
  return recordQuestionResult({
    ...getQuestionProgressMeta(q),
    correct
  });
}

function resetRunMomentum() {
  runCorrectStreak = 0;
  runBestCorrectStreak = 0;
  runMomentumBonusXp = 0;
  runPerfectBonusXp = 0;
  runHotStreakAwarded = false;
  runMegaStreakShown = false;
}

function renderQuizMomentum() {
  const el = document.getElementById('quizMomentum');
  if (!el) return;
  el.style.display = 'none';
  el.textContent = '';
  el.className = 'quiz-momentum';
}

function handleRunMomentum(correct) {
  if (!correct) {
    runCorrectStreak = 0;
    return;
  }

  runCorrectStreak += 1;
  runBestCorrectStreak = Math.max(runBestCorrectStreak, runCorrectStreak);
}


// ── RENDER QUESTION ───────────────────────────────────────────
// Draws the current question (qIdx) to the quiz screen.

function renderQuestion() {
  const q   = currentLesson.questions[qIdx];
  const tot = currentLesson.questions.length;
  selected  = null;
  locked    = false;

  document.getElementById('quizProg').textContent    = `Q${qIdx + 1} of ${tot}`;
  document.getElementById('quizLesson').textContent  = mode === 'daily'
    ? 'Daily'
    : mode === 'review'
      ? 'Review'
      : mode === 'refresher'
        ? 'Refresher'
        : `Lesson ${currentLesson.id}`;
  document.getElementById('quizFill').style.width    = `${(qIdx / tot) * 100}%`;
  document.getElementById('unitText').textContent    = getLessonUnitDisplay(currentLesson);
  document.getElementById('questionText').textContent= q.question || q.q || '';
  renderQuizMomentum();

  // Reset feedback box to default state
  const _fbReset = document.getElementById('fbBox');
  if (_fbReset) _fbReset.style.pointerEvents = '';
  _fbReset.innerHTML = `
    <div class="fb-head neutral">
      <svg viewBox="0 0 24 24" stroke-width="2" style="width:13px;height:13px;stroke:currentColor;fill:none">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      Select an answer
    </div>
    <div class="fb-body">Use the explanation after each answer to reinforce the concept.</div>`;

  // ── Question engine delegation ────────────────────────────
  // Hide any type badge left from the previous engine question.
  if (typeof _qeHideTypeBadge === 'function') _qeHideTypeBadge();

  // Delegate to the engine for new question types.
  // The engine handles choices, buttons, feedback, and XP.
  if (typeof QE !== 'undefined' && QE.isEngineQuestion(q)) {
    document.getElementById('choices').innerHTML = '';
    const _cBtn = document.getElementById('checkBtn');
    const _nBtn = document.getElementById('nextBtn');
    if (_cBtn) _cBtn.style.display = 'none';
    if (_nBtn) { _nBtn.disabled = true; _nBtn.onclick = nextStep; }
    const _hRow = document.getElementById('hintRow');
    if (_hRow) _hRow.innerHTML = '';
    QE.render(q);
    return; // skip legacy choices + hint injection below
  }

  // Render answer choices
  document.getElementById('choices').innerHTML = q.options.map((option, i) => `
    <button class="choice" id="c${i}" onclick="selectChoice(${i})">
      <span class="cl">${String.fromCharCode(65 + i)}</span>
      <span>${option}</span>
    </button>`).join('');

  // Hide the Check button if it exists — tap-to-check needs no separate step
  const _checkBtn = document.getElementById('checkBtn');
  if (_checkBtn) _checkBtn.style.display = 'none';

  // Wire and disable the Next button directly — don't rely on HTML onclick attribute
  const _nextBtn = document.getElementById('nextBtn');
  if (_nextBtn) {
    _nextBtn.style.display = '';
    _nextBtn.disabled = true;
    _nextBtn.onclick  = nextStep;
  }

  // ── Hint button ───────────────────────────────────────────
  // Only available in normal lesson quizzes — not the daily challenge.
  hintUsesRemaining = 1;
  hintExtraPurchased = false;
  hintPurchasePending = false;
  let _hintRow = document.getElementById('hintRow');
  if (mode === 'daily' || mode === 'review' || mode === 'refresher') {
    if (_hintRow) _hintRow.innerHTML = '';
    return; // skip hint injection entirely for daily, review, and refresher runs
  }
  if (!_hintRow) {
    _hintRow = document.createElement('div');
    _hintRow.id = 'hintRow';
    const _fbBox = document.getElementById('fbBox');
    if (_fbBox?.parentNode) _fbBox.parentNode.insertBefore(_hintRow, _fbBox);
  }
  renderHintRow();
}


// ── SELECT CHOICE ─────────────────────────────────────────────
// Immediately evaluates the tapped answer.
// The locked flag (set in checkAnswer) prevents any re-tap.

function selectChoice(i) {
  if (locked) return;
  selected = i;
  // Apply selected highlight — browser batches this with the
  // correct/incorrect paint from checkAnswer(), so only one repaint fires.
  document.querySelectorAll('.choice').forEach((el, idx) =>
    el.classList.toggle('selected', idx === i)
  );
  checkAnswer();
}


// ── CHECK ANSWER ──────────────────────────────────────────────
// Locks the choices, reveals correct/incorrect states,
// awards XP, updates the feedback box, and tracks mistakes.

function checkAnswer() {
  if (selected === null || locked) return;
  locked = true;

  const q       = currentLesson.questions[qIdx];
  const correct = selected === q.answer;

  // Colour the choices
  document.querySelectorAll('.choice').forEach((el, i) => {
    el.disabled = true;
    if (i === q.answer)                    el.classList.add('correct');
    if (i === selected && i !== q.answer)  el.classList.add('incorrect');
    el.classList.remove('selected');
  });

  // Update stats
  S.totalAnswered++;
  let _reward = { xpAwarded: 0, cashAwarded: 0, baseXp: 0, baseCash: 0 };
  if (correct) {
    S.totalCorrect++;
    _reward = awardRewards({
      baseXp: 10,
      baseCash: 10,
      source: 'question_correct',
      meta: getQuestionProgressMeta(q)
    });
    lessonXp    += _reward.xpAwarded || 0;
    lessonBaseXp += _reward.baseXp || 0;
    lessonBaseCash += _reward.baseCash || 0;
    lessonCorrect++;
    lessonCash  += _reward.cashAwarded || 0;
    showXpPop(_reward.xpAwarded || 0);
    if (mode !== 'daily') showCashPop(_reward.cashAwarded || 0);
  } else {
    // Track mistake for end-of-lesson review
    lessonMistakes.push({
      q:             q.question || q.q,
      yourAnswer:    q.options[selected],
      correctAnswer: q.options[q.answer],
      explanation:   q.explanation
    });
  }

  logReviewResult(q, correct);
  handleRunMomentum(correct);

  // SVG icons for feedback head
  const okIcon = `<svg viewBox="0 0 24 24" stroke-width="2.2" style="width:13px;height:13px;stroke:currentColor;fill:none"><polyline points="20 6 9 17 4 12"/></svg>`;
  const noIcon = `<svg viewBox="0 0 24 24" stroke-width="2.2" style="width:13px;height:13px;stroke:currentColor;fill:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const ckIcon = `<svg viewBox="0 0 24 24" stroke-width="2.2" style="width:11px;height:11px;stroke:currentColor;fill:none;flex-shrink:0;margin-top:1px"><polyline points="20 6 9 17 4 12"/></svg>`;

  // For incorrect answers, show the correct answer text explicitly
  // so the user doesn't have to search the disabled buttons for the green highlight.
  const correctLine = !correct
    ? `<div style="display:flex;align-items:flex-start;gap:6px;padding:5px 12px 0;
         font-size:0.73rem;font-weight:600;color:var(--green-text,#4ade80);line-height:1.4">
         ${ckIcon}${q.options[q.answer]}
       </div>`
    : '';

  const _correctLabel = correct ? 'Correct' : 'Incorrect';

  document.getElementById('fbBox').innerHTML = `
    <div class="fb-head ${correct ? 'correct' : 'incorrect'}">
      ${correct ? okIcon : noIcon}
      ${_correctLabel}
    </div>
    ${correctLine}
    <div class="fb-body">${q.explanation}</div>`;

  save();
  updateTopbar();
  const _nb = document.getElementById('nextBtn');
  if (_nb) _nb.disabled = false;

  // Disable the hint button — can't use it after answering
  const _hb = document.getElementById('hintBtn');
  if (_hb) { _hb.disabled = true; _hb.style.opacity = '0.3'; _hb.style.cursor = 'default'; }

  // Prevent the expanded feedback box from intercepting clicks on the Next button.
  const _fb = document.getElementById('fbBox');
  if (_fb) _fb.style.pointerEvents = 'none';
}

// ── NEXT STEP ─────────────────────────────────────────────────
// Advance to the next question, or end the quiz.

function nextStep() {
  qIdx++;
  if (qIdx >= currentLesson.questions.length) {
    finishRun();
  } else {
    renderQuestion();
  }
}


// ── FINISH RUN ────────────────────────────────────────────────
// Called when all questions are answered.
// Updates state, then shows the result screen.

function finishRun() {
  const _xpBeforeRun = typeof lessonStartXp === 'number' ? lessonStartXp : S.xp;
  const _questionCount = currentLesson.questions.length;
  const _scorePct = typeof getScorePercentage === 'function'
    ? getScorePercentage(lessonCorrect, _questionCount)
    : (_questionCount ? (lessonCorrect / _questionCount) * 100 : 0);
  const _scorePctRounded = Math.round(_scorePct);
  const _minCorrectToPass = Math.min(
    _questionCount,
    Math.floor((PASSING_SCORE_THRESHOLD * _questionCount) / 100) + 1
  );
  const _moreCorrectNeeded = Math.max(0, _minCorrectToPass - lessonCorrect);
  const _moreCorrectCopy = _moreCorrectNeeded === 1
    ? '1 more correct answer'
    : `${_moreCorrectNeeded} more correct answers`;
  const _passedLesson = mode !== 'lesson'
    || (typeof isPassingScore === 'function'
      ? isPassingScore(lessonCorrect, _questionCount)
      : _scorePct > PASSING_SCORE_THRESHOLD);
  let _completionReward = { baseCash: 0, cashAwarded: 0 };
  let _promotion = null;
  let _fluencyUnlock = null;
  let _streakUpdate = {
    changed: false,
    status: 'unchanged',
    streak: S.streak || 0,
    previousStreak: S.streak || 0
  };

  if (mode === 'lesson') {
    if (_passedLesson) {
      // Mark lesson complete and unlock the next one
      if (!S.completedIds.includes(currentLesson.id)) {
        S.completedIds.push(currentLesson.id);
        S.lastLessonDate = today();
        // Surface the freshly unlocked mastery concept: a brief toast plus a
        // one-shot row highlight the next time the Practice page renders. Fires
        // only at the moment of completion, so it never repeats after refresh.
        if (typeof Practice !== 'undefined' && Practice) {
          const conceptName = typeof Practice.skillName === 'function'
            ? Practice.skillName(currentLesson) : currentLesson.title;
          if (typeof Practice.flagUnlocked === 'function') Practice.flagUnlocked(currentLesson);
          if (typeof showToast === 'function') {
            showToast(`${conceptName} unlocked — practice it anytime`, 'success');
          }
        }
      }
      if (typeof recordLessonCompletionMilestones === 'function') {
        recordLessonCompletionMilestones(S.completedIds.length);
      }
      if (typeof unlockLessonFluencyTerms === 'function') {
        _fluencyUnlock = unlockLessonFluencyTerms(currentLesson.id, { surfacedBy: 'lesson_complete' });
      }
      _streakUpdate = tryIncrementStreak();
      if (_streakUpdate.changed && typeof recordStreakAchievement === 'function') {
        recordStreakAchievement(S.streak);
      }
    }
    const perfect = _passedLesson
      && lessonCorrect === _questionCount
      && lessonMistakes.length === 0;
    if (_passedLesson) {
      _completionReward = awardRewards({
        baseCash: 25,
        source: 'lesson_complete',
        meta: {
          lessonId: currentLesson.id
        }
      });
      lessonBaseCash += _completionReward.baseCash || 0;
      lessonCash += _completionReward.cashAwarded || 0;
      if (perfect && runPerfectBonusXp === 0) {
        const perfectReward = awardRewards({
          baseXp: PERFECT_LESSON_BONUS_XP,
          source: 'perfect_lesson_bonus',
          meta: {
            lessonId: currentLesson.id,
            skipQuestUpdate: true
          }
        });
        runPerfectBonusXp += perfectReward.xpAwarded || 0;
        lessonXp += perfectReward.xpAwarded || 0;
        lessonBaseXp += perfectReward.baseXp || 0;
        if (typeof recordAchievement === 'function') {
          recordAchievement({
            id: 'perfect:first',
            label: 'First Perfect Lesson',
            type: 'perfect',
            earnedAtXp: S.xp,
            meta: { lessonId: currentLesson.id }
          });
        }
      }
    }
    document.getElementById('resultIcon').className = 'result-icon' + (_passedLesson ? ' win' : '');
    document.getElementById('resultIcon').innerHTML = _passedLesson
      ? `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M8 21h8M12 17v4M7 4H4a2 2 0 0 0-2 2v1c0 4.4 2.9 8.2 7 9.5M17 4h3a2 2 0 0 1 2 2v1c0 4.4-2.9 8.2-7 9.5M5 4h14"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5"/><path d="M14.5 9.5l-5 5"/></svg>`;
    document.getElementById('resultTitle').textContent = _passedLesson
      ? 'Lesson Complete'
      : `Review Lesson ${currentLesson.id}`;
    document.getElementById('resultSub').textContent   = perfect
      ? `${currentLesson.title} complete. You answered every quick check correctly.`
      : _passedLesson
        ? `${currentLesson.title} complete. ${lessonCorrect}/${_questionCount} correct.`
        : `${lessonCorrect}/${_questionCount} correct. Review the concept and try again when ready.`;
    if (_passedLesson && (_fluencyUnlock?.introducedCount || 0) > 0) {
      document.getElementById('resultSub').textContent += ` ${_fluencyUnlock.introducedCount} new finance ${_fluencyUnlock.introducedCount === 1 ? 'term is' : 'terms are'} ready to review.`;
    }
  } else {
    if (mode === 'daily') {
      S.dailyOn = today();
      _completionReward = awardRewards({
        baseCash: 50,
        source: 'daily_complete',
        meta: {
          rewardId: `daily-complete:${today()}`
        }
      });
      lessonBaseCash += _completionReward.baseCash || 0;
      lessonCash += _completionReward.cashAwarded || 0;
      document.getElementById('resultIcon').className = 'result-icon win';
      document.getElementById('resultIcon').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
      document.getElementById('resultTitle').textContent = 'Daily Challenge Done';
      document.getElementById('resultSub').textContent   =
        lessonCorrect > 0
          ? `${lessonCorrect}/${currentLesson.questions.length} correct. Come back tomorrow for another concept.`
          : `Today was a useful review. Come back tomorrow for another concept.`;
    } else {
      document.getElementById('resultIcon').className = 'result-icon win';
      document.getElementById('resultIcon').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>`;
      if (mode === 'review') {
        document.getElementById('resultTitle').textContent = 'Review Sprint Complete';
        document.getElementById('resultSub').textContent   =
          lessonCorrect === currentLesson.questions.length
            ? 'All due concepts refreshed.'
            : 'Weak areas were refreshed and rescheduled.';
      } else {
        if (!S.refresherQuiz || typeof S.refresherQuiz !== 'object') {
          S.refresherQuiz = typeof getDefaultRefresherQuiz === 'function'
            ? getDefaultRefresherQuiz()
            : {};
        }
        S.refresherQuiz = {
          ...S.refresherQuiz,
          lastCompletedOn: today(),
          lastQuestionIds: (currentLesson.questions || []).map(question => question?.questionId || question?.id).filter(Boolean),
          updatedAt: new Date().toISOString()
        };
        document.getElementById('resultTitle').textContent = 'Refresher Quiz Complete';
        document.getElementById('resultSub').textContent   =
          lessonCorrect === currentLesson.questions.length
            ? 'You cleared every refresher question.'
            : `${lessonCorrect}/${currentLesson.questions.length} concepts held up.`;
      }
    }
  }

  // ── Streak milestone bonus ────────────────────────────────
  // Only the first qualifying lesson of the day can change the streak,
  // so streak bonuses should only evaluate off a real streak update.
  const _streakBonus = _streakUpdate.changed
    ? (S.streak === 3  ? 25
      : S.streak === 7  ? 50
      : S.streak === 30 ? 200
      : 0)
    : 0;
  if (_streakBonus > 0) {
    const _streakReward = awardRewards({
      baseCash: _streakBonus,
      source: 'streak_bonus',
      meta: {
        rewardId: `streak:${today()}:${S.streak}`
      }
    });
    lessonBaseCash += _streakReward.baseCash || 0;
    lessonCash += _streakReward.cashAwarded || 0;
    setTimeout(() => showToast('Review recorded', 'success'), 1200);
  }

  _promotion = checkPromotion({
    beforeXp: _xpBeforeRun,
    afterXp: S.xp,
    beforeNetWorth: lessonStartNetWorth,
    afterNetWorth: typeof getPortfolioNetWorth === 'function' ? getPortfolioNetWorth() : lessonStartNetWorth
  });
  if (_promotion?.cashBonus) {
    lessonCash += _promotion.cashBonus;
    lessonDirectCashBonus += _promotion.cashBonus;
  }

  // Populate result stats
  document.getElementById('rScore').textContent  = `${_scorePctRounded}%`;
  document.getElementById('rXp').textContent     = `${lessonCorrect}/${_questionCount}`;
  const _rLevelEl = document.getElementById('rLevel');
  if (_rLevelEl) {
    _rLevelEl.textContent  = Array.isArray(S.completedIds) ? S.completedIds.length : 0;
    _rLevelEl.style.color  = 'var(--green-text)';
  }
  document.getElementById('rStreak').textContent = Object.keys(S.mastery || {}).length;
  const _rCash = document.getElementById('rCash');
  if (_rCash) _rCash.textContent = typeof getDueReviews === 'function' ? getDueReviews(50).length : 0;

  const nextLessonBtn = document.getElementById('nextLessonBtn');
  const backHomeBtn = document.getElementById('backHomeBtn');
  const nextAvailableLesson = mode === 'lesson' && typeof getNextAvailableLesson === 'function'
    ? getNextAvailableLesson(S.completedIds, S.user)
    : null;
  if (backHomeBtn) {
    backHomeBtn.onclick = () => {
      showHome();
    };
  }
  if (nextLessonBtn) {
    if (mode === 'lesson' && nextAvailableLesson) {
      const isRetry = !_passedLesson || nextAvailableLesson.id === currentLesson.id;
      nextLessonBtn.disabled = false;
      nextLessonBtn.textContent = isRetry ? 'Retry Lesson' : 'Continue Learning';
      nextLessonBtn.onclick = () => {
        openCourse(nextAvailableLesson.id);
      };
    } else {
      nextLessonBtn.disabled = true;
      nextLessonBtn.textContent = 'Next Lesson';
      nextLessonBtn.onclick = null;
    }
  }

  _renderUpgradeNudge(mode === 'lesson' && _passedLesson ? currentLesson.id : null);
  _renderCompoundingBoostSummary();
  _renderXpProgress();
  _renderMomentumSummary();
  _renderKeepGoingCard({
    show: mode === 'lesson' && _passedLesson,
    nextAvailableLesson,
    lessonCashAwarded: lessonCash
  });
  _renderWrongReview();
  const resultAiCard = document.getElementById('resultAiCard');
  if (resultAiCard) {
    resultAiCard.style.display = mode === 'lesson' && _passedLesson ? 'flex' : 'none';
  }
  const resultAiTools = document.getElementById('resultAiTools');
  if (resultAiTools) {
    resultAiTools.style.display = mode === 'lesson' ? 'flex' : 'none';
  }
  const lessonConfusionCard = document.getElementById('lessonConfusionCard');
  if (lessonConfusionCard) {
    lessonConfusionCard.style.display = mode === 'lesson' ? 'grid' : 'none';
    const input = document.getElementById('lessonConfusionInput');
    if (input) input.value = '';
  }

  // ── Save best score ───────────────────────────────────────
  // Must run before setScreen so currentLesson is still valid.
  const prev = S.bestScores?.[currentLesson.id] || 0;
  if (typeof currentLesson.id === 'number' && lessonCorrect > prev) {
    if (!S.bestScores) S.bestScores = {};
    S.bestScores[currentLesson.id] = lessonCorrect;
  }

  save();
  setScreen('resultScreen', { resetScroll: true });
  setNav(null);
  updateTopbar();
}

// ── UPGRADE NUDGE RENDERER ────────────────────────────────────
// Lazily creates (or finds) #upgradeNudge in the result screen,
// then populates or hides it based on which lesson was just finished.
// Inserted before the Next Lesson button so it reads naturally
// between the stats and the action buttons.

function _renderUpgradeNudge(completedLessonId) {
  const existing = document.getElementById('upgradeNudge');
  if (existing) {
    existing.style.display = 'none';
    existing.innerHTML = '';
  }
  return;
  // Get or create the nudge container
  let nudgeEl = document.getElementById('upgradeNudge');
  if (!nudgeEl) {
    nudgeEl    = document.createElement('div');
    nudgeEl.id = 'upgradeNudge';
    // Insert before the Next Lesson button (sits between stats and actions)
    const nextBtn = document.getElementById('nextLessonBtn');
    if (nextBtn?.parentNode) {
      nextBtn.parentNode.insertBefore(nudgeEl, nextBtn);
    } else {
      document.getElementById('resultScreen')?.appendChild(nudgeEl);
    }
  }

  const nudgeData = completedLessonId ? getResultNudge(completedLessonId) : null;

  if (!nudgeData) {
    nudgeEl.style.display = 'none';
    nudgeEl.innerHTML     = '';
    return;
  }

  const rec      = nudgeData.recommendedLesson;
  const isGold   = rec?.tier === 'gold';
  const gradient = isGold
    ? 'linear-gradient(90deg,#d4a000,#c48a00)'
    : 'linear-gradient(90deg,#3A3F47,#272B31)';
  const tierIcon = isGold
    ? '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
    : '<path d="M12 2L2 9l10 13L22 9z"/>';
  const accentColor = isGold ? 'rgba(212,160,0,0.18)' : 'rgba(217,221,227,0.08)';
  const labelColor  = isGold ? '#c8a020' : '#D9DDE3';

  nudgeEl.style.display = '';
  nudgeEl.innerHTML = `
    <div style="
      margin: 16px 0 8px;
      padding: 14px 16px;
      background: ${accentColor};
      border: 1px solid ${isGold ? 'rgba(212,160,0,0.25)' : 'rgba(58,63,71,0.6)'};
      border-radius: 10px;">

      <div style="
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: ${labelColor};
        margin-bottom: 6px">
        ${nudgeData.headline}
      </div>

      <div style="
        font-size: 0.79rem;
        line-height: 1.5;
        color: var(--text-sub, rgba(255,255,255,0.6));
        margin-bottom: ${rec ? '12px' : '0'}">
        ${nudgeData.body}
      </div>

      ${rec ? `
        <button onclick="openCourse(${rec.id})" style="
          width: 100%;
          padding: 10px 14px;
          border-radius: 8px;
          border: none;
          background: ${gradient};
          color: #fff;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: inherit">
          <svg viewBox="0 0 24 24" width="12" height="12"
               fill="currentColor" stroke="none" style="flex-shrink:0">
            ${tierIcon}
          </svg>
          Preview ${rec.title}
        </button>` : ''}

    </div>`;
}
// ── XP PROGRESS RENDERER ─────────────────────────────────────
function _renderXpProgress() {
  const existing = document.getElementById('resultXpProgress');
  if (existing) {
    existing.style.display = 'none';
    existing.innerHTML = '';
  }
  return;
  let el = document.getElementById('resultXpProgress');
  if (!el) {
    el    = document.createElement('div');
    el.id = 'resultXpProgress';
    const shareWrap = document.getElementById('shareCardWrap');
    if (shareWrap?.parentNode) shareWrap.parentNode.insertBefore(el, shareWrap);
    else document.getElementById('resultScreen')?.appendChild(el);
  }

  const levelSummary = typeof getLevelProgress === 'function' ? getLevelProgress(S.xp) : null;
  if (!levelSummary) { el.style.display = 'none'; return; }

  const barMarkup = `
    <div style="height:5px;border-radius:99px;background:rgba(255,255,255,0.08);overflow:hidden;">
      <div style="height:100%;width:${levelSummary.progressPct}%;border-radius:99px;
          background:var(--green,#00b84a);
          transition:width 0.7s cubic-bezier(0.22,1,0.36,1);"></div>
    </div>`;

  el.style.display = '';
  el.innerHTML = `
    <div style="margin:10px 0 4px;padding:11px 14px;
        background:var(--bg2,rgba(255,255,255,0.04));border-radius:10px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px;">
        <span style="font-size:0.72rem;font-weight:700;
            letter-spacing:0.04em;color:var(--text,#fff)">Level ${levelSummary.level}</span>
        <span style="font-size:0.67rem;
            color:var(--muted,rgba(255,255,255,0.38))">${levelSummary.xpToNextLevel}&thinsp;XP to Level ${levelSummary.nextLevel}</span>
      </div>
      ${barMarkup}
    </div>`;
}

// ── COMPOUNDING BOOST SUMMARY ────────────────────────────────
function _renderCompoundingBoostSummary() {
  const existing = document.getElementById('resultCompoundingBoost');
  if (existing) {
    existing.style.display = 'none';
    existing.innerHTML = '';
  }
  return;
  let el = document.getElementById('resultCompoundingBoost');
  if (!el) {
    el = document.createElement('div');
    el.id = 'resultCompoundingBoost';
    const shareWrap = document.getElementById('shareCardWrap');
    if (shareWrap?.parentNode) shareWrap.parentNode.insertBefore(el, shareWrap);
    else document.getElementById('resultScreen')?.appendChild(el);
  }

  const boostMeta = getCompoundingBoostMeta();
  const boosted   = boostMeta.multiplier > 1;
  const sourceLbl = boostMeta.sourceName;
  const compoundedCash = Math.max(0, lessonCash - lessonDirectCashBonus);
  const baseLine  = lessonBaseXp > 0 || lessonBaseCash > 0
    ? `${lessonBaseXp} XP / $${lessonBaseCash} base -> +${lessonXp} XP / +$${compoundedCash}`
    : boostMeta.nextLevel && boostMeta.nextMultiplier
      ? `Reach Level ${boostMeta.nextLevel} for ${formatMultiplier(boostMeta.nextMultiplier)} rewards.`
      : 'Max compounding advantage active.';

  el.style.display = '';
  el.innerHTML = `
    <div style="margin:10px 0 4px;padding:12px 14px;
        background:${boosted ? 'rgba(0,184,74,0.08)' : 'var(--bg2,rgba(255,255,255,0.04))'};
        border:1px solid ${boosted ? 'rgba(0,184,74,0.18)' : 'var(--border,rgba(255,255,255,0.08))'};
        border-radius:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:0.72rem;font-weight:700;letter-spacing:0.04em;color:var(--text,#fff);">
          ${COMPOUNDING_BOOST_LABEL}
        </span>
        <span style="font-family:var(--font-m);font-size:0.7rem;font-weight:700;
            color:${boosted ? 'var(--green-text,#4ade80)' : 'var(--muted2,rgba(255,255,255,0.45))'};">
          ${formatMultiplier(boostMeta.multiplier)} rewards
        </span>
      </div>
      <div style="font-size:0.72rem;color:var(--text-sub,rgba(255,255,255,0.62));line-height:1.45;">
        ${sourceLbl} bonus active on XP and portfolio cash. ${baseLine}
      </div>
    </div>`;
}

function _renderKeepGoingCard({ show = false, nextAvailableLesson = null, lessonCashAwarded = 0 } = {}) {
  const existing = document.getElementById('keepGoingCard');
  if (existing) {
    existing.style.display = 'none';
    existing.innerHTML = '';
  }
  const nextBtnLegacy = document.getElementById('nextLessonBtn');
  const homeBtnLegacy = document.getElementById('backHomeBtn');
  if (nextBtnLegacy) nextBtnLegacy.style.display = '';
  if (homeBtnLegacy) homeBtnLegacy.style.display = '';
  return;
  let el = document.getElementById('keepGoingCard');
  if (!el) {
    el = document.createElement('div');
    el.id = 'keepGoingCard';
    const shareWrap = document.getElementById('shareCardWrap');
    if (shareWrap?.parentNode) shareWrap.parentNode.insertBefore(el, shareWrap);
    else document.getElementById('resultScreen')?.appendChild(el);
  }

  const actionRow = document.querySelector('#resultScreen .action-row');
  const nextLessonBtn = document.getElementById('nextLessonBtn');
  const backHomeBtn = document.getElementById('backHomeBtn');

  if (!show) {
    el.style.display = 'none';
    el.innerHTML = '';
    if (nextLessonBtn) nextLessonBtn.style.display = '';
    if (backHomeBtn) backHomeBtn.style.display = '';
    if (actionRow) actionRow.classList.remove('action-row-home-only');
    return;
  }

  const dueReviewCount = typeof getDueReviews === 'function' ? getDueReviews(50).length : 0;
  const dailyDone = S.dailyOn === today();
  const reviewFallsBackToCurrentLesson = dueReviewCount === 0;
  const fluencySummary = typeof getFinanceFluencySummary === 'function'
    ? getFinanceFluencySummary()
    : null;
  const fluencyReadyCount = Math.max(0, Number(fluencySummary?.actionCount) || Number(fluencySummary?.dueCount) || 0);
  const continueLabel = nextAvailableLesson && nextAvailableLesson.id !== currentLesson?.id
    ? `Continue Learning ${FinLingoIcons.right()}`
    : `Keep Learning ${FinLingoIcons.right()}`;
  const reviewSub = reviewFallsBackToCurrentLesson
    ? 'Revisit this lesson once more'
    : 'Strengthen what you learned';
  const fluencySub = fluencyReadyCount > 0
    ? `${fluencyReadyCount} ${fluencyReadyCount === 1 ? 'term' : 'terms'} ready to train`
    : 'Turn lesson concepts into fast recall';

  if (nextLessonBtn) nextLessonBtn.style.display = 'none';
  if (backHomeBtn) {
    backHomeBtn.style.display = '';
    backHomeBtn.textContent = 'Home';
  }
  if (actionRow) actionRow.classList.add('action-row-home-only');

  el.style.display = '';
  el.innerHTML = `
    <div class="keep-going-card">
      <div class="keep-going-kicker">Keep Going</div>
      <div class="keep-going-title">Lesson Complete</div>
      <div class="keep-going-sub">You earned +${lessonXp} XP and $${lessonCashAwarded}. Keep the momentum rolling.</div>
      <button class="btn btn-primary keep-going-primary" data-keep-going="continue">${continueLabel}</button>
      <div class="keep-going-actions">
        <button class="keep-going-action" data-keep-going="daily" ${dailyDone ? 'disabled' : ''}>
          <span class="keep-going-action-label">Daily Question</span>
          <span class="keep-going-action-sub">${dailyDone ? 'Done for today' : "Take today's 3-try challenge"}</span>
        </button>
        <button class="keep-going-action" data-keep-going="review">
          <span class="keep-going-action-label">Quick Review</span>
          <span class="keep-going-action-sub">${reviewSub}</span>
        </button>
        ${fluencySummary?.totalTerms ? `
          <button class="keep-going-action" data-keep-going="fluency">
            <span class="keep-going-action-label">Finance Fluency</span>
            <span class="keep-going-action-sub">${fluencySub}</span>
          </button>` : ''}
      </div>
      ${lessonCashAwarded > 0 ? `
        <button class="keep-going-invest" data-keep-going="invest">
          <span class="keep-going-invest-label">You earned $${lessonCashAwarded} to invest.</span>
          <span class="keep-going-invest-cta">Invest It ${FinLingoIcons.right()}</span>
        </button>` : ''}
    </div>`;

  const leaveResult = action => {
    action();
  };

  el.querySelector('[data-keep-going="continue"]')?.addEventListener('click', () => {
    leaveResult(() => {
      if (nextAvailableLesson && nextAvailableLesson.id !== currentLesson?.id) {
        openCourse(nextAvailableLesson.id);
      } else if (dueReviewCount > 0) {
        startReviewSprint(Math.min(5, dueReviewCount));
      } else {
        showPath();
      }
    });
  });

  el.querySelector('[data-keep-going="daily"]')?.addEventListener('click', () => {
    if (dailyDone) return;
    leaveResult(() => startDaily());
  });

  el.querySelector('[data-keep-going="review"]')?.addEventListener('click', () => {
    leaveResult(() => {
      if (dueReviewCount > 0) startReviewSprint(Math.min(5, dueReviewCount));
      else if (typeof currentLesson?.id === 'number') openCourse(currentLesson.id);
      else showPath();
    });
  });

  el.querySelector('[data-keep-going="fluency"]')?.addEventListener('click', () => {
    leaveResult(() => {
      if (typeof openFinanceFluencySession === 'function') {
        openFinanceFluencySession();
      } else {
        showHome();
      }
    });
  });

  el.querySelector('[data-keep-going="invest"]')?.addEventListener('click', () => {
    leaveResult(() => {
      if (typeof openMarketFeatureEntry === 'function') {
        openMarketFeatureEntry('portfolio-simulator');
      } else {
        showMarket();
      }
    });
  });
}

function _renderMomentumSummary() {
  const existing = document.getElementById('resultMomentum');
  if (existing) {
    existing.style.display = 'none';
    existing.innerHTML = '';
  }
  return;
  let el = document.getElementById('resultMomentum');
  if (!el) {
    el = document.createElement('div');
    el.id = 'resultMomentum';
    const shareWrap = document.getElementById('shareCardWrap');
    if (shareWrap?.parentNode) shareWrap.parentNode.insertBefore(el, shareWrap);
    else document.getElementById('resultScreen')?.appendChild(el);
  }

  const rows = [];
  if (runMomentumBonusXp > 0) {
    rows.push({
      label: 'Hot Streak',
      value: `+${runMomentumBonusXp} XP`,
      sub: `${HOT_STREAK_TRIGGER} correct in a row`
    });
  } else if (runBestCorrectStreak >= 3) {
    rows.push({
      label: 'Best Run',
      value: `${runBestCorrectStreak}x`,
      sub: 'correct in a row'
    });
  }

  if (runPerfectBonusXp > 0) {
    rows.push({
      label: 'Perfect Lesson',
      value: `+${runPerfectBonusXp} XP`,
      sub: 'no mistakes this run'
    });
  }

  if (!rows.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = '';
  el.innerHTML = `
    <div class="result-momentum-card">
      <div class="result-momentum-header">
        <span>Momentum</span>
        <span>${runBestCorrectStreak > 1 ? `${runBestCorrectStreak} best streak` : 'Run summary'}</span>
      </div>
      <div class="result-momentum-grid">
        ${rows.map(row => `
          <div class="result-momentum-item">
            <div class="result-momentum-label">${row.label}</div>
            <div class="result-momentum-value">${row.value}</div>
            <div class="result-momentum-sub">${row.sub}</div>
          </div>`).join('')}
      </div>
    </div>`;
}


// ── WRONG ANSWER REVIEW RENDERER ─────────────────────────────
function _renderWrongReview() {
  let el = document.getElementById('wrongReview');
  if (!el) {
    el    = document.createElement('div');
    el.id = 'wrongReview';
    const actionRow = document.querySelector('#resultScreen .action-row');
    if (actionRow?.parentNode) actionRow.parentNode.insertBefore(el, actionRow);
    else document.getElementById('resultScreen')?.appendChild(el);
  }

  if (mode !== 'lesson' || lessonMistakes.length === 0) {
    el.style.display = 'none';
    el.innerHTML     = '';
    return;
  }

  const count = lessonMistakes.length;
  const label = count === 1 ? '1 question to review' : `${count} questions to review`;
  const ckSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"
    style="width:11px;height:11px;flex-shrink:0;margin-top:1px"><polyline points="20 6 9 17 4 12"/></svg>`;
  const xSvg  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"
    style="width:11px;height:11px;flex-shrink:0;margin-top:1px">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  el.style.display = '';
  el.innerHTML = `
    <div style="margin:8px 0 4px;">
      <button onclick="_toggleWrongReview(this)" style="
          width:100%;padding:10px 14px;
          background:rgba(229,53,53,0.07);
          border:1px solid rgba(229,53,53,0.18);
          border-radius:10px;
          color:var(--red-text,#f87171);
          font-size:0.78rem;font-weight:600;
          cursor:pointer;font-family:inherit;
          display:flex;align-items:center;justify-content:space-between;">
        <span style="display:flex;align-items:center;gap:7px;">${xSvg}${label}</span>
        <span class="wr-chev" style="font-size:0.65rem;opacity:0.55;
            transition:transform 0.2s;display:inline-block">▾</span>
      </button>
      <div class="wr-items" style="display:none;margin-top:3px;">
        ${lessonMistakes.map(m => `
          <div style="margin-top:3px;padding:12px 14px;
              background:var(--bg2,rgba(255,255,255,0.04));
              border-radius:8px;border-left:3px solid rgba(229,53,53,0.35);">
            <div style="font-size:0.75rem;font-weight:600;
                color:var(--text,#fff);margin-bottom:9px;line-height:1.45">${m.q}</div>
            <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:5px;
                font-size:0.72rem;color:var(--red-text,#f87171)">${xSvg}${m.yourAnswer}</div>
            <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:9px;
                font-size:0.72rem;font-weight:600;color:var(--green-text,#4ade80)">${ckSvg}${m.correctAnswer}</div>
            <div style="font-size:0.7rem;line-height:1.55;
                color:var(--muted,rgba(255,255,255,0.42))">${m.explanation}</div>
          </div>`).join('')}
      </div>
    </div>`;
}


// ── WRONG REVIEW TOGGLE ───────────────────────────────────────
function _toggleWrongReview(btn) {
  const items = btn.parentElement.querySelector('.wr-items');
  const chev  = btn.querySelector('.wr-chev');
  if (!items) return;
  const open = items.style.display !== 'none';
  items.style.display         = open ? 'none'           : 'block';
  if (chev) chev.style.transform = open ? ''            : 'rotate(180deg)';
}
// ── HINTS ─────────────────────────────────────────────────────
// Lesson questions start with 1 free hint. After that hint is used,
// the user can buy 1 additional hint for $25. Each hint removes up to
// 2 remaining wrong answer choices for the current question.

function buyExtraHint() {
  showToast('One hint is available for each question.');
  renderHintRow();
}

function useHint() {
  if (locked) return;
  if (hintPurchasePending || hintUsesRemaining <= 0) return;

  hintUsesRemaining = Math.max(0, hintUsesRemaining - 1);

  // Find currently remaining wrong answer indices, shuffle, take up to 2 to eliminate.
  const wrong = _getRemainingHintChoiceIndexes();
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  wrong.slice(0, 2).forEach(i => {
    const btn = document.getElementById(`c${i}`);
    if (!btn) return;
    btn.disabled          = true;
    btn.style.opacity     = '0.2';
    btn.style.pointerEvents = 'none';
  });

  renderHintRow();
}
