// Ask — focused learning workflows.
// The browser sends educational context to the same-origin backend. The
// Anthropic key is read by server.py and is never available to this file.

let askFinLingoHistory = [];
let askFinLingoContextKey = '';
let askFinLingoContextText = '';
let askFinLingoKind = 'learn';
let askFinLingoBusy = false;
let askFinLingoBusyMode = 'normal';
let askFinLingoArtifact = null;

const ASK_FINLINGO_DISCLAIMER = 'Educational only. Not financial advice.';
const ASK_FINLINGO_MEMORY_KEY = 'finlingo_learning_memory_v1';

function _askEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getLearningMemory() {
  try {
    const raw = localStorage.getItem(ASK_FINLINGO_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(item => item && item.note).slice(-8) : [];
  } catch {
    return [];
  }
}

function _setLearningMemory(items) {
  try {
    localStorage.setItem(ASK_FINLINGO_MEMORY_KEY, JSON.stringify(items.slice(-12)));
  } catch {}
}

// ── Personalization: topics the user asks about ─────────────────────
// Lightweight local trail of what the learner has been curious about. It is
// folded into prompts so explanations can reference prior interest.
const ASK_FINLINGO_TOPICS_KEY = 'finlingo_asked_topics_v1';

function _getAskedTopics() {
  try {
    const raw = localStorage.getItem(ASK_FINLINGO_TOPICS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(item => item && item.topic) : [];
  } catch {
    return [];
  }
}

function recordAskedTopic(topic) {
  const clean = String(topic || '').trim().slice(0, 80);
  if (!clean) return;
  const items = _getAskedTopics().filter(item => item.topic.toLowerCase() !== clean.toLowerCase());
  items.push({ topic: clean, askedAt: new Date().toISOString() });
  try {
    localStorage.setItem(ASK_FINLINGO_TOPICS_KEY, JSON.stringify(items.slice(-16)));
  } catch {}
}

function _askedTopicsContext() {
  const topics = _getAskedTopics().slice(-6).map(item => item.topic);
  if (!topics.length) return '';
  return `Topics this learner has asked about before (reference them when relevant): ${topics.join('; ')}.`;
}

// ── Personalization: concepts flagged for review (Journey loop) ─────
// A shared, local store of concepts the learner stumbled on — quiz misses,
// confusing notes, or market-quiz misses. The Journey page surfaces these so
// the market → lesson → quiz → Journey loop closes ("Inflation needs review").
const COACH_REVIEW_KEY = 'finlingo_coach_review_v1';

const CoachReview = {
  all() {
    try {
      const raw = localStorage.getItem(COACH_REVIEW_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(item => item && item.topic) : [];
    } catch {
      return [];
    }
  },
  flag({ topic, source = 'Ask', lessonId = null, note = '' } = {}) {
    const clean = String(topic || '').trim().slice(0, 60);
    if (!clean) return;
    const items = this.all().filter(item => item.topic.toLowerCase() !== clean.toLowerCase());
    items.push({
      topic: clean,
      source: String(source || 'Ask').slice(0, 40),
      lessonId: Number.isFinite(Number(lessonId)) ? Number(lessonId) : null,
      note: String(note || '').slice(0, 140),
      flaggedAt: new Date().toISOString()
    });
    try {
      localStorage.setItem(COACH_REVIEW_KEY, JSON.stringify(items.slice(-8)));
    } catch {}
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('finlingo:review-updated')); } catch {}
    }
  },
  clear(topic) {
    const clean = String(topic || '').trim().toLowerCase();
    const items = this.all().filter(item => item.topic.toLowerCase() !== clean);
    try {
      localStorage.setItem(COACH_REVIEW_KEY, JSON.stringify(items));
    } catch {}
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('finlingo:review-updated')); } catch {}
    }
  }
};
if (typeof window !== 'undefined') window.CoachReview = CoachReview;

function _learningMemoryContext() {
  const notes = _getLearningMemory();
  const askedLine = _askedTopicsContext();
  if (!notes.length) {
    return askedLine || 'Learning memory: none yet.';
  }
  return [
    'Learning memory from prior lesson reflections:',
    ...notes.slice(-5).map(item => {
      const lessonPart = item.lessonTitle ? `${item.lessonTitle}: ` : '';
      return `- ${lessonPart}${item.note}`;
    }),
    'When useful, connect new explanations back to one of these confusing areas in one sentence.',
    askedLine
  ].filter(Boolean).join('\n');
}

