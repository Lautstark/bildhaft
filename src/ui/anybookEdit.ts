import { materialPrint } from '../app/print.ts';

/**
 * One code of the open material changed: its own words (empty for what stands
 * there, or the same words typed back), and whether it is off. Written to the material's print, where the
 * sheet reads it from — the code on the sheet and the list in the Studio
 * sheet both write here.
 */
export function writeAnybook(key: string, said: string | null, off: boolean, standing?: string): void {
  const mp = materialPrint();
  if (!mp) return;
  const say = { ...(mp.settings.anybookSay ?? {}) };
  /* The words that stand there are no words of its own: cleared, or typed back, it says them again. */
  if (said === null || !said.trim() || said.trim() === standing?.trim()) delete say[key]; else say[key] = said.trim();
  const offs = (mp.settings.anybookOff ?? []).filter((one) => one !== key);
  if (off) offs.push(key);
  mp.patch({ anybookSay: Object.keys(say).length ? say : undefined, anybookOff: offs.length ? offs : undefined });
}
