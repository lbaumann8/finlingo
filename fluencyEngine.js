(function (global) {
  const FLUENCY_SESSION_SIZE = 5;
  const FLUENCY_SESSION_HISTORY_LIMIT = 12;
  const FLUENCY_MASTERY_SCORE = 85;
  const FLUENCY_MASTERY_SESSION_WINS = 3;
  const FLUENCY_STAGE_ORDER = ['introduced', 'practicing', 'familiar', 'strong', 'mastered'];
  const FLUENCY_STAGE_LABELS = {
    introduced: 'Introduced',
    practicing: 'Practicing',
    familiar: 'Familiar',
    strong: 'Strong',
    mastered: 'Mastered'
  };
  const FLUENCY_FORMAT_META = {
    meaning_pick: {
      label: 'Quick recognition',
      rewardWeight: 10
    },
    context_pick: {
      label: 'Use in context',
      rewardWeight: 12
    },
    fill_blank: {
      label: 'Fill the concept',
      rewardWeight: 15
    },
    category_pick: {
      label: 'Sort it fast',
      rewardWeight: 8
    }
  };
  const FLUENCY_CATEGORY_RULES = [
    {
      label: 'Market Basics',
      match: /(share|stock|equity|market cap|large-cap|bull market|bear market|correction|sentiment|constituent|benchmark|ipo|underwriter|s-1|lock-up)/i
    },
    {
      label: 'Funds & Indexing',
      match: /(etf|index|expense ratio|nav|tracking error|passive investing|active management|market-cap weighted|index rebalancing)/i
    },
    {
      label: 'Returns & Compounding',
      match: /(principal|compounding|rule of 72|nominal return|real return|fisher equation|dividend|dividend yield|capital gain|cost basis|dollar-cost averaging|lump sum|average cost basis)/i
    },
    {
      label: 'Risk & Portfolio',
      match: /(risk|volatility|standard deviation|vix|implied volatility|liquidity|bid-ask spread|market depth|illiquidity premium|asset allocation|asset class|60\/40 portfolio|glide path|diversification|correlation|rebalancing|portfolio drift|target allocation|risk tolerance|risk capacity|loss aversion|expected return|equity risk premium)/i
    },
    {
      label: 'Macro & Rates',
      match: /(bond|coupon|maturity|yield|duration|cpi|inflation|purchasing power|central bank|expansion|contraction|leading indicator|trough)/i
    }
  ];
  const FLUENCY_MARKET_TERM_NAMES = new Set([
    'volatility',
    'beta',
    'market cap',
    'rsi',
    'support resistance',
    'support',
    'resistance',
    'p e',
    'p e ratio',
    'earnings',
    'guidance',
    'liquidity',
    'drawdown',
    'diversification',
    'revenue profit',
    'revenue',
    'profit',
    'stock',
    'equity',
    'etf',
    'valuation'
  ]);
  const FLUENCY_MARKET_KEYWORDS = [
    'stock',
    'stocks',
    'equity',
    'market',
    'portfolio',
    'invest',
    'investor',
    'ticker',
    'earnings',
    'guidance',
    'valuation',
    'market cap',
    'share',
    'shares',
    'volatility',
    'beta',
    'rsi',
    'support',
    'resistance',
    'liquidity',
    'drawdown',
    'diversification',
    'revenue',
    'profit',
    'p e',
    'etf',
    'index'
  ];

  let _fluencyTermBankCache = null;

  function _safeToday() {
    if (typeof today === 'function') return today();
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${mm}-${dd}`;
  }

  function _nowIso() {
    return new Date().toISOString();
  }

  function _clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _stripHtml(value) {
    return String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&amp;/g, 'and')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function _slugify(value) {
    return _normalizeText(value).replace(/\s+/g, '-');
  }

  function _shuffle(list) {
    const copy = Array.isArray(list) ? [...list] : [];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function _uniquePush(list, value) {
    if (!value) return;
    if (!list.includes(value)) list.push(value);
  }

  function _escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function _ensureRewardsSummary() {
    if (!S.rewardsSummary || typeof S.rewardsSummary !== 'object') {
      S.rewardsSummary = typeof getDefaultRewardsSummary === 'function'
        ? getDefaultRewardsSummary()
        : {};
    }
    return S.rewardsSummary;
  }

  function _ensureFluencyState() {
    const summary = _ensureRewardsSummary();
    if (!summary.fluency || typeof summary.fluency !== 'object') {
      summary.fluency = typeof getDefaultFluencyState === 'function'
        ? getDefaultFluencyState()
        : {
            unlockedLessonIds: [],
            terms: {},
            activeSession: null,
            sessionHistory: [],
            lastSurfacedLessonId: null
          };
    }
    if (!summary.fluency.terms || typeof summary.fluency.terms !== 'object') {
      summary.fluency.terms = {};
    }
    if (!Array.isArray(summary.fluency.unlockedLessonIds)) {
      summary.fluency.unlockedLessonIds = [];
    }
    if (!Array.isArray(summary.fluency.sessionHistory)) {
      summary.fluency.sessionHistory = [];
    }
    return summary.fluency;
  }

  function isFinanceFluencyMarketTerm(term) {
    if (!term) return false;
    const normalizedName = _normalizeText(term.displayName || '');
    if (FLUENCY_MARKET_TERM_NAMES.has(normalizedName)) return true;

    const haystack = _normalizeText([
      term.displayName,
      term.definition,
      term.example,
      term.unitTitle,
      term.lessonTitle,
      term.category
    ].filter(Boolean).join(' '));

    return FLUENCY_MARKET_KEYWORDS.some(keyword => haystack.includes(_normalizeText(keyword)));
  }

  function _getFluencyScopeFilter(scope = 'all') {
    if (scope === 'market') return isFinanceFluencyMarketTerm;
    return null;
  }

  function _getLessonById(lessonId) {
    return Array.isArray(LESSONS)
      ? LESSONS.find(item => Number(item?.id) === Number(lessonId))
      : null;
  }

  function _deriveFluencyCategory({ name, definition, lesson, unit }) {
    const haystack = `${name} ${definition} ${lesson?.title || ''} ${unit?.title || unit?.name || ''}`;
    const matched = FLUENCY_CATEGORY_RULES.find(rule => rule.match.test(haystack));
    if (matched) return matched.label;
    return unit?.title || unit?.name || 'Finance Fundamentals';
  }

  function _extractLessonContextSentences(doc) {
    return [...doc.querySelectorAll('p')]
      .map(node => _stripHtml(node.textContent || ''))
      .filter(Boolean);
  }

  function _pickExampleForTerm(termName, paragraphs = []) {
    const normalizedTerm = _normalizeText(termName);
    const matching = paragraphs.find(paragraph => _normalizeText(paragraph).includes(normalizedTerm));
    return matching || paragraphs[1] || paragraphs[0] || '';
  }

  function _buildHint(term) {
    if (term.example) {
      return `${term.displayName} shows up in ${term.lessonTitle}.`;
    }
    return `${term.displayName} belongs to ${term.category}.`;
  }

  function getFinanceFluencyTermBank() {
    if (_fluencyTermBankCache) return _fluencyTermBankCache;
    if (typeof DOMParser === 'undefined' || typeof COURSES === 'undefined') {
      _fluencyTermBankCache = [];
      return _fluencyTermBankCache;
    }

    const parser = new DOMParser();
    const aggregate = {};

    Object.entries(COURSES).forEach(([lessonIdRaw, course]) => {
      const lessonId = Number(lessonIdRaw);
      if (!lessonId || !course?.body || !String(course.body).includes('term-row')) return;

      const lesson = _getLessonById(lessonId);
      const unit = typeof getUnitForLesson === 'function' ? getUnitForLesson(lesson || lessonId) : null;
      const doc = parser.parseFromString(course.body, 'text/html');
      const paragraphs = _extractLessonContextSentences(doc);

      [...doc.querySelectorAll('.term-row')].forEach((row, index) => {
        const name = _stripHtml(row.querySelector('.term-key')?.textContent || '');
        const definition = _stripHtml(row.querySelector('.term-val')?.textContent || '');
        if (!name || !definition) return;

        const termId = _slugify(name);
        const existing = aggregate[termId] || {
          id: termId,
          displayName: name,
          normalizedName: _normalizeText(name),
          lessonIds: [],
          lessonTitle: lesson?.title || course.title || 'Finance Foundations',
          lessonTitles: [],
          unitIds: [],
          unitTitles: [],
          definition,
          altDefinitions: [],
          example: '',
          hint: '',
          category: '',
          position: lessonId * 10 + index
        };

        _uniquePush(existing.lessonIds, lessonId);
        _uniquePush(existing.lessonTitles, lesson?.title || course.title || 'Finance Foundations');
        _uniquePush(existing.unitIds, unit?.id || null);
        _uniquePush(existing.unitTitles, unit?.title || unit?.name || lesson?.unit || 'Finance Foundations');
        _uniquePush(existing.altDefinitions, definition);

        if (!existing.example) {
          existing.example = _pickExampleForTerm(name, paragraphs);
        }

        if (!existing.definition || definition.length < existing.definition.length) {
          existing.definition = definition;
        }

        existing.category = _deriveFluencyCategory({
          name,
          definition: existing.definition,
          lesson,
          unit
        });
        existing.lessonTitle = existing.lessonTitles[0] || existing.lessonTitle;
        existing.unitTitle = existing.unitTitles[0] || 'Finance Foundations';
        existing.hint = _buildHint(existing);
        aggregate[termId] = existing;
      });
    });

    _fluencyTermBankCache = Object.values(aggregate)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map(term => ({
        ...term,
        altDefinitions: term.altDefinitions.slice(0, 3)
      }));
    return _fluencyTermBankCache;
  }

  function _getTermLookup() {
    return getFinanceFluencyTermBank().reduce((acc, term) => {
      acc[term.id] = term;
      return acc;
    }, {});
  }

  function _createTermProgress(term) {
    return {
      termId: term.id,
      score: 10,
      exposures: 0,
      correct: 0,
      wrong: 0,
      lastSeenAt: null,
      lastCorrectAt: null,
      lastWrongAt: null,
      lastSessionId: null,
      sessionWins: 0,
      formatWins: {},
      dueAt: null,
      introducedAt: _nowIso(),
      masteredAt: null
    };
  }

  function _getTermProgress(termId) {
    const fluency = _ensureFluencyState();
    return fluency.terms[termId] || null;
  }

  function _isTermMastered(entry) {
    if (!entry) return false;
    const formatWins = entry.formatWins && typeof entry.formatWins === 'object'
      ? Object.keys(entry.formatWins).filter(key => Number(entry.formatWins[key]) > 0).length
      : 0;
    return (Number(entry.score) || 0) >= FLUENCY_MASTERY_SCORE
      && (Number(entry.sessionWins) || 0) >= FLUENCY_MASTERY_SESSION_WINS
      && formatWins >= 2;
  }

  function getFinanceFluencyStage(entry) {
    if (!entry) return 'introduced';
    if (_isTermMastered(entry)) return 'mastered';
    const score = Math.max(0, Number(entry.score) || 0);
    if (score >= 65) return 'strong';
    if (score >= 45) return 'familiar';
    if (score >= 20) return 'practicing';
    return 'introduced';
  }

  function getFinanceFluencyStageLabel(entry) {
    return FLUENCY_STAGE_LABELS[getFinanceFluencyStage(entry)] || 'Introduced';
  }

  function _getDueTimestamp(entry) {
    const due = entry?.dueAt ? new Date(entry.dueAt).getTime() : 0;
    return Number.isFinite(due) ? due : 0;
  }

  function _daysSince(isoString) {
    if (!isoString) return Number.POSITIVE_INFINITY;
    const then = new Date(isoString).getTime();
    if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
    return Math.max(0, (Date.now() - then) / (24 * 60 * 60 * 1000));
  }

  function _isTermDue(entry) {
    if (!entry) return false;
    if (!entry.exposures) return true;
    const dueAt = _getDueTimestamp(entry);
    if (!dueAt) return (Number(entry.score) || 0) < 70;
    return dueAt <= Date.now();
  }

  function _calculateNextDueAt(entry, correct) {
    const now = Date.now();
    if (!correct) return new Date(now + 12 * 60 * 60 * 1000).toISOString();
    const score = Math.max(0, Number(entry.score) || 0);
    const intervalDays = score < 35
      ? 1
      : score < 60
        ? 3
        : _isTermMastered(entry)
          ? 10
          : 6;
    return new Date(now + intervalDays * 24 * 60 * 60 * 1000).toISOString();
  }

  function syncFinanceFluencyLessons() {
    const fluency = _ensureFluencyState();
    const completedIds = new Set(
      Array.isArray(S.completedIds)
        ? S.completedIds.map(id => Number(id)).filter(Number.isFinite)
        : []
    );
    if (!completedIds.size) return { introducedCount: 0, termIds: [] };

    const introduced = [];
    const unlockedLessonIds = new Set(
      fluency.unlockedLessonIds.map(id => Number(id)).filter(Number.isFinite)
    );

    getFinanceFluencyTermBank().forEach(term => {
      const unlocked = term.lessonIds.some(lessonId => completedIds.has(Number(lessonId)));
      if (!unlocked) return;

      term.lessonIds.forEach(lessonId => unlockedLessonIds.add(Number(lessonId)));

      if (!fluency.terms[term.id]) {
        fluency.terms[term.id] = _createTermProgress(term);
        introduced.push(term.id);
      }
    });

    fluency.unlockedLessonIds = [...unlockedLessonIds].sort((a, b) => a - b);
    if (introduced.length && typeof save === 'function') save();
    return { introducedCount: introduced.length, termIds: introduced };
  }

  function unlockLessonFluencyTerms(lessonId, { surfacedBy = 'lesson_complete' } = {}) {
    const fluency = _ensureFluencyState();
    const numericLessonId = Number(lessonId);
    if (!numericLessonId) return { introducedCount: 0, termIds: [], surfacedBy };

    const relevantTerms = getFinanceFluencyTermBank().filter(term => term.lessonIds.includes(numericLessonId));
    const introduced = [];
    const unlockedLessonIds = new Set(
      fluency.unlockedLessonIds.map(id => Number(id)).filter(Number.isFinite)
    );
    unlockedLessonIds.add(numericLessonId);

    relevantTerms.forEach(term => {
      if (!fluency.terms[term.id]) {
        fluency.terms[term.id] = _createTermProgress(term);
        introduced.push(term.id);
      }
    });

    fluency.unlockedLessonIds = [...unlockedLessonIds].sort((a, b) => a - b);
    fluency.lastSurfacedLessonId = introduced.length ? numericLessonId : fluency.lastSurfacedLessonId;
    if (introduced.length && typeof save === 'function') save();
    return { introducedCount: introduced.length, termIds: introduced, surfacedBy };
  }

  function _getUnlockedFluencyTerms(filterFn = null) {
    syncFinanceFluencyLessons();
    const fluency = _ensureFluencyState();
    const termLookup = _getTermLookup();
    return Object.values(fluency.terms)
      .map(entry => ({
        entry,
        term: termLookup[entry.termId]
      }))
      .filter(item => item.term)
      .filter(item => typeof filterFn === 'function' ? filterFn(item.term) : true);
  }

  function _termPriority(entry) {
    const due = _isTermDue(entry);
    const score = Math.max(0, Number(entry.score) || 0);
    const exposures = Math.max(0, Number(entry.exposures) || 0);
    const recentlyMissed = entry.lastWrongAt && (!entry.lastCorrectAt || new Date(entry.lastWrongAt).getTime() >= new Date(entry.lastCorrectAt).getTime());
    const daysSinceSeen = _daysSince(entry.lastSeenAt);

    if (recentlyMissed && due) return 0;
    if (exposures === 0) return 1;
    if (due && score < 45) return 2;
    if (score < 35) return 3;
    if (due) return 4;
    if (!_isTermMastered(entry) && daysSinceSeen >= 5) return 5;
    if (getFinanceFluencyStage(entry) === 'strong') return 6;
    return 9;
  }

  function buildFinanceFluencyQueue(limit = FLUENCY_SESSION_SIZE, { scope = 'all' } = {}) {
    const normalizedLimit = Math.max(0, Number(limit) || 0);
    if (!normalizedLimit) return [];
    const filterFn = _getFluencyScopeFilter(scope);

    return _getUnlockedFluencyTerms(filterFn)
      .filter(item => !_isTermMastered(item.entry) || _isTermDue(item.entry))
      .sort((a, b) => {
        const priorityDelta = _termPriority(a.entry) - _termPriority(b.entry);
        if (priorityDelta !== 0) return priorityDelta;
        const scoreDelta = (Number(a.entry.score) || 0) - (Number(b.entry.score) || 0);
        if (scoreDelta !== 0) return scoreDelta;
        return _daysSince(b.entry.lastSeenAt) - _daysSince(a.entry.lastSeenAt);
      })
      .slice(0, normalizedLimit);
  }

  function getFinanceFluencySummary({ scope = 'all' } = {}) {
    const fluency = _ensureFluencyState();
    const filterFn = _getFluencyScopeFilter(scope);
    const unlocked = _getUnlockedFluencyTerms(filterFn);
    const masteredCount = unlocked.filter(item => _isTermMastered(item.entry)).length;
    const dueCount = unlocked.filter(item => _isTermDue(item.entry) && !_isTermMastered(item.entry)).length;
    const weakCount = unlocked.filter(item => (Number(item.entry.score) || 0) < 45).length;
    const averageScore = unlocked.length
      ? Math.round(unlocked.reduce((sum, item) => sum + Math.max(0, Number(item.entry.score) || 0), 0) / unlocked.length)
      : 0;
    const sessionHistory = Array.isArray(fluency.sessionHistory) ? fluency.sessionHistory : [];
    const scopedHistory = scope === 'all'
      ? sessionHistory
      : sessionHistory.filter(item => (item?.scope || 'all') === scope);
    const todayKey = _safeToday();
    const todaySessions = scopedHistory.filter(item => item?.startedOn === todayKey);
    const strengthenedToday = todaySessions.reduce((sum, item) => sum + (Number(item?.strengthenedCount) || 0), 0);
    const newTermsReady = unlocked.filter(item => !item.entry.exposures).length;
    const surfacedTerms = fluency.lastSurfacedLessonId
      ? unlocked.filter(item => item.term.lessonIds.includes(Number(fluency.lastSurfacedLessonId)) && !item.entry.exposures)
      : [];

    return {
      scope,
      totalTerms: unlocked.length,
      masteredCount,
      dueCount,
      weakCount,
      averageScore,
      strengthenedToday,
      newTermsReady,
      actionCount: Math.min(FLUENCY_SESSION_SIZE, Math.max(dueCount, newTermsReady)),
      surfacedLessonId: fluency.lastSurfacedLessonId,
      surfacedTermCount: surfacedTerms.length,
      surfacedTerms: surfacedTerms.slice(0, 3),
      previewTerms: buildFinanceFluencyQueue(3, { scope })
    };
  }

  function _getCandidateTermsFor(term, count = 3) {
    const unlocked = _getUnlockedFluencyTerms().map(item => item.term);
    const sameCategory = unlocked.filter(item => item.id !== term.id && item.category === term.category);
    const sameUnit = unlocked.filter(item => item.id !== term.id && item.unitTitle === term.unitTitle);
    const others = unlocked.filter(item => item.id !== term.id);
    const ordered = [...sameCategory, ...sameUnit, ...others];
    const seen = new Set();
    const selected = [];
    ordered.forEach(item => {
      if (selected.length >= count) return;
      if (seen.has(item.id)) return;
      seen.add(item.id);
      selected.push(item);
    });
    return selected;
  }

  function _buildMeaningPickQuestion(term) {
    const distractors = _getCandidateTermsFor(term, 3)
      .map(item => item.definition)
      .filter(Boolean)
      .filter(definition => definition !== term.definition)
      .slice(0, 3);
    const options = _shuffle([term.definition, ...distractors]).slice(0, 4);
    return {
      formatKey: 'meaning_pick',
      prompt: `What best matches “${term.displayName}”?`,
      options,
      answerIndex: options.indexOf(term.definition),
      explanation: `${term.displayName} means ${term.definition}.`
    };
  }

  function _buildContextPrompt(term) {
    const maskedExample = term.example
      ? term.example.replace(new RegExp(_escapeRegExp(term.displayName), 'ig'), '____')
      : '';
    const scenario = maskedExample
      ? maskedExample
      : `${term.displayName} comes up when ${term.definition.charAt(0).toLowerCase()}${term.definition.slice(1)}.`;
    return `Which term best fits this finance moment?\n${scenario}`;
  }

  function _buildContextPickQuestion(term) {
    const distractors = _getCandidateTermsFor(term, 3).map(item => item.displayName);
    const options = _shuffle([term.displayName, ...distractors]).slice(0, 4);
    return {
      formatKey: 'context_pick',
      prompt: _buildContextPrompt(term),
      options,
      answerIndex: options.indexOf(term.displayName),
      explanation: `${term.displayName} is the right fit here because it means ${term.definition}.`
    };
  }

  function _buildCategoryPickQuestion(term) {
    const categories = [...new Set(getFinanceFluencyTermBank().map(item => item.category).filter(Boolean))];
    const distractors = categories.filter(label => label !== term.category).slice(0, 3);
    const options = _shuffle([term.category, ...distractors]).slice(0, 4);
    return {
      formatKey: 'category_pick',
      prompt: `Sort “${term.displayName}” into the right finance bucket.`,
      options,
      answerIndex: options.indexOf(term.category),
      explanation: `${term.displayName} belongs in ${term.category}. ${term.definition}.`
    };
  }

  function _canUseFillBlank(term) {
    return term.displayName.length <= 24
      && !/[0-9/]/.test(term.displayName)
      && term.displayName.split(/\s+/).length <= 4;
  }

  function _buildFillBlankQuestion(term) {
    return {
      formatKey: 'fill_blank',
      prompt: `Fill the finance term: ____ means ${term.definition.charAt(0).toLowerCase()}${term.definition.slice(1)}.`,
      answerText: term.displayName,
      placeholder: 'Type the term',
      explanation: `${term.displayName} is the term for ${term.definition.charAt(0).toLowerCase()}${term.definition.slice(1)}.`
    };
  }

  function _buildQuestionForTerm(term, entry) {
    const formatPool = ['meaning_pick', 'context_pick', 'category_pick'];
    if (_canUseFillBlank(term) && (Number(entry.correct) || 0) >= 1) {
      formatPool.splice(2, 0, 'fill_blank');
    }
    const formatKey = formatPool[Math.max(0, Number(entry.exposures) || 0) % formatPool.length];

    const base = formatKey === 'context_pick'
      ? _buildContextPickQuestion(term)
      : formatKey === 'category_pick'
        ? _buildCategoryPickQuestion(term)
        : formatKey === 'fill_blank'
          ? _buildFillBlankQuestion(term)
          : _buildMeaningPickQuestion(term);

    return {
      id: `${term.id}:${formatKey}:${Date.now()}:${Math.floor(Math.random() * 10000)}`,
      termId: term.id,
      termName: term.displayName,
      termCategory: term.category,
      stageLabel: getFinanceFluencyStageLabel(entry),
      ...base,
      answered: false,
      correct: false,
      selectedIndex: null,
      typedValue: '',
      transition: null
    };
  }

  function _createFluencySession(limit = FLUENCY_SESSION_SIZE, { scope = 'all' } = {}) {
    const queue = buildFinanceFluencyQueue(limit, { scope });
    if (!queue.length) return null;

    const questions = queue.map(item => _buildQuestionForTerm(item.term, item.entry));
    return {
      id: `fluency-${Date.now()}`,
      startedAt: _nowIso(),
      startedOn: _safeToday(),
      scope,
      currentIndex: 0,
      questions,
      correctCount: 0,
      strengthenedTermIds: [],
      masteredTermIds: [],
      reward: null,
      completedAt: null
    };
  }

  function _getActiveSession() {
    return _ensureFluencyState().activeSession;
  }

  function _setActiveSession(session) {
    const fluency = _ensureFluencyState();
    fluency.activeSession = session;
  }

  function _renderSessionProgress(session) {
    const total = session.questions.length || 1;
    const current = Math.min(total, Number(session.currentIndex || 0) + 1);
    const pct = Math.round(((current - 1) / total) * 100);
    return `
      <div class="fluency-progress-shell">
        <div class="fluency-progress-meta">
          <span>Market Drills</span>
          <strong>${current} of ${total}</strong>
        </div>
        <div class="fluency-progress-track">
          <div class="fluency-progress-fill" style="width:${pct}%;"></div>
        </div>
      </div>`;
  }

  function _renderQuestionOptions(question) {
    if (question.formatKey === 'fill_blank') {
      return `
        <div class="fluency-input-shell">
          <input class="fluency-input" id="fluencyInput"
            type="text"
            placeholder="${_escapeHtml(question.placeholder || 'Type the term')}"
            value="${_escapeHtml(question.typedValue || '')}"
            ${question.answered ? 'disabled' : ''}/>
          <button class="btn btn-primary fluency-check-btn" id="fluencyCheckBtn" ${question.answered ? 'disabled' : ''}>
            Check
          </button>
        </div>`;
    }

    return `
      <div class="fluency-choice-list">
        ${question.options.map((option, index) => {
          const isCorrect = question.answered && index === question.answerIndex;
          const isSelectedWrong = question.answered && index === question.selectedIndex && !question.correct;
          const stateClass = isCorrect
            ? 'is-correct'
            : isSelectedWrong
              ? 'is-wrong'
              : '';
          return `
            <button class="fluency-choice ${stateClass}" data-fluency-choice="${index}" ${question.answered ? 'disabled' : ''}>
              <span class="fluency-choice-badge">${String.fromCharCode(65 + index)}</span>
              <span class="fluency-choice-copy">${_escapeHtml(option)}</span>
            </button>`;
        }).join('')}
      </div>`;
  }

  function _renderQuestionFooter(question) {
    if (!question.answered) return '';
    const toneClass = question.correct ? 'fluency-feedback-correct' : 'fluency-feedback-wrong';
    const label = question.correct ? 'Strong hit' : 'Not quite';
    return `
      <div class="fluency-feedback ${toneClass}">
        <div class="fluency-feedback-label">${label}</div>
        <div class="fluency-feedback-copy">${_escapeHtml(question.explanation || '')}</div>
      </div>
      <button class="btn btn-primary fluency-next-btn" id="fluencyNextBtn">
        ${question.transition === 'finish' ? 'See Summary' : 'Next Term'}
      </button>`;
  }

  function _renderActiveQuestion(session) {
    const question = session.questions[session.currentIndex];
    const entry = _getTermProgress(question.termId);
    const masteryPct = Math.max(0, Math.min(100, Number(entry?.score) || 0));

    return `
      ${_renderSessionProgress(session)}
      <div class="fluency-session-shell">
        <div class="fluency-kicker-row">
          <span class="fluency-kicker">${FLUENCY_FORMAT_META[question.formatKey]?.label || 'Market Drills'}</span>
          <span class="fluency-stage-pill">${_escapeHtml(question.stageLabel)}</span>
        </div>
        <div class="fluency-term-title">${_escapeHtml(question.termName)}</div>
        <div class="fluency-term-sub">${_escapeHtml(question.termCategory)}</div>
        <div class="fluency-mastery-track">
          <div class="fluency-mastery-fill" style="width:${masteryPct}%;"></div>
        </div>
        <div class="fluency-prompt">${_escapeHtml(question.prompt)}</div>
        ${_renderQuestionOptions(question)}
        ${_renderQuestionFooter(question)}
      </div>`;
  }

  function _renderSessionSummary(session) {
    const termLookup = _getTermLookup();
    const strengthened = [...new Set(session.strengthenedTermIds)]
      .map(termId => termLookup[termId]?.displayName)
      .filter(Boolean);
    const mastered = [...new Set(session.masteredTermIds)]
      .map(termId => termLookup[termId]?.displayName)
      .filter(Boolean);
    const summary = getFinanceFluencySummary({ scope: session.scope || 'all' });
    const masteredCopy = mastered.map(label => _escapeHtml(label)).join(' · ');

    return `
      <div class="fluency-session-shell fluency-summary-shell">
        <div class="fluency-summary-kicker">Market Drills</div>
        <div class="fluency-summary-title">Session Complete</div>
        <div class="fluency-summary-sub">
          You strengthened ${strengthened.length || 0} ${strengthened.length === 1 ? 'term' : 'terms'} and sharpened your market language.
        </div>
        <div class="fluency-summary-grid">
          <div class="fluency-summary-stat">
            <span class="fluency-summary-value">${session.correctCount}</span>
            <span class="fluency-summary-label">Correct</span>
          </div>
          <div class="fluency-summary-stat">
            <span class="fluency-summary-value">${mastered.length}</span>
            <span class="fluency-summary-label">Mastered</span>
          </div>
          <div class="fluency-summary-stat">
            <span class="fluency-summary-value">+${session.reward?.xpAwarded || 0}</span>
            <span class="fluency-summary-label">XP</span>
          </div>
          <div class="fluency-summary-stat">
            <span class="fluency-summary-value">+$${session.reward?.cashAwarded || 0}</span>
            <span class="fluency-summary-label">Cash</span>
          </div>
        </div>
        ${strengthened.length ? `
          <div class="fluency-summary-chip-row">
            ${strengthened.slice(0, 6).map(label => `<span class="fluency-chip">${_escapeHtml(label)}</span>`).join('')}
          </div>` : ''}
        ${mastered.length ? `
          <div class="fluency-summary-highlight">
            Mastered this session: ${masteredCopy}
          </div>` : ''}
        <div class="fluency-summary-footer">
          ${summary.dueCount > 0
            ? `${summary.dueCount} terms still need review.`
            : `${summary.masteredCount}/${summary.totalTerms} terms are now mastered.`}
        </div>
        <div class="fluency-summary-actions">
          <button class="btn btn-primary" id="fluencyAgainBtn">${summary.dueCount > 0 ? `Keep Drilling ${FinLingoIcons.right()}` : 'Run It Again'}</button>
          <button class="btn btn-secondary" id="fluencyCloseBtn">Close</button>
        </div>
      </div>`;
  }

  function _renderEmptyState() {
    const completedCount = Array.isArray(S.completedIds) ? S.completedIds.length : 0;
    if (!completedCount) {
      return `
        <div class="fluency-session-shell fluency-summary-shell">
          <div class="fluency-summary-kicker">Market Drills</div>
          <div class="fluency-summary-title">Unlock your first terms</div>
          <div class="fluency-summary-sub">
            Complete a lesson and its key market terms will drop into your drill queue automatically.
          </div>
          <div class="fluency-summary-actions">
            <button class="btn btn-primary" id="fluencyCloseBtn">Back to Home</button>
          </div>
        </div>`;
    }

    return `
      <div class="fluency-session-shell fluency-summary-shell">
        <div class="fluency-summary-kicker">Market Drills</div>
        <div class="fluency-summary-title">You’re caught up</div>
        <div class="fluency-summary-sub">
          No drill reps are due right now. Finish another lesson or come back later to keep sharpening your market instincts.
        </div>
        <div class="fluency-summary-actions">
          <button class="btn btn-primary" id="fluencyCloseBtn">Close</button>
        </div>
      </div>`;
  }

  function _renderFinanceFluencyModal() {
    const session = _getActiveSession();
    const body = !session
      ? _renderEmptyState()
      : session.completedAt
        ? _renderSessionSummary(session)
        : _renderActiveQuestion(session);

    showAppModal({
      icon: 'neutral',
      title: 'Market Drills',
      body,
      bodyIsHTML: true,
      actions: [],
      showClose: true,
      boxClass: 'fluency-modal'
    });

    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;

    modalBody.querySelectorAll('[data-fluency-choice]').forEach(button => {
      button.addEventListener('click', () => {
        submitFinanceFluencyChoice(Number(button.dataset.fluencyChoice));
      });
    });

    const input = modalBody.querySelector('#fluencyInput');
    const checkBtn = modalBody.querySelector('#fluencyCheckBtn');
    if (input && checkBtn) {
      checkBtn.addEventListener('click', submitFinanceFluencyInput);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitFinanceFluencyInput();
        }
      });
    }

    modalBody.querySelector('#fluencyNextBtn')?.addEventListener('click', advanceFinanceFluencyQuestion);
    modalBody.querySelector('#fluencyAgainBtn')?.addEventListener('click', () => openFinanceFluencySession({ forceNew: true, scope: session?.scope || 'all' }));
    modalBody.querySelector('#fluencyCloseBtn')?.addEventListener('click', closeAppModal);
  }

  function _updateTermProgress(termId, formatKey, correct, sessionId) {
    const fluency = _ensureFluencyState();
    const termLookup = _getTermLookup();
    const term = termLookup[termId];
    if (!term) return null;

    const entry = fluency.terms[termId] || _createTermProgress(term);
    const beforeMastered = _isTermMastered(entry);
    const weight = FLUENCY_FORMAT_META[formatKey]?.rewardWeight || 10;

    entry.exposures = Math.max(0, Number(entry.exposures) || 0) + 1;
    entry.lastSeenAt = _nowIso();

    if (correct) {
      entry.correct = Math.max(0, Number(entry.correct) || 0) + 1;
      entry.lastCorrectAt = entry.lastSeenAt;
      entry.score = _clamp((Number(entry.score) || 0) + weight, 0, 100);
      entry.formatWins = entry.formatWins && typeof entry.formatWins === 'object' ? entry.formatWins : {};
      entry.formatWins[formatKey] = Math.max(0, Number(entry.formatWins[formatKey]) || 0) + 1;
      if (entry.lastSessionId !== sessionId) {
        entry.lastSessionId = sessionId;
        entry.sessionWins = Math.max(0, Number(entry.sessionWins) || 0) + 1;
      }
    } else {
      entry.wrong = Math.max(0, Number(entry.wrong) || 0) + 1;
      entry.lastWrongAt = entry.lastSeenAt;
      entry.score = _clamp((Number(entry.score) || 0) - Math.round(weight * 0.9), 0, 100);
    }

    entry.dueAt = _calculateNextDueAt(entry, correct);
    if (!beforeMastered && _isTermMastered(entry)) {
      entry.masteredAt = entry.lastSeenAt;
    }

    fluency.terms[termId] = entry;
    return {
      entry,
      masteredNow: !beforeMastered && _isTermMastered(entry)
    };
  }

  function _finalizeFinanceFluencySession() {
    const fluency = _ensureFluencyState();
    const session = fluency.activeSession;
    if (!session || session.completedAt) return session;

    const strengthenedCount = [...new Set(session.strengthenedTermIds)].length;
    const masteredCount = [...new Set(session.masteredTermIds)].length;
    const reward = awardRewards({
      baseXp: strengthenedCount * 6 + masteredCount * 10,
      baseCash: strengthenedCount * 4 + masteredCount * 8,
      source: 'fluency_session_complete',
      meta: {
        rewardId: `fluency-session:${session.id}`,
        skipQuestUpdate: true
      }
    });

    session.reward = reward;
    session.completedAt = _nowIso();

    fluency.sessionHistory.unshift({
      id: session.id,
      scope: session.scope || 'all',
      startedAt: session.startedAt,
      startedOn: session.startedOn,
      completedAt: session.completedAt,
      correctCount: session.correctCount,
      strengthenedCount,
      masteredCount,
      reward
    });
    if (fluency.sessionHistory.length > FLUENCY_SESSION_HISTORY_LIMIT) {
      fluency.sessionHistory = fluency.sessionHistory.slice(0, FLUENCY_SESSION_HISTORY_LIMIT);
    }

    if (reward?.xpAwarded) showXpPop(reward.xpAwarded);
    if (typeof showCashPop === 'function' && reward?.cashAwarded) showCashPop(reward.cashAwarded);
    save();
    if (typeof updateTopbar === 'function') updateTopbar();
    if (typeof updateHome === 'function') updateHome();
    if (typeof renderProfileScreen === 'function') renderProfileScreen();
    return session;
  }

  function _completeFinanceFluencyAnswer({ isCorrect, selectedIndex = null, typedValue = '' } = {}) {
    const session = _getActiveSession();
    if (!session || session.completedAt) return;

    const question = session.questions[session.currentIndex];
    if (!question || question.answered) return;

    question.answered = true;
    question.correct = Boolean(isCorrect);
    question.selectedIndex = Number.isFinite(selectedIndex) ? selectedIndex : null;
    question.typedValue = typedValue || question.typedValue || '';
    question.transition = session.currentIndex >= session.questions.length - 1 ? 'finish' : 'next';

    const result = _updateTermProgress(question.termId, question.formatKey, question.correct, session.id);
    if (question.correct) {
      session.correctCount += 1;
      _uniquePush(session.strengthenedTermIds, question.termId);
    }
    if (result?.masteredNow) {
      _uniquePush(session.masteredTermIds, question.termId);
    }

    save();
    _renderFinanceFluencyModal();
  }

  function submitFinanceFluencyChoice(choiceIndex) {
    const session = _getActiveSession();
    if (!session || session.completedAt) return;
    const question = session.questions[session.currentIndex];
    if (!question || question.answered) return;
    _completeFinanceFluencyAnswer({
      isCorrect: Number(choiceIndex) === Number(question.answerIndex),
      selectedIndex: Number(choiceIndex)
    });
  }

  function submitFinanceFluencyInput() {
    const session = _getActiveSession();
    if (!session || session.completedAt) return;
    const question = session.questions[session.currentIndex];
    const input = document.getElementById('fluencyInput');
    if (!question || question.answered || !input) return;

    const typedValue = String(input.value || '').trim();
    if (!typedValue) {
      if (typeof showToast === 'function') showToast('Type the finance term first', '');
      return;
    }

    const isCorrect = _normalizeText(typedValue) === _normalizeText(question.answerText || '');
    _completeFinanceFluencyAnswer({
      isCorrect,
      typedValue
    });
  }

  function advanceFinanceFluencyQuestion() {
    const session = _getActiveSession();
    if (!session) return;

    const question = session.questions[session.currentIndex];
    if (!question?.answered) return;

    if (session.currentIndex >= session.questions.length - 1) {
      _finalizeFinanceFluencySession();
      _renderFinanceFluencyModal();
      return;
    }

    session.currentIndex += 1;
    save();
    _renderFinanceFluencyModal();
  }

  function openFinanceFluencySession({ forceNew = false, scope = 'all' } = {}) {
    syncFinanceFluencyLessons();
    const fluency = _ensureFluencyState();
    const activeScope = fluency.activeSession?.scope || 'all';
    if (forceNew || !fluency.activeSession || fluency.activeSession.completedAt || activeScope !== scope) {
      fluency.activeSession = _createFluencySession(FLUENCY_SESSION_SIZE, { scope });
      save();
    }
    _renderFinanceFluencyModal();
  }

  function closeFinanceFluencySession() {
    closeAppModal();
  }

  function _renderFluencyProgressBar(summary) {
    const pct = summary.totalTerms
      ? Math.round((summary.masteredCount / summary.totalTerms) * 100)
      : 0;
    return `
      <div class="fluency-card-track">
        <div class="fluency-card-fill" style="width:${pct}%;"></div>
      </div>`;
  }

  function renderFinanceFluencyProfileCard() {
    const el = document.getElementById('fluencySummaryCard');
    if (!el) return;

    const summary = getFinanceFluencySummary();
    if (!summary.totalTerms) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = `
      <div class="fluency-profile-card">
        <div class="fluency-profile-top">
          <div>
            <div class="fluency-profile-kicker">Market Drills</div>
            <div class="fluency-profile-title">${summary.masteredCount}/${summary.totalTerms} terms mastered</div>
          </div>
          <button class="profile-row-action" onclick="openMarketFeatureEntry('market-mastery')">Drill</button>
        </div>
        ${_renderFluencyProgressBar(summary)}
        <div class="fluency-profile-grid">
          <div class="fluency-profile-stat">
            <span class="fluency-profile-value">${summary.dueCount}</span>
            <span class="fluency-profile-label">Needs review</span>
          </div>
          <div class="fluency-profile-stat">
            <span class="fluency-profile-value">${summary.strengthenedToday}</span>
            <span class="fluency-profile-label">Strengthened today</span>
          </div>
          <div class="fluency-profile-stat">
            <span class="fluency-profile-value">${summary.averageScore}%</span>
            <span class="fluency-profile-label">Average mastery</span>
          </div>
        </div>
      </div>`;
  }

  function renderFinanceFluencyHomeCard() {
    return '';
  }

  global.getFinanceFluencyTermBank = getFinanceFluencyTermBank;
  global.getFinanceFluencySummary = getFinanceFluencySummary;
  global.getFinanceFluencyStage = getFinanceFluencyStage;
  global.getFinanceFluencyStageLabel = getFinanceFluencyStageLabel;
  global.buildFinanceFluencyQueue = buildFinanceFluencyQueue;
  global.isFinanceFluencyMarketTerm = isFinanceFluencyMarketTerm;
  global.syncFinanceFluencyLessons = syncFinanceFluencyLessons;
  global.unlockLessonFluencyTerms = unlockLessonFluencyTerms;
  global.openFinanceFluencySession = openFinanceFluencySession;
  global.closeFinanceFluencySession = closeFinanceFluencySession;
  global.submitFinanceFluencyChoice = submitFinanceFluencyChoice;
  global.submitFinanceFluencyInput = submitFinanceFluencyInput;
  global.advanceFinanceFluencyQuestion = advanceFinanceFluencyQuestion;
  global.renderFinanceFluencyHomeCard = renderFinanceFluencyHomeCard;
  global.renderFinanceFluencyProfileCard = renderFinanceFluencyProfileCard;
})(typeof window !== 'undefined' ? window : globalThis);
