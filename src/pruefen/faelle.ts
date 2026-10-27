/**
 * The Prüfseite's cases: every template, opened as it opens (its Standard),
 * and then one axis at a time against that Standard — Beschriftung, Anybook,
 * Rahmen, Lochen, Papier — plus the pairs that act on each other
 * (Beschriftung × Anybook, Rahmen × Anybook, a Wortkarten card size × Anybook).
 * Not the full product: what is wanted is every difference that shows, once.
 *
 * Pure data, no DOM: the sheet itself is the app's, drawn by `Printing` and
 * `PrintSheet.svelte` exactly as the preview draws it.
 */
import type { CollectionKind, PrintSettings, Sentence, Slot } from '../core/types.ts';
import { COLLECTION_KINDS, DEFAULT_PRINT_SETTINGS } from '../core/types.ts';
import { openPrint, settle, TEMPLATES } from '../app/templates.ts';
import type { PrintBoard, PrintGame, PrintSong, PrintTalk } from '../ui/printSheet.ts';

export const VORLAGE: Record<CollectionKind, string> = {
  satzstreifen: 'Satzstreifen', wortkarten: 'Wortkarten', tafel: 'Tafel', einkaufsliste: 'Einkaufsliste',
  rezept: 'Rezept', lied: 'Lied', plauderbuch: 'Plauderbuch', spiel: 'Spiel',
};

/* ------------------------------------------------------------ symbols -- */

/**
 * A test symbol: a square that fills its picture box to the edge — a dark
 * line round it, its diagonals, its word's first letter — so a ruler finds
 * the box exactly, which a real pictogram with air round it would hide.
 */
