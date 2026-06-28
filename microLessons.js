// FinLingo — micro-lesson player.
//
// One unified player for preset AND AI-generated units (both normalized by
// microUnits.js). Flow: slides → quick check → feedback → next lesson → recap.
// Lesson-level progress is saved
// continuously so the learner can leave and resume. No XP/streaks/lives/timers.

(function (global) {
  'use strict';

  const PKEY = 'finlingo_micro_progress_v1';

  let _unit = null;
  let _progress = null;
  let _phase = 'slides';   // slides | question | feedback | recap_intro | recap | complete | review_detail
  let _index = 0;          // lesson index (lesson/check) or recap question index
  let _slideIndex = 0;
  let _selectedAnswer = null;
  let _selectedRecapAnswer = null;
  let _reviewMode = false;

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Progress storage ────────────────────────────────────────────────
  function _allProgress() {
    try {
      const raw = localStorage.getItem(PKEY);
      const p = raw ? JSON.parse(raw) : {};
      return (p && typeof p === 'object') ? p : {};
    } catch { return {}; }
  }
  function _loadProgress(id) {
    const p = _allProgress()[id] || {};
    const phase = p.currentPhase === 'lesson' ? 'slides'
      : p.currentPhase === 'check' ? 'question'
      : p.currentPhase === 'done' ? 'complete'
      : p.currentPhase;
    const progress = {
      currentLessonIndex: Number(p.currentLessonIndex) || 0,
      currentSlideIndex: Number(p.currentSlideIndex) || 0,
      currentPhase: ['slides', 'question', 'feedback', 'recap_intro', 'recap', 'complete', 'review_detail'].includes(phase) ? phase : 'slides',
      completedLessonIds: Array.isArray(p.completedLessonIds) ? p.completedLessonIds : [],
      quickCheckAnswers: (p.quickCheckAnswers && typeof p.quickCheckAnswers === 'object') ? p.quickCheckAnswers : {},
      recapAnswers: (p.recapAnswers && typeof p.recapAnswers === 'object') ? p.recapAnswers : {},
      recapResultAnswers: (p.recapResultAnswers && typeof p.recapResultAnswers === 'object') ? p.recapResultAnswers : null,
      legacyCompleted: Boolean(p.completed),
      completed: Boolean(p.completed && (p.recapResultAnswers || p.latestScore)),
      latestScore: p.latestScore && typeof p.latestScore === 'object' ? p.latestScore : null,
      bestScore: p.bestScore && typeof p.bestScore === 'object' ? p.bestScore : null,
      missedConcepts: Array.isArray(p.missedConcepts) ? p.missedConcepts : [],
      attempts: Array.isArray(p.attempts) ? p.attempts : [],
      lastOpenedAt: p.lastOpenedAt || null,
      completedAt: p.completedAt || null,
      startedAt: p.startedAt || null,
      updatedAt: p.updatedAt || null
    };
    const hasMeaningfulProgress = progress.completedLessonIds.length > 0
      || Object.keys(progress.quickCheckAnswers).length > 0
      || Object.keys(progress.recapAnswers).length > 0
      || progress.currentLessonIndex > 0
      || progress.currentSlideIndex > 0
      || ['question', 'feedback', 'recap_intro', 'recap'].includes(progress.currentPhase);
    if (!progress.startedAt && hasMeaningfulProgress) {
      progress.startedAt = progress.updatedAt || new Date().toISOString();
    }
    return progress;
  }
  function _saveProgress() {
    if (!_unit || !_progress) return;
    if (_reviewMode) return;
    _progress.unitId = _unit.id;
    _progress.currentLessonIndex = (_phase === 'recap_intro' || _phase === 'recap' || _phase === 'complete') ? _unit.lessons.length : _index;
    _progress.currentSlideIndex = _phase === 'slides' ? _slideIndex : 0;
    _progress.currentPhase = _phase;
    _progress.updatedAt = new Date().toISOString();
    const all = _allProgress();
    all[_unit.id] = _progress;
    try { localStorage.setItem(PKEY, JSON.stringify(all)); } catch {}
  }

  function _migrateProgress(unit) {
    if (!_progress || !unit) return;
    const recap = Array.isArray(unit.recapQuiz) ? unit.recapQuiz : [];
    const submitted = _progress.recapResultAnswers || (
      _progress.legacyCompleted && recap.length > 0 && Object.keys(_progress.recapAnswers).length >= recap.length
        ? Object.assign({}, _progress.recapAnswers)
        : null
    );
    if (submitted && recap.length) {
      _progress.recapResultAnswers = submitted;
      let correct = 0;
      const missed = [];
      recap.forEach((q, i) => {
        if (Number(submitted[i]) === Number(q.correctAnswerIndex)) correct += 1;
        else missed.push(unit.lessons[i]?.title || q.prompt);
      });
      const completedAt = _progress.completedAt || _progress.updatedAt || new Date().toISOString();
      const migratedScore = { correct, total: recap.length, completedAt };
      if (!_progress.latestScore) _progress.latestScore = migratedScore;
      if (!_progress.bestScore || correct > Number(_progress.bestScore.correct)) _progress.bestScore = migratedScore;
      if (!_progress.missedConcepts.length) _progress.missedConcepts = missed.slice(0, 3);
      if (!_progress.attempts.length) _progress.attempts = [_progress.latestScore];
      _progress.completedAt = completedAt;
      _progress.completed = true;
    } else if (!recap.length && _progress.legacyCompleted) {
      _progress.completed = true;
      _progress.completedAt = _progress.completedAt || _progress.updatedAt || new Date().toISOString();
    }
    delete _progress.legacyCompleted;
  }

  // Public read-only helper for the Learn page (resume label / counts).
  function summary(unitId, normalizedUnit) {
    const p = _allProgress()[unitId];
    const total = normalizedUnit && normalizedUnit.lessons ? normalizedUnit.lessons.length : 0;
    if (!p) return { status: 'not_started', started: false, completed: false, completedCount: 0, total: total, updatedAt: null };
    const completedIds = Array.isArray(p.completedLessonIds) ? p.completedLessonIds : [];
    const completedCount = completedIds.length || Object.keys(p.quickCheckAnswers || {}).length;
    const recapTotal = normalizedUnit && Array.isArray(normalizedUnit.recapQuiz) ? normalizedUnit.recapQuiz.length : 0;
    const recapAnswers = p.recapAnswers && typeof p.recapAnswers === 'object' ? p.recapAnswers : {};
    const recapResult = p.recapResultAnswers && typeof p.recapResultAnswers === 'object'
      ? p.recapResultAnswers
      : (p.completed && recapTotal > 0 && Object.keys(recapAnswers).length >= recapTotal ? recapAnswers : null);
    const completed = Boolean(p.completed && (recapTotal === 0 || recapResult || p.latestScore));
    const started = Boolean(p.startedAt || p.lastOpenedAt || completedCount > 0 || Object.keys(recapAnswers).length > 0 || completed);
    const lessonsComplete = total > 0 && completedCount >= total;
    let derivedCorrect = 0;
    if (recapResult && normalizedUnit && Array.isArray(normalizedUnit.recapQuiz)) {
      normalizedUnit.recapQuiz.forEach((q, i) => {
        if (Number(recapResult[i]) === Number(q.correctAnswerIndex)) derivedCorrect += 1;
      });
    }
    const latestScore = p.latestScore && typeof p.latestScore === 'object'
      ? p.latestScore
      : (completed && recapResult ? { correct: derivedCorrect, total: recapTotal, completedAt: p.completedAt || p.updatedAt || null } : null);
    const bestScore = p.bestScore && typeof p.bestScore === 'object' ? p.bestScore : latestScore;
    const latestCorrect = latestScore ? Number(latestScore.correct) || 0 : null;
    const latestTotal = latestScore ? Number(latestScore.total) || recapTotal : recapTotal;
    const reviewRecommended = completed && latestTotal > 0 && (latestCorrect <= 1 || (latestCorrect / latestTotal) < 0.5);
    const status = completed
      ? (reviewRecommended ? 'completed_review' : 'completed')
      : lessonsComplete && recapTotal > 0 ? 'recap_pending'
        : started ? 'in_progress' : 'not_started';
    return {
      status,
      started,
      completed,
      completedCount: completedCount,
      total: total,
      lessonsComplete,
      recapCompleted: completed,
      currentLessonIndex: Math.max(0, Math.min(total - 1, Number(p.currentLessonIndex) || 0)),
      currentSlideIndex: Math.max(0, Number(p.currentSlideIndex) || 0),
      latestScore,
      bestScore,
      missedConcepts: Array.isArray(p.missedConcepts) ? p.missedConcepts : [],
      attempts: Array.isArray(p.attempts) ? p.attempts.length : (completed ? 1 : 0),
      lastOpenedAt: p.lastOpenedAt || p.updatedAt || null,
      completedAt: p.completedAt || null,
      updatedAt: p.updatedAt || null
    };
  }

  // Canonical completion rule, shared by every consumer (the Learn page).
  // A unit counts as complete ONLY when the player set its `completed` flag,
  // which happens after the last lesson AND the recap (if any) are finished —
  // never merely from opening the final lesson. Legacy/ambiguous progress that
  // lacks the flag stays "in progress" by design.
  function isComplete(unitId, normalizedUnit) {
    return summary(unitId, normalizedUnit).completed === true;
  }

  // ── Resume logic ────────────────────────────────────────────────────
  function _resume() {
    const p = _progress;
    if (p.completed) {
      _phase = 'review_detail';
      _index = 0;
      _slideIndex = 0;
      return;
    }
    // Legacy progress marked completion by answer; fold that into the new
    // completedLessonIds list so old progress does not reopen finished checks.
    Object.keys(p.quickCheckAnswers || {}).forEach(lessonId => {
      if (p.completedLessonIds.indexOf(lessonId) === -1) p.completedLessonIds.push(lessonId);
    });
    const li = _unit.lessons.findIndex(l => {
      return p.completedLessonIds.indexOf(l.id) === -1;
    });
    if (li === -1) {
      const ri = _unit.recapQuiz.findIndex((q, i) => !(i in p.recapAnswers));
      if (!_unit.recapQuiz.length || ri === -1) { _phase = 'complete'; _index = 0; }
      else { _phase = p.currentPhase === 'recap' ? 'recap' : 'recap_intro'; _index = Math.max(0, ri); }
      _slideIndex = 0;
    } else {
      _index = li;
      if (p.currentLessonIndex === li && ['slides', 'question', 'feedback'].includes(p.currentPhase)) {
        _phase = p.currentPhase;
        _slideIndex = Math.max(0, Math.min(Number(p.currentSlideIndex) || 0, Math.max(0, (_unit.lessons[li].slides || []).length - 1)));
      } else {
        _phase = 'slides';
        _slideIndex = 0;
      }
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────
  function _activate() {
    if (typeof setScreen === 'function') {
      setScreen('microLessonScreen', { resetScroll: true });
      if (typeof setNav === 'function') setNav('navPath');
    } else {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const s = document.getElementById('microLessonScreen');
      if (s) s.classList.add('active');
    }
  }

  // Dev diagnostics: enable with localStorage.setItem('finlingo_debug','1').
  function _debug() {
    try { return localStorage.getItem('finlingo_debug') === '1'; } catch { return false; }
  }
  function _diag(unit) {
    if (!_debug() || !unit) return;
    const l0 = (unit.lessons || [])[0] || {};
    /* eslint-disable no-console */
    console.debug('[micro-unit]', {
      unitId: unit.id,
      lessons: (unit.lessons || []).length,
      firstLesson: l0,
      slides: Array.isArray(l0.slides) ? l0.slides.length : 0,
      hasQuestion: !!l0.question,
      questionChoices: l0.question && Array.isArray(l0.question.choices) ? l0.question.choices.length : 0,
      recap: (unit.recapQuiz || []).length,
      phase: _phase,
      slideIndex: _slideIndex
    });
  }

  let _pendingUpgrade = null; // raw saved unit awaiting an upgrade retry

  function openMicroUnit(arg) {
    const data = global.MicroData;
    let unit = null;
    let rawSaved = null;
    if (typeof arg === 'string') {
      rawSaved = (global.CoachUnits && typeof global.CoachUnits.get === 'function') ? global.CoachUnits.get(arg) : null;
      unit = data ? data.getMicroUnit(arg) : null;
    } else if (arg) {
      rawSaved = arg;
      unit = data ? data.normalizeUnit(arg) : arg;
    }
    // Could not load / normalize into usable lessons → in-Learn error state.
    // Never route back to the source chat as a fallback.
    if (!unit || !Array.isArray(unit.lessons) || !unit.lessons.length) {
      _unit = null;
      _activate();
      _renderError();
      return;
    }

    // Validate. An incomplete unit (e.g. an OLD unit that only had
    // title+description and no quick checks) must NOT be played — that is what
    // caused fake completion. Prefer a one-time automatic upgrade; fall back to
    // a clear "needs update" state. Never silently advance through descriptions.
    const v = data && typeof data.validateUnit === 'function' ? data.validateUnit(unit) : { ok: true, reasons: [] };
    if (_debug() && !v.ok) console.debug('[micro-unit] incomplete:', unit.id, v.reasons);
    if (!v.ok) {
      _pendingUpgrade = rawSaved || arg;
      _unit = null;
      _activate();
      const canUpgrade = _upgradeTopic(_pendingUpgrade);
      if (canUpgrade) _runUpgrade();
      else _renderNeedsUpdate();
      return;
    }

    _unit = unit;
    _progress = _loadProgress(unit.id);
    _migrateProgress(unit);
    _reviewMode = false;
    _resume();
    const now = new Date().toISOString();
    _progress.lastOpenedAt = now;
    if (!_progress.startedAt) _progress.startedAt = now;
    _saveProgress();
    _diag(unit);
    _activate();
    _render();
    // Let other surfaces (e.g. the Market Learn-next card) link to this unit.
    try { global.dispatchEvent(new CustomEvent('finlingo:micro-unit-opened', { detail: { unitId: unit.id } })); } catch (_) {}
  }

  function currentUnitId() { return _unit ? _unit.id : null; }

  // ── One-time upgrade of older/incomplete generated units ────────────
  function _upgradeTopic(raw) {
    if (!raw || typeof raw !== 'object') return '';
    return _str(raw.topic) || _str(raw.quizTopic) || _str(raw.title) || '';
  }
  function _str(v) { return (v == null ? '' : String(v)).trim(); }
  function _cleanListItem(value) {
    if (global.MicroData && typeof global.MicroData.cleanGeneratedListItem === 'function') {
      return global.MicroData.cleanGeneratedListItem(value);
    }
    return _str(value).replace(/^(?:[•●]\s*|[*]\s+|[-–—]\s+|\d+[.)]\s+)/, '').trim();
  }

  async function _runUpgrade() {
    const raw = _pendingUpgrade;
    const topic = _upgradeTopic(raw);
    if (!topic) { _renderNeedsUpdate(); return; }
    _renderUpgrading(_str(raw.title) || topic);
    try {
      const titles = (raw.lessons || []).map(l => (typeof l === 'string' ? l : _str(l && l.title))).filter(Boolean);
      const prompt = `Build a complete beginner finance mini-unit on: ${topic}. Return slide-based lessons with 2-4 teaching slides before each quick check.`
        + (titles.length ? ` Keep these lesson titles where sensible: ${titles.join('; ')}.` : '');
      const res = await fetch('/api/ask-finlingo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          mode: 'build_unit',
          topic: topic,
          topicScope: 'medium',
          selectedDepth: 'standard',
          recommendedDepth: 'standard',
          lessonRange: { min: Math.max(3, Math.min(5, titles.length || 4)), max: Math.max(5, Math.min(7, titles.length || 5)) },
          targetLessonCount: Math.max(5, Math.min(7, titles.length || 5)),
          context: 'Upgrade a saved unit into complete slide-based lessons. Preserve the user-visible topic and use the supplied old lesson titles when sensible. Each lesson needs 2-4 slides, a quick check, and the unit needs a 3-question recap.',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.result) throw new Error(payload.error || 'Upgrade failed');
      const data = global.MicroData;
      const norm = data.normalizeUnitToSlideFormat(Object.assign({}, payload.result, { id: raw.id, title: raw.title || payload.result.unitTitle, source: 'ask' }));
      const v = data.validateUnit(norm);
      if (!v.ok) throw new Error('Upgraded unit still incomplete');
      const upgraded = {
        id: raw.id,
        title: norm.title,
        description: norm.description || raw.description || '',
        lessons: norm.lessons,
        recapQuiz: norm.recapQuiz,
        topic: raw.topic || topic,
        quizTopic: raw.quizTopic || norm.title,
        sourceChatId: raw.sourceChatId || '',
        createdAt: raw.createdAt || new Date().toISOString(),
        upgradedAt: new Date().toISOString(),
        savedToLearn: true,
        source: 'ask'
      };
      if (global.CoachUnits && typeof global.CoachUnits.save === 'function') global.CoachUnits.save(upgraded);
      try { global.dispatchEvent(new CustomEvent('finlingo:custom-units-updated')); } catch (_) {}
      _pendingUpgrade = null;
      // Fresh progress (old lesson ids no longer match) → start clean.
      if (global.MicroProgress && typeof global.MicroProgress.remove === 'function') global.MicroProgress.remove(raw.id);
      _unit = norm;
      _progress = _loadProgress(norm.id);
      _resume();
      _diag(norm);
      _render();
    } catch (err) {
      if (_debug()) console.debug('[micro-unit] upgrade failed:', err && err.message);
      _renderNeedsUpdate();
    }
  }

  function upgrade() { if (_pendingUpgrade) _runUpgrade(); }

  function _errorShell(inner) {
    return `
      <div class="ml-shell">
        <header class="ml-top">
          <button type="button" class="ml-back" aria-label="Back to Learn" onclick="MicroUnit.back()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span class="ml-progress-label">Unit</span>
          <span class="ml-top-spacer" aria-hidden="true"></span>
        </header>
        <main class="ml-body">${inner}</main>
      </div>`;
  }

  function _renderError() {
    const root = document.getElementById('microUnitRoot');
    if (!root) { if (typeof showLearn === 'function') showLearn(); return; }
    root.innerHTML = _errorShell(`
      <div class="ml-error">
        <h1>This unit could not be loaded.</h1>
        <p>Its lesson data may be missing or in an older format.</p>
        <button type="button" class="ml-continue" onclick="MicroUnit.back()">Back to Your Units</button>
      </div>`);
  }

  function _renderUpgrading(title) {
    const root = document.getElementById('microUnitRoot');
    if (!root) return;
    root.innerHTML = _errorShell(`
      <div class="ml-error">
        <div class="ml-upgrade-spinner"><span class="mc-spinner" aria-hidden="true"></span></div>
        <h1>Updating your unit…</h1>
        <p>Building slide-based lessons and quick checks for ${esc(title)}.</p>
      </div>`);
  }

  function _renderNeedsUpdate() {
    const root = document.getElementById('microUnitRoot');
    if (!root) { if (typeof showLearn === 'function') showLearn(); return; }
    root.innerHTML = _errorShell(`
      <div class="ml-error">
        <h1>This unit needs a quick update.</h1>
        <p>It was saved before slide-based lessons were added. Updating keeps the same unit and fills in the missing lesson content.</p>
        <button type="button" class="ml-continue" onclick="MicroUnit.upgrade()">Update unit</button>
        <button type="button" class="ml-secondary" onclick="MicroUnit.back()">Back to Your Units</button>
      </div>`);
  }

  function back() {
    _saveProgress();
    if (typeof showLearn === 'function') showLearn({ resetScroll: true });
  }

  // ── Step handlers ───────────────────────────────────────────────────
  function continueSlide() {
    const lesson = _unit.lessons[_index];
    const slides = lesson && Array.isArray(lesson.slides) ? lesson.slides : [];
    if (!lesson || !slides.length) return;
    if (_slideIndex < slides.length - 1) {
      _slideIndex += 1;
      _phase = 'slides';
    } else {
      _phase = 'question';
      _slideIndex = 0;
      _selectedAnswer = null;
    }
    _saveProgress();
    _render();
  }

  function continueReview() {
    if (!_reviewMode || !_unit) return;
    const lesson = _unit.lessons[_index];
    const slides = lesson && Array.isArray(lesson.slides) ? lesson.slides : [];
    if (_slideIndex < slides.length - 1) {
      _slideIndex += 1;
    } else if (_index < _unit.lessons.length - 1) {
      _index += 1;
      _slideIndex = 0;
    } else {
      _reviewMode = false;
      _phase = 'review_detail';
    }
    _render();
  }

  function prevReview() {
    if (!_reviewMode || !_unit) return;
    if (_slideIndex > 0) {
      _slideIndex -= 1;
    } else if (_index > 0) {
      _index -= 1;
      const slides = _unit.lessons[_index].slides || [];
      _slideIndex = Math.max(0, slides.length - 1);
    }
    _render();
  }

  function continueLesson() {
    continueSlide();
  }

  // Back arrow — previous slide within the current lesson only. Never steps
  // back into a previous lesson or replays a completed quick check. Completed
  // progress is untouched (we only move _slideIndex).
  function prevSlide() {
    if (_phase !== 'slides') return;
    if (_slideIndex > 0) {
      _slideIndex -= 1;
      _saveProgress();
      _render();
    }
  }

  function selectAnswer(choiceIndex) {
    const lesson = _unit.lessons[_index];
    if (!lesson || !lesson.question || _phase !== 'question') return;
    if (lesson.id in _progress.quickCheckAnswers) return;
    _selectedAnswer = Number(choiceIndex);
    _render();
  }

  function checkAnswer() {
    const lesson = _unit.lessons[_index];
    if (!lesson || !lesson.question || _phase !== 'question') return;
    if (!Number.isInteger(_selectedAnswer)) return;
    _progress.quickCheckAnswers[lesson.id] = _selectedAnswer;
    _phase = 'feedback';
    _saveProgress();
    _render();
  }

  function continueAfterFeedback() {
    const lesson = _unit.lessons[_index];
    if (lesson && _progress.completedLessonIds.indexOf(lesson.id) === -1) {
      _progress.completedLessonIds.push(lesson.id);
    }
    _selectedAnswer = null;
    _advanceLesson();
  }

  function answer(choiceIndex) {
    if (_phase === 'question') {
      selectAnswer(choiceIndex);
      return;
    }
  }

  function continueAfterCheck() {
    continueAfterFeedback();
  }

  function _advanceLesson() {
    if (_index < _unit.lessons.length - 1) {
      _index += 1;
      _slideIndex = 0;
      _phase = 'slides';
    } else if (_unit.recapQuiz.length) {
      _phase = 'recap_intro';
      _index = 0;
      _selectedRecapAnswer = null;
    } else {
      _complete();
    }
    _saveProgress();
    _render();
  }

  function answerRecap(choiceIndex) {
    if (_phase !== 'recap' || _index in _progress.recapAnswers) return;
    _selectedRecapAnswer = Number(choiceIndex);
    _render();
  }

  function startRecap() {
    if (!_unit || !_unit.recapQuiz.length) return;
    _phase = 'recap';
    _index = _unit.recapQuiz.findIndex((q, i) => !(i in _progress.recapAnswers));
    if (_index < 0) _index = 0;
    _selectedRecapAnswer = null;
    _saveProgress();
    _render();
  }

  function retakeRecap() {
    if (!_unit || !_unit.recapQuiz.length) return;
    _progress.recapAnswers = {};
    _progress.recapResultAnswers = null;
    _progress.completed = false;
    _progress.currentPhase = 'recap';
    startRecap();
  }

  function checkRecap() {
    if (_phase !== 'recap' || _index in _progress.recapAnswers || !Number.isInteger(_selectedRecapAnswer)) return;
    _progress.recapAnswers[_index] = _selectedRecapAnswer;
    _selectedRecapAnswer = null;
    _saveProgress();
    _render();
  }

  function continueRecap() {
    if (!(_index in _progress.recapAnswers)) return;
    if (_index < _unit.recapQuiz.length - 1) {
      _index += 1;
      _selectedRecapAnswer = null;
      _saveProgress();
      _render();
    } else {
      _complete();
      _render();
    }
  }

  function _complete() {
    if (_unit && _unit.recapQuiz.length) {
      _progress.recapResultAnswers = Object.assign({}, _progress.recapAnswers);
      const total = _unit.recapQuiz.length;
      let correct = 0;
      const missed = [];
      _unit.recapQuiz.forEach((q, i) => {
        if (Number(_progress.recapResultAnswers[i]) === Number(q.correctAnswerIndex)) correct += 1;
        else missed.push(_unit.lessons[i]?.title || q.prompt);
      });
      const score = { correct, total, completedAt: new Date().toISOString() };
      _progress.latestScore = score;
      if (!_progress.bestScore || correct > Number(_progress.bestScore.correct)) {
        _progress.bestScore = score;
      }
      _progress.missedConcepts = missed.slice(0, 3);
      _progress.attempts = Array.isArray(_progress.attempts) ? _progress.attempts : [];
      _progress.attempts.push(score);
      _progress.completedAt = score.completedAt;
    }
    _progress.completed = true;
    _phase = 'complete';
    _saveProgress();
  }

  function review() {
    reviewUnit();
  }

  function reviewUnit() {
    if (!_unit) return;
    _reviewMode = true;
    _index = 0;
    _slideIndex = 0;
    _selectedAnswer = null;
    _selectedRecapAnswer = null;
    _phase = 'slides';
    _render();
  }

  function reviewMissed() {
    if (!_unit || !_unit.recapQuiz.length) { review(); return; }
    const resultAnswers = _progress.recapResultAnswers || _progress.recapAnswers;
    const missed = _unit.recapQuiz.findIndex((q, i) => Number(resultAnswers[i]) !== Number(q.correctAnswerIndex));
    if (missed >= 0) {
      _progress.recapAnswers = Object.assign({}, resultAnswers);
      _phase = 'recap';
      _index = missed;
      _selectedRecapAnswer = null;
      _render();
      return;
    }
    review();
  }

  function showReviewDetail() {
    _reviewMode = false;
    _phase = 'review_detail';
    _render();
  }

  function confirmStartOver() {
    let overlay = document.getElementById('unitStartOverOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'unitStartOverOverlay';
      overlay.className = 'unit-confirm-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="unit-confirm-backdrop" onclick="MicroUnit.closeStartOver()"></div>
      <div class="unit-confirm" role="dialog" aria-modal="true" aria-labelledby="unitStartOverTitle">
        <h3 id="unitStartOverTitle">Start this unit over?</h3>
        <p>Your previous completion and quiz score will remain in your history. Your current lesson progress will reset to the beginning.</p>
        <div class="unit-confirm-actions">
          <button type="button" class="unit-confirm-cancel" onclick="MicroUnit.closeStartOver()">Cancel</button>
          <button type="button" class="unit-confirm-delete ml-start-over-confirm" onclick="MicroUnit.startOver()">Start over</button>
        </div>
      </div>`;
    overlay.classList.add('open');
    document.body.classList.add('unit-confirm-open');
    setTimeout(() => overlay.querySelector('.unit-confirm-cancel')?.focus(), 20);
  }

  function closeStartOver() {
    const overlay = document.getElementById('unitStartOverOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.innerHTML = '';
    }
    document.body.classList.remove('unit-confirm-open');
  }

  function startOver() {
    if (!_unit || !_progress) return;
    closeStartOver();
    const preserved = {
      latestScore: _progress.latestScore,
      bestScore: _progress.bestScore,
      attempts: Array.isArray(_progress.attempts) ? _progress.attempts.slice() : [],
      completedAt: _progress.completedAt
    };
    _progress = {
      currentLessonIndex: 0,
      currentSlideIndex: 0,
      currentPhase: 'slides',
      completedLessonIds: [],
      quickCheckAnswers: {},
      recapAnswers: {},
      recapResultAnswers: null,
      completed: false,
      latestScore: preserved.latestScore,
      bestScore: preserved.bestScore,
      missedConcepts: [],
      attempts: preserved.attempts,
      lastOpenedAt: new Date().toISOString(),
      completedAt: preserved.completedAt,
      startedAt: new Date().toISOString(),
      updatedAt: null
    };
    _reviewMode = false;
    _phase = 'slides';
    _index = 0;
    _slideIndex = 0;
    _selectedAnswer = null;
    _selectedRecapAnswer = null;
    _saveProgress();
    _render();
    try { global.dispatchEvent(new CustomEvent('finlingo:micro-progress-updated')); } catch (_) {}
  }

  // ── Rendering ───────────────────────────────────────────────────────
  function _shell(inner, opts) {
    opts = opts || {};
    const label = opts.label || '';
    const headerClass = opts.headerClass ? ` ${esc(opts.headerClass)}` : '';
    return `
      <div class="ml-shell">
        <header class="ml-top${headerClass}">
          <button type="button" class="ml-back" aria-label="Back to Learn" onclick="MicroUnit.back()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span class="ml-progress-label">${esc(label)}</span>
          ${_lessonIndicator()}
        </header>
        <main class="ml-body">${inner}</main>
      </div>`;
  }

  // The top-right carousel represents the PAGES inside the screen the learner is
  // currently on — not the lessons in the whole unit. It is rebuilt every render
  // for whatever group of pages is active, so advancing to the next lesson
  // resets the indicators to that lesson's own page count, starting at page 1.
  //   • Lesson pages  = each instructional slide + the quick check (final page).
  //   • Recap pages   = each recap question.
  // Returns { total, current, allDone } describing the active page group, or
  // null when no carousel should show (e.g. the unit-review landing).
  function _pageState() {
    if (!_unit || !_unit.lessons || !_unit.lessons.length) return null;
    // Recap / completion screens: indicators map to recap questions.
    if (_phase === 'recap' || _phase === 'recap_intro' || _phase === 'complete') {
      const rq = _unit.recapQuiz || [];
      if (!rq.length) return null;
      if (_phase === 'complete') return { total: rq.length, current: rq.length - 1, allDone: true };
      if (_phase === 'recap_intro') return { total: rq.length, current: 0, allDone: false };
      return { total: rq.length, current: Math.max(0, Math.min(rq.length - 1, _index)), allDone: false };
    }
    if (_phase === 'review_detail') return null;
    // Lesson screens (slides + quick check). Review mode walks slides only.
    const lesson = _unit.lessons[_index];
    if (!lesson) return null;
    const slides = Array.isArray(lesson.slides) ? lesson.slides : [];
    const hasCheck = !_reviewMode && !!lesson.question;
    const total = Math.max(1, slides.length + (hasCheck ? 1 : 0));
    const current = (_phase === 'question' || _phase === 'feedback')
      ? total - 1                                   // quick check = last page
      : Math.max(0, Math.min(total - 1, _slideIndex));
    return { total, current, allDone: false };
  }

  function _lessonIndicator() {
    const st = _pageState();
    if (!st) return '';
    const { total, current, allDone } = st;
    const aria = allDone
      ? `All ${total} page${total === 1 ? '' : 's'} complete.`
      : `Page ${Math.min(current + 1, total)} of ${total}.`;
    const dense = total >= 10 ? ' is-dense' : total >= 8 ? ' is-compact' : '';
    let pills = '';
    for (let i = 0; i < total; i += 1) {
      const state = allDone ? 'done' : (i === current ? 'current' : (i < current ? 'done' : 'upcoming'));
      pills += `<span class="ml-lesson-pill is-${state}"></span>`;
    }
    return `
      <div class="ml-lesson-indicator${dense}" role="img" aria-label="${esc(aria)}">
        <div class="ml-lesson-pills" aria-hidden="true">${pills}</div>
      </div>`;
  }

  // Compact chevron navigation row (replaces the full-width Continue button).
  // `back`/`fwd` are { label, disabled?, onclick? }. The forward control is the
  // primary action; its onclick is whatever the old Continue button did in this
  // phase, so the slide → quick check → feedback → next-lesson → recap flow is
  // preserved exactly. Disabled controls use the native disabled attribute (not
  // colour alone) and drop their onclick.
  function _navRow(back, fwd) {
    const b = back || {};
    const f = fwd || {};
    const bDis = b.disabled ? 'disabled aria-disabled="true"' : '';
    const fDis = f.disabled ? 'disabled aria-disabled="true"' : '';
    const bClick = (b.disabled || !b.onclick) ? '' : `onclick="${b.onclick}"`;
    const fClick = (f.disabled || !f.onclick) ? '' : `onclick="${f.onclick}"`;
    return `
      <nav class="ml-nav" aria-label="Lesson navigation">
        <button type="button" class="ml-nav-btn ml-nav-back" aria-label="${esc(b.label || 'Previous slide')}" ${bDis} ${bClick}>
          ${FinLingoIcons.left()}
        </button>
        <button type="button" class="ml-nav-btn ml-nav-fwd" aria-label="${esc(f.label || 'Next slide')}" ${fDis} ${fClick}>
          ${FinLingoIcons.right()}
        </button>
      </nav>`;
  }

  function _quizNavRow(back, submit, fwd) {
    const b = back || {};
    const s = submit || {};
    const f = fwd || {};
    const bDis = b.disabled ? 'disabled aria-disabled="true"' : '';
    const sDis = s.disabled ? 'disabled aria-disabled="true"' : '';
    const fDis = f.disabled ? 'disabled aria-disabled="true"' : '';
    const bClick = (b.disabled || !b.onclick) ? '' : `onclick="${b.onclick}"`;
    const sClick = (s.disabled || !s.onclick) ? '' : `onclick="${s.onclick}"`;
    const fClick = (f.disabled || !f.onclick) ? '' : `onclick="${f.onclick}"`;
    return `
      <nav class="ml-nav ml-quiz-nav" aria-label="Quiz controls">
        <button type="button" class="ml-nav-btn ml-nav-back" aria-label="${esc(b.label || 'Previous')}" ${bDis} ${bClick}>
          ${FinLingoIcons.left()}
        </button>
        <button type="button" class="ml-submit-btn${s.submitted ? ' is-submitted' : ''}" ${sDis} ${sClick}>
          ${esc(s.label || 'Submit')}
        </button>
        <button type="button" class="ml-nav-btn ml-nav-fwd" aria-label="${esc(f.label || 'Next')}" ${fDis} ${fClick}>
          ${FinLingoIcons.right()}
        </button>
      </nav>`;
  }

  function _sentences(text, max) {
    return _str(text).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean).slice(0, max || 4);
  }

  function _keyBullets(lesson, slide) {
    const raw = _str(slide && slide.body);
    let parts = raw
      .split(/\n+|(?:^|\s)(?:[•●]\s*|[*]\s+|[-–—]\s+|\d+[.)]\s+)/)
      .map(_cleanListItem)
      .filter(Boolean);
    if (parts.length <= 1) parts = _sentences(raw, 4);
    if (parts.length <= 1) {
      const slides = Array.isArray(lesson.slides) ? lesson.slides : [];
      parts = slides.map(s => _sentences(s.body, 1)[0]).filter(Boolean);
    }
    return parts
      .map(s => _cleanListItem(s).replace(/^key details?:?/i, '').trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  function _slideLabel(slide, fallback) {
    const type = _str(slide && slide.type).toLowerCase();
    if (type === 'example' || type === 'process' || type === 'comparison') return 'EXAMPLE';
    if (type === 'takeaway') return 'KEY DETAILS';
    return fallback || 'THE CORE IDEA';
  }

  function _renderInstructionSlide(lesson, slide) {
    const label = _slideLabel(slide);
    if (label === 'KEY DETAILS') {
      const bullets = _keyBullets(lesson, slide);
      return `
        <article class="ml-instruction-card ml-key-details">
          <span class="ml-slide-type">KEY DETAILS</span>
          <ul>${bullets.map(item => `<li>${esc(_cleanListItem(item))}</li>`).join('')}</ul>
        </article>`;
    }
    if (label === 'EXAMPLE') {
      return `
        <article class="ml-instruction-card ml-slide ml-slide-example">
          <span class="ml-slide-type">EXAMPLE</span>
          <p>${esc(_cleanListItem(_sentences(slide.body, 4).join(' ')))}</p>
        </article>`;
    }
    return `
      <article class="ml-instruction-card ml-slide ml-core-slide">
        <span class="ml-slide-type">THE CORE IDEA</span>
        <p>${esc(_cleanListItem(slide.body))}</p>
      </article>`;
  }

  function _renderLesson() {
    const lesson = _unit.lessons[_index];
    const slides = Array.isArray(lesson.slides) ? lesson.slides : [];
    const slide = slides[_slideIndex] || slides[0] || { type: 'concept', heading: 'The basic idea', body: '' };
    const label = `Lesson ${_index + 1} of ${_unit.lessons.length}`;
    const isLast = _slideIndex >= slides.length - 1;
    const inner = `
      <div class="ml-lesson-content">
        <div class="ml-lesson">
          <div class="ml-slide-position">${_slideIndex + 1} of ${Math.max(1, slides.length)}</div>
          <h1 class="ml-lesson-title">${esc(lesson.title)}</h1>
          ${_renderInstructionSlide(lesson, slide)}
        </div>
        ${_reviewMode
          ? _navRow(
              { label: 'Previous slide', disabled: _index === 0 && _slideIndex === 0, onclick: 'MicroUnit.prevReview()' },
              { label: _index === _unit.lessons.length - 1 && isLast ? 'Back to unit review' : 'Next slide', onclick: 'MicroUnit.continueReview()' })
          : _navRow(
              { label: 'Previous slide', disabled: _slideIndex === 0, onclick: 'MicroUnit.prevSlide()' },
              { label: isLast ? 'Start quick check' : 'Next slide', onclick: 'MicroUnit.continueSlide()' }
            )}
      </div>
      `;
    return _shell(inner, { label });
  }

  function _questionMarkup(q, answeredIdx, onPick, selectedIdx) {
    const answered = Number.isInteger(answeredIdx);
    const correct = Number(q.correctAnswerIndex);
    const choices = (q.choices || []).map((c, i) => {
      let cls = '';
      if (answered && i === correct) cls = ' is-correct';
      else if (answered && i === answeredIdx) cls = ' is-wrong';
      else if (!answered && i === selectedIdx) cls = ' is-selected';
      // Non-colour cue so correctness never depends on colour alone.
      let mark = '';
      if (answered && i === correct) mark = `<span class="ml-choice-mark" aria-hidden="true">✓</span>`;
      else if (answered && i === answeredIdx) mark = `<span class="ml-choice-mark is-wrong" aria-hidden="true">✕</span>`;
      const sr = answered && i === correct ? '<span class="sr-only"> (correct answer)</span>'
        : (answered && i === answeredIdx ? '<span class="sr-only"> (your answer, incorrect)</span>' : '');
      return `<button type="button" class="ml-choice${cls}" ${answered ? 'disabled' : ''} aria-pressed="${!answered && i === selectedIdx ? 'true' : 'false'}" onclick="${onPick}(${i})">
        <span class="ml-choice-letter">${String.fromCharCode(65 + i)}</span>
        <span class="ml-choice-text">${esc(c)}${sr}</span>
        ${mark}
      </button>`;
    }).join('');
    const feedback = answered ? `
      <div class="ml-feedback ${answeredIdx === correct ? 'ok' : 'no'}">
        <strong>${answeredIdx === correct ? 'Correct.' : 'Not quite.'}</strong>
        <p>${esc(q.explanation || (answeredIdx === correct ? 'That’s right.' : 'Review the highlighted answer above.'))}</p>
      </div>` : '';
    return { choices, feedback, answered };
  }

  function _renderCheck() {
    const lesson = _unit.lessons[_index];
    const q = lesson.question;
    const label = `Lesson ${_index + 1} of ${_unit.lessons.length}`;
    const answeredIdx = _progress.quickCheckAnswers[lesson.id];
    const m = _questionMarkup(q, answeredIdx, 'MicroUnit.selectAnswer', _selectedAnswer);
    const inner = `
      <div class="ml-check-content">
        <div class="ml-check">
          <span class="ml-check-kicker">QUICK CHECK</span>
          <h2 class="ml-question">${esc(q.prompt)}</h2>
          <div class="ml-choices">${m.choices}</div>
          <div class="ml-feedback-slot" aria-hidden="true"></div>
        </div>
        ${_quizNavRow(
          { label: 'Previous slide', disabled: true },
          { label: 'Submit', disabled: !Number.isInteger(_selectedAnswer), onclick: 'MicroUnit.checkAnswer()' },
          { label: 'Next lesson', disabled: true }
        )}
      </div>
      `;
    return _shell(inner, { label });
  }

  function _renderFeedback() {
    const lesson = _unit.lessons[_index];
    const q = lesson.question;
    const label = `Lesson ${_index + 1} of ${_unit.lessons.length}`;
    const answeredIdx = _progress.quickCheckAnswers[lesson.id];
    const m = _questionMarkup(q, answeredIdx, 'MicroUnit.selectAnswer');
    const inner = `
      <div class="ml-check-content">
        <div class="ml-check">
          <span class="ml-check-kicker">QUICK CHECK</span>
          <h2 class="ml-question">${esc(q.prompt)}</h2>
          <div class="ml-choices">${m.choices}</div>
          <div class="ml-feedback-slot">${m.feedback}</div>
        </div>
        ${_quizNavRow(
          { label: 'Previous slide', disabled: true },
          { label: 'Submitted', disabled: true, submitted: true },
          { label: _index < _unit.lessons.length - 1 ? 'Next lesson' : (_unit.recapQuiz.length ? 'Start recap' : 'Finish unit'), onclick: 'MicroUnit.continueAfterFeedback()' }
        )}
      </div>
      `;
    return _shell(inner, { label });
  }

  function _renderRecap() {
    const q = _unit.recapQuiz[_index];
    const label = 'Recap quiz';
    const answeredIdx = _progress.recapAnswers[_index];
    const m = _questionMarkup(q, answeredIdx, 'MicroUnit.answerRecap', _selectedRecapAnswer);
    const inner = `
      <div class="ml-check-content ml-recap-content">
        <div class="ml-check">
          <span class="ml-slide-position">Question ${_index + 1} of ${_unit.recapQuiz.length}</span>
          <h2 class="ml-question">${esc(q.prompt)}</h2>
          <div class="ml-choices">${m.choices}</div>
          <div class="ml-feedback-slot">${m.feedback}</div>
        </div>
        ${m.answered
          ? _quizNavRow(
              { label: 'Previous question', disabled: true },
              { label: 'Submitted', disabled: true, submitted: true },
              { label: _index < _unit.recapQuiz.length - 1 ? 'Next recap question' : 'Finish recap', onclick: 'MicroUnit.continueRecap()' })
          : _quizNavRow(
              { label: 'Previous question', disabled: true },
              { label: 'Submit', disabled: !Number.isInteger(_selectedRecapAnswer), onclick: 'MicroUnit.checkRecap()' },
              { label: 'Next recap question', disabled: true })}
      </div>
      `;
    return _shell(inner, { label, headerClass: 'is-recap' });
  }

  function _renderRecapIntro() {
    const inner = `
      <div class="ml-recap-intro">
        <span class="ml-check-kicker">LESSONS COMPLETE</span>
        <h1>Unit Recap Quiz</h1>
        <p>You've finished the lessons. Now check what you remember.</p>
        <div class="ml-done-actions">
          <button type="button" class="ml-continue" onclick="MicroUnit.startRecap()">Start recap quiz</button>
          <button type="button" class="ml-secondary" onclick="MicroUnit.review()">Review lessons</button>
        </div>
      </div>`;
    return _shell(inner, { label: _unit.title });
  }

  function _scoreText(score) {
    if (!score || !Number.isFinite(Number(score.total))) return 'No recap score yet';
    return `${Number(score.correct) || 0}/${Number(score.total) || 0}`;
  }

  function _renderReviewDetail() {
    const latest = _progress.latestScore;
    const best = _progress.bestScore;
    const latestText = _scoreText(latest);
    const bestDifferent = best && latest && Number(best.correct) !== Number(latest.correct);
    const latestTotal = latest ? Number(latest.total) || 0 : 0;
    const reviewRecommended = latestTotal > 0 && ((Number(latest.correct) || 0) <= 1 || (Number(latest.correct) / latestTotal) < 0.5);
    const canDelete = _unit && _unit.source === 'ask';
    const inner = `
      <section class="ml-unit-review${reviewRecommended ? ' needs-review' : ''}">
        <span class="ml-check-kicker">UNIT REVIEW</span>
        <h1>${esc(_unit.title)}</h1>
        <div class="ml-unit-review-status">
          <strong>${reviewRecommended ? 'Completed · Review recommended' : 'Completed'}</strong>
          <span>Latest score ${esc(latestText)}</span>
          ${bestDifferent ? `<span>Best score ${esc(_scoreText(best))}</span>` : ''}
        </div>
        ${_progress.missedConcepts.length ? `
          <div class="ml-review-topics">
            <span>Concepts to review</span>
            <ul>${_progress.missedConcepts.map(topic => `<li>${esc(_cleanListItem(topic))}</li>`).join('')}</ul>
          </div>` : ''}
        <div class="ml-unit-review-actions">
          <button type="button" class="ml-continue" onclick="MicroUnit.reviewUnit()">Review unit</button>
          ${_unit.recapQuiz.length ? '<button type="button" class="ml-secondary" onclick="MicroUnit.retakeRecap()">Retake recap quiz</button>' : ''}
          <button type="button" class="ml-secondary" onclick="MicroUnit.confirmStartOver()">Start over</button>
          <button type="button" class="ml-secondary" onclick="MicroUnit.back()">Return to Learn</button>
          ${canDelete ? `<button type="button" class="ml-unit-review-delete" onclick="LearnUnitMenu._openConfirm('${esc(_unit.id)}')">Delete unit</button>` : ''}
        </div>
      </section>`;
    return _shell(inner, { label: 'Unit review' });
  }

  function _renderDone() {
    const recap = _unit.recapQuiz;
    const resultAnswers = _progress.recapResultAnswers || _progress.recapAnswers;
    let correct = 0;
    recap.forEach((q, i) => { if (Number(resultAnswers[i]) === Number(q.correctAnswerIndex)) correct += 1; });
    const pct = recap.length ? Math.round((correct / recap.length) * 100) : 100;
    const missedTopics = recap
      .map((q, i) => Number(resultAnswers[i]) === Number(q.correctAnswerIndex) ? '' : (_unit.lessons[i]?.title || q.prompt))
      .filter(Boolean)
      .slice(0, 3);
    const resultState = !recap.length || correct === recap.length
      ? 'success'
      : correct <= 1 ? 'fail' : 'near';
    const summaryLine = resultState === 'success'
      ? 'Great work. You understand the key ideas.'
      : resultState === 'near'
        ? 'Almost there. Review one idea and try again.'
        : correct === 0
          ? 'Let’s review the key ideas and try again.'
          : 'A quick review will help reinforce these ideas.';
    const inner = `
      <div class="ml-done is-${resultState}">
        <div class="ml-done-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div>
        <h1>Unit complete</h1>
        ${recap.length ? `<p class="ml-done-score">${correct} of ${recap.length} · ${pct}%</p>` : ''}
        <p class="ml-done-summary">${esc(summaryLine)}</p>
        ${missedTopics.length ? `<div class="ml-review-topics"><span>Concepts to review</span><ul>${missedTopics.map(topic => `<li>${esc(_cleanListItem(topic))}</li>`).join('')}</ul></div>` : ''}
        <div class="ml-done-actions">
          ${missedTopics.length
            ? '<button type="button" class="ml-continue" onclick="MicroUnit.retakeRecap()">Retake quiz</button><button type="button" class="ml-secondary" onclick="MicroUnit.reviewMissed()">Review missed questions</button><button type="button" class="ml-secondary" onclick="MicroUnit.back()">Return to Learn</button>'
            : '<button type="button" class="ml-continue" onclick="MicroUnit.back()">Return to Learn</button><button type="button" class="ml-secondary" onclick="MicroUnit.review()">Review unit</button>'}
        </div>
      </div>`;
    return _shell(inner, { label: _unit.title, pct: 100 });
  }

  function _render() {
    const root = document.getElementById('microUnitRoot');
    if (!root || !_unit) return;
    let html;
    if (_phase === 'question') html = _renderCheck();
    else if (_phase === 'feedback') html = _renderFeedback();
    else if (_phase === 'recap_intro') html = _renderRecapIntro();
    else if (_phase === 'recap') html = _renderRecap();
    else if (_phase === 'review_detail') html = _renderReviewDetail();
    else if (_phase === 'complete') html = _renderDone();
    else html = _renderLesson();
    root.innerHTML = html;
    const body = root.querySelector('.ml-body');
    if (body) body.scrollTop = 0;
  }

  global.openMicroUnit = openMicroUnit;
  global.MicroUnit = {
    open: openMicroUnit,
    back: back,
    continueSlide: continueSlide,
    continueReview: continueReview,
    prevReview: prevReview,
    prevSlide: prevSlide,
    continueLesson: continueLesson,
    selectAnswer: selectAnswer,
    checkAnswer: checkAnswer,
    answer: answer,
    continueAfterFeedback: continueAfterFeedback,
    continueAfterCheck: continueAfterCheck,
    startRecap: startRecap,
    retakeRecap: retakeRecap,
    answerRecap: answerRecap,
    checkRecap: checkRecap,
    continueRecap: continueRecap,
    review: review,
    reviewUnit: reviewUnit,
    reviewMissed: reviewMissed,
    showReviewDetail: showReviewDetail,
    confirmStartOver: confirmStartOver,
    closeStartOver: closeStartOver,
    startOver: startOver,
    summary: summary,
    currentUnitId: currentUnitId,
    upgrade: upgrade
  };

  function removeProgress(unitId) {
    const all = _allProgress();
    if (unitId in all) {
      delete all[unitId];
      try { localStorage.setItem(PKEY, JSON.stringify(all)); } catch {}
    }
  }
  // Snapshot a unit's raw stored progress (deep copy) so the Undo flow can
  // restore exact completion/score/recap state after a swipe deletion.
  function getRawProgress(unitId) {
    const all = _allProgress();
    if (!(unitId in all)) return null;
    try { return JSON.parse(JSON.stringify(all[unitId])); } catch { return null; }
  }
  function restoreProgress(unitId, data) {
    if (!unitId || !data) return;
    const all = _allProgress();
    all[unitId] = data;
    try { localStorage.setItem(PKEY, JSON.stringify(all)); } catch {}
  }
  global.MicroProgress = {
    summary: summary,
    isComplete: isComplete,
    remove: removeProgress,
    getRaw: getRawProgress,
    restore: restoreProgress
  };
})(typeof window !== 'undefined' ? window : this);
