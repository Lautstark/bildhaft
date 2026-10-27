/**
 * Ordner: materials of one template that belong together, drawn inside their
 * template's group in the sidebar. Her picks, 2026-10-27: „B" (an Ordner
 * holds one template), all three ways in — „+ Neuer Ordner" at the end of a
 * group makes an empty one, „In Ordner legen …" in the ⋯ beside a name, and
 * dragging one material onto another — and „Kopieren …" beside them.
 *
 * Nothing here deletes a material. Deleting an Ordner lets what was in it lie
 * loose in the group again, so it asks nothing.
 */
import type { Collection, CollectionKind, OrdnerEntry } from '../core/types.ts';
import { kindOf } from '../core/types.ts';
import { copyName, freeName, ordnerOf, sameOrdner } from '../core/ordner.ts';
import { patchCollection, saveCollectionOrdner } from '../db/repo.ts';
import { copyCollection } from '../db/exportImport.ts';
import { t } from '../i18n/index.ts';
import { openOrdnerSheet } from '../ui/ordnerSheet.svelte.ts';
import { openCopySheet } from '../ui/copySheet.svelte.ts';
import { activeCollection, s } from './state.svelte.ts';
import { persistSettings } from './settings.ts';
import { refreshCollections, setActive } from './collections.ts';
import { notify } from './notify.ts';

const known = (): OrdnerEntry[] => s.settings?.ordner ?? [];

/** The Ordner of one template's group, as the sidebar draws them. */
export const ordnerIn = (kind: CollectionKind) =>
  ordnerOf(s.collections.filter((c) => kindOf(c) === kind), kind, known());

/** Into the settings' list, so the Ordner stays when it is emptied. */
function remember(kind: CollectionKind, name: string): void {
  if (!s.settings) return;
  if (known().some((entry) => entry.kind === kind && sameOrdner(entry.name, name))) return;
  persistSettings({ ...s.settings, ordner: [...known(), { kind, name }] });
}

/** „+ Neuer Ordner": an empty one, its name open for typing. */
export function handleNewOrdner(kind: CollectionKind): void {
  const name = freeName(t('ui.new_ordner_name'), ordnerIn(kind).ordner.map((o) => o.name));
  remember(kind, name);
  s.renamingOrdner = { kind, name };
}

/** A material into an Ordner of its template, or loose again with `null`. */
export async function putInOrdner(id: string, name: string | null): Promise<void> {
  const collection = s.collections.find((c) => c.id === id);
  if (!collection) return;
  if (name) remember(kindOf(collection), name);
  await saveCollectionOrdner(id, name);
  await refreshCollections();
}

/**
 * Its new name, for the Ordner and every material in it. An emptied field,
 * or the name of another Ordner of the group, keeps the old one: two Ordner
 * under one name would be one.
 */
export async function renameOrdner(kind: CollectionKind, from: string, raw: string): Promise<void> {
  /* Once: Enter keeps the name, and the field's blur as it goes would
     otherwise keep it a second time, against the name it has just become. */
  if (!s.renamingOrdner) return;
  s.renamingOrdner = null;
  const to = raw.trim();
  if (!to || to === from || !s.settings) return;
  const clash = ordnerIn(kind).ordner.some((o) => !sameOrdner(o.name, from) && sameOrdner(o.name, to));
  if (clash) { notify(t('ui.ordner_taken', { name: to })); return; }
  persistSettings({
    ...s.settings,
    ordner: [
      ...known().filter((entry) => !(entry.kind === kind && sameOrdner(entry.name, from))),
      { kind, name: to },
    ],
  });
  for (const c of s.collections) {
    if (kindOf(c) === kind && sameOrdner(c.ordner, from)) await patchCollection(c.id, { ordner: to });
  }
  await refreshCollections();
}

/** The Ordner goes; what was in it lies loose in the group again. */
export async function deleteOrdner(kind: CollectionKind, name: string): Promise<void> {
  if (!s.settings) return;
  persistSettings({
    ...s.settings,
    ordner: known().filter((entry) => !(entry.kind === kind && sameOrdner(entry.name, name))),
  });
  let n = 0;
  for (const c of s.collections) {
    if (kindOf(c) === kind && sameOrdner(c.ordner, name)) { await patchCollection(c.id, { ordner: undefined }); n++; }
  }
  await refreshCollections();
  notify(n === 0 ? t('ui.ordner_deleted_empty', { name }) : t('ui.ordner_deleted', { name, n }));
}

/**
 * One material dropped on another in the sidebar. Into the other's Ordner
 * where it has one; else both into a new one, whose name is then typed. Only
 * within a template: an Ordner holds one.
 */
export async function dropOnMaterial(movedId: string, ontoId: string): Promise<void> {
  const moved = s.collections.find((c) => c.id === movedId);
  const onto = s.collections.find((c) => c.id === ontoId);
  if (!moved || !onto || moved.id === onto.id) return;
  const kind = kindOf(onto);
  if (kindOf(moved) !== kind) { notify(t('ui.ordner_one_template')); return; }
  if (onto.ordner) { await putInOrdner(moved.id, onto.ordner); return; }
  const name = freeName(t('ui.new_ordner_name'), ordnerIn(kind).ordner.map((o) => o.name));
  remember(kind, name);
  await saveCollectionOrdner(onto.id, name);
  await saveCollectionOrdner(moved.id, name);
  await refreshCollections();
  s.renamingOrdner = { kind, name };
}

/** One material dropped on an Ordner, or on its group's heading (`null`, out). */
export async function dropInOrdner(movedId: string, kind: CollectionKind, name: string | null): Promise<void> {
  const moved = s.collections.find((c) => c.id === movedId);
  if (!moved) return;
  if (kindOf(moved) !== kind) { notify(t('ui.ordner_one_template')); return; }
  if (name === null ? !moved.ordner : sameOrdner(moved.ordner, name)) return;
  await putInOrdner(movedId, name);
}

/** „In Ordner legen …" for the open material. */
export function openOrdnerChoice(): void {
  const collection = activeCollection();
  if (!collection) return;
  const kind = kindOf(collection);
  openOrdnerSheet({
    collection,
    ordner: ordnerIn(kind).ordner.map((o) => ({ name: o.name, count: o.rows.length })),
    onPick: (name) => putInOrdner(collection.id, name),
  });
}

/** „Kopieren …" for the open material. */
export function openCopy(): void {
  const collection = activeCollection();
  if (!collection) return;
  openCopySheet({
    collection,
    name: copyName(collection.name, s.collections.map((c) => c.name), t('ui.copy_word')),
    onCopy: (name, withContent) => handleCopy(collection, name, withContent),
  });
}

async function handleCopy(source: Collection, name: string, withContent: boolean): Promise<void> {
  const copy = await copyCollection(source, name, withContent);
  await refreshCollections();
  setActive(copy.id);
  notify(withContent ? t('ui.copied_all', { name: copy.name }) : t('ui.copied_look', { name: copy.name }));
}

