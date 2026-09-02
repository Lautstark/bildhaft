/**
 * This app's words about the DOM. The building itself is
 * @lautstark/werkzeuge/dom's since 1.2.0 — this file was its base, having been
 * through the most surfaces of the four copies, and two rules it did not have
 * came with the move: wochenwerk's aria-boolean handling and vorlaut-editor's
 * throwing `byId`.
 *
 * What is left here is the header, which is about language and not about
 * elements, and the re-export so that no call site had to move.
 *
 * This header used to say that every label here is German, that there is
 * deliberately no t() to route it through, and that an English shell would
 * front a program which only understands German input. That was true and is
 * not: `src/i18n/` carries de and en tables whose keys are held level by
 * tests/unit/texts.test.ts, bildquelle grew an English pipeline beside the
 * German one, and main.ts tells it which language the page is in.
 *
 * So the rule is now the ordinary one — **a label goes through `t()`** — and
 * anything citing this comment as a reason to write German in place is citing
 * something that is no longer here.
 *
 * The leftovers this paragraph used to list — the print dialog, the slot
 * picker, and `defaultCollectionName()`, which named every new Sammlung with a
 * German sentence around a `de-DE` date — are gone as of 2026-08-29, along with
 * the composer's hint, the search heading, the import toast and the printed
 * credit line. What replaces the list is a check: tests/unit/text-keys.test.ts
 * fails when a key is asked for and not declared, and again when a key is
 * declared and nobody asks for it. The second half is what notices the next
 * German sentence written in place, because the key it should have used goes
 * quiet.
 *
 * Two things it cannot see, so they are named here instead. Numbers and dates
 * go through `LOCALE` in i18n/index.ts rather than through the table, and
 * `status.message` from `@lautstark/bildquelle` is German whatever this page is
 * set to — four surfaces draw it, and the words are the package's to fix.
 */

export { el, fill, svg, toggleClass, byId } from '@lautstark/werkzeuge/dom';
export type { Props } from '@lautstark/werkzeuge/dom';
