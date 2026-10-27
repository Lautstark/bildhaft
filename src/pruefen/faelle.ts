/**
 * The Prüfseite's cases: a template, a material (test data, or one of hers),
 * and a combination of the switches its menus have, starting from the
 * template's Standard. For the problem list the Standard, every switch moved
 * on its own and the switches that act on each other moved together are
 * measured — not the full product, every difference that shows, once.
 *
 * Pure data, no DOM: the sheet itself is the app's, drawn by `Printing` and
 * `PrintSheet.svelte` exactly as the preview draws it.
 */
import type { CollectionKind, PrintSettings, ProviderId, Sentence, Slot } from '../core/types.ts';
import { DEFAULT_PRINT_SETTINGS } from '../core/types.ts';
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

/** What a sheet is printed of: the test data, or one of her materials. */
export interface Material {
  /** `test:<kind>` or the Sammlung's id. */
  id: string;
  /** What the material is called where one is chosen. */
  quelle: string;
  name: string;
  provider: ProviderId;
  sentences: Sentence[];
  /** The title's symbols. */
  pictures?: Slot[];
  board?: PrintBoard;
  song?: PrintSong;
  talk?: PrintTalk;
  game?: PrintGame;
}

const KOERPER = ['Fuß', 'Kopf', 'Hand', 'Haare', 'Blume', 'Topf', 'Zahnbürste', 'Gummistiefel'];


