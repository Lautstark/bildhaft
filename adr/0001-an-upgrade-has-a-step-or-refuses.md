# ADR 0001 — An upgrade has a step for every version it crosses, or it refuses and changes nothing

**Status:** accepted · **Date:** 2026-08-27 · **Applies to:** `src/db/db.ts`,
`src/db/migrations.ts`, `src/db/rescue.ts`, `src/ui/rescue.ts`, and every future
change to `DB_VERSION`

## Context

`upgrade()` in `src/db/db.ts` is one statement — `createStores(db)` — which
creates the object stores that are not there yet. It replaced a wipe on
2026-08-23, when `DB_VERSION` went to 4 to add `ownImages` and dropping a
library of Sammlungen to make room for a feature was correctly refused. **That
change was right and this ADR is not a correction of it.**

It is right for one kind of change: a new store beside the others. For every
other kind bildhaft has no answer, and each was verified against the code by
seeding a database the way an old version wrote it and opening it with today's
build:

- **A store whose contents change shape.** `createStores` sees the store exists,
  does nothing, and the new code reads old records. Nothing reports it. This is
  worse than the wipe it replaced, because a wipe is at least loud.
- **A store renamed or removed.** Nothing removes anything. A v2 database opened
  today still carries `arasaacImages`, `metacomIndex` and `handles` — the three
  stores v3 removed when the caches moved to bildquelle — forever.
- **Nothing refuses.** A bump that needed work and got none is
  indistinguishable from a bump that needed nothing.

What that produces today, for a database on v1: the version becomes 4, an empty
`collections` store is created beside the untouched `sessions` store holding the
person's Sammlungen, boot writes a new empty Sammlung into that database, and
then `listSentences` throws `NotFoundError` on an index that was never created —
into a `void …then(…)` with nothing catching it. The page sits on its spinner
for as long as the tab lives, and the database is now stamped version 4, so no
future upgrade will look at it again.

The premise underneath all of this is one sentence of `conventions.md`, under
**One rule about the rules**:

> These products have one user, who is the person writing them, and whose own
> data is disposable. So there are no migrations, no deprecation paths, and no
> tolerating an old shape "during a transition".

The same paragraph says when to come back to it, and the answer is: when this is
advertised. A developer losing their own test Sammlungen is a shrug; a carer
opening bildhaft and finding the Sammlung for their child's book gone — or
worse, silently rendering the wrong words — is the worst thing this product can
do. [`docs/schema-upgrades.md`](../docs/schema-upgrades.md) weighs the ways out;
this is the decision it reaches.

## Decision

**`src/db/migrations.ts` holds one step per version, in order. An upgrade runs
the steps between where a database is and where it has to be, inside the
`versionchange` transaction — or it aborts that transaction and leaves the
database exactly as it found it.**

This is the ordinary arrangement, and deliberately unremarkable: it is what
`idb`'s README describes, what MDN describes, and what every schema tool with
migrations in it does. Four parts are particular to here.

**A step does only what that version changed.** The table has one entry.

| step | what it does |
|---|---|
| 3 → 4 | `ownImages` is created; nothing else is read or touched |

**No step for a version means stop, not skip.** `plan()` refuses a version it
has no step for. `db.ts` aborts the upgrade, the browser keeps its version and
its records, and `ui/rescue.ts` says so and hands over the raw contents as a
file before anything will discard them.

**Versions 1 and 2 are refused on purpose, and this is the part that is a
choice rather than a mechanism.** Both existed for part of one afternoon on
2026-08-22, and from later that same day every opening of a v1 or v2 database
wiped it — so a browser still on one is a browser that has not been here since,
and that would have lost the database on its next visit under the build that
shipped the next morning. A retroactive 1→2 and 2→3 is recoverable from git
history and was weighed in full; what settled it is that the 2→3 step carried a
METACOM folder handle out of the transaction, which is exactly the await a step
may not make, so the honest version of it loses the folder grant anyway.
**Refusing converts those browsers from *hangs with the work unreachable* to
*stops, says so, and hands over a file*, which is strictly better than what they
get today.** They still do not start, and that is a cost being accepted here on
somebody's behalf rather than discovered later. If a v1 database ever appears,
the step can be written then — the refusal is what will have kept its records
alive long enough for that.

**The shape is checked on the way out of `getDB()`, not only inside the
upgrade.** Each step names the stores it expects, as vorlaut's do; bildhaft
needs one more check, because today's build turns a v1 database into a
*version 4* database with the wrong shape, and no upgrade will ever run on it
again. So `getDB()` asserts the five stores this code reads and the four indexes
it queries, and refuses through the same path when they are not there. It
ignores stores it does not know about: a v2 database's leftover caches are junk,
not grounds for refusing somebody their library.

`createStores()` — the only place the live schema is written out — is reached in
exactly two situations: a database that has never existed, and a person who has
been shown a database this build cannot migrate and has said to discard it. The
destructive path is the exception with a hand on it rather than the default with
an argument in front of it.