function saveLessonConfusionMemory() {
  const input = document.getElementById('lessonConfusionInput');
  const note = input?.value.trim();
  if (!note) {
    if (typeof showToast === 'function') showToast('Add a short note first', 'error');
    return;
  }
  const lesson = _activeTutorLesson() || (typeof currentLesson !== 'undefined' ? currentLesson : null);
  const items = _getLearningMemory();
  items.push({
    lessonId: lesson?.id || null,
    lessonTitle: lesson?.title || '',
    note: note.slice(0, 260),
    savedAt: new Date().toISOString()
  });
  _setLearningMemory(items);
  input.value = '';
  if (typeof showToast === 'function') showToast('Learning note saved', 'success');
  refreshAskFinLingoContext(_currentAskFinLingoKind());
}

function _currentAskFinLingoKind() {
  const active = document.querySelector('.screen.active')?.id;
  if (['pathScreen', 'courseScreen', 'quizScreen', 'resultScreen'].includes(active)) return 'lesson';
  if (active === 'marketScreen') return 'market';
  return 'learn';
}

function _activeTutorLesson() {
  if (typeof currentLesson !== 'undefined' && currentLesson?.id) return currentLesson;
  if (typeof courseLesson !== 'undefined' && courseLesson?.id) return courseLesson;
  if (typeof learnPreviewLessonId !== 'undefined' && typeof LESSONS !== 'undefined') {
    return LESSONS.find(lesson => lesson.id === learnPreviewLessonId) || null;
  }
  return null;
}

function _lessonTutorContext() {
  const lesson = _activeTutorLesson();
  if (!lesson) {
    return {
      key: 'lesson:general',
      label: 'Current lesson',
      text: 'The user is viewing a beginner FinLingo finance lesson.'
    };
  }
  const concepts = (lesson.miniLessonContent || [])
    .map(item => `${item.title}: ${item.text}`)
    .slice(0, 5);
  const questionIdeas = (lesson.questions || [])
    .map(item => `${item.q} Explanation: ${item.explanation || ''}`)
    .slice(0, 4);
  return {
    key: `lesson:${lesson.id}`,
    label: lesson.title,
    text: [
      `Lesson ID: ${lesson.id}`,
      `Lesson: ${lesson.title}`,
      `Unit: ${lesson.unit || 'Finance foundations'}`,
      `Summary: ${lesson.blurb || ''}`,
      concepts.length ? `Authored lesson concepts:\n${concepts.join('\n')}` : '',
      questionIdeas.length ? `Existing knowledge checks:\n${questionIdeas.join('\n')}` : '',
      _learningMemoryContext()
    ].filter(Boolean).join('\n')
  };
}

function _marketTutorContext() {
  const tone = typeof _getMarketTone === 'function' ? _getMarketTone() : 'flat';
  const read = typeof MARKET_READS !== 'undefined'
    ? (MARKET_READS[tone] || MARKET_READS.flat)
    : null;
  const quoteLines = [];
  if (typeof _marketSnapshot !== 'undefined' && _marketSnapshot?.quotes) {
    ['SPY', 'QQQ', 'BTC'].forEach(symbol => {
      const quote = _marketSnapshot.quotes[symbol];
      if (!quote) return;
      quoteLines.push(
        `${symbol}: price ${Number(quote.price).toFixed(2)}, daily change ${Number(quote.changePct || quote.dailyChangePct || 0).toFixed(2)}%`
      );
    });
  }
  return {
    key: `market:${tone}:${typeof today === 'function' ? today() : ''}`,
    label: "Today's market",
    text: [
      `Date: ${typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10)}`,
      `Broad market tone: ${tone}`,
      read ? `Observed summary: ${read.headline} ${read.snapshot}` : '',
      read ? `Existing educational context: ${read.why}` : '',
      quoteLines.length ? `Available market snapshot:\n${quoteLines.join('\n')}` : 'Live quote details are unavailable.',
      'Do not claim a specific cause unless it appears in this supplied context.',
      _learningMemoryContext()
    ].filter(Boolean).join('\n')
  };
}

