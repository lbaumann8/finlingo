(function (global) {
  const REVIEW_IMMEDIATE_MS = 0;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DIFFICULTY_WEIGHTS = {
    easy: 1,
    medium: 1.25,
    hard: 1.5
  };

  function _normalizeDifficulty(difficulty) {
    const value = String(difficulty || '').toLowerCase();
    return DIFFICULTY_WEIGHTS[value] ? value : 'medium';
  }

  function _nowIso() {
    return new Date().toISOString();
  }

  function _clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function _ensureMasteryStore() {
    if (!S.mastery || typeof S.mastery !== 'object') {
      S.mastery = {};
    }
    return S.mastery;
  }

  function _ensureReviewQueue() {
    if (!Array.isArray(S.reviewQueue)) {
      S.reviewQueue = [];
    }
    return S.reviewQueue;
  }

  function _topicLabel(topicId) {
    return String(topicId || 'general')
      .split(/[_-]/g)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function _findQuestionById(questionId) {
    if (!questionId) return null;

    if (Array.isArray(LESSONS)) {
      for (const lesson of LESSONS) {
        const question = (lesson.questions || []).find(item => item?.questionId === questionId || item?.id === questionId);
        if (question) {
          return { lessonId: lesson.id, lessonTitle: lesson.title, question };
        }
      }
    }

    if (Array.isArray(global.DAILY_QUESTIONS)) {
      const dailyQuestion = global.DAILY_QUESTIONS.find(item => item?.questionId === questionId || item?.id === questionId);
      if (dailyQuestion) {
        return { lessonId: 'daily', lessonTitle: 'Daily Challenge', question: dailyQuestion };
      }
    }

    return null;
  }

  function _shuffle(list) {
    const copy = Array.isArray(list) ? [...list] : [];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function _getCompletedLessonEntries() {
    const completedIds = new Set(
      Array.isArray(S?.completedIds)
        ? S.completedIds.map(id => Number(id)).filter(Number.isFinite)
        : []
    );
    const lessons = Array.isArray(LESSONS)
      ? LESSONS.filter(lesson => completedIds.has(Number(lesson?.id)))
      : [];
    const pool = [];

    lessons.forEach(lesson => {
      (lesson.questions || []).forEach((question, index) => {
        pool.push({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          questionId: question?.questionId || question?.id || `lesson-${lesson.id}-q${index + 1}`,
          topicId: question?.topicId || question?.topic || lesson.title || 'general',
          question
        });
      });
    });

    return { lessons, pool };
  }

  function _pushRefresherCandidate(selected, usedQuestionIds, candidate) {
    const questionId = candidate?.questionId || candidate?.question?.questionId || candidate?.question?.id;
    if (!candidate?.question || !questionId || usedQuestionIds.has(questionId)) return;
    usedQuestionIds.add(questionId);
    selected.push(candidate);
  }

  function _buildReviewIntervalDays(item, correct) {
    const difficultyWeight = DIFFICULTY_WEIGHTS[_normalizeDifficulty(item.difficulty)];
    if (!correct) {
      if (item.wrongCount <= 1) return REVIEW_IMMEDIATE_MS;
      if (item.wrongCount === 2) return 1 * difficultyWeight;
      if (item.wrongCount === 3) return 3 * difficultyWeight;
      return 7 * difficultyWeight;
    }

    if (item.correctCount <= 1) return 2 * difficultyWeight;
    if (item.correctCount === 2) return 5 * difficultyWeight;
    return 10 * difficultyWeight;
  }

  function updateMastery({ topicId, correct, difficulty }) {
    const normalizedTopicId = String(topicId || 'general');
    const mastery = _ensureMasteryStore();
    const entry = mastery[normalizedTopicId] || {
      topicId: normalizedTopicId,
      label: _topicLabel(normalizedTopicId),
      attempts: 0,
      correct: 0,
      wrong: 0,
      masteryScore: 50,
      lastSeenAt: null,
      lastCorrectAt: null,
      lastWrongAt: null,
      difficultyStats: {
        easy: { attempts: 0, correct: 0, wrong: 0 },
        medium: { attempts: 0, correct: 0, wrong: 0 },
        hard: { attempts: 0, correct: 0, wrong: 0 }
      }
    };

    const normalizedDifficulty = _normalizeDifficulty(difficulty);
    const weight = DIFFICULTY_WEIGHTS[normalizedDifficulty];
    const now = _nowIso();

    entry.attempts += 1;
    entry.lastSeenAt = now;
    entry.difficultyStats[normalizedDifficulty].attempts += 1;

    if (correct) {
      entry.correct += 1;
      entry.lastCorrectAt = now;
      entry.difficultyStats[normalizedDifficulty].correct += 1;
      entry.masteryScore = _clamp(entry.masteryScore + Math.round(6 * weight), 0, 100);
    } else {
      entry.wrong += 1;
      entry.lastWrongAt = now;
      entry.difficultyStats[normalizedDifficulty].wrong += 1;
      entry.masteryScore = _clamp(entry.masteryScore - Math.round(8 * weight), 0, 100);
    }

    mastery[normalizedTopicId] = entry;
    return entry;
  }

  function scheduleReview({ questionId, topicId, difficulty, correct }) {
    if (!questionId) return null;

    const queue = _ensureReviewQueue();
    const normalizedTopicId = String(topicId || 'general');
    const normalizedDifficulty = _normalizeDifficulty(difficulty);
    let item = queue.find(entry => entry.questionId === questionId);
    if (!item) {
      item = {
        questionId,
        topicId: normalizedTopicId,
        difficulty: normalizedDifficulty,
        attempts: 0,
        correctCount: 0,
        wrongCount: 0,
        lastSeenAt: null,
        lastWrongAt: null,
        nextReviewAt: null
      };
      queue.push(item);
    }

    const now = Date.now();
    item.topicId = normalizedTopicId;
    item.difficulty = normalizedDifficulty;
    item.attempts += 1;
    item.lastSeenAt = new Date(now).toISOString();

    if (correct) {
      item.correctCount += 1;
    } else {
      item.wrongCount += 1;
      item.lastWrongAt = new Date(now).toISOString();
    }

    const intervalDays = _buildReviewIntervalDays(item, correct);
    item.nextReviewAt = intervalDays === REVIEW_IMMEDIATE_MS
      ? new Date(now).toISOString()
      : new Date(now + Math.round(intervalDays * DAY_MS)).toISOString();

    return item;
  }

  function recordQuestionResult({ questionId, topicId, difficulty, correct }) {
    const masteryEntry = updateMastery({ topicId, correct, difficulty });
    const reviewItem = scheduleReview({ questionId, topicId, difficulty, correct });

    return {
      mastery: masteryEntry,
      reviewItem
    };
  }

  function getDueReviews(limit = 5) {
    const now = Date.now();
    return _ensureReviewQueue()
      .filter(item => item?.nextReviewAt && new Date(item.nextReviewAt).getTime() <= now)
      .sort((a, b) => new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime())
      .slice(0, Math.max(0, Number(limit) || 0))
      .map(item => {
        const located = _findQuestionById(item.questionId);
        return {
          ...item,
          question: located?.question || null,
          lessonId: located?.lessonId || null,
          lessonTitle: located?.lessonTitle || null
        };
      })
      .filter(item => item.question);
  }

  function buildReviewSprint(limit = 5) {
    return getDueReviews(limit).map(item => ({
      ...item,
      question: {
        ...item.question,
        reviewMode: true
      }
    }));
  }

  function buildRefresherQuiz(limit = 4) {
    const normalizedLimit = Math.max(0, Number(limit) || 0);
    if (!normalizedLimit) return [];

    const { lessons, pool } = _getCompletedLessonEntries();
    if (!lessons.length || !pool.length) return [];

    const completedLessonIds = new Set(lessons.map(lesson => Number(lesson.id)));
    const weakestTopics = new Set(
      (getMasterySummary()?.weakestTopics || []).map(topic => String(topic?.topicId || ''))
    );
    const selected = [];
    const usedQuestionIds = new Set();

    getDueReviews(normalizedLimit * 2)
      .filter(item => completedLessonIds.has(Number(item.lessonId)))
      .forEach(item => {
        if (selected.length >= normalizedLimit) return;
        _pushRefresherCandidate(selected, usedQuestionIds, {
          ...item,
          questionId: item.questionId,
          topicId: item.topicId,
          question: item.question
        });
      });

    if (selected.length < normalizedLimit && weakestTopics.size) {
      _shuffle(pool.filter(entry => weakestTopics.has(String(entry.topicId || ''))))
        .forEach(entry => {
          if (selected.length >= normalizedLimit) return;
          _pushRefresherCandidate(selected, usedQuestionIds, entry);
        });
    }

    if (selected.length < normalizedLimit) {
      _shuffle(pool).forEach(entry => {
        if (selected.length >= normalizedLimit) return;
        _pushRefresherCandidate(selected, usedQuestionIds, entry);
      });
    }

    return selected.slice(0, normalizedLimit).map(entry => ({
      ...entry,
      question: {
        ...entry.question,
        refresherMode: true
      }
    }));
  }

  function getRefresherQuizSummary(limit = 4) {
    const normalizedLimit = Math.max(0, Number(limit) || 0);
    const { lessons, pool } = _getCompletedLessonEntries();
    return {
      ready: pool.length > 0 && lessons.length > 0 && normalizedLimit > 0,
      lessonCount: lessons.length,
      questionPoolSize: pool.length,
      suggestedCount: Math.min(normalizedLimit || 0, pool.length)
    };
  }

  function getTopicMastery(topicId) {
    const mastery = _ensureMasteryStore();
    return mastery[String(topicId || 'general')] || null;
  }

  function getMasterySummary() {
    const topics = Object.values(_ensureMasteryStore());
    const averageMastery = topics.length
      ? Math.round(topics.reduce((sum, topic) => sum + (topic.masteryScore || 0), 0) / topics.length)
      : 0;
    const weakestTopics = [...topics]
      .sort((a, b) => (a.masteryScore || 0) - (b.masteryScore || 0))
      .slice(0, 3);
    const strongestTopics = [...topics]
      .sort((a, b) => (b.masteryScore || 0) - (a.masteryScore || 0))
      .slice(0, 3);

    return {
      totalTopics: topics.length,
      averageMastery,
      dueReviewCount: getDueReviews(100).length,
      weakestTopics,
      strongestTopics,
      masteredTopics: topics.filter(topic => (topic.masteryScore || 0) >= 80).length
    };
  }

  global.ReviewEngine = {
    recordQuestionResult,
    updateMastery,
    scheduleReview,
    getDueReviews,
    buildReviewSprint,
    buildRefresherQuiz,
    getRefresherQuizSummary,
    getTopicMastery,
    getMasterySummary
  };

  global.recordQuestionResult = recordQuestionResult;
  global.updateMastery = updateMastery;
  global.scheduleReview = scheduleReview;
  global.getDueReviews = getDueReviews;
  global.buildReviewSprint = buildReviewSprint;
  global.buildRefresherQuiz = buildRefresherQuiz;
  global.getRefresherQuizSummary = getRefresherQuizSummary;
  global.getTopicMastery = getTopicMastery;
  global.getMasterySummary = getMasterySummary;
})(typeof window !== 'undefined' ? window : globalThis);
