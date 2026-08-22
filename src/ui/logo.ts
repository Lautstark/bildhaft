import { svg } from './dom.ts';

/** The bildhaft mark: a speech bubble with a face. Inherits colour from `fill`. */
export function logo(size = 26): SVGElement {
  return svg('svg',
    { viewBox: '0 0 512 512', width: size, height: size, role: 'img', 'aria-label': 'bildhaft', focusable: 'false' },
    svg('path', {
      d: 'M 128 76 H 384 Q 436 76 436 128 V 272 Q 436 324 384 324 H 314 L 256 408 L 198 324 H 128 Q 76 324 76 272 V 128 Q 76 76 128 76 Z',
      fill: 'var(--accent)',
    }),
    svg('circle', { cx: 200, cy: 178, r: 22, fill: '#fff' }),
    svg('circle', { cx: 312, cy: 178, r: 22, fill: '#fff' }),
    svg('path', {
      d: 'M 190 226 C 190 288 322 288 322 226',
      fill: 'none', stroke: '#fff', 'stroke-width': 26, 'stroke-linecap': 'round',
    }),
  );
}

/** Stroked icons, all on the same 24-grid so they sit alike beside text. */
function icon(size: number, ...paths: SVGElement[]): SVGElement {
  return svg('svg',
    { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': 2, 'aria-hidden': 'true' },
    ...paths);
}

export const icons = {
  menu: () => icon(17, svg('path', { d: 'M4 7h16M4 12h16M4 17h16', 'stroke-linecap': 'round' })),
  menuMobile: () => icon(18, svg('path', { d: 'M4 7h16M4 12h16M4 17h16', 'stroke-linecap': 'round' })),
  chevronLeft: () => icon(16, svg('path', { d: 'M15 6l-6 6 6 6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
  printer: () => icon(15, svg('path', {
    d: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
  trash: () => icon(15, svg('path', {
    d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
  arrow: () => svg('svg',
    { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    svg('path', { d: 'M5 12h13M12 5l7 7-7 7' })),
  dots: () => svg('svg',
    { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' },
    svg('circle', { cx: 5, cy: 12, r: 1.9 }),
    svg('circle', { cx: 12, cy: 12, r: 1.9 }),
    svg('circle', { cx: 19, cy: 12, r: 1.9 })),
};
