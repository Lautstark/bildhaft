# What a DB_VERSION bump does to somebody's Sammlungen

`DB_VERSION` in [`src/db/db.ts`](../src/db/db.ts) is 4, and the whole of the
upgrade is `createStores(db)` — create the stores that are not there yet. That
is exactly right for the change it was written for and has no answer at all for
any other. This document weighs what to do about the other ones. The decision it
reaches is [ADR 0001](../adr/0001-an-upgrade-has-a-step-or-refuses.md); what is
here is the working, kept because the options that were *not* taken are the ones
somebody will propose again.

Nothing here is a criticism of the comment block above `DB_VERSION`. Its
argument — that wiping a library of Sammlungen to make room for a feature would
be an odd way to add one — is the argument this document starts from.

## What is there today

```js
upgrade(db) {
  createStores(db);
}
```

`createStores` asks `objectStoreNames.contains(name)` per store and creates what
is missing. It was a wipe until 2026-08-23, when v4 added `ownImages` and
dropping every Sammlung to make room for it was correctly refused.

That covers **one** kind of change: a new store, added beside the others.
Version 4 was that change and the code is right for it.

## What it has no answer for

Three kinds, and each was checked against the code rather than reasoned about.
The checks were seeded databases written the way each version wrote them, opened
by today's `getDB()`.

### 1. A store whose contents change shape

`createStores` sees the store exists and does nothing, so the new code reads old
records. Nothing anywhere reports it. This is the failure mode that is *worse*
than the wipe it replaced: a wipe is loud on the next page load, and this is a
row that quietly renders wrong, or a field that quietly reads as absent, at some
later date and with no version number attached to the complaint.

bildhaft has already made one change of this kind and got away with it, and it
is worth being precise about why. `Override.lang` was added when the page grew a
second language, and `repo.ts` reads an entry without one as German
(`override.lang ?? 'de'`) — which is what those entries are. `loadSettings()`
does the same for `stopwords`, which used to be one array. Both are correct, and
neither is a migration: they are *readers* that know the old shape, written into
the code that reads the records rather than into anything that runs once. That
works for a field that gained an optional meaning. It does not work for a field
that changes meaning, and it does not work at all for a change that has to touch
an index.

### 2. A store that is renamed or removed

Nothing removes anything, so the database accumulates. This is not theoretical
either: a database that was on v2 and is opened by today's build keeps
`arasaacImages`, `metacomIndex` and `handles` — three stores v3 was supposed to
have removed when the symbol caches moved to bildquelle — for as long as that
browser lives. Verified. It is junk rather than damage, and one of those three
holds an index derived from somebody's licensed METACOM folder, which is a store
this product otherwise takes care not to keep where it is not needed.

### 3. Nothing refuses

There is no version at which the code says *I do not know how to get from there
to here.* A bump that needed work and got none is indistinguishable from a bump
that needed nothing. That is the one that matters in a year, because the next
person to change `DB_VERSION` will be holding a diff, not this file.

### What that adds up to today, for a database on v1

v1 is reachable in the sense that matters here: no code anywhere refuses it. A
seeded v1 database — `sessions`, and `sentences` carrying `sessionId` under a
`bySession` index — opened by today's build produces this, verified:

- the version becomes 4 and `ownImages` and an **empty** `collections` store are
  created;
- `sessions`, with the person's Sammlungen in it, stays where it is, unread;
- `sentences` keeps `bySession` and never gains `byCollection`;
- boot finds no Sammlungen, so it **writes a new empty one into that database**,
  and then `listSentences` throws `NotFoundError` on the missing index;
- that rejection is a `void …then(…)` with nothing catching it, so the page sits
  on its loading spinner for as long as the tab is open.

So the person's experience of the current arrangement, at its worst, is: a
spinner that never resolves, no message, and every sentence they ever made still
in the browser and unreachable from the page. The database is also now stamped
version 4, so no future upgrade will ever look at it again — the damage outlives
the build that caused it.

## What is actually being protected

Not "data". A carer opens bildhaft and the Sammlung for their child's book is
there — the sentences, and the corrections made one word at a time against a
child nobody else knows. It is often the only copy. The JSON export is the whole
backup story on a static site, it is opt-in, and *"you should have exported"* is
not a sentence anybody gets to say to that person.

So the bar is: **somebody who has done nothing but open the page must not be
worse off after it than before.**

## The property everything else is measured against

**Atomicity.** Whatever runs either finishes or leaves the database exactly as
it found it. The third outcome — half done, old records gone, new ones not
written — is indistinguishable from a wipe and arrives at the worst moment: a
tab closed, a browser killed, a quota refused mid-write.

IndexedDB gives that away for free in exactly one place: the `versionchange`
transaction that `upgradeneeded` hands over. Everything in it commits together,
and an abort leaves the database at its **old version with its old contents**.
Anything outside it has to rebuild that guarantee by hand, and nothing can.

## The options

### 0. Leave it as it is

