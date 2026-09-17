# ADR 0003 — The page is Svelte components over the same core

**Status:** built, 2026-09-16 · **Applies to:** everything under `src/ui/`,
`src/app/` and `src/pieces/`, and nothing under `src/core/` or `src/db/`

The second of the four Lautstark web products to take a rendering framework,
after the wochenwerk pilot of the same day (`wochenwerk/docs/decisions/003-svelte-for-the-two-pages.md`).
What that ADR settled — Svelte 5, whole apps and never islands, the design
package's dialog frame kept, the shared vanilla panels kept — is the decision
this product is carrying out rather than re-making. What is here is what a
second, four times larger product found: the numbers, the shapes the pilot did
not have to invent, and the three things it did not meet.

## Context

Until this change bildhaft was drawn by hand. `src/ui/dom.ts` re-exported
`el()` and `fill()`; every surface built its nodes with them and then kept them
in step itself. That reconciliation was the code, and it is the code that was
wrong:

- `place()` existed because re-inserting an unchanged node blurs whatever
  inside it has focus, which turned typing a Sammlung's name into one character
  per click.
- `material.ts` carried two caches keyed by sentence id and a `renamedOnly()`
  comparison, because rebuilding a row throws away its resolved symbols.
- `banners.ts` carried a signature string, because re-inserting an unchanged
  banner restarts its spinner.
- `board.ts` carried a live preview that redrew the fields from a changed copy
  without touching the store, and had to be careful not to replace the node
  under the pointer, which would take the pointer capture with it.
- `printDialog.ts` grew a second writer, `setLive()`, the week before this
  change, because rebuilding the controls closed the colour picker somebody was
  holding open.

None of that is the product. The split of 2026-09-15 had already cut `app.ts`
from two thousand lines into a shell and a module per concern over one `Ctx`,
and each of those modules is a factory returning `{node, render(state)}` — a
component in everything but the mechanism.

The core was never the problem. `src/core/` and `src/db/` hold no DOM and are
covered by the unit tests.

## Decision

The page is Svelte 5 components over the same core. `src/App.svelte` is the
shell; `src/app/state.svelte.ts` is the one store; every surface is a component
and every handler is a plain module that reads and writes that store.

Four things were kept on purpose:

- **The core is untouched.** Not one line under `src/core/` or `src/db/`
  changed, and no unit test changed except the one line in
  `tests/unit/text-keys.test.ts` that teaches the key scanner to read `.svelte`
  files — which it has to, because a label is now most often written in markup.
- **The dialog frame is still `@lautstark/design/dialog`.** The head with its
  ✕, the body, the foot, the backdrop press and the one `close` exit are the
  package's. `src/ui/sheet.svelte.ts` mounts a body and a foot component
  straight into the frame's own containers with no wrapper between, because
  `components.css` styles those children directly. The visual baselines pass at
  a tolerance of zero, which is the proof. (That file was bildhaft's own when
  this was written; all four products had written a sheet opener around the
  same frame, and it is `@lautstark/design/svelte/sheet`'s `openSheet` since
  design v1.34.0. The decision is the one recorded here — the mounting is just
  no longer bildhaft's, and the one word it will not carry, the ✕'s name, still
  reaches it from `src/ui/dialog.ts`.)
