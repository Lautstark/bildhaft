import type { AppSettings } from '../core/types.ts';
import { getProvider, metacom } from '@lautstark/bildquelle';
import { refreshSlotChoices } from '../core/match.ts';
import { listSentences, overrideMap, putSentence, saveSettings } from '../db/repo.ts';
import { openSettings } from '../ui/settingsDialog.svelte.ts';
import { resetSymbolResolution } from '../ui/symbols.ts';
import { providerId, s } from './state.svelte.ts';

/** The app's own settings: writing them, and the sheet they are edited in. */

export function persistSettings(next: AppSettings): void {
  const renderingChanged = s.settings?.metacomRendering !== next.metacomRendering;
  s.settings = next;
  void saveSettings(next);
  if (renderingChanged) {
    metacom.preferRendering(next.metacomRendering);
    void repointToRendering();
  }
}

/*
 * A new preference is about every row already on screen, not only the next
 * sentence: each slot holds the right symbol in the wrong rendering. Asking
 * the source again is what moves them, and re-resolving the symbols is what
 * makes the change visible — nothing about a slot's id changes on its own.
 */
async function repointToRendering(): Promise<void> {
  const collectionId = s.activeId;
  if (!collectionId || providerId() !== 'metacom') return;

  s.busy = true;
  try {
    const overrides = await overrideMap('metacom');
    const updated = await Promise.all((await listSentences(collectionId)).map(
      async (sentence) => ({
        ...sentence,
        slots: await refreshSlotChoices(sentence.slots, getProvider('metacom'), overrides),
      })));
    for (const sentence of updated) await putSentence(sentence);
    s.sentences = updated;
    resetSymbolResolution('metacom');
  } finally {
    s.busy = false;
  }
}

/**
 * The sheet.
 *
 * It used to be handed eleven callbacks, which was the shape a factory over a
 * shared context had to take: the dialog could reach nothing itself. It reaches
 * the same modules everything else does now, so what is left to pass is the
 * standing backup — which is made once, with the app, and is the one thing the
 * dialog cannot ask a module for.
 */
export function openAppSettings(): void {
  if (!s.settings) return;
  openSettings();
}
