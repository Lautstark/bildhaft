# ADR 0005: The library first, the folder after — and nothing planned between

**Status: built, 2026-11-26.**

## Context

Opening bildhaft took long enough to be the complaint, and it was not bildhaft.
Measured on the built page, served locally, against a library of 8 Sammlungen,
240 Sätze and 1200 Felder:

| | |
|---|---|
| boot to the first thing on screen, no folder connected | 292 ms |
| opening a Sammlung, to its rows standing | 167 ms |
| reading twelve own pictures out of IndexedDB | 3 ms |

None of that is a wait anybody would report. What the page waited on before it
drew anything was, in this order, in `app/boot.ts`:

1. `restoreFolder()` — the stored handle and a permission query. Cheap.
2. `moveWortschatz()` — a once-per-household move, which still reads the old
   compartment every start to find it empty.
3. **`pullFromFolder()`** — every record file of every kind opened, read and
   parsed one after another; then **every own picture's file**, each preceded by
   a listing of the whole `bilder` folder (`#fileFor` in `@lautstark/sicherung`);
   then four stores cleared and written again, picture bytes included.
4. `bringRecordsUpToDate()`, `loadSettings()`, `listCollections()`,
   `bringPrintUpToDate()`, `setActive()` — milliseconds, all of them.

Only then was there anything on screen. Step 3 is the whole wait, and it grows
with the library: measured against the fastest storage a browser has (OPFS, as
a floor), 300 record files cost 87 ms read one after another and 44 ms read at
the same time — and a folder a person chose through the picker is several IPC
round trips per file rather than one. The household this was reported from
waits minutes. Then `watchFolder` primes its watch by reading every file again.

### Measured, with a folder store and a price on it

A folder somebody picked is brokered by the browser process, which is what the
~30 ms per directory open in `db/folder.ts`'s note was measured on; the
browser's own storage answers in about a tenth of a millisecond. So the same
library was put in a real `FileSystemDirectoryHandle` — 272 files — and every
handle call was given a conservative price of 2 ms, paid by both builds. Three
reloads each, in the steady state a person meets on every visit:

| | before | after |
|---|---|---|
| anything on screen | 3917–4075 ms | 37–40 ms |
| the open Sammlung's rows | 3989–4080 ms | 102–106 ms |

At 10 ms a call — a folder inside a sync client, or a bigger library — the
second column does not move: 37–47 ms and 106–114 ms. The first grows with the
price, which is the shape of the complaint. Nothing here made the read faster;
it is the same read, and nobody waits for it.

The copy that was sitting in IndexedDB the whole time is not a guess. It is
what the folder held when this browser last read it, plus whatever was written
here since. Drawing it first costs nothing in truth **as long as the page says
that it is about to be checked, and does not let anybody plan against it until
it has been** — which is the arrangement wochenwerk arrived at a day earlier
(its ADR 004) and the one this follows.

### The sentence this replaces

`boot.ts` said, above the first await:

> Before anything is read. Where a folder is the store it is the truth, and a
> first paint from the browser's copy would be a library that changes under
> somebody a moment later.

That is a real objection and it was never written down anywhere but there. It
stands, with one word changed: a library that changes under somebody **who has
been told it is being checked and cannot write to it yet** is a library being
checked. What it ruled out was drawing the copy *silently*, and that is still
ruled out.

## Decision

**1. The boot has two halves, and the line between them is what the folder
costs.** The first reads this browser's own copy — settings, Sammlungen, the
open one's rows — and ends with the library on screen. The second reaches for
the folder, and draws again once it has answered.

`restoreFolder()` stays in the first half: it opens no file, and having asked
means `isStore()` answers truthfully for the two decisions under it.

**2. The page still waits for its own store, and that is not the same wait.**
`App.svelte`'s `ready = s.settings !== null` is unchanged, so the spinner still
stands until IndexedDB has answered — milliseconds. This is deliberately less
than wochenwerk does: it mounts before any store read and had to seed a
structurally complete empty week to survive it. Three things here rest on the
page not drawing before the database has answered:

