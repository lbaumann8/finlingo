// FinLingo — Ask page (AI-first front door).
//
// A large centered input with a typewriter prompt and a conversation thread
// where Ask can explain, quiz, or build a custom
// mini-unit that the learner can save to Learn. Reuses the same same-origin
// /api/ask-finlingo endpoint and the tutor.js text helpers.

(function (global) {
  'use strict';

  const EXAMPLE_PROMPTS = [
    'What is an ETF?',
    'Why do interest rates matter?',
    'Should I invest in bonds?',
    "Explain inflation like I'm 15.",
    'What happened in the market today?',
    'What is an IPO?',
    'How does a Roth IRA work?'
  ];

  const DEPTH_OPTIONS = ['quick', 'complete', 'standard', 'deep'];
  const DEPTH_COPY = {
    quick: {
      name: 'Quick',
      explanation: 'Learn the essential ideas without going deeply into every area.'
    },
    complete: {
      name: 'Complete',
      explanation: 'Cover the whole topic without adding extra detail that would feel repetitive.'
    },
    standard: {
      name: 'Standard',
      explanation: 'Understand the major concepts and how they connect.'
    },
    deep: {
      name: 'Deep dive',
      explanation: 'Explore the topic in more detail with additional examples, risks, and real-world applications.'
    }
  };
  const SCOPE_RANGES = {
    narrow: {
      label: 'Narrow topic',
      recommendedDepth: 'quick',
      ranges: { quick: { min: 2, max: 3 }, standard: { min: 4, max: 5 }, deep: { min: 6, max: 7 } }
    },
    medium: {
      label: 'Medium topic',
      recommendedDepth: 'standard',
      ranges: { quick: { min: 3, max: 4 }, standard: { min: 5, max: 7 }, deep: { min: 8, max: 10 } }
    },
    broad: {
      label: 'Broad topic',
      recommendedDepth: 'standard',
      ranges: { quick: { min: 5, max: 7 }, standard: { min: 8, max: 10 }, deep: { min: 11, max: 13 } }
    },
    very_broad: {
      label: 'Very broad topic',
      recommendedDepth: 'deep',
      ranges: { quick: { min: 6, max: 8 }, standard: { min: 9, max: 12 }, deep: { min: 11, max: 13, course: true } }
    }
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _cleanListItem(value) {
    if (global.MicroData && typeof global.MicroData.cleanGeneratedListItem === 'function') {
      return global.MicroData.cleanGeneratedListItem(value);
    }
    return String(value == null ? '' : value).trim().replace(/^(?:[•●]\s*|[*]\s+|[-–—]\s+|\d+[.)]\s+)/, '').trim();
  }

  function _cleanGeneratedStrings(value) {
    if (Array.isArray(value)) return value.map(_cleanGeneratedStrings);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach(key => { out[key] = _cleanGeneratedStrings(value[key]); });
      return out;
    }
    return typeof value === 'string' ? _cleanListItem(value) : value;
  }

  // ── Custom unit store (shared with the Learn page) ──────────────────
  const UNITS_KEY = 'finlingo_custom_units_v1';
  const CoachUnits = {
    all() {
      try {
        const raw = localStorage.getItem(UNITS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(u => u && u.id && u.title) : [];
      } catch { return []; }
    },
    get(id) { return this.all().find(u => u.id === id) || null; },
    save(unit) {
      const items = this.all().filter(u => u.id !== unit.id);
      items.push(unit);
      try {
        localStorage.setItem(UNITS_KEY, JSON.stringify(items.slice(-24)));
        return true;
      } catch {
        return false;
      }
    },
    has(title) { return this.all().some(u => (u.title || '').toLowerCase() === String(title || '').toLowerCase()); },
    indexOf(id) { return this.all().findIndex(u => u.id === id); },
    remove(id) {
      try { localStorage.setItem(UNITS_KEY, JSON.stringify(this.all().filter(u => u.id !== id))); } catch {}
    },
    // Re-insert a previously removed unit at its original position. Used by the
    // swipe-to-delete Undo flow so a restored unit keeps its place in the list.
    restoreAt(unit, index) {
      if (!unit || !unit.id) return false;
      const items = this.all().filter(u => u.id !== unit.id);
      const i = Math.max(0, Math.min(items.length, Number.isFinite(Number(index)) ? Number(index) : items.length));
      items.splice(i, 0, unit);
      try { localStorage.setItem(UNITS_KEY, JSON.stringify(items.slice(-24))); return true; } catch { return false; }
    }
  };
  global.CoachUnits = CoachUnits;

  function _makeUnitId() {
    // No Date.now()/random restrictions here (browser), but keep it simple.
    return 'cu_' + Math.abs(Date.now()).toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function _stableHash(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function _slug(value) {
    return String(value || 'custom-unit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'custom-unit';
  }

  function _unitTitle(data, topic) {
    return data?.unitTitle || data?.unit_title || data?.title || topic || 'Custom unit';
  }

  function _unitDescription(data) {
    return data?.unitDescription || data?.description || '';
  }

  function _unitStableId(data, topic) {
    const title = _unitTitle(data, topic);
    const lessons = (data?.lessons || []).map(l => typeof l === 'string' ? l : `${l?.title || ''}:${l?.description || l?.summary || ''}`).join('|');
    return `cu_${_slug(title)}_${_stableHash([title, topic || '', _unitDescription(data), lessons].join('|'))}`;
  }

  // ── Conversation state ──────────────────────────────────────────────
  // `thread` is a LIVE reference to the active chat's `messages` array, so
  // mutating it mutates the stored chat; _persistActive() then writes it.
  let thread = [];      // {id, role, kind, text|data, answers, topic, saved, createdAt, mode}
  let busy = false;
  let busyLabel = '';
  let busyMode = 'normal';
  let activeCoachRequest = null;
  let lastTopic = '';
  let composerVisible = true;
  let activeChatId = null;
  let depthSelector = null;
  const unitJobPollers = new Map();
  // Monotonic generation/session token. Bumped on a full app-data reset so any
  // in-flight poll started before the reset is recognised as stale and refuses
  // to apply its (late) response — preventing a deleted unit/chat from coming
  // back after the user resets.
  let _resetEpoch = 0;
  const UNIT_JOB_ACTIVE_STATUSES = new Set([
    'queued',
    'generating_outline',
    'generating_lessons',
    'generating_quizzes',
    'validating'
  ]);
  const UNIT_JOB_POLL_MS = 1500;
  // Each poll advances the durable job by one generation step on the server, so
  // a single request can legitimately take several seconds (one Anthropic call).
  // The ceiling sits comfortably above that so a productive step is never cut off.
  const UNIT_JOB_NETWORK_TIMEOUT_MS = 25000;
  const UNIT_JOB_MAX_CONSECUTIVE_POLL_FAILURES = 5;
  // After this many consecutive failures we stop retrying silently and surface a
  // restrained error with Retry/Cancel, so the card never stays stuck forever.
  const UNIT_JOB_MAX_HARD_POLL_FAILURES = 12;
  let userScrollLockedDuringGeneration = false;
  let unitJobTicker = null;          // 1s interval driving the live time estimate
  let answerReveal = null;           // active streamed-answer reveal controller
  // Streamed (chunked) answer reveal tuning — fast, polished, not slow typing.
  const REVEAL_INTERVAL_MS = 26;     // time between reveal steps
  const REVEAL_MIN_CHARS = 38;       // chars revealed per step (lower bound)
  const REVEAL_MAX_CHARS = 70;       // chars revealed per step (upper bound)

  function _cssEscapeId(value) {
    return (global.CSS && typeof global.CSS.escape === 'function')
      ? global.CSS.escape(String(value))
      : String(value).replace(/["\\]/g, '\\$&');
  }

  function _hasStore() { return typeof global.ChatStore !== 'undefined' && global.ChatStore; }
  function _nowIso() { return new Date().toISOString(); }
  function _msgId() { return 'message_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36); }
  function _requestId() { return 'request_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36); }

  const REQUEST_TIMEOUT_MS = {
    chat: 45000,
    simple_answer: 35000,
    quiz: 65000,
    market_explainer: 50000,
    market_translate: 40000,
    next_lesson: 40000
  };

  function _timeoutForMode(mode, extra) {
    return REQUEST_TIMEOUT_MS[mode] || REQUEST_TIMEOUT_MS.chat;
  }

  function _stamp(entry, mode) {
    if (!entry.id) entry.id = _msgId();
    if (!entry.createdAt) entry.createdAt = _nowIso();
    if (mode && !entry.mode) entry.mode = mode;
    return entry;
  }

  function _lastTopicFromThread() {
    for (let i = thread.length - 1; i >= 0; i--) { if (thread[i].topic) return thread[i].topic; }
    return '';
  }

  function _coachScrollContainer() {
    return document.getElementById('coachThread');
  }

  function _hasActiveUnitJob() {
    return thread.some(entry => entry?.kind === 'unit_job' && UNIT_JOB_ACTIVE_STATUSES.has(entry.status));
  }

  function _captureThreadScroll() {
    const el = _coachScrollContainer();
    if (!el) return null;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      nearBottom: distanceFromBottom <= 80
    };
  }

  function _restoreThreadScroll(snapshot) {
    const el = _coachScrollContainer();
    if (!el || !snapshot) return;
    el.scrollTop = Math.max(0, Math.min(snapshot.scrollTop, el.scrollHeight - el.clientHeight));
  }

  function _revealThreadEntry(messageId, behavior) {
    const el = _coachScrollContainer();
    if (!el || !messageId) return;
    const safeId = global.CSS && typeof global.CSS.escape === 'function'
      ? global.CSS.escape(String(messageId))
      : String(messageId).replace(/["\\]/g, '\\$&');
    const node = el.querySelector(`[data-message-id="${safeId}"]`);
    if (!node) return;
    const containerRect = el.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const topOffset = nodeRect.top - containerRect.top;
    const bottomOffset = nodeRect.bottom - containerRect.bottom;
    if (topOffset >= 16 && topOffset <= Math.max(24, el.clientHeight - 24)) return;
    if (topOffset > el.clientHeight - 24) {
      el.scrollBy({ top: topOffset - 20, behavior: behavior || 'smooth' });
      return;
    }
    if (bottomOffset < 0) {
      el.scrollBy({ top: topOffset - 20, behavior: behavior || 'smooth' });
    }
  }

  function _finalizeThreadScroll(snapshot, options) {
    const opts = options || {};
    if (opts.revealEntryId) {
      requestAnimationFrame(() => _revealThreadEntry(opts.revealEntryId, opts.revealBehavior || 'smooth'));
      return;
    }
    if (opts.allowAutoscroll && snapshot?.nearBottom && !userScrollLockedDuringGeneration) {
      const el = _coachScrollContainer();
      if (el) el.scrollTop = el.scrollHeight;
      return;
    }
    _restoreThreadScroll(snapshot);
  }

  // Bind the working thread to the active chat (creating/restoring as needed).
  function _ensureActiveLoaded(force) {
    if (!_hasStore()) return;
    const chat = global.ChatStore.ensureActive();
    if (force || chat.id !== activeChatId) {
      activeChatId = chat.id;
      thread = chat.messages;                 // live reference
      thread.forEach(e => { if (e && e.kind === 'unit') _syncUnitSavedState(e); });
      lastTopic = _lastTopicFromThread();
      composerVisible = thread.length === 0;
    }
  }

  // Persist the active chat after any meaningful change. Sets the title from
  // the first question and keeps generatedUnits in sync for the data model.
  function _persistActive() {
    if (!_hasStore() || !activeChatId) return;
    const chat = global.ChatStore.get(activeChatId);
    if (!chat) return;
    chat.messages = thread; // same ref, but keep explicit
    if (!chat.title || chat.title === 'New conversation') {
      const firstUser = thread.find(e => e.role === 'user' && e.text);
      if (firstUser) chat.title = global.ChatStore.titleFromQuestion(firstUser.text);
    }
    chat.generatedUnits = thread
      .filter(e => e.kind === 'unit' && e.data)
      .map(e => ({
        id: e.unitId || _unitStableId(e.data, e.topic),
        chatId: chat.id,
        title: _unitTitle(e.data, e.topic),
        description: _unitDescription(e.data),
        lessons: (e.data.lessons || []),
        selectedDepth: e.data.selectedDepth || e.data.selected_depth || '',
        topicScope: e.data.topicScope || e.data.topic_scope || '',
        requestedLessonRange: e.data.requestedLessonRange || e.data.requested_lesson_range || null,
        actualLessonCount: e.data.actualLessonCount || (Array.isArray(e.data.lessons) ? e.data.lessons.length : 0),
        savedToLearn: Boolean(e.saved),
        createdAt: e.createdAt || _nowIso()
      }));
    chat.updatedAt = _nowIso();
    global.ChatStore.persist();
  }

  function _persistThreadFor(chatId, messages) {
    if (!_hasStore() || !chatId) return;
    if (chatId === activeChatId) {
      _persistActive();
      return;
    }
    const chat = global.ChatStore.get(chatId);
    if (!chat) return;
    chat.messages = messages;
    if (!chat.title || chat.title === 'New conversation') {
      const firstUser = messages.find(e => e.role === 'user' && e.text);
      if (firstUser) chat.title = global.ChatStore.titleFromQuestion(firstUser.text);
    }
    chat.generatedUnits = messages
      .filter(e => e.kind === 'unit' && e.data)
      .map(e => ({
        id: e.unitId || _unitStableId(e.data, e.topic),
        chatId,
        title: _unitTitle(e.data, e.topic),
        description: _unitDescription(e.data),
        lessons: (e.data.lessons || []),
        selectedDepth: e.data.selectedDepth || e.data.selected_depth || '',
        topicScope: e.data.topicScope || e.data.topic_scope || '',
        requestedLessonRange: e.data.requestedLessonRange || e.data.requested_lesson_range || null,
        actualLessonCount: e.data.actualLessonCount || (Array.isArray(e.data.lessons) ? e.data.lessons.length : 0),
        savedToLearn: Boolean(e.saved),
        createdAt: e.createdAt || _nowIso()
      }));
    chat.updatedAt = _nowIso();
    global.ChatStore.persist();
  }

  function _entryRequestText(entry) {
    return String(entry?.requestText || entry?.requestContent || entry?.apiPrompt || entry?.text || '').trim();
  }

  function _normalSuggestionState(entry) {
    if (!entry) return 'none';
    const state = String(entry.suggestionState || '').toLowerCase();
    if (state === 'active' || state === 'consumed' || state === 'none') return state;
    return Array.isArray(entry.suggestions) && entry.suggestions.length ? 'active' : 'none';
  }

  function _hasSuggestionGroup(entry) {
    return entry && entry.role === 'assistant' && ['text', 'quiz', 'market'].includes(entry.kind || 'text');
  }

  function _isNewestSuggestionOwner(index) {
    for (let i = thread.length - 1; i >= 0; i--) {
      if (_hasSuggestionGroup(thread[i])) return i === index;
    }
    return false;
  }

  function _consumeActiveSuggestions() {
    let changed = false;
    thread.forEach(entry => {
      if (_hasSuggestionGroup(entry) && _normalSuggestionState(entry) === 'active') {
        entry.suggestionState = 'consumed';
        changed = true;
      }
    });
    return changed;
  }

  function _responseModeForText(text, fallback) {
    const t = String(text || '').toLowerCase();
    if (/\b(explain more|go deeper|dive deeper|deep dive|more detail|detailed explanation|detailed example|full comparison|step by step|walk me through this step by step)\b/.test(t)) {
      return 'detailed';
    }
    return fallback || 'normal';
  }

  // Build a valid, alternating message history (ending with the real prompt)
  // so follow-ups carry prior context. Excludes the just-pushed user turn.
  const _HISTORY_MAX = 7;
  function _historyMessages(finalPrompt) {
    const turns = [];
    thread.forEach((e, i) => {
      if (i === thread.length - 1) return; // skip current user turn
      if (e.role === 'user') {
        const userContent = _entryRequestText(e);
        if (userContent) turns.push({ role: 'user', content: userContent.slice(0, 1400) });
      }
      else if (e.role === 'assistant') {
        let c = e.text;
        if (!c) {
          if (e.kind === 'unit') c = 'Generated a learning unit on ' + (e.topic || 'this topic') + '.';
          else if (e.kind === 'quiz') c = 'Generated a quiz on ' + (e.topic || 'this topic') + '.';
          else if (e.kind === 'market') c = 'Explained today’s market.';
        }
        if (c && !e.isError) turns.push({ role: 'assistant', content: String(c).slice(0, 1400) });
      }
    });
    // Collapse to strict alternation, then append the real prompt as the last user turn.
    const clean = [];
    turns.forEach(t => {
      if (!clean.length) { if (t.role === 'user') clean.push(t); }
      else if (t.role !== clean[clean.length - 1].role) clean.push(t);
      else clean[clean.length - 1] = t;
    });
    clean.push({ role: 'user', content: finalPrompt });
    let out = clean.slice(-_HISTORY_MAX);
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
  }

  // ── Ask call ────────────────────────────────────────────────────────
  function _coachContext() {
    if (typeof _learningTutorContext === 'function') {
      try { return _learningTutorContext().text; } catch (_) {}
    }
    return 'The learner is a beginner exploring finance through FinLingo.';
  }

  async function _coachFetch(mode, prompt, context, history, extra) {
    const messages = (Array.isArray(history) && history.length) ? history : [{ role: 'user', content: prompt }];
    const requestBody = Object.assign({ mode, context: context || _coachContext(), messages }, extra || {});
    const timeoutMs = _timeoutForMode(mode, requestBody);
    const controller = new AbortController();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      const reason = new Error('client_timeout');
      reason.name = 'ClientTimeout';
      try { controller.abort(reason); } catch (_) { controller.abort(); }
    }, timeoutMs);
    if (mode === 'build_unit') {
      const range = requestBody.lessonRange || {};
      console.log('[build-unit request]', {
        requestId: requestBody.requestId,
        topic: requestBody.topic || prompt,
        selectedDepth: requestBody.selectedDepth,
        minLessons: range.min,
        maxLessons: range.max,
        targetLessonCount: requestBody.targetLessonCount,
        requestBody
      });
    }
    try {
      const res = await fetch('/api/ask-finlingo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify(requestBody)
      }).catch(error => {
        if (error?.name === 'AbortError' || error?.name === 'ClientTimeout') {
          const timeoutError = new Error('The request took longer than expected.');
          timeoutError.category = 'client_timeout';
          timeoutError.retryable = true;
          timeoutError.status = 408;
          throw timeoutError;
        }
        const networkError = new Error('The network connection dropped.');
        networkError.category = 'network_failure';
        networkError.retryable = true;
        throw networkError;
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error(payload.message || payload.error || `Ask request failed (${res.status})`);
        error.category = payload.category || (res.status >= 500 ? 'temporary_server_error' : 'request_failed');
        error.retryable = Boolean(payload.retryable || [429, 502, 503, 504].includes(res.status));
        error.status = res.status;
        throw error;
      }
      return payload;
    } finally {
      settled = true;
      clearTimeout(timer);
    }
  }

  async function _unitJobFetch(path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UNIT_JOB_NETWORK_TIMEOUT_MS);
    try {
      const response = await fetch(path, Object.assign({
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      }, options || {}));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `Unit job request failed (${response.status})`);
        error.status = response.status;
        error.category = payload.category || 'unit_job_request_failed';
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('Unit job status request timed out.');
        timeoutError.category = 'poll_timeout';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function _canonicalUnitTopic(topic) {
    return String(topic || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
  }

  function _unitJobStartBody(entry) {
    const selection = entry.depthSelection || {};
    const range = selection.lessonRange || {};
    return {
      originalTopic: entry.topic,
      canonicalTopic: _canonicalUnitTopic(entry.topic),
      selectedDepth: selection.selectedDepth,
      minimumLessonCount: Number(range.min),
      maximumLessonCount: Number(range.max),
      targetLessonCount: Number(selection.targetLessonCount),
      sourceChatId: entry.sourceChatId,
      sourceMessageId: entry.sourceMessageId,
      clientRequestId: entry.clientRequestId,
      courseOutlineRequested: Boolean(selection.courseOutlineRequested),
      scopeReason: selection.scopeReason || '',
      approvedLessonConcepts: selection.approvedLessonConcepts || []
    };
  }

  function _unitJobEntryFor(messages, clientRequestId, jobId) {
    return (messages || []).find(entry =>
      entry && entry.kind === 'unit_job'
      && ((jobId && entry.jobId === jobId) || entry.clientRequestId === clientRequestId)
    ) || null;
  }

  function _stopUnitJobPoll(jobId) {
    const poller = unitJobPollers.get(jobId);
    if (!poller) return;
    poller.stopped = true;
    if (poller.timer) clearTimeout(poller.timer);
    unitJobPollers.delete(jobId);
  }

  function _stopAllUnitJobPolls() {
    Array.from(unitJobPollers.keys()).forEach(_stopUnitJobPoll);
  }

  function _applyUnitJobStatus(entry, status, chatId, messages) {
    if (!entry || !status) return;
    const wasActive = UNIT_JOB_ACTIVE_STATUSES.has(entry.status);
    const previousLessons = Number(entry.completedLessonCount) || 0;
    const previousUpdatedAt = entry.updatedAt || entry.createdAt || _nowIso();
    entry.jobId = status.jobId || entry.jobId;
    entry.status = status.status || entry.status;
    entry.stage = status.stage || entry.stage;
    entry.completedLessonCount = Number(status.completedLessonCount) || 0;
    entry.totalLessonCount = Number(status.totalLessonCount) || 0;
    entry.retryCount = Number(status.retryCount) || 0;
    entry.errorCategory = status.errorCategory || '';
    entry.failedComponent = status.failedComponent || '';
    entry.pollingIssue = '';
    entry.updatedAt = status.updatedAt || _nowIso();
    _updateUnitJobTiming(entry, previousLessons, previousUpdatedAt);

    let justCompleted = false;
    if (status.status === 'completed' && status.unit) {
      const kind = status.unit.type === 'course_outline' ? 'course_outline' : 'unit';
      entry.kind = kind;
      entry.data = status.unit;
      entry.unitId = kind === 'unit' ? (status.unit.id || _unitStableId(status.unit, entry.topic)) : '';
      entry.saved = kind === 'unit' ? Boolean(CoachUnits.get(entry.unitId)) : false;
      entry.suggestionState = 'none';
      entry.fromUnitJob = true;
      justCompleted = wasActive;
    }
    _persistThreadFor(chatId, messages);
    if (chatId === activeChatId && _askScreenActive()) {
      // On completion, bring only the TOP of the finished overview into view
      // (never jump to the bottom). Otherwise update in place without moving.
      if (justCompleted) _renderThread({ revealEntryId: entry.id, revealBehavior: 'smooth' });
      else _renderThread({ preserveScroll: true });
    }
  }

  function _scheduleUnitJobPoll(entry, chatId, messages, delay) {
    if (!entry?.jobId || !UNIT_JOB_ACTIVE_STATUSES.has(entry.status)) return;
    if (unitJobPollers.has(entry.jobId)) return;
    const poller = { stopped: false, timer: null, failures: 0, epoch: _resetEpoch };
    unitJobPollers.set(entry.jobId, poller);

    const poll = async () => {
      if (poller.stopped) return;
      // Keep polling even when the Ask screen is NOT visible (user opened Learn,
      // Account, or backgrounded the tab) so a durable server build keeps
      // advancing and is up to date the instant they return. Stop only when the
      // active chat changes or the app data was reset (stale generation epoch).
      if (poller.epoch !== _resetEpoch || chatId !== activeChatId) {
        _stopUnitJobPoll(entry.jobId);
        return;
      }
      try {
        const status = await _unitJobFetch(`/api/unit-jobs/${encodeURIComponent(entry.jobId)}`);
        poller.failures = 0;
        _applyUnitJobStatus(entry, status, chatId, messages);
        if (!UNIT_JOB_ACTIVE_STATUSES.has(status.status)) {
          _stopUnitJobPoll(entry.jobId);
          return;
        }
      } catch (_) {
        poller.failures += 1;
        if (poller.failures >= UNIT_JOB_MAX_HARD_POLL_FAILURES) {
          // Give up gracefully rather than spin forever on "Preparing unit".
          // The job is kept, so Retry resumes polling the same job (or, if the
          // server already failed it, re-runs it) instead of starting over.
          _stopUnitJobPoll(entry.jobId);
          entry.status = 'failed';
          entry.stage = 'failed';
          entry.errorCategory = 'connection_lost';
          entry.pollingIssue = '';
          _persistThreadFor(chatId, messages);
          if (chatId === activeChatId && _askScreenActive()) _renderThread({ preserveScroll: true });
          return;
        }
        if (poller.failures >= UNIT_JOB_MAX_CONSECUTIVE_POLL_FAILURES) {
          entry.pollingIssue = 'Progress is temporarily unavailable. FinLingo is still trying to reconnect.';
          _persistThreadFor(chatId, messages);
          if (chatId === activeChatId && _askScreenActive()) _renderThread({ preserveScroll: true });
        }
      }
      if (!poller.stopped) poller.timer = setTimeout(poll, UNIT_JOB_POLL_MS);
    };
    poller.timer = setTimeout(poll, Math.max(0, Number(delay) || 0));
  }

  function _resumeUnitJobsForActiveChat() {
    if (!_askScreenActive()) return;
    thread.forEach(entry => {
      if (entry?.kind === 'unit_job' && entry.jobId && UNIT_JOB_ACTIVE_STATUSES.has(entry.status)) {
        _scheduleUnitJobPoll(entry, activeChatId, thread, 100);
      }
    });
  }

  async function _startUnitJob(entry, chatId, messages) {
    const status = await _unitJobFetch('/api/unit-jobs', {
      method: 'POST',
      body: JSON.stringify(_unitJobStartBody(entry))
    });
    _applyUnitJobStatus(entry, status, chatId, messages);
    if (UNIT_JOB_ACTIVE_STATUSES.has(status.status)) {
      _scheduleUnitJobPoll(entry, chatId, messages, UNIT_JOB_POLL_MS);
    }
    return status;
  }

  function _detectIntent(text) {
    const t = String(text || '').toLowerCase();
    if (/\b(build|create|make|design|teach me|give me)\b[\s\S]*\b(unit|course|curriculum|path|lessons?|plan|module)\b/.test(t)
      || /\b(unit|course|curriculum)\b[\s\S]*\bon\b/.test(t)
      || /^\s*learn\s+/.test(t)) return 'build';
    if (/\bquiz\b/.test(t)) return 'quiz';
    if (/today'?s market|explain the market|market in plain|the market today/.test(t)) return 'market';
    return 'chat';
  }

  function _isGenericBuildUnitLabel(text) {
    return /^\s*(build|create|make)\s+(a\s+)?(unit|course|lesson plan|learning path)\s*$/i.test(String(text || ''));
  }

  function _countMatches(text, patterns) {
    return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  }

  function _uniqueConcepts(concepts) {
    const seen = new Set();
    return concepts.map(item => String(item || '').trim()).filter(item => {
      const key = item.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function _topicConcepts(text) {
    if (/\b(teach me everything about investing|beginner to advanced|all major asset classes|complete introduction to financial markets|complete guide to investing)\b/.test(text)) {
      return [
        'Saving and cash foundations',
        'Stocks and company ownership',
        'Bonds and interest rates',
        'Funds, ETFs, and diversification',
        'Risk, return, and time horizon',
        'Portfolio construction',
        'Taxes, accounts, and fees',
        'Market cycles and investor behavior',
        'Company analysis basics',
        'Planning a long-term investing approach',
        'Advanced asset classes',
        'Building a complete learning path'
      ];
    }
    if (/\bstock market\b/.test(text) || /\bfinancial markets\b/.test(text)) {
      return [
        'What stocks represent',
        'What the stock market does',
        'Exchanges, brokers, buyers, and sellers',
        'How orders turn into trades',
        'Why stock prices move',
        'Supply, demand, and market expectations',
        'Indexes and market benchmarks',
        'Bull and bear markets',
        'Company news and earnings',
        'Interest rates and economic data',
        'Risk, diversification, and time horizon',
        'Common beginner mistakes',
        'How to keep learning with market examples'
      ];
    }
    if (/\bbonds?\b/.test(text)) {
      return [
        'What a bond is',
        'Borrowers, lenders, and principal',
        'Coupon payments and maturity',
        'Why bond prices move',
        'How interest rates affect bonds',
        'Credit risk and default risk',
        'Government vs. corporate bonds',
        'How bonds fit in a portfolio',
        'Bond funds vs. individual bonds',
        'Common beginner bond risks'
      ];
    }
    if (/\bipo\b|initial public offering/.test(text)) {
      const base = [
        'Private vs. public companies',
        'What an IPO is',
        'Why companies go public',
        'Underwriters and how an IPO is priced',
        'How the IPO process works step by step',
        'What happens after shares start trading',
        'Risks and opportunities for investors'
      ];
      if (/\b(analy[sz]e|evaluate|before investing|prospectus|financials|valuation)\b/.test(text)) {
        base.push('How investors analyze an IPO', 'Reading IPO filings and valuation signals', 'Lockups and post-IPO trading');
      } else if (/\b(start to finish|process|how does|how do)\b/.test(text)) {
        base.push('Investor demand and the order book', 'Lockups and early price swings');
      }
      return base;
    }
    if (/\bdividend\b/.test(text)) {
      return [
        'What a dividend is',
        'Why companies pay dividends',
        'Dividend yield vs. dividend amount',
        'Important dividend dates',
        'Payout ratios and dividend safety',
        'Reinvesting dividends over time',
        'Risks of chasing high dividends'
      ];
    }
    if (/\bmarket cap\b|market capitali[sz]ation/.test(text)) {
      return [
        'What market cap measures',
        'How market cap is calculated',
        'Large-cap, mid-cap, and small-cap companies',
        'How market cap differs from share price',
        'What market cap does not tell you',
        'Market cap vs. enterprise value',
        'Using market cap to compare companies'
      ];
    }
    if (/\bstock split\b/.test(text)) {
      return [
        'What a stock split is',
        'How shares and price change',
        'Why companies split their stock',
        'Forward splits vs. reverse splits',
        'What a split does not change',
        'Real-world stock split examples',
        'How investors should interpret splits'
      ];
    }
    if (/\bincome statement\b/.test(text)) {
      return [
        'What an income statement shows',
        'Revenue and cost of goods sold',
        'Gross profit and operating profit',
        'Net income and earnings per share',
        'Margins and business quality',
        'One-time items and accounting noise',
        'How investors use income statements'
      ];
    }
    if (/\banaly[sz]e a company\b|company analysis/.test(text)) {
      return [
        'What the company sells',
        'Revenue and profit trends',
        'Margins and business model quality',
        'Balance sheet strength',
        'Cash flow basics',
        'Competitive advantages',
        'Valuation basics',
        'Management and strategy',
        'Risks and red flags',
        'Putting the analysis together'
      ];
    }
    return [
      'The core definition',
      'Why the concept matters',
      'How it works in practice',
      'A realistic example',
      'How it shows up in real-world situations',
      'Common risks or misunderstandings',
      'How to apply it and keep learning'
    ];
  }

  // Always return three ascending depth tiers (Quick, Standard, Deep dive)
  // whose ranges fit inside the distinct material we actually have. The deep
  // tier's max never exceeds capacity, so we never advertise a range the unit
  // generator cannot fulfill — when material is thin, the ranges shrink rather
  // than the option disappearing.
  function _depthOptionsForCapacity(scope, concepts) {
    const cap = Math.max(2, Math.min(13, (concepts && concepts.length) || 5));

    // Very broad subjects: the deep tier becomes a multi-unit course outline.
    if (scope === 'very_broad') {
      return [
        { id: 'quick', label: 'Quick', min: 6, max: Math.min(8, cap) },
        { id: 'standard', label: 'Standard', min: 9, max: Math.min(12, cap) },
        { id: 'deep', label: 'Deep dive', min: Math.min(11, cap), max: 13, course: true }
      ];
    }

    // Pick three bands sized to capacity; every band is then clamped to `cap`.
    let bands;
    if (cap >= 11) bands = [[5, 7], [8, 10], [11, 13]];
    else if (cap >= 8) bands = [[3, 4], [5, 7], [8, 10]];
    else if (cap >= 6) bands = [[2, 3], [4, 5], [6, 7]];
    else if (cap === 5) bands = [[2, 2], [3, 3], [4, 5]];
    else if (cap === 4) bands = [[2, 2], [3, 3], [4, 4]];
    else bands = [[2, 2], [2, 2], [3, 3]]; // cap 2-3: minimal but still fulfillable

    const meta = [
      { id: 'quick', label: 'Quick' },
      { id: 'standard', label: 'Standard' },
      { id: 'deep', label: 'Deep dive' }
    ];
    return meta.map((m, i) => {
      const min = Math.min(bands[i][0], cap);
      const max = Math.min(bands[i][1], cap);
      return { id: m.id, label: m.label, min: Math.min(min, max), max: Math.max(min, max) };
    });
  }

  function _recommendDepth(available, maxUseful, scope) {
    if (!available.length) return 'standard';
    const ids = new Set(available.map(item => item.id));
    const byScope = { narrow: 'quick', medium: 'standard', broad: 'standard', very_broad: 'deep' };
    const want = byScope[scope] || 'standard';
    if (ids.has(want)) return want;
    return (available[Math.min(1, available.length - 1)] || available[0]).id;
  }

  function _analyzeTopicScope(topic, priorContext) {
    try {
      const raw = String(topic || '').trim();
      const text = `${raw} ${priorContext || ''}`.toLowerCase();
      const words = raw.split(/\s+/).filter(Boolean);
      let score = 0;

      if (/^\s*what\s+(is|are|does)\b/.test(text)) score -= 1;
      if (/\b(how|why|analyze|evaluate|compare|read|affect|from start to finish|step by step|before investing)\b/.test(text)) score += 2;
      if (/\b(teach me|explain|introduction|for beginners|complete|everything|beginner to advanced|all major|financial markets|personal finance|investing)\b/.test(text)) score += 2;
      if (/\b(process|works?|risks?|examples?|strategy|analysis|real-world|applications?|start to finish)\b/.test(text)) score += 1;
      if (/[,&+]|\band\b|\bor\b|\bvs\.?\b/.test(text)) score += 1;
      if (words.length > 8) score += 1;
      if (words.length > 13) score += 1;

      const conceptHits = _countMatches(text, [
        /\bstock market\b/, /\beconomy\b/, /\bmarkets?\b/, /\binvesting\b/, /\bpersonal finance\b/,
        /\bfinancial markets?\b/, /\basset classes?\b/, /\banalyze a company\b/, /\bportfolio\b/,
        /\bbonds?\b/, /\binterest rates?\b/, /\bincome statement\b/, /\bipo\b/, /\bdividend\b/,
        /\bmarket cap\b/, /\bstock split\b/
      ]);
      if (conceptHits >= 3) score += 2;
      else if (conceptHits === 2) score += 1;

      let scope = 'medium';
      let reason = 'This topic has enough moving parts to need a focused sequence.';
      if (/\b(everything|beginner to advanced|all major|complete introduction|complete guide|entire|from scratch to advanced)\b/.test(text)) {
        scope = 'very_broad';
        reason = 'This wording points to a subject that would normally be split across multiple units.';
      } else if (score >= 5 || /\b(how does the stock market work|personal finance|analyze a company|investing for beginners|economy affect markets)\b/.test(text)) {
        scope = 'broad';
        reason = 'This topic spans several subtopics, examples, risks, and practical applications.';
      } else if (score <= 0 || /\b(what is an ipo|what is a dividend|market cap|stock split)\b/.test(text)) {
        scope = 'narrow';
        reason = 'This is mostly one core concept with a few examples and checks.';
      }

      const config = SCOPE_RANGES[scope] || SCOPE_RANGES.medium;
      const suggestedConcepts = _uniqueConcepts(_topicConcepts(text));
      const maximumUsefulLessons = Math.max(2, Math.min(13, suggestedConcepts.length || 5));
      const minimumUsefulLessons = Math.min(2, maximumUsefulLessons);
      // The capacity builder already guarantees every tier fits the available
      // material, so we keep all three (Quick, Standard, Deep dive) here.
      const availableDepths = _depthOptionsForCapacity(scope, suggestedConcepts)
        .map(item => ({
          id: item.id,
          label: item.label || _depthName(item.id),
          min: item.min,
          max: item.max,
          course: Boolean(item.course)
        }));
      const recommendedDepth = _recommendDepth(availableDepths, maximumUsefulLessons, scope);
      availableDepths.forEach(item => { item.recommended = item.id === recommendedDepth; });

      return {
        scope,
        scopeLabel: config.label,
        recommendedDepth,
        ranges: availableDepths.reduce((acc, item) => {
          acc[item.id] = { min: item.min, max: item.max };
          return acc;
        }, {}),
        availableDepths,
        minimumUsefulLessons,
        maximumUsefulLessons,
        suggestedConcepts,
        reason
      };
    } catch (_) {
      const fallbackConcepts = _uniqueConcepts(_topicConcepts(''));
      const availableDepths = [
        { id: 'quick', label: 'Quick', min: 2, max: 3 },
        { id: 'standard', label: 'Standard', min: 4, max: 5, recommended: true },
        { id: 'deep', label: 'Deep dive', min: 6, max: 7 }
      ];
      return {
        scope: 'medium',
        scopeLabel: SCOPE_RANGES.medium.label,
        recommendedDepth: 'standard',
        ranges: { quick: { min: 2, max: 3 }, standard: { min: 4, max: 5 }, deep: { min: 6, max: 7 } },
        availableDepths,
        minimumUsefulLessons: 2,
        maximumUsefulLessons: 7,
        suggestedConcepts: fallbackConcepts,
        reason: 'Using the standard fallback because scope analysis was unavailable.'
      };
    }
  }

  function _rangeLabel(range) {
    if (range && range.course) return 'Best as a course';
    if (!range) return '';
    return Number(range.min) === Number(range.max) ? `${range.min} lesson${Number(range.min) === 1 ? '' : 's'}` : `${range.min}-${range.max} lessons`;
  }

  function _timeLabel(range) {
    if (!range) return 'About 10-15 minutes';
    if (range.course) return 'A unit series, not one long unit';
    const low = Math.max(4, range.min * 2);
    const high = Math.max(low + 2, range.max * 2 + 4);
    return `About ${low}-${high} minutes`;
  }

  function _depthName(value) {
    return (DEPTH_COPY[value] && DEPTH_COPY[value].name) || 'Standard';
  }

  function _depthRequest(topic, analysis, selectedDepth) {
    const available = Array.isArray(analysis.availableDepths) ? analysis.availableDepths : [];
    const selectedOption = available.find(item => item.id === selectedDepth)
      || available.find(item => item.id === analysis.recommendedDepth)
      || available[0]
      || { id: 'standard', min: 4, max: 5 };
    const depth = selectedOption.id;
    const range = { min: selectedOption.min, max: selectedOption.max, course: Boolean(selectedOption.course) };
    const conceptCount = Math.max(0, Math.min(Number(range.max) || 0, (analysis.suggestedConcepts || []).length));
    const targetLessonCount = range.course ? 0 : Math.max(Number(range.min) || 2, Math.min(Number(range.max) || 3, conceptCount || Number(range.max) || 3));
    const approvedLessonConcepts = range.course
      ? (analysis.suggestedConcepts || [])
      : (analysis.suggestedConcepts || []).slice(0, targetLessonCount);
    return {
      topic,
      topicScope: analysis.scope || 'medium',
      selectedDepth: depth,
      recommendedDepth: analysis.recommendedDepth || 'standard',
      lessonRange: { min: Number(range.min) || 5, max: Number(range.max) || 7 },
      targetLessonCount,
      courseOutlineRequested: Boolean(range.course || (analysis.scope === 'very_broad' && depth === 'deep')),
      scopeReason: analysis.reason || '',
      maximumUsefulLessons: analysis.maximumUsefulLessons || conceptCount,
      minimumUsefulLessons: analysis.minimumUsefulLessons || 2,
      approvedLessonConcepts,
      suggestedConcepts: analysis.suggestedConcepts || []
    };
  }

  function _openDepthSelector(topic, opts) {
    opts = opts || {};
    depthSelector = {
      topic: String(topic || lastTopic || 'investing for beginners').trim(),
      opts,
      analysis: null,
      selectedDepth: '',
      planning: true,
      returnFocus: document.activeElement
    };
    _renderDepthSelector();
    setTimeout(() => {
      if (!depthSelector) return;
      const analysis = _analyzeTopicScope(depthSelector.topic, opts.context || opts.contextText || _subjectForEntry(opts.sourceEntry || {}) || '');
      const available = Array.isArray(analysis.availableDepths) ? analysis.availableDepths : [];
      const selected = available.some(item => item.id === opts.selectedDepth)
        ? opts.selectedDepth
        : (available.find(item => item.id === analysis.recommendedDepth)?.id || available[0]?.id || 'standard');
      depthSelector.analysis = analysis;
      depthSelector.selectedDepth = selected;
      depthSelector.planning = false;
      _renderDepthSelector();
    }, 80);
  }

  function _closeDepthSelector() {
    const target = depthSelector && depthSelector.returnFocus;
    depthSelector = null;
    const overlay = document.getElementById('coachDepthOverlay');
    if (overlay) overlay.remove();
    document.body.classList.remove('coach-depth-open');
    document.removeEventListener('keydown', _depthKeydown, true);
    if (target && typeof target.focus === 'function') setTimeout(() => target.focus(), 0);
  }

  function _depthKeydown(event) {
    if (!depthSelector) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      _closeDepthSelector();
      return;
    }
    if (event.key !== 'Tab') return;
    const overlay = document.getElementById('coachDepthOverlay');
    const focusable = overlay ? Array.from(overlay.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled) : [];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function _renderDepthSelector() {
    if (!depthSelector) return;
    const { analysis, selectedDepth, planning } = depthSelector;
    const submitting = Boolean(depthSelector.submitting);
    const hasSelection = !planning && analysis
      && (analysis.availableDepths || []).some(item => item.id === selectedDepth);
    const createLabel = submitting ? 'Creating…' : 'Create unit';
    const createDisabled = submitting || !hasSelection;
    let overlay = document.getElementById('coachDepthOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'coachDepthOverlay';
      overlay.className = 'coach-depth-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = planning ? `
      <div class="coach-depth-backdrop" aria-hidden="true"></div>
      <section class="coach-depth-sheet" role="dialog" aria-modal="true" aria-labelledby="coachDepthTitle">
        <div class="coach-depth-planning">
          <span class="mc-spinner" aria-hidden="true"></span>
          <h2 id="coachDepthTitle">Planning your unit...</h2>
        </div>
      </section>` : `
      <div class="coach-depth-backdrop" onclick="CoachPage.closeDepthSelector()" aria-hidden="true"></div>
      <section class="coach-depth-sheet" role="dialog" aria-modal="true" aria-labelledby="coachDepthTitle" aria-describedby="coachDepthSub">
        <button type="button" class="coach-depth-close" onclick="CoachPage.closeDepthSelector()" aria-label="Cancel depth selection">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
        <div class="coach-depth-head">
          <h2 id="coachDepthTitle">How deep should this unit go?</h2>
          <p id="coachDepthSub">Choose how much detail you want. FinLingo recommends a depth based on the topic.</p>
        </div>
        <div class="coach-depth-options" role="radiogroup" aria-label="Unit depth">
          ${(analysis.availableDepths || []).map(option => {
            const depth = option.id;
            const copy = DEPTH_COPY[depth] || { name: option.label || depth, explanation: 'Build the most useful version for this topic.' };
            const range = { min: option.min, max: option.max, course: Boolean(option.course) };
            const checked = selectedDepth === depth;
            const recommended = option.recommended || analysis.recommendedDepth === depth;
            return `
              <label class="coach-depth-option${checked ? ' is-selected' : ''}">
                <input type="radio" name="coachDepth" value="${depth}" ${checked ? 'checked' : ''} aria-checked="${checked ? 'true' : 'false'}" ${submitting ? 'disabled' : ''} onchange="CoachPage.selectDepth('${depth}')">
                <span class="coach-depth-option-main">
                  <span class="coach-depth-option-top">
                    <strong>${esc(option.label || copy.name)}</strong>
                    ${recommended ? '<em class="coach-depth-badge">Recommended</em>' : ''}
                  </span>
                  <span class="coach-depth-range">${_rangeLabel(range)}</span>
                  <span class="coach-depth-time">${_timeLabel(range)}</span>
                  <span class="coach-depth-desc">${esc(copy.explanation)}</span>
                </span>
              </label>`;
          }).join('')}
        </div>
        ${analysis.scope === 'very_broad' ? '<p class="coach-depth-note">This topic is wide enough for multiple units. Deep dive will build a course outline instead of one oversized unit.</p>' : ''}
        <div class="coach-depth-actions">
          <button type="button" class="coach-depth-cancel" onclick="CoachPage.closeDepthSelector()" ${submitting ? 'disabled' : ''}>Cancel</button>
          <button type="button" class="coach-depth-build" id="coachDepthCreate" onclick="CoachPage.confirmDepthSelection()" ${createDisabled ? 'disabled' : ''} ${submitting ? 'aria-busy="true"' : ''} aria-label="${submitting ? 'Creating unit' : 'Create unit with the selected depth'}">${submitting ? '<span class="coach-depth-spin" aria-hidden="true"></span>' : ''}<span class="coach-depth-build-label">${createLabel}</span></button>
        </div>
      </section>`;
    overlay.classList.add('open');
    document.body.classList.add('coach-depth-open');
    document.removeEventListener('keydown', _depthKeydown, true);
    document.addEventListener('keydown', _depthKeydown, true);
    setTimeout(() => {
      const checked = overlay.querySelector('input[name="coachDepth"]:checked') || overlay.querySelector('button');
      if (checked) checked.focus();
    }, 0);
  }

  function selectDepth(depth) {
    if (!depthSelector || depthSelector.submitting || !depthSelector.analysis || !(depthSelector.analysis.availableDepths || []).some(item => item.id === depth)) return;
    depthSelector.selectedDepth = depth;
    _renderDepthSelector();
  }

  function confirmDepthSelection() {
    if (!depthSelector || depthSelector.planning || depthSelector.submitting || !depthSelector.analysis) return;
    const { topic, opts, analysis, selectedDepth } = depthSelector;
    if (!selectedDepth || !(analysis.availableDepths || []).some(item => item.id === selectedDepth)) return;
    // Lock the modal into its "Creating…" state first so the button reflects
    // progress and a second click cannot fire a duplicate generation.
    depthSelector.submitting = true;
    _renderDepthSelector();
    const request = _depthRequest(topic, analysis, selectedDepth);
    const buildOpts = Object.assign({}, opts, {
      intent: 'build',
      userLabel: opts.userLabel || `Build “${topic}” into a full unit`,
      depthSelection: request
    });
    // Defer one tick so the locked state paints, then hand off to the thread
    // (which shows its own "Building your … unit" loader) and close the modal.
    setTimeout(() => {
      _closeDepthSelector();
      coachAsk(topic, buildOpts);
    }, 0);
  }

  // ── Ask ─────────────────────────────────────────────────────────────
  async function coachAsk(rawText, opts) {
    opts = opts || {};
    if (busy) return;
    _markAskActivity();   // submitting / follow-up action counts as Ask activity
    const text = String(rawText || '').trim();
    const intent = opts.intent || _detectIntent(text);
    const requestId = opts.requestId || _requestId();
    // Market-originated chats (opened from a Market Insight, Today's Key Topics,
    // or a market action) carry live market data in their context. Flag the
    // request so the backend explains the concept AND connects it to today's
    // market without the user having to ask for the connection.
    const marketOriginated = /market/.test(String(opts.source || ''))
      || /market/.test(String((opts.apiContext && opts.apiContext.source) || ''))
      || intent === 'market' || intent === 'connect_market';
    const effectiveText = (intent === 'build' && _isGenericBuildUnitLabel(text))
      ? String(opts.topic || lastTopic || 'investing for beginners').trim()
      : text;
    if (!text && intent !== 'market') return;

    if (intent === 'build' && !opts.depthSelection) {
      opts.requestId = requestId;
      if (opts.commitBeforeDepth && !opts.committedUserEntryId) {
        _ensureActiveLoaded();
        const userLabel = opts.userLabel || text || `Build a unit on ${effectiveText || lastTopic || 'investing'}`;
        const userEntry = _stamp({
          role: 'user',
          text: userLabel,
          topic: opts.topic || effectiveText || lastTopic,
          source: opts.source || 'suggestion',
          requestId
        }, 'user');
        if (_consumeActiveSuggestions()) _persistActive();
        thread.push(userEntry);
        opts.committedUserEntryId = userEntry.id;
        lastTopic = opts.topic || effectiveText || lastTopic;
        _persistActive();
        renderCoach();
      }
      _openDepthSelector(effectiveText || opts.topic || lastTopic || 'investing for beginners', opts);
      return;
    }

    _ensureActiveLoaded();
    const wasBlankBefore = thread.length === 0;
    const submitScroll = _captureThreadScroll();
    const revealActionResult = Boolean(opts.source)
      || ['quiz', 'example', 'connect_market', 'simplify'].includes(intent);
    let pendingRevealEntryId = '';
    let revealAnswerEntry = null;
    const userLabel = opts.userLabel || text || 'Explain today’s market';
    const requestText = String(opts.requestText || opts.requestContent || opts.apiPrompt || '').trim();
    if (!opts.committedUserEntryId && !opts.skipUserMessage) {
      const userEntry = {
        role: 'user',
        text: userLabel,
        topic: opts.topic || effectiveText || lastTopic,
        requestId
      };
      if (requestText && requestText !== userLabel) userEntry.requestText = requestText;
      if (opts.apiContext) userEntry.apiContext = opts.apiContext;
      if (opts.source) userEntry.source = opts.source;
      if (opts.marketTopic) userEntry.marketTopic = opts.marketTopic;
      _consumeActiveSuggestions();
      thread.push(_stamp(userEntry, 'user'));
    }
    lastTopic = opts.topic || effectiveText || lastTopic;
    if (typeof recordAskedTopic === 'function' && text) recordAskedTopic(text);
    _persistActive();

    busy = true;
    busyLabel = '';
    busyMode = 'normal';
    const requestChatId = activeChatId;
    const requestThread = thread;
    activeCoachRequest = { id: requestId, chatId: requestChatId, mode: intent, startedAt: Date.now() };
    _emitBusyChanged();
    composerVisible = false;
    _stopTypewriter();
    _finishActiveReveal();              // finalize any answer still streaming
    if (wasBlankBefore) renderCoach();
    else _renderThread({ allowAutoscroll: !revealActionResult && submitScroll?.nearBottom });

    const topic = effectiveText || lastTopic;
    const contextOverride = opts.context || opts.contextText || '';
    let mode, prompt, context, responseMode, isInitialOverview = false;
    if (intent === 'build') {
      mode = 'build_unit';
      prompt = `Build a beginner finance mini-unit on: ${topic}`;
      context = contextOverride || _coachContext();
      responseMode = 'build_unit';
      const range = opts.depthSelection && opts.depthSelection.lessonRange;
      const depthName = _depthName(opts.depthSelection && opts.depthSelection.selectedDepth);
      busyLabel = range && range.min === range.max
        ? `Building your ${range.min}-lesson unit...`
        : `Building your ${depthName} unit...`;
      busyMode = 'build_unit';
    } else if (intent === 'quiz') {
      mode = 'quiz';
      prompt = `Create a short beginner quiz about: ${topic}`;
      context = contextOverride || `Lesson topic: ${topic}. ${_coachContext()}`;
      responseMode = 'quiz';
    } else if (intent === 'market') {
      mode = 'market_explainer';
      prompt = 'Explain today’s market in plain English for a beginner.';
      context = (typeof _marketTutorContext === 'function') ? _marketTutorContext().text : _coachContext();
      responseMode = 'normal';
    } else if (intent === 'simplify') {
      mode = 'simple_answer';
      prompt = `Explain ${topic} even more simply, in 2-3 plain sentences for someone brand new to finance.`;
      context = contextOverride || _coachContext();
      responseMode = 'simple';
    } else if (intent === 'example') {
      mode = 'chat';
      prompt = `Give one short, concrete real-world example of ${topic}, in 2-3 plain sentences.`;
      context = _coachContext();
      responseMode = 'normal';
    } else if (intent === 'connect_market') {
      mode = 'chat';
      prompt = `In 2-3 plain sentences, connect ${topic} to what is happening in the market right now.`;
      context = (typeof _marketTutorContext === 'function') ? _marketTutorContext().text : _coachContext();
      responseMode = 'normal';
    } else {
      mode = 'chat';
      prompt = requestText || text;
      context = contextOverride || _coachContext();
      responseMode = opts.responseMode || _responseModeForText([userLabel, requestText || text].join(' '), 'normal');
      // A freshly TYPED top-level question gets the brief one-paragraph overview.
      // Deliberate follow-up actions (suggestion chips → source:'suggestion') and
      // explicit "more detail" requests (responseMode 'detailed') keep full depth.
      // Market-originated questions still count as initial (handled short + honest
      // by the backend's market-overview note).
      isInitialOverview = (responseMode === 'normal' && opts.source !== 'suggestion');
    }

    const conversational = (mode === 'chat' || mode === 'simple_answer');
    const history = conversational ? _historyMessages(prompt) : null;

    try {
      let payload = null;
      if (mode === 'build_unit') {
        const sourceUser = [...requestThread].reverse().find(entry => entry?.role === 'user' && entry.requestId === requestId)
          || [...requestThread].reverse().find(entry => entry?.role === 'user');
        let jobEntry = _unitJobEntryFor(requestThread, requestId, '');
        if (!jobEntry) {
          jobEntry = _stamp({
            role: 'assistant',
            kind: 'unit_job',
            topic,
            requestId,
            clientRequestId: requestId,
            sourceChatId: requestChatId,
            sourceMessageId: sourceUser?.id || '',
            depthSelection: opts.depthSelection || null,
            sourceQuestion: text || topic || lastTopic,
            userLabel,
            status: 'queued',
            stage: 'queued',
            completedLessonCount: 0,
            totalLessonCount: Number(opts.depthSelection?.targetLessonCount) || 0,
            retryCount: 0
          }, mode);
          requestThread.push(jobEntry);
          _persistThreadFor(requestChatId, requestThread);
          if (requestChatId === activeChatId) _renderThread({ revealEntryId: jobEntry.id });
        }
        payload = await _startUnitJob(jobEntry, requestChatId, requestThread);
      } else {
        payload = await _coachFetch(mode, prompt, context, history, { responseMode, requestId, marketContext: marketOriginated || undefined, initial: isInitialOverview || undefined });
      }
      if (!activeCoachRequest || activeCoachRequest.id !== requestId) return;
      const targetThread = requestThread;
      const targetChatId = requestChatId;
      if (mode === 'build_unit') {
        if (!payload.jobId) throw new Error('The coach could not start a unit job right now.');
      } else if (mode === 'quiz') {
        if (!payload.result) throw new Error('The coach could not build a quiz right now.');
        const entry = _stamp({ role: 'assistant', kind: 'quiz', data: payload.result, answers: {}, topic: text || lastTopic, suggestionState: 'active', requestId }, mode);
        targetThread.push(entry);
        pendingRevealEntryId = entry.id;
      } else if (payload.result) {
        const entry = _stamp({ role: 'assistant', kind: 'market', data: payload.result, topic: text || lastTopic, suggestionState: 'active', requestId }, mode);
        targetThread.push(entry);
        if (revealActionResult) pendingRevealEntryId = entry.id;
      } else {
        const entry = _stamp({ role: 'assistant', kind: 'text', text: payload.answer || 'No answer was returned.', topic: text || lastTopic, suggestionState: 'active', responseMode, requestId }, mode);
        entry._needsReveal = true;          // stream this answer in from the top
        targetThread.push(entry);
        revealAnswerEntry = entry;
        if (revealActionResult) pendingRevealEntryId = entry.id;
      }
      _persistThreadFor(targetChatId, targetThread);
    } catch (err) {
      if (!activeCoachRequest || activeCoachRequest.id !== requestId) return;
      const retryable = Boolean(err && err.retryable);
      const category = err?.category || 'unknown_server_error';
      if (mode === 'build_unit') {
        const jobEntry = _unitJobEntryFor(requestThread, requestId, '');
        if (jobEntry) {
          jobEntry.status = 'start_failed';
          jobEntry.stage = 'start_failed';
          jobEntry.retryable = true;
          jobEntry.errorCategory = category;
        } else {
          const entry = _stamp({
            role: 'assistant',
            kind: 'unit_error',
            topic: topic || lastTopic,
            requestId,
            retryable: true,
            errorCategory: category,
            depthSelection: opts.depthSelection || null,
            sourceQuestion: text || topic || lastTopic,
            userLabel,
            message: 'We couldn’t finish this unit.',
            note: 'Your completed progress was saved.'
          }, mode);
          requestThread.push(entry);
          pendingRevealEntryId = entry.id;
        }
        _persistThreadFor(requestChatId, requestThread);
      } else {
        const entry = _stamp({
          role: 'assistant',
          kind: 'error',
          text: 'We couldn’t finish that response.',
          topic: text || lastTopic,
          sourceQuestion: text || topic || lastTopic,
          isError: true,
          retryable,
          errorCategory: category,
          requestId,
          suggestionState: 'none'
        }, mode);
        requestThread.push(entry);
        if (revealActionResult) pendingRevealEntryId = entry.id;
        _persistThreadFor(requestChatId, requestThread);
      }
    } finally {
      if (activeCoachRequest && activeCoachRequest.id === requestId) {
        activeCoachRequest = null;
        busy = false;
        busyLabel = '';
        busyMode = 'normal';
        _markAskActivity();   // response finished displaying — refresh activity timestamp
        _emitBusyChanged();
        if (requestChatId === activeChatId) {
          _renderThread({
            revealEntryId: pendingRevealEntryId,
            allowAutoscroll: !pendingRevealEntryId && !revealActionResult && submitScroll?.nearBottom
          });
          if (revealAnswerEntry && revealAnswerEntry._needsReveal && !revealAnswerEntry._revealDone) {
            _beginAnswerReveal(revealAnswerEntry);
          }
        }
      }
    }
  }

  // Notify the shared header (New Chat button) when a request starts/finishes.
  function _emitBusyChanged() {
    if (global.dispatchEvent) {
      try { global.dispatchEvent(new Event('finlingo:coach-busy-changed')); } catch (_) {}
    }
  }

  // ── Optional shortcut API + next actions ────────────────────────────
  function chip(key) {
    const input = document.getElementById('coachInput');
    const v = (input && input.value.trim()) || '';
    if (input) input.value = '';
    if (key === 'build') coachAsk(v || 'investing for beginners', { intent: 'build', userLabel: v ? `Build a full unit on ${v}` : 'Build a beginner unit on investing' });
    else if (key === 'quiz') coachAsk(v || 'stocks', { intent: 'quiz', userLabel: v ? `Quiz me on ${v}` : 'Quiz me on stocks' });
    else if (key === 'market') coachAsk('', { intent: 'market', userLabel: 'Explain today’s market' });
  }

  // A smart suggestion was tapped: show its short label as a natural user
  // message and send the hidden full prompt to the API (follow_up), or route
  // to the existing build/quiz flows. Stays in the conversation; coachAsk
  // handles scroll-to-new-message, the loading state, and re-rendering — and
  // the new answer gets its own fresh set of suggestions.
  function suggest(index, i) {
    if (busy) return;
    const entry = thread[index];
    if (!entry || !Array.isArray(entry.suggestions)) return;
    if (_normalSuggestionState(entry) !== 'active' || !_isNewestSuggestionOwner(index)) return;
    const s = entry.suggestions[i];
    if (!s) return;
    const topic = entry.topic || lastTopic;
    entry.suggestionState = 'consumed';
    _persistActive();
    _renderThread({ preserveScroll: true });
    if (s.action === 'create_unit') {
      const unitTopic = String(s.unitTopic || _unitTopicFromQuestion(_prevUserText(index), topic) || topic || lastTopic || 'this finance topic').trim();
      coachAsk(unitTopic, { intent: 'build', userLabel: s.label || 'Build a unit', topic: unitTopic, source: 'suggestion', commitBeforeDepth: true });
      return;
    }
    if (s.action === 'quiz') { act(index, 'quiz'); return; }
    coachAsk(s.label, { intent: 'chat', userLabel: s.label, requestText: s.prompt, topic: topic, source: 'suggestion', responseMode: s.responseMode || _responseModeForText([s.label, s.prompt].join(' '), 'normal') });
  }

  function act(index, action) {
    if (busy) return;
    const entry = thread[index];
    if (!entry) return;
    const topic = entry.topic || lastTopic;
    if (_hasSuggestionGroup(entry) && _normalSuggestionState(entry) === 'active' && _isNewestSuggestionOwner(index)) {
      entry.suggestionState = 'consumed';
      _persistActive();
      _renderThread({ preserveScroll: true });
    }
    if (action === 'create_unit') coachAsk(topic, { intent: 'build', userLabel: `Build “${topic}” into a full unit`, commitBeforeDepth: true, source: 'suggestion' });
    else if (action === 'quiz') coachAsk(topic, { intent: 'quiz', userLabel: `Quiz me on ${topic}` });
    else if (action === 'simplify_answer') simplifyAnswer(index);
    else if (action === 'example') coachAsk(topic, { intent: 'example', userLabel: `Show a real-world example` });
    else if (action === 'connect_market') coachAsk(topic, { intent: 'connect_market', userLabel: `Connect it to today’s market` });
    else if (action === 'retry_response' && entry.kind === 'error') {
      thread.splice(index, 1);
      _persistActive();
      _renderThread({ preserveScroll: true });
      coachAsk(entry.sourceQuestion || topic, { intent: 'chat', topic, skipUserMessage: true });
    }
    else if (action === 'open_market') { if (typeof showMarket === 'function') showMarket({ resetScroll: true }); }
    else if (action === 'open_learn') {
      if (!entry.saved && entry.kind === 'unit') {
        const savedUnit = _persistUnit(entry);
        if (savedUnit) {
          entry.saved = true;
          entry.unitId = savedUnit.id;
          _persistActive();
        }
      }
      // Prefer opening the saved unit straight into the micro-lesson player.
      if (entry.saved && entry.unitId && typeof openMicroUnit === 'function') openMicroUnit(entry.unitId);
      else if (typeof showLearn === 'function') showLearn({ resetScroll: true });
    }
    else if (action === 'save_unit') saveUnit(index);
    else if (action === 'start_lesson') {
      // "Start unit": open the generated unit directly in the micro-lesson
      // player, beginning at the first lesson. Generated (job) units are saved
      // into Learn first so they persist there after the user starts them.
      if (entry.fromUnitJob && !entry.saved && entry.kind === 'unit') {
        const savedUnit = _persistUnit(entry);
        if (savedUnit) { entry.saved = true; entry.unitId = savedUnit.id; _persistActive(); }
      }
      if (typeof openMicroUnit === 'function') {
        if (entry.saved && entry.unitId) openMicroUnit(entry.unitId);
        else openMicroUnit(_unitObjectFromEntry(entry));
      }
    }
    else if (action === 'view_in_learn') {
      // "View in Learn": save the generated unit, then go to the Learn overview
      // WITHOUT opening it or starting a lesson. The unit is scrolled into view
      // and briefly highlighted so the user can choose to open it themselves.
      let unitId = entry.unitId;
      if (!entry.saved && entry.kind === 'unit') {
        const savedUnit = _persistUnit(entry);
        if (savedUnit) { entry.saved = true; entry.unitId = savedUnit.id; unitId = savedUnit.id; _persistActive(); }
      }
      if (typeof focusLearnUnit === 'function') focusLearnUnit(unitId);
      else if (typeof showLearn === 'function') showLearn({ resetScroll: true });
    }
  }

  function buildCourseUnit(index, unitIndex) {
    const entry = thread[index];
    if (!entry || entry.kind !== 'course_outline') return;
    const units = entry.data?.units || entry.data?.proposedUnits || entry.data?.proposed_units || [];
    const item = units[unitIndex];
    if (!item) return;
    const title = item.title || item.unitTitle || `Unit ${unitIndex + 1}`;
    const description = item.description ? ` ${item.description}` : '';
    const topic = `${title}.${description}`.trim();
    coachAsk(topic, { intent: 'build', userLabel: `Build the "${title}" unit`, topic });
  }

  async function retryUnit(index) {
    const entry = thread[index];
    if (!entry || busy) return;
    if (entry.kind === 'unit_job') {
      if (!['failed', 'start_failed', 'cancelled'].includes(entry.status)) return;
      if (entry.status === 'cancelled') {
        entry.jobId = '';
        entry.clientRequestId = _requestId();
        entry.requestId = entry.clientRequestId;
      }
      entry.status = 'queued';
      entry.stage = 'queued';
      entry.pollingIssue = '';
      _resetUnitJobTiming(entry);
      _persistActive();
      _renderThread({ preserveScroll: true });
      try {
        const status = entry.jobId
          ? await _unitJobFetch(`/api/unit-jobs/${encodeURIComponent(entry.jobId)}/retry`, {
              method: 'POST',
              body: '{}'
            })
          : await _startUnitJob(entry, activeChatId, thread);
        _applyUnitJobStatus(entry, status, activeChatId, thread);
        if (UNIT_JOB_ACTIVE_STATUSES.has(status.status)) {
          _scheduleUnitJobPoll(entry, activeChatId, thread, UNIT_JOB_POLL_MS);
        }
      } catch (error) {
        entry.status = 'failed';
        entry.errorCategory = error?.category || 'unit_job_request_failed';
        _persistActive();
        _renderThread({ preserveScroll: true });
      }
      return;
    }
    if (entry.kind !== 'unit_error') return;
    const topic = entry.sourceQuestion || entry.topic || lastTopic || 'this finance topic';
    const depthSelection = entry.depthSelection || null;
    thread.splice(index, 1);
    _persistActive();
    _renderThread({ preserveScroll: true });
    coachAsk(topic, {
      intent: 'build',
      topic,
      userLabel: entry.userLabel || `Build “${topic}” into a full unit`,
      depthSelection,
      skipUserMessage: true
    });
  }

  function chooseAnotherDepth(index) {
    const entry = thread[index];
    if (!entry || !['unit_error', 'unit_job'].includes(entry.kind) || busy) return;
    const topic = entry.sourceQuestion || entry.topic || lastTopic || 'this finance topic';
    const previousDepth = entry.depthSelection?.selectedDepth || entry.depthSelection?.selected_depth || '';
    if (entry.jobId) _stopUnitJobPoll(entry.jobId);
    thread.splice(index, 1);
    _persistActive();
    _renderThread({ preserveScroll: true });
    _openDepthSelector(topic, {
      intent: 'build',
      topic,
      userLabel: entry.userLabel || `Build “${topic}” into a full unit`,
      selectedDepth: previousDepth,
      skipUserMessage: true
    });
  }

  async function cancelUnitJob(index) {
    const entry = thread[index];
    if (!entry || entry.kind !== 'unit_job' || !entry.jobId || !UNIT_JOB_ACTIVE_STATUSES.has(entry.status)) return;
    _stopUnitJobPoll(entry.jobId);
    try {
      const status = await _unitJobFetch(`/api/unit-jobs/${encodeURIComponent(entry.jobId)}/cancel`, {
        method: 'POST',
        body: '{}'
      });
      _applyUnitJobStatus(entry, status, activeChatId, thread);
    } catch (_) {
      entry.pollingIssue = 'Could not confirm cancellation. Checking the job again.';
      _persistActive();
      _renderThread({ preserveScroll: true });
      _scheduleUnitJobPoll(entry, activeChatId, thread, UNIT_JOB_POLL_MS);
    }
  }

  // Build a canonical unit object from a generated thread entry (for the player
  // and for saving). Preserves the full micro-lesson structure.
  function _unitObjectFromEntry(entry) {
    const d = entry.data || {};
    const rawUnit = {
      id: entry.unitId || _unitStableId(d, entry.topic),
      title: _unitTitle(d, entry.topic),
      description: _unitDescription(d),
      lessons: (d.lessons || []).map(l => {
        if (typeof l === 'string') return { title: l, coreIdea: '', example: '', takeaway: '', question: null };
        return {
          id: l.id || '',
          title: l.title || '',
          slides: Array.isArray(l.slides) ? l.slides : null,
          coreIdea: l.coreIdea || l.core_idea || l.description || l.summary || '',
          example: l.example || '',
          takeaway: l.takeaway || l.remember || '',
          question: l.question || (Array.isArray(l.questions) ? l.questions[0] : null) || null
        };
      }),
      recapQuiz: d.recapQuiz || d.recap_quiz || d.recap || [],
      quizTopic: d.quizTopic || d.quiz_topic || _unitTitle(d, entry.topic) || entry.topic || '',
      topic: entry.topic || '',
      selectedDepth: d.selectedDepth || d.selected_depth || '',
      topicScope: d.topicScope || d.topic_scope || '',
      requestedLessonRange: d.requestedLessonRange || d.requested_lesson_range || null,
      actualLessonCount: d.actualLessonCount || d.actual_lesson_count || ((d.lessons || []).length),
      // Keep the source conversation only as traceability metadata — NOT as a
      // navigation key. unitId is the primary key for opening/deleting.
      sourceChatId: (global.ChatStore && typeof global.ChatStore.activeId === 'function') ? global.ChatStore.activeId() : (entry.sourceChatId || ''),
      source: 'ask'
    };
    const cleaned = _cleanGeneratedStrings(rawUnit);
    if (global.MicroData && typeof global.MicroData.normalizeUnitToSlideFormat === 'function') {
      const normalized = global.MicroData.normalizeUnitToSlideFormat(cleaned);
      return Object.assign(normalized, {
        id: cleaned.id || normalized.id,
        quizTopic: cleaned.quizTopic || normalized.quizTopic || normalized.title,
        topic: cleaned.topic || entry.topic || '',
        createdAt: cleaned.createdAt,
        sourceChatId: cleaned.sourceChatId,
        source: 'ask'
      });
    }
    return cleaned;
  }

  function _persistUnit(entry) {
    if (!entry || entry.kind !== 'unit' || !entry.data) return null;
    const unit = _unitObjectFromEntry(entry);
    const existing = CoachUnits.get(unit.id);
    unit.createdAt = (existing && existing.createdAt) || new Date().toISOString();
    unit.savedAt = new Date().toISOString();
    unit.savedToLearn = true;
    if (!CoachUnits.save(unit)) return null;
    entry.unitId = unit.id;
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('finlingo:custom-units-updated')); } catch {}
    }
    return unit;
  }

  function saveUnit(index) {
    const entry = thread[index];
    if (!entry || entry.kind !== 'unit' || entry.saved) return;
    const savedUnit = _persistUnit(entry);
    if (!savedUnit) return;
    entry.saved = true;
    entry.unitId = savedUnit.id;
    if (typeof showToast === 'function') showToast('Saved to Learn');
    _persistActive();
    _renderThread({ preserveScroll: true });
  }

  function _subjectForEntry(entry) {
    const parts = [];
    if (entry.topic) parts.push(`Topic: ${entry.topic}`);
    if (entry.text) parts.push(`Previous answer: ${entry.text}`);
    if (entry.data) parts.push(`Previous answer data: ${JSON.stringify(entry.data).slice(0, 1200)}`);
    return parts.join('\n') || 'This finance concept';
  }

  async function simplifyAnswer(index) {
    const entry = thread[index];
    if (!entry || entry.role !== 'assistant' || entry.isError || entry.simpleBusy) return;
    entry.simpleBusy = true;
    entry.simpleError = '';
    _renderThread({ revealEntryId: entry.id });
    try {
      const payload = await _coachFetch(
        'simple_answer',
        _subjectForEntry(entry),
        'Simplify only the previous Ask answer. Return 2-3 short sentences. No title, bullets, follow-up, suggestions, related topics, or disclaimer.',
        null,
        { responseMode: 'simple' }
      );
      entry.simpleText = payload.answer || 'No simplified answer was returned.';
    } catch (err) {
      entry.simpleError = (err && err.message) || 'Could not simplify this right now.';
    } finally {
      entry.simpleBusy = false;
      _persistActive();
      _renderThread({ revealEntryId: entry.id });
    }
  }

  // Select a choice without grading it. Keeps the pick neutral (no green/red)
  // and enables that question's Submit button. Re-selecting before Submit just
  // moves the selection.
  function quizSelect(index, qIndex, cIndex) {
    const entry = thread[index];
    if (!entry || entry.kind !== 'quiz') return;
    entry.answers = entry.answers || {};
    if (Number.isInteger(entry.answers[qIndex])) return;   // already submitted
    entry.selections = entry.selections || {};
    entry.selections[qIndex] = cIndex;
    _persistActive();
    _renderThread({ preserveScroll: true });
  }

  // Grade the selected choice (one click from Submit only — never auto-submit).
  function quizSubmit(index, qIndex) {
    const entry = thread[index];
    if (!entry || entry.kind !== 'quiz') return;
    entry.answers = entry.answers || {};
    if (Number.isInteger(entry.answers[qIndex])) return;
    const cIndex = entry.selections && entry.selections[qIndex];
    if (!Number.isInteger(cIndex)) return;
    entry.answers[qIndex] = cIndex;
    const q = entry.data && entry.data.questions && entry.data.questions[qIndex];
    if (q && cIndex !== Number(q.correct_index) && global.CoachReview) {
      global.CoachReview.flag({ topic: entry.topic || 'This concept', source: 'an Ask quiz', note: 'Missed a question in an Ask quiz.' });
    }
    _persistActive();
    _renderThread({ preserveScroll: true });
  }

  // entry points used by the Learn page custom-unit cards
  function coachTeachUnitLesson(unitId, idx) {
    const unit = CoachUnits.get(unitId);
    if (!unit) return;
    const lessons = unit.lessons || [];
    const ls = lessons[idx] || lessons[0];
    const title = ls ? (ls.title || ls) : unit.title;
    if (typeof showCoach === 'function') showCoach();
    coachAsk(title, { intent: 'simplify', userLabel: `Teach me: ${title}`, topic: title });
  }
  function coachQuizUnit(unitId) {
    const unit = CoachUnits.get(unitId);
    if (!unit) return;
    const topic = unit.quizTopic || unit.title;
    if (typeof showCoach === 'function') showCoach();
    coachAsk(topic, { intent: 'quiz', userLabel: `Quiz me on ${unit.title}`, topic });
  }
  global.coachTeachUnitLesson = coachTeachUnitLesson;
  global.coachQuizUnit = coachQuizUnit;

  // ── Rendering ───────────────────────────────────────────────────────
  // The action cards ARE the primary interaction model — a short answer, then
  // clear next steps. Each card: [action, icon, label].
  const NEXT_STEP_CARDS = [
    ['create_unit', 'Build this into a full unit'],
    ['simplify_answer', 'Explain it simpler'],
    ['quiz', 'Quiz me on this']
  ];

  function _nextSteps(index, cards) {
    const entry = thread[index];
    if (!_isNewestSuggestionOwner(index) || _normalSuggestionState(entry) === 'consumed') return '';
    if (entry && _normalSuggestionState(entry) === 'none') entry.suggestionState = 'active';
    const list = cards || NEXT_STEP_CARDS;
    return `
      <div class="coach-next">
        <div class="coach-next-label">What would you like to do next?</div>
        <div class="coach-next-cards">
          ${list.map(([action, label]) => `
            <button type="button" class="coach-next-card" onclick="CoachPage.act(${index},'${action}')">
              <span class="coach-next-text">${esc(label)}</span>
              <span class="coach-next-arrow" aria-hidden="true">${FinLingoIcons.right()}</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  // ── Smart, context-aware next-step suggestions ───────────────────────
  // Generated from the user's question + the assistant's answer (category,
  // advice-sensitivity, obvious comparand). Each suggestion carries a short
  // visible LABEL and a hidden full PROMPT that is only sent to the API when
  // chosen (see suggest()). Generated once per answer and persisted so they
  // stay stable across re-renders and reloads.
  const _VAGUE_LABELS = ['learn more', 'continue', 'tell me more', 'read more', 'more', 'next', 'go on'];
  const _COMPARANDS = {
    'etf': 'mutual funds', 'etfs': 'mutual funds', 'mutual fund': 'ETFs', 'mutual funds': 'ETFs',
    'index fund': 'actively managed funds', 'index funds': 'actively managed funds',
    'stock': 'bonds', 'stocks': 'bonds', 'bond': 'stocks', 'bonds': 'stocks',
    'roth ira': 'a traditional IRA', 'traditional ira': 'a Roth IRA',
    'bitcoin': 'stocks', 'crypto': 'stocks', 'cryptocurrency': 'stocks',
    'credit card': 'debit cards', 'debit card': 'credit cards'
  };

  function _norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function _cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function _article(w) { return /^[aeiou]/i.test(String(w || '')) ? 'an' : 'a'; }
  const _STOPWORDS = ['the', 'and', 'for', 'with', 'that', 'this', 'your', 'you', 'can', 'how', 'what', 'are', 'does', 'about', 'into', 'from'];
  function _tokens(s) { return _norm(s).split(' ').filter(w => w.length > 2 && _STOPWORDS.indexOf(w) < 0); }
  function _tooSimilar(a, b) {
    const A = new Set(_tokens(a)), B = new Set(_tokens(b));
    if (!A.size || !B.size) return false;
    let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
    const uni = new Set([].concat(Array.from(A), Array.from(B))).size;
    return uni ? (inter / uni) >= 0.6 : false;
  }
  function _allDistinct(list) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].purpose === list[j].purpose) return false;
        if (_tooSimilar(list[i].label, list[j].label)) return false;
      }
    }
    return true;
  }

  function _prevUserText(index) {
    for (let i = (index | 0) - 1; i >= 0; i--) {
      if (thread[i] && thread[i].role === 'user') return thread[i].requestText || thread[i].text || '';
    }
    return '';
  }

  // Whether the question that produced this answer came from the Market screen.
  // The cleaned visible bubble ("Explain risk-off markets.") may not look like a
  // market question, so we read the originating user entry's market metadata.
  function _prevUserMarketOrigin(index) {
    for (let i = (index | 0) - 1; i >= 0; i--) {
      const e = thread[i];
      if (e && e.role === 'user') {
        return /market/.test(String(e.source || ''))
          || /market/.test(String((e.apiContext && e.apiContext.source) || ''))
          || Boolean(e.marketTopic);
      }
    }
    return false;
  }

  function _shortTopic(question, topic) {
    let s = String(topic || question || '').trim().replace(/\?+$/, '').trim();
    s = s
      .replace(/^(what'?s|what is|what are|what does|whats|how does|how do|why does|why did|why is|when should i|when can i|should i|do i|tell me about|explain|define)\s+/i, '')
      .replace(/^(an?|the)\s+/i, '')
      .replace(/\s+(move|moved|moving|rise|rose|fall|fell|drop|dropped|crash|crashed|rally|rallied|go up|go down|spike|spiked|surge|surged|plunge|plunged)\b.*$/i, '')
      .trim();
    const words = s.split(/\s+/);
    if (words.length > 6) s = words.slice(0, 6).join(' ');
    return s || String(topic || 'this concept');
  }

  function _titleCaseTopic(value) {
    const keepUpper = new Set(['ipo', 'etf', 'ira', '401k', '401', 's&p', 'sp500']);
    return String(value || '').trim().split(/\s+/).map(word => {
      const clean = word.toLowerCase();
      if (keepUpper.has(clean)) return clean === 's&p' ? 'S&P' : clean.toUpperCase();
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }).join(' ');
  }

  function _singularToPluralConcept(value) {
    let s = String(value || '')
      .replace(/^(an?|the)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return '';
    const lower = s.toLowerCase();
    const irregular = {
      stock: 'stocks',
      bond: 'bonds',
      company: 'companies',
      fund: 'funds',
      etf: 'ETFs',
      ira: 'IRAs'
    };
    if (irregular[lower]) return irregular[lower];
    if (/\b(stocks|bonds|funds|etfs|iras|markets|options|futures|rates)\b/i.test(s)) return _titleCaseTopic(s);
    if (/y$/i.test(s)) return _titleCaseTopic(s.replace(/y$/i, 'ies'));
    if (!/s$/i.test(s)) s += 's';
    return _titleCaseTopic(s);
  }

  function _unitTopicFromQuestion(question, topic) {
    const raw = String(question || topic || '').trim().replace(/\?+$/, '').trim();
    const lower = raw.toLowerCase();
    let m = lower.match(/difference between\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+)$/i)
      || lower.match(/compare\s+(.+?)\s+(?:and|with|to|vs\.?|versus)\s+(.+)$/i);
    if (m) {
      const left = _singularToPluralConcept(m[1]);
      const right = _singularToPluralConcept(m[2]);
      if (left && right) return `${left} versus ${right}`;
    }
    m = raw.match(/how do(?:es)?\s+(.+?)\s+affect\s+(.+)$/i);
    if (m) return `${_titleCaseTopic(m[1])} and ${_titleCaseTopic(m[2])}`;
    let s = raw
      .replace(/^(what'?s|what is|what are|what does|whats|how does|how do|why does|why is|tell me about|explain|define)\s+/i, '')
      .replace(/\s+work$/i, '')
      .replace(/\s+works$/i, '')
      .replace(/^(an?|the)\s+/i, '')
      .trim();
    return _titleCaseTopic(s || topic || 'this finance topic');
  }

  function _classify(q) {
    const t = ' ' + _norm(q) + ' ';
    const advice = /\bshould i\b/.test(t)
      || /\bought i\b/.test(t)
      || /\b(what|which|how much|how many|when|where)\s+should\s+i\b/.test(t)
      || /\bhow much (should|do|can) i\b/.test(t)
      || /\b(can|should) i afford\b/.test(t)
      || /\b(is it worth|worth it|worth buying|am i ready|am i able)\b/.test(t);
    return {
      advice: advice,
      invest: /\b(invest|investing|portfolio|put my money|where to put)\b/.test(t),
      market: /\b(market|markets|bitcoin|btc|crypto|ethereum|stock price|share price|s p 500|nasdaq|dow|rally|sell off|selloff|risk off|risk on|moved|move|rose|fell|drop|surge|plunge|spike|today|this week|right now|why did)\b/.test(t),
      comparative: /\b(vs|versus|compare|comparison|difference between|better than)\b/.test(t),
      numerical: /\b(calculate|how much is|how many|formula|compound|interest rate|rate of return|percentage|percent)\b/.test(t),
      planning: /\b(retire|retirement|save for|saving for|budget|afford|emergency fund|pay off|payoff|debt)\b/.test(t),
      definitional: /\b(what is|what are|what does|whats|explain|how does|how do|meaning of|define|tell me about)\b/.test(t)
    };
  }

  function _isUnitWorthyQuestion(question, topic, cls) {
    const raw = String(question || topic || '').trim();
    const t = ' ' + _norm(raw) + ' ';
    if (!raw) return false;
    if (/^(hi|hello|hey|yo|thanks|thank you)\b/i.test(raw)) return false;
    if (cls && cls.advice) return false;
    if (/\b(should i buy|should i sell|should i hold|buy this stock|sell this stock|right now)\b/.test(t)) return false;
    if (/\b(what time|when does).*\bmarket (close|open)\b/.test(t) || /\bis the market open\b/.test(t)) return false;
    if (/\b(ticker|stock symbol)\b/.test(t)) return false;
    if (/\b(what is|whats|calculate|how much is)\s+\d+(\.\d+)?\s*(percent|%)\s+of\s+\d+/.test(t)) return false;

    const educational = cls && (cls.definitional || cls.comparative)
      || /\b(how|why|explain|difference between|compare|versus|vs|work|works|affect|risks?|examples?|applications?)\b/.test(t);
    if (!educational) return false;

    const knownConcept = /\b(ipo|etf|funds?|stocks?|bonds?|interest rates?|markets?|diversification|inflation|options?|futures?|index funds?|mutual funds?|portfolio|risk|return|dividends?|market cap|stock split|credit|debt|mortgage|taxes?|retirement|ira|401k|cash flow|income statement|balance sheet)\b/.test(t);
    const multiPart = /\b(difference between|compare|versus|vs|affect|risks?|examples?|applications?|how .* works?|how do|how does|why)\b/.test(t);
    const simpleDefinitionButExpandable = /\b(ipo|etf|inflation|diversification|options?|bonds?|stocks?|interest rates?|index funds?|mutual funds?)\b/.test(t);
    return Boolean(knownConcept && (multiPart || simpleDefinitionButExpandable));
  }

  function _buildSuggestions(entry, index) {
    const question = _prevUserText(index);
    const topicRaw = String(entry.topic || question || 'this concept').replace(/\?+$/, '').trim();
    const T = topicRaw || 'this concept';
    const ST = _shortTopic(question, entry.topic);
    const cls = _classify(question || T);
    const comparand = _COMPARANDS[_norm(ST)] || _COMPARANDS[_norm(T)] || null;

    const C = {
      example: () => ({ purpose: 'example', label: 'Walk me through an example', action: 'follow_up',
        prompt: `Give one clear, concrete real-world example that illustrates ${T}. Use 2-4 short beginner-friendly sentences.` }),
      risks: () => ({ purpose: 'risks', label: 'Explain the risks', action: 'follow_up',
        prompt: `Explain the main risks and downsides of ${T} in plain English for a beginner. Use 2-4 short sentences and keep it educational.` }),
      process: () => ({ purpose: 'process', label: 'Walk me through the process', action: 'follow_up',
        prompt: `Walk me through how ${T} works in plain English for a beginner. Use 2-4 short sentences.` }),
      comparePair: () => ({ purpose: 'compare', label: `${_cap(ST)} versus ${comparand}`, action: 'follow_up',
        prompt: `Compare ${ST} and ${comparand} in plain English. Use 2-4 short sentences on how they differ and why it matters. Educational only.` }),
      compareGeneric: () => ({ purpose: 'compare', label: 'Compare it with something similar', action: 'follow_up',
        prompt: `Compare ${T} with a closely related concept in 2-4 short beginner-friendly sentences.` }),
      compareMarket: () => ({ purpose: 'compare', label: 'Compare this with stocks', action: 'follow_up',
        prompt: `Compare ${T} with the stock market in 2-4 short beginner-friendly sentences. Educational only.` }),
      drivers: () => ({ purpose: 'drivers', label: 'Explain the biggest drivers', action: 'follow_up',
        prompt: `Explain the main factors that typically drive ${T} in 2-4 short beginner-friendly sentences. Do not make predictions.` }),
      riskCauses: () => ({ purpose: 'drivers', label: 'What usually causes risk-off moves?', action: 'follow_up',
        prompt: `Explain what usually causes risk-off moves in markets, in plain English for a beginner. Use 2-4 short sentences and do not make predictions.` }),
      whatHoldsUp: () => ({ purpose: 'holdsup', label: 'Which assets tend to hold up best?', action: 'follow_up',
        prompt: `In plain English for a beginner, explain which kinds of assets tend to hold up better during ${T}. Keep it general and educational, not specific recommendations. Use 2-4 short sentences.` }),
      isTemporary: () => ({ purpose: 'temporary', label: 'How can I tell if it’s temporary?', action: 'follow_up',
        prompt: `Explain, in plain English for a beginner, how to think about whether a market move like ${T} is temporary or longer-lasting. Use 2-4 short sentences and avoid predictions.` }),
      compareRiskOnOff: () => ({ purpose: 'compare', label: 'Compare risk-on and risk-off', action: 'follow_up',
        prompt: `Compare risk-on and risk-off market conditions in plain English for a beginner. Use 2-4 short sentences on how they differ and what each means.` }),
      watchNext: () => ({ purpose: 'watch', label: 'What should I watch next?', action: 'follow_up',
        prompt: `Explain what a beginner could reasonably watch next to understand ${T} better. Use 2-4 short sentences, educational only, with no predictions or recommendations.` }),
      learnFromIt: () => ({ purpose: 'takeaway', label: 'What should I learn from it?', action: 'follow_up',
        prompt: `Explain the key lessons a beginner should take away from ${T} in 2-4 short sentences. Educational only.` }),
      factors: () => ({ purpose: 'factors', label: 'Show me the key factors', action: 'follow_up',
        prompt: `Explain the most important factors someone should consider regarding ${T}. Use 2-4 short sentences. Keep it general and educational, not personalized advice.` }),
      tradeoffs: () => ({ purpose: 'tradeoffs', label: 'Explain the tradeoffs', action: 'follow_up',
        prompt: `Explain the main tradeoffs and considerations involved in ${T} in 2-4 short sentences. Educational only — do not tell me what to do.` }),
      hypothetical: () => ({ purpose: 'example', label: 'Give me a hypothetical example', action: 'follow_up',
        prompt: `Give a simple, clearly hypothetical example that illustrates how someone might generally think through ${T}. Use 2-4 short sentences and make clear it is illustrative, not advice.` }),
      howPeople: () => ({ purpose: 'approach', label: 'How do people usually approach this?', action: 'follow_up',
        prompt: `Explain how people generally approach ${T} in 2-4 short beginner-friendly sentences. Keep it educational and avoid personalized advice.` }),
      diversification: () => ({ purpose: 'related', label: 'Explain diversification', action: 'follow_up',
        prompt: `Explain diversification in 2-4 short beginner-friendly sentences and why it matters when building a portfolio. Educational only.` }),
      riskConcept: () => ({ purpose: 'risks', label: 'Help me understand risk', action: 'follow_up',
        prompt: `Explain how investment risk works in 2-4 short beginner-friendly sentences. Educational only.` }),
      compareStocksBonds: () => ({ purpose: 'compare', label: 'Compare stocks and bonds', action: 'follow_up',
        prompt: `Compare stocks and bonds in 2-4 short beginner-friendly sentences. Educational only.` }),
      related: () => ({ purpose: 'related', label: 'Explore a related concept', action: 'follow_up',
        prompt: `Introduce one closely related finance concept that builds on ${T} and explain it simply in 2-4 short sentences.` }),
      quiz: () => ({ purpose: 'quiz', label: `Quiz me on ${ST}`, action: 'quiz' }),
      build: () => ({ purpose: 'build', label: 'Build a unit', action: 'create_unit', unitTopic: _unitTopicFromQuestion(question, T) })
    };

    // Is the market topic itself an equity/index/market concept? If so we must
    // NOT offer "Compare this with stocks" — that compares the asset with its
    // own category. Detect that and route to topic-relevant follow-ups instead.
    const tnorm = _norm(T);
    const qnorm = _norm(question);
    const topicIsEquity = /\b(stock|stocks|equity|equities|s p 500|sp 500|s p|index|indexes|indices|index fund|index funds|nasdaq|dow|share|shares|market|markets|selloff|sell off|rally|correction|volatility|bull|bear|risk off|risk on)\b/.test(tnorm + ' ' + qnorm);
    const riskMove = /\brisk off\b|\brisk on\b/.test(tnorm + ' ' + qnorm);
    const isMarket = (cls.market || _prevUserMarketOrigin(index) || topicIsEquity || riskMove);

    let order;
    if (isMarket && !cls.advice) {
      if (riskMove) {
        order = [C.riskCauses, C.whatHoldsUp, C.isTemporary, C.compareRiskOnOff, C.watchNext, C.quiz];
      } else if (comparand && !topicIsEquity) {
        order = [C.drivers, C.comparePair, C.isTemporary, C.quiz, C.learnFromIt, C.watchNext];
      } else if (topicIsEquity) {
        // Equity/index/market topic — never "compare with stocks".
        order = [C.drivers, C.whatHoldsUp, C.isTemporary, C.quiz, C.watchNext, C.learnFromIt];
      } else {
        order = [C.drivers, C.compareMarket, C.isTemporary, C.quiz, C.learnFromIt, C.watchNext];
      }
    } else if (cls.advice && cls.invest) {
      order = [C.compareStocksBonds, C.diversification, C.riskConcept, C.factors, C.tradeoffs];
    } else if (cls.advice || cls.planning) {
      order = [C.factors, C.tradeoffs, C.hypothetical, C.howPeople, C.related];
    } else if (cls.comparative) {
      order = [C.example, C.risks, C.related, C.quiz];
    } else if (cls.numerical) {
      order = [C.example, C.process, C.related, C.quiz];
    } else {
      // definitional / conceptual (educational) — build a unit is appropriate here
      order = [C.example, comparand ? C.comparePair : C.risks, C.build, C.quiz, C.compareGeneric, C.related];
    }

    const unitWorthy = _isUnitWorthyQuestion(question || T, T, cls);
    let picked = _selectThree(order, question);
    if (unitWorthy) {
      const buildSuggestion = C.build();
      const withoutBuild = picked.filter(item => item.purpose !== 'build');
      picked = withoutBuild.slice(0, 2);
      if (picked.some(item => _tooSimilar(item.label, buildSuggestion.label))) {
        picked = picked.filter(item => !_tooSimilar(item.label, buildSuggestion.label));
      }
      picked.push(buildSuggestion);
      if (picked.length < 3) {
        const fillers = _selectThree(order.filter(fn => {
          try { return fn().purpose !== 'build'; } catch (_) { return false; }
        }), question);
        for (const item of fillers) {
          if (picked.length >= 3) break;
          if (!picked.some(existing => existing.purpose === item.purpose || _tooSimilar(existing.label, item.label))) picked.splice(picked.length - 1, 0, item);
        }
      }
    }
    if (_allDistinct(picked) && picked.length === 3) return picked;
    const fallback = _fallbackSuggestions(isMarket ? Object.assign({}, cls, { market: true }) : cls, T, ST);
    if (unitWorthy) {
      const buildSuggestion = C.build();
      return fallback.filter(item => item.purpose !== 'build').slice(0, 2).concat(buildSuggestion);
    }
    return fallback;
  }

  function _selectThree(builders, question) {
    const out = [], seenPurpose = {}, seenLabels = [];
    const qn = _norm(question);
    for (let k = 0; k < builders.length && out.length < 3; k++) {
      let s; try { s = builders[k](); } catch (_) { continue; }
      if (!s || !s.label) continue;
      const lab = _norm(s.label);
      if (!lab || _VAGUE_LABELS.indexOf(lab) >= 0) continue;
      if (s.label.split(/\s+/).length > 8) continue;
      if (seenPurpose[s.purpose]) continue;
      if (qn && _tooSimilar(lab, qn)) continue;                 // never repeat the question
      if (seenLabels.some(l => _tooSimilar(l, lab))) continue;  // no overlapping pairs
      seenPurpose[s.purpose] = true; seenLabels.push(lab);
      out.push(s);
    }
    return out;
  }

  // Intelligent, response-type-specific fallbacks (never the same generic trio).
  function _fallbackSuggestions(cls, T, ST) {
    if (cls.market) {
      return [
        { purpose: 'drivers', label: 'What drove this move?', action: 'follow_up',
          prompt: `Explain the main factors that typically drive ${T} in 2-4 short beginner-friendly sentences. No predictions.` },
        { purpose: 'takeaway', label: 'What should I learn from it?', action: 'follow_up',
          prompt: `Explain the key lessons a beginner should take away from ${T} in 2-4 short sentences. Educational only.` },
        { purpose: 'quiz', label: `Quiz me on ${ST}`, action: 'quiz' }
      ];
    }
    if (cls.advice || cls.planning) {
      return [
        { purpose: 'factors', label: 'Show me the key factors', action: 'follow_up',
          prompt: `Explain the most important factors someone should consider regarding ${T}. Use 2-4 short sentences. General and educational, not personalized advice.` },
        { purpose: 'tradeoffs', label: 'Explain the tradeoffs', action: 'follow_up',
          prompt: `Explain the main tradeoffs involved in ${T} in 2-4 short sentences. Educational only — do not tell me what to do.` },
        { purpose: 'example', label: 'Give me a hypothetical example', action: 'follow_up',
          prompt: `Give a simple, clearly hypothetical example illustrating how someone might generally think through ${T}. Use 2-4 short sentences. Illustrative, not advice.` }
      ];
    }
    return [
      { purpose: 'example', label: 'Show me an example', action: 'follow_up',
        prompt: `Give one clear, concrete real-world example that illustrates ${T}. Use 2-4 short beginner-friendly sentences.` },
      { purpose: 'compare', label: 'Compare it with something similar', action: 'follow_up',
        prompt: `Compare ${T} with a closely related concept in 2-4 short beginner-friendly sentences.` },
      { purpose: 'quiz', label: `Quiz me on ${ST}`, action: 'quiz' }
    ];
  }

  function _smartNextSteps(entry, index) {
    if (!_isNewestSuggestionOwner(index) || _normalSuggestionState(entry) === 'consumed') return '';
    const question = _prevUserText(index);
    const cls = _classify(question || entry.topic || '');
    const unitWorthy = _isUnitWorthyQuestion(question || entry.topic || '', entry.topic || '', cls);
    const staleBuildLabel = Array.isArray(entry.suggestions)
      && entry.suggestions.some(item => item && item.action === 'create_unit' && item.label !== 'Build a unit');
    const missingRequiredBuild = unitWorthy
      && (!Array.isArray(entry.suggestions) || !entry.suggestions.some(item => item && item.action === 'create_unit' && item.label === 'Build a unit'));
    if (!Array.isArray(entry.suggestions) || entry.suggestions.length !== 3 || staleBuildLabel || missingRequiredBuild) {
      entry.suggestions = _buildSuggestions(entry, index);
      entry.suggestionState = 'active';
      _persistActive();
    } else if (!entry.suggestionState) {
      entry.suggestionState = 'active';
      _persistActive();
    }
    if (_normalSuggestionState(entry) !== 'active') return '';
    const list = entry.suggestions;
    return `
      <div class="coach-next">
        <div class="coach-next-label">What would you like to do next?</div>
        <div class="coach-next-cards">
          ${list.map((s, i) => `
            <button type="button" class="coach-next-card" onclick="CoachPage.suggest(${index},${i})">
              <span class="coach-next-text">${esc(s.label)}</span>
              <span class="coach-next-arrow" aria-hidden="true">${FinLingoIcons.right()}</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function _plainAnswer(text) {
    // Render the COMPLETE answer, preserving paragraph breaks. We strip any
    // stray section labels (no ChatGPT-style headers) but never truncate or
    // collapse the whole response into a single line — full answers must show.
    let clean = (typeof _cleanTutorMarkdown === 'function') ? _cleanTutorMarkdown(text) : String(text || '');
    clean = clean
      .replace(/^\s*(Direct answer|Simple analogy|Real[- ]world example|Follow[- ]up question|Related lesson)\s*:?\s*/gim, '')
      .trim();
    const paras = clean
      .split(/\n{2,}/)                       // blank line = paragraph break
      .map(p => p.replace(/\s*\n\s*/g, ' ').trim())  // soft-wrap newlines → spaces
      .filter(Boolean);
    if (!paras.length) return `<p class="coach-answer-text"></p>`;
    return paras.map(p => `<p class="coach-answer-text">${esc(p)}</p>`).join('');
  }

  function _renderTextEntry(entry, index) {
    if (entry.kind === 'error') return _renderErrorEntry(entry, index);
    // While a streamed reveal is in progress show only the revealed prefix and
    // hold back the suggestion rows until the answer finishes.
    const revealing = entry._needsReveal && !entry._revealDone;
    const shownText = revealing ? (entry._revealedText || '') : entry.text;
    const body = `<div class="coach-answer${revealing ? ' is-streaming' : ''}">${_plainAnswer(shownText)}</div>`;
    const actions = (entry.isError || revealing) ? '' : _smartNextSteps(entry, index);
    return `${body}${actions}${_renderSimpleAnswer(entry)}`;
  }

  // ── Fast streamed-answer reveal ─────────────────────────────────────
  // Reveals a finished answer progressively from top to bottom in natural
  // word-aligned chunks. Fast and polished — not a slow typewriter.
  function _stopAnswerReveal() {
    if (!answerReveal) return;
    const el = document.getElementById('coachThread');
    if (el && answerReveal._onScroll) el.removeEventListener('scroll', answerReveal._onScroll);
    if (answerReveal.timer) clearInterval(answerReveal.timer);
    answerReveal = null;
  }

  // Snap any in-progress reveal straight to its finished state (full text +
  // suggestions). Used before starting a new reveal or a new request.
  function _finishActiveReveal() {
    if (answerReveal && answerReveal.entry) _completeReveal(answerReveal.entry);
    else _stopAnswerReveal();
  }

  function _beginAnswerReveal(entry) {
    if (!entry || !entry._needsReveal || entry._revealDone) return;
    const full = String(entry.text || '');
    // Tiny answers or reduced motion: show immediately, no animation.
    if (full.length < 24 || _reducedMotion()) { _completeReveal(entry); return; }
    _finishActiveReveal();
    const el = document.getElementById('coachThread');
    const startNearBottom = (() => {
      if (!el) return true;
      return (el.scrollHeight - el.clientHeight - el.scrollTop) <= 120;
    })();
    const controller = { entry, full, i: 0, follow: startNearBottom, timer: null };
    controller._onScroll = () => _onRevealScroll();
    if (el) el.addEventListener('scroll', controller._onScroll, { passive: true });
    answerReveal = controller;
    _revealStep();                                  // first chunk shows instantly
    if (answerReveal) answerReveal.timer = setInterval(_revealStep, REVEAL_INTERVAL_MS);
  }

  function _revealStep() {
    const r = answerReveal;
    if (!r) return;
    if (!_askScreenActive()) { _completeReveal(r.entry); return; }
    const full = r.full;
    if (r.i >= full.length) { _completeReveal(r.entry); return; }
    // Adaptive chunk: larger steps for longer answers so they still feel fast.
    let step = REVEAL_MIN_CHARS + Math.round(full.length / 60);
    step = Math.max(REVEAL_MIN_CHARS, Math.min(REVEAL_MAX_CHARS, step));
    let next = Math.min(full.length, r.i + step);
    // Prefer breaking on a whole word / punctuation boundary.
    if (next < full.length && !/\s/.test(full[next])) {
      const candidates = [full.indexOf(' ', next), full.indexOf('\n', next)].filter(n => n >= 0);
      if (candidates.length) {
        const bound = Math.min.apply(null, candidates);
        if (bound - next <= 20) next = bound;
      }
    }
    r.i = next;
    r.entry._revealedText = full.slice(0, r.i);
    _paintReveal(r);
    _autoFollow(r);
  }

  function _paintReveal(r) {
    const el = document.getElementById('coachThread');
    if (!el) return;
    const node = el.querySelector(`[data-message-id="${_cssEscapeId(r.entry.id)}"]`);
    if (!node) return;
    const ans = node.querySelector('.coach-answer');
    if (ans) ans.innerHTML = _plainAnswer(r.entry._revealedText);
  }

  function _onRevealScroll() {
    const r = answerReveal;
    const el = document.getElementById('coachThread');
    if (!r || !el) return;
    const distance = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (distance > 120) r.follow = false;        // user scrolled up → stop following
    else if (distance <= 40) r.follow = true;    // returned near bottom → resume
  }

  function _autoFollow(r) {
    if (!r || !r.follow) return;
    const el = document.getElementById('coachThread');
    if (!el) return;
    // Keep the newest revealed line visible; growth is incremental so this
    // reads as a gentle downward scroll rather than a jump to the bottom.
    const target = el.scrollHeight - el.clientHeight;
    if (target - el.scrollTop > 2) el.scrollTop = target;
  }

  function _completeReveal(entry) {
    _stopAnswerReveal();
    if (!entry) return;
    entry._revealDone = true;
    entry._needsReveal = false;
    delete entry._revealedText;
    const el = document.getElementById('coachThread');
    const node = el && el.querySelector(`[data-message-id="${_cssEscapeId(entry.id)}"]`);
    if (node) {
      const idx = thread.indexOf(entry);
      _updateMessageNode(node, entry, idx);       // full text + suggestions now
      const next = node.querySelector('.coach-next');
      if (next) next.classList.add('coach-next-enter');
    }
    _persistActive();
  }

  function _renderErrorEntry(entry, index) {
    return `
      <div class="coach-generation-error">
        <strong>${esc(entry.text || 'We couldn’t finish that response.')}</strong>
        <div class="coach-generation-actions">
          <button type="button" onclick="CoachPage.act(${index},'retry_response')">Retry</button>
        </div>
      </div>`;
  }

  function _renderUnitErrorEntry(entry, index) {
    return `
      <div class="coach-generation-error coach-unit-error">
        <strong>We couldn’t finish this unit.</strong>
        <p>${esc(entry.note || 'Your completed progress was saved.')}</p>
        <div class="coach-generation-actions">
          <button type="button" onclick="CoachPage.retryUnit(${index})">Retry</button>
          <button type="button" onclick="CoachPage.chooseAnotherDepth(${index})">Choose another depth</button>
        </div>
      </div>`;
  }

  // Conservative per-lesson estimate used before any lesson has completed.
  const UNIT_JOB_DEFAULT_LESSON_MS = 9000;

  function _unitJobTargetLessons(entry) {
    return Number(entry.totalLessonCount) || Number(entry.depthSelection?.targetLessonCount) || 0;
  }

  // Clear all time-estimate state for a job so a fresh (re)start counts down
  // from a new estimate rather than inheriting an elapsed clock or the monotonic
  // "Finishing up…" floor from a previous attempt.
  function _resetUnitJobTiming(entry) {
    if (!entry) return;
    entry.generationStartedAt = _nowIso();
    entry.lessonDurationsMs = [];
    entry._lastStepAt = undefined;
    entry._etaAt = undefined;
    entry._etaLevel = undefined;
  }

  // Record per-lesson generation durations as lessons complete so the time
  // estimate is grounded in this job's ACTUAL pace (rolling average), then
  // re-anchor the live ETA.
  function _updateUnitJobTiming(entry, previousLessons, previousUpdatedAt) {
    const now = Date.parse(entry.updatedAt || '') || Date.now();
    if (!entry.generationStartedAt) entry.generationStartedAt = entry.createdAt || _nowIso();
    if (!Array.isArray(entry.lessonDurationsMs)) entry.lessonDurationsMs = [];
    const before = Math.max(0, Number(previousLessons) || 0);
    const after = Math.max(before, Number(entry.completedLessonCount) || 0);
    if (after > before) {
      const prior = Number(entry._lastStepAt)
        || Date.parse(previousUpdatedAt || '')
        || Date.parse(entry.generationStartedAt || '')
        || now;
      const perLesson = Math.max(800, (now - prior) / (after - before));
      for (let i = before; i < after; i++) entry.lessonDurationsMs.push(perLesson);
      entry.lessonDurationsMs = entry.lessonDurationsMs.slice(-8);
      entry._lastStepAt = now;
    }
    if (!Number.isFinite(entry._lastStepAt)) {
      entry._lastStepAt = Date.parse(entry.generationStartedAt || '') || now;
    }
    _refreshUnitJobEta(entry);
  }

  // Raw remaining-work estimate in ms, blending overall pace with the most
  // recent lessons and accounting for recap creation + final save.
  function _rawRemainingMs(entry) {
    const total = _unitJobTargetLessons(entry);
    const completed = Math.max(0, Math.min(total, Number(entry.completedLessonCount) || 0));
    const now = Date.now();
    const startMs = Date.parse(entry.generationStartedAt || entry.createdAt || '') || now;
    const durations = (entry.lessonDurationsMs || []).map(Number).filter(n => Number.isFinite(n) && n > 0);
    let avgLessonMs;
    if (completed >= 1) {
      const overallPerLesson = Math.max(800, (now - startMs) / completed);
      const recent = durations.slice(-3);
      const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : overallPerLesson;
      avgLessonMs = overallPerLesson * 0.45 + recentAvg * 0.55;
    } else {
      avgLessonMs = UNIT_JOB_DEFAULT_LESSON_MS;
    }
    avgLessonMs = Math.max(2500, Math.min(45000, avgLessonMs));
    const recapMs = avgLessonMs * 0.8;                 // recap quiz creation
    const finalizeMs = Math.min(4000, avgLessonMs * 0.4); // validation + save
    if (entry.status === 'completed') return 0;
    if (entry.status === 'validating') return Math.max(800, finalizeMs * 0.6);
    if (entry.status === 'generating_quizzes') return recapMs * 0.55 + finalizeMs;
    const remainingLessons = Math.max(0, total - completed);
    let lessonsMs;
    if (entry.status === 'generating_lessons') {
      const lastStepMs = Number(entry._lastStepAt) || startMs;
      const spentOnCurrent = Math.max(0, now - lastStepMs);
      const currentRemain = Math.max(avgLessonMs * 0.1, avgLessonMs - spentOnCurrent);
      lessonsMs = currentRemain + Math.max(0, remainingLessons - 1) * avgLessonMs;
    } else {
      // queued / generating_outline: the whole lesson set is still ahead.
      lessonsMs = remainingLessons * avgLessonMs + avgLessonMs * 0.5;
    }
    return lessonsMs + recapMs + finalizeMs;
  }

  // Re-anchor the ETA timestamp on each poll, smoothing against the value we
  // were already counting down toward so the visible number never jumps.
  function _refreshUnitJobEta(entry) {
    const now = Date.now();
    const raw = _rawRemainingMs(entry);
    let remain;
    // Re-anchor cleanly when there is no prior ETA, or a persisted one has
    // already elapsed (e.g. after a reload); otherwise smooth toward the new
    // estimate so the visible number never jumps.
    if (!Number.isFinite(entry._etaAt) || entry._etaAt <= now) {
      remain = raw;
    } else {
      const prevRemain = entry._etaAt - now;
      remain = prevRemain * 0.6 + raw * 0.4;
    }
    entry._etaAt = now + Math.max(0, remain);
  }

  // Live remaining seconds — counts down every second between polls.
  function _unitJobEtaSeconds(entry) {
    if (entry.status === 'completed') return 0;
    if (!Number.isFinite(entry._etaAt)) _refreshUnitJobEta(entry);
    return Math.max(0, Math.round((entry._etaAt - Date.now()) / 1000));
  }

  function _formatEta(seconds) {
    const s = Math.max(0, Number(seconds) || 0);
    if (s < 10) return 'Almost ready';
    if (s < 60) {
      const rounded = Math.max(10, Math.min(55, Math.round(s / 5) * 5));
      return `About ${rounded} seconds remaining`;
    }
    const minutes = Math.round(s / 60);
    return `About ${minutes} minute${minutes === 1 ? '' : 's'} remaining`;
  }

  function _unitJobProgressLabel(entry) {
    const completed = Number(entry.completedLessonCount) || 0;
    const total = _unitJobTargetLessons(entry);
    if (entry.status === 'queued' || entry.status === 'generating_outline') return 'Preparing unit';
    if (entry.status === 'generating_lessons') return `Creating lesson ${Math.min(total, completed + 1)} of ${total}`;
    if (entry.status === 'generating_quizzes') return 'Creating recap quiz';
    if (entry.status === 'validating') return 'Finalizing unit';
    return 'Preparing unit';
  }

  // Centralized, countdown-style time estimate. It maps the live remaining-
  // seconds value — smoothly counted down between polls by _unitJobEtaSeconds,
  // which is anchored on real generation pace + lesson progress in
  // _rawRemainingMs — onto a small ladder of human labels. The estimate is
  // based on elapsed time AND the expected unit-generation duration, only ever
  // steps DOWN (never back to a longer label), never shows "0 seconds" or a
  // negative value, and falls through to "Finishing up…" once generation runs
  // past the expected duration. This is the single source of truth for the
  // estimate text; the 1s ticker simply re-reads it.
  const UNIT_JOB_ETA_LABELS = [
    'About 2 minutes remaining',   // 0
    'About 1 minute remaining',    // 1
    'About 45 seconds remaining',  // 2
    'About 30 seconds remaining',  // 3
    'About 15 seconds remaining',  // 4
    'Finishing up…'                // 5
  ];
  // Returns the ladder index for the current live estimate. Higher = less time.
  function _unitJobEtaLevel(entry) {
    // Recap-quiz creation + final validation/save are always the home stretch.
    if (entry.status === 'generating_quizzes' || entry.status === 'validating') return 5;
    const secs = _unitJobEtaSeconds(entry);   // already clamped to >= 0
    if (secs > 90) return 0;
    if (secs > 52) return 1;
    if (secs > 37) return 2;
    if (secs > 22) return 3;
    if (secs > 8) return 4;
    return 5;   // <= 8s (incl. 0) → "Finishing up…", never a bare "0 seconds"
  }
  function _unitJobEtaText(entry) {
    let level = _unitJobEtaLevel(entry);
    const prev = Number(entry._etaLevel);
    // Never move backward to a longer estimate.
    if (Number.isFinite(prev) && prev > level) level = prev;
    entry._etaLevel = level;
    return UNIT_JOB_ETA_LABELS[Math.max(0, Math.min(UNIT_JOB_ETA_LABELS.length - 1, level))];
  }

  // The trailing stage descriptor on the progress card's secondary line. Derived
  // ENTIRELY from real build progress (server status + completed lesson count),
  // never from an elapsed-time estimate — so it can NEVER read "Finishing up…"
  // while lessons are still being generated, even after the user navigated away
  // and a time-based countdown would otherwise have run out. "Finishing up…"
  // appears only once every lesson is complete and the unit is in final assembly.
  function _unitJobStageText(entry) {
    const total = _unitJobTargetLessons(entry);
    const completed = Math.max(0, Number(entry.completedLessonCount) || 0);
    if (entry.status === 'queued' || entry.status === 'generating_outline') {
      return 'Planning your unit…';
    }
    if (entry.status === 'generating_lessons') {
      // Still building lessons → never "Finishing up". If the server has counted
      // every lesson but not yet advanced its status, it is between stages.
      if (total && completed >= total) return 'Finishing up…';
      return `Building lesson ${Math.min(total || (completed + 1), completed + 1)}…`;
    }
    // generating_quizzes / validating → all lessons done, final assembly/save.
    return 'Finishing up…';
  }

  function _unitJobSecondary(entry) {
    const total = _unitJobTargetLessons(entry);
    const completed = Math.max(0, Math.min(total || Number.MAX_SAFE_INTEGER, Number(entry.completedLessonCount) || 0));
    const stage = _unitJobStageText(entry);
    if (!total) return stage;
    if (entry.status === 'generating_quizzes' || entry.status === 'validating') {
      return `${total} of ${total} lessons ready · ${stage}`;
    }
    return `${completed} of ${total} lessons ready · ${stage}`;
  }

  // ── Live unit-job ticker ────────────────────────────────────────────
  // Re-paints only the progress card's text once per second so the time
  // estimate counts down smoothly between 1.5s polls — never re-rendering or
  // flashing the rest of the thread.
  function _ensureUnitJobTicker() {
    if (unitJobTicker) return;
    unitJobTicker = setInterval(_tickUnitJobs, 1000);
  }
  function _stopUnitJobTicker() {
    if (unitJobTicker) { clearInterval(unitJobTicker); unitJobTicker = null; }
  }
  function _tickUnitJobs() {
    if (!_askScreenActive()) { _stopUnitJobTicker(); return; }
    const el = document.getElementById('coachThread');
    if (!el) return;
    let anyActive = false;
    thread.forEach(entry => {
      if (!entry || entry.kind !== 'unit_job' || !UNIT_JOB_ACTIVE_STATUSES.has(entry.status)) return;
      anyActive = true;
      const node = el.querySelector(`[data-message-id="${_cssEscapeId(entry.id)}"]`);
      if (!node) return;
      const strong = node.querySelector('.coach-unit-job-copy strong');
      const small = node.querySelector('.coach-unit-job-copy small');
      if (strong) strong.textContent = _unitJobProgressLabel(entry);
      if (small) small.textContent = _unitJobSecondary(entry);
    });
    if (!anyActive) _stopUnitJobTicker();
  }

  function _renderUnitJobEntry(entry, index) {
    if (entry.status === 'failed' || entry.status === 'start_failed') {
      const note = entry.errorCategory === 'connection_lost'
        ? 'We lost connection while building this unit. Your progress was saved — retry to pick up where it left off.'
        : entry.errorCategory === 'invalid_api_key'
          ? 'Unit generation isn’t available right now.'
          : 'One part of the unit could not be generated.';
      return _renderUnitErrorEntry(Object.assign({ note }, entry), index);
    }
    if (entry.status === 'cancelled') {
      return `
        <div class="coach-unit-job coach-unit-job-cancelled">
          <strong>Unit creation cancelled</strong>
          <button type="button" onclick="CoachPage.retryUnit(${index})">Retry</button>
        </div>`;
    }
    const label = _unitJobProgressLabel(entry);
    const secondary = _unitJobSecondary(entry);
    return `
      <div class="coach-unit-job" role="status" aria-live="polite">
        <div class="coach-loading-orbit" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="coach-unit-job-copy">
          <strong>${esc(label)}</strong>
          <small>${esc(secondary)}</small>
          ${entry.pollingIssue ? `<p>${esc(entry.pollingIssue)}</p>` : ''}
        </div>
        <button type="button" class="coach-unit-job-cancel" onclick="CoachPage.cancelUnitJob(${index})">Cancel</button>
      </div>`;
  }

  function _renderSimpleAnswer(entry) {
    if (entry.simpleBusy) {
      return `<div class="coach-simple-card"><div class="coach-simple-head"><strong>Explain it simpler</strong><span>10 sec read</span></div><div class="coach-loading coach-loading-thinking"><span class="coach-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Working on it</span></div></div>`;
    }
    if (entry.simpleError) {
      return `<div class="coach-simple-card"><div class="coach-simple-head"><strong>Explain it simpler</strong><span>10 sec read</span></div><p>${esc(entry.simpleError)}</p></div>`;
    }
    if (!entry.simpleText) return '';
    return `<div class="coach-simple-card"><div class="coach-simple-head"><strong>Explain it simpler</strong><span>10 sec read</span></div><p>${esc(entry.simpleText)}</p></div>`;
  }

  // The full generated-unit overview card (label, save icon, title,
  // description, numbered lesson list with per-lesson previews, footer
  // metadata). Built from the SAME canonical unit object saved into Learn so
  // the chat overview and the Learn card always match.
  function _unitOverviewCard(entry, index) {
    const d = entry.data || {};
    const lessons = d.lessons || [];
    const title = _cleanListItem(_unitTitle(d, entry.topic));
    const description = _cleanListItem(_unitDescription(d));
    const selectedDepth = d.selectedDepth || d.selected_depth || '';
    const depthLabel = selectedDepth ? _depthName(selectedDepth) : '';
    const metaText = [
      `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`,
      depthLabel,
      (d.recapQuiz || d.recap_quiz || []).length ? 'Recap quiz included' : ''
    ].filter(Boolean).join(' · ');
    _syncUnitSavedState(entry);
    return `
      <div class="coach-unit">
        <div class="coach-unit-top">
          <span class="coach-unit-badge">Generated unit</span>
          <button type="button"
                  class="coach-unit-save-icon${entry.saved ? ' is-saved' : ''}"
                  onclick="CoachPage.saveUnit(${index})"
                  aria-label="${entry.saved ? 'Saved to Learn' : 'Save unit to Learn'}"
                  title="${entry.saved ? 'Saved to Learn' : 'Save unit to Learn'}"
                  ${entry.saved ? 'disabled' : ''}>
            ${entry.saved ? _unitSaveIcon('check') : _unitSaveIcon('download')}
          </button>
        </div>
        <h3 class="coach-unit-title">${esc(title)}</h3>
        <p class="coach-unit-desc">${esc(description)}</p>
        <ol class="coach-unit-lessons">
          ${lessons.map((l, i) => {
            const lessonTitle = _cleanListItem(typeof l === 'string' ? l : (l.title || `Lesson ${i + 1}`));
            // Preview only: lesson number + title + one short core-idea preview.
            let preview = typeof l === 'string' ? '' : ((Array.isArray(l.slides) && l.slides[0]?.body) || l.coreIdea || l.core_idea || l.description || l.summary || '');
            preview = _cleanListItem(String(preview).split(/(?<=[.!?])\s/)[0] || '');
            if (preview.length > 90) preview = preview.slice(0, 88).replace(/\s+\S*$/, '') + '…';
            return `<li><span class="coach-unit-num">${i + 1}</span><div><strong>${esc(lessonTitle)}</strong>${preview ? `<small>${esc(preview)}</small>` : ''}</div></li>`;
          }).join('')}
        </ol>
        <div class="coach-unit-meta">${esc(metaText)}</div>
      </div>`;
  }

  function _renderUnitEntry(entry, index) {
    // Overview reconstruction guard: if the in-memory unit data was lost (e.g.
    // a reload mid-generation) but the unit was saved into Learn, rebuild the
    // overview from the stable saved unit instead of degrading to a stub.
    if ((!entry.data || !(entry.data.lessons || []).length) && entry.unitId) {
      const saved = CoachUnits.get(entry.unitId);
      if (saved && (saved.lessons || []).length) entry.data = saved;
    }
    const card = _unitOverviewCard(entry, index);
    // Units produced by the async generation job keep the full overview (never
    // a tiny "Unit ready" message) with Start unit / View in Learn beneath it.
    if (entry.fromUnitJob) {
      return `${card}
        <div class="coach-next">
          <div class="coach-next-cards">
            <button type="button" class="coach-next-card" onclick="CoachPage.act(${index},'start_lesson')"><span class="coach-next-text">Start unit</span><span class="coach-next-arrow" aria-hidden="true">${FinLingoIcons.right()}</span></button>
            <button type="button" class="coach-next-card" onclick="CoachPage.act(${index},'view_in_learn')"><span class="coach-next-text">View in Learn</span><span class="coach-next-arrow" aria-hidden="true">${FinLingoIcons.right()}</span></button>
          </div>
        </div>`;
    }
    return `${card}
      <div class="coach-next">
        <div class="coach-next-cards">
          <button type="button" class="coach-next-card" onclick="CoachPage.act(${index},'start_lesson')"><span class="coach-next-text">${entry.saved ? 'Start the unit' : 'Preview the first lesson'}</span><span class="coach-next-arrow" aria-hidden="true">${FinLingoIcons.right()}</span></button>
          ${entry.saved ? `<button type="button" class="coach-next-card" onclick="CoachPage.act(${index},'open_learn')"><span class="coach-next-text">Open it in Learn</span><span class="coach-next-arrow" aria-hidden="true">${FinLingoIcons.right()}</span></button>` : ''}
          <button type="button" class="coach-next-card" onclick="CoachPage.act(${index},'quiz')"><span class="coach-next-text">Quiz me on this</span><span class="coach-next-arrow" aria-hidden="true">${FinLingoIcons.right()}</span></button>
        </div>
      </div>`;
  }

  function _renderCourseOutlineEntry(entry, index) {
    const d = entry.data || {};
    const units = d.units || d.proposedUnits || d.proposed_units || [];
    const title = d.courseTitle || d.course_title || d.title || 'Suggested course structure';
    const description = d.description || 'This topic is best split into smaller units so each one stays focused.';
    const recommendedIndex = Number(d.recommendedFirstUnitIndex ?? d.recommended_first_unit_index ?? 0);
    return `
      <div class="coach-unit coach-course-outline">
        <div class="coach-unit-top">
          <span class="coach-unit-badge">Course outline</span>
        </div>
        <h3 class="coach-unit-title">${esc(title)}</h3>
        <p class="coach-unit-desc">${esc(description)}</p>
        <div class="coach-outline-list">
          ${units.slice(0, 6).map((unit, i) => {
            const range = unit.lessonRange || unit.lesson_range || {};
            const label = range.min && range.max ? `${range.min}-${range.max} lessons` : 'Focused unit';
            const recommended = unit.recommended || i === recommendedIndex;
            return `
              <article class="coach-outline-item">
                <div>
                  <strong>${esc(unit.title || unit.unitTitle || `Unit ${i + 1}`)}</strong>
                  <small>${esc(unit.description || '')}</small>
                  <span>${esc(label)}${recommended ? ' · Recommended first' : ''}</span>
                </div>
                <button type="button" onclick="CoachPage.buildCourseUnit(${index},${i})">Build</button>
              </article>`;
          }).join('')}
        </div>
        <div class="coach-unit-meta">Best as multiple smaller units · Deep dive</div>
      </div>`;
  }

  function _syncUnitSavedState(entry) {
    if (!entry || entry.kind !== 'unit' || !entry.data) return;
    entry.unitId = entry.unitId || _unitStableId(entry.data, entry.topic);
    if (CoachUnits.get(entry.unitId)) {
      entry.saved = true;
      return;
    }
    const title = _unitTitle(entry.data, entry.topic);
    const match = CoachUnits.all().find(unit => (unit.title || '').toLowerCase() === String(title || '').toLowerCase());
    if (match) {
      entry.unitId = match.id;
      entry.saved = true;
    }
  }

  function _unitSaveIcon(kind) {
    if (kind === 'check') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
  }

  function _renderQuizEntry(entry, index) {
    const quiz = entry.data || {};
    const questions = quiz.questions || [];
    const answers = entry.answers || {};
    const selections = entry.selections || {};
    return `
      <div class="coach-quiz">
        <div class="coach-quiz-title">${esc(quiz.title || 'Quick check')}</div>
        ${questions.map((q, qi) => {
          const picked = answers[qi];
          const answered = Number.isInteger(picked);
          const selected = selections[qi];
          const correct = Number(q.correct_index);
          // Answer cards mirror the lesson quick-check: a letter circle, left
          // alignment, the shared sizing/radius/typography, and a select →
          // Submit → green/red flow. A single tap only selects (neutral); the
          // answer is not graded until Submit is pressed.
          const choices = (q.choices || []).map((choice, ci) => {
            let cls = '';
            if (answered && ci === correct) cls = ' is-correct';
            else if (answered && ci === picked) cls = ' is-wrong';
            else if (!answered && ci === selected) cls = ' is-selected';
            return `<button type="button" class="coach-quiz-choice${cls}" ${answered ? 'disabled' : ''} aria-pressed="${!answered && ci === selected ? 'true' : 'false'}" onclick="CoachPage.quizSelect(${index},${qi},${ci})">
                <span class="coach-quiz-letter">${String.fromCharCode(65 + ci)}</span>
                <span class="coach-quiz-choice-text">${esc(choice)}</span>
              </button>`;
          }).join('');
          return `
            <div class="coach-quiz-q">
              <strong>${qi + 1}. ${esc(q.question)}</strong>
              <div class="coach-quiz-choices">${choices}</div>
              ${answered
                ? `<div class="coach-quiz-fb ${picked === correct ? 'ok' : 'no'}"><b>${picked === correct ? 'Correct.' : 'Not quite.'}</b> ${esc(q.explanation)}</div>`
                : `<div class="coach-quiz-actions"><button type="button" class="coach-quiz-submit" ${Number.isInteger(selected) ? '' : 'disabled'} onclick="CoachPage.quizSubmit(${index},${qi})">Submit</button></div>`}
            </div>`;
        }).join('')}
      </div>
      ${_nextSteps(index, [['create_unit', 'Build this into a full unit'], ['example', 'Give me an example'], ['connect_market', 'Connect this to today’s market']])}`;
  }

  function _renderMarketEntry(entry, index) {
    const r = entry.data || {};
    const rows = [
      ['What happened', r.what_happened],
      ['Why it happened', r.why_it_happened],
      ['Why it matters', r.why_it_matters],
      ['Beginner takeaway', r.beginner_takeaway]
    ].filter(([, v]) => v);
    return `
      <div class="coach-sections">${rows.map(([label, value]) => `<div class="coach-section"><span>${esc(label)}</span><p>${esc(value)}</p></div>`).join('')}</div>
      ${_nextSteps(index, [['open_market', 'Open the Market page'], ['create_unit', 'Build this into a full unit'], ['quiz', 'Quiz me on this']])}`;
  }

  function _loadingMarkup() {
    if (busyMode === 'build_unit') {
      return `
        <div class="coach-loading coach-loading-unit" role="status" aria-live="polite">
          <div class="coach-loading-orbit" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="coach-loading-copy">
            <strong>${esc(busyLabel || 'Building your unit...')}</strong>
            <ol class="coach-loading-steps">
              <li class="is-active">Creating lessons</li>
              <li>Adding quick checks</li>
              <li>Finalizing</li>
            </ol>
          </div>
        </div>`;
    }
    return `
      <div class="coach-loading coach-loading-thinking" role="status" aria-live="polite">
        <span class="coach-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>${esc(busyLabel || 'Working on it')}</span>
      </div>`;
  }

  function _messageInnerMarkup(entry, index) {
    if (entry.role === 'user') return esc(entry.text);
    if (entry.kind === 'unit') return _renderUnitEntry(entry, index);
    if (entry.kind === 'unit_job') return _renderUnitJobEntry(entry, index);
    if (entry.kind === 'unit_error') return _renderUnitErrorEntry(entry, index);
    if (entry.kind === 'course_outline') return _renderCourseOutlineEntry(entry, index);
    if (entry.kind === 'quiz') return _renderQuizEntry(entry, index);
    if (entry.kind === 'market') return _renderMarketEntry(entry, index);
    return _renderTextEntry(entry, index);
  }

  function _createMessageNode(entry) {
    const node = document.createElement('div');
    const key = entry.id || _msgId();
    entry.id = key;
    node.dataset.messageId = key;
    return node;
  }

  function _updateMessageNode(node, entry, index) {
    const key = entry.id || _msgId();
    entry.id = key;
    node.dataset.messageId = key;
    const inner = _messageInnerMarkup(entry, index);
    if (entry.role === 'user') {
      node.className = 'coach-msg coach-msg-user';
      if (node.dataset.renderedHtml !== inner) {
        node.textContent = entry.text || '';
        node.dataset.renderedHtml = inner;
      }
      return;
    }
    node.className = 'coach-msg coach-msg-answer';
    let body = node.querySelector(':scope > .coach-msg-body');
    if (!body) {
      node.textContent = '';
      body = document.createElement('div');
      body.className = 'coach-msg-body';
      node.appendChild(body);
    }
    if (node.dataset.renderedHtml !== inner) {
      body.innerHTML = inner;
      node.dataset.renderedHtml = inner;
    }
  }

  function _renderThread(options = {}) {
    const el = document.getElementById('coachThread');
    if (!el) return;
    const snapshot = _captureThreadScroll();
    const existing = new Map();
    Array.from(el.children).forEach(node => {
      if (node.dataset?.messageId) existing.set(node.dataset.messageId, node);
    });
    const used = new Set();
    thread.forEach((entry, index) => {
      _stamp(entry, entry.mode || entry.kind || entry.role);
      const key = entry.id;
      const node = existing.get(key) || _createMessageNode(entry);
      _updateMessageNode(node, entry, index);
      used.add(key);
      if (el.children[index] !== node) el.insertBefore(node, el.children[index] || null);
    });
    let expectedCount = thread.length;
    // Build-unit generation has its own boxed "Preparing unit" progress card
    // (the unit_job thread entry), so suppress the generic busy steps block to
    // avoid showing two loading UIs at once.
    if (busy && busyMode !== 'build_unit' && activeCoachRequest && activeCoachRequest.chatId === activeChatId) {
      const busyKey = 'coach_busy_message';
      let node = existing.get(busyKey);
      if (!node) {
        node = document.createElement('div');
        node.dataset.messageId = busyKey;
      }
      node.className = 'coach-msg coach-msg-answer';
      const inner = _loadingMarkup();
      if (node.dataset.renderedHtml !== inner) {
        node.innerHTML = `<div class="coach-msg-body">${inner}</div>`;
        node.dataset.renderedHtml = inner;
      }
      used.add(busyKey);
      if (el.children[expectedCount] !== node) el.insertBefore(node, el.children[expectedCount] || null);
      expectedCount += 1;
    }
    Array.from(el.children).forEach(node => {
      if (!used.has(node.dataset?.messageId || '')) node.remove();
    });
    if (_hasActiveUnitJob()) _ensureUnitJobTicker();
    else _stopUnitJobTicker();
    _finalizeThreadScroll(snapshot, options);
  }

  // ── Typewriter ──────────────────────────────────────────────────────
  const tw = { timer: null, i: 0, c: 0, deleting: false, active: false };
  function _reducedMotion() {
    try { return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
  }
  function _startTypewriter() {
    const input = document.getElementById('coachInput');
    if (!input) return;
    tw.active = true;
    if (_reducedMotion()) { input.setAttribute('placeholder', EXAMPLE_PROMPTS[0]); tw.active = false; return; }
    tw.i = 0; tw.c = 0; tw.deleting = false;
    _twTick();
  }
  // Calm, premium pacing — type a prompt, hold it briefly, erase gently, then
  // breathe before the next one. The hold is applied ONCE, after the sentence
  // is fully typed (never per character). Sequence:
  //   type complete question → wait FULL_TEXT_PAUSE → erase → wait
  //   NEXT_PROMPT_PAUSE → type next.
  const TYPE_SPEED = 115;          // per-character typing speed
  const FULL_TEXT_PAUSE = 1000;    // hold once after a sentence is complete
  const DELETE_SPEED = 60;         // per-character deletion speed
  const NEXT_PROMPT_PAUSE = 720;   // pause before the next sentence begins
  function _twTick() {
    const input = document.getElementById('coachInput');
    if (!input || !tw.active) return;
    const word = EXAMPLE_PROMPTS[tw.i % EXAMPLE_PROMPTS.length];
    if (!tw.deleting) {
      tw.c++;
      input.setAttribute('placeholder', word.slice(0, tw.c));
      if (tw.c >= word.length) { tw.deleting = true; tw.timer = setTimeout(_twTick, FULL_TEXT_PAUSE); return; }
      // Slight natural variation so it reads like real typing, not a metronome.
      tw.timer = setTimeout(_twTick, TYPE_SPEED + (tw.c % 3 === 0 ? 24 : 0));
    } else {
      tw.c--;
      input.setAttribute('placeholder', word.slice(0, Math.max(0, tw.c)));
      if (tw.c <= 0) { tw.deleting = false; tw.i++; tw.timer = setTimeout(_twTick, NEXT_PROMPT_PAUSE); return; }
      tw.timer = setTimeout(_twTick, DELETE_SPEED);
    }
  }
  function _stopTypewriter() {
    tw.active = false;
    if (tw.timer) { clearTimeout(tw.timer); tw.timer = null; }
    const input = document.getElementById('coachInput');
    if (input) input.setAttribute('placeholder', 'Ask anything about money or markets…');
  }

  // ── Submit ──────────────────────────────────────────────────────────
  function submit(event) {
    if (event && event.preventDefault) event.preventDefault();
    const input = document.getElementById('coachInput');
    const value = input ? input.value.trim() : '';
    if (!value) return false;
    if (input) input.value = '';
    _checkAskInactivity();   // start a fresh chat first if idle past the threshold
    coachAsk(value);
    return false;
  }

  // ── Mentor front-door helpers (presentation only) ───────────────────
  // Time-of-day greeting for the empty-state mentor hero. Pure UI copy — no
  // chat state, persistence, or logic involved.
  function _coachGreeting() {
    let h = 12;
    try { h = new Date().getHours(); } catch (_) {}
    return (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + '.';
  }
  const _COACH_ICON_MARKET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>';
  const _COACH_ICON_LEARN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h11v16H6a2 2 0 0 0-2 2z"/><path d="M17 3h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-1"/></svg>';
  // Curated, evergreen suggested prompts — market-aware and learning-aware
  // categories (NOT live data / portfolio). Static presentation content.
  function _coachSuggestions() {
    return [
      { kind: 'market', icon: _COACH_ICON_MARKET, label: 'Explain the latest Fed rate decision', q: 'Explain the latest Fed rate decision in plain English.' },
      { kind: 'market', icon: _COACH_ICON_MARKET, label: 'How does inflation affect a portfolio?', q: 'How does inflation affect a diversified portfolio?' },
      { kind: 'learn',  icon: _COACH_ICON_LEARN,  label: 'Quiz me on what I’m learning', q: 'Quiz me on the concepts I’ve been learning.' },
      { kind: 'learn',  icon: _COACH_ICON_LEARN,  label: 'Connect my lessons to the market', q: 'Connect what I’m learning to current market moves.' }
    ];
  }
  // A suggested-prompt card fills the composer and sends via the normal ask
  // path (coachAsk). No ChatStore/threading/streaming/persistence change.
  function askPrompt(source) {
    const text = (source && source.getAttribute) ? source.getAttribute('data-q') : String(source || '');
    if (!text || !text.trim()) return;
    const input = document.getElementById('coachInput');
    if (input) input.value = text;
    _checkAskInactivity();   // mirror submit(): start a fresh chat first if idle
    coachAsk(text.trim());
  }

  // ── Page render ─────────────────────────────────────────────────────
  // Empty chat → large empty-state (heading, description, input, disclaimer).
  // Existing chat → conversation, with a persistent compact composer below it
  // (never the big heading mid-conversation) so follow-ups are always possible.
  function renderCoach() {
    const root = document.getElementById('coachRoot');
    if (!root) return;
    _ensureActiveLoaded();
    // Boot / reopen / route-in: if the last interaction was >15 min ago, swap to
    // a fresh empty chat (the old one stays in history). newChat() re-renders, so
    // stop here to avoid briefly painting the stale conversation.
    if (_checkAskInactivity()) return;
    const isBlank = thread.length === 0;
    const showHero = isBlank;
    const showCompact = !isBlank;

    const greeting = _coachGreeting();
    const suggestHtml = showHero ? _coachSuggestions().map(s => `
            <button type="button" class="coach-suggest-card" data-kind="${s.kind}" data-q="${esc(s.q)}" onclick="CoachPage.askPrompt(this)">
              <span class="coach-suggest-icon" aria-hidden="true">${s.icon}</span>
              <span class="coach-suggest-text">${esc(s.label)}</span>
              <span class="coach-suggest-arrow" aria-hidden="true">${FinLingoIcons.right()}</span>
            </button>`).join('') : '';

    root.innerHTML = `
      <div class="coach-page-shell ${isBlank ? 'has-composer' : 'is-conversation'}">
        ${showHero ? `<section class="coach-hero coach-mentor-hero">
          <div class="coach-hero-copy">
            <div class="coach-mentor-kicker">Finlingo Coach</div>
            <h1>${greeting}</h1>
            <p class="coach-subtitle">Your AI mentor for markets, investing, and the language of finance.</p>
          </div>
          <div class="coach-insight-card">
            <span class="coach-insight-eyebrow">Mentor Brief</span>
            <p class="coach-insight-text">Markets move on expectations, not just headlines. Bring a question and we’ll unpack the “why” behind the move.</p>
          </div>
          <div class="coach-suggest">
            <div class="coach-suggest-label">Suggested Actions</div>
            <div class="coach-suggest-grid">${suggestHtml}</div>
          </div>
        </section>
        <div class="coach-bottom-composer coach-bottom-composer-empty">
          <form class="coach-input-form" onsubmit="return CoachPage.submit(event)">
            <input id="coachInput" type="text" maxlength="500" autocomplete="off" placeholder="Ask anything about money or markets…" aria-label="Ask anything about money, investing, or today’s market"/>
            <button type="submit" class="coach-send" aria-label="Ask">
              ${FinLingoIcons.right()}
            </button>
          </form>
          <p class="coach-edu-note">Educational only. Not financial advice.</p>
        </div>` : ''}
        <section class="coach-thread" id="coachThread" aria-live="polite"></section>
        ${showCompact ? `<div class="coach-compact-composer coach-bottom-composer">
          <form class="coach-input-form coach-input-form-compact" onsubmit="return CoachPage.submit(event)">
            <input id="coachInput" type="text" maxlength="500" autocomplete="off" placeholder="Ask a follow-up…" aria-label="Ask a follow-up question"/>
            <button type="submit" class="coach-send" aria-label="Ask">
              ${FinLingoIcons.right()}
            </button>
          </form>
          <p class="coach-edu-note">Educational only. Not financial advice.</p>
        </div>` : ''}
      </div>`;

    _renderThread();
    _resumeUnitJobsForActiveChat();
    const threadEl = document.getElementById('coachThread');
    if (threadEl && !threadEl.dataset.scrollLockBound) {
      threadEl.dataset.scrollLockBound = 'true';
      threadEl.addEventListener('scroll', () => {
        if (_hasActiveUnitJob()) userScrollLockedDuringGeneration = true;
      }, { passive: true });
    }
    if (!_hasActiveUnitJob()) userScrollLockedDuringGeneration = false;

    const input = document.getElementById('coachInput');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); }
      });
      if (showHero) {
        // First focus/typing is both an inactivity-check trigger (resets to a
        // fresh chat before the user types if idle past the threshold) and the
        // signal to stop the typewriter immediately.
        const onFirstInteract = () => { _checkAskInactivity(); _stopTypewriter(); };
        input.addEventListener('focus', onFirstInteract, { once: true });
        input.addEventListener('input', onFirstInteract, { once: true });
        _startTypewriter();
      }
    }
  }

  // ── Multi-chat entry points ─────────────────────────────────────────
  function _askScreenActive() {
    const s = document.getElementById('coachScreen');
    return s && s.classList.contains('active');
  }

  // ── Ask inactivity reset ────────────────────────────────────────────
  // After 15 minutes without any meaningful interaction, the next time the user
  // returns (reload, reopen, tab return, app resume, or routing back into Ask)
  // we start a fresh, empty chat. The previous conversation is never deleted —
  // it stays in history (newChat() reuses ChatStore so prior messages persist).
  //
  // "Meaningful interaction" is tracked app-wide (clicks, typing, navigation,
  // message submission, visibility changes) and stored persistently, so an
  // actively-used app — on any screen — keeps its current Ask chat, and the
  // reset only fires after a genuine idle gap followed by a return event. The
  // reset never fires mid-read on a timer, and never while a response loads.
  const ASK_INACTIVITY_MS = 15 * 60 * 1000; // 15 minutes
  const ASK_ACTIVITY_KEY = 'finlingo_ask_last_activity';
  let _inactivityGuard = false;
  let _lastActivityWrite = 0;

  function _markAskActivity(force) {
    const now = Date.now();
    // Throttle persistent writes (interaction events can fire rapidly); force is
    // used for deliberate actions (opening a chat) that must not be skipped.
    if (force !== true && now - _lastActivityWrite < 15000) return;
    _lastActivityWrite = now;
    try { if (global.localStorage) localStorage.setItem(ASK_ACTIVITY_KEY, String(now)); }
    catch (_) {}
  }
  function _getAskLastActivity() {
    try {
      const v = global.localStorage ? localStorage.getItem(ASK_ACTIVITY_KEY) : null;
      const n = v ? parseInt(v, 10) : 0;
      return Number.isFinite(n) ? n : 0;
    } catch (_) { return 0; }
  }
  function _askInactive() {
    const last = _getAskLastActivity();
    return Boolean(last && (Date.now() - last > ASK_INACTIVITY_MS));
  }
  // Reset trigger (return/focus/route-in). Returns true if it started a fresh
  // chat so callers (e.g. renderCoach on boot) can stop rendering the old one.
  function _checkAskInactivity() {
    if (_inactivityGuard) return false;  // avoid overlapping resets (visibility/focus/route)
    if (!_askScreenActive()) return false;
    if (busy) return false;              // never reset while a response is loading
    let didReset = false;
    if (_askInactive() && thread.length > 0) {
      _inactivityGuard = true;
      try { newChat(); didReset = true; } finally { _inactivityGuard = false; }
    }
    _markAskActivity();
    return didReset;
  }

  // Invalidate everything Ask/coach holds in memory when the app data is reset.
  // Bumping the reset epoch makes any in-flight poll abandon its late response so
  // a build that finishes after the reset cannot resurrect a deleted unit/chat.
  function handleAppDataReset() {
    _resetEpoch++;
    _stopAllUnitJobPolls();
    _stopUnitJobTicker();
    // Stop any streamed-answer reveal timer (its target thread is being wiped).
    if (answerReveal && answerReveal.timer) { try { clearInterval(answerReveal.timer); } catch (_) {} }
    answerReveal = null;
    // Drop the in-flight coach request handle. Its requestId no longer matches,
    // so a late response is ignored by the id guards in the request handlers.
    activeCoachRequest = null;
    thread = [];
    activeChatId = null;
    busy = false;
    busyLabel = '';
    busyMode = 'normal';
    lastTopic = '';
    userScrollLockedDuringGeneration = false;
  }

  function newChat() {
    if (!_hasStore()) { thread = []; composerVisible = true; renderCoach(); return; }
    _stopAllUnitJobPolls();
    const chat = global.ChatStore.reuseOrCreateEmpty();
    global.ChatStore.setActive(chat.id, { silent: true });
    _ensureActiveLoaded(true);
    composerVisible = true;
    if (typeof showCoach === 'function') showCoach(); else renderCoach();
    // Intentionally do NOT auto-focus the input: focusing immediately stops the
    // typewriter, so we leave the clean empty state with the example-prompt
    // animation running (reduced-motion shows a static example). The user
    // focusing/typing then stops it as usual.
  }

  function openChat(id) {
    if (!_hasStore()) return;
    _markAskActivity(true);   // explicitly viewing a history chat is activity — never auto-reset it
    _stopAllUnitJobPolls();
    global.ChatStore.setActive(id, { silent: true });
    _ensureActiveLoaded(true);
    if (typeof showCoach === 'function') showCoach(); else renderCoach();
    setTimeout(() => { const el = document.getElementById('coachThread'); if (el) el.scrollTop = el.scrollHeight; }, 70);
  }

  // External active-chat changes (e.g. deleting the active chat reassigns it).
  if (global.addEventListener) {
    global.addEventListener('finlingo:active-chat-changed', function () {
      _stopAllUnitJobPolls();
      _ensureActiveLoaded(true);
      if (_askScreenActive()) renderCoach();
    });
    global.addEventListener('finlingo:screen-changed', function (event) {
      if (event?.detail?.id === 'coachScreen') {
        // Returning to Ask: re-check inactivity, then immediately resume polling
        // so the card reflects the latest server state right away.
        _checkAskInactivity();
        _resumeUnitJobsForActiveChat();
      }
      // Leaving Ask: do NOT stop the active chat's unit-job pollers — let durable
      // background builds keep advancing so progress never freezes and Learn/Ask
      // are current on return. The pollers self-stop on chat switch or reset, and
      // skip DOM work while off-screen. Only the 1s ETA ticker pauses (it resumes
      // on the next render). Switching chats still stops pollers elsewhere.
    });
    // Returning focus / making the tab visible again / restoring from the
    // back-forward cache are all "return" triggers that re-check inactivity.
    global.addEventListener('focus', _checkAskInactivity);
    global.addEventListener('pageshow', _checkAskInactivity); // bfcache reopen
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') {
          _checkAskInactivity();
          // Tab became active again: make sure the active chat's build pollers are
          // running and immediately re-synced to the latest server state.
          _resumeUnitJobsForActiveChat();
        }
      });
      // Track meaningful interaction app-wide (clicks + typing) so an actively
      // used app — on any screen — keeps its current Ask chat. These only stamp
      // the activity timestamp; they never trigger a reset themselves.
      global.document.addEventListener('pointerdown', _markAskActivity, { passive: true, capture: true });
      global.document.addEventListener('keydown', _markAskActivity, { passive: true, capture: true });
    }
  }

  global.renderCoach = renderCoach;
  global.CoachPage = {
    render: renderCoach, chip: chip, act: act, suggest: suggest, quizSelect: quizSelect, quizSubmit: quizSubmit, saveUnit: saveUnit,
    retryUnit: retryUnit, chooseAnotherDepth: chooseAnotherDepth, cancelUnitJob: cancelUnitJob,
    simplifyAnswer: simplifyAnswer, submit: submit, ask: coachAsk, askPrompt: askPrompt, newChat: newChat, openChat: openChat,
    selectDepth: selectDepth, confirmDepthSelection: confirmDepthSelection, closeDepthSelector: _closeDepthSelector,
    buildCourseUnit: buildCourseUnit, isBusy: function () { return busy; },
    handleAppDataReset: handleAppDataReset
  };
})(typeof window !== 'undefined' ? window : this);
