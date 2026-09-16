import { metacom } from '@lautstark/bildquelle';
import { isBlockedByOtherTab, onBlockedChange, takeMigrationNote } from '../db/db.ts';
import { createCollection, listCollections, loadSettings, pullFromFolder } from '../db/repo.ts';
import { ablage, adopted, moveWortschatz, restoreFolder, watchFolder } from '../db/folder.ts';
import { offerRescue } from '../ui/rescue.svelte.ts';
import { resetSymbolResolution } from '../ui/symbols.ts';
import { openNamed, refreshCollections, setActive } from './collections.ts';
import { notify } from './notify.ts';
import { standing } from './standing.ts';
import { s } from './state.svelte.ts';
import { t } from '../i18n/index.ts';

/**
 * Reading what there is, and saying what changed.
 *
 * Everything here used to stand at the foot of `mountApp`, between the shell it
 * built and the render it called. Neither is its business — the page draws
 * itself from the store now — so what is left is the order the reads have to
 * happen in, which is the part that was always the reasoning.
 *
 * `say` is how the page is told before there is a toast to tell it in: until
 * the first records are read the only thing on screen is a spinner, and a
 * message has to go there instead.
 */
export function boot(say: (message: string) => void): void {
  void (async () => {
    /* Before anything is read. Where a folder is the store it is the truth, and a
       first paint from the browser's copy would be a library that changes under
       somebody a moment later. */
    await restoreFolder().catch(() => null);
    /* Before the first read, because it changes where the Wortschatz is read
       from. A folder written by a version that kept it under `bildhaft/` hands
       its words over here, once. */
    await moveWortschatz().catch(() => 0);
    await pullFromFolder().catch(() => false);

    const loaded = await loadSettings();
    let all = await listCollections();

    if (all.length === 0) all = [await createCollection()];

    const wanted = all.find((c) => c.id === loaded.lastCollectionId) ?? all[0]!;

    s.settings = loaded;
    // Before anything resolves a symbol: the preference orders search results,
    // so a slot filled in ahead of it would be filled from the wrong rendering.
    metacom.preferRendering(loaded.metacomRendering);
    s.collections = all;
    /* What the first paint draws with, recorded before setActive() can compare
       against it. Without this the initial guess is 'arasaac' and every load of
       a library whose source is METACOM would re-resolve and rewrite every
       sentence in the open collection — work that changes nothing. */
    s.previousProvider = wanted.provider ?? loaded.activeProvider;
    setActive(wanted.id);

    // Only judge the symbol source once it has had its chance to come back.
    metacom.restore().catch(() => undefined).finally(() => { s.sourceSettled = true; });

    /* Where the work already lives in a folder, the dated copies go beside it.
       The store fills `<folder>/bildhaft/` and these are flat files above it, so
       the two never meet — and nobody is asked to pick a second folder that reads
       almost exactly like the first.

       Otherwise as before: never prompts, because there is no gesture here. A
       folder that needs its permission re-confirmed lands in needs-permission and
       says so in the panel, which is where the click can happen. */
    const backup = standing();
    const alreadyHeld = ablage.handle();
    if (alreadyHeld) void backup.useFolder(alreadyHeld).catch(() => undefined);
    else backup.restore().catch(() => undefined);

    /* Somebody else's edit, arriving as a file that changed under this browser.
       Only once the folder is the store: a folder mid-adoption changes
       constantly, and all of those changes are ours. */
    void adopted().then((yes: boolean) => {
      if (yes) watchFolder(() => void pullFromFolder().then(() => {
        void refreshCollections();
        if (s.activeId) setActive(s.activeId);
      }));
    });

    /*
     * What the upgrade did, if it did anything. adr/0001: an upgrade that
     * reorganised somebody's storage without saying so is indistinguishable,
     * from where they are standing, from one that lost something.
     *
     * Said here rather than from inside db.ts, and after the settings are in
     * the store, for two reasons: notify() writes into a toast the shell only
     * mounts once there is something to draw, and the count of Sammlungen is
     * the one number a person can check the claim against — so it is worth
     * saying once the library it counts is on screen behind it.
     */
    const carried = takeMigrationNote();
    if (carried) {
      notify(carried.collections === 1
        ? t('ui.db_carried_one', { from: carried.from, to: carried.to })
        : t('ui.db_carried', { from: carried.from, to: carried.to, n: carried.collections }));
    }

    // Last, and after the first paint: this may add a Sammlung and open it,
    // and notify() writes into a toast the page has to be drawing already.
    await openNamed();
  })().catch((error: unknown) => {
    /*
     * Boot had no catch at all until adr/0001, and the failure it was missing
     * is the one that ADR is about: a database this build cannot read left
     * every await here hanging, and the page sat on its spinner with no
     * message. Two answers, and which one it is matters — a refusal means the
     * records are all still there and the person is owed them as a file, which
     * is what the sheet does. Everything else is an ordinary failure to open a
     * database, and it gets a sentence rather than silence.
     */
    if (offerRescue(error, { report: say, again: () => location.reload() })) return;
    say(t('ui.db_failed', {
      error: error instanceof Error ? error.message : String(error),
    }));
  });

  /*
   * Whenever METACOM becomes usable again — a folder picked, a zip read,
   * permission re-granted — every symbol has to be told to try again. Nothing
   * about a slot changes when access returns, so without this the ones that had
   * already given up stay blank and the recovery looks like it did nothing.
   */
  let wasReady = metacom.isReady();
  metacom.subscribe(() => {
    const nowReady = metacom.isReady();
    if (nowReady && !wasReady) {
      resetSymbolResolution('metacom');
      // Forget the old failures too, or the warning outlives the problem.
      s.unreadable = 0;
    }
    wasReady = nowReady;
  });

  onBlockedChange(() => { s.dbBlocked = isBlockedByOtherTab(); });
}
