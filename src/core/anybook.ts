/**
 * A material as a project Anybook Studio opens as its own.
 *
 * The pen reads codes Studio prints. bildhaft cannot print them — their
 * numbers are handed out when Studio transfers to the pen, not before — but it
 * knows everything before that: the sheet, where each code goes on it, and
 * what each one says. So the output is an `.abs`, the zip Studio keeps a
 * project in: the sheet as a PDF, an mp3 per code, and `_Project_.json` with
 * every code placed and bound. Studio then transfers and prints.
 *
 * The format was read off a project Studio wrote and proven against it in
 * mitreden (src/core/anybook.ts there, 2026-08): coordinates in centimetres
 * from the page's top left, a code anchored by its top left corner and drawn
 * about 10 mm wide, `CodeNr` 0 until the transfer. This is the same writer
 * for a sheet bildhaft drew instead of a label sheet; the two belong in one
 * shared package once both are settled.
 */

/** The title's code, beside the card codes' slot ids. */
export const ANYBOOK_TITLE = 'titel';
/** The activation code's place, at the end of the title line. It says nothing. */
export const ANYBOOK_START = 'aktivierung';

/** What a code says: its own words if it has them, otherwise what stands there. */
export const anybookSays = (say: Record<string, string> | undefined, key: string, standing: string): string =>
  say?.[key]?.trim() || standing;

/** How one code stands on the sheet: what it says, and whether it is off or has words of its own. */
export function anybookMark(settings: { anybookSay?: Record<string, string>; anybookOff?: string[] }, key: string, standing: string):
{ said: string; off: boolean; own: boolean } {
  return {
    said: anybookSays(settings.anybookSay, key, standing),
    off: settings.anybookOff?.includes(key) ?? false,
    own: Boolean(settings.anybookSay?.[key]?.trim()),
  };
}

/**
 * How wide Studio draws a code, in millimetres. It anchors a code by its top
 * left corner, so a code meant to sit on a circle's centre is written half of
 * this up and to the left. Measured in mitreden by placing codes and looking
 * (10 mm), and again on her Spiel printed from Studio (2026-10-28): 10.8 mm,
 * at 10 its code stood 0.8 mm nearer the right edge than the top.
 */
export const STUDIO_CODE_MM = 10.8;

/** One code on the sheet: where its centre is, and which recording it plays. */
export interface PlacedCode {
  /** 1-based, as Studio counts. */
  page: number;
  /** The centre, in millimetres from the page's top left. */
  x: number;
  y: number;
  /** The recording's name in the archive; empty for the activation code. */
  audio: string;
}

export interface Recording {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
}

/**
 * `_Project_.json` as Studio writes it at Version 1.6, every field as it
 * survived a round trip through Studio in mitreden.
 */
function projectJson(title: string, pdfName: string, pages: number, codes: readonly PlacedCode[],
  activation: PlacedCode | null, recordings: readonly Recording[]): string {
  const at = (code: PlacedCode) => ({
    PageNo: code.page,
    X: Number(((code.x - STUDIO_CODE_MM / 2) / 10).toFixed(6)),
    Y: Number(((code.y - STUDIO_CODE_MM / 2) / 10).toFixed(6)),
    CodeNr: 0,
    Empty: false,
    ReadOnly: false,
  });
  return JSON.stringify({
    Version: '1.6',
    Type: 0,
    Status: 2,
    LastModified: new Date().toISOString(),
    Author: 'bildhaft',
    Title: title,
    HasThumbNail: false,
    PenPackage: {
      ActivationCode: 0, Audios: [], ReadOnlys: [], AudioNames: {},
      LeerCodes: [], UserName: '', PackageName: '', PackageId: 0, ZipFolder: '',
    },
    LastProjectFileName: '',
    Id: Math.floor(Math.random() * 900000) + 100000,
    MinFwVersion: '1.0',
    PdfPageCount: pages,
    LastAppVersion: '',
    LastTechnicalUpdate: null,
    LastTechnicalUpdateReason: '',
    LastTechnicalUpdateByApp: '',
    TransferIntegrityState: 'unknown',
    TransferIntegrityMessage: '',
    TransferMissingAudioCount: 0,
    TransferIntegrityCheckedAt: null,
    Log: '',
    ShouldBeActivated: true,
    HaveTargetCircle: true,
    DirectRecord: false,
    MarkBlankCodes: true,
    CodeSize: 0,
    PDFFileName: pdfName,
    Pages: [],
    Codes: [
      /* Type 0 is the activation code: it plays nothing and makes the sheet
         work on any pen, not only the one Studio transfers to. */
      ...(activation ? [{ Type: 0, ...at(activation), AudioFileName: '', HasAudioFileName: false }] : []),
      ...codes.map((code) => ({ Type: 1, ...at(code), AudioFileName: code.audio, HasAudioFileName: true })),
    ],
    /* One row per recording, not per code: two codes saying the same are one file on the pen. */
    AudioFiles: recordings.map((one) => ({ FileName: one.name, IsPipelineCompliant: true })),
  }, null, 1);
}

/** The whole project, ready to be opened in Studio. */
export function studioProject(title: string, pdf: Uint8Array<ArrayBuffer>, pages: number,
  codes: readonly PlacedCode[], activation: PlacedCode | null, recordings: readonly Recording[]): Blob {
  if (!codes.length) throw new Error('An Anybook project needs at least one code.');
  const pdfName = `${title}.pdf`;
  return zip([
    { name: pdfName, bytes: pdf },
    ...recordings,
    { name: '_Project_.json', bytes: new TextEncoder().encode(projectJson(title, pdfName, pages, codes, activation, recordings)) },
  ]);
}

/**
 * A file name for a recording out of what it says: Studio shows it, so it is
 * the words, short and plain, made unique with a number where two differ only
 * after the cut.
 */
export function recordingName(said: string, taken: Set<string>): string {
  const stem = said.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'code';
  let name = `${stem}.mp3`;
  for (let n = 2; taken.has(name); n++) name = `${stem}-${n}.mp3`;
  taken.add(name);
  return name;
}

// ---------------------------------------------------------------------- zip
//
// Stored, not deflated: Studio reads it, the mp3s and the PDF are compressed
// already, and a dependency for this is not worth it. mitreden's zip.ts.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array<ArrayBuffer>): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]!) & 0xFF]! ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(files: { name: string; bytes: Uint8Array<ArrayBuffer> }[]): Blob {
  const enc = new TextEncoder();
  const chunks: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const { name, bytes } of files) {
    const nb = enc.encode(name), crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nb.length, true);
    chunks.push(new Uint8Array(local.buffer), nb, bytes);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true); dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, bytes.length, true);
    dir.setUint32(24, bytes.length, true);
    dir.setUint16(28, nb.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), nb);
    offset += 30 + nb.length + bytes.length;
  }
  const dirBytes = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirBytes, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