function _learningTutorContext() {
  const completedIds = Array.isArray(S?.completedIds) ? S.completedIds : [];
  const completedSet = new Set(completedIds);
  const ladder = typeof Practice !== 'undefined' && Practice.getLadder
    ? Practice.getLadder()
    : null;
  const mastery = typeof getMasterySummary === 'function' ? getMasterySummary() : null;
  const eligible = (typeof LESSONS !== 'undefined' ? LESSONS : [])
    .filter(lesson => !completedSet.has(lesson.id))
    .slice(0, 8)
    .map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      summary: lesson.blurb,
      estimated_minutes: typeof _learnMinutes === 'function' ? _learnMinutes(lesson) : 5
    }));
  return {
    key: `learn:${completedIds.join(',')}:${ladder?.current?.n || 1}`,
    label: 'Your learning plan',
    text: [
      `Completed lesson IDs: ${completedIds.join(', ') || 'none'}`,
      `Completed lesson titles: ${(typeof LESSONS !== 'undefined' ? LESSONS : []).filter(lesson => completedSet.has(lesson.id)).map(lesson => lesson.title).join(', ') || 'none'}`,
      `Current level: ${ladder?.current?.n || 1} — ${ladder?.current?.name || 'Foundations'}`,
      `Weak areas: ${(mastery?.weakestTopics || []).map(topic => `${topic.label || topic.topicId} (${topic.masteryScore || 0}/100)`).join(', ') || 'not enough data yet'}`,
      `Eligible next lessons (recommend only from this list): ${JSON.stringify(eligible)}`,
      _learningMemoryContext()
    ].join('\n')
  };
}

function _askFinLingoContext(kind) {
  if (kind === 'lesson') return _lessonTutorContext();
  if (kind === 'market') return _marketTutorContext();
  return _learningTutorContext();
}

function _renderTutorQuickActions() {
  const container = document.getElementById('askTutorQuickActions');
  if (!container) return;
  const lessonActions = [
    ['example', 'Give Example'],
    ['quiz', 'Quiz Me'],
    ['challenge', 'Challenge Me'],
    ['connect_known', 'Connect This to What I Know']
  ];
  const marketActions = [
    ['market_explainer', 'Explain today’s market'],
    ['connect_known', 'Connect This to What I Know'],
    ['chat', 'Why can good news move prices down?', 'Why can good news move prices down?']
  ];
  const learnActions = [
    ['next_lesson', 'What should I learn next?'],
    ['connect_known', 'Connect This to What I Know'],
    ['chat', 'What is an ETF?', 'What is an ETF?'],
    ['chat', 'How does compound interest work?', 'How does compound interest work?']
  ];
  const actions = askFinLingoKind === 'lesson'
    ? lessonActions
    : askFinLingoKind === 'market'
      ? marketActions
      : learnActions;
  container.innerHTML = actions.map(([mode, label, prompt]) => `
    <button type="button" onclick="runAskFinLingoMode('${mode}','${askFinLingoKind}',${prompt ? `'${_askEscape(prompt)}'` : 'null'})">${_askEscape(label)}</button>
  `).join('');
}

function _cleanTutorMarkdown(value) {
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s+/gm, '')
    .trim();
}

function _splitTutorSections(content) {
  const text = _cleanTutorMarkdown(content);
  const labels = [
    'Direct answer',
    'Simple analogy',
    'Real-world example',
    'Follow-up question',
    'Related lesson'
  ];
  const pattern = new RegExp(`(^|\\n)(${labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:?\\s*`, 'gi');
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return null;
  return matches.map((match, index) => {
    const label = match[2].replace(/\s+/g, ' ').trim();
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const body = text.slice(start, end).trim();
    return { label, body };
  }).filter(section => section.body);
}

function _assistantContentMarkup(content) {
  const sections = _splitTutorSections(content);
  if (!sections) return `<div>${_askEscape(_cleanTutorMarkdown(content))}</div>`;
  return `<div class="ask-response-sections">
    ${sections.map(section => `
      <section class="ask-response-section">
        <h4>${_askEscape(section.label)}</h4>
        <p>${_askEscape(section.body)}</p>
      </section>
    `).join('')}
  </div>`;
}

function _assistantMessageMarkup(content) {
  return `
    <div class="ask-message ask-message-assistant">
      ${_assistantContentMarkup(content)}
      <small>${ASK_FINLINGO_DISCLAIMER}</small>
    </div>`;
}

