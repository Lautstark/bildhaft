/**
 * „Für Anybook Studio": the open material as a project Studio opens, its
 * codes placed where the sheet has them and each with a recording of what it
 * says (Weg A, 2026-10-27).
 *
 * The sheet opens on the list of every code in the order it stands on the
 * paper — her ask: the mock's list „A", only not in the print menu — so the
 * words can be read through before anything is recorded. A code is changed
 * there as it is on the sheet, and the sheet beside it follows.
 *
 * „Alle drucken" makes one project of everything ticked (2026-10-28, her
 * pick S1): its pages in the overlay's order, each material's codes in that
 * material's own voice, a material without Anybook along without codes, and
 * the one activation code Studio allows the first material's that has it on.
 * Nothing is chosen there and nothing written to a material.
 */

import { openSheet } from '@lautstark/design/svelte/sheet';
import { download } from '@lautstark/werkzeuge/download';
import { recordingName, studioProject, type PlacedCode, type Recording } from '../core/anybook.ts';
import { CLOSE } from './dialog.ts';
import { materialPrint } from '../app/print.ts';
import { capturingAll, readyToDraw, type Printing } from './printDialog.svelte.ts';
import { previewsToPdf } from './pdf.ts';
import { paperSize, printerPaper } from './printSheet.ts';
import { recordForPen } from './anybookVoice.ts';
import { azureAccess, loadVoices, voiceOf } from './voices.svelte.ts';
import AnyStudioBody from './AnyStudioBody.svelte';
import AnyStudioFoot from './AnyStudioFoot.svelte';
import { t } from '../i18n/index.ts';

/** A code as it stands on the sheet: its key, and what stands there. */
export interface ListedCode { key: string; standing: string }

/** The group print's materials, as its sheet names them: ticked, with or without Anybook. */
export interface GroupMaterial { name: string; anybook: boolean }

/** Every code on the preview's sheets, in reading order, each key once. */
function listed(state: Printing): ListedCode[] {
  const seen = new Set<string>();
  const out: ListedCode[] = [];
  for (const el of state.holder?.querySelectorAll<HTMLElement>('.ps-paper .ps-any') ?? []) {
    const key = el.dataset.any;
    if (!key || seen.has(key) || el.classList.contains('ps-any--start') || getComputedStyle(el).display === 'none') continue;
    seen.add(key);
    out.push({ key, standing: el.dataset.standing ?? '' });
  }
  return out;
}

const pagesOf = (state: Printing): HTMLElement[] => [...(state.holder?.querySelectorAll<HTMLElement>('.ps-paper') ?? [])];

export class StudioExport {
  /** Each preview's codes, in the order the previews stand. */
  codes = $state.raw<ListedCode[][]>([]);
  busy = $state(false);
  /** How far the recordings are, while they are made. */
  done = $state(0);
  total = $state(0);
  error = $state<string | null>(null);
  close: () => void = () => undefined;

  /**
   * `group` is set for „Alle drucken": then every preview speaks in its own
   * material's voice. Without it the one preview is the open material, whose
   * voice and taken-off codes are read live — the sheet's picker changes them.
   */
  constructor(readonly states: Printing[], readonly title: string, readonly group: GroupMaterial[] | null = null) {
    this.codes = states.map(listed);
    void loadVoices().catch(() => { this.error = t('ui.anybook_no_voice'); });
  }

  private settingsOf(state: Printing) {
    return this.group ? state.settings : materialPrint()?.settings;
  }

  /** The material's voice, or the household's. */
  voiceOf(state: Printing): string {
    return voiceOf(this.settingsOf(state));
  }

  /** How many codes go out: those not taken off, as each material says now. */
  get live(): number {
    return this.states.reduce((n, state, at) => {
      const off = this.settingsOf(state)?.anybookOff ?? [];
      return n + (this.codes[at] ?? []).filter((code) => !off.includes(code.key)).length;
    }, 0);
  }

  /** Every preview with codes has a voice to record them in. */
  get voiced(): boolean {
    return this.states.every((state, at) => !this.codes[at]?.length || this.voiceOf(state) !== '');
  }

  /** The sheets again, the codes where they are now, each recorded once, as one file. */
  async save(): Promise<void> {
    if (this.busy || !this.voiced) return;
    this.busy = true;
    this.error = null;
    try {
      for (const state of this.states) await readyToDraw(state);

      /* Where each code's centre is, in millimetres of its own sheet of
         paper; the pages counted on over the previews, as the file has them.
         Read off the sheet as Studio gets it, the one drawn into the PDF
         beside them, so no code can stand off its white disc. */
      const placed: (PlacedCode & { said: string; voice: string })[] = [];
      let activation: PlacedCode | null = null;
      let page = 0;
      await capturingAll(this.states, async () => { for (const state of this.states) {
        const sheet = printerPaper(state.settings);
        const paper = paperSize(sheet.paper, sheet.orientation);
        const voice = this.voiceOf(state);
        for (const one of pagesOf(state)) {
          page += 1;
          const box = one.getBoundingClientRect();
          for (const el of one.querySelectorAll<HTMLElement>('.ps-any:not(.ps-any--off)')) {
            if (getComputedStyle(el).display === 'none') continue;
            const r = el.getBoundingClientRect();
            const code = {
              page,
              x: ((r.left + r.width / 2 - box.left) / box.width) * paper.width,
              y: ((r.top + r.height / 2 - box.top) / box.height) * paper.height,
              audio: '',
            };
            /* The activation code: one per file, the first that stands. */
            if (el.classList.contains('ps-any--start')) activation ??= code;
            else placed.push({ ...code, said: el.dataset.said ?? '', voice });
          }
        }
      } }, true);

      /* One recording per thing said in one voice: two codes saying „Pfanne" share it. */
      const names = new Map<string, { name: string; said: string; voice: string }>();
      const taken = new Set<string>();
      for (const code of placed) {
        const key = `${code.voice}\u0000${code.said}`;
        if (!names.has(key)) names.set(key, { name: recordingName(code.said, taken), said: code.said, voice: code.voice });
        code.audio = names.get(key)!.name;
      }
      this.total = names.size;
      this.done = 0;
      const recordings: Recording[] = [];
      for (const { name, said, voice } of names.values()) {
        recordings.push({ name, bytes: await recordForPen(said, voice, azureAccess()) });
        this.done += 1;
      }

      const drawn = await capturingAll(this.states,
        () => previewsToPdf(this.states.map((state) => ({ pages: pagesOf(state), settings: state.settings }))), true);
      const bytes = new Uint8Array(await drawn.arrayBuffer());

      const name = this.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'bildhaft';
      download(studioProject(name, bytes, page, placed, activation, recordings), `${name}.abs`);
      this.close();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
    }
  }
}

/** The sheet for one or more previews; `group` names „Alle drucken"'s ticked materials. */
export function openStudioSheet(states: Printing[], title: string, group: GroupMaterial[] | null = null): void {
  const state = new StudioExport(states, title, group);
  const sheet = openSheet({
    title: t('ui.anybook_studio'),
    closeLabel: CLOSE,
    state,
    body: AnyStudioBody,
    foot: AnyStudioFoot,
  });
  state.close = sheet.close;
}
