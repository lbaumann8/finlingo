// ============================================================================
// classroomData.js
// Data layer for Finlingo Classroom: join-code generation, preset question
// banks, the server-side Claude client, Supabase/RPC access helpers, and the
// fully client-side demo classroom (never written to the database).
//
// Depends (looked up lazily, all loaded before this file):
//   SB_URL, SB_KEY, getAuthHeaders, sbGet, sbPost, sbPatch  (supabase.js)
//   S, save()                                               (state.js)
// ============================================================================

(function (global) {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  var AUDIENCE_TYPES = [
    { id: 'high_school', label: 'High school' },
    { id: 'college', label: 'College' },
    { id: 'community', label: 'Community nonprofit' },
    { id: 'workforce', label: 'Workforce development' },
    { id: 'other', label: 'Other' }
  ];

  var TOPICS = [
    'Diversification',
    'Inflation',
    'Bond prices and yields',
    'Interest rates and growth stocks',
    'Risk and volatility',
    'Correlation',
    'Reading a market chart'
  ];

  var DIFFICULTIES = [
    { id: 'beginner', label: 'Beginner' },
    { id: 'intermediate', label: 'Intermediate' }
  ];

  // Unambiguous join-code alphabet (no 0/O/1/I/L). 6 characters.
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function generateJoinCode() {
    var out = '';
    var bytes;
    try {
      bytes = new Uint32Array(6);
      (global.crypto || {}).getRandomValues && global.crypto.getRandomValues(bytes);
    } catch (_) { bytes = null; }
    for (var i = 0; i < 6; i++) {
      var n = bytes ? bytes[i] : Math.floor(Math.random() * 1e9);
      out += CODE_ALPHABET[n % CODE_ALPHABET.length];
    }
    return out;
  }

  function audienceLabel(id) {
    for (var i = 0; i < AUDIENCE_TYPES.length; i++) {
      if (AUDIENCE_TYPES[i].id === id) return AUDIENCE_TYPES[i].label;
    }
    return 'Other';
  }

  // ── Server-side Claude client ─────────────────────────────────────────────
  // POST { mode, ...payload } → /api/classroom-ai. Throws Error(message) with a
  // user-friendly message on failure.
  function classroomAI(mode, payload) {
    var body = Object.assign({ mode: mode }, payload || {});
    return fetch('/api/classroom-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || data.error) {
          var err = new Error(data.error || 'Finlingo could not complete that request.');
          err.retryable = !!data.retryable;
          throw err;
        }
        return data;
      });
    });
  }

  // ── Supabase access ───────────────────────────────────────────────────────
  // NOTE: S, SB_URL and other app globals are top-level `let`/`const` bindings in
  // classic scripts, so they live in the shared global lexical environment — they
  // are NOT properties of `window`. Reference them bare (resolved up the scope
  // chain), never as `global.S` / `global.SB_URL` (which are `undefined`).
  function currentUserId() {
    return (typeof S !== 'undefined' && S && S.user && S.user.id) || null;
  }

  function sbRpc(fn, args) {
    return getAuthHeaders().then(function (headers) {
      return fetch(SB_URL + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers: headers, body: JSON.stringify(args || {})
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok) {
            var err = new Error('rpc ' + fn + ': ' + res.status);
            err.status = res.status;
            throw err;
          }
          return data;
        });
      });
    });
  }

  // Create a group, retrying on a join-code collision (unique constraint).
  function createGroup(opts) {
    var uid = currentUserId();
    if (!uid) return Promise.reject(new Error('You need to be signed in to create a group.'));
    var attempt = function (triesLeft) {
      var row = {
        owner_id: uid,
        name: (opts.name || '').trim().slice(0, 80),
        description: (opts.description || '').trim().slice(0, 400),
        audience_type: opts.audience || 'other',
        join_code: generateJoinCode()
      };
      return global.sbPost('classrooms', row).then(function (res) {
        return Array.isArray(res) ? res[0] : res;
      }).catch(function (err) {
        var msg = String(err && err.message || '');
        if (triesLeft > 0 && (msg.indexOf('409') >= 0 || msg.indexOf('23505') >= 0 || /duplicate/i.test(msg))) {
          return attempt(triesLeft - 1);
        }
        throw err;
      });
    };
    return attempt(5);
  }

  // Update editable group fields (leader-only via RLS owner policy).
  function updateGroup(classroomId, opts) {
    var patch = {};
    if (opts.name != null) patch.name = String(opts.name).trim().slice(0, 80);
    if (opts.description != null) patch.description = String(opts.description).trim().slice(0, 400);
    if (opts.audience != null) patch.audience_type = opts.audience;
    return global.sbPatch('classrooms', '?id=eq.' + classroomId, patch).then(function (res) {
      return Array.isArray(res) ? res[0] : res;
    });
  }

  // Leader-only hard delete of one owned group + all dependent rows. Routed
  // through the SECURITY DEFINER classroom_delete_group RPC (owner-checked
  // server-side). Also drops the id from the learner's local joined list, if
  // the owner happened to be a member too.
  function deleteGroup(classroomId) {
    return sbRpc('classroom_delete_group', { p_classroom_id: classroomId }).then(function (res) {
      if (!res || !res.ok) {
        var reason = res && res.error;
        if (reason === 'forbidden') throw new Error('Only the group owner can delete this group.');
        if (reason === 'not_found') throw new Error('That group no longer exists.');
        if (reason === 'not_authenticated') throw new Error('Please sign in again to delete this group.');
        throw new Error('Could not delete the group. Please try again.');
      }
      try {
        if (typeof S !== 'undefined' && S && Array.isArray(S.classroomJoinedIds)) {
          var next = S.classroomJoinedIds.filter(function (id) { return id !== classroomId; });
          if (next.length !== S.classroomJoinedIds.length) {
            S.classroomJoinedIds = next;
            if (typeof save === 'function') save();
          }
        }
      } catch (_) {}
      return res;
    });
  }

  // Wipe every classroom row tied to the signed-in user (owned groups + learner
  // footprint). Returns the RPC result; throws on a real failure so the caller
  // can ABORT the local reset / sign-out instead of pretending it succeeded.
  // err.status is preserved (404 = RPC/tables not installed) so callers can
  // tell "nothing to clear" apart from a genuine server error.
  function resetUserData() {
    return sbRpc('classroom_reset_user_data', {}).then(function (res) {
      if (!res || !res.ok) {
        var reason = (res && res.error) || 'reset_failed';
        if (reason === 'not_authenticated') throw new Error('Please sign in again before resetting.');
        throw new Error('Could not reset your Classroom data. Please try again.');
      }
      return res;
    });
  }

  // Suggest an assignment title from a topic, e.g. "Diversification" →
  // "Understanding Diversification". Keeps title and topic aligned by default.
  function suggestAssignmentTitle(topic) {
    var t = String(topic || '').trim();
    if (!t) return '';
    return 'Understanding ' + t;
  }

  function listGroups() {
    var uid = currentUserId();
    if (!uid) return Promise.resolve([]);
    return global.sbGet('classrooms', '?owner_id=eq.' + uid + '&order=created_at.desc')
      .then(function (rows) {
        rows = rows || [];
        return Promise.all(rows.map(function (c) { return decorateGroup(c); }));
      });
  }

  function normalizeAssignmentStatus(status) {
    if (status === 'draft' || status === 'closed') return status;
    return 'active';
  }

  function assignmentStatusRank(a) {
    var s = normalizeAssignmentStatus(a && a.status);
    if (s === 'active') return 0;
    if (s === 'draft') return 1;
    return 2;
  }

  function sortAssignments(assignments) {
    return (assignments || []).slice().sort(function (a, b) {
      var ra = assignmentStatusRank(a), rb = assignmentStatusRank(b);
      if (ra !== rb) return ra - rb;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }

  function listAssignments(classroomId) {
    return global.sbGet('classroom_assignments',
      '?classroom_id=eq.' + classroomId + '&order=created_at.desc')
      .then(function (rows) { return sortAssignments(rows || []); });
  }

  function decorateAssignment(a, learnerCount) {
    a.learner_count = learnerCount || 0;
    return global.sbGet('classroom_attempts',
      '?assignment_id=eq.' + a.id + '&completed_at=not.is.null&select=id,score,total')
      .then(function (att) {
        att = att || [];
        a.completed_count = att.length;
        var graded = att.filter(function (r) { return Number(r.total) > 0; });
        a.avg_accuracy = graded.length
          ? graded.reduce(function (sum, r) { return sum + ((Number(r.score) || 0) / (Number(r.total) || 1)); }, 0) / graded.length
          : 0;
        if (!a.completed_count) {
          a.intel = { state: 'waiting', concept: '', label: 'Waiting for responses' };
          return a;
        }
        return aggregate(a.id).then(function (agg) {
          a.intel = computeGroupIntel(agg);
          a._agg = agg;
          return a;
        }).catch(function () { a.intel = null; return a; });
      }).catch(function () {
        a.completed_count = 0;
        a.avg_accuracy = 0;
        a.intel = null;
        return a;
      });
  }

  // Attach member count + assignment summaries to a group card.
  function decorateGroup(c) {
    return Promise.all([
      global.sbGet('classroom_members', '?classroom_id=eq.' + c.id + '&select=id'),
      listAssignments(c.id)
    ]).then(function (parts) {
      var members = parts[0] || [];
      var assignments = parts[1] || [];
      c.learner_count = members.length;
      c.assignment_count = assignments.length;
      return Promise.all(assignments.map(function (a) { return decorateAssignment(a, c.learner_count); }))
        .then(function (decorated) {
          c.assignments = sortAssignments(decorated);
          c.active_assignment = c.assignments.filter(function (a) { return normalizeAssignmentStatus(a.status) === 'active'; })[0] || null;
          c.latest_assignment = c.assignments[0] || null;
          c.completed_count = c.assignments.reduce(function (sum, a) { return sum + (Number(a.completed_count) || 0); }, 0);
          var insightAssignment = c.assignments.filter(function (a) { return (Number(a.completed_count) || 0) > 0 && a.intel; })[0];
          c.intel = insightAssignment ? insightAssignment.intel : (c.active_assignment ? c.active_assignment.intel : null);
          c._agg = insightAssignment ? insightAssignment._agg : null;
          return c;
        });
    }).catch(function () {
      c.learner_count = c.learner_count || 0;
      c.assignment_count = c.assignment_count || 0;
      c.assignments = c.assignments || [];
      c.active_assignment = c.active_assignment || null;
      c.latest_assignment = c.latest_assignment || null;
      c.completed_count = c.completed_count || 0;
      c.intel = c.intel || null;
      return c;
    });
  }

  function joinGroup(code, name) {
    return sbRpc('classroom_join', { p_code: code, p_name: name }).then(function (res) {
      if (!res || !res.ok) {
        var reason = res && res.error;
        if (reason === 'invalid_code') throw new Error("That join code didn't match a group. Check it and try again.");
        if (reason === 'not_authenticated') throw new Error('Please sign in before joining a classroom.');
        throw new Error('Could not join that classroom. Please try again.');
      }
      // Remember locally so the Classroom nav item appears for this learner.
      var ids = (typeof S !== 'undefined' && S && S.classroomJoinedIds) || [];
      if (res.classroom && typeof S !== 'undefined' && S && ids.indexOf(res.classroom.id) < 0) {
        S.classroomJoinedIds = ids.concat([res.classroom.id]);
        if (typeof save === 'function') save();
      }
      return res;
    });
  }

  function myMemberships() {
    var uid = currentUserId();
    if (!uid) return Promise.resolve([]);
    // Members rows + the classroom each belongs to (RLS lets a member read both).
    return global.sbGet('classroom_members',
      '?user_id=eq.' + uid + '&select=id,classroom_id,classrooms(id,name,description,is_demo)')
      .then(function (rows) { return rows || []; })
      .catch(function () { return []; });
  }

  function createAssignment(classroomId, content, dueDate, status) {
    var row = {
      classroom_id: classroomId,
      title: content.title,
      topic: content.topic || '',
      difficulty: content.difficulty || 'beginner',
      content: content,
      status: status || 'active'
    };
    if (dueDate) row.due_date = dueDate;
    return global.sbPost('classroom_assignments', row).then(function (res) {
      return Array.isArray(res) ? res[0] : res;
    });
  }

  function updateAssignment(assignmentId, content, dueDate, status) {
    var patch = {
      title: content.title,
      topic: content.topic || '',
      difficulty: content.difficulty || 'beginner',
      content: content,
      status: status || 'active'
    };
    if (dueDate) patch.due_date = dueDate;
    return global.sbPatch('classroom_assignments', '?id=eq.' + assignmentId, patch).then(function (res) {
      return Array.isArray(res) ? res[0] : res;
    });
  }

  function getActiveAssignment(classroomId) {
    return global.sbGet('classroom_assignments',
      '?classroom_id=eq.' + classroomId + '&status=eq.active&order=created_at.desc&limit=1')
      .then(function (rows) { return (rows || [])[0] || null; });
  }

  function getAssignment(assignmentId) {
    return global.sbGet('classroom_assignments', '?id=eq.' + assignmentId + '&limit=1')
      .then(function (rows) { return (rows || [])[0] || null; });
  }

  function getMemberId(classroomId) {
    var uid = currentUserId();
    if (!uid) return Promise.resolve(null);
    return global.sbGet('classroom_members',
      '?classroom_id=eq.' + classroomId + '&user_id=eq.' + uid + '&select=id&limit=1')
      .then(function (rows) { return (rows || [])[0] ? rows[0].id : null; });
  }

  // Resume an existing attempt or create one.
  function startAttempt(assignment, memberId, classroomId) {
    return global.sbGet('classroom_attempts',
      '?assignment_id=eq.' + assignment.id + '&member_id=eq.' + memberId + '&limit=1')
      .then(function (rows) {
        if (rows && rows[0]) return rows[0];
        return global.sbPost('classroom_attempts', {
          assignment_id: assignment.id,
          classroom_id: classroomId,
          member_id: memberId,
          total: 0
        }).then(function (res) { return Array.isArray(res) ? res[0] : res; });
      });
  }

  function submitResponse(attemptId, classroomId, question, responseData, isCorrect, evaluation) {
    var row = {
      attempt_id: attemptId,
      classroom_id: classroomId,
      question_id: question.id,
      skill: question.skill || '',
      response: responseData,
      is_correct: (typeof isCorrect === 'boolean') ? isCorrect : null
    };
    if (evaluation) row.evaluation = evaluation;
    return global.sbPost('classroom_responses', row);
  }

  function completeAttempt(attemptId, score, total) {
    return global.sbPatch('classroom_attempts', '?id=eq.' + attemptId, {
      completed_at: new Date().toISOString(),
      score: score,
      total: total
    });
  }

  function aggregate(assignmentId) {
    return sbRpc('classroom_aggregate', { p_assignment: assignmentId }).then(function (res) {
      if (!res || !res.ok) {
        throw new Error((res && res.error) === 'forbidden'
          ? 'You can only view insights for groups you own.'
          : 'Could not load assignment results yet.');
      }
      return res;
    });
  }

  // ── Insight thresholds + derivations (shared by assignments + demo) ───────
  var INSIGHT_MIN_LEARNERS = 3;
  var INSIGHT_MIN_RESPONSES = 5;

  function totalGradedResponses(agg) {
    return (agg.skill_stats || []).reduce(function (sum, s) {
      return sum + (Number(s.total) || 0);
    }, 0);
  }

  function meetsInsightThreshold(agg) {
    return (Number(agg.completed) || 0) >= INSIGHT_MIN_LEARNERS
      || totalGradedResponses(agg) >= INSIGHT_MIN_RESPONSES;
  }

  // Build concept rows [{ skill, pct, correct, total }] sorted high→low.
  function conceptRows(agg) {
    return (agg.skill_stats || [])
      .filter(function (s) { return (Number(s.total) || 0) > 0; })
      .map(function (s) {
        var total = Number(s.total) || 0, correct = Number(s.correct) || 0;
        return { skill: s.skill, correct: correct, total: total, pct: Math.round((correct / total) * 100) };
      })
      .sort(function (a, b) { return b.pct - a.pct; });
  }

  // ── Human-readable concept labels ─────────────────────────────────────────
  // Turn machine/slug or terse skill tags into polished, human labels:
  //   "diversification-explain" → "Explaining diversification"
  //   "Diversification explain"  → "Explaining diversification"
  //   "diversification-limits"   → "Recognizing diversification limits"
  //   "Diversification basics"   → "Diversification basics" (already human)
  function humanizeSkill(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return 'This concept';
    var spaced = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    var tokens = spaced.split(' ').filter(Boolean);
    tokens = tokens.filter(function (word, i) {
      return i === 0 || word.toLowerCase() !== tokens[i - 1].toLowerCase();
    });
    var verbs = ['recognizing', 'recognize', 'identifying', 'identify', 'understanding', 'understand'];
    while (tokens.length > 1 && verbs.indexOf(tokens[0].toLowerCase()) >= 0) tokens.shift();
    var last = (tokens[tokens.length - 1] || '').toLowerCase();
    var out;
    if ((last === 'explain' || last === 'explanation') && tokens.length > 1) {
      out = 'Explaining ' + tokens.slice(0, -1).join(' ').toLowerCase();
    } else if ((last === 'limits' || last === 'benefits') && tokens.length > 1) {
      out = last.charAt(0).toUpperCase() + last.slice(1) + ' of ' + tokens.slice(0, -1).join(' ').toLowerCase();
    } else {
      out = tokens.join(' ').toLowerCase();
      out = out.charAt(0).toUpperCase() + out.slice(1);
    }
    return out.replace(/\b([a-z]+)(?:\s+\1)\b/gi, '$1');
  }

  // Normalize model text before it reaches any renderer. This removes markdown
  // tokens and decorative correctness emoji while preserving short paragraphs
  // and simple list structure as plain text.
  function normalizeGeneratedText(value, limit) {
    var out = String(value == null ? '' : value)
      .replace(/```[\s\S]*?```/g, function (m) { return m.replace(/```(?:\w+)?/g, ''); })
      .replace(/^\s{0,3}#{1,6}\s*/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')
      .replace(/(^|\W)[*_]([^*_\n]+)[*_](?=\W|$)/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[✅☑✔❌✕❎]/g, '')
      .replace(/^\s*[-*+]\s+/gm, '• ')
      .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return limit ? out.slice(0, limit) : out;
  }

  function confidenceLearningState(correct, confidence) {
    if (correct === true && confidence === 'know') return 'understood';
    if (correct === true) return 'fragile';
    if (correct === false && confidence === 'know') return 'misconception';
    return 'gap';
  }

  // ── Small-group confidence (based on completed-learner count) ─────────────
  // Graduates naturally and never implies certainty from a tiny group. We never
  // surface the phrase "Low confidence"; "Strong pattern" requires a larger set.
  function confidenceLabel(completed) {
    var n = Number(completed) || 0;
    if (n >= 6) return 'Strong pattern';
    if (n >= 3) return 'Developing pattern';
    return 'Early signal';
  }
  function confidenceTone(completed) {
    var n = Number(completed) || 0;
    if (n >= 6) return 'strong';
    if (n >= 3) return 'developing';
    return 'early';
  }
  function isEarlyResults(completed) {
    return (Number(completed) || 0) < 3;
  }

  // ── Concept grouping: understood vs needs-reinforcement ───────────────────
  function groupConcepts(agg) {
    var rows = conceptRows(agg);
    var understood = [], needs = [];
    rows.forEach(function (r) {
      var item = { skill: r.skill, label: humanizeSkill(r.skill), pct: r.pct, correct: r.correct, total: r.total };
      if (r.pct >= 60) understood.push(item); else needs.push(item);
    });
    return { understood: understood, needs: needs, rows: rows };
  }

  // Weakest concept (lowest %) — grounds the gap label + evidence.
  function weakestConcept(agg) {
    var rows = conceptRows(agg);
    return rows.length ? rows[rows.length - 1] : null;
  }

  // Responsible, small-group-aware evidence line for the detected gap. Uses
  // "response" language for 1–2 learners to avoid implying a broad group trend.
  function gapEvidenceLine(weakest, completed) {
    if (!weakest) return '';
    var total = Number(weakest.total) || 0;
    var missed = Math.max(0, total - (Number(weakest.correct) || 0));
    var c = Number(completed) || 0;
    if (c <= 2) {
      if (missed <= 0) return 'Responses so far were correct on this concept.';
      return missed === 1 ? 'One response missed this concept.'
                          : missed + ' responses missed this concept.';
    }
    return missed + ' of ' + total + ' responses on this concept were incorrect.';
  }

  // Lightweight, NO-AI intelligence state for a group card / detail, derived
  // only from the anonymized aggregate of its latest assignment. Never uses demo
  // data and never calls Claude — keeps the dashboard fast and honest.
  function computeGroupIntel(agg) {
    var completed = Number(agg && agg.completed) || 0;
    var rows = agg ? conceptRows(agg) : [];
    if (!completed || !rows.length) return { state: 'waiting', concept: '', label: 'Waiting for responses' };
    var weak = rows[rows.length - 1];
    if (!weak || weak.pct >= 50) return { state: 'ontrack', concept: '', label: 'On track: No major gaps detected' };
    var concept = humanizeSkill(weak.skill);
    if (completed >= 3) return { state: 'attention', concept: concept, label: 'Needs attention: ' + concept };
    return { state: 'early', concept: concept, label: 'Early signal: ' + concept };
  }

  // ── Demo classroom (entirely client-side) ─────────────────────────────────
  function buildDemo() {
    var assignmentId = 'demo-assignment';
    var content = {
      title: 'Understanding Inflation & Bonds',
      topic: 'Bond prices and yields',
      difficulty: 'beginner',
      teachItBack: true,
      objectives: [
        'Explain what inflation does to purchasing power.',
        'Describe the inverse relationship between bond prices and yields.',
        'Recognize why diversification lowers portfolio risk.'
      ],
      questions: [
        { id: 'q1', type: 'mcq', skill: 'Diversification basics',
          prompt: 'Diversification mainly helps an investor by…',
          choices: ['Guaranteeing higher returns', 'Spreading risk across many holdings', 'Avoiding all losses', 'Timing the market'],
          answerIndex: 1, explanation: 'Diversification spreads risk so one holding can’t sink the whole portfolio.' },
        { id: 'q2', type: 'mcq', skill: 'Inflation & purchasing power',
          prompt: 'When inflation rises, a fixed amount of cash generally…',
          choices: ['Buys more', 'Buys less', 'Stays the same', 'Earns interest'],
          answerIndex: 1, explanation: 'Inflation erodes purchasing power, so the same cash buys less over time.' },
        { id: 'q3', type: 'mcq', skill: 'Bond prices and yields',
          prompt: 'If market interest rates fall, the price of an existing bond usually…',
          choices: ['Falls', 'Rises', 'Is unchanged', 'Goes to zero'],
          answerIndex: 1, explanation: 'Existing bonds with higher coupons become more valuable, so price rises as yields fall.' },
        { id: 'q4', type: 'mcq', skill: 'Bond prices and yields',
          prompt: 'A bond’s yield and its price move…',
          choices: ['In the same direction', 'In opposite directions', 'Independently', 'Only with inflation'],
          answerIndex: 1, explanation: 'Yield and price are inversely related: when one rises, the other falls.' },
        { id: 'q5', type: 'teachback', skill: 'Bond prices and yields explain',
          prompt: 'In your own words, why do bond prices rise when yields fall?',
          objective: 'Explain the inverse relationship between bond prices and yields.',
          explanation: '' }
      ]
    };

    // Anonymous aggregate consistent with the example gaps (Diversification high,
    // Inflation mid, Bond prices low).
    var agg = {
      ok: true,
      assignment_id: assignmentId,
      learners: 18,
      completed: 18,
      avg_accuracy: 0.58,
      skill_stats: [
        { skill: 'Diversification basics', correct: 12, total: 18 },
        { skill: 'Inflation & purchasing power', correct: 11, total: 18 },
        { skill: 'Bond prices and yields', correct: 13, total: 36 }
      ],
      choice_distribution: [
        { question_id: 'q3', choice: 0, n: 11, choice_correct: false },
        { question_id: 'q3', choice: 1, n: 7, choice_correct: true },
        { question_id: 'q4', choice: 0, n: 9, choice_correct: false },
        { question_id: 'q4', choice: 1, n: 9, choice_correct: true }
      ],
      teachback_excerpts: [
        'When yields fall the bond is worth less because it pays less.',
        'Prices go down when rates go down I think.',
        'Lower yield means the older bond pays more than new ones so people want it.'
      ]
    };

    var insight = {
      summary: 'The group is comfortable with diversification and the basic idea that inflation erodes purchasing power. Most answered those confidently.',
      primaryGap: 'Many learners think bond prices fall when interest rates fall — the inverse price/yield relationship is the shared sticking point.',
      recommendedFocus: 'Show concretely why an existing higher-coupon bond becomes more valuable when new rates drop, then re-test with a price-vs-yield question.',
      confidence: 'high',
      // ── Intervention-brief fields ──
      needsAttention: 'Learners grasp that bonds and rates are connected, but need support recognizing that bond prices move opposite to yields when rates fall.',
      whatTheyKnow: 'The group reliably explains how diversification spreads risk and that inflation erodes the purchasing power of cash.',
      primaryMisconception: 'Many learners assume a bond’s price falls whenever interest rates fall, treating price and yield as moving together.',
      whyItMatters: 'The inverse price/yield relationship underpins how bond portfolios respond to rate changes — without it, learners misread the most common fixed-income scenario.',
      recommendedMove: 'Walk through a single 5% bond when new bonds pay 3%, showing why buyers pay more for the older bond, then re-test with one price-vs-yield question.',
      gapConcept: 'Bond price/yield relationship',
      suggestedObjective: 'Help learners explain why existing bond prices rise when market yields fall.',
      discussionQuestion: 'If new bonds start paying less than one you already own, should your bond be worth more or less — and why?',
      plainExplanation: 'When new bonds pay less, an older bond paying a higher coupon becomes more attractive, so buyers bid its price up. Price and yield move in opposite directions.',
      realWorldExample: 'You hold a bond paying 5%. New bonds now pay only 3%. Because your bond pays more, other investors will pay above face value to buy it — its price rises even though its coupon never changed.',
      followUpCheck: 'If market rates fall, the price of an existing bond usually rises, falls, or stays the same?'
    };

    var followup = {
      title: 'Why bond prices rise when yields fall',
      topic: 'Bond prices and yields',
      difficulty: 'beginner',
      teachItBack: true,
      objectives: ['Explain the inverse relationship between bond prices and yields.'],
      explanation: 'Imagine you own a bond paying 5%. If new bonds start paying only 3%, your 5% bond is suddenly more attractive — so buyers will pay more for it. Its price rises even though its coupon never changed. That’s the whole idea: when yields fall, the price of existing bonds rises, and vice-versa.',
      scenario: 'A community member bought a bond last year paying 5%. This year, new bonds of the same type pay only 3%. A friend says “rates dropped, so your bond must be worth less now.” Use what you know about price and yield to decide whether the friend is right.',
      chartPrompt: 'Existing 5% bond: price rises. New 3% bond: lower income. Lesson: when comparable market yields fall, an existing higher-coupon bond becomes more valuable.',
      questions: [
        { id: 'q1', type: 'mcq', skill: 'Bond prices and yields',
          prompt: 'New bonds now pay less than the one you hold. Your older bond’s price should…',
          choices: ['Fall', 'Rise', 'Stay flat', 'Drop to zero'],
          answerIndex: 1, explanation: 'A higher-coupon bond is worth more when new bonds pay less, so its price rises.' },
        { id: 'q2', type: 'mcq', skill: 'Bond prices and yields',
          prompt: 'The relationship between a bond’s price and its yield is best described as…',
          choices: ['Direct', 'Inverse', 'Random', 'None'],
          answerIndex: 1, explanation: 'Price and yield move in opposite directions — an inverse relationship.' },
        { id: 'q3', type: 'teachback', skill: 'Bond prices and yields explain',
          prompt: 'Explain to a friend why falling yields push bond prices up.',
          objective: 'Explain the inverse relationship between bond prices and yields.', explanation: '' }
      ],
      source: 'demo-followup'
    };

    return {
      classroom: {
        id: 'demo',
        name: 'First-Generation Finance Workshop',
        description: 'A sample workshop showing anonymous assignment results.',
        audience_type: 'community',
        join_code: 'MONEY24',
        is_demo: true,
        learner_count: 18,
        completed_count: 18
      },
      assignment: { id: assignmentId, classroom_id: 'demo', title: content.title,
        topic: content.topic, difficulty: 'beginner', content: content, status: 'active' },
      aggregate: agg,
      insight: insight,
      followup: followup
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────
  global.ClassroomData = {
    AUDIENCE_TYPES: AUDIENCE_TYPES,
    TOPICS: TOPICS,
    DIFFICULTIES: DIFFICULTIES,
    INSIGHT_MIN_LEARNERS: INSIGHT_MIN_LEARNERS,
    INSIGHT_MIN_RESPONSES: INSIGHT_MIN_RESPONSES,
    generateJoinCode: generateJoinCode,
    audienceLabel: audienceLabel,
    classroomAI: classroomAI,
    currentUserId: currentUserId,
    createGroup: createGroup,
    updateGroup: updateGroup,
    deleteGroup: deleteGroup,
    resetUserData: resetUserData,
    suggestAssignmentTitle: suggestAssignmentTitle,
    listGroups: listGroups,
    listAssignments: listAssignments,
    joinGroup: joinGroup,
    myMemberships: myMemberships,
    createAssignment: createAssignment,
    updateAssignment: updateAssignment,
    getActiveAssignment: getActiveAssignment,
    getAssignment: getAssignment,
    getMemberId: getMemberId,
    startAttempt: startAttempt,
    submitResponse: submitResponse,
    completeAttempt: completeAttempt,
    aggregate: aggregate,
    totalGradedResponses: totalGradedResponses,
    meetsInsightThreshold: meetsInsightThreshold,
    conceptRows: conceptRows,
    humanizeSkill: humanizeSkill,
    normalizeGeneratedText: normalizeGeneratedText,
    confidenceLearningState: confidenceLearningState,
    confidenceLabel: confidenceLabel,
    confidenceTone: confidenceTone,
    isEarlyResults: isEarlyResults,
    groupConcepts: groupConcepts,
    weakestConcept: weakestConcept,
    gapEvidenceLine: gapEvidenceLine,
    computeGroupIntel: computeGroupIntel,
    presetUnitFor: presetUnitFor,
    buildDemo: buildDemo
  };

  // ── Preset question banks ─────────────────────────────────────────────────
  // Curated sets start from reviewed assignment content and expand into a larger candidate pool.
  function mcq(id, skill, prompt, choices, answerIndex, explanation) {
    return { id: id, type: 'mcq', skill: skill, prompt: prompt, choices: choices,
      answerIndex: answerIndex, explanation: explanation };
  }
  function teachback(id, skill, prompt, objective) {
    return { id: id, type: 'teachback', skill: skill, prompt: prompt, objective: objective, explanation: '' };
  }

  var PRESETS = {
    'Diversification': {
      objectives: ['Explain how diversification lowers risk.', 'Recognize what diversification can and cannot do.'],
      questions: [
        mcq('q1', 'Diversification basics', 'Diversification mainly helps by…',
          ['Guaranteeing gains', 'Spreading risk across holdings', 'Eliminating all risk', 'Timing the market'], 1,
          'It spreads risk so no single holding can sink the portfolio.'),
        mcq('q2', 'Concentration risk', 'Putting all your money in one stock is risky because…',
          ['Fees are higher', 'One bad result hits everything', 'It is illegal', 'Returns are capped'], 1,
          'Concentration means one bad outcome affects your entire portfolio.'),
        mcq('q3', 'Limits of diversification', 'Diversification cannot…',
          ['Reduce single-stock risk', 'Remove all market risk', 'Smooth returns', 'Lower volatility'], 1,
          'Market-wide (systematic) risk remains even in a diversified portfolio.'),
        mcq('q4', 'Correlation & diversification', 'Diversification works best when holdings are…',
          ['Highly correlated', 'Not perfectly correlated', 'Identical', 'All bonds'], 1,
          'Assets that don’t move together offset each other, lowering overall risk.'),
        teachback('q5', 'Diversification explain', 'In your own words, why does diversification reduce risk?',
          'Explain how spreading investments across uncorrelated holdings lowers risk.')
      ]
    },
    'Inflation': {
      objectives: ['Define inflation and its effect on purchasing power.', 'Connect inflation to real returns.'],
      questions: [
        mcq('q1', 'Purchasing power', 'When inflation rises, a fixed amount of cash…',
          ['Buys more', 'Buys less', 'Is unchanged', 'Earns interest'], 1,
          'Inflation erodes purchasing power, so cash buys less over time.'),
        mcq('q2', 'Real vs nominal return', 'A 5% return with 3% inflation gives a real return of about…',
          ['8%', '5%', '2%', '0%'], 2, 'Real return ≈ nominal return minus inflation: 5% − 3% = 2%.'),
        mcq('q3', 'Inflation causes', 'Inflation often rises when…',
          ['Demand outpaces supply', 'Prices are fixed', 'Money is scarce', 'Growth stops'], 0,
          'When demand outpaces supply, prices tend to rise.'),
        mcq('q4', 'Cash and inflation', 'Holding only cash during high inflation is risky because…',
          ['Cash earns too much', 'Its value erodes', 'It is volatile', 'It is taxed twice'], 1,
          'Cash loses real value as prices climb.'),
        teachback('q5', 'Inflation explain', 'Explain in your own words how inflation affects savings.',
          'Explain that inflation erodes the purchasing power of money over time.')
      ]
    },
    'Bond prices and yields': {
      objectives: ['Describe the inverse price/yield relationship.', 'Explain why existing bond prices move with rates.'],
      questions: [
        mcq('q1', 'Price/yield relationship', 'A bond’s price and its yield move…',
          ['Together', 'In opposite directions', 'Independently', 'Only with inflation'], 1,
          'Price and yield are inversely related.'),
        mcq('q2', 'Rates fall', 'If market rates fall, an existing bond’s price usually…',
          ['Falls', 'Rises', 'Is unchanged', 'Goes to zero'], 1,
          'Its higher coupon becomes more attractive, so price rises.'),
        mcq('q3', 'Rates rise', 'If market rates rise, an existing bond’s price usually…',
          ['Falls', 'Rises', 'Is unchanged', 'Doubles'], 0,
          'New bonds pay more, so the old bond is worth less — price falls.'),
        mcq('q4', 'Why prices move', 'Existing bond prices change because…',
          ['Coupons change', 'New bonds offer different rates', 'Maturity changes', 'Taxes change'], 1,
          'The fixed coupon is repriced against newly available yields.'),
        teachback('q5', 'Bond prices explain', 'Why do bond prices rise when yields fall? Explain in your own words.',
          'Explain the inverse relationship between bond prices and yields.')
      ]
    },
    'Interest rates and growth stocks': {
      objectives: ['Explain how rates affect growth-stock valuations.'],
      questions: [
        mcq('q1', 'Rates & valuations', 'Rising interest rates tend to pressure growth stocks because…',
          ['Future profits are discounted more', 'They pay no dividends', 'They are small', 'They are foreign'], 0,
          'Higher rates discount far-off future earnings more heavily.'),
        mcq('q2', 'Growth vs value', 'Growth stocks are valued mostly on…',
          ['Past dividends', 'Expected future earnings', 'Book value', 'Current cash'], 1,
          'Their value leans on earnings expected well into the future.'),
        mcq('q3', 'Discounting', 'A higher discount rate makes future cash flows worth…',
          ['More today', 'Less today', 'The same', 'Nothing'], 1,
          'Higher discount rates reduce the present value of future cash flows.'),
        mcq('q4', 'Rate cuts', 'Falling rates often help growth stocks because…',
          ['Earnings are guaranteed', 'Future profits are discounted less', 'They become value stocks', 'Dividends rise'], 1,
          'Lower rates lift the present value of future earnings.'),
        teachback('q5', 'Rates & growth explain', 'Explain why growth stocks are sensitive to interest rates.',
          'Explain how discounting future earnings links rates to growth-stock valuations.')
      ]
    },
    'Risk and volatility': {
      objectives: ['Distinguish risk from volatility.', 'Interpret volatility sensibly.'],
      questions: [
        mcq('q1', 'Volatility meaning', 'Volatility measures…',
          ['Guaranteed loss', 'How much prices swing', 'Total return', 'Dividend size'], 1,
          'Volatility captures the size of price swings.'),
        mcq('q2', 'Risk vs volatility', 'Higher volatility means…',
          ['Certain loss', 'A wider range of outcomes', 'Higher returns', 'No risk'], 1,
          'It means outcomes are more spread out — not a guaranteed loss.'),
        mcq('q3', 'Time horizon', 'Short-term volatility matters less when you…',
          ['Trade daily', 'Invest for the long term', 'Use leverage', 'Hold only cash'], 1,
          'Long horizons let short-term swings average out.'),
        mcq('q4', 'Managing risk', 'A common way to manage volatility is…',
          ['Concentrate holdings', 'Diversify', 'Avoid all stocks', 'Time the market'], 1,
          'Diversification dampens the impact of any single swing.'),
        teachback('q5', 'Risk explain', 'In your own words, how are risk and volatility related but different?',
          'Explain that volatility describes price swings while risk is the chance of a bad outcome.')
      ]
    },
    'Correlation': {
      objectives: ['Define correlation and its role in a portfolio.'],
      questions: [
        mcq('q1', 'Correlation meaning', 'Two assets are positively correlated when they…',
          ['Move oppositely', 'Move together', 'Never move', 'Are identical'], 1,
          'Positive correlation means they tend to move in the same direction.'),
        mcq('q2', 'Diversification benefit', 'For diversification, you want assets that are…',
          ['Highly correlated', 'Low or negatively correlated', 'Identical', 'All the same sector'], 1,
          'Low/negative correlation lets holdings offset each other.'),
        mcq('q3', 'Negative correlation', 'Negatively correlated assets tend to…',
          ['Rise and fall together', 'Move in opposite directions', 'Stay flat', 'Track inflation'], 1,
          'When one falls, the other tends to rise.'),
        mcq('q4', 'Correlation range', 'A correlation of +1 means…',
          ['No relationship', 'Perfect opposite movement', 'Perfect same-direction movement', 'Random movement'], 2,
          '+1 is perfect positive correlation — they move in lockstep.'),
        teachback('q5', 'Correlation explain', 'Explain why low correlation between holdings is useful.',
          'Explain how low correlation between assets reduces overall portfolio risk.')
      ]
    },
    'Reading a market chart': {
      objectives: ['Read basic price-chart features.'],
      questions: [
        mcq('q1', 'Trend', 'A chart sloping up over time shows…',
          ['A downtrend', 'An uptrend', 'No trend', 'High dividends'], 1,
          'A rising slope indicates an uptrend.'),
        mcq('q2', 'Axes', 'On a typical price chart, the vertical axis shows…',
          ['Time', 'Price', 'Volume only', 'Dividends'], 1,
          'Price is on the vertical axis; time runs along the horizontal axis.'),
        mcq('q3', 'Volatility on a chart', 'Lots of sharp up-and-down spikes suggest…',
          ['Low volatility', 'High volatility', 'No trading', 'A dividend'], 1,
          'Frequent large swings indicate higher volatility.'),
        mcq('q4', 'Percent vs price', 'To compare two stocks at different prices, it helps to view…',
          ['Raw price', 'Percent change', 'Share count', 'Ticker length'], 1,
          'Percent change normalizes for different starting prices.'),
        teachback('q5', 'Chart reading explain', 'Explain what an upward-sloping price chart tells you.',
          'Explain that a rising chart shows an uptrend and how to read price vs time.')
      ]
    }
  };

  function presetUnitFor(topic, difficulty) {
    var preset = PRESETS[topic];
    if (!preset) return null;
    var hasTeach = preset.questions.some(function (q) { return q.type === 'teachback'; });
    var questions = preset.questions.map(function (q) { return Object.assign({}, q); });
    var mcqCount = questions.filter(function (q) { return q.type !== 'teachback'; }).length;
    var extras = [
      {
        skill: topic + ' application',
        prompt: 'Which statement best applies ' + topic.toLowerCase() + ' in a real financial decision?',
        choices: ['Use the concept to compare tradeoffs before acting', 'Ignore the concept when the decision feels urgent', 'Assume the same answer works in every situation', 'Focus only on short-term price movement'],
        explanation: topic + ' is most useful when it helps compare realistic tradeoffs before making a decision.'
      },
      {
        skill: topic + ' misconception check',
        prompt: 'Which habit can lead someone to misunderstand ' + topic.toLowerCase() + '?',
        choices: ['Checking what the concept can and cannot explain', 'Treating one rule as true in every situation', 'Comparing more than one possible outcome', 'Looking for the main tradeoff'],
        explanation: 'A common mistake is treating a useful concept as if it explains every situation.'
      },
      {
        skill: topic + ' scenario',
        prompt: 'A learner has to explain ' + topic.toLowerCase() + ' to a friend. What should they do first?',
        choices: ['Start with a concrete example', 'Use technical terms before explaining the idea', 'Skip the tradeoff', 'Promise a guaranteed outcome'],
        explanation: 'A concrete example makes the concept easier to test and explain.'
      }
    ];
    var extraIdx = 0;
    while (questions.length < 8 && extraIdx < extras.length) {
      var extra = extras[extraIdx++];
      var n = ++mcqCount;
      questions.splice(Math.max(0, questions.length - (hasTeach ? 1 : 0)), 0, mcq(
        'qcur' + n,
        extra.skill,
        extra.prompt,
        extra.choices,
        0,
        extra.explanation
      ));
    }
    return {
      title: topic + ' Concept Challenge',
      topic: topic,
      difficulty: difficulty || 'beginner',
      objectives: preset.objectives.slice(),
      teachItBack: hasTeach,
      questions: questions,
      source: 'preset'
    };
  }

})(typeof window !== 'undefined' ? window : this);
