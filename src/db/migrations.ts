/** One step per version, in order, and a refusal for every version without one.
 *
 * ## What this is
 *
 * `upgradeneeded` hands over `oldVersion`, `newVersion` and a transaction that
 * commits everything in it or nothing. Using that means what it means
 * everywhere else: **an ordered list of deltas, each doing one thing, replayed
 * from wherever a database happens to be.** idb's own README, MDN, and every
 * schema tool with migrations in it describe the same arrangement.
 *
 * What stood here before was `createStores()` and nothing else — create the
 * stores that are not there yet. That is right for the change it was written
 * for, and it is still what a *new* database gets. It has no answer for a store
 * whose records change shape (it does nothing, and the new code reads old
 * records, silently), for a store that is renamed or removed (nothing removes
 * it), or for a version nobody wrote a step for (indistinguishable from a
 * version that needed none). adr/0001 is the whole argument.
 *
 * ## The rule every step lives under
 *
 * > **Nothing in a step may `await` anything that is not a request on `tx`.**
 *
 * A transaction stays open only while requests are outstanding on it, so one
 * await on a `FileReader`, a `crypto.subtle` digest, a `fetch` or a question
 * put to a person commits it underneath the step — and a half-applied migration
 * is the failure this arrangement exists to make impossible. The head of db.ts
 * documents that trap in general; here it is load-bearing.
 *
 * What it rules out for bildhaft, concretely: a step may **move** a picture of
 * the user's own and may not **re-encode** one, because a data URL needs a
 * `FileReader`. A change to what is inside an own picture cannot be done as a
 * step at all, and has to come back to adr/0001 rather than around it.
 *
 * ## Preconditions, and why they are not shape-sniffing
 *
 * Each step says which stores it expects to find. That is an assertion, not a
 * dispatch: the version number decides *which* steps run, and the precondition
 * only refuses a database that is not what its version claims to be. A step
 * that ran anyway would write into stores it had not understood.
 *
 * ## Adding one
 *
 * Bump DB_VERSION in db.ts, add the step whose `to` is the new number, and that
 * is the whole of it. Forget it and nothing is lost: plan() refuses a version
 * it has no step for, db.ts aborts the upgrade, and the browser keeps its
 * version and its records while the page says so. That failure is designed
 * rather than tolerated — it is the difference between a bug found in the
 * minute after it is made and a database misread for weeks.
 */

import type { IDBPDatabase, IDBPTransaction } from 'idb';

/** A database and a transaction whose stores are not the current schema's.
 *
 * Deliberately typeless. A step works on the shape of a version that has been
 * left behind — `sessions`, `arasaacImages`, whatever a later one drops — and
 * none of those are in the schema db.ts declares. idb documents this cast for
 * exactly this case. What it costs is that the compiler cannot check a step,
 * which is why every one of them is covered by a test that seeds the version it
 * starts from. */
export type OldDB = IDBPDatabase<unknown>;
export type OldTx = IDBPTransaction<unknown, string[], 'versionchange'>;

/** Thrown when there is no step for a version this database has to cross.
 *
 * A code rather than a sentence: this module has no language, and the caller
 * has the text table. What it means at the call site is *do not touch this
 * database.* */
export const MISSING_STEP = 'db:no-migration';

/** Thrown when a database is not the shape its version says it is — asserted by
 *  a step on its way in, and by db.ts on its way out of an open. Same meaning,
 *  same answer. */
export const WRONG_SHAPE = 'db:wrong-shape';

export interface Step {
  /** The version this step produces. */
  to: number;
  /** Stores that must already be there. See "Preconditions" above. */
  expects: readonly string[];
  /** Everything this step does, entirely in requests on `tx`. */
  run(db: OldDB, tx: OldTx): Promise<void> | void;
}

export const STEPS: readonly Step[] = [
  {
    /* 3 -> 4: pictures of the user's own get a store, and nothing else is
     * touched.
     *
     * This is what `createStores()` already did for a v3 database, written out
     * as the step it always was. It reads no sentence, so it cannot lose one.
     *
     * The `contains` guard is the same one createStores uses. A v3 database
     * cannot have this store, so the guard is for a database that is not what
     * it claims — and refusing that is the precondition's job, one line up,
     * rather than a ConstraintError's. */
    to: 4,
    expects: ['collections', 'sentences', 'overrides', 'settings'],
    run(db) {
      if (!db.objectStoreNames.contains('ownImages')) {
        db.createObjectStore('ownImages', { keyPath: 'id' });
      }
    },
  },
];

/* Versions 1 and 2 have no step, on purpose, and that is a decision rather
 * than an omission — adr/0001 records it and docs/schema-upgrades.md weighs it.
 * In short: both existed for part of one afternoon on 2026-08-22, and from
 * later that same day every opening of such a database wiped it, so a browser
 * still holding one has not been here since and would have lost it on its next
 * visit anyway. What it gets now instead is a page that stops, says so, and
 * hands over every record as a file before anything discards them.
 *
 * If one ever turns up, the step can be written then — both are recoverable
 * from this repository's history, at 1c81346 and 2bdbf62 — and the refusal is
 * what will have kept its records alive long enough for that to be possible.
 * The one thing such a step cannot do is what the original 2 -> 3 did: carry a
 * METACOM folder handle out to bildquelle. That happened outside the
 * transaction, which is exactly the await a step may not make, so the folder
 * would have to be picked again. */

/** The steps between where this database is and where it has to be.
 *
 * Refuses rather than skipping. A gap in the list means somebody bumped
 * DB_VERSION without saying what changed, and the two answers to that are
 * *stop* and *carry on into a shape nobody has described*. Only one of them is
 * survivable for the person whose Sammlungen are in there.
 *
 * `steps` is a parameter so the refusal can be tested for the gap it is about
 * rather than only for the gaps this repository happens to have. */
export function plan(from: number, to: number, steps: readonly Step[] = STEPS): Step[] {
  const wanted: Step[] = [];
  for (let version = from + 1; version <= to; version++) {
    const step = steps.find((one) => one.to === version);
    if (!step) throw new Error(MISSING_STEP);
    wanted.push(step);
  }
  return wanted;
}

/** Runs the plan, checking each step's preconditions on the way in.
 *
 * The whole plan is built before the first step runs, so a gap three versions
 * ahead stops the upgrade before anything has been written rather than halfway
 * through it. */
export async function migrate(
  db: OldDB, tx: OldTx, from: number, to: number, steps: readonly Step[] = STEPS,
): Promise<void> {
  for (const step of plan(from, to, steps)) {
    for (const name of step.expects) {
      if (!db.objectStoreNames.contains(name)) throw new Error(WRONG_SHAPE);
    }
    await step.run(db, tx);
  }
}

/** Whether an error is one of this module's two refusals, wherever it surfaced.
 *  Both mean the same thing to a caller: the database was left alone, and
 *  somebody has to be told. */
export const isRefusal = (error: unknown): boolean =>
  error instanceof Error
  && (error.message === MISSING_STEP || error.message === WRONG_SHAPE);
