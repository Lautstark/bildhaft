# bildhaft

[Deutsch](README.de.md) · **English**

**Turn German sentences into AAC pictograms, correct them, and print them.**

bildhaft is a tool for producing materials for augmentative and alternative
communication (AAC). You type a sentence, get a row of symbols back, fix whatever
is wrong, and print sentence strips or card sheets to laminate.

It is not a chatbot. It is built for the parents, teachers and speech therapists
who work with a non-speaking child and often translate dozens of lines in one
sitting — a whole picture book, say.

**bildhaft runs entirely in the browser.** No server, no database, no accounts, no
API keys, no tracking. Your sentences, your collections and your METACOM files
never leave your machine. The only thing that does is a single word, sent to
ARASAAC when it is asked for a matching pictogram. Answers are cached, which is a
privacy property before it is a speed one: working through the same picture book
over several weeks sends a word once rather than every time a board is reopened.
A word is re-sent if it is used again more than 30 days later, when its cached
answer has expired. The pictogram images themselves are fetched once and then
kept, with no expiry.

> The interface is German, because that is the language of the people it is for.
> The code, comments and documentation are English.

---

## Symbols and licensing

> **This repository contains no symbols.** Neither ARASAAC nor METACOM artwork is
> checked in here, and none is shipped with the app.

### ARASAAC (default)