**What the person experiences:** nothing, until the day somebody changes a
stored shape. Then either a page that hangs with their work intact and
unreachable (the v1 case above), or rows that render wrong with no explanation
and no way to tell when it started.

**Rejected.** Not because the code is wrong for what it does, but because
"additive only" is a rule with nothing enforcing it. The next `DB_VERSION` bump
is a one-line diff and the failure it can cause is silent.

### 1. Put the wipe back

**What the person experiences:** they open the page and their Sammlungen are
gone. No warning, no file, nothing to click.

**Rejected**, and it was already rejected on 2026-08-23 for the right reason.
Restating it here so it is not re-litigated in a hurry: the premise underneath
the wipe is `conventions.md`'s **One rule about the rules** — *"these products
have one user … whose own data is disposable"* — and that premise expires the
moment this is advertised. It has not been found wrong; it has run out.

### 2. Steps per version, inside the `versionchange` transaction

An ordered list of steps keyed on the version each one produces, dispatched on
the `oldVersion` that `upgradeneeded` already hands over. Each does only what
that version changed. All of them commit together or none does.

**What the person experiences:** they open the page, their Sammlungen are there,
and a line says the database changed and how many Sammlungen came across.

**Cost:** everything inside a step must be a request on that transaction. One
`await` on anything else — a `crypto.subtle` digest, a `btoa`, a `FileReader`, a
folder write, a question put to a person — commits the transaction underneath
code that believes it is still inside one. `db.ts`'s head already documents that
trap; here it becomes load-bearing. Nothing bildhaft stores needs to leave:
sentences and Sammlungen are plain objects, own pictures are `Blob`s that move
whole, `updatedAt` is a number.

**Chosen.** Which versions get one is a separate question, below.

### 3. Repair the shape instead of the version

Extend `createStores` into "make the database look like the current schema":
create missing stores, add missing indexes, drop stores nothing declares.

**What the person experiences:** on the v1 database above, a page that starts
and shows an empty library, with a `byCollection` index built over records that
have no `collectionId` — so the Sammlungen are gone from the page while still
being in the browser, and nothing says so.

**Rejected as the mechanism.** It dispatches on a guess when the version number
was handed over, and the guess is wrong precisely where it matters: a version
whose store *names* did not change but whose records did looks identical from
the outside. Repairing a shape also cannot know what a record means — an index
is trivial to add and worthless over records that never carried the field.

**Half of it is kept**, as a check rather than a repair. See "Two additions"
below.

### 4. Export around the wipe

Read the old database out through `exportEverything()`, let the wipe happen,
write it back afterwards.

**What the person experiences:** identical to option 2 — until it is not. The
drop commits in one transaction and the write-back happens in another, so there
is a window in which the old records are gone and the new ones have not landed.
Close the tab there and the library is gone.

**Rejected on atomicity.** It also does not survive its own attraction: reaching
the `BackupExport` shape needs `FileReader` for own pictures, which is exactly
the kind of await that cannot happen inside the transaction — so this design
*has* to be the unsafe one.

### 5. Refuse anything that is not the current version

No table at all: any `oldVersion < DB_VERSION` stops the page and offers a file.

**What the person experiences:** an upgrade that would have been safe and
invisible — v3 to v4 was one — becomes a dialog, a download, and a decision
about a word they have never heard.

**Rejected as the normal path**, kept as the fallback, where it is exactly
right: when the old shape cannot be read, the honest thing is to touch nothing
and say so.

## Which versions get a step

Within option 2 there is a second decision, and it is the one that is actually
about bildhaft rather than about databases.

A step is only ever run by a browser exactly that far behind. bildhaft's version
history is short and unusually well dated:

| version | landed | what changed |
|---|---|---|
| 1 | 2026-08-22 | `sessions`, `sentences`, `overrides`, `settings`, four cache stores |
| 2 | 2026-08-22 | `sessions` → `collections`; `sessionId` → `collectionId`; `bySession` → `byCollection`; `reviewed` dropped |
| 3 | 2026-08-22 | the four symbol/handle stores leave for bildquelle |
| 4 | 2026-08-23 | `ownImages` added |

Versions 1 and 2 each existed for part of one afternoon. From `2e9bbf7`, later
the same day, every opening of a v1 or v2 database **wiped it** — that was the
build in the world for the next day, and the commit that made it said in as many
words that the data behind those steps was a day of testing rather than work
worth recovering. So a browser still holding a v1 or v2 database is one that has
not opened bildhaft since 2026-08-22 and would have lost that database to the
wipe on the next visit anyway.

**Three answers were weighed.**

**A retroactive table, 1→2 and 2→3 written out.** The code is recoverable — it
is in git history, and both steps were real. It costs two steps of deliberately
typeless code, two seeded tests, and one thing that cannot be honoured: the v2→3
step carried a METACOM folder handle out to bildquelle *outside* the
transaction, which is exactly the await a step may not make. So the honest
retroactive step silently loses the folder grant, and the person re-picks their
licensed folder. Written for a population that is, as far as anything here can
tell, empty.

