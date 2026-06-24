// ============================================================
// questionEngine.js
// Multi-format question rendering engine for Finlingo.
//
// SUPPORTED TYPES:
//   true_false  — two large tap buttons (True / False)
//   fill_blank  — text input with flexible matching + Check button
//   matching    — tap-to-pair grid + Check button (partial XP)
//   scenario    — narrative MC (q.options / q.answer, same as MC)
//
// NOT handled here (stays in quiz.js legacy flow):
//   multiple_choice  — old schema { q, options, answer, explanation }
//                       and new schema with type:'multiple_choice'
//                       both work via the existing code path.
//
// ── INTEGRATION ──────────────────────────────────────────────
// quiz.js calls QE.isEngineQuestion(q) in renderQuestion().
// If true, quiz.js delegates to QE.render(q) and returns early.
// The engine handles its own UI, evaluation, XP, and feedback.
// nextStep() from quiz.js is shared — it just increments qIdx.
//
// ── GLOBAL DEPS (from quiz.js, state.js, app.js) ─────────────
//   locked, selected, currentLesson, qIdx, mode
//   lessonXp, lessonCorrect, lessonCash, lessonMistakes
//   S, save(), updateTopbar(), showXpPop(), showCashPop()
//   nextStep(), showToast(), awardRewards(), logReviewResult()
//
// LOAD ORDER: after quiz.js, before app.js
// ============================================================


// ── ENGINE TYPE REGISTRY ──────────────────────────────────────
// Only these types are routed to the engine.
// 'multiple_choice' (old or new schema) stays in quiz.js.
const QE_HANDLED = new Set(['true_false', 'fill_blank', 'matching', 'scenario']);

// ── MODULE-LEVEL STATE ────────────────────────────────────────
// Reset at the start of each engine question.
let _qeMatchSels   = {};  // { pairIndex: string value selected }
let _qeMatchRights = [];  // shuffled right-side values for current matching Q


// ════════════════════════════════════════════════════════════
// PUBLIC API — called from quiz.js
// ════════════════════════════════════════════════════════════

const QE = {

  /**
   * Returns true if this question should be handled by the engine.
   * quiz.js calls this to decide whether to delegate.
   */
  isEngineQuestion(q) {
    return q != null && QE_HANDLED.has(q.type);
  },

  /**
   * Main dispatch. Called from renderQuestion() in quiz.js after
   * all metadata (quizProg, questionText, fbBox reset) is already set.
   * The engine replaces only the #choices / button UI.
   */
  render(q) {
    // Reset per-question state
    _qeMatchSels   = {};
    _qeMatchRights = [];

    // Override question text with normalized field (engine questions use
    // q.question; legacy questions use q.q — both are already normalized
    // by quiz.js, but do it here too for safety)
    const qEl = document.getElementById('questionText');
    if (qEl) qEl.textContent = _qeText(q);
    const fbBody = document.querySelector('#fbBox .fb-body');
    const preview = calculateReward(_qeXp(q), _qeXp(q));
    if (fbBody) fbBody.textContent = `Correct answers earn +${preview.xpAwarded} XP and +$${preview.cashAwarded}.`;

    // Inject type badge alongside the unit chip
    _qeShowTypeBadge(q);

    // Clear hint row — engine questions don't use it
    const hr = document.getElementById('hintRow');
    if (hr) hr.innerHTML = '';

    // Dispatch
    switch (q.type) {
      case 'true_false': _qeRenderTrueFalse(q); break;
      case 'fill_blank': _qeRenderFillBlank(q); break;
      case 'matching':   _qeRenderMatching(q);  break;
      case 'scenario':   _qeRenderScenario(q);  break;
    }
  },
};


// ════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ════════════════════════════════════════════════════════════

/** Normalize question text: new schema → q.question, old → q.q */
function _qeText(q) {
  return q.question || q.q || '';
}

/** Normalize XP: new questions carry q.xp, old ones default to 10 */
function _qeXp(q) {
  return (typeof q.xp === 'number' && q.xp > 0) ? q.xp : 10;
}