About 13,000 pictograms with German labels, fetched from the public
[arasaac.org](https://arasaac.org) REST API at runtime and cached in the browser.

ARASAAC is licensed **CC BY-NC-SA**. Attribution is mandatory, so it appears in
the app footer *and* on every printout:

> Piktogramme: ARASAAC (arasaac.org), CC BY-NC-SA.
> Autor: Sergio Palao. Urheber: Regierung von Aragón (Spanien).

Non-commercial means material produced with ARASAAC symbols may not be exploited
commercially.

### METACOM (optional)

METACOM is a **commercial symbol set licensed per person.**

How bildhaft handles it:

- It ships **no** METACOM file and downloads none.
- It transmits **no** METACOM file — anywhere.
- If you own METACOM, you point the app at **your own licensed folder** on your own
  disk. Reading, indexing, matching and rendering all happen locally in the browser.
- Nothing *derived* from those files leaves the browser either — not even a
  filename index.

Without your own METACOM licence the feature simply does not work. That is
deliberate.

Both symbol sources, and the rules above, live in
[bildquelle](https://github.com/Lautstark/bildquelle) — a small package shared
with [vorlaut](https://github.com/Lautstark/vorlaut), so the METACOM rule is
written down, enforced and tested once instead of once per app.

### Why this is safe by construction

What gets stored is **symbol references, not images.** A saved sentence is a list
of concept keys plus the user's choices. Those references are resolved against
whichever symbol source is active only at render time.

This makes a METACOM board *structurally* impossible to store as pixels. A pleasant
side effect: the same shared sentence renders in ARASAAC for someone without a
licence and in METACOM for someone with one.

bildhaft must therefore never grow server-side rendering, an upload, or a
"share my board as an image" feature.

---

## How it works

### Matching (purely lexical, in the browser)

The pipeline is deliberately shallow — no parser, no language model. The goal is
good coverage of simple, concrete language; **the rest is corrected by hand in the
UI.**

1. **Personal dictionary** — checked *first*. Every manual correction is remembered
   as `word → symbol` and reused forever. After a few weeks of real use this beats
   the entire rest of the pipeline, because any one family's working vocabulary is
   a few hundred words.
2. **Tokenisation**, including splitting German preposition-article contractions
   (`im` → `in` + `dem`) so the meaningful preposition keeps its own slot.
3. **Function-word filtering.** AAC output is telegraphic. Articles and auxiliaries
   get no slot; pronouns, prepositions and modal verbs do. The list is data, not
   code, and is editable in the app.
4. **Lemma lookup** against a bundled lexicon split by part of speech, so German
   capitalisation can disambiguate (`Bad` ≠ `bad`, `Morgen` ≠ `morgen`). Unknown
   words fall back to suffix and umlaut rules.
5. **Separable verbs** are reassembled: `räum bitte auf` → `aufräumen`.
6. **Compound splitting** on a miss: `Apfelsaft` → `Apfel` + `Saft`,
   `Zahnbürste` → `Zahn` + `Bürste`.
7. **Synonyms** as the last fallback: `Fahrrad` → `Rad`.

A word with no match is **never silently dropped** — it gets an empty slot you can
click and fill by hand.

### Correcting

Whatever is generated counts as accepted; there is no confirmation step. Every row
is directly editable:

- **Swap a symbol**: click a slot, pick a suggestion or search yourself.
- **Remove a slot**: same dialog.
- **Add a slot**: the `+` at the end of the row.
- **Reorder**: drag slots, or use `Alt` + `←` / `→`.
- **Cross a symbol out**: same dialog. METACOM's convention for negation — "nicht
  hauen" is the *hauen* symbol with a red cross over it, not a different picture.
  It belongs to the slot, so it survives switching symbol source and travels in
  an export.

### Data model

The unit of reuse is **the sentence, not the collection.** Someone translating a
book helps the next person with the individual line.

Sentences are first-class rows keyed by `normalizedInput`. Collections are a
grouping over them with a freely chosen name (e.g. "Der Grüffelo"). That gives you,
for free: "you have translated this line before", and a flat search across
everything you have ever done.

A collection can also record **which symbol source it is drawn in**, from the `⋯`
beside its name. With no answer of its own it follows the default in settings,
including when that default later moves. It is a view preference rather than a
content one: what is stored is still references, and exporting a single
collection deliberately leaves it behind, so the file opens in whatever symbol
source its recipient has.

Storage is **IndexedDB**, saved automatically on every change. There is no save
button.

### Backup

On a static site the **JSON export** is the only backup. Clear your browser storage
and the work is gone otherwise.

- **A single collection**: the `⋯` menu next to its name.
- **Everything at once** — every collection plus your personal dictionary:
  *Einstellungen → Daten → Alles exportieren*.

Importing only ever creates **new** collections and can never overwrite existing
work. Older export files are still read.

Because only references are stored, these files are freely shareable regardless of
which symbol set anyone owns.

### Printing

Printing goes through the **browser's own print** with a print stylesheet: real
vector output, correct paper sizes, and the user's own printer settings. No
`html2canvas`, no rasterising — blurry symbols are exactly wrong on a communication
board.

Because the browser's print preview appears too late in the flow to iterate on,
there is a **built-in A4 preview** showing exactly the grid that will print.

The options are the ones that matter in practice:

- **Layout**: *sentence strip* (one row, reading order) or *card sheet* (individual
  cards for cutting up).
- **Paper**: A5, A4 or A3, portrait or landscape. Boards are nearly always
  landscape; A5 suits communication books and fans, A3 a board for a wall.
- **Card size**, for a card sheet, either way round:
  - *in millimetres* — people match existing boards, where a MetaTalk 3×5 grid has
    a specific cell size;
  - *as a grid* — say `4 × 3` and the cards divide the page exactly. This is how a
    board is specified, and the only way to fill a page on purpose. Pages are cut
    here rather than left to the browser, so the same board printed twice comes
    out with the same rows on the same sheets.
- **Cut margin** — laminating pouches need a sealed edge; cards cut flush
  delaminate.
- **Frame and background colour** — a border with a thickness, a colour and a
  corner radius, and a colour behind the symbol, so a printout can match the
  material a child already has. Drawn *inside* the cut margin: the card's own edge
  is where the scissors go. Off by default, and when off nothing is drawn at all,
  so an unframed card is exactly the size it has always been.
- **Label** on/off, above or below the symbol.
- **One sentence per page** or continuous.
- **Copyright notice** (METACOM only) — `METACOM Symbole © Annette Kitzinger` at
  the foot of the sheet. METACOM's terms require it on material that is handed out
  or published (A.6.2, A.7.2) and not for private use, so it is a choice rather
  than automatic. ARASAAC's credit is unconditional and always prints.

You can print a single row or the whole collection.

---

## Development

```bash
npm install
npm run dev
```

```bash
npm run build
```

The lexicon is generated from compact word lists. After editing
`scripts/lexicon-seeds.mjs`:

```bash
node scripts/build-lexicon.mjs
```

The generated JSON under `src/data/` is committed, so the build needs no codegen
step.

### Git hooks

`npm install` points `core.hooksPath` at `.githooks/`, so the hooks there are
live from the first install. There is one: `commit-msg` strips the
`Co-Authored-By` trailer that agent sessions add by default, which no commit in
this history carries. It matches the anthropic.com address rather than the name,
so a human co-author on the same commit survives.

Committing from a clone that has never been installed leaves the hook inactive.
To wire it up without a full install:

```bash
git config core.hooksPath .githooks
```

### Measuring lexicon coverage

```bash
node scripts/coverage.mjs --verbose
```

Reports what share of the content words in `scripts/corpus.de.txt` the lexicon
knows outright, and lists the ones it does not. The corpus is deliberately made
of the material people actually type: daily routines, therapy phrases and lines
from picture books. `--verbose` prints the misses, which is how you decide what
to add next.

The number it prints is coverage against a corpus that was itself used to choose
the vocabulary, so treat it as a floor, not a score. Judge a change by writing
fresh sentences that did not inform it.

### Tests

```bash
npm run test:e2e
```

End-to-end tests run with Playwright against the real production bundle, and
cover the paths that matter: translating a sentence, correcting a symbol and
having that correction reused, adding/removing/reordering slots, persistence
across a reload, print geometry in millimetres, export containing references
only, and the mobile navigation.

ARASAAC is mocked. The suite has to be deterministic enough to gate a deploy,
and it should not hammer a free public service on every push. The trade-off is
that a breaking change to the real API would not be caught here.

CI runs the suite on every push and pull request, and **GitHub Pages only
publishes if it passes.**

### Layout

| Path | Contents |
| --- | --- |
| `src/core/` | Matching pipeline and data model, free of UI |
| `src/db/` | IndexedDB schema, repository, export/import |
| `src/ui/` | Screen, dialogs and the element helpers they are built from |
| `src/data/` | Generated lexicon data |
| `scripts/` | Lexicon generator and its word lists |

Two things live outside this repository, both pinned to an exact release tag so
an install can never move the build on its own:
[bildquelle](https://github.com/Lautstark/bildquelle) for the symbol sources and
[design](https://github.com/Lautstark/design) for the tokens and components
shared with the sibling products.

### Constraints

- Static bundle, served from GitHub Pages. No server-side code.
- No UI framework. The screen is built from plain TypeScript over the DOM
  (`src/ui/dom.ts`), because a framework was only ever creating elements here.
- SPA routing via the `404.html` copy trick, because GitHub Pages has no rewrites.
- **No code that needs `SharedArrayBuffer`.** GitHub Pages cannot set the COOP/COEP
  headers, so v1 has no in-browser transformer or ONNX models; matching is lexical.
- Desktop is the primary target. Folder selection on mobile is not expected to work.
- **German-only interface, and this is a decision rather than a gap.** There is no
  `t()`, no language files and no language switch: every string is written where it
  is used. bildhaft's whole job is turning *German* sentences into pictograms — the
  lemmatiser, the compound splitter, the separable-verb merge and the function-word
  list are all German-specific, so an English interface would front a program that
  still only understands German input, which reads as a promise the rest of the app
  does not keep. Translating the shell is the last step of supporting a second
  language, not the first.

  Worth stating because the two sibling products went the other way — mitreden and
  vorlaut both carry de/en tables and a live switch — so this looks like an omission
  from the outside and has been read as one. If bildhaft ever does grow a second
  input language, mitreden's `src/i18n/` is the shape to copy; until then, adding
  the shell alone is not an improvement.

### Browser support for METACOM

| Browser | Folder selection | Remembers the choice |
| --- | --- | --- |
| Chrome / Edge | `showDirectoryPicker()` | yes, one-time |
| Firefox / Safari | `<input webkitdirectory>` | no, until reload |
| all | ZIP file, unpacked in-browser | no |

---

## Deliberately out of scope (v1)

Backend, database, user accounts · a public library of other people's collections ·
LLM-based disambiguation · in-browser embedding models · `pdf-lib` export · mobile
layout · user-uploaded images.

## Related

[mitreden](https://github.com/Lautstark/mitreden) is a companion project: type a
sentence, get an audio file back, so every device speaks with the same voice. Same
speech-bubble mark, in pink.

## Licence

Source code: [MIT](LICENSE). Symbols: see above — they are not part of it.
