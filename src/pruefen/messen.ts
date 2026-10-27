/**
 * What the Prüfseite reads off a drawn sheet: every card, field and picture
 * on it in millimetres — the box, the symbol as it is drawn, the word's
 * actual text, the Anybook circle — and what is wrong with each.
 *
 * Read off the sheet, never worked out from the settings: the point is to
 * see what the printer will get, and only the sheet knows that.
 */
import { PX_PER_MM } from '../ui/printSheet.ts';
import type { Fall } from './faelle.ts';

export interface Rect { x: number; y: number; w: number; h: number }

export type Schwere = 'fehler' | 'hinweis' | 'ok';
/**
 * `frage`: which of the three questions the page answers at its top this
 * speaks to — 1 the Spiel's symbol on both sheets, 2 the Anybook circle,
 * 3 the word growing the card rather than shrinking the symbol.
 */
export interface Befund { schwere: Schwere; text: string; frage?: 1 | 2 | 3 }

/** One thing on the sheet that a card is laid on, cut out or drawn as. */
export interface Stueck {
  art: string;
  box: Rect;
  /** The picture as drawn: a square inside its box, where `object-fit` puts it. */
  sym: Rect | null;
  /** The word's text itself, not its line. */
  wort: Rect | null;
  kreis: Rect | null;
  befunde: Befund[];
}

export interface Messung {
  stuecke: Stueck[];
  befunde: Befund[];
  seiten: number;
}

const TOL = 0.25;

const overlap = (a: Rect, b: Rect): boolean =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > TOL && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > TOL;
const outside = (inner: Rect, outer: Rect): boolean =>
  inner.x < outer.x - TOL || inner.y < outer.y - TOL
  || inner.x + inner.w > outer.x + outer.w + TOL || inner.y + inner.h > outer.y + outer.h + TOL;

export const mmText = (n: number): string => n.toFixed(1).replace('.', ',');

/** What kinds of things a sheet holds, and where their parts are. */
const ARTEN: { sel: string; box?: string; art: (el: Element) => string; sym: string | null; wort: string | null; kreis: (el: Element) => Element | null }[] = [
  {
    sel: '.ps-card:not(.ps-card--empty)',
    art: (el) => (el.closest('.ps-cut') ? 'Schnittkarte' : el.closest('.ps-place') ? 'Platz' : el.closest('.ps-tafel') ? 'Feld' : 'Karte'),
    sym: '.ps-card__img img', wort: '.ps-card__label',
    kreis: (el) => el.querySelector('.ps-card__img'),
  },
  { sel: '.ps-spiel__bild', art: () => 'Spielbild', sym: 'img', wort: '.ps-spiel__wort', kreis: (el) => el.querySelector('.ps-title__pic') },
  {
    /* The card itself, not the cell with the air round it: laminated, it is the field. */
    sel: '.ps-talk-cut__cell', box: '.ps-talk__card',
    art: (el) => (el.closest('.ps-spiel-cut') ? 'Spielkarte' : 'Plauderkarte'),
    sym: 'img', wort: '.ps-talk__word', kreis: (el) => el.querySelector('.ps-title__pic'),
  },
  { sel: '.ps-spiel__rows .ps-talk__field', art: () => 'Klettfeld', sym: null, wort: null, kreis: () => null },
  { sel: '.ps-spiel__lager .ps-talk__field', art: () => 'Ablagefeld', sym: null, wort: null, kreis: () => null },
  { sel: '.ps-talk__fields .ps-talk__field', art: () => 'Antwortfeld', sym: null, wort: null, kreis: () => null },
];