/**
 * Inject or update the type badge inside the .unit-chip.
 * Also shows difficulty dot if q.difficulty is set.
 * Resets to hidden for non-engine questions (called by quiz.js normalization fix).
 */
function _qeShowTypeBadge(q) {
  const labels = {
    true_false: 'True / False',
    fill_blank: 'Fill in the Blank',
    matching:   'Matching',
    scenario:   'Scenario',
  };
  const diffDots = { easy: '#00a844', medium: '#d4aa40', hard: '#cc3333' };

  let badge = document.getElementById('qeTypeBadge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'qeTypeBadge';
    // Append inside the unit chip, after the unit text span
    const unitChip = document.querySelector('#quizScreen .unit-chip');
    if (unitChip) unitChip.appendChild(badge);
  }

  const typeLabel = labels[q.type] || q.type;
  const diffColor = q.difficulty ? diffDots[q.difficulty] : null;
  const diffHtml  = diffColor
    ? `<span style="width:6px;height:6px;border-radius:50%;background:${diffColor};
         display:inline-block;margin-left:5px;flex-shrink:0;vertical-align:middle;"></span>`
    : '';

  badge.className   = `qe-type-badge qe-badge-${q.type.replace(/_/g, '-')}`;
  badge.innerHTML   = typeLabel + diffHtml;
  badge.style.display = '';
}

/** Called for non-engine questions to clear any leftover badge */
function _qeHideTypeBadge() {
  const badge = document.getElementById('qeTypeBadge');
  if (badge) badge.style.display = 'none';
}

/**
 * Shared result handler: awards XP, updates stats,
 * shows feedback, enables Next, disables hints.
 * Mirrors checkAnswer() in quiz.js exactly.
 */
function _qeApplyResult(q, correct, yourAnswer, correctAnswer) {
  const baseXp = correct ? _qeXp(q) : 0;
  const reward = correct
    ? awardRewards({
        baseXp,
        baseCash: baseXp,
        source: 'question_correct',
        meta: {
          questionId: q.questionId || q.id || `${currentLesson?.id || 'lesson'}-q${qIdx + 1}`,
          topicId: q.topicId || q.topic || currentLesson?.title || 'general',
          difficulty: q.difficulty || 'medium'
        }
      })
    : { xpAwarded: 0, cashAwarded: 0, baseXp: 0, baseCash: 0 };
  const xp = reward.xpAwarded || 0;
  const cash = reward.cashAwarded || 0;

  S.totalAnswered++;

  if (correct) {
    S.totalCorrect++;
    lessonXp      += xp;
    lessonBaseXp  += reward.baseXp || 0;
    lessonBaseCash += reward.baseCash || 0;
    lessonCorrect++;
    lessonCash    += cash;
    showXpPop(xp);
    if (typeof showCashPop === 'function' && mode !== 'daily') showCashPop(cash);
  } else {
    // Track mistake for end-of-lesson review
    lessonMistakes.push({
      q:             _qeText(q),
      yourAnswer:    yourAnswer    || '—',
      correctAnswer: correctAnswer || '—',
      explanation:   q.explanation || '',
    });
  }

  if (typeof logReviewResult === 'function') {
    logReviewResult(q, correct);
  }
  if (typeof handleRunMomentum === 'function') {
    handleRunMomentum(correct);
  }

  save();
  updateTopbar();
  _qeRenderFeedback(correct, q.explanation, xp, !correct ? correctAnswer : null);

  // Enable Next, swap buttons
  const nextBtn  = document.getElementById('nextBtn');
  const checkBtn = document.getElementById('checkBtn');
  if (nextBtn)  { nextBtn.disabled = false; nextBtn.style.display = ''; }
  if (checkBtn) { checkBtn.style.display = 'none'; }

  // Disable hint if somehow still visible
  const hintBtn = document.getElementById('hintBtn');
  if (hintBtn) {
    hintBtn.disabled           = true;
    hintBtn.style.opacity      = '0.3';
    hintBtn.style.cursor       = 'default';
  }

  // Prevent fbBox click-through on Next button
  const fb = document.getElementById('fbBox');
  if (fb) fb.style.pointerEvents = 'none';
}

