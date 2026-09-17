/**
 * Where the caret is owed, for the two names that are made before they are
 * chosen.
 *
 * conventions.md §1.5: „+ Neue Sammlung" and „+ Neuer Tag" make the thing at
 * once and put the caret in its name, selected, so the first keystroke replaces
 * the date or the placeholder it was given. The act happens in a controller
 * module and the field belongs to a component, and this rune is the whole of
 * what passes between them.
 *
 * It used to be a pair of function slots on the shared context (`views.focusName`,
 * `views.words.nameIt`), assigned by whichever module had built the field. The
 * ordering that needed — focus *after* the paint that puts the new name in —
 * is a thing runes give for nothing: an effect runs after the DOM is updated,
 * so the component reads this once its own field already says the new name.
 */
let asked = $state<'collection-name' | 'tag-name' | null>(null);

export const asking = (): 'collection-name' | 'tag-name' | null => asked;

export function askFor(what: 'collection-name' | 'tag-name'): void { asked = what; }

/** Said by whichever field took the caret, so the next ask is a new one. */
export function answered(): void { asked = null; }
