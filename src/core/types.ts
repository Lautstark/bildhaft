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
export type { Candidate, ProviderId };

/** How a slot's concept was arrived at — surfaced as a tooltip, nothing more. */
export type SlotOrigin =
  | 'override' // personal override dictionary
  | 'lemma' // direct lemma lookup
  | 'separable' // particle reattached, e.g. "räum … auf" -> aufräumen
  | 'compound' // part of a split compound, e.g. Apfelsaft -> Apfel + Saft
  | 'synonym' // resolved via the synonym table
  | 'raw' // matched on the surface form
  | 'manual' // chosen by hand from the picker, whether added or corrected
  | 'unmatched'; // nothing found; user must pick manually

export interface Slot {
  id: string;
  /** The word(s) this slot came from, shown under the symbol. */
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
}

/** A named group of sentences — e.g. one book, one topic, one child. */
export interface Collection {
  id: string;
  /** e.g. "Der Grüffelo" */
  name: string;
  sentenceIds: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Personal override dictionary. Checked *first* in the pipeline.
 * Keyed per provider because a correction is a choice of image, not of concept.
 */
export interface Override {
  /** `${providerId}:${normalizedToken}` */
  key: string;
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
  activeProvider: ProviderId;
  /** User-editable function-word list, stored as data. */
  stopwords: string[];
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
