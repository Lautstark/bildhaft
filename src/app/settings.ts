import type { AppSettings } from '../core/types.ts';
import { getProvider, metacom } from '@lautstark/bildquelle';
import type { Sicherung } from '@lautstark/sicherung';
import { refreshSlotChoices } from '../core/match.ts';
import { listSentences, overrideMap, putSentence, saveSettings } from '../db/repo.ts';
import { downloadJson, exportEverything } from '../db/exportImport.ts';
import { LANG, t } from '../i18n/index.ts';
import { openSettings } from '../ui/settingsDialog.ts';
import { resetSymbolResolution } from '../ui/symbols.ts';
import { activeCollection, providerId } from './state.ts';
import type { Ctx } from './context.ts';

/** The app's own settings: writing them, and the sheet they are edited in. */
export function settings(ctx: Ctx, backup: Sicherung): Pick<Ctx, 'persistSettings' | 'openAppSettings'> {
  const { s } = ctx;

  function persistSettings(next: AppSettings): void {
    const renderingChanged = s.settings?.metacomRendering !== next.metacomRendering;
    s.settings = next;
    void saveSettings(next);
    if (renderingChanged) {
      metacom.preferRendering(next.metacomRendering);
      void repointToRendering();
    }
    ctx.render();
  }

  /*
   * A new preference is about every row already on screen, not only the next
   * sentence: each slot holds the right symbol in the wrong rendering. Asking
   * the source again is what moves them, and re-resolving the symbols is what
   * makes the change visible — nothing about a slot's id changes on its own.
   */
  async function repointToRendering(): Promise<void> {
    const collectionId = s.activeId;
    if (!collectionId || providerId(s) !== 'metacom') return;

    s.busy = true;
    ctx.render();
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
      ctx.render();
    }
  }

  function openAppSettings(): void {
    if (!s.settings) return;
    openSettings({
      settings: s.settings,
      onChange: persistSettings,
      onProviderChanged: () => { void ctx.syncProvider(); ctx.render(); },
      onFolderChanged: () => { void ctx.refreshCollections(); if (s.activeId) ctx.setActive(s.activeId); },
      openCollectionProvider: () => activeCollection(s)?.provider ?? null,
      onNotify: ctx.notify,
      onExportAll: async () => {
        /* Whole, always: a file somebody asked for by hand has to stand on
           its own, wherever it is opened. The standing backup is the one that
           leaves the bytes where the folder already has them. */
        downloadJson(await exportEverything(true), LANG === 'de' ? 'sicherung' : 'backup');
        ctx.notify(t('ui.backup_exported'));
      },
      backup,
      onImport: (file) => void ctx.handleImport(file),
      onClearAll: () => void ctx.confirmClearAll(),
      onClose: () => ctx.render(),
    });
  }

  return { persistSettings, openAppSettings };
}