export function messen(holder: HTMLElement, fall: Fall): Messung {
  const sheet = holder.firstElementChild as HTMLElement;
  const origin = sheet.getBoundingClientRect();
  const scale = origin.width / sheet.offsetWidth || 1;
  const mm = (r: DOMRect): Rect => ({
    x: (r.left - origin.left) / scale / PX_PER_MM, y: (r.top - origin.top) / scale / PX_PER_MM,
    w: r.width / scale / PX_PER_MM, h: r.height / scale / PX_PER_MM,
  });

  /* The picture as drawn: square, in its box where object-position puts it. */
  const drawn = (img: HTMLImageElement): Rect => {
    const box = mm(img.getBoundingClientRect());
    const edge = Math.min(box.w, box.h);
    const [px, py] = getComputedStyle(img).objectPosition.split(' ').map((part) => parseFloat(part) / 100);
    return { x: box.x + (box.w - edge) * (px ?? 0.5), y: box.y + (box.h - edge) * (py ?? 0.5), w: edge, h: edge };
  };
  /* The text, not the line it stands on: a word is narrower than its box. */
  const text = (el: Element): Rect | null => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (rects.length === 0) return null;
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return mm(new DOMRect(left, top, right - left, bottom - top));
  };
  /* The circle is the symbol box's ::after, which has no box of its own to
     ask: its place is read off its computed style, in the host's padding box. */
  /* The code's circle is its own element in the symbol box (AnyCode.svelte). */
  const circle = (host: Element | null): Rect | null => {
    const code = host?.querySelector(':scope > .ps-any');
    if (!(code instanceof HTMLElement) || getComputedStyle(code).display === 'none') return null;
    return mm(code.getBoundingClientRect());
  };

  const stuecke: Stueck[] = [];
  for (const kind of ARTEN) {
    for (const el of holder.querySelectorAll(kind.sel)) {
      const box = mm((kind.box ? el.querySelector(kind.box) ?? el : el).getBoundingClientRect());
      const img = kind.sym ? el.querySelector<HTMLImageElement>(kind.sym) : null;
      const sym = img ? drawn(img) : null;
      const label = kind.wort ? el.querySelector(kind.wort) : null;
      const wort = label ? text(label) : null;
      const kreis = circle(kind.kreis(el));
      const befunde: Befund[] = [];
      const any = fall.settings.anybookCircle ? 2 as const : undefined;
      if (sym && wort && overlap(sym, wort)) befunde.push({ schwere: 'fehler', text: 'Symbol liegt über der Beschriftung', frage: any });
      if (kreis && wort && overlap(kreis, wort)) befunde.push({ schwere: 'fehler', text: 'Anybook-Kreis liegt über der Beschriftung', frage: 2 });
      if (sym && outside(sym, box)) befunde.push({ schwere: 'fehler', text: 'Symbol ragt aus der Karte', frage: any });
      if (wort && outside(wort, box)) {
        befunde.push(fall.eigeneMasse
          ? { schwere: 'hinweis', text: 'Beschriftung passt bei diesen Maßen nicht auf die Karte' }
          : { schwere: 'fehler', text: 'Beschriftung ragt aus der Karte' });
      }
      if (kreis && sym && fall.settings.anybookPlace === 'above' && overlap(kreis, sym)) {
        befunde.push({ schwere: 'hinweis', text: 'Kreis „darüber“ berührt das Symbol' });
      }
      stuecke.push({ art: kind.art(el), box, sym, wort, kreis, befunde });
    }
  }

  const befunde: Befund[] = [];
  /* A Spiel's symbol is the one size on its sheet and on its card. */
  const bild = median(stuecke.filter((s) => s.art === 'Spielbild').map((s) => s.sym?.w ?? 0));
  const karte = median(stuecke.filter((s) => s.art === 'Spielkarte').map((s) => s.sym?.w ?? 0));
  if (bild && karte) {
    befunde.push(Math.abs(bild - karte) > TOL
      ? { schwere: 'fehler', text: `Symbol auf Spielbogen und Kartenbogen ungleich (Spielbogen ${mmText(bild)} mm, Kartenbogen ${mmText(karte)} mm)`, frage: 1 }
      : { schwere: 'ok', text: `Symbol auf Spielbogen und Kartenbogen gleich: ${mmText(bild)} mm`, frage: 1 });
  }
  /* Cards of one kind that came out unlike: a word that wrapped, mostly. */
  for (const art of new Set(stuecke.map((s) => s.art))) {
    const of = stuecke.filter((s) => s.art === art);
    const hs = of.map((s) => s.box.h);
    if (Math.max(...hs) - Math.min(...hs) > 0.5) {
      befunde.push({ schwere: 'hinweis', text: `${art}: ungleich hoch (${mmText(Math.min(...hs))}–${mmText(Math.max(...hs))} mm)` });
    }
    const ss = of.flatMap((s) => (s.sym ? [s.sym.w] : []));
    if (ss.length > 1 && Math.max(...ss) - Math.min(...ss) > TOL) {
      befunde.push({ schwere: 'hinweis', text: `${art}: Symbole ungleich groß (${mmText(Math.min(...ss))}–${mmText(Math.max(...ss))} mm)` });
    }
  }
  for (const stueck of stuecke) {
    for (const befund of stueck.befunde) {
      const text = `${stueck.art}: ${befund.text}`;
      if (!befunde.some((one) => one.text === text)) befunde.push({ ...befund, text });
    }
  }
  return { stuecke, befunde, seiten: holder.querySelectorAll('.ps-paper').length };
}

