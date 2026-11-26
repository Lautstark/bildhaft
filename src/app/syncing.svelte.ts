import { onSyncing } from '../db/repo.ts';

/*
 * Whether what is on screen is still this browser's copy being checked against
 * the folder. adr/0005.
 *
 * `repo.ts` says so from the one place a folder read happens; this holds it as
 * a rune, so whatever reads it while drawing is redrawn when it changes — the
 * way `state.svelte.ts` holds everything else the page draws from.
 *
 * **True from the first paint, and not only while a read is running.** Boot
 * draws the library and then spends a moment on the folder's handle, the
 * Wortschatz's old compartment and `adopted()` before the read itself begins.
 * A sentence typed in that moment would be typed against a library nobody has
 * checked, so the page counts the boot as unconfirmed until it says otherwise.
 * Where no folder is the store that is a few milliseconds and nothing is ever
 * drawn about it.
 *
 * A module of its own rather than a field on `s`: `state.svelte.ts` is the
 * page's own store and asks the browser nothing as it is made (its unit tests
 * run in node), while this subscribes to the database layer as it is imported.
 */
let busy = $state.raw(false);
let booting = $state.raw(true);
onSyncing((now) => { busy = now; });

/** True while the library on screen has not been checked against the folder. */
export const syncing = (): boolean => busy || booting;

/** Boot has had the folder's answer, or found there is no folder to ask. */
export const booted = (): void => { booting = false; };
