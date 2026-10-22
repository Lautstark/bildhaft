/**
 * Where the caret is owed, for a name that is made before it is chosen: a
 * tag's.
 *
 * conventions.md §1.5: „+ Neuer Tag" makes the tag at once and puts the caret
 * in its name, selected, so the first keystroke replaces the placeholder it
 * was given. („+ Neue Sammlung" did too until 2026-10-22; its caret goes into
 * its box now.) The act happens in a controller
 * module and the field belongs to a component, and this rune is the whole of
 * what passes between them.
 *
 * It used to be a pair of function slots on the shared context (`views.focusName`,
 * `views.words.nameIt`), assigned by whichever module had built the field. The
 * ordering that needed — focus *after* the paint that puts the new name in —
 * is a thing runes give for nothing: an effect runs after the DOM is updated,
 * so the component reads this once its own field already says the new name.
 */
let asked = $state<'tag-name' | null>(null);

export const asking = (): 'tag-name' | null => asked;

export function askFor(what: 'tag-name'): void { asked = what; }

/** Said by whichever field took the caret, so the next ask is a new one. */
export function answered(): void { asked = null; }
