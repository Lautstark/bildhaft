/**
 * Core data model.
 *
 * The single most important rule here: persisted data holds *symbol references*,
 * never image data. A stored sentence is a list of concept keys plus the user's
 * per-provider choices. Rendering resolves those references against whichever
 * symbol backend is active right now.
 *
 * That is what makes a METACOM board unstorable-as-pixels by construction, and it
 * is why the same exported JSON renders in ARASAAC for someone without a licence
 * and in METACOM for someone with one.
 */

/**
 * Which symbol sources exist, and what one of their symbols looks like, are
 * bildquelle's to define — it is where the sources live and where the rules that
 * come with them are enforced. Re-exported so the rest of the app keeps taking
 * its model from one place.
 */
import type { Candidate, ProviderId } from '@lautstark/bildquelle';
import type { LanguageCode } from '../i18n/index.ts';
export type { Candidate, ProviderId };

/**
 * How a slot's concept was arrived at — surfaced as a tooltip, nothing more.
 *
 * A runtime array with the type read off it, rather than a bare union, because
 * the tooltip is the one place in this app that composes a text key from a
 * value: `ui.origin_${origin}`. A union is gone by the time the program runs,
 * so nothing could check that every rung has a sentence to show, and a rung
 * without one prints the literal `ui.origin_phrasal` on a tooltip.
 * tests/unit/text-keys.test.ts walks this list against the table.
 */
export const SLOT_ORIGINS = [
  'override', // personal override dictionary
  'lemma', // direct lemma lookup
  'separable', // German: particle reattached, e.g. "räum … auf" -> aufräumen
  'compound', // German: part of a split compound, e.g. Apfelsaft -> Apfel + Saft
  'synonym', // German: resolved via the synonym table
  'phrasal', // English: verb and particle read as one, e.g. "clean up"
  'raw', // matched on the surface form
  'manual', // chosen by hand from the picker, whether added or corrected
  'unmatched', // nothing found; user must pick manually
] as const;

export type SlotOrigin = (typeof SLOT_ORIGINS)[number];

export interface Slot {
  id: string;
  /** The word(s) this slot came from. Shown under the symbol unless `label` is set. */
  sourceToken: string;
  /** The portable concept key. This, not the image, is what travels. */
  concept: string;
  origin: SlotOrigin;

  /**
   * Per-provider choice: providerId -> symbol id, or null for "not chosen yet".
   * Keeping choices per provider means switching backends and switching back
   * does not throw away a manual correction.
   */
  choice: Partial<Record<ProviderId, string | null>>;
  /** Cached candidate lists per provider, so the picker opens instantly. */
  candidates: Partial<Record<ProviderId, Candidate[]>>;

  /**
   * What is printed and shown under the symbol, when the word the sentence used
   * is not the word that should be read. Absent or empty means the source word,
   * which is what every slot had before this existed.
   *
   * Deliberately not a rewrite of `sourceToken`: that word is the key a
   * correction is remembered under and the one the pipeline matched on, so
   * renaming it in place would silently repoint what the app has learned.
   */
  label?: string | null;

  /**
   * METACOM's convention for "nicht": the symbol stays and gets a red cross laid
   * over it, rather than being swapped for a different picture. A property of
   * the slot, not of the symbol, so it survives switching symbol source and
   * travels in an export like every other choice.
   */
  negated?: boolean;

  /**
   * An image of the user's own, by id. Kept in this browser rather than
   * referenced on disk, so moving or deleting the original file changes
   * nothing — which is the whole difference between this and a symbol source.
   *
   * Wins over `choice` while it is set, and switching symbol source does not
   * disturb it: a photo of a particular person is not an ARASAAC or a METACOM
   * answer to the same word, it is the answer.
   */
  ownImage?: string | null;
}

/**
 * The words under a slot's symbol, on screen and on paper. One expression, used
 * by both, because a caption the preview disagrees with is a wasted sheet.
 */
export function slotCaption(slot: Slot): string {
  return slot.label?.trim() || slot.sourceToken || slot.concept;
}