function _askResponseModeForText(text, fallback = 'normal') {
  const t = String(text || '').toLowerCase();
  if (/\b(explain more|go deeper|dive deeper|deep dive|more detail|detailed explanation|detailed example|full comparison|step by step|walk me through this step by step)\b/.test(t)) {
    return 'detailed';
  }
  return fallback;
}

function _askLoadingMarkup() {
  if (askFinLingoBusyMode === 'build_unit') {
    return `
      <div class="ask-message ask-message-assistant ask-message-loading-rich" role="status" aria-live="polite">
        <div class="ask-loading-orbit" aria-hidden="true"><span></span><span></span><span></span></div>
        <div>
          <strong>Building your unit</strong>
          <ol>
            <li class="is-active">Mapping the topic</li>
            <li>Choosing lessons</li>
            <li>Writing checks</li>
          </ol>
        </div>
      </div>`;
  }
  return `
    <div class="ask-message ask-message-assistant ask-message-loading-rich" role="status" aria-live="polite">
      <span class="ask-message-loading" aria-hidden="true"><span></span><span></span><span></span></span>
      <strong>Working on it</strong>
    </div>`;
}

function _askWelcomeMarkup() {
  const context = _askFinLingoContext(askFinLingoKind);
  const lessonLine = askFinLingoKind === 'lesson' && context?.label
    ? `<div class="ask-welcome-context">Current lesson: ${_askEscape(context.label)}</div>`
    : '';
  return `
    <div class="ask-welcome-state">
      <h3>Ask</h3>
      <p>Your plain-English finance guide.</p>
      ${lessonLine}
    </div>`;
}

function _quizMarkup(artifact) {
  const quiz = artifact.result;
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const answered = artifact.answers || {};
  return `
    <section class="ask-artifact ask-quiz-artifact">
      <div class="ask-artifact-kicker">Active recall</div>
      <h3>${_askEscape(quiz?.title || 'Quick lesson check')}</h3>
      ${questions.map((question, questionIndex) => {
        const selected = answered[questionIndex];
        const hasAnswer = Number.isInteger(selected);
        const correct = Number(question.correct_index);
        return `
          <div class="ask-quiz-question">
            <strong>${questionIndex + 1}. ${_askEscape(question.question)}</strong>
            <div class="ask-quiz-choices">
              ${(question.choices || []).map((choice, choiceIndex) => {
                let cls = '';
                if (hasAnswer && choiceIndex === correct) cls = ' is-correct';
                else if (hasAnswer && choiceIndex === selected) cls = ' is-wrong';
                return `<button type="button" class="${cls}" ${hasAnswer ? 'disabled' : ''} onclick="selectAskFinLingoQuizChoice(${questionIndex},${choiceIndex})">${String.fromCharCode(65 + choiceIndex)}. ${_askEscape(choice)}</button>`;
              }).join('')}
            </div>
            ${hasAnswer ? `
              <div class="ask-quiz-feedback ${selected === correct ? 'is-correct' : 'is-note'}">
                <b>${selected === correct ? 'Correct.' : 'Not quite.'}</b>
                ${_askEscape(question.explanation)}
              </div>` : ''}
          </div>`;
      }).join('')}
      <div class="ask-artifact-disclaimer">${ASK_FINLINGO_DISCLAIMER}</div>
    </section>`;
}

function _marketArtifactMarkup(result) {
  const sections = [
    ['What happened', result.what_happened],
    ['Why it matters', result.why_it_matters],
    ['What beginners should know', result.beginner_takeaway]
  ];
  if (result.why_it_happened) sections.splice(1, 0, ['Why it happened', result.why_it_happened]);
  return `
    <section class="ask-artifact">
      <div class="ask-artifact-kicker">Today’s market explainer</div>
      ${sections.map(([label, value]) => `
        <div class="ask-market-section"><strong>${label}</strong><p>${_askEscape(value || '')}</p></div>
      `).join('')}
      <div class="ask-artifact-disclaimer">${ASK_FINLINGO_DISCLAIMER}</div>
    </section>`;
}