/**
 * Render feedback into #fbBox.
 * Matches the visual style of quiz.js checkAnswer() exactly.
 */
function _qeRenderFeedback(correct, explanation, xp, correctAnswerLine) {
  const okIcon = `<svg viewBox="0 0 24 24" stroke-width="2.2"
    style="width:13px;height:13px;stroke:currentColor;fill:none">
    <polyline points="20 6 9 17 4 12"/></svg>`;
  const noIcon = `<svg viewBox="0 0 24 24" stroke-width="2.2"
    style="width:13px;height:13px;stroke:currentColor;fill:none">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const ckIcon = `<svg viewBox="0 0 24 24" stroke-width="2.2"
    style="width:11px;height:11px;stroke:currentColor;fill:none;flex-shrink:0;margin-top:1px">
    <polyline points="20 6 9 17 4 12"/></svg>`;

  const correctLine = correctAnswerLine
    ? `<div style="display:flex;align-items:flex-start;gap:6px;
         padding:5px 12px 0;font-size:0.73rem;font-weight:600;
         color:var(--green-text,#4ade80);line-height:1.4">
         ${ckIcon}${correctAnswerLine}
       </div>`
    : '';

  document.getElementById('fbBox').innerHTML = `
    <div class="fb-head ${correct ? 'correct' : 'incorrect'}">
      ${correct ? okIcon : noIcon}
      ${correct ? `Correct — +${xp} XP` : 'Incorrect'}
    </div>
    ${correctLine}
    <div class="fb-body">${explanation || ''}</div>`;
}

/** Standard Check/Next button wiring for types that need Check first */
function _qeSetupCheckFlow(checkFn) {
  const checkBtn = document.getElementById('checkBtn');
  const nextBtn  = document.getElementById('nextBtn');
  if (checkBtn) {
    checkBtn.style.display = '';
    checkBtn.disabled      = true;
    checkBtn.onclick       = checkFn;
  }
  if (nextBtn) {
    nextBtn.style.display = 'none';
    nextBtn.disabled      = true;
    nextBtn.onclick       = nextStep;
  }
}

/** Standard tap-to-answer wiring (no Check step, like existing MC) */
function _qeSetupTapFlow() {
  const checkBtn = document.getElementById('checkBtn');
  const nextBtn  = document.getElementById('nextBtn');
  if (checkBtn) checkBtn.style.display = 'none';
  if (nextBtn)  { nextBtn.disabled = true; nextBtn.style.display = ''; nextBtn.onclick = nextStep; }
}


// ════════════════════════════════════════════════════════════
// TYPE 1: TRUE / FALSE
// Two large buttons — tap immediately evaluates, no Check step.
// q.answer is a boolean (true | false).
// ════════════════════════════════════════════════════════════

function _qeRenderTrueFalse(q) {
  _qeSetupTapFlow();

  document.getElementById('choices').innerHTML = `
    <div class="qe-tf-grid">
      <button class="qe-tf-btn" id="qeTfTrue" onclick="qeTrueFalse(true)">
        <div class="qe-tf-icon qe-tf-icon-true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            style="width:22px;height:22px;">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <span class="qe-tf-label">True</span>
      </button>
      <button class="qe-tf-btn" id="qeTfFalse" onclick="qeTrueFalse(false)">
        <div class="qe-tf-icon qe-tf-icon-false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            style="width:22px;height:22px;">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <span class="qe-tf-label">False</span>
      </button>
    </div>`;
}

/**
 * Global onclick handler for True/False buttons.
 * @param {boolean} value - true if user tapped True, false for False
 */
function qeTrueFalse(value) {
  if (locked) return;
  locked = true;

  const q       = currentLesson.questions[qIdx];
  const correct = (value === q.answer); // q.answer is boolean

  const trueBtn  = document.getElementById('qeTfTrue');
  const falseBtn = document.getElementById('qeTfFalse');
  if (trueBtn)  trueBtn.disabled  = true;
  if (falseBtn) falseBtn.disabled = true;

  // Mark the chosen button
  const chosenBtn = value ? trueBtn : falseBtn;
  if (chosenBtn) chosenBtn.classList.add(correct ? 'qe-tf-correct' : 'qe-tf-incorrect');

  // Always reveal the correct button if user was wrong
  if (!correct) {
    const rightBtn = q.answer ? trueBtn : falseBtn;
    if (rightBtn) rightBtn.classList.add('qe-tf-correct');
  }

  _qeApplyResult(q, correct,
    value ? 'True' : 'False',
    q.answer ? 'True' : 'False');
}


// ════════════════════════════════════════════════════════════
// TYPE 2: FILL IN THE BLANK
// Text input + Check button flow.
// q.accepted is a string[] of valid answers (case-insensitive).
// Matching is flexible: exact OR the attempt contains an accepted
// answer, or vice versa (handles short-form synonyms).
// ════════════════════════════════════════════════════════════

function _qeRenderFillBlank(q) {
  _qeSetupCheckFlow(qeCheckBlank);

  document.getElementById('choices').innerHTML = `
    <div class="qe-blank-wrap">
      <input class="qe-blank-input" id="qeBlankInput"
        type="text"
        placeholder="Type your answer…"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="none"
        spellcheck="false"
        oninput="qeBlankInput()" />
      <div class="qe-blank-hint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          style="width:10px;height:10px;flex-shrink:0;">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Not case-sensitive · partial matches accepted
      </div>
    </div>`;

  // Auto-focus and wire Enter key after DOM settles
  setTimeout(() => {
    const input = document.getElementById('qeBlankInput');
    if (!input) return;
    input.focus();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !locked) qeCheckBlank();
    });
  }, 80);
}

/** oninput handler — enables Check button once there's text */
function qeBlankInput() {
  const val  = (document.getElementById('qeBlankInput')?.value || '').trim();
  const btn  = document.getElementById('checkBtn');
  if (btn) btn.disabled = !val;
}

/** Check button handler for fill_blank */
function qeCheckBlank() {
  if (locked) return;
  const input   = document.getElementById('qeBlankInput');
  const attempt = (input?.value || '').trim();
  if (!attempt) return;

  locked = true;
  if (input) input.disabled = true;

  const q        = currentLesson.questions[qIdx];
  const accepted = (q.accepted || []).map(a => a.toLowerCase().trim());
  const norm     = attempt.toLowerCase();

  // Generous matching: exact, or attempt contains answer, or answer contains attempt
  const correct = accepted.length > 0 && accepted.some(a =>
    norm === a || norm.includes(a) || a.includes(norm)
  );

  // Color the input field
  if (input) {
    input.style.borderColor = correct ? 'var(--green)' : 'var(--red)';
    input.style.background  = correct
      ? 'var(--green-dim, rgba(0,168,68,0.12))'
      : 'var(--red-dim,   rgba(204,51,51,0.12))';
  }

  _qeApplyResult(q, correct, attempt, q.accepted?.[0] || '');
}


// ════════════════════════════════════════════════════════════
// TYPE 3: MATCHING
// q.pairs: [{ left: string, right: string }, ...]
// Right-side values are shuffled and shown as tap buttons.
// User selects one right option per left term.
// Partial XP awarded proportionally to correct pairs.
// ════════════════════════════════════════════════════════════

function _qeRenderMatching(q) {
  _qeSetupCheckFlow(qeCheckMatching);

  // Shuffle the right-side values — store shuffled order for check
  _qeMatchRights = q.pairs.map(p => p.right).sort(() => Math.random() - 0.5);

  document.getElementById('choices').innerHTML = `
    <div class="qe-match-instruction">
      Tap a match for each term.
    </div>
    <div class="qe-match-grid" id="qeMatchGrid">
      ${q.pairs.map((pair, pi) => `
        <div class="qe-match-row" id="qeMatchRow_${pi}">
          <div class="qe-match-term">${pair.left}</div>
          <div class="qe-match-opts" id="qeMatchOpts_${pi}">
            ${_qeMatchRights.map((r, ri) => `
              <button class="qe-match-opt"
                id="qeMatchOpt_${pi}_${ri}"
                onclick="qeMatchSelect(${pi},${ri})">
                ${r}
              </button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

/**
 * Global onclick for matching option buttons.
 * @param {number} pairIdx - index of the left-term row
 * @param {number} optIdx  - index of the tapped right-side button
 */
function qeMatchSelect(pairIdx, optIdx) {
  if (locked) return;

  // Deselect all options in this row
  const optsEl = document.getElementById(`qeMatchOpts_${pairIdx}`);
  if (optsEl) {
    optsEl.querySelectorAll('.qe-match-opt')
      .forEach(b => b.classList.remove('qe-match-opt-sel'));
  }

  // Select the tapped option
  const optEl = document.getElementById(`qeMatchOpt_${pairIdx}_${optIdx}`);
  if (optEl) optEl.classList.add('qe-match-opt-sel');

  _qeMatchSels[pairIdx] = _qeMatchRights[optIdx];

  // Enable Check only when every left term has a selection
  const q      = currentLesson.questions[qIdx];
  const allSet = q.pairs.every((_, i) => _qeMatchSels[i] !== undefined);
  const checkBtn = document.getElementById('checkBtn');
  if (checkBtn) checkBtn.disabled = !allSet;
}

/** Check button handler for matching */
function qeCheckMatching() {
  if (locked) return;
  locked = true;

  const q = currentLesson.questions[qIdx];
  let correctCount = 0;

  // Evaluate and mark each row
  q.pairs.forEach((pair, pi) => {
    const chosen    = _qeMatchSels[pi];
    const isCorrect = chosen === pair.right;
    if (isCorrect) correctCount++;

    const rowEl = document.getElementById(`qeMatchRow_${pi}`);
    if (rowEl) rowEl.classList.add(isCorrect ? 'qe-match-row-ok' : 'qe-match-row-err');

    const optsEl = document.getElementById(`qeMatchOpts_${pi}`);
    if (optsEl) {
      optsEl.querySelectorAll('.qe-match-opt').forEach((btn, ri) => {
        btn.disabled = true;
        const val    = _qeMatchRights[ri];
        if (val === pair.right) {
          // Always highlight the correct answer green
          btn.classList.add('qe-match-opt-correct');
        }
        if (btn.classList.contains('qe-match-opt-sel') && val !== pair.right) {
          // Highlight the wrong selection red
          btn.classList.add('qe-match-opt-wrong');
        }
      });
    }
  });

  const allCorrect = (correctCount === q.pairs.length);
  const baseEarned = allCorrect
    ? _qeXp(q)
    : Math.round((_qeXp(q) * correctCount) / q.pairs.length);
  const reward = baseEarned > 0
    ? awardRewards({
        baseXp: baseEarned,
        baseCash: baseEarned,
        source: allCorrect ? 'question_correct' : 'question_partial',
        meta: {
          questionId: q.questionId || q.id || `${currentLesson?.id || 'lesson'}-q${qIdx + 1}`,
          topicId: q.topicId || q.topic || currentLesson?.title || 'general',
          difficulty: q.difficulty || 'medium'
        }
      })
    : { xpAwarded: 0, cashAwarded: 0, baseXp: 0, baseCash: 0 };
  const earnedXp = reward.xpAwarded || 0;

  // Stats update — count as "correct" only on all-pairs match
  S.totalAnswered++;
  if (allCorrect) {
    S.totalCorrect++;
    lessonCorrect++;
  } else {
    lessonMistakes.push({
      q:             _qeText(q),
      yourAnswer:    `${correctCount}/${q.pairs.length} pairs correct`,
      correctAnswer: q.pairs.map(p => `${p.left} → ${p.right}`).join(' · '),
      explanation:   q.explanation || '',
    });
  }

  // Award partial XP if anything correct
  if (earnedXp > 0) {
    lessonXp     += earnedXp;
    lessonBaseXp += reward.baseXp || 0;
    lessonBaseCash += reward.baseCash || 0;
    lessonCash   += reward.cashAwarded || 0;
    showXpPop(earnedXp);
    if (typeof showCashPop === 'function' && mode !== 'daily') showCashPop(reward.cashAwarded || 0);
  }

  if (typeof logReviewResult === 'function') {
    logReviewResult(q, allCorrect);
  }
  if (typeof handleRunMomentum === 'function') {
    handleRunMomentum(allCorrect);
  }

  save();
  updateTopbar();

  // Feedback
  const okIcon = `<svg viewBox="0 0 24 24" stroke-width="2.2"
    style="width:13px;height:13px;stroke:currentColor;fill:none">
    <polyline points="20 6 9 17 4 12"/></svg>`;
  const noIcon = `<svg viewBox="0 0 24 24" stroke-width="2.2"
    style="width:13px;height:13px;stroke:currentColor;fill:none">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  const headLabel = allCorrect
    ? `All matched correctly — +${earnedXp} XP`
    : `${correctCount}/${q.pairs.length} correct${earnedXp > 0 ? ` · +${earnedXp} XP` : ''}`;

  document.getElementById('fbBox').innerHTML = `
    <div class="fb-head ${allCorrect ? 'correct' : 'incorrect'}">
      ${allCorrect ? okIcon : noIcon} ${headLabel}
    </div>
    <div class="fb-body">${q.explanation || ''}</div>`;

  document.getElementById('fbBox').style.pointerEvents = 'none';

  const checkBtn = document.getElementById('checkBtn');
  const nextBtn  = document.getElementById('nextBtn');
  const hintBtn  = document.getElementById('hintBtn');
  if (checkBtn) checkBtn.style.display = 'none';
  if (nextBtn)  { nextBtn.style.display = ''; nextBtn.disabled = false; }
  if (hintBtn)  { hintBtn.disabled = true; hintBtn.style.opacity = '0.3'; }
}


// ════════════════════════════════════════════════════════════
// TYPE 4: SCENARIO
// Narrative multiple-choice — structurally identical to MC
// (q.options / q.answer index) but rendered with a distinct
// style and routing through the engine for q.xp support.
// ════════════════════════════════════════════════════════════

function _qeRenderScenario(q) {
  _qeSetupTapFlow();

  // Reuses .choice and .cl classes for visual consistency with existing MC
  document.getElementById('choices').innerHTML = (q.options || []).map((opt, i) => `
    <button class="choice" id="c${i}" onclick="qeScenarioChoice(${i})">
      <span class="cl">${String.fromCharCode(65 + i)}</span>
      <span>${opt}</span>
    </button>`).join('');
}

/**
 * Global onclick for scenario answer choices.
 * Same tap-to-check pattern as existing MC but routes through engine.
 */
function qeScenarioChoice(i) {
  if (locked) return;
  locked   = true;
  selected = i;

  const q       = currentLesson.questions[qIdx];
  const correct = (i === q.answer);

  // Color choices — same logic as quiz.js checkAnswer()
  document.querySelectorAll('.choice').forEach((el, idx) => {
    el.disabled = true;
    if (idx === q.answer)              el.classList.add('correct');
    if (idx === i && idx !== q.answer) el.classList.add('incorrect');
    el.classList.remove('selected');
  });

  _qeApplyResult(q, correct, q.options[i], q.options[q.answer]);
}


// ════════════════════════════════════════════════════════════
// SAMPLE QUESTION BANK
// Reference implementations of all 5 types using the full schema.
// Import these into LESSONS or use them in the daily question bank.
// ════════════════════════════════════════════════════════════

/**
 * SAMPLE_QUESTIONS — full schema examples, one per type.
 * Use these as templates when adding new questions to lessonBank.js
 * or dailyQuestionBank.js.
 *
 * Shared fields on all types:
 *   id         {string}   unique identifier
 *   type       {string}   'multiple_choice' | 'true_false' | 'fill_blank' | 'matching' | 'scenario'
 *   unit       {string}   category label (budgeting | investing | credit | taxes | retirement)
 *   topic      {string}   specific topic within the unit
 *   difficulty {string}   'easy' | 'medium' | 'hard'
 *   question   {string}   the question text shown to the user
 *   explanation{string}   shown after answer is submitted
 *   xp         {number}   XP awarded for a correct answer
 */
const SAMPLE_QUESTIONS = [

  // ── multiple_choice ────────────────────────────────────────
  // Uses existing quiz.js flow — included here for schema reference only.
  {
    id:          'mc_001',
    type:        'multiple_choice',
    unit:        'investing',
    topic:       'ETFs',
    difficulty:  'easy',
    question:    'What does ETF stand for?',
    options: [
      'Equity Tax Fund',
      'Exchange Traded Fund',
      'Electronic Transfer Formula',
      'Estimated Trading Flow',
    ],
    answer:      1,         // index of the correct option
    explanation: 'ETF = Exchange Traded Fund — a basket of securities that trades on an exchange like a single stock.',
    xp:          10,
  },

  // ── true_false ─────────────────────────────────────────────
  {
    id:          'tf_001',
    type:        'true_false',
    unit:        'investing',
    topic:       'bonds',
    difficulty:  'easy',
    question:    'When interest rates rise, existing bond prices fall.',
    answer:      true,      // boolean: true or false
    explanation: 'Bond prices and interest rates move in opposite directions. When new bonds offer higher yields, existing lower-yield bonds become less attractive — so their price drops.',
    xp:          10,
  },

  // ── fill_blank ─────────────────────────────────────────────
  {
    id:          'fb_001',
    type:        'fill_blank',
    unit:        'investing',
    topic:       'compound interest',
    difficulty:  'medium',
    question:    'Albert Einstein reportedly called compound interest the "eighth wonder of the ________".',
    accepted:    ['world', 'the world'],   // all accepted answers (case-insensitive, partial match)
    explanation: 'Compound interest is powerful because you earn returns on your returns — small differences in rate or time horizon produce dramatically different long-term outcomes.',
    xp:          15,
  },

  // ── matching ───────────────────────────────────────────────
  {
    id:          'match_001',
    type:        'matching',
    unit:        'investing',
    topic:       'asset classes',
    difficulty:  'medium',
    question:    'Match each asset class to its primary characteristic.',
    pairs: [                // { left: term, right: definition }
      { left: 'Stocks',   right: 'Ownership stake in a company' },
      { left: 'Bonds',    right: 'Loan to a government or corporation' },
      { left: 'ETF',      right: 'Basket of securities trading on exchange' },
      { left: 'Cash',     right: 'Lowest risk, lowest long-term return' },
    ],
    explanation: 'Each asset class has a distinct risk-return profile. Stocks offer growth potential with volatility; bonds provide income with lower risk; ETFs provide diversification; cash preserves capital.',
    xp:          20,        // full XP for all-correct; partial awarded proportionally
  },

  // ── scenario ───────────────────────────────────────────────
  {
    id:          'sc_001',
    type:        'scenario',
    unit:        'investing',
    topic:       'investor behaviour',
    difficulty:  'hard',
    question:    'You hold a stock that has dropped 15% since you bought it. Fundamentals are unchanged — revenue is growing, margins are healthy, and the CEO reaffirmed guidance. What is the most rational action?',
    options: [
      'Sell immediately to stop the loss from getting worse',
      'Hold and re-evaluate — short-term price moves don\'t change the underlying thesis',
      'Buy more shares aggressively to lower your average cost',
      'Wait for the stock to recover to your purchase price before deciding',
    ],
    answer:      1,         // index
    explanation: 'If fundamentals are intact, a price drop is not a signal to panic. Selling on emotion locks in losses; blindly buying more ignores possible market signals. Holding while re-evaluating is the rational base-case.',
    xp:          20,
  },

];

SAMPLE_QUESTIONS.forEach((question, index) => {
  if (typeof ensureQuestionMetadata === 'function') {
    ensureQuestionMetadata(question, {
      lessonId: 'sample',
      lessonTitle: question.topic || question.unit || 'Sample Question',
      unit: question.unit || 'sample',
      tier: question.difficulty === 'hard'
        ? 'platinum'
        : question.difficulty === 'medium'
          ? 'gold'
          : 'standard',
      index,
      topicId: question.topicId || question.topic
    });
  }
});