/**
 * An own image is the same picture whatever symbol source is active, so it is
 * addressed by a prefix rather than by a provider. Every caller that already
 * knows how to show a symbol id — rows, the picker, the print sheet — shows one
 * of these without knowing anything new.
 */
export const OWN_PREFIX = 'own:';

export const ownImageId = (id: string): string => `${OWN_PREFIX}${id}`;

/** The id to show for a slot: its own picture if it has one, else its symbol. */
export function symbolIdFor(slot: Slot, provider: ProviderId): string | null {
  if (slot.ownImage) return ownImageId(slot.ownImage);
  return slot.choice[provider] ?? null;
}

/**
 * Every image a set of rows needs before it can be drawn all at once.
 *
 * This exists as one expression for the same reason `slotCaption` does. The
 * print sheet builds a card from `symbolIdFor`, but the dialog that opens it
 * has to resolve the same pictures *first* — a card whose id is not in the
 * cache draws a blank box and fills itself in later, which is too late once
 * the printer has the page. Asking the two questions in two different ways is
 * what broke: the warm step read `slot.choice` directly, so it never named an
 * own picture, and the one image bildhaft actually holds the bytes for was the
 * one that could reach paper empty.
 */
export function symbolIdsIn(
  sentences: readonly Pick<Sentence, 'slots'>[], provider: ProviderId,
): string[] {
  return sentences.flatMap((sentence) => sentence.slots
    .map((slot) => symbolIdFor(slot, provider))
    .filter((id): id is string => Boolean(id)));
}

/** A picture the user supplied. bildhaft holds the bytes; nothing points at a file. */
export interface OwnImage {
  id: string;
  /** The file's name when it was chosen. Shown so a picture can be recognised. */
  name: string;
  type: string;
  blob: Blob;
  createdAt: number;
}

export interface Sentence {
  id: string;
  /** Lowercased, trimmed, punctuation-stripped. The lookup key for reuse. */
  normalizedInput: string;
  /** Exactly what the user typed. */
  rawInput: string;
  slots: Slot[];
  collectionId: string;
  createdAt: number;
  updatedAt: number;

  /**
   * What this row is called, when the words that fetched the symbols are not
   * the words that should name them. Absent or empty means the typed line,
   * which is what every row had before this existed.
   *
   * The same separation `Slot.label` draws, one level up, and for the same
   * reason. A row is not always a sentence: typing „waschen, einseifen,
   * abtrocknen" is a way of *searching* for three symbols to stand in a row,
   * and the row wants to be called „Hände waschen". Rewriting `rawInput` in
   * place would take that away — it is the reuse key (`normalizedInput` is
   * derived from it) and what „Diesen Satz hast du schon übersetzt" matches
   * on, so renaming would quietly repoint what the app has learned.
   *
   * Optional, so nothing needs migrating: a row saved before this field
   * existed is a row that has never been named, which is the same state as one
   * whose name was cleared.
   */
  title?: string | null;
}

/**
 * What a row is called, on screen, on paper and in the sidebar. One expression,
 * used by all of them, for the reason `slotCaption` is one: a name that the
 * printout disagrees with is a wasted sheet.
 */
export function sentenceCaption(sentence: Sentence): string {
  return sentence.title?.trim() || sentence.rawInput;
}

/** A named group of sentences — e.g. one book, one topic, one child. */
export interface Collection {
  id: string;
  /** e.g. "Der Grüffelo" */
  name: string;
  sentenceIds: string[];

