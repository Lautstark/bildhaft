# Gestaltung in Bearbeiten — paused

Written 2026-10-22. **Paused on Stefanie's word: the design is okay but not
mature enough to implement.** Nothing of it is on main. The code of the last
state is on the branch `wip/gestaltung-in-bearbeiten` (bf4d771), built on main
as of 2026-10-22 afternoon. This is the note the next session should start
from; read it before touching the print menu's look settings.

## The question

After the print menu was unified (533d34d, 079352a, 6e631d0), Stefanie asked
whether settings like Kartenhintergrund and Seitenfarbe — „eigentlich fast
alles in Gestaltung" — should move from Drucken to Bearbeiten. The data already
lives on the material (`Collection.print`, only the diff to the template); the
question is purely *where it is set*.

## What was settled

- **Her workflow is the yardstick.** She designs the material, then goes to
  Drucken and tweaks sizes until it fits the paper. So the rule that came out
  of it: *would you change this setting if you printed the same thing on
  other paper?* Yes → Drucken. No → Bearbeiten.
  - Drucken: Papier, Größe (Symbol · Karte · Raster, mm), Rand, Abstand,
    **all font sizes** (Wort, Satz, Liedtext, Titel), Titel drucken with
    Erste · Jede Seite, Schnittlinien, ein Satz pro Seite, Fußzeile.
  - Bearbeiten: colours, frame (on, colour, thickness, corners), word on and
    oben/unten, title line, template extras without a size (Satz über/unter,
    Streifenrahmen, freie Felder gestrichelt, Lied checks).
  - Only the word is split: on/where in Bearbeiten, size in Drucken.
- **Bearbeiten already mixes structure and look** (a Tafel's Spalten/Zeilen
  and group colours), so look settings there are not foreign to it. Spalten
  and Zeilen stay where they are; the field size is not shown in Bearbeiten.
- **No fold-out panel.** Options stand in one line over the material
  (the „Leiste", variant A of the layout mock).
- **The title stays as it is** (written in Bearbeiten, „Titel drucken" in
  Drucken). Only its colour and line were to move into the bar.
- **Title colour and text colour are independent, everywhere.** A single
  material „Farbe" for title and frames was tried and rejected.
- **Colours from one palette:** the eight hues of the Tafel's groups, strong
  for lines/text, pale for grounds, plus a colour of one's own; picking a
  colour switches it on, „keine" first where none is allowed.
- **Plauderbuch** has nothing to design and prints no title by design (every
  sheet is a page of the book). A cover sheet was mentioned, not decided.

## What she did not like / why it is paused

At the end she said she does not like any of the built state yet. Things that
were visibly unresolved:

- The bar grew to seven or eight buttons per template; still feels busy.
- In Bearbeiten the title line (`src/ui/TitleLine.svelte`) does not show its
  colour or line, so the title colour button seems to do nothing there.
- The wall in Bearbeiten drawn on a white/coloured „paper" is a big visual
  change to Bearbeiten that was never mocked on its own.
- How the other templates' Bearbeiten views would show their print look
  (Satzstreifen rows, Tafel, Rezept, Lied, Einkaufsliste) was mocked but
  never tried; each needs its own drawing.

Start the next round with a mock, not code, and her yes before building.

## The mocks (claude.ai artifacts, private to her)

| Mock | What |
|---|---|
| https://claude.ai/artifact/YFLP3FgfWKJSJP4e734sLw | first question: A/B/C — she picked B (Bearbeiten shows the print look) |
| https://claude.ai/artifact/CEy98Mvbip5C9SijT4h5VT | layout: Leiste / Spalte / am Papier / offen — she picked Leiste |
| https://claude.ai/artifact/YXvGL8GuTha4Hx8XMS88DM | the paper-test rule for all seven templates (approved) |
| https://claude.ai/artifact/FdkBcAxHMzDjUEaCKC6Q3P | streamlining steps 1–4 (picked 1–3; step 3 later rejected) |

## What is on the branch

- `src/ui/LookBar.svelte`, `src/ui/ColourPick.svelte` — the bar and the
  palette picker; buttons appear per `offers` of the template.
- `src/ui/palette.ts` — the Tafel's `ZONE_COLOURS`, moved out of
  `Tafel.svelte` so both use one palette.
- `Template.lookInEdit` in `src/app/templates.ts`, set only on Wortkarten.
  `PrintOptions.svelte` hides the look options for such a template and shows
  „Schrift" (Wort pt, Titel pt) and „Titel" groups instead.
- `materialPrint()` in `src/app/print.ts` — the open material's print
  settings with `set`/`patch`, kept the same way as the print view keeps them.
- `PrintSettings.textColour` (default black) — every printed text but the
  title; drawn through `--text-colour` on the sheet. Drucken offers
  „Textfarbe" for templates that still set their look there.
- `src/app/Material.svelte` draws the Wortkarten wall with the print look
  (CSS vars, `words--look` in `app.css`).
- e2e: „Wortkarten set their look in Bearbeiten, and print it", and the
  title-heading test adapted.

The branch passed svelte-check, 216 unit tests and the full e2e suite (179)
when it was left. It will need a rebase onto main; `Material.svelte`,
`texts.ts` and `PrintOptions.svelte` are files other sessions change often.

## Landed on main from the same session

92f9451 — the Größe group's texts: no second „Größe" above the switch, one
short line per option, „Kartengröße: …" / „Feldgröße: …" / „Symbolgröße: …",
margin notes without the Laminierfolie.