function testMaterial(which: CollectionKind): Omit<Material, 'id' | 'provider' | 'quelle'> {
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


const tests = new Map<CollectionKind, Material>();
/** The test data of a template: made once, so its cases are the same cases on every look. */
export function testdaten(which: CollectionKind): Material {
  if (!tests.has(which)) tests.set(which, { id: `test:${which}`, quelle: 'Testdaten', provider: 'arasaac', ...testMaterial(which) });
  return tests.get(which)!;
}

/* -------------------------------------------------------------- cases -- */

/**
 * One switch, as the app's menus have it (DingBar.svelte): its menu, its
 * name, and either its values — each the settings it stands for — or a
 * number typed in, as the menu's field takes it. Offered where the template
 * offers it (`TEMPLATES[...].offers`), nowhere else.
 */
export type Achse = {
  key: string;
  menu: string;
  name: string;
} & (
  | { art: 'wahl'; werte: { name: string; set: Partial<PrintSettings> }[] }
  | { art: 'zahl'; setting: NumericSetting; min: number; max: number; step: number; unit: string }
  | { art: 'text' }
);
type NumericSetting = 'symbolSizeMm' | 'cutMarginMm' | 'labelSizePt' | 'titleSizePt' | 'cardWidthMm' | 'cardBorderMm' | 'sentenceSizePt';

/** A combination: for each switch the chosen value's place, the number typed, or the title's words. */
export type Wahl = Record<string, number | string>;

/** What a case is compared with, and by which rule. */
export interface Vergleich {
  mit: string;
  /** `anybook`: the circle never makes a symbol bigger. `wort`: with the label the card grows, the symbol does not shrink. */
  regel: 'anybook' | 'wort';
}

export interface Fall {
  id: string;
  vorlage: CollectionKind;
  material: Material;
  wahl: Wahl;
  /** What differs from the Standard, in words. Empty for the Standard itself. */
  name: string;
  standard: boolean;
  settings: PrintSettings;
  /** The name over the sheet: the material's, or the words typed for it. */
  titel: string;
  vergleiche: Vergleich[];
  /**
   * The card's size is given (a Tafel's field, Wortkarten by card or grid):
   * there the label can only take from the symbol, and that is no finding.
   */
  gegeben: boolean;
}

/** Each template's grid, where it has one: a Tafel's is its own. */
const gridOf = (which: CollectionKind, m: Material) => (which === 'tafel' && m.board ? { cols: m.board.cols, rows: m.board.rows } : null);

/** The settings a template opens on, as a new material of it would. */
export function standardOf(which: CollectionKind, m: Material = testdaten(which)): PrintSettings {
  return openPrint(which, DEFAULT_PRINT_SETTINGS, {}, gridOf(which, m));
}

const aus = { name: 'aus' };
const an = { name: 'an' };
const flag = (key: keyof PrintSettings) => [{ ...aus, set: { [key]: false } }, { ...an, set: { [key]: true } }];
export const zahlText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Whether these settings are what a value stands for. */
const is = (settings: PrintSettings, set: Partial<PrintSettings>): boolean =>
  Object.entries(set).every(([key, value]) => settings[key as keyof PrintSettings] === value);

const achsenCache = new WeakMap<Material, Achse[]>();

/** The switches a template has, menu by menu, in the order the menus have them. */
export function achsen(which: CollectionKind, m: Material = testdaten(which)): Achse[] {
  const known = achsenCache.get(m);
  if (known) return known;
  const std = standardOf(which, m);
  const offer = TEMPLATES[which].offers(std);
  const out: Achse[] = [];
  const wahl = (key: string, menu: string, name: string, werte: { name: string; set: Partial<PrintSettings> }[]) =>
    out.push({ key, menu, name, art: 'wahl', werte });
  const zahl = (key: string, menu: string, name: string, setting: NumericSetting, min: number, max: number, step: number, unit: string) =>
    out.push({ key, menu, name, art: 'zahl', setting, min, max, step, unit });

  /* Seite */
  if (offer.paper === true || offer.paper === 'size') wahl('papier', 'Seite', 'Papier', [{ name: 'A4', set: { paper: 'a4' } }, { name: 'A5', set: { paper: 'a5' } }]);
  if (offer.paper === true || offer.paper === 'side') wahl('seite', 'Seite', 'Ausrichtung', [{ name: 'hoch', set: { orientation: 'portrait' } }, { name: 'quer', set: { orientation: 'landscape' } }]);
  if (offer.title === 'pages') {
    wahl('titel', 'Seite', 'Titel drucken', [
      { ...aus, set: { showCollectionTitle: false } },
      { name: 'Erste Seite', set: { showCollectionTitle: true, titleEvery: false } },
      { name: 'Jede Seite', set: { showCollectionTitle: true, titleEvery: true } },
    ]);
  } else if (offer.title) {
    wahl('titel', 'Seite', 'Titel drucken', [{ ...aus, set: { showCollectionTitle: false } }, { ...an, set: { showCollectionTitle: true } }]);
  }
  if (offer.title) {
    out.push({ key: 'titeltext', menu: 'Seite', name: 'Titel', art: 'text' });
    zahl('titelgroesse', 'Seite', 'Titel-Schriftgröße', 'titleSizePt', 8, 40, 1, 'pt');
    wahl('titellinie', 'Seite', 'Linie darunter', flag('titleLine'));
  }
  if (offer.onePerPage) wahl('proSeite', 'Seite', 'Ein Satz pro Seite', flag('onePerPage'));
  if (offer.guide) wahl('anleitung', 'Seite', 'Anleitung drucken', flag('showGuide'));
  wahl('lochen', 'Seite', 'Zum Lochen', [{ ...aus, set: { punch: null } }, { name: 'links', set: { punch: 'left' } }, { name: 'oben', set: { punch: 'top' } }]);
  if (offer.pageNumbers) wahl('seitenzahlen', 'Seite', 'Seitenzahlen drucken', flag('showPageNumbers'));

  /* Symbol */
  if (offer.size?.kind === 'cards') {
    wahl('groesse', 'Symbol', 'Größe nach', [
      { name: 'Symbol', set: { sheetFit: 'size' } },
      { name: 'Karte', set: { sheetFit: 'card' } },
      { name: 'Raster 4 × 3', set: { sheetFit: 'grid', gridCols: 4, gridRows: 3 } },
    ]);
    zahl('kartenbreite', 'Symbol', 'Kartenbreite', 'cardWidthMm', 15, 300, 1, 'mm');
  }
  if (offer.size?.kind === 'symbol' || offer.size?.kind === 'cards') {
    zahl('symbolgroesse', 'Symbol', 'Symbolgröße', 'symbolSizeMm', 10, offer.size.kind === 'symbol' ? offer.size.max : 120, 1, 'mm');
  }
  if (offer.margin) zahl('rand', 'Symbol', 'Rand', 'cutMarginMm', 0, 20, 0.5, 'mm');
  if (offer.label) {
    wahl('beschriftung', 'Symbol', 'Beschriftung drucken', [
      { ...aus, set: { showLabel: false } },
      { name: 'unten', set: { showLabel: true, labelPosition: 'below' } },
      { name: 'oben', set: { showLabel: true, labelPosition: 'above' } },
    ]);
    zahl('schrift', 'Symbol', 'Schriftgröße', 'labelSizePt', 5, 40, 0.5, 'pt');
  }
  if (offer.frames) {
    wahl('rahmen', 'Symbol', 'Rahmen um jede Karte', [{ ...aus, set: { cardBorderMm: 0 } }, { ...an, set: { cardBorderMm: std.cardBorderMm || 0.5 } }]);
  }
  if (offer.background) wahl('hintergrund', 'Symbol', 'Karten (Hintergrund)', [{ ...aus, set: { cardBackground: null } }, { name: 'gelb', set: { cardBackground: '#fff1b3' } }]);
  if (offer.cutLines) wahl('schnitt', 'Symbol', 'Schnittlinien anzeigen', flag('showCutLines'));
  wahl('anybook', 'Symbol', 'Platzhalter für Anybook-Sticker', offer.anybookAbove === false
    ? [{ ...aus, set: { anybookCircle: false } }, { ...an, set: { anybookCircle: true } }]
    : [
      { ...aus, set: { anybookCircle: false } },
      { name: 'darüber', set: { anybookCircle: true, anybookPlace: 'above' } },
      { name: 'überlappend', set: { anybookCircle: true, anybookPlace: 'over' } },
    ]);

  /* The template's own */
  const own = VORLAGE[which];
  if (offer.sentence) {
    wahl('satz', own, 'Satztext drucken', [
      { ...aus, set: { showSentenceText: false } },
      { name: 'oben', set: { showSentenceText: true, sentencePosition: 'above' } },
      { name: 'unten', set: { showSentenceText: true, sentencePosition: 'below' } },
    ]);
    zahl('satzschrift', own, 'Satztext-Schriftgröße', 'sentenceSizePt', 5, 40, 0.5, 'pt');
  }
  if (offer.stripFrame) wahl('streifenrahmen', own, 'Rahmen um den ganzen Streifen', flag('stripFrame'));
  if (offer.songChecks) {
    wahl('ueberschriften', own, 'Überschriften drucken', flag('songHeadings'));
    wahl('wiederholt', own, 'Wiederholte Zeilen nur einmal', flag('songRepeats'));
    wahl('refrain', own, 'Refrain nur einmal ausschreiben', flag('songRefrainOnce'));
  }
  if (offer.freeFields) wahl('leer', own, 'Leere Felder gestrichelt drucken', flag('markFreeFields'));

  /* A Standard none of the values stands for — a Plauderbuch's white card
     ground — is a value of its own, so the Standard can be switched back to. */
  for (const achse of out) {
    if (achse.art !== 'wahl' || achse.werte.some((w) => is(std, w.set))) continue;
    const keys = Object.keys(achse.werte[0]!.set) as (keyof PrintSettings)[];
    const set = Object.fromEntries(keys.map((key) => [key, std[key]])) as Partial<PrintSettings>;
    achse.werte.splice(1, 0, { name: std.cardBackground === '#ffffff' && keys.includes('cardBackground') ? 'weiß' : 'wie Standard', set });
  }

  achsenCache.set(m, out);
  return out;
}

/** The Standard, as a combination: for each switch what the template's settings are. */
export function standardWahl(which: CollectionKind, m: Material = testdaten(which)): Wahl {
  const std = standardOf(which, m);
  return Object.fromEntries(achsen(which, m).map((achse) => [achse.key,
    achse.art === 'wahl' ? Math.max(0, achse.werte.findIndex((w) => is(std, w.set)))
    : achse.art === 'zahl' ? std[achse.setting]
    : m.name]));
}

const idOf = (which: CollectionKind, m: Material, w: Wahl): string =>
  [which, m.id, ...achsen(which, m).map((achse) => `${achse.key}=${w[achse.key] ?? ''}`)].join('|');

/* A switch's name, short enough to stand in a list of combinations. */
const KURZ: Record<string, string> = {
  'Platzhalter für Anybook-Sticker': 'Anybook', 'Rahmen um jede Karte': 'Rahmen', 'Schnittlinien anzeigen': 'Schnittlinien',
  'Rahmen um den ganzen Streifen': 'Streifenrahmen', 'Karten (Hintergrund)': 'Hintergrund',
};
const kurz = (name: string): string => KURZ[name] ?? name.replace(' drucken', '');

/** What a switch is set to, in words. */
export function wertText(achse: Achse, value: number | string | undefined): string {
  if (achse.art === 'wahl') return achse.werte[Number(value ?? 0)]?.name ?? '';
  if (achse.art === 'zahl') return `${zahlText(Number(value))} ${achse.unit}`;
  return `„${String(value ?? '')}“`;
}

/** The combination in words, against the Standard: „Beschriftung: oben · Anybook: darüber". */
export function nameOf(which: CollectionKind, m: Material, w: Wahl): string {
  const std = standardWahl(which, m);
  return achsen(which, m).filter((achse) => w[achse.key] !== std[achse.key])
    .map((achse) => `${kurz(achse.name)}: ${wertText(achse, w[achse.key])}`).join(' · ');
}

const faelle = new Map<string, Fall>();

/** The case of a template, a material and a combination — made once, so its sheet is measured once. */
export function fallFor(which: CollectionKind, m: Material, w: Wahl): Fall {
  const id = idOf(which, m, w);
  const known = faelle.get(id);
  if (known) return known;
  let settings = standardOf(which, m);
  for (const achse of achsen(which, m)) {
    const value = w[achse.key];
    if (achse.art === 'wahl') settings = { ...settings, ...achse.werte[Number(value ?? 0)]!.set };
    else if (achse.art === 'zahl' && Number.isFinite(Number(value))) settings = { ...settings, [achse.setting]: Number(value) };
  }
  settings = settle(which, settings, gridOf(which, m));
  const name = nameOf(which, m, w);
  const vergleiche: Vergleich[] = [];
  /* The circle against the same sheet without it; the label against the same sheet without it. */
  if (w.anybook) vergleiche.push({ mit: idOf(which, m, { ...w, anybook: 0 }), regel: 'anybook' });
  if (w.beschriftung) vergleiche.push({ mit: idOf(which, m, { ...w, beschriftung: 0 }), regel: 'wort' });
  const fall: Fall = {
    id, vorlage: which, material: m, wahl: w, name, standard: name === '', settings, vergleiche,
    titel: typeof w.titeltext === 'string' ? w.titeltext : m.name,
    gegeben: which === 'tafel' || (which === 'wortkarten' && settings.sheetFit !== 'size'),
  };
  faelle.set(id, fall);
  return fall;
}

/** What a case is compared with, as cases: what has to be measured beside it. */
export const zwillinge = (fall: Fall): Fall[] => fall.vergleiche.map((v) =>
  fallFor(fall.vorlage, fall.material, { ...fall.wahl, ...(v.regel === 'anybook' ? { anybook: 0 } : { beschriftung: 0 }) }));

/* Three numbers round the Standard's, as a field in the menu would be turned. */
const proben = (achse: Achse & { art: 'zahl' }, std: number): number[] => {
  const round = (n: number) => Math.min(achse.max, Math.max(achse.min, Math.round(n / achse.step) * achse.step));
  return [...new Set([round(std * 0.5), std, round(std * 1.6)])];
};

/**
 * The cases measured for the problem list: the Standard, every switch moved
 * on its own (a number to a smaller and a bigger one), and the switches that
 * act on a card's shape moved together with the circle and with the label.
 * Each with what it is compared with, so every comparison has both sides.
 */
export function faelleFor(which: CollectionKind, m: Material = testdaten(which)): Fall[] {
  const std = standardWahl(which, m);
  const axes = achsen(which, m);
  const werte = (key: string): (number | string)[] => {
    const achse = axes.find((one) => one.key === key);
    if (!achse) return [];
    if (achse.art === 'wahl') return achse.werte.map((_, at) => at);
    if (achse.art === 'zahl') return proben(achse, Number(std[key]));
    return [];
  };
  const out = new Map<string, Fall>();
  const add = (w: Wahl) => {
    const fall = fallFor(which, m, w);
    out.set(fall.id, fall);
    for (const twin of zwillinge(fall)) out.set(twin.id, twin);
  };
  add(std);
  for (const achse of axes) for (const value of werte(achse.key)) add({ ...std, [achse.key]: value });
  /* The circle with whatever shapes a card; the label with what decides how much room the card has. */
  const pairs: Record<string, string[]> = {
    anybook: ['beschriftung', 'papier', 'seite', 'groesse', 'symbolgroesse', 'rand', 'rahmen'],
    beschriftung: ['papier', 'seite', 'groesse', 'symbolgroesse'],
  };
  for (const [a, with_] of Object.entries(pairs)) {
    for (const b of with_) for (const x of werte(a)) for (const y of werte(b)) add({ ...std, [a]: x, [b]: y });
  }
  return [...out.values()];
}

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
  lines.push(line('Beschriftung', ['showLabel', 'labelPosition', 'labelSizePt'],
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
