# ADR 0006: A save is done when the browser has it; the folder is delivered to

**Status: built, 2026-11-26.**

## Context

adr/0005 took the folder out of the way of the first paint. What it left alone,
and said so, is the other half: every write still waited for its file.

A write reached IndexedDB and then the folder, and the caller waited for both.
One file is several round trips — the kind's folder opened, the file opened, a
swap file written, swapped in — and they are paid per record. Dragging one card
to the front of a list of thirty renumbers twenty-nine of them, and each was
written and awaited in turn while the card sat where the hand had dropped it.

Measured on the built page against a real folder store, with every file-system
call priced (the browser brokers a folder somebody picked; its own storage
answers in a tenth of a millisecond):

| | 2 ms a call | 20 ms a call |
|---|---|---|
| one card to the front of thirty, before | 155 ms | 276 ms |
| the same, after | 116 ms | 117 ms |

The second column is the point rather than the first: before, the wait grew
with what the folder costs, and a household whose folder sits in a sync client
is on that curve. After, it does not move — the screen is redrawn from memory
and the files follow.

### And the hole underneath it

The wait was the complaint. The hole was worse, and it is the reason this is an
ADR rather than a patch: **a write whose file failed left no trace of itself
anywhere.** The record went into IndexedDB, the folder write was dropped, and
the next read — which replaces the library wholesale, because the folder is the
truth — deleted the record only this browser had.
`tests/unit/import-folder.test.ts` has recorded what that cost once since
2026-10-20: eighteen imported Spiele, of which the two that survived were the
two that had been edited since, because an edit files its record.

So the thing that makes a deferred write safe is the same thing that was
missing when writes were immediate: somewhere to write down what the folder has
not been told.

## Decision

**1. The debt is written first.** A write reaches IndexedDB, then a row in
`waiting` saying the folder is owed this record, and returns. That is when a
save is done: the screen is redrawn, the standing backup hears of it.

A household with no folder never has a row. There is nothing to owe it to, and
`owe()` returns before writing one — which is most households, and they are
left exactly as they were.

**2. The folder is delivered to afterwards, one record at a time, in order.**
One queue, in the order the changes were made. A delivery reads the record **as
IndexedDB holds it now**: three quick edits of one Sammlung deliver the last of
them, and an edit followed by a deletion delivers the deletion. That is also
what retired `freshest()` — it existed because a snapshot taken inside a
transaction is old by the time the file is written, and a delivery never holds
a snapshot at all.

**3. A row is paid only for what was delivered.** The delivery remembers the
row's stamp before it reads anything, and deletes the row only if the stamp has
not moved. An edit made while a delivery was under way leaves a newer row,
which its own delivery pays. Whatever stops a delivery — the tab closed, the
folder gone — leaves the row, and the next read pays it.

**4. Everything that reads or rewrites the folder waits for the queue, pays
what is owed, and refuses to read while anything is left.** `pullFromFolder`
drains the queue and runs `settleUp()` before `pull()`, inside the sync that
adr/0005 made the one place a read happens — so no write can join the queue
while this runs. `mirror()` and `adoptFolder()` drain it too.

The refusal is the strict half, and it is deliberate: a folder read back
without our own change in it puts the version from before the edit on screen
and then, as the authority, deletes the change for good. Whatever refused the
delivery — out of reach, permission withdrawn — would almost always refuse the
read as well. The next read tries again.

**5. Reordering writes only what moved, and writes it together.** `moveEntry`
renumbers the cards whose place actually changed and writes them in one pass
rather than one after another; `rewritePart` and the rendering preference that
re-points every row of a Sammlung do the same. The screen is set first, because
a drag has already said where the card goes.

## What this does not change

- **Writes still reach the folder one file at a time.** The queue is
  serialised on purpose: the folder has to get the changes in the order they
  were made.
- **The folder is still read whole** on every read, as adr/0005 left it.
- **Conflicts are still not reported.** `conflicts()` is exported from
  `db/folder.ts` and called by nothing. A delivery now lands later than the
  edit that caused it, which widens the window for somebody else's device to
  have written the same record first — and nothing here notices. It is the same
  silence as before, over a slightly longer moment, and the thing to build when
  there are two writing devices in one household.
- **A write of one record still costs what it costs.** Adding one line to a
  Rezept was measured at around 85 file-system calls — a whole kind listed and
  read — and that is unchanged by this: it is not the record's own write, and
  it was not found. At 20 ms a call it is the better part of two seconds, so it
  is the next thing to look for rather than something to leave unsaid.

## What the cleanup will look like

Two things here read as redundancy:

- **`owed() > 0` refusing the read.** It looks like a belt over `settleUp()`,
  which has just tried everything. It is the one line that stops a destructive
  read from running over a change the folder never took, and the test for it is
  `tests/unit/outbox.test.ts`, "does not read at all while something is still
  owed".
- **The `waiting` row for a change that is delivered milliseconds later.** On a
  good day every row exists for a moment and is gone, which makes the store
  look like bookkeeping for its own sake. The row is what survives the bad day,
  and the bad day is the one that cost somebody eighteen Spiele.
