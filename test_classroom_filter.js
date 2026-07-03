// ============================================================================
// test_classroom_filter.js
// Regression test for the Classroom "Choose questions" type filter.
//
// Guards the Teach-it-back filter bug: selecting "Teach it back" must keep that
// filter active (and its question visible) even after the question list is
// forced to re-render — it must NOT snap back to the "All" filter. The single
// internal value for Teach it back is 'teachback' everywhere; only the visible
// label ever reads "Teach it back".
//
// Runs headless under Node with a tiny DOM shim — no test framework required:
//     node test_classroom_filter.js
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Minimal DOM shim ────────────────────────────────────────────────────────
// Only what candidateSelection()/setQuestionFilter() touch: a #classroomRoot
// whose innerHTML we capture, plus querySelector lookups driven by that HTML.
function makeStubEl() {
  return {
    innerHTML: '',
    scrollTop: 0,
    scrollLeft: 0,
    offsetLeft: 40,
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    scrollIntoView() {},
    getAttribute() { return null; },
    querySelector(sel) { return matchIn(this.innerHTML, sel); },
    querySelectorAll() { return []; },
  };
}

// Resolve the handful of selectors the code queries against a chunk of HTML.
function matchIn(html, sel) {
  html = html || '';
  if (sel === '.cl-question-select') return html.indexOf('cl-question-select') >= 0 ? makeStubEl() : null;
  if (sel === '.cl-candidate-list') return html.indexOf('cl-candidate-list') >= 0 ? makeStubEl() : null;
  if (sel === '.cl-filter-row') return html.indexOf('cl-filter-row') >= 0 ? makeStubEl() : null;
  if (sel === '.cl-filter-row button.is-active') return html.indexOf('is-active') >= 0 ? makeStubEl() : null;
  return null;
}

const root = makeStubEl();
globalThis.window = globalThis;
globalThis.document = {
  getElementById(id) { return id === 'classroomRoot' ? root : null; },
  querySelector(sel) { return matchIn(root.innerHTML, sel); },
};

// ── Load the app modules (browser IIFEs that attach to window) ──────────────
function load(file) {
  const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
  vm.runInThisContext(src, { filename: file });
}
load('classroomData.js');
load('classroom.js');

const UI = globalThis.window.ClassroomUI;

// ── Assertion helpers ───────────────────────────────────────────────────────
let failures = 0;
function check(label, cond) {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) failures++;
}
// Is the filter pill for `value` the active one in the current render?
function pillActive(value) {
  // <button ... class="is-active" onclick="ClassroomUI.setQuestionFilter('teachback')">
  const re = new RegExp('class="is-active"[^>]*setQuestionFilter\\(\'' + value + '\'\\)');
  return re.test(root.innerHTML);
}

// ── Fixture: an assignment with a mix of types incl. one teach-it-back ──────
const ctx = { classroomId: 'c1', title: 'Budgeting basics', mode: 'scratch' };
const unit = {
  title: 'Budgeting basics',
  topic: 'Budgeting',
  difficulty: 'beginner',
  objectives: ['Build a budget'],
  questions: [
    { id: 'q1', type: 'mcq', skill: 'Budgeting fundamentals', prompt: 'What is a budget?', choices: ['A', 'B'], answer: 0 },
    { id: 'q2', type: 'mcq', skill: 'Budgeting application', prompt: 'Apply a budget to this case.', choices: ['A', 'B'], answer: 0 },
    { id: 'qteach', type: 'teachback', skill: 'Budgeting explain', prompt: 'Explain budgeting in your own words.' },
  ],
};

// 1) Open the screen fresh — should default to All.
UI.candidateSelection(unit, ctx);
check('opens on the All filter by default', pillActive('all'));

// 2) Select Teach it back.
UI.setQuestionFilter('teachback');
check('Teach it back pill is active after selecting it', pillActive('teachback'));
check('All pill is NOT active after selecting Teach it back', !pillActive('all'));
check('the teach-it-back question stays visible', root.innerHTML.indexOf('Explain budgeting in your own words.') >= 0);
check('count label reads "Showing 1 Teach it back question"',
  root.innerHTML.indexOf('Showing 1 Teach it back question') >= 0);

// 3) Force the question list to re-render (as edit/reorder/add/delete all do).
//    The filter MUST remain Teach it back — no snap back to All.
UI.candidateSelection(unit, ctx);
check('Teach it back is STILL active after a forced re-render', pillActive('teachback'));
check('does NOT reset to All on re-render', !pillActive('all'));
check('teach-it-back question still visible after re-render', root.innerHTML.indexOf('Explain budgeting in your own words.') >= 0);

// 4) A neutral re-render via the public re-render entry point keeps it too.
UI.setQuestionFilter('teachback');
UI.candidateSelection(unit, ctx);
check('filter survives repeated re-renders', pillActive('teachback') && !pillActive('all'));

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed.');
  process.exit(1);
}
console.log('All classroom filter regression checks passed.');
