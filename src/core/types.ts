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

export type ProviderId = 'arasaac' | 'metacom';

/** A symbol offered for a slot. `id` is provider-local. */
export interface Candidate {
  id: string;
  label: string;
  /** Higher is better. Used only for ordering within one provider's results. */
  score: number;
}

/** How a slot's concept was arrived at — surfaced as a tooltip, nothing more. */
export type SlotOrigin =
  | 'override' // personal override dictionary
  | 'lemma' // direct lemma lookup
  | 'separable' // particle reattached, e.g. "räum … auf" -> aufräumen
  | 'compound' // part of a split compound, e.g. Apfelsaft -> Apfel + Saft
  | 'synonym' // resolved via the synonym table
  | 'raw' // matched on the surface form
  | 'manual' // added by hand from the picker
  | 'unmatched'; // nothing found; user must pick manually

export interface Slot {
  id: string;
  /** The word(s) this slot came from, shown under the symbol. */
  sourceToken: string;
  /** The portable concept key. This, not the image, is what travels. */
  concept: string;
  origin: SlotOrigin;
  /** True once the user has overridden the automatic pick. */
  manual: boolean;

  /**
   * Per-provider choice: providerId -> symbol id, or null for "not chosen yet".
   * Keeping choices per provider means switching backends and switching back
   * does not throw away a manual correction.
   */
  choice: Partial<Record<ProviderId, string | null>>;
  /** Cached candidate lists per provider, so the picker opens instantly. */
  candidates: Partial<Record<ProviderId, Candidate[]>>;
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

export interface PrintSettings {
  /** Symbol edge length in millimetres. People match existing boards. */
  symbolSizeMm: number;
  /** White border around each card, so laminating pouches get a sealed edge. */
  cutMarginMm: number;
  showLabel: boolean;
  labelPosition: LabelPosition;
  labelSizePt: number;
  layout: LayoutMode;
  showCutLines: boolean;
  onePerPage: boolean;
  showSentenceText: boolean;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  symbolSizeMm: 40,
  cutMarginMm: 3,
  showLabel: true,
  labelPosition: 'below',
  labelSizePt: 11,
  layout: 'strip',
  showCutLines: true,
  onePerPage: false,
  showSentenceText: true,
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
}

/* --------------------------------------------------------------- export --- */

export const EXPORT_FORMAT = 'bildhaft.collection' as const;
/** v1 used the term "session"; importing still accepts those files. */
export const LEGACY_EXPORT_FORMAT = 'bildhaft.session' as const;
export const EXPORT_VERSION = 2 as const;

/** Whole-library backup: every collection, sentence and dictionary entry. */
export const BACKUP_FORMAT = 'bildhaft.backup' as const;
export const BACKUP_VERSION = 1 as const;

export interface BackupExport {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  collections: Collection[];
  sentences: Sentence[];
  overrides: Override[];
  notice: string;
}

export interface CollectionExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  collection: Collection;
  sentences: Sentence[];
  /** Optional: the exporter's overrides, so a colleague inherits the vocabulary. */
  overrides?: Override[];
  notice: string;
}
