/**
 * The format of a record, and the one way an old one becomes a new one.
 *
 * A record reaches this app four ways: read out of the folder, read out of this
 * browser's database, opened from an exported file, restored from a Sicherung.
 * Each of them can hand over a record written by an older build, and until this
 * existed each had its own answer to that — a reader that tolerated the old
 * field here, a remap there, nothing at all in the folder, which is read past
 * `db/migrations.ts` wholesale on every start. adr/0004.
 *
 * So a record says which format it is in — `v`, the number the folder has been
 * writing at the foot of every file all along — and every way in runs the same
 * steps over what it read before anything else looks at it.
 *
 * `db/migrations.ts` is not this. That one is about the *database*: which
 * stores and indexes exist. This one is about what is inside a record, wherever
 * the record is lying.
 *
 * Nothing here reads or writes anything. It is handed records and hands records
 * back, so it can be held to its word without a browser.
 */

import type { Collection, Override, Sentence } from './types.ts';

/** The format this build reads and writes. Raising it means adding a step. */
export const FORMAT = 1;

/** What a step is handed: everything that arrived together. An exported file is
 *  one Sammlung and its rows, a folder is the whole household. */
export interface Library {
  collections: Collection[];
  sentences: Sentence[];
  overrides: Override[];
}

/** Whether a record is still behind the step asking. */
export type Due = (record: { v?: number }) => boolean;

export interface FormatStep {
  /** The format a record is in once this has run. */
  to: number;
  /**
   * Rewrites the records that are `due` and hands the rest back as they are.
   *
   * The whole library and not one record, because a row cannot always be
   * brought up alone: what its symbols mean can depend on the Sammlung it lies
   * in. A step must not mind a library that is only part of one — an imported
   * file carries no household.
   */
  run(library: Library, due: Due): Library;
}

/** Every step there has been, lowest first. Format 1 is where records began. */
export const FORMAT_STEPS: readonly FormatStep[] = [];

/** A record that says nothing was written before records said anything. */
export const formatOf = (record: { v?: number }): number => Number(record.v) || 1;

const everything = (library: Library): { v?: number }[] =>
  [...library.collections, ...library.sentences, ...library.overrides];

/**
 * Whether something in here was written by a build newer than this one.
 *
 * Asked before anything is upgraded or drawn: a newer record read as an older
 * one is a row of empty fields, and written back it is that row for good.
 */
export const holdsNewer = (library: Library, format: number = FORMAT): boolean =>
  everything(library).some((record) => formatOf(record) > format);

export interface Upgraded {
  library: Library;
  /** The records that are not what they were, for whoever has to write them. */
  changed: Library;
}

/**
 * Brings a library up to this build's format.
 *
 * Refuses rather than skipping, the way `plan()` in db/migrations.ts does and
 * for its reason: a format with no step is one nobody described, and carrying
 * on into it is the answer a household cannot recover from.
 *
 * `steps` and `format` are parameters so this can be tested with steps that do
 * not exist yet.
 */
export function upgradeLibrary(
  library: Library, steps: readonly FormatStep[] = FORMAT_STEPS, format: number = FORMAT,
): Upgraded {
  if (holdsNewer(library, format)) {
    throw new Error(`a record is in a format newer than ${format}`);
  }
  const before = new Map(everything(library).map((record) => [record, formatOf(record)]));
  let held = library;
  for (let to = 2; to <= format; to += 1) {
    const due: Due = (record) => formatOf(record) < to;
    if (!everything(held).some(due)) continue;
    const step = steps.find((one) => one.to === to);
    if (!step) throw new Error(`no step brings a record to format ${to}`);
    const stamp = <T extends { v?: number }>(record: T): T => (due(record) ? { ...record, v: to } : record);
    const next = step.run(held, due);
    held = {
      collections: next.collections.map(stamp),
      sentences: next.sentences.map(stamp),
      overrides: next.overrides.map(stamp),
    };
  }
  const moved = <T extends { v?: number }>(record: T): boolean => before.get(record) !== formatOf(record);
  return {
    library: held,
    changed: {
      collections: held.collections.filter(moved),
      sentences: held.sentences.filter(moved),
      overrides: held.overrides.filter(moved),
    },
  };
}
