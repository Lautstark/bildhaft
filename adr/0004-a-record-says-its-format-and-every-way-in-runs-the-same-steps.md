# ADR 0004 — A record says its format, and every way in runs the same steps

**Status:** built, 2026-11-14 · **Applies to:** `src/core/format.ts`, and the
four places a record enters: `pullFromFolder()` and `bringRecordsUpToDate()` in
`src/db/repo.ts`, `importCollectionFile()` and `importBackup()` in
`src/db/exportImport.ts`

## Context

[ADR 0001](0001-an-upgrade-has-a-step-or-refuses.md) gave the *database* a step
per version. It is about stores and indexes, and it holds.

It says nothing about what is inside a record, and it could not reach most
records if it did. A household that keeps its work in a folder — the usual case
— has the folder as its store (sicherung's ADR 0001): `pullFromFolder()` clears
the database on every start and writes the folder's files in, as they are. A
database step runs once, in one browser, on a copy that is replaced a moment
later. Records also arrive from an exported file and from a Sicherung, and each
of those had grown its own answer to an old record: a reader that tolerated a
missing field here, a remap there.

That worked while a record only ever gained fields. The first change that
*rewrites* one — a slot holding one symbol rather than one per source — has no
place to live: four doors, four special cases, and one of them with no case at
all.

Two things were already there and unused. The folder writes `v` at the foot of
every file and remembers the highest it has read (`Ablage.shape.sawNewer`);
bildhaft never told it a version, so every file says `v: 1`, and nothing asked
whether a newer one had turned up.

## Decision

**A record says which format it is in, and there is one list of steps from each
format to the next. Every way a record comes in runs that list before anything
else looks at the record.**

- `FORMAT` in `core/format.ts` is the format this build reads and writes. It is
  the `version` the folder is given, so `v` in a file and `v` on a record are
  the same number. Absent means 1.
- A step takes everything that arrived together and rewrites the records that
  are behind it. The whole library and not one record, because a row cannot
  always be brought up alone — what its symbols mean depends on the Sammlung it
  lies in.
- `upgradeLibrary()` refuses a format it has no step for, the way `plan()`
  does in ADR 0001 and for its reason.
- What a step rewrote on the way in from the folder is filed back, record by
  record, so the next device finds it done. Nothing else is rewritten: with no
  step to run, a start touches no file.
- Every write stamps `v`. A record made today must not read as format 1 the
  day format 2 exists.

**Data ahead of the build stops the page.** If the folder, the browser's own
records or an opened file hold a record newer than `FORMAT`:

- the folder is not read over the browser's copy, and nothing more is written
  to it (`canWrite` in `db/folder.ts`);
- the page shows `app/Outdated.svelte` — modal, with one button, which reloads;
- a file is refused with a sentence that says the same.

Reading it anyway is what the folder package does, on purpose, and leaves the
refusal to the product. This is the product's answer: a newer row drawn by an
older build is a row of empty fields, and written back it is that row for good.

## Consequences

- Raising `FORMAT` is adding a step, and `tests/unit/format.test.ts` fails
  until there is one for every number.
- The check has to be in people's browsers *before* the first step ships. A tab
  left open on a build from before this ADR knows nothing of any of it. What it
  writes is format 1 and is brought up again on the next read, so nothing
  breaks; but it will draw newer rows wrongly until it is reloaded.
- A step must not mind a partial library: an opened file is one Sammlung and
  carries no household.
- Own pictures are not in a `Library`. Their record is four fields and a file
  beside it; the day that changes, they join.
- `EXPORT_VERSION` and `BACKUP_VERSION` stay, and mean what they meant: the
  envelope of a file. What is inside the envelope answers for itself.
- `db/migrations.ts` stays, and is not this. A new store or index is a
  `DB_VERSION` step; a changed record is a `FORMAT` step.

## What was looked at and not taken

- **A library.** The small ones that do exactly this (json-up, verzod and
  their kin) want Zod schemas for every record and bring a version chain of
  about fifty lines. The work here is the four doors and the folder, which none
  of them touches.
- **A mark on the folder rather than on each record.** `adopted.json` could
  carry the number. A folder is rewritten file by file, by several devices, and
  can be half done; a record that answers for itself is right at every moment
  in between.
- **Read-only instead of stopped.** bildhaft has no read-only mode, and one
  that drew newer rows through an older reader would be showing something
  wrong and calling it safe.
