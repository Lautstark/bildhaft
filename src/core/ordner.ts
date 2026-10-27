import type { Collection, CollectionKind, OrdnerEntry } from './types.ts';

/** What „Alle drucken" prints: a template's whole group, or one Ordner in it. */
export interface GroupPrintWhich {
  kind: CollectionKind;
  ordner?: string;
}

/** One Ordner of a template's group: its name and the materials in it. */
export interface Ordner {
  name: string;
  rows: Collection[];
}

/** Ordner names are one Ordner whatever their case: „Kita" and „kita". */
export const ordnerKey = (name: string): string => name.trim().toLocaleLowerCase('de');

export const sameOrdner = (a: string | undefined, b: string | undefined): boolean =>
  a !== undefined && b !== undefined && ordnerKey(a) === ordnerKey(b);

/**
 * The Ordner of one template's group, and what lies loose in it.
 *
 * Every Ordner the settings know for this template, empty or not, and every
 * one a material names besides. A name keeps the spelling the settings gave
 * it, else the first material's in the order the rows come — the sidebar's,
 * newest first — and the rows inside keep that order too. Ordner are sorted
 * by name, so one does not jump to the top because something in it was just
 * edited.
 */
export function ordnerOf(
  rows: readonly Collection[], kind: CollectionKind, known: readonly OrdnerEntry[],
): { ordner: Ordner[]; loose: Collection[] } {
  const byKey = new Map<string, Ordner>();
  for (const entry of known) {
    if (entry.kind !== kind || !entry.name.trim()) continue;
    const key = ordnerKey(entry.name);
    if (!byKey.has(key)) byKey.set(key, { name: entry.name.trim(), rows: [] });
  }
  const loose: Collection[] = [];
  for (const row of rows) {
    const name = row.ordner?.trim();
    if (!name) { loose.push(row); continue; }
    const key = ordnerKey(name);
    const held = byKey.get(key);
    if (held) held.rows.push(row);
    else byKey.set(key, { name, rows: [row] });
  }
  const ordner = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { ordner, loose };
}

/** A name nobody in this group has yet: `base`, else `base 2`, `base 3` … */
export function freeName(base: string, taken: readonly string[]): string {
  const held = new Set(taken.map(ordnerKey));
  let name = base;
  for (let n = 2; held.has(ordnerKey(name)); n++) name = `${base} ${n}`;
  return name;
}

/**
 * What a copy of a material is called before it is renamed: „Frühstück
 * (Kopie)", and „Frühstück (Kopie 2)" when that is taken. `word` is the
 * page's word for it; a copy of a copy is numbered rather than nested.
 */
export function copyName(name: string, taken: readonly string[], word: string): string {
  const held = new Set(taken.map(ordnerKey));
  const quoted = word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const stem = name.replace(new RegExp(` \\(${quoted}(?: \\d+)?\\)$`, 'u'), '');
  let candidate = `${stem} (${word})`;
  for (let n = 2; held.has(ordnerKey(candidate)); n++) candidate = `${stem} (${word} ${n})`;
  return candidate;
}