  /**
   * Which symbol source this collection is drawn in — or absent, meaning
   * "whatever the setting says", now and whenever the setting moves.
   *
   * Absent is a real state and not a missing value. It is what a collection
   * that has never been asked holds, and it is what one holds again after
   * choosing „Standard folgen" in its sheet; nothing backfills it, at creation
   * or on load, because a collection that has never been told is exactly the
   * one that should follow the setting when the setting moves. That is the
   * difference from mitreden, where `createCollection` copies the default
   * voice in at creation — a voice is baked into a recording, so it has to be
   * fixed at the moment the Sammlung is made. Nothing is baked here.
   *
   * It is safe to hold this on a collection for the reason conventions.md
   * §3.10 gave for exempting it in the first place: a slot stores a concept
   * key and a choice *per provider*, overrides are keyed `${provider}:${token}`
   * and the picture is resolved at render time. So this is a stored *view*
   * preference. Switching it disturbs nothing that was made, and switching
   * back finds every manual correction still there.
   *
   * Which is also why it does not travel in a single-collection export — see
   * `portable()` in db/exportImport.ts. The notice on that file promises it
   * „kann unabhängig davon geteilt werden, welche Symbolsammlung die
   * Empfängerin oder der Empfänger besitzt", and a file that named METACOM as
   * this collection's answer would arrive at somebody without a licence
   * pointing at a source they cannot read. A backup is the other case and does
   * carry it: that file goes back into the library it came from.
   */
  provider?: ProviderId;

  /**
   * The language the sentences in it are written in, where that is known.
   *
   * Unlike `provider` this one *does* travel in an export, and the difference
   * is what each is about. A provider is a fact about the reader's machine —
   * which symbol library they happen to own — and naming it in a shared file
   * points somebody at a source they may not have. A language is a fact about
   * the sentences themselves: „Kopfschmerzen" is German wherever it is opened,
   * and stays German on a page somebody reads in English.
   *
   * What it drives is the symbol search, not the interface. Somebody working in
   * English on a German Sammlung needs „Zähne putzen" looked up in German, or
   * no symbol they search for can be right; the labels around them are their own
   * choice and this does not touch them.
   *
   * Absent means what it always meant: the page's own language, as before.
   */
  language?: LanguageCode;

  createdAt: number;
  updatedAt: number;
}

/**
 * Personal override dictionary. Checked *first* in the pipeline.
 * Keyed per provider because a correction is a choice of image, not of concept.
 */
export interface Override {
  /** `${language}:${providerId}:${normalizedToken}` */
  key: string;
  /**
   * Which language the word was written in.
   *
   * Optional, and absent means German - every entry made before bildhaft had a
   * second language is one. There is no migration rewriting them, on purpose:
   * db.ts does not do those, and this is a change to what a row says rather
   * than to the shape of the store holding it.
   *
   * It has to be here because the word alone does not say. "Gift" is a present
   * in English and poison in German, and a dictionary entry pinning it to a
   * syringe would have answered an English sentence about a birthday.
   */
  lang?: LanguageCode;
  provider: ProviderId;
  token: string;
  symbolId: string;
  label: string;
  updatedAt: number;
}

/* ---------------------------------------------------------------- print --- */

export type LayoutMode = 'strip' | 'sheet';
export type LabelPosition = 'below' | 'above';
export type Orientation = 'portrait' | 'landscape';
/**
 * The papers a laminator in this country actually takes. A5 for communication
 * books and fans, A4 for most things, A3 for a board that goes on a wall.
 * US sizes are absent because nothing else here is written for anywhere else;
 * adding one is a row in the table in printSheet.ts and nothing more.
 */
export type PaperSize = 'a5' | 'a4' | 'a3';
/** How a card sheet decides how big a card is. */
export type SheetFit = 'size' | 'grid';

export interface PrintSettings {
  /** Symbol edge length in millimetres. People match existing boards. */
  symbolSizeMm: number;
  /** White border around each card, so laminating pouches get a sealed edge. */
  cutMarginMm: number;
  showLabel: boolean;
  labelPosition: LabelPosition;
  labelSizePt: number;
  layout: LayoutMode;
  paper: PaperSize;
  /** The long way round — the shape most communication boards are. */
  orientation: Orientation;
  /**
   * Card sheets only. 'size' keeps symbolSizeMm and lets the cards flow; 'grid'
   * ignores it and fits exactly gridCols x gridRows onto every page, which is
   * how a board is specified: "a 4x3 board", never "a 38mm board".
   */
  sheetFit: SheetFit;
  gridCols: number;
  gridRows: number;
  showCutLines: boolean;
  onePerPage: boolean;
  showSentenceText: boolean;

