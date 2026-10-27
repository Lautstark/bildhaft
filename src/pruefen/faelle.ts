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
import type { AnybookPlace, CollectionKind, Orientation, PaperSize, PrintSettings, PunchEdge, Sentence, SheetFit, Slot } from '../core/types.ts';
import { COLLECTION_KINDS, DEFAULT_PRINT_SETTINGS } from '../core/types.ts';
import { openPrint, settle, TEMPLATES } from '../app/templates.ts';
import type { PrintBoard, PrintGame, PrintSong, PrintTalk } from '../ui/printSheet.ts';

export const VORLAGE: Record<CollectionKind, string> = {
  satzstreifen: 'Satzstreifen', wortkarten: 'Wortkarten', tafel: 'Tafel', einkaufsliste: 'Einkaufsliste',
  rezept: 'Rezept', lied: 'Lied', plauderbuch: 'Plauderbuch', spiel: 'Spiel',
};

/* ------------------------------------------------------------ symbols -- */

/**
 * A test symbol: a small drawing in a pictogram's manner — black outline,
 * flat colours, reaching nearly to the edge of its square as an ARASAAC or
 * METACOM picture does — so the sheet looks as it will in print.
 */
const O = 'stroke="#1d1918" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"';
const BILDER = [
  /* sun */ `<g ${O}><path d="M250 20v70M250 410v70M20 250h70M410 250h70M88 88l50 50M362 362l50 50M412 88l-50 50M138 362l-50 50"/><circle cx="250" cy="250" r="130" fill="#ffd23f"/></g>`,
  /* house */ `<g ${O}><path d="M60 230 250 50l190 180" fill="#e2553f"/><path d="M95 220v250h310V220" fill="#f5e6c8"/><path d="M215 470V350h70v120" fill="#8a5a3b"/><rect x="140" y="270" width="60" height="55" fill="#9fd3f2"/><rect x="300" y="270" width="60" height="55" fill="#9fd3f2"/></g>`,
  /* ball */ `<g ${O}><circle cx="250" cy="250" r="225" fill="#4f8fe0"/><path d="M25 250h450M250 25c-90 70-90 380 0 450M250 25c90 70 90 380 0 450" fill="none"/></g>`,
  /* tree */ `<g ${O}><path d="M215 470V320h70v150z" fill="#8a5a3b"/><circle cx="250" cy="190" r="165" fill="#5cae4b"/></g>`,
  /* cup */ `<g ${O}><path d="M70 120h290v230a80 80 0 0 1-80 80H150a80 80 0 0 1-80-80z" fill="#f08a4b"/><path d="M360 170h40a55 55 0 0 1 0 110h-40" fill="none"/><path d="M40 470h360" /></g>`,
  /* flower */ `<g ${O}><path d="M250 470V270" fill="none"/><path d="M250 400c-60-10-100-50-110-90 50 0 95 30 110 90zM250 380c50-10 90-45 100-85-50 0-90 30-100 85z" fill="#5cae4b"/><g fill="#e95a9b"><circle cx="250" cy="90" r="65"/><circle cx="170" cy="160" r="65"/><circle cx="330" cy="160" r="65"/><circle cx="200" cy="245" r="60"/><circle cx="300" cy="245" r="60"/></g><circle cx="250" cy="175" r="48" fill="#ffd23f"/></g>`,
  /* car */ `<g ${O}><path d="M30 330v-80l60-10 60-90h170l70 90 60 10v80z" fill="#e2553f"/><path d="M175 175h60v70h-95zM265 175h45l50 70h-95z" fill="#9fd3f2"/><circle cx="130" cy="340" r="55" fill="#4a4442"/><circle cx="370" cy="340" r="55" fill="#4a4442"/></g>`,
  /* star */ `<g ${O}><path d="M250 25l66 150 160 15-121 106 36 158-141-83-141 83 36-158L24 190l160-15z" fill="#ffd23f"/></g>`,
];
function testSymbol(at: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">${BILDER[at % BILDER.length]}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Every word the cases use, with its symbol's id and URL. */
export const SYMBOLE = new Map<string, { id: string; url: string }>();

let next = 0;
function slot(word: string): Slot {
  if (!SYMBOLE.has(word)) {
    const at = SYMBOLE.size;
    SYMBOLE.set(word, { id: `pruef-${at}`, url: testSymbol(at) });
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

/**
 * A combination, said the way the app's menus say it: which paper, the word
 * (off, under, over), the Anybook circle (off, above, over), the frame,
 * punching — and where a template has them, a Wortkarten size and a strip's
 * sentence. A case is a template and one of these.
 */
export interface Wahl {
  papier: PaperSize;
  seite: Orientation;
  wort: 'aus' | 'below' | 'above';
  anybook: 'aus' | AnybookPlace;
  rahmen: boolean;
  lochen: PunchEdge | null;
  groesse: SheetFit;
  satz: 'aus' | 'above' | 'below';
}

/** One switch on the Prüfseite: what it is called, and its values in the app's words. */
export interface Achse<K extends keyof Wahl = keyof Wahl> {
  key: K;
  name: string;
  werte: { wert: Wahl[K]; name: string }[];
}

/** What a case is compared with, and by which rule. */
export interface Vergleich {
  mit: string;
  /** `anybook`: the circle never makes a symbol bigger. `wort`: with the word the card grows, the symbol does not shrink. */
  regel: 'anybook' | 'wort';
}

export interface Fall {
  id: string;
  vorlage: CollectionKind;
  wahl: Wahl;
  /** What differs from the Standard, in words. Empty for the Standard itself. */
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

const materials = new Map<CollectionKind, Material>();
const materialOf = (which: CollectionKind): Material => {
  if (!materials.has(which)) materials.set(which, material(which));
  return materials.get(which)!;
};

/** The settings a template opens on, as a new material of it would. */
export function standardOf(which: CollectionKind, m: Material = materialOf(which)): PrintSettings {
  return openPrint(which, DEFAULT_PRINT_SETTINGS, {}, gridOf(which, m));
}

/** The Standard, as a combination. */
export function standardWahl(which: CollectionKind): Wahl {
  const std = standardOf(which);
  return {
    papier: std.paper, seite: std.orientation,
    wort: std.showLabel ? std.labelPosition : 'aus',
    anybook: std.anybookCircle ? std.anybookPlace : 'aus',
    rahmen: std.cardBorderMm > 0, lochen: std.punch, groesse: std.sheetFit,
    satz: std.showSentenceText ? std.sentencePosition : 'aus',
  };
}

/** The switches a template has, in the order its menus have them. */
export function achsen(which: CollectionKind): Achse[] {
  const offer = TEMPLATES[which].offers(standardOf(which));
  const out: Achse[] = [];
  const add = <K extends keyof Wahl>(key: K, name: string, werte: { wert: Wahl[K]; name: string }[]) => out.push({ key, name, werte } as unknown as Achse);
  if (offer.paper === true || offer.paper === 'size') add('papier', 'Papier', [{ wert: 'a4', name: 'A4' }, { wert: 'a5', name: 'A5' }]);
  if (offer.paper === true || offer.paper === 'side') add('seite', 'Ausrichtung', [{ wert: 'portrait', name: 'hoch' }, { wert: 'landscape', name: 'quer' }]);
  if (offer.size?.kind === 'cards') add('groesse', 'Größe', [{ wert: 'size', name: 'nach Symbol' }, { wert: 'card', name: 'Karte 50 mm' }, { wert: 'grid', name: 'Raster 4 × 3' }]);
  if (offer.label) add('wort', 'Wort', [{ wert: 'aus', name: 'aus' }, { wert: 'below', name: 'unten' }, { wert: 'above', name: 'oben' }]);
  add('anybook', 'Anybook', [{ wert: 'aus', name: 'aus' }, { wert: 'above', name: 'darüber' }, { wert: 'over', name: 'überlappend' }]);
  if (offer.frames) add('rahmen', 'Rahmen', [{ wert: false, name: 'aus' }, { wert: true, name: 'an' }]);
  if (offer.sentence) add('satz', 'Satz', [{ wert: 'aus', name: 'aus' }, { wert: 'above', name: 'oben' }, { wert: 'below', name: 'unten' }]);
  add('lochen', 'Lochen', [{ wert: null, name: 'aus' }, { wert: 'left', name: 'links' }, { wert: 'top', name: 'oben' }]);
  return out;
}

const idOf = (which: CollectionKind, w: Wahl): string =>
  [which, w.papier, w.seite, w.wort, w.anybook, w.rahmen ? 'rahmen' : 'ohne', w.lochen ?? 'nicht', w.groesse, w.satz].join('-');

/** The combination in words, against the Standard: „Wort oben · Anybook darüber". */
export function nameOf(which: CollectionKind, w: Wahl): string {
  const std = standardWahl(which);
  return achsen(which).filter((achse) => w[achse.key] !== std[achse.key]).map((achse) => {
    const wert = achse.werte.find((one) => one.wert === w[achse.key])?.name ?? '';
    return `${achse.name} ${wert}`;
  }).join(' · ');
}

const faelle = new Map<string, Fall>();

/** The case of a template in a combination — made once, so its sheet is measured once. */
export function fallFor(which: CollectionKind, w: Wahl): Fall {
  const id = idOf(which, w);
  const known = faelle.get(id);
  if (known) return known;
  const m = materialOf(which);
  const std = standardOf(which, m);
  const settings = settle(which, {
    ...std,
    paper: w.papier, orientation: w.seite,
    showLabel: w.wort !== 'aus', labelPosition: w.wort === 'aus' ? std.labelPosition : w.wort,
    anybookCircle: w.anybook !== 'aus', anybookPlace: w.anybook === 'aus' ? std.anybookPlace : w.anybook,
    cardBorderMm: w.rahmen ? (std.cardBorderMm || 0.5) : 0,
    punch: w.lochen,
    sheetFit: w.groesse,
    ...(w.groesse === 'card' && std.sheetFit !== 'card' ? { cardWidthMm: 50, cardHeightMm: null } : {}),
    ...(w.groesse === 'grid' && std.sheetFit !== 'grid' ? { gridCols: 4, gridRows: 3 } : {}),
    showSentenceText: w.satz !== 'aus', sentencePosition: w.satz === 'aus' ? std.sentencePosition : w.satz,
  }, gridOf(which, m));
  const name = nameOf(which, w);
  const offered = new Set(achsen(which).map((achse) => achse.key));
  const vergleiche: Vergleich[] = [];
  /* The circle against the same sheet without it; the word against the same sheet without it. */
  if (w.anybook !== 'aus') vergleiche.push({ mit: idOf(which, { ...w, anybook: 'aus' }), regel: 'anybook' });
  if (offered.has('wort') && w.wort !== 'aus') vergleiche.push({ mit: idOf(which, { ...w, wort: 'aus' }), regel: 'wort' });
  const fall: Fall = {
    id, vorlage: which, wahl: w, name, standard: name === '', settings, material: m, vergleiche,
    gegeben: which === 'tafel' || (which === 'wortkarten' && settings.sheetFit !== 'size'),
  };
  faelle.set(id, fall);
  return fall;
}

/** What a case is compared with, as cases: what has to be measured beside it. */
export const zwillinge = (fall: Fall): Fall[] => fall.vergleiche.map((v) => faelle.get(v.mit) ?? twinOf(fall, v));
function twinOf(fall: Fall, v: Vergleich): Fall {
  return fallFor(fall.vorlage, { ...fall.wahl, ...(v.regel === 'anybook' ? { anybook: 'aus' as const } : { wort: 'aus' as const }) });
}

/**
 * The cases measured for the problem list: the Standard, every switch moved
 * on its own, and the switches that act on each other moved together — the
 * word with the circle, the frame with the circle, a Wortkarten size with the
 * word and the circle, the paper with the word. Each with what it is compared
 * with, so every comparison has both sides.
 */
function faelleFor(which: CollectionKind): Fall[] {
  const std = standardWahl(which);
  const axes = achsen(which);
  const werte = (key: keyof Wahl) => axes.find((achse) => achse.key === key)?.werte.map((one) => one.wert) ?? [std[key]];
  const out = new Map<string, Fall>();
  const add = (w: Wahl) => {
    const fall = fallFor(which, w);
    out.set(fall.id, fall);
    for (const twin of zwillinge(fall)) out.set(twin.id, twin);
  };
  add(std);
  for (const achse of axes) for (const { wert } of achse.werte) add({ ...std, [achse.key]: wert });
  const pairs: [keyof Wahl, keyof Wahl][] = [['wort', 'anybook'], ['rahmen', 'anybook'], ['groesse', 'anybook'], ['groesse', 'wort'], ['papier', 'wort'], ['seite', 'wort']];
  for (const [a, b] of pairs) for (const x of werte(a)) for (const y of werte(b)) add({ ...std, [a]: x, [b]: y });
  return [...out.values()];
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
  const std = standardOf(which);
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
