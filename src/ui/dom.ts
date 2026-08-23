/**
 * The whole of the "framework". Building elements is the only thing React was
 * still doing for this app once the pipeline, the storage and the providers had
 * moved out of it.
 *
 * Every label this file helps build is German, written where it is used, and
 * there is deliberately no t() to route it through. bildhaft turns *German*
 * sentences into pictograms — the lemmatiser, the compound splitter and the
 * function-word list are all German-specific — so an English shell would front a
 * program that still only understands German input. mitreden and vorlaut both
 * carry de/en tables, which is why the absence here reads as an oversight from
 * the outside; it is not one. See README.md, "Constraints", before adding one.
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
