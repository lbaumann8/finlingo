// FinLingo — swipe-to-delete for AI-created units in the Learn / My Units list.
//
// Only AI cards (`.v3-unit-card-ai[data-ai-swipe="1"]`) are swipeable; preset
// cards are rendered as a different element and never match, so they can never
// be swiped or deleted. Touch + mouse + pen are all handled via Pointer Events.
//
// Interaction model:
//   • Swipe left → the surface follows the finger and reveals a dark-red trash
//     action behind the card's right edge.
//   • Short swipe (>= half the action width) → snap open; tap the trash to
//     delete, or tap the card / tap elsewhere to close. Only one card stays
//     open at a time.
//   • Full swipe (>= ~72% of the card width, or a fast left flick) → the card
//     animates off, the unit is deleted, and an Undo snackbar appears (no modal).
//   • Right swipe is constrained — the card never moves past its resting spot.
//
// Vertical vs horizontal: we lock direction on first meaningful movement and
// only own the gesture when |dx| > |dy|; otherwise we bail out and let the page
// scroll. `touch-action: pan-y` on the surface keeps native vertical scrolling.
//
// Deletion + Undo live in LearnUnitDelete (below), keyed by the stable unitId.

(function (global) {
  'use strict';

  var ACTION_W = 76;          // px of delete action revealed when snapped open
  var DRAG_MIN = 8;           // px of movement before a press counts as a drag
  var DIR_LOCK = 6;           // px before we commit to horizontal vs vertical
  var FULL_FRACTION = 0.72;   // >= 72% of card width  => full-swipe delete
  var FLICK_VELOCITY = 0.9;   // px/ms left flick that also triggers full swipe
  var OPEN_SNAP = ACTION_W * 0.5;
  var CLICK_SUPPRESS_MS = 400;

  // Active drag state.
  var card = null, surface = null, unitId = null;
  var startX = 0, startY = 0, baseOffset = 0, offset = 0;
  var dir = null;             // null | 'h' | 'v'
  var dragging = false, moved = false, lastX = 0, lastT = 0, velocity = 0;
  var openCard = null;        // the single card currently held open
  var suppressClickUntil = 0;

  function now(e) { return (e && e.timeStamp) || (global.performance ? performance.now() : Date.now()); }
  function getSurface(c) { return c ? c.querySelector('.v3-swipe-surface') : null; }
  function setOffset(s, x) { if (s) s.style.transform = 'translateX(' + x + 'px)'; }
  function isSwipeCard(c) { return c && c.getAttribute && c.getAttribute('data-ai-swipe') === '1'; }

  function pruneOpen() {
    if (openCard && !document.contains(openCard)) openCard = null; // dropped by a re-render
  }
  function closeOpen(except) {
    pruneOpen();
    if (openCard && openCard !== except) {
      var s = getSurface(openCard);
      if (s) { s.classList.remove('is-dragging'); setOffset(s, 0); }
      openCard = null;
    }
  }
  function openCardTo(c) {
    var s = getSurface(c);
    if (!s) return;
    closeOpen(c);
    s.classList.remove('is-dragging');
    setOffset(s, -ACTION_W);
    openCard = c;
  }
  function closeCard(c) {
    var s = getSurface(c);
    if (!s) return;
    s.classList.remove('is-dragging');
    setOffset(s, 0);
    if (openCard === c) openCard = null;
  }

  function onDown(e) {
    if (e.button != null && e.button !== 0) return;   // primary / touch / pen only
    var t = e.target;
    var c = (t.closest && t.closest('[data-ai-swipe="1"]')) || null;
    pruneOpen();

    // A press anywhere except the open card closes it.
    if (openCard && c !== openCard) closeOpen(null);

    // The trash button and the keyboard-delete button own their own clicks.
    if (t.closest && (t.closest('.v3-swipe-trash') || t.closest('.v3-unit-kbd-delete'))) return;
    if (!isSwipeCard(c)) return;

    card = c; surface = getSurface(c); unitId = c.getAttribute('data-unit-id');
    if (!surface) { card = null; return; }

    baseOffset = (openCard === c) ? -ACTION_W : 0;
    offset = baseOffset;
    startX = lastX = e.clientX; startY = e.clientY;
    lastT = now(e); velocity = 0; dir = null; dragging = true; moved = false;

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  }

  function onMove(e) {
    if (!dragging || !surface) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;

    if (dir === null) {
      if (Math.abs(dx) < DIR_LOCK && Math.abs(dy) < DIR_LOCK) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        dir = 'h';
        surface.classList.add('is-dragging');
      } else {
        dir = 'v';            // vertical intent — let the page scroll, drop the gesture
        endDrag();
        return;
      }
    }
    if (dir !== 'h') return;

    if (e.cancelable) e.preventDefault();   // we own this horizontal gesture
    moved = moved || Math.abs(dx) > DRAG_MIN;

    var t = now(e), dt = t - lastT;
    if (dt > 0) velocity = (e.clientX - lastX) / dt;
    lastX = e.clientX; lastT = t;

    var w = card.offsetWidth || 320;
    offset = baseOffset + dx;
    if (offset > 0) offset = 0;            // never past the resting position (right)
    if (offset < -w) offset = -w;          // never beyond the card width (left)
    setOffset(surface, offset);
  }

  function onUp(e) {
    if (!dragging) { endDrag(); return; }
    var c = card, id = unitId, s = surface, off = offset;
    var w = (c && c.offsetWidth) || 320;

    if (dir === 'h') {
      var fullByDistance = off <= -(w * FULL_FRACTION);
      var fullByFlick = velocity <= -FLICK_VELOCITY && off <= -(ACTION_W + 8);
      suppressClickUntil = now(e) + CLICK_SUPPRESS_MS;
      if (s) s.classList.remove('is-dragging');
      endDrag();
      if (fullByDistance || fullByFlick) {
        if (openCard === c) openCard = null;
        global.LearnUnitDelete.request(id, { via: 'swipe', card: c });
      } else if (off <= -OPEN_SNAP) {
        openCardTo(c);
      } else {
        closeCard(c);
      }
      return;
    }

    // No horizontal drag → a tap. If the card is open, close it and swallow the
    // click so the unit doesn't open; otherwise let the click open the unit.
    if (openCard === c) {
      suppressClickUntil = now(e) + CLICK_SUPPRESS_MS;
      closeCard(c);
    }
    endDrag();
  }

  function endDrag() {
    dragging = false; dir = null;
    document.removeEventListener('pointermove', onMove, { passive: false });
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
    card = null; surface = null; unitId = null;
  }

  // A swipe must never be read as a click that opens the unit.
  function onClickCapture(e) {
    if (now(e) >= suppressClickUntil) return;
    var c = e.target.closest && e.target.closest('[data-ai-swipe="1"]');
    if (!c) return;
    if (e.target.closest('.v3-swipe-trash') || e.target.closest('.v3-unit-kbd-delete')) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function init() {
    if (init._done) return; init._done = true;
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', onClickCapture, true);
  }

  global.LearnSwipe = {
    init: init,
    closeAll: function () { closeOpen(null); },
    reset: function () { openCard = null; }
  };

  // ── Deletion + Undo ────────────────────────────────────────────────────
  // Captures a full snapshot (unit object, its list position, and raw progress)
  // before removing it from storage, so Undo restores the unit, its place in the
  // list, lessons, recap data, progress and completion exactly. The original
  // chat, other units, and preset units are never touched.
  var LearnUnitDelete = {
    _pending: null,   // { unitId, unit, index, progress, title }
    _timer: null,
    _snack: null,
    UNDO_MS: 5000,

    request: function (id, opts) {
      opts = opts || {};
      if (!id) return;
      // A new deletion supersedes a still-pending one — finalize that first.
      if (this._pending && this._pending.unitId !== id) this._commit();
      if (this._pending && this._pending.unitId === id) return;

      var CU = global.CoachUnits, MP = global.MicroProgress;
      if (!CU || typeof CU.all !== 'function') return;

      var all = CU.all();
      var index = (typeof CU.indexOf === 'function') ? CU.indexOf(id)
        : all.findIndex(function (u) { return u && u.id === id; });
      var unit = (index >= 0) ? all[index] : (CU.get ? CU.get(id) : null);
      if (!unit) return;   // not an AI unit / already gone — never delete a preset
      var progress = (MP && typeof MP.getRaw === 'function') ? MP.getRaw(id) : null;
      var title = unit.title || 'Unit';

      try {
        CU.remove(id);
        if (MP && typeof MP.remove === 'function') MP.remove(id);
      } catch (err) {
        // Deletion failed — put everything back and surface a gentle message.
        try {
          if (typeof CU.restoreAt === 'function') CU.restoreAt(unit, index);
          if (progress && MP && typeof MP.restore === 'function') MP.restore(id, progress);
        } catch (_) {}
        this._reset();
        if (typeof global.renderPath === 'function') global.renderPath();
        if (typeof global.showToast === 'function') global.showToast("Couldn't delete this unit. Try again.", 'error');
        return;
      }

      this._pending = { unitId: id, unit: unit, index: index, progress: progress, title: title };
      var self = this;
      var afterRemove = function () {
        self._rerender(id);
        self._announce(title + ' deleted. Undo available.');
        self._showSnackbar();
      };

      if (opts.card && opts.card.parentNode) this._collapse(opts.card, afterRemove);
      else afterRemove();
    },

    fromTrash: function (event, id) {
      if (event) { event.stopPropagation(); event.preventDefault(); }
      var c = (event && event.currentTarget && event.currentTarget.closest)
        ? event.currentTarget.closest('[data-ai-swipe="1"]') : null;
      if (global.LearnSwipe) global.LearnSwipe.reset();
      this.request(id, { via: 'trash', card: c });
    },

    _rerender: function (id) {
      try {
        var openId = (global.MicroUnit && global.MicroUnit.currentUnitId) ? global.MicroUnit.currentUnitId() : null;
        var screen = document.getElementById('microLessonScreen');
        if (openId === id && screen && screen.classList.contains('active') && typeof global.showLearn === 'function') {
          global.showLearn({ resetScroll: true });
          return;
        }
      } catch (_) {}
      if (typeof global.renderPath === 'function') global.renderPath();
    },

    _collapse: function (cardEl, done) {
      var surf = cardEl.querySelector('.v3-swipe-surface');
      var h = cardEl.offsetHeight;
      if (surf) { surf.classList.remove('is-dragging'); surf.style.transform = 'translateX(-110%)'; }
      cardEl.style.height = h + 'px';
      cardEl.classList.add('is-removing');
      void cardEl.offsetHeight;            // reflow so the collapse animates
      requestAnimationFrame(function () {
        cardEl.style.height = '0px';
        cardEl.style.opacity = '0';
        cardEl.style.marginTop = '0px';
        cardEl.style.marginBottom = '0px';
      });
      var called = false;
      var finish = function () { if (called) return; called = true; done(); };
      cardEl.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, 360);             // fallback if transitionend never fires
    },

    _showSnackbar: function () {
      var self = this;
      var snack = document.getElementById('unitSnackbar');
      if (!snack) {
        snack = document.createElement('div');
        snack.id = 'unitSnackbar';
        snack.className = 'unit-snackbar';
        snack.setAttribute('role', 'status');
        document.body.appendChild(snack);
      }
      snack.innerHTML = '<span>Unit deleted</span><button type="button" class="unit-snackbar-undo">Undo</button>';
      snack.querySelector('.unit-snackbar-undo').onclick = function () { self.undo(); };
      this._snack = snack;
      void snack.offsetWidth;
      snack.classList.add('show');
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(function () { self._commit(); }, this.UNDO_MS);
    },

    _hideSnackbar: function () { if (this._snack) this._snack.classList.remove('show'); },

    undo: function () {
      if (!this._pending) { this._hideSnackbar(); return; }
      var p = this._pending;
      var CU = global.CoachUnits, MP = global.MicroProgress;
      try {
        if (CU && typeof CU.restoreAt === 'function') CU.restoreAt(p.unit, p.index);
        else if (CU && typeof CU.save === 'function') CU.save(p.unit);
        if (p.progress && MP && typeof MP.restore === 'function') MP.restore(p.unitId, p.progress);
      } catch (_) {}
      this._reset();
      if (typeof global.renderPath === 'function') global.renderPath();
      this._announce((p.title || 'Unit') + ' restored.');
    },

    // Undo window elapsed (or superseded): the unit is already gone from
    // storage, so just drop the in-memory snapshot and hide the snackbar.
    _commit: function () { this._reset(); },

    _reset: function () {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      this._hideSnackbar();
      this._pending = null;
    },

    _announce: function (msg) {
      var live = document.getElementById('a11ySwipeLive');
      if (!live) {
        live = document.createElement('div');
        live.id = 'a11ySwipeLive';
        live.setAttribute('aria-live', 'polite');
        live.setAttribute('role', 'status');
        live.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
        document.body.appendChild(live);
      }
      live.textContent = '';
      setTimeout(function () { live.textContent = msg; }, 30);
    }
  };

  global.LearnUnitDelete = LearnUnitDelete;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
