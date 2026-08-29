/**
 * The whole of the "framework". Building elements is the only thing React was
 * still doing for this app once the pipeline, the storage and the providers had
 * moved out of it.
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

type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  /**
   * Applied with setAttribute, so aria-*, role, data-* and the rest work.
   *
   * `true` writes a bare attribute, which is what boolean attributes such as
   * hidden and disabled want. Enumerated attributes — draggable, contenteditable,
   * spellcheck — are not boolean: a bare one reads as "auto". Pass those the
   * literal string 'true'.
   */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  /**
   * Inline styles. Custom properties are allowed and are set through
   * setProperty — assigning them onto the style object does nothing, which is
   * silent and looks exactly like a stylesheet default winning.
   */
  style?: Partial<CSSStyleDeclaration> & Record<`--${string}`, string>;
  /** Event handlers, keyed by event name without "on". */
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void }>;
}

function apply(node: HTMLElement | SVGElement, props: Props): void {
  if (props.class) node.setAttribute('class', props.class);
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;

  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    // false and null remove the attribute; true writes it bare, as HTML expects.
    if (value === false || value === null || value === undefined) node.removeAttribute(name);
    else node.setAttribute(name, value === true ? '' : String(value));
  }

  for (const [name, value] of Object.entries(props.style ?? {})) {
    if (name.startsWith('--')) node.style.setProperty(name, String(value));
    else (node.style as unknown as Record<string, unknown>)[name] = value;
  }

  for (const [name, handler] of Object.entries(props.on ?? {})) {
    node.addEventListener(name, handler as EventListener);
  }
}

function append(node: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  apply(node, props);
  append(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG needs its namespace, or the browser renders an invisible unknown element. */
export function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: Child[]): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  append(node, children);
  return node;
}

/** Replaces a container's contents in one go. */
export function fill(container: Element, ...children: Child[]): void {
  container.replaceChildren();
  append(container, children);
}

/** Adds or removes a class from its boolean, which reads better than an if. */
export function toggleClass(node: Element, name: string, on: boolean): void {
  node.classList.toggle(name, on);
}