  /*
   * The printed frame around a card, drawn inside the cut margin so the sealed
   * edge stays sealed. Off by default: these exist so a printout can be made to
   * match the material a child already has, not to decorate a fresh one.
   */

  /** Millimetres. 0 means no frame at all, not a hairline one. */
  cardBorderMm: number;
  cardBorderColor: string;
  cardRadiusMm: number;
  /** A CSS colour behind the symbol, or null for the paper. */
  cardBackground: string | null;

  /**
   * Print the METACOM copyright notice at the foot of the sheet.
   *
   * Off by default and deliberately a choice, because whether it is required
   * depends on what happens to the paper, which only the person printing knows.
   * Printing a board for one child is private use and needs nothing; handing
   * material out or putting it on a wall is publication under METACOM's terms
   * (A.6.2, A.7.2) and does. ARASAAC does not appear here: its attribution is
   * unconditional and always prints.
   */
  showCopyright: boolean;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  symbolSizeMm: 40,
  cutMarginMm: 3,
  showLabel: true,
  labelPosition: 'below',
  labelSizePt: 11,
  layout: 'strip',
  paper: 'a4',
  orientation: 'portrait',
  sheetFit: 'size',
  gridCols: 4,
  gridRows: 3,
  showCutLines: true,
  onePerPage: false,
  showSentenceText: true,
  cardBorderMm: 0,
  cardBorderColor: '#333333',
  cardRadiusMm: 2,
  cardBackground: null,
  showCopyright: false,
};

/* ------------------------------------------------------------- settings --- */

export interface AppSettings {
  /**
   * The symbol source a collection uses when it has none of its own — which is
   * every collection until somebody says otherwise, and every new one after.
   *
   * It stopped being "the source the page renders with" when the source moved
   * onto the collection. The name is kept because renaming a stored field would
   * be a migration for nothing; what it means is stated here, in the words on
   * the settings card, and in the line under the composer.
   */
  activeProvider: ProviderId;
  /**
   * User-editable function-word lists, stored as data, one per language.
   *
   * Per language because the list is language: a German page dropping "the"
   * and an English one dropping "der" would each be keeping noise and losing
   * words. Held as a record rather than replaced on a switch, so that somebody
   * who has pruned one list still has it after looking at the other.
   */
  stopwords: Record<LanguageCode, string[]>;
  print: PrintSettings;
  lastCollectionId: string | null;
  /** Collapsed by default; the choice is remembered. */
  sidebarOpen: boolean;
  /**
   * Which of METACOM's parallel renderings to prefer — the folder name, or null
   * for no preference. METACOM ships the same symbols several times over, and
   * without this the one that wins is whichever the index listed first.
   */
  metacomRendering: string | null;
}

/* --------------------------------------------------------------- export --- */

export const EXPORT_FORMAT = 'bildhaft.collection' as const;
export const EXPORT_VERSION = 3 as const;

/** Whole-library backup: every collection, sentence and dictionary entry. */
export const BACKUP_FORMAT = 'bildhaft.backup' as const;
export const BACKUP_VERSION = 2 as const;

export interface BackupExport {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  collections: Collection[];
  sentences: Sentence[];
  overrides: Override[];
  /** The user's own pictures, inline. Theirs to keep, so a backup carries them. */
  ownImages?: OwnImageExport[];
  notice: string;
}

/** An own image as it travels: the bytes as a data URL, and nothing else added. */
export interface OwnImageExport {
  id: string;
  name: string;
  type: string;
  /** data: URL. The only image data bildhaft ever writes into a file. */
  data: string;
  createdAt: number;
}

export interface CollectionExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  collection: Collection;
  sentences: Sentence[];
  /** Optional: the exporter's overrides, so a colleague inherits the vocabulary. */
  overrides?: Override[];
  /** Only those this collection actually uses. Absent when it uses none. */
  ownImages?: OwnImageExport[];
  notice: string;
}