## Why

**Atomicity is the whole property, and only one place gives it away free.**
Inside the `versionchange` transaction every step commits together or none does,
and an abort leaves the database at its *old version with its old contents*. Any
design that steps outside it — read the library out, let a wipe commit, write it
back — has a window in which the old copy is gone and the new one has not
landed. For bildhaft that design is not merely riskier, it is impossible to do
safely: reaching the export shape needs `FileReader` for own pictures, and
awaiting a `FileReader` inside the transaction commits it underneath the caller.

**The version number is a fact; the shape is a guess.** `upgradeneeded` hands
over `oldVersion`. Sniffing the records to work out what a database is, when it
has just been stated, gets the answer wrong precisely where it matters — on a
version whose store names did not change but whose records did.

**Doing less is what makes a migration safe.** The number of ways a migration
can lose something is roughly the number of records it writes. 3 → 4 writes
none.

**Forgetting has to be safe.** The next person to bump `DB_VERSION` will be
holding a diff, not this file. If they add no step, the page refuses to start
and says why — a bug found in the minute after it is made, rather than a silent
misread that surfaces weeks later as "the words under the pictures are wrong".

**Silence is the worst part of it, and it goes even when nothing is lost.** An
upgrade that reorganised somebody's storage without telling them is
indistinguishable, from where they are standing, from one that lost something.
`conventions.md` §3.8 — what the page reports, it reports out loud. The sentence
carries the count of Sammlungen, which is the one number a person can check the
claim against.

## Consequences

- **`DB_VERSION` is no longer free to bump.** It costs a step whose `to` is the
  new number. This is the deprecation cost `conventions.md` refuses to pay in
  general, and it is paid here on purpose.
- **Nothing in a step may `await` a non-request** — no `FileReader`, no
  `crypto.subtle`, no `fetch`, no folder write, no question put to a person.
  Concretely: a step may **move** an own picture and may not **re-encode** one,
  because that needs a `FileReader`. A change to what is *inside* an own picture
  cannot be done as a step and has to come back to this ADR rather than around
  it. That is a known gap, not an oversight.
- **The steps are typeless.** They work on shapes that are no longer in the
  schema `db.ts` declares, so the compiler cannot check them — the same trade
  every migration system makes, and the reason each is covered by a test that
  seeds the version it starts from.
- **A database on v1 or v2 will not start** until somebody takes the file and
  presses discard. Stated as a consequence rather than buried in the decision,
  because it is the one a person could be standing in.
- **A downgrade is safe and says the wrong thing.** An older build meeting a
  newer database gets `VersionError` from `openDB`; the database is untouched,
  and the page reports it as an ordinary load failure rather than as "this
  browser has a newer bildhaft". Worth its own fix, and not this one.
- **This qualifies a rule that is not this repository's.**
  `conventions.md`'s **One rule about the rules** already carves out the `.obz`
  exchange format, *"once a package reaches somebody's tablet it is a file on a
  device nobody here controls"*. A person's IndexedDB, once the product is
  advertised, is the same thing by the same reasoning, and belongs on that list
  as the second entry rather than as a contradiction. **That edit has not been
  made here.** `conventions.md` lives in `Lautstark/design`, is cited by
  paragraph by three products, and a shared-convention change belongs to its own
  session. vorlaut's
  [ADR 0015](https://github.com/Lautstark/vorlaut-diy-talker/blob/main/adr/0015-a-schema-change-carries-the-boards-across.md)
  states the same and deliberately did not make it either; `mitreden` has the
  same premise expiring.

## Not to be "fixed" later

**"The table has one row — that is not a migration system, delete it."** The row
count is the point. What the file buys is not the step, it is `plan()`'s refusal
and the sentence the page says; both work the same whether the table has one
entry or nine, and both stop working the moment somebody decides one entry does
not justify a file.

**"`plan()` should skip a version it has no step for — there is nothing to
do."** There is no way to tell "nothing changed" from "somebody forgot" at that
point, and the two want opposite answers. The refusal is the whole of why
forgetting is safe.

**"Nobody can be on v1 or v2 — delete the refusal too and just create the
stores."** That is what the code does today, and the verified result is a page
that hangs with the person's Sammlungen sitting unread in a store nothing looks
at. The refusal costs nothing while the population is empty, and it is the only
thing standing between an empty population and a wrong one.

**"The steps could run outside the upgrade, it would be easier to test."** They
could not. Outside that transaction there is no atomicity, and a half-applied
migration is the failure this exists to prevent. Whoever proposes it has to say
what happens to a tab closed halfway.

**"`getDB()` should not check the shape on every open — the upgrade already
did."** The upgrade did not, for the database this check exists for: a v1
database that today's build already stamped version 4. No upgrade will ever run
on it again, so a precondition inside one can never see it.
