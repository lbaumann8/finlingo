(function (global) {
  'use strict';

  function chevron(direction, className) {
    const path = direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6';
    const classes = ['ui-chevron', className || ''].filter(Boolean).join(' ');
    return `<svg class="${classes}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
  }

  // SquarePen (Lucide) — the single canonical "new chat / compose" icon.
  // One complete component: a fully-closed rounded square outline plus the
  // pen stroke. Rendered with fill:none + stroke:currentColor by CSS.
  function squarePen(className) {
    const classes = ['ui-squarepen', className || ''].filter(Boolean).join(' ');
    return `<svg class="${classes}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
      `<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>` +
      `<path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>` +
      `</svg>`;
  }

  global.FinLingoIcons = Object.freeze({
    chevron,
    left(className) { return chevron('left', className); },
    right(className) { return chevron('right', className); },
    squarePen
  });
})(window);
