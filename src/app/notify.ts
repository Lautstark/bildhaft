import { announcer } from '@lautstark/design/toast';

/**
 * The page's one line of acknowledgement.
 *
 * The rule it lives under is @lautstark/design/toast's: the node is mounted
 * once, with the app, and never taken out again — App.svelte renders it and
 * hands it here. A reader announces a change in something it was already
 * watching, so a region that arrives already carrying its message announces
 * nothing at all.
 *
 * This product is why that module refuses a node it did not get handed. The
 * code here used to set the text, append the node, and remove it again 3.2
 * seconds later, and every acknowledgement the page made was silent: a saved
 * image, an exported Sammlung, a failed import, "Alle Daten gelöscht". The
 * words were on screen and correct the whole time, which is why nothing ever
 * looked wrong. mitreden had the same failure by a different route.
 *
 * What is bildhaft's rather than shared is what happens after: the line
 * empties, so the page goes quiet. Empty it paints nothing (`.toast:empty` in
 * app.css) and it is position:fixed besides, so it costs no room.
 *
 * A module rather than a slot on a context object, because every part of the
 * controller says something at some point and none of them has any other
 * reason to know about the shell. conventions.md §3.8 is the rule and
 * e2e/announce.spec.ts is this product's copy of it; the module's own tests
 * hold the half that is shared.
 */
let line: { rests(message: string): void } | null = null;

/** Called once, by the shell, with the element it renders for the purpose. */
export function useToast(node: HTMLElement): () => void {
  const made = announcer(node, {
    rest: 3200,
    onRest: (rested) => { rested.textContent = ''; },
  });
  line = made;
  return () => { line = null; };
}

// rests(), not say(): every message here fades, which is what makes the page
// go quiet. vorlaut has both verbs on one line and mitreden uses neither.
export function notify(message: string): void {
  line?.rests(message);
}
