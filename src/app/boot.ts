import { metacom } from '@lautstark/bildquelle';
import { isBlockedByOtherTab, onBlockedChange, takeMigrationNote } from '../db/db.ts';
import {
  bringRecordsUpToDate, createCollection, dataIsNewer, listCollections, loadSettings, pullFromFolder,
} from '../db/repo.ts';
import { ablage, adopted, isStore, moveWortschatz, restoreFolder, watchFolder } from '../db/folder.ts';
import { offerRescue } from '../ui/rescue.ts';
import { resetSymbolResolution } from '../ui/symbols.ts';
import { arrivingFrom, openNamed, refreshCollections, setActive, whenOpened } from './collections.ts';
import { bringPrintUpToDate } from './print.ts';
import { notify } from './notify.ts';
import { standing } from './standing.ts';
import { s } from './state.svelte.ts';
import { booted } from './syncing.svelte.ts';
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
 *
 * ## Two halves, and the line between them is what the folder costs
 *
 * adr/0005. The first half reads this browser's own copy and nothing else, and
 * it ends with the library on screen; the second reaches for the folder. The
 * line is drawn there because of what each side measures: reading the settings
 * and a Sammlung out of IndexedDB is milliseconds, and reading the folder is
 * every record file opened one after another plus the pictures beside them —
 * minutes, in the household this was reported from, with the page showing a
 * spinner over a library that was sitting in IndexedDB the whole time.
 *
 * What makes drawing the unchecked copy honest rather than a guess is the other
 * half of that ADR: the page says that it is being checked (`syncing.svelte.ts`),
 * and nothing may be written against it until it has been.
 */
export function boot(say: (message: string) => void): void {
  arrivingFrom();
  void (async () => {
    /* ---------------------------------------- what this browser already holds */

    /* Still before anything is read, and still cheap: restoring an Ablage reads
       the stored handle and asks the browser whether the permission is still
       granted. No file in the folder is opened here — that is `pullFromFolder`,
       below — and having asked means `isStore()` answers truthfully for the
       rest of this half, which two decisions under it depend on. */
    await restoreFolder().catch(() => null);

    /* And where no folder is the store, the page is confirmed before anything
       is drawn: there is nothing to check it against. Said here rather than
       left to the second half, which reaches `booted()` only after the open
       Sammlung's symbols have resolved — that is the right moment for a
       household with a folder and far too late for one without, whose banner
       would then announce a folder read that is never going to happen. */
    if (!isStore()) booted();

    /* Before the first paint, and that is the one thing about this call that
       may not move. ADR 0004: a record written by a newer bildhaft and drawn by
       this one is a row of empty fields, and written back it is that row for
       good. So the browser's own records are asked their format before any of
       them is on screen. It runs here even where a folder is the store, where
       it used to return at once and leave the question to the folder's own
       check — the folder's answer now arrives after the first paint, and a
       newer record in *this* browser would have been drawn before it. */
    await bringRecordsUpToDate().catch(() => undefined);
    s.newerData = dataIsNewer();

    const loaded = await loadSettings();
    let all = await listCollections();

    /* An empty library gets its first Sammlung — but only where no folder is
       going to answer for it. `createCollection` files the new record into the
       folder as well, and a household whose browser copy is empty while the
       folder holds their library (a new machine, cleared storage) would have
       one empty „Material vom …" added to the folder on every single start,
       before the read that was about to bring the real one in. Where a folder
       is the store this waits until it has had its say, below. */
    if (all.length === 0 && !isStore()) all = [await createCollection()];

    /* The first paint. Everything below the shell asks the store what is in it,
       and `App.svelte` draws the spinner until the settings are there. */
    s.settings = loaded;
    all = await bringPrintUpToDate(all);
    // Before anything resolves a symbol: the preference orders search results,
    // so a slot filled in ahead of it would be filled from the wrong rendering.
    metacom.preferRendering(loaded.metacomRendering);
    s.collections = all;

    const wanted = all.find((c) => c.id === loaded.lastCollectionId) ?? all[0];
    if (wanted) {
      /* What the first paint draws with, recorded before setActive() can compare
         against it. Without this the initial guess is 'arasaac' and every load of
         a library whose source is METACOM would re-resolve and rewrite every
         sentence in the open collection — work that changes nothing. */
      s.previousProvider = wanted.provider ?? loaded.activeProvider;
      setActive(wanted.id);
    }
    /* The Wortschatz's counts in the sidebar are read in the same pass as the
       list, and nothing else asked for them at start: „Alle Wörter" said 0
       until something happened to refresh the list. */
    void refreshCollections();

    /* ------------------------------------------------------- then the folder */

    /* Started here and not awaited, so the pictures follow the library instead
       of holding it: the index is in IndexedDB and answers in its own time,
       while the folder read below is still running. Only judge the symbol
       source once it has had its chance to come back. */
    metacom.restore().catch(() => undefined).finally(() => { s.sourceSettled = true; });

    /* Before the first read of the Wortschatz, because it changes where it is
       read from. A folder written by a version that kept it under `bildhaft/`
       hands its words over here, once. */
    await moveWortschatz().catch(() => 0);

    /* The one write this boot has in the air: opening a Sammlung resolves the
       slots that were never resolved for this source and writes them back, and
       the read below empties the stores it writes into. A read that waited for
       writes in general would be waiting for writes that are waiting for it
       (see `syncing` in `db/repo.ts`), so the one that is actually there is
       settled here. */
    await whenOpened().catch(() => undefined);

    /* Where a folder is the store it is still the truth: this is what checks
       the copy that was drawn above against it, and `pullFromFolder` is the one
       place that says a sync is running. */
    const pulled = await pullFromFolder().catch(() => false);
    s.newerData = dataIsNewer();
    /* The page has had the folder's answer, or found there is no folder to ask.
       From here on what is on screen is checked, and planning is allowed. */
    booted();

    if (pulled || all.length === 0) {
      /* What the folder brought, drawn over what was drawn from the copy. The
         list is read again rather than patched: the pull replaces the
         Sammlungen wholesale, so the one that was open may be gone, renamed, or
         somebody else's newer version of itself. */
      let after = await listCollections();
      if (after.length === 0) after = [await createCollection()];
      after = await bringPrintUpToDate(after);
      s.collections = after;
      const now = after.find((c) => c.id === s.activeId)
        ?? after.find((c) => c.id === loaded.lastCollectionId) ?? after[0]!;
      s.previousProvider = now.provider ?? loaded.activeProvider;
      setActive(now.id);
      void refreshCollections();
    }

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
      /* `pulled` says the folder was read just now, so the watch needs no
         priming read of its own — see `watchFolder`. */
      if (yes) watchFolder(() => void pullFromFolder().then(() => {
        /* Another device moved on to a newer bildhaft while this page stayed
           open: the page stops here and asks to be loaded again. */
        s.newerData = dataIsNewer();
        void refreshCollections();
        if (s.activeId) setActive(s.activeId);
      }), pulled);
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
    // Nothing is coming any more, and the page must not wait for it.
    s.arriving = null;
    /* And the page is not left waiting for the folder's answer either: a boot
       that failed is a boot that has made its last check. */
    booted();
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