function _nextLessonArtifactMarkup(result) {
  const lessonId = Number(result.lesson_id);
  const eligible = typeof LESSONS !== 'undefined'
    ? LESSONS.find(lesson => lesson.id === lessonId && !(S.completedIds || []).includes(lesson.id))
    : null;
  const fallback = typeof getNextAvailableLesson === 'function' ? getNextAvailableLesson() : null;
  const lesson = eligible || fallback;
  if (!lesson) return _assistantMessageMarkup('You have completed every available lesson. A focused review is the best next step.');
  const minutes = typeof _learnMinutes === 'function' ? _learnMinutes(lesson) : (Number(result.estimated_minutes) || 5);
  return `
    <section class="ask-artifact ask-next-artifact">
      <div class="ask-artifact-kicker">Recommended next lesson</div>
      <h3>${_askEscape(lesson.title)}</h3>
      <p>${_askEscape(result.why || lesson.blurb || '')}</p>
      <div class="ask-next-meta">${minutes} min · ${_askEscape(lesson.unit || 'Finance foundations')}</div>
      <button type="button" onclick="closeAskFinLingo();openCourse(${lesson.id})">Start this lesson</button>
      <div class="ask-artifact-disclaimer">${ASK_FINLINGO_DISCLAIMER}</div>
    </section>`;
}

function _renderAskFinLingoArtifact() {
  if (!askFinLingoArtifact) return '';
  if (askFinLingoArtifact.mode === 'quiz') return _quizMarkup(askFinLingoArtifact);
  if (askFinLingoArtifact.mode === 'market_explainer') return _marketArtifactMarkup(askFinLingoArtifact.result || {});
  if (askFinLingoArtifact.mode === 'market_translate') return _marketArtifactMarkup(askFinLingoArtifact.result || {});
  if (askFinLingoArtifact.mode === 'next_lesson') return _nextLessonArtifactMarkup(askFinLingoArtifact.result || {});
  return '';
}

function _askTutorReveal(selector) {
  const container = document.getElementById('askTutorMessages');
  const node = selector && container ? container.querySelector(selector) : null;
  if (!container || !node) return;
  const containerRect = container.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const topOffset = nodeRect.top - containerRect.top;
  if (topOffset >= 16 && topOffset <= Math.max(24, container.clientHeight - 24)) return;
  if (topOffset > container.clientHeight - 24 || nodeRect.bottom < containerRect.top) {
    container.scrollBy({ top: topOffset - 20, behavior: 'smooth' });
  }
}

function _renderAskFinLingoMessages(options = {}) {
  const container = document.getElementById('askTutorMessages');
  if (!container) return;
  const scrollTop = container.scrollTop;
  const intro = !askFinLingoHistory.length && !askFinLingoArtifact
    ? _askWelcomeMarkup()
    : '';
  const messages = askFinLingoHistory.map(message => {
    if (message.role === 'assistant') return _assistantMessageMarkup(message.content);
    return `<div class="ask-message ask-message-user">${_askEscape(message.content)}</div>`;
  }).join('');
  const loading = askFinLingoBusy ? _askLoadingMarkup() : '';
  container.innerHTML = `${intro}${messages}${_renderAskFinLingoArtifact()}${loading}`;
  if (options.revealArtifact) {
    requestAnimationFrame(() => _askTutorReveal('.ask-artifact'));
  } else {
    container.scrollTop = scrollTop;
  }
}

function openAskFinLingo(kind = null, options = {}) {
  askFinLingoKind = kind || _currentAskFinLingoKind();
  const context = _askFinLingoContext(askFinLingoKind);
  if (context.key !== askFinLingoContextKey) {
    askFinLingoContextKey = context.key;
    askFinLingoContextText = context.text;
    askFinLingoHistory = [];
    askFinLingoArtifact = null;
  } else {
    askFinLingoContextText = context.text;
  }
  document.getElementById('askTutorContext').textContent = context.label;
  document.getElementById('askTutorInput').placeholder = askFinLingoKind === 'lesson'
    ? 'Ask about this lesson…'
    : askFinLingoKind === 'market'
      ? 'Ask about today’s market story…'
      : 'Ask a finance learning question…';
  _renderTutorQuickActions();
  _renderAskFinLingoMessages();
  document.getElementById('askTutorPanel').classList.add('open');
  document.getElementById('askTutorPanel').setAttribute('aria-hidden', 'false');
  document.getElementById('askTutorBackdrop').classList.add('open');
  document.body.classList.add('ask-tutor-visible');
  if (options.focusInput !== false) {
    setTimeout(() => document.getElementById('askTutorInput')?.focus(), 120);
  }
}

