/**
 * „Für Anybook Studio": the open material as a project Studio opens, its
 * codes placed where the sheet has them and each with a recording of what it
 * says (Weg A, 2026-10-27).
 *
 * The sheet opens on the list of every code in the order it stands on the
 * paper — her ask: the mock's list „A", only not in the print menu — so the
 * words can be read through before anything is recorded. A code is changed
 * there as it is on the sheet, and the sheet beside it follows.
 */

import { openSheet } from '@lautstark/design/svelte/sheet';
import { download } from '@lautstark/werkzeuge/download';
import { recordingName, studioProject, type PlacedCode, type Recording } from '../core/anybook.ts';
import { CLOSE } from './dialog.ts';
import { materialPrint } from '../app/print.ts';
import { capturing, readyToDraw, type Printing } from './printDialog.svelte.ts';
import { previewToPdf } from './pdf.ts';
import { paperSize, printerPaper } from './printSheet.ts';
import { recordForPen } from './anybookVoice.ts';
import { azureAccess, loadVoices, voiceOf } from './voices.svelte.ts';
import AnyStudioBody from './AnyStudioBody.svelte';
import AnyStudioFoot from './AnyStudioFoot.svelte';
import { t } from '../i18n/index.ts';

/** A code as it stands on the sheet: its key, and what stands there. */
export interface ListedCode { key: string; standing: string }

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

export class StudioExport {
  codes = $state.raw<ListedCode[]>([]);
  busy = $state(false);
  /** How far the recordings are, while they are made. */
  done = $state(0);
  total = $state(0);
  error = $state<string | null>(null);
  close: () => void = () => undefined;

  /** How many codes go out: those not taken off, as the material says now. */
  get live(): number {
    const off = materialPrint()?.settings.anybookOff ?? [];
    return this.codes.filter((code) => !off.includes(code.key)).length;
  }

  constructor(readonly preview: Printing, readonly title: string) {
    this.codes = listed(preview);
    void loadVoices().catch(() => { this.error = t('ui.anybook_no_voice'); });
  }

  /** The material's voice, or the household's. */
  get voice(): string {
    return voiceOf(materialPrint()?.settings);
  }

  /** The sheet again, the codes where they are now, each recorded once, as one file. */
  async save(): Promise<void> {
    if (this.busy || !this.voice) return;
    this.busy = true;
    this.error = null;
    try {
      const state = this.preview;
      await readyToDraw(state);
      const pages = [...(state.holder?.querySelectorAll<HTMLElement>('.ps-paper') ?? [])];
      const sheet = printerPaper(state.settings);
      const paper = paperSize(sheet.paper, sheet.orientation);

      /* Where each code's centre is, in millimetres of its own sheet of paper. */
      const placed: (PlacedCode & { said: string })[] = [];
      let activation: PlacedCode | null = null;
      pages.forEach((page, at) => {
        const box = page.getBoundingClientRect();
        for (const el of page.querySelectorAll<HTMLElement>('.ps-any:not(.ps-any--off)')) {
          if (getComputedStyle(el).display === 'none') continue;
          const r = el.getBoundingClientRect();
          const code = {
            page: at + 1,
            x: ((r.left + r.width / 2 - box.left) / box.width) * paper.width,
            y: ((r.top + r.height / 2 - box.top) / box.height) * paper.height,
            audio: '',
          };
          /* The activation code beside the title: one, the first page's. */
          if (el.classList.contains('ps-any--start')) activation ??= code;
          else placed.push({ ...code, said: el.dataset.said ?? '' });
        }
      });

      /* One recording per thing said: two codes saying „Pfanne" share it. */
      const names = new Map<string, string>();
      const taken = new Set<string>();
      for (const code of placed) {
        if (!names.has(code.said)) names.set(code.said, recordingName(code.said, taken));
        code.audio = names.get(code.said)!;
      }
      this.total = names.size;
      this.done = 0;
      const recordings: Recording[] = [];
      for (const [said, name] of names) {
        recordings.push({ name, bytes: await recordForPen(said, this.voice, azureAccess()) });
        this.done += 1;
      }

      const drawn = await capturing(state, () => previewToPdf(pages, state.settings), true);
      const bytes = new Uint8Array(await drawn.arrayBuffer());

      const name = this.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'bildhaft';
      download(studioProject(name, bytes, pages.length, placed, activation, recordings), `${name}.abs`);
      this.close();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
    }
  }
}

export function openStudioSheet(preview: Printing, title: string): void {
  const state = new StudioExport(preview, title);
  const sheet = openSheet({
    title: t('ui.anybook_studio'),
    closeLabel: CLOSE,
    state,
    body: AnyStudioBody,
    foot: AnyStudioFoot,
  });
  state.close = sheet.close;
}