**No steps at all** — start refusing at 4. A v3 database would then be met with a
dialog instead of a one-statement upgrade that has been safe since it shipped.
That is option 5, and it is worse than what exists today.

**One step, 3→4, and a refusal for 1 and 2.** **Chosen.** It covers every
version that a working browser can be on, and it converts v1 and v2 from *hangs
with the work unreachable* to *stops, says so, and hands the records over as a
file*. That is strictly better than the current behaviour for exactly the
population that would have been served by the retroactive steps.

**What the choice costs, said plainly:** a browser on v1 or v2 will not start.
It is not a wipe — the database is untouched, at its own version, and the file
it offers holds every record in it — but somebody in that position has to take
that file and press discard to get a working page, and the file is JSON they
would have to read by hand. Deleting or omitting a step converts those browsers
from *migrated* to *refuses to start*, and that is a choice being made here on
their behalf rather than something discovered later. If a v1 database ever turns
up, the step can be written then, from the same git history, and the refusal is
what will have kept the records alive long enough for that to be possible.

## Two additions to what vorlaut settled on

vorlaut reached the same arrangement on 2026-08-27, from the other direction —
it had the wipe, and it cost its author every board she had. Two things here are
not in it, and both are bildhaft's own history rather than a disagreement.

**The shape is checked after the open, not only inside the upgrade.** vorlaut
asserts each step's expected stores as a precondition inside the transaction,
which catches a database that is not what its version claims *while it is being
upgraded*. bildhaft needs one more: today's build turns a v1 database into a
database stamped **version 4** with the wrong shape, and no upgrade will ever
run on it again, so no precondition can ever see it. A check on the way out of
`getDB()` — the five stores this code reads, and the four indexes it queries —
is what catches it, and it lands the person in the same refusal instead of the
same silent `NotFoundError`. It ignores stores it does not know about, because a
v2 database's leftover caches are junk rather than grounds for refusing somebody
their library.

**The rescue file leaves the caches out.** vorlaut dumps every store verbatim.
bildhaft's older databases hold `arasaacImages` and a `metacomIndex` built from
the filenames in somebody's licensed METACOM folder. They are caches, they
refill, and the second one is derived from licensed material this product
otherwise takes care not to write anywhere. The dump carries the stores that
hold work — and any store it does not recognise, which is the safe direction —
and names the ones it skipped in its own notice.

## What is chosen

1. `src/db/migrations.ts` holds one step per version, in order, keyed by the
   version it produces. `plan()` returns the steps between where this database
   is and `DB_VERSION`, and **refuses a version it has no step for** rather than
   skipping it.
2. Each step names the stores it expects to find, then does only what that
   version changed, through the upgrade transaction, with no `await` on anything
   that is not a request on it.
3. All of them commit together or none does. A refusal aborts the transaction,
   so the database stays at its old version with everything in it.
4. `createStores()` — the one place the live schema is written out — is reached
   for a database that has never existed, and for a person who has been shown a
   database this build cannot migrate and has said to discard it. Nowhere else.
5. The page says what happened: one line with the version it came from and the
   number of Sammlungen that came across, which is the one number a person can
   check the claim against. On a refusal, a sheet that stops the page, hands
   over every record as a file, and only then offers the discard.

## What this costs

- **`DB_VERSION` is no longer free to bump.** It costs a step whose `to` is the
  new number. Forgetting is safe and loud: the page refuses to start and says
  why, in the minute after the mistake rather than in a mail from a carer.
- **Nothing in a step may `await` a non-request.** No `FileReader`, no
  `crypto.subtle`, no `fetch`, no question put to a person. Concretely for
  bildhaft: a step may **move** an own picture and may not **re-encode** one,
  and anything that would need a data URL cannot be a step at all.
- **The steps are typeless**, because they work on shapes that are no longer in
  the schema `db.ts` declares. The compiler cannot check them, which is why each
  is covered by a test that seeds the version it starts from.
- **A downgrade is safe and says the wrong thing.** An older build meeting a
  newer database gets `VersionError` from `openDB`; the database is untouched
  and the page reports it as an ordinary failure to load rather than as "this
  browser has a newer bildhaft".
- **v1 and v2 will not start.** Stated in full above, because it is the part
  that is a decision rather than a mechanism.

## The rule this qualifies

`conventions.md`'s **One rule about the rules** is the premise all of this
rested on:

> These products have one user, who is the person writing them, and whose own
> data is disposable. So there are no migrations, no deprecation paths, and no
> tolerating an old shape "during a transition".

It already names one exception — the `.obz` exchange format, *"once a package
reaches somebody's tablet it is a file on a device nobody here controls"*. A
person's IndexedDB, once the product is advertised, is the same thing by the
same reasoning, and belongs on that list as the second entry rather than as a
contradiction of the rule.

**That edit has not been made here.** `conventions.md` lives in
`Lautstark/design`, is cited by paragraph by three products, and a
shared-convention change belongs to its own session. vorlaut's ADR 0015 says the
same and deliberately did not make it either. `mitreden` has the same premise
expiring.