export function median(values: number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** The kinds a sheet holds, each with its usual size: what the tile's legend says. */
export function arten(messung: Messung): { art: string; n: number; w: number; h: number; sym: number }[] {
  return [...new Set(messung.stuecke.map((s) => s.art))].map((art) => {
    const of = messung.stuecke.filter((s) => s.art === art);
    return {
      art, n: of.length,
      w: median(of.map((s) => s.box.w)), h: median(of.map((s) => s.box.h)),
      sym: median(of.map((s) => s.sym?.w ?? 0)),
    };
  });
}

/**
 * The findings between two sheets: the circle against the sheet without it,
 * the word against the sheet without it. Asked of each kind the two share.
 */
export function vergleichen(fall: Fall, mine: Messung, all: Map<string, Messung>): Befund[] {
  const out: Befund[] = [];
  for (const { mit, regel } of fall.vergleiche) {
    const other = all.get(mit);
    if (!other) continue;
    const theirs = new Map(arten(other).map((a) => [a.art, a]));
    for (const a of arten(mine)) {
      const b = theirs.get(a.art);
      if (!b || !a.sym || !b.sym) continue;
      const d = a.sym - b.sym;
      const grew = a.h - b.h;
      if (regel === 'anybook') {
        if (d > TOL) out.push({ schwere: 'fehler', text: `${a.art}: Anybook macht das Symbol größer (${mmText(b.sym)} → ${mmText(a.sym)} mm)`, frage: 2 });
        else if (d < -TOL) out.push({ schwere: 'hinweis', text: `${a.art}: Anybook nimmt dem Symbol ${mmText(-d)} mm (${mmText(b.sym)} → ${mmText(a.sym)})`, frage: 2 });
        else out.push({ schwere: 'ok', text: `${a.art}: Symbol mit Anybook gleich groß (${mmText(a.sym)} mm)`, frage: 2 });
        if (grew > TOL) out.push({ schwere: 'hinweis', text: `${a.art}: mit Anybook ${mmText(grew)} mm höher` });
      } else {
        if (d < -TOL) {
          out.push({
            schwere: fall.gegeben ? 'hinweis' : 'fehler', frage: 3,
            text: `${a.art}: mit Beschriftung schrumpft das Symbol (${mmText(b.sym)} → ${mmText(a.sym)} mm)`
              + (grew > TOL ? `, Karte ${mmText(grew)} mm höher` : ', die Karte wird nicht höher')
              + (fall.gegeben ? ' — Kartengröße ist vorgegeben' : ''),
          });
        } else if (d > TOL) {
          out.push({ schwere: 'hinweis', text: `${a.art}: mit Beschriftung ist das Symbol größer (${mmText(b.sym)} → ${mmText(a.sym)} mm)`, frage: 3 });
        } else {
          out.push({
            schwere: 'ok', frage: 3,
            text: `${a.art}: Symbol mit Beschriftung gleich groß (${mmText(a.sym)} mm)${grew > TOL ? `, Karte ${mmText(grew)} mm höher` : ''}`,
          });
        }
      }
    }
  }
  return out;
}