- adr/0001's refusal has to reach the person **in place of the spinner**
  (`App.svelte`'s `instead`), and `e2e/upgrade.spec.ts` asserts that sentence
  lands in `#root`;
- adr/0004 says a record newer than this build must not be drawn at all, so
  `bringRecordsUpToDate()` — which is where the browser's own copy is asked its
  format — moved into the first half and now runs **even where a folder is the
  store**, where it used to return at once and leave the question to the
  folder's own check on the way in. The folder's answer arrives after the first
  paint now; this browser's cannot;
- every e2e spec waits for „Satz eingeben" to mean "the settings are there".

**3. An empty library waits for the folder before it invents anything.**
`createCollection()` files the new record into the folder as well. A household
whose browser copy is empty while the folder holds their library — a new
machine, cleared site data — would otherwise have one empty „Material vom …"
added to their folder on every start, immediately before the read that was
about to bring the real one in. So the first half creates one only where no
folder is the store, and the second half creates one if the folder turns out to
hold nothing either.

**4. A folder read is one state, said in one place.** `pullFromFolder()` is the
only thing that replaces the library with the folder's copy, and every route to
it — the boot, the five-minute watch, the permission click — goes through it.
So `db/repo.ts` announces it from there (`onSyncing`), `app/syncing.svelte.ts`
holds it as a rune, and the page reads it. Nothing that calls
`pullFromFolder()` has to remember to say so.

The rune also counts the boot itself as unconfirmed, from the first paint until
`booted()`. Between the library being drawn and the read beginning lie the
Wortschatz's old compartment and the folder's mark, and a line typed in that
moment would be typed against a library nobody has checked. Where no folder is
connected that is a few milliseconds.

**5. It is said in the banner region, and only once the wait is worth a
sentence.** „Dein Ordner wird gelesen …" shares the busy banner with the two
things already there, for the reason that banner's own note gives: they are the
same sentence — something is working, wait. It is said first where more than one
is true, because it is also a promise about what is on screen. conventions.md
§3.8 allows two live regions and bildhaft has both already; this adds no third.

Drawn only after 400 ms. A household with no folder confirms its boot in a few
milliseconds and the watch finds nothing changed in not much longer, so without
the delay the banner would flash past on every load and twice an hour
afterwards. The delay is a timer in the component rather than a keyframe on
`visibility`, which is how wochenwerk does it for a span in a top bar: a banner
is a block, and one hidden but drawn would hold its height open for nothing.

**6. Nothing is planned while it runs, held at two levels.**

- *The page.* The three doors that write into the library say why instead of
  opening: typing a line (`handleSubmit`), picking a symbol (`openPicker`), and
  „+ Neues Material" (`handleNewCollection`). Reading, stepping between
  Sammlungen, printing and Einstellungen stay open — none of them plans against
  the library on screen.
- *The store.* Every write into the four stores the read replaces waits for it.
  `claim()` waits, which covers the Sätze and the Sammlungen and `resolveOpen`'s
  write-backs; `patchOverride` waits, which covers the Wortschatz; the handful
  that go through neither wait at their first line, and so do the three ways a
  file comes in (`importCollectionFile`, `importBackup`, `copyCollection`).
  `tests/unit/sync-window.test.ts` asks that of each of them by name.

This second level is the guarantee, and it is not decoration: `pull` empties
four stores and fills them again, and a write landing between the two halves is
a write the second half deletes. The page's three doors are where somebody
*notices*; the store's gate is what holds for the writes nobody is looking at.

## What this does not change

- **The folder is still read whole**, every time. Reading only the files whose
  stamps changed would make the read shorter, and it is worth noting why that
  is not a small change: `Ablage.list()` opens and parses every file to pull
  `updatedAt` out of its body, so a stamps-first pass costs what a full read
  costs. It would need the stamp outside the file — `lastModified`, or in the
  name. This decision makes the read something nobody has to stare at, which is
  the half that was missing.
- **A save still waits for the folder.** A write reaches IndexedDB and then the
  file, and the caller waits for both. Returning once the browser has it, with
  a row saying the folder is owed the change, is the next decision (wochenwerk's
  ADR 005) and not this one.
- **Own pictures are still read whole**, both out of the folder on every read
  and into every `<img>` on screen. Twelve pictures at 4032×3024 are 175 ms of
  decoding and 558 MB of bitmaps, against 8 ms and 2.3 MB as 256-px thumbnails;
  that is its own change and its own commit.
- **Conflicts are still not reported.** `conflicts()` has been exported from
  `db/folder.ts` and called by nothing since it was added. Nothing here makes
  that worse: a write still reaches the folder before the caller returns.

## What the cleanup will look like

Three things here read as redundancy and are not:

- **`booting` in `app/syncing.svelte.ts`, which is true before any sync has
  been announced.** It looks like belt and braces over `onSyncing`. It covers
  the gap between the first paint and the read beginning, and removing it makes
  a sheet opened in that gap legal again.
- **`bringRecordsUpToDate()` running where a folder is the store**, which looks
  like work the folder's own check repeats. It is the only thing asking whether
  *this browser's* records are newer than this build, and with the first paint
  ahead of the folder it has to run before anything is drawn.
- **`boot.ts` awaiting `whenOpened()` before the read.** It looks like a wait on
  work that is already fire-and-forget. `syncing()` in `db/repo.ts` deliberately
  does not wait for writes in general — a write registers itself as in flight
  *before* it waits for the sync, so a sync that waited for the write map to
  empty would wait for writes that are waiting for it. The one write a boot
  reliably has in the air is the open Sammlung's resolve, and this is it.

What is left open, and knowingly: a write that passes the gate in the same tick
a read begins is still a write the read can clear. The page's three doors make
it all but unreachable, and closing it properly is the write funnel ADR 005's
successor would bring.
