/**
 * A sheet that states something and offers one way out of itself.
 *
 * One shape rather than a component per occasion: „Alles löschen" refused
 * because the folder is out of reach is the only one today, and the next one
 * would otherwise be a second pair of four-line files. What the two components
 * beside this hold is which of the three fields goes in the body and which in
 * the foot.
 */
export interface Saying {
  line: string;
  label: string;
  press(): void;
}