function refreshAskFinLingoContext(kind = null) {
  askFinLingoKind = kind || _currentAskFinLingoKind();
  const context = _askFinLingoContext(askFinLingoKind);
  if (context.key !== askFinLingoContextKey) {
    askFinLingoContextKey = context.key;
    askFinLingoHistory = [];
    askFinLingoArtifact = null;
  }
  askFinLingoContextText = context.text;
  const contextEl = document.getElementById('askTutorContext');
  if (contextEl) contextEl.textContent = context.label;
  _renderTutorQuickActions();
  _renderAskFinLingoMessages();
}

function closeAskFinLingo() {
  document.getElementById('askTutorPanel')?.classList.remove('open');
  document.getElementById('askTutorPanel')?.setAttribute('aria-hidden', 'true');
  document.getElementById('askTutorBackdrop')?.classList.remove('open');
  document.body.classList.remove('ask-tutor-visible');
}

function handleAskFinLingoKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    document.getElementById('askTutorForm')?.requestSubmit();
  }
}

async function _requestAskFinLingo(mode, prompt, responseMode = 'normal') {
  const response = await fetch('/api/ask-finlingo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      mode,
      responseMode,
      context: askFinLingoContextText,
      messages: mode === 'chat'
        ? askFinLingoHistory.slice(-8)
        : [{ role: 'user', content: prompt }]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Tutor request failed (${response.status})`);
  return payload;
}

async function runAskFinLingoMode(mode, kind = null, customPrompt = null) {
  if (askFinLingoBusy) return;
  openAskFinLingo(kind || _currentAskFinLingoKind(), { focusInput: false });
  const prompts = {
    simplify: 'Explain this lesson in simple terms. Keep it concise and beginner-friendly.',
    analogy: 'Explain this lesson with a sports analogy, then explain where the analogy is imperfect.',
    real_world: 'Show me how this lesson concept appears in real life.',
    example: 'Give one concrete example for this lesson concept. Keep it concise.',
    challenge: 'Challenge me with one Socratic scenario question about this lesson.',
    connect_known: 'Connect this to what I already know from earlier lessons and anything I found confusing.',
    quiz: 'Create a three-question quiz for this lesson.',
    market_explainer: 'Explain today’s supplied market summary in plain English.',
    market_translate: 'Translate this market language into plain English.',
    next_lesson: 'What should I learn next based on my progress and weak areas?'
  };
  const prompt = customPrompt || prompts[mode] || 'Help me understand this finance concept.';
  const responseMode = mode === 'simplify'
    ? 'simple'
    : mode === 'quiz'
      ? 'quiz'
      : _askResponseModeForText(prompt, 'normal');
  // Track interest: a custom chat prompt records its own topic; structured
  // modes record the concept the learner is acting on (lesson or market).
  if (mode === 'chat' && customPrompt) {
    recordAskedTopic(customPrompt);
  } else if (mode !== 'chat') {
    const focus = _askFinLingoContext(kind || askFinLingoKind);
    if (focus?.label && focus.label !== 'Your learning plan') recordAskedTopic(focus.label);
  }
  askFinLingoArtifact = null;
  if (mode !== 'chat') {
    askFinLingoHistory = [];
  } else {
    askFinLingoHistory.push({ role: 'user', content: prompt });
  }
  askFinLingoBusy = true;
  askFinLingoBusyMode = mode === 'build_unit' ? 'build_unit' : 'normal';
  document.getElementById('askTutorSend').disabled = true;
  _renderAskFinLingoMessages();
  try {
    const payload = await _requestAskFinLingo(mode, prompt, responseMode);
    if (payload.result) {
      askFinLingoArtifact = { mode, result: payload.result, answers: {} };
    } else {
      askFinLingoHistory.push({ role: 'assistant', content: payload.answer || 'I could not generate an answer.' });
    }
  } catch (error) {
    askFinLingoHistory.push({ role: 'assistant', content: error.message || 'Ask is temporarily unavailable.' });
  } finally {
    askFinLingoBusy = false;
    askFinLingoBusyMode = 'normal';
    document.getElementById('askTutorSend').disabled = false;
    _renderAskFinLingoMessages({ revealArtifact: mode !== 'chat' });
  }
}

async function translateMarketLanguage() {
  if (askFinLingoBusy) return;
  const input = document.getElementById('marketTranslatorInput');
  const output = document.getElementById('marketTranslatorOutput');
  const phrase = input?.value.trim();
  if (!phrase) {
    if (typeof showToast === 'function') showToast('Enter market language to translate', 'error');
    return;
  }
  askFinLingoKind = 'market';
  askFinLingoContextText = `${_marketTutorContext().text}\n\nMarket phrase to translate: ${phrase}`;
  if (output) output.innerHTML = '<div class="market-translator-loading">Translating…</div>';
  askFinLingoBusy = true;
  try {
    const payload = await _requestAskFinLingo('market_translate', phrase, 'normal');
    const result = payload.result || {};
    if (output) {
      output.innerHTML = `
        <div><strong>What happened</strong><p>${_askEscape(result.what_happened || '')}</p></div>
        <div><strong>Why it matters</strong><p>${_askEscape(result.why_it_matters || '')}</p></div>
        <div><strong>What beginners should know</strong><p>${_askEscape(result.beginner_takeaway || '')}</p></div>
      `;
    }
  } catch (error) {
    if (output) output.innerHTML = `<div class="market-translator-error">${_askEscape(error.message || 'Market Translator is temporarily unavailable.')}</div>`;
  } finally {
    askFinLingoBusy = false;
  }
}

async function submitAskFinLingo(event) {
  event.preventDefault();
  if (askFinLingoBusy) return;
  const input = document.getElementById('askTutorInput');
  const question = input?.value.trim();
  if (!question) return;
  askFinLingoArtifact = null;
  recordAskedTopic(question);
  askFinLingoHistory.push({ role: 'user', content: question });
  input.value = '';
  askFinLingoBusy = true;
  askFinLingoBusyMode = 'normal';
  document.getElementById('askTutorSend').disabled = true;
  _renderAskFinLingoMessages();
  try {
    const payload = await _requestAskFinLingo('chat', question, _askResponseModeForText(question, 'normal'));
    askFinLingoHistory.push({ role: 'assistant', content: payload.answer || 'I could not generate an answer.' });
  } catch (error) {
    askFinLingoHistory.push({ role: 'assistant', content: error.message || 'Ask is temporarily unavailable.' });
  } finally {
    askFinLingoBusy = false;
    askFinLingoBusyMode = 'normal';
    document.getElementById('askTutorSend').disabled = false;
    _renderAskFinLingoMessages();
  }
}

function selectAskFinLingoQuizChoice(questionIndex, choiceIndex) {
  if (askFinLingoArtifact?.mode !== 'quiz') return;
  if (Number.isInteger(askFinLingoArtifact.answers?.[questionIndex])) return;
  askFinLingoArtifact.answers[questionIndex] = choiceIndex;
  // Missed a generated question → flag the concept for review.
  const question = askFinLingoArtifact.result?.questions?.[questionIndex];
  if (question && choiceIndex !== Number(question.correct_index)) {
    const lesson = _activeTutorLesson();
    const topic = lesson?.title
      || (askFinLingoArtifact.result?.title || '').replace(/^quick lesson check$/i, '').trim()
      || 'This concept';
    CoachReview.flag({
      topic,
      source: 'Ask quiz',
      lessonId: lesson?.id || null,
      note: 'Missed a question in an Ask-generated quiz.'
    });
  }
  _renderAskFinLingoMessages();
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('askTutorPanel')?.classList.contains('open')) {
    closeAskFinLingo();
  }
});

// Close (hide) the Ask overlay whenever the user navigates to another primary
// screen, so it can't linger on top of Learn/Market/Mastery/Classroom/Coach.
// closeAskFinLingo() only removes the panel's `open` state — it does NOT clear
// askFinLingoHistory/context, so the saved conversation is preserved and
// re-opening restores it. Submission, Claude calls, and response parsing are
// untouched.
window.addEventListener('finlingo:screen-changed', () => {
  if (document.getElementById('askTutorPanel')?.classList.contains('open')) {
    closeAskFinLingo();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  refreshAskFinLingoContext(_currentAskFinLingoKind());
});