- **The shared vanilla panels are still vanilla.** `@lautstark/sicherung`'s
  two panels, `@lautstark/bildquelle`'s METACOM panel and
  `@lautstark/design`'s language picker, collections list, rename field, menu
  and toast are built once and put in place by a `display: contents` host.
  Nothing in a shared package changed. (That host was `src/pieces/Vanilla.svelte`
  when this was written; all four products had written the same file, and it is
  `@lautstark/design/svelte/Vanilla` since design v1.34.0. The decision is the
  one recorded here — the file is just no longer bildhaft's.)
- **`#print-root` is outside the component tree.** It is in `index.html` now
  rather than built by the shell, because `@media print` hides `#app-root` and
  this is the one element that must survive that. The print dialog mounts its
  own sheet into it and unmounts it again; nothing in the tree owns its
  children.

`Ctx` is gone, and with it `render()`. The eleven callbacks the settings dialog
was handed are gone. The two focus slots — the caret into a new Sammlung's name
and a new tag's — are `src/app/asking.svelte.ts`, a rune the field reads in an
effect, which runs after the paint that puts the new name in it.

## What this product found that the pilot did not

### Every field of the store is `$state.raw`

The pilot's gotcha was that a record handed to a component becomes a proxy, and
`structuredClone()` and IndexedDB both refuse one, so every write goes through
`$state.snapshot()`. bildhaft does not call `$state.snapshot()` anywhere, and
that is not carelessness: **no proxy is ever made.** The store is a class whose
every record-bearing field is declared `$state.raw`, which is also the truth
about how they are written — nothing here is edited in place, every writer
replaces the whole value (`s.sentences = s.sentences.map(…)`). A deep proxy
would have been for a mutation that does not happen.

That is the shape to copy. `$state.raw` on a class field needs a class, because
`$state.raw` can only be written on a declaration; `$state({…})` cannot express
it per field.

### A measured layout is a plan, not DOM surgery

The print sheet is measured: how many cards fit across a row, and where the
pages fall, are facts only a laid-out sheet knows. The old code built the sheet
twice as DOM, measured one copy, cut it up in place, and applied the cut to
both. A component cannot have its children re-parented underneath it.

So the measurement hands back data. `printSheet.ts` describes the document as
`Block[]`; `PrintSheet.svelte` draws that description; the plan is measured in
three passes with `flushSync()` between them — flat, then with its rows split,
then packed into pages — and both copies are drawn from the one answer. The
printable copy is `display: none` and is never measured at all.

`flushSync()` must be called from a press or from the opener, never from an
effect: Svelte refuses a re-entrant flush. That is why `Printing.replan()` is a
method on the state object rather than an `$effect` watching the settings.

### Keeping a component is cheaper than keeping a node

Three of the hand-written caches were there to keep a *node*, because a node
rebuilt is a symbol re-resolved. A keyed `{#each}` keeps the *component*, which
is the same guarantee and needs no code: `material.ts`'s two id-keyed maps, its
`renamedOnly()` comparison and `row.ts`'s `rename()` are all gone. The one case
a key cannot cover is a card carried from the Tafel's tray into a field, which
is a different block — and the process-wide URL cache in `src/ui/symbols.ts`
answers that one without a network or a disk read.

The signature guard in `banners.ts` went the same way: a banner whose condition
still holds sits in a block that was never re-entered, so its spinner is never
restarted. And `setLive()` in the print dialog is gone, because the controls are
not rebuilt at all — the colour picker cannot be closed by a repaint that does
not happen.

## What the suite measured

The 144 e2e cases across desktop and Pixel 7, and the eight visual baselines at
a tolerance of zero, were written against the old rendering and pass unchanged
against the new one. That is the contract.

Bundle, gzipped, what the browser actually fetches:

| chunk | before | after |
| --- | --- | --- |
| the app | 111.5 kB | 135.0 kB |
| the stylesheet | 8.9 kB | 8.9 kB |
| the document | 1.2 kB | 1.4 kB |
| **the page** | **121.6 kB** | **145.3 kB** |
| jszip, fetched only to read a METACOM archive | 28.2 kB | 28.2 kB |

Nineteen per cent more on the wire, all of it the runtime and the compiled
templates. wochenwerk measured fifteen on a page two thirds of which is a
speech stack that did not change; this is the same runtime against a smaller
denominator, which is the honest way to read both.

Lines: the 8.1k of TypeScript under `src/app/`, `src/ui/` and the shell became
6.5k of TypeScript and Svelte, with every `render()`, `place()`, `fill()`,
`sync()` and cache gone. `svelte-check` replaces `tsc -b` as `npm run
typecheck` and checks the components too.

## Consequences

- **`@lautstark/toolchain` is adopted for two of its three bases, not three.**
  `tsconfig.json` and `vitest.config.ts` extend it. `playwright.config.ts` does
  not, and `@playwright/test` stays at 1.62.1 in this product's own
  `devDependencies`. The toolchain is on ^1.63, which ships Chromium 1243, and
  on that browser the renderer dies while `metacom.restore()` reads a stored
  `FileSystemDirectoryHandle` back out of IndexedDB — three METACOM cases go
  with it. It is the browser and not the app: `main`'s own build crashes
  identically once its Playwright is bumped. The visual baselines are the other
  half of the same knot, recorded at a tolerance of zero against the browser
  1.62 ships. Both want one deliberate change that moves the browser and
  re-records the pictures, and that is not this one.
- `vitest.config.ts` carries the Svelte plugin. Nothing in the unit suite
  mounts a component; it is there because `tests/unit/print-for.test.ts` asks
  `printFor()` a question about millimetres, and the module that answers sits
  beside the dialog that draws them.
- `tests/unit/text-keys.test.ts` reads `.svelte` files. Its match was already on
  the quoted string rather than on a `t(` call, so it finds a key in markup
  exactly as it finds one in a module.
- `e2e/offline.spec.ts` allows `svelte.dev`. Svelte's runtime errors carry a
  link to the page explaining each one, so the bundle names the host in a string
  it would only ever print to the console — the same shape as `rolldown.rs`
  beside it, and the test that opens the page still sees this origin and no
  other.
- The next product to move gets the same shape: one runes store of `$state.raw`
  fields, a component per surface, the design frame and the shared panels left
  as they are, and a measured layout expressed as a plan rather than as surgery.
- Two products have now mounted components into `@lautstark/design/dialog`'s
  frame with the same twenty-line helper, and both host the shared panels with
  the same six-line `display: contents` wrapper. By the two-consumer rule those
  two are the first things worth moving into a package — the frame first, the
  panels second — which is what wochenwerk's ADR said would become true and now
  is.

## What the cleanup will look like

Somebody will notice that `playwright.config.ts` is written out while its two
siblings extend the toolchain, and that `@playwright/test` is pinned to an exact
version where everything else in the family carries a range. That is the
decision above, and undoing it takes three METACOM cases down. The way out is
forwards: bump the toolchain and this product together, re-record
`e2e/visual.spec.ts-snapshots` on both platforms, and delete the pin and the
note beside it in `package.json` in the same commit.