const FARBEN = ['#f6d6c8', '#d7e8f7', '#dcefd2', '#f4e7b8', '#e8d9f2', '#f7d4e2', '#d3efeb', '#efe0cf'];
function testSymbol(word: string, at: number): string {
  const fill = FARBEN[at % FARBEN.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">`
    + `<rect x="6" y="6" width="488" height="488" rx="10" fill="${fill}" stroke="#2b2522" stroke-width="12"/>`
    + `<path d="M6 6 494 494M494 6 6 494" stroke="#2b2522" stroke-opacity=".18" stroke-width="6"/>`
    + `<circle cx="250" cy="250" r="120" fill="#fff" stroke="#2b2522" stroke-width="8"/>`
    + `<text x="250" y="300" text-anchor="middle" font-family="sans-serif" font-size="150" font-weight="700" fill="#2b2522">${word.charAt(0).toUpperCase()}</text>`
    + `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Every word the cases use, with its symbol's id and URL. */
export const SYMBOLE = new Map<string, { id: string; url: string }>();

let next = 0;
function slot(word: string): Slot {
  if (!SYMBOLE.has(word)) {
    const at = SYMBOLE.size;
    SYMBOLE.set(word, { id: `pruef-${at}`, url: testSymbol(word, at) });
  }
  next += 1;
  return {
    id: `s${next}`, sourceToken: word, concept: word.toLowerCase(), origin: 'manual',
    choice: { arasaac: SYMBOLE.get(word)!.id }, candidates: {},
  };
}

function sentence(words: string[], extra: Partial<Sentence> = {}): Sentence {
  next += 1;
  return {
    id: `z${next}`, normalizedInput: words.join(' ').toLowerCase(), rawInput: words.join(' '),
    slots: words.map(slot), collectionId: 'pruefen', createdAt: next, updatedAt: next, ...extra,
  };
}

/* ----------------------------------------------------------- material -- */

export interface Material {
  name: string;
  sentences: Sentence[];
  board?: PrintBoard;
  song?: PrintSong;
  talk?: PrintTalk;
  game?: PrintGame;
}

const KOERPER = ['Fuß', 'Kopf', 'Hand', 'Haare', 'Blume', 'Topf', 'Zahnbürste', 'Gummistiefel'];

function material(which: CollectionKind): Material {
  switch (which) {
    case 'satzstreifen':
      return { name: 'Morgens', sentences: [sentence(['ich', 'putzen', 'Zahnbürste']), sentence(['wir', 'gehen', 'Garten', 'Blume'])] };
    case 'wortkarten':
      return { name: 'Körper', sentences: KOERPER.map((word) => sentence([word])) };
    case 'tafel': {
      const cards = KOERPER.map((word) => sentence([word]));
      const cells: (Sentence | null)[] = [cards[0]!, cards[1]!, null, cards[2]!, cards[3]!, null, cards[4]!, cards[5]!, cards[6]!, null, cards[7]!, null];
      return { name: 'Körper-Tafel', sentences: cards, board: { cols: 4, rows: 3, cells } };
    }
    case 'einkaufsliste':
      return { name: 'Markt', sentences: ['Ei', 'Milch', 'Mehl', 'Apfel', 'Brot', 'Käse'].map((word) => sentence([word])) };
    case 'rezept':
      return {
        name: 'Pfannkuchen',
        sentences: [
          sentence(['Ei'], { part: 'zutat' }), sentence(['Mehl'], { part: 'zutat' }), sentence(['Milch'], { part: 'zutat' }),
          sentence(['Schüssel'], { part: 'hilfsmittel' }), sentence(['Schneebesen'], { part: 'hilfsmittel' }),
          sentence(['Ei', 'Schüssel', 'rühren'], { part: 'schritt' }), sentence(['Pfanne', 'backen'], { part: 'schritt' }),
        ],
      };
    case 'lied': {
      const s1 = [sentence(['ich', 'gehen', 'Garten']), sentence(['Blume', 'sehen'])];
      const r = [sentence(['klatschen', 'Hand']), sentence(['stampfen', 'Fuß'])];
      const s2 = [sentence(['Sonne', 'scheinen', 'Garten'])];
      return {
        name: 'Gartenlied', sentences: [...s1, ...r, ...s2],
        song: {
          parts: [
            { kind: 'strophe', n: 1, first: true, lines: s1 },
            { kind: 'refrain', n: 1, first: true, lines: r },
            { kind: 'strophe', n: 2, first: true, lines: s2 },
            { kind: 'refrain', n: 1, first: false, lines: r },
          ],
        },
      };
    }
    case 'plauderbuch': {
      const question = sentence(['spielen'], { rawInput: 'Was hast du gespielt?' });
      const sayings = ['Ball', 'Garten', 'Blume', 'Topf', 'Zahnbürste', 'Gummistiefel'].map((word) => sentence([word]));
      return { name: 'Kita', sentences: [question, ...sayings], talk: { pages: [{ question, sayings }] } };
    }
    case 'spiel': {
      const pairs = [['Fuß', 'Schuh'], ['Zahnbürste', 'Zahnpasta'], ['Kopf', 'Mütze'], ['Blume', 'Gießkanne'], ['Hand', 'Handschuh']];
      const rows = pairs.map(([a, b]) => ({ zellen: [{ karte: sentence([a!]), platz: false }, { karte: sentence([b!]), platz: true }] }));
      return { name: 'Was gehört zusammen?', sentences: rows.flatMap((row) => row.zellen.map((z) => z.karte)), game: { rows } };
    }
  }
}

/* -------------------------------------------------------------- cases -- */

/** What a case is compared with, and by which rule. */
export interface Vergleich {
  mit: string;
  /** `anybook`: the circle never makes a symbol bigger. `wort`: with the word the card grows, the symbol does not shrink. */
  regel: 'anybook' | 'wort';
}

export interface Fall {
  id: string;
  vorlage: CollectionKind;
  /** What is set against the Standard, in words. Empty for the Standard itself. */
  name: string;
  standard: boolean;
  settings: PrintSettings;
  material: Material;
  vergleiche: Vergleich[];
  /**
   * The card's size is given (a Tafel's field, Wortkarten by card or grid):
   * there the word can only take from the symbol, and that is no finding.
   */
  gegeben: boolean;
}

/** Each template's grid, where it has one: a Tafel's is its own. */
const gridOf = (which: CollectionKind, m: Material) => (which === 'tafel' && m.board ? { cols: m.board.cols, rows: m.board.rows } : null);

/** The settings a template opens on, as a new material of it would. */
export function standardOf(which: CollectionKind, m: Material): PrintSettings {
  return openPrint(which, DEFAULT_PRINT_SETTINGS, {}, gridOf(which, m));
}

function faelleFor(which: CollectionKind): Fall[] {
  const m = material(which);
  const std = standardOf(which, m);
  const offer = TEMPLATES[which].offers(std);
  const out: Fall[] = [];
  const add = (key: string, name: string, over: Partial<PrintSettings>, vergleiche: Vergleich[] = []): string => {
    const id = `${which}-${key}`;
    const settings = settle(which, { ...std, ...over }, gridOf(which, m));
    out.push({
      id, vorlage: which, name, standard: key === 'standard', material: m, vergleiche, settings,
      gegeben: which === 'tafel' || (which === 'wortkarten' && settings.sheetFit !== 'size'),
    });
    return id;
  };

  const standard = add('standard', '', {});

  /* Beschriftung × Anybook: every state of the word, each with the circle
     off, above and over. The circle is compared with its state's „aus", the
     word with the state without it, circle for circle. */
  const words: { key: string; name: string; labelled: boolean; over: Partial<PrintSettings> }[] = [
    { key: 'std', name: '', labelled: std.showLabel, over: {} },
  ];
  if (offer.label && std.showLabel) {
    words.push({ key: 'wort-aus', name: 'ohne Wort', labelled: false, over: { showLabel: false } });
    const flip = std.labelPosition === 'above' ? 'below' : 'above';
    words.push({ key: 'wort-oben', name: flip === 'above' ? 'Wort oben' : 'Wort unten', labelled: true, over: { labelPosition: flip } });
  } else if (offer.label) {
    words.push({ key: 'wort-unten', name: 'mit Wort unten', labelled: true, over: { showLabel: true, labelPosition: 'below' } });
    words.push({ key: 'wort-oben', name: 'mit Wort oben', labelled: true, over: { showLabel: true, labelPosition: 'above' } });
  }
  const idOf = (word: string, any: 'above' | 'over' | null): string =>
    any ? `${which}-${word}-any-${any}` : word === 'std' ? standard : `${which}-${word}`;
  for (const word of words) {
    if (word.key !== 'std') add(word.key, word.name, word.over);
    for (const place of ['above', 'over'] as const) {
      const name = [word.name, place === 'above' ? 'Anybook darüber' : 'Anybook überlappend'].filter(Boolean).join(' · ');
      add(`${word.key}-any-${place}`, name, { ...word.over, anybookCircle: true, anybookPlace: place },
        [{ mit: idOf(word.key, null), regel: 'anybook' }]);
    }
  }
  const bare = words.find((word) => !word.labelled);
  if (bare) {
    for (const word of words.filter((one) => one.labelled)) {
      for (const any of [null, 'above', 'over'] as const) {
        out.find((fall) => fall.id === idOf(word.key, any))!.vergleiche.push({ mit: idOf(bare.key, any), regel: 'wort' });
      }
    }
  }

  /* Rahmen, and the circle on a framed card, which has rules of its own. */
  if (offer.frames) {
    const framed = std.cardBorderMm > 0;
    const over = { cardBorderMm: framed ? 0 : 0.5 };
    const base = add('rahmen', framed ? 'ohne Rahmen' : 'Rahmen 0,5 mm', over);
    for (const place of ['above', 'over'] as const) {
      add(`rahmen-any-${place}`, `${framed ? 'ohne Rahmen' : 'Rahmen'} · Anybook ${place === 'above' ? 'darüber' : 'überlappend'}`,
        { ...over, anybookCircle: true, anybookPlace: place }, [{ mit: base, regel: 'anybook' }]);
    }
  }

  /* Wortkarten: the card's size given, and the grid — both „given" cards,
     where the circle takes room from the symbol rather than growing the card. */
  if (offer.size?.kind === 'cards') {
    for (const [key, name, over] of [
      ['karte', 'Karte 50 mm', { sheetFit: 'card', cardWidthMm: 50, cardHeightMm: null }],
      ['raster', 'Raster 4 × 3', { sheetFit: 'grid', gridCols: 4, gridRows: 3 }],
    ] as const) {
      const base = add(key, name, over);
      add(`${key}-wort-aus`, `${name} · ohne Wort`, { ...over, showLabel: false });
      out.find((fall) => fall.id === base)!.vergleiche.push({ mit: `${which}-${key}-wort-aus`, regel: 'wort' });
      for (const place of ['above', 'over'] as const) {
        add(`${key}-any-${place}`, `${name} · Anybook ${place === 'above' ? 'darüber' : 'überlappend'}`,
          { ...over, anybookCircle: true, anybookPlace: place }, [{ mit: base, regel: 'anybook' }]);
      }
    }
  }

  /* Template-own axes that change a card's place or shape. */
  if (offer.sentence) {
    add('satz-aus', std.showSentenceText ? 'ohne Satz' : 'mit Satz', { showSentenceText: !std.showSentenceText });
    add('satz-unten', 'Satz unten', { showSentenceText: true, sentencePosition: 'below' });
  }
  if (offer.stripFrame) add('streifenrahmen', 'Streifenrahmen', { stripFrame: true });

  /* Lochen: 2 cm off the punched edge. */
  add('lochen-links', 'Lochen links', { punch: 'left' });
  add('lochen-oben', 'Lochen oben', { punch: 'top' });

  /* The paper the template offers. */
  const otherPaper = std.paper === 'a4' ? 'a5' : 'a4';
  const otherSide = std.orientation === 'landscape' ? 'portrait' : 'landscape';
  const sideName = (side: string) => (side === 'landscape' ? 'quer' : 'hoch');
  if (offer.paper === true || offer.paper === 'size') {
    const base = add('papier', otherPaper.toUpperCase(), { paper: otherPaper });
    /* On the other paper the word is compared again: the Spiel's geometry scales. */
    if (offer.label && std.showLabel) {
      add('papier-wort-aus', `${otherPaper.toUpperCase()} · ohne Wort`, { paper: otherPaper, showLabel: false });
      out.find((fall) => fall.id === base)!.vergleiche.push({ mit: `${which}-papier-wort-aus`, regel: 'wort' });
    }
  }
  if (offer.paper === true || offer.paper === 'side') add('seite', sideName(otherSide), { orientation: otherSide });
  if (offer.paper === true) add('papier-seite', `${otherPaper.toUpperCase()} ${sideName(otherSide)}`, { paper: otherPaper, orientation: otherSide });

  return out;
}

export const FAELLE: Fall[] = COLLECTION_KINDS.flatMap(faelleFor);

/* ----------------------------------------------------- the Standard, said -- */

const ja = (on: boolean) => (on ? 'an' : 'aus');
const mm = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} mm`;

/**
 * A template's Standard, as the lines that decide how its cards come out:
 * label, value, and whether the template set it itself (rather than taking
 * what every material starts from).
 */
export function standardLines(which: CollectionKind): { name: string; value: string; own: boolean }[] {
  const m = material(which);
  const std = standardOf(which, m);
  const offer = TEMPLATES[which].offers(std);
  const plain = DEFAULT_PRINT_SETTINGS;
  const line = (name: string, keys: (keyof PrintSettings)[], value: string) =>
    ({ name, value, own: keys.some((key) => std[key] !== plain[key]) });
  const lines = [
    line('Papier', ['paper', 'orientation'], `${std.paper.toUpperCase()} ${std.orientation === 'landscape' ? 'quer' : 'hoch'}`),
  ];
  if (offer.size?.kind === 'symbol' || which === 'einkaufsliste') lines.push(line('Symbol', ['symbolSizeMm'], mm(std.symbolSizeMm)));
  if (offer.size?.kind === 'cards') {
    lines.push(line('Größe', ['sheetFit'], std.sheetFit === 'size' ? `nach Symbol (${mm(std.symbolSizeMm)})` : std.sheetFit === 'card' ? `Karte ${mm(std.cardWidthMm)}` : `Raster ${std.gridCols} × ${std.gridRows}`));
  }
  if (offer.size?.kind === 'board') lines.push(line('Symbol', [], which === 'tafel' ? 'aus dem Feld' : 'rechnet das Blatt'));
  lines.push(line('Rand', ['cutMarginMm'], mm(std.cutMarginMm)));
  lines.push(line('Wort', ['showLabel', 'labelPosition', 'labelSizePt'],
    std.showLabel ? `${std.labelPosition === 'above' ? 'oben' : 'unten'}, ${std.labelSizePt} pt` : 'aus'));
  if (offer.frames || which === 'einkaufsliste') {
    lines.push(line('Rahmen', ['cardBorderMm', 'cardRadiusMm'], std.cardBorderMm > 0 ? `${mm(std.cardBorderMm)}, Ecken ${mm(std.cardRadiusMm)}` : 'aus'));
  }
  if (offer.background) lines.push(line('Hintergrund', ['cardBackground'], std.cardBackground ?? 'aus'));
  if (offer.cutLines || which === 'einkaufsliste') lines.push(line('Schnittlinien', ['showCutLines'], ja(std.showCutLines)));
  lines.push(line('Anybook', ['anybookCircle', 'anybookPlace'],
    `${ja(std.anybookCircle)} (wenn an: ${std.anybookPlace === 'above' ? 'darüber' : 'überlappend'})`));
  lines.push(line('Lochen', ['punch'], std.punch ?? 'aus'));
  lines.push(line('Titel', ['showCollectionTitle', 'titleSizePt', 'titleLine'],
    std.showCollectionTitle ? `${std.titleSizePt} pt${std.titleLine ? ', Linie' : ''}` : 'aus'));
  if (offer.sentence) lines.push(line('Satz', ['showSentenceText', 'sentencePosition'], std.showSentenceText ? (std.sentencePosition === 'above' ? 'oben' : 'unten') : 'aus'));
  if (offer.pageNumbers) lines.push(line('Seitenzahlen', ['showPageNumbers'], ja(std.showPageNumbers)));
  return lines;
}
