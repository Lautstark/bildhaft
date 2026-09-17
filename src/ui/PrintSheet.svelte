<script lang="ts">
  /**
   * The printable document.
   *
   * Drawn twice from one description: once inside the on-screen A4 preview and
   * once into #print-root, which @media print reveals. Both take the same
   * `blocks` and the same `plan`, so what the preview shows is what the printer
   * produces — neither worked anything out on its own.
   *
   * `plan.pages` is null on the paint the plan is measured from, and the sheet
   * then stands as one column of blocks. With it, each page is a `.ps-page` box
   * of exactly the printable area and the sheet says so in a class, because the
   * preview draws a paginated sheet differently: the paper's margin moves onto
   * the page boxes. It cannot move before they exist — the plan is measured
   * inside the printable width, not inside the sheet with its margin taken off.
   */
  import type { PrintSettings, ProviderId } from '../core/types.ts';
  import { sentenceCaption, slotCaption } from '../core/types.ts';
  import { labelColour, labelField, zoneBorder, zoneBox, zoneJoint } from '../core/board.ts';
  import PrintCard from './PrintCard.svelte';
  import {
    BILDHAFT_URL, framePadMm, PAGE_MARGIN_MM, printableArea, SHOPPING,
    type Block, type SheetPlan,
  } from './printSheet.ts';
  import { t } from '../i18n/index.ts';

  let { blocks, plan, settings, provider }: {
    blocks: Block[];
    plan: SheetPlan;
    settings: PrintSettings;
    provider: ProviderId;
  } = $props();

  let page = $derived(printableArea(settings.paper, settings.orientation));

  /* The piece of frame that turns an inner corner of a block, in millimetres.
     The same shape the screen draws in pixels — see Tafel.svelte. */
  const printJoint = (corner: 'tl' | 'tr' | 'br' | 'bl', colour: string): Record<string, string> => {
    const j = zoneJoint(corner, '1mm', '-0.3mm', '0.6mm');
    return {
      ...j.position, width: j.size, height: j.size,
      backgroundImage: `linear-gradient(${colour}, ${colour}), linear-gradient(${colour}, ${colour})`,
      backgroundPosition: `${j.x} 0, 0 ${j.y}`, backgroundSize: '0.6mm 100%, 100% 0.6mm',
    };
  };

  const asStyle = (from: Record<string, string>): string =>
    Object.entries(from).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`).join(';');

  /** The blocks of each page, or one page holding all of them while unplanned. */
  let pages = $derived.by(() => {
    if (!plan.pages) return null;
    const out: Block[][] = [];
    let taken = 0;
    for (const count of plan.pages) { out.push(blocks.slice(taken, taken + count)); taken += count; }
    // Cannot happen, and is checked anyway: a block the plan did not account
    // for would be a symbol silently missing from a printout.
    if (taken < blocks.length && out.length > 0) out[out.length - 1]!.push(...blocks.slice(taken));
    return out;
  });

</script>

{#snippet shoppingZones(cols: number, rows: number, extra: string)}<div class="ps-zones{extra}" style:--cols={String(cols)}>{#each Array.from({ length: cols * rows }) as _, i (i)}<span class="ps-zone"><span class="ps-dot"></span></span>{/each}</div>{/snippet}

{#snippet one(block: Block)}{#if block.kind === 'title'}<h1 class="ps-title">{block.text}</h1>{:else if block.kind === 'strip'}<div class="ps-sentence{block.page ? ' ps-sentence--page' : ''}{block.framed ? ' ps-sentence--framed' : ''}">{#if settings.showSentenceText}<p class="ps-caption">{sentenceCaption(block.sentence)}</p>{/if}<div class="ps-row">{#each block.sentence.slots as slot (slot.id)}<PrintCard {slot} {settings} {provider} />{/each}</div></div>{:else if block.kind === 'row'}<!--
  A flowing row, and the cards on it are sized either by the symbol inside them
  or by the millimetres somebody typed. Both flow and wrap the same way; only
  where the box's size comes from differs.
--><div class="ps-row">{#each block.slots as slot (slot.id)}<PrintCard {slot} {settings} {provider} exact={settings.sheetFit === 'card'} />{/each}</div>{:else if block.kind === 'grid'}<div class="ps-grid{block.page ? ' ps-grid--page' : ''}" style:--cols={String(block.cols)} style:--cell-h={block.cellH}>{#each block.slots as slot (slot.id)}<PrintCard {slot} {settings} {provider} fill />{/each}</div>{:else if block.kind === 'tafel'}<!--
  A Tafel: one grid page, every field drawn whether or not a card lies in it.

  The free field is the point. On the wall it is where somebody decided nothing
  goes, and on paper it is an empty cell of the same size as the others, with
  the same cut line — so a laminated board has a place that *is* free rather
  than a hole where the grid stopped early. A card sheet cannot say that: it
  flows its cards and a gap is just the end.

  One page and never more: the grid is the Sammlung's own size, and a Tafel that
  needed a second sheet would be two Tafeln.
--><div class="ps-grid ps-tafel" style:--cols={String(block.board.cols)} style:--cell-h={block.cellH}>{#each block.board.cells as sentence, index (index)}{@const slot = sentence?.slots[0]}{@const zone = block.board.zones?.[index]}{@const map = { cols: block.board.cols, rows: block.board.rows, zones: block.board.zones ?? [], styles: block.board.styles ?? {} }}{@const zoneStyle = zone ? map.styles[zone] : undefined}{@const box = zone ? zoneBox(map, index, '1mm', '3mm', '-0.3mm') : null}{@const laid = box && zone ? {
  fill: zoneStyle?.fill ?? 'transparent',
  frame: zoneStyle?.frame ?? null,
  inset: box.inset,
  borderRadius: box.borderRadius,
  borderWidth: zoneStyle?.frame ? zoneBorder(map, index, '0.6mm') ?? '0' : '0',
  clipPath: box.clipPath ?? '',
  joints: zoneStyle?.frame ? box.crooks.map((corner) => printJoint(corner, zoneStyle.frame!)) : [],
  shield: zoneStyle?.name && labelField(map, zone) === index
    ? { text: zoneStyle.name, colour: labelColour(zoneStyle) } : null,
} : null}{@const white = Boolean(zoneStyle?.fill) && settings.cardBackground === null}<!--
  The field's colour goes on the whole cell, gap included, rather than inside
  the frame where the card's own background goes: a Tafel is laminated whole,
  and a group is meant to read as one block — rounded where the block ends and
  square where it goes on. The card on it is white unless a background was asked
  for, because a picture straight on the colour is a card that has disappeared
  into its group. The colour is stepped in by 1 mm where the block ends — half
  of a 2 mm rinne, so two blocks meet with a rinne between them and a block ends
  with air to the sheet.
-->{#if slot}<PrintCard {slot} settings={white ? { ...settings, cardBackground: '#fff' } : settings} {provider} fill background={white ? '#fff' : undefined} block={laid} />{:else}<div class="ps-card ps-card--fill ps-card--empty" aria-hidden="true">{#if laid}{#each laid.joints as joint, at (at)}<div class="ps-joint" style={asStyle(joint)}></div>{/each}<div class="ps-block" style:--zone={laid.fill} style:inset={laid.inset} style:border-radius={laid.borderRadius} style:border-color={laid.frame ?? 'transparent'} style:border-width={laid.borderWidth} style:clip-path={laid.clipPath}></div>{#if laid.shield}<div class="ps-shield" style:--shield={laid.shield.colour}>{laid.shield.text}</div>{/if}{/if}</div>{/if}{/each}</div>{:else if block.kind === 'shopping-board'}<!--
  The board of an Einkaufsliste is blank and stays blank: it is laminated once
  and the cards change, so nothing that changes may be printed on it — no date,
  no words, no count. Fifteen zones to shop from, fifteen in the cart, and a
  card moves from one to the other when the thing is in the trolley.

  The cart is drawn rather than decorated onto the page. Its basket is
  *straight*, and that is the one thing about it worth a note: a tapering basket
  is narrower at the bottom than the rectangle of zones inside it, so the lower
  rows stand out of it on both sides. Which they did. The handle points outwards
  and away, which there is room for on a landscape sheet and none for on a
  portrait one. `preserveAspectRatio="none"` is safe because the viewBox is the
  zone block in millimetres — stretch it and the wheels would be eggs.
--><div class="ps-grid ps-board ps-grid--page">{@render shoppingZones(SHOPPING.list.cols, SHOPPING.list.rows, '')}<div class="ps-cart"><svg viewBox="0 0 {block.cartW} {block.cartH}" preserveAspectRatio="none" aria-hidden="true" class="ps-cart__art"><path d="M -5 -5 H {block.cartW + 5} V {block.cartH + 5} H -5 Z" /><path d="M -5 -5 L -13 -14 H -22" /><path d="M -5 {block.cartH + 5} L 4 {block.cartH + 16} H {block.cartW - 7}" /><circle cx="24" cy={block.cartH + 22} r="6" /><circle cx={block.cartW - 21} cy={block.cartH + 22} r="6" /></svg>{@render shoppingZones(SHOPPING.cart.cols, SHOPPING.cart.rows, ' ps-zones--cart')}</div></div>{:else if block.kind === 'cut'}<!--
  The cards carry no word. A card that is handed around in a shop has one job,
  and a word under it makes the picture smaller rather than clearer — the word
  is on the board nowhere and on the storage sheet always.
--><div class="ps-grid ps-cut ps-grid--page">{#each block.slots as slot (slot.id)}<PrintCard {slot} settings={{ ...settings, showLabel: false }} {provider} />{/each}</div>{:else if block.kind === 'store'}<!--
  The storage sheet is the part most templates leave out and without which the
  material is in a bag by the third week: every card has a labelled place, with
  its symbol printed faintly so a child finds it without reading and the word so
  an adult does not have to hunt. The empty place is the information.
--><div class="ps-grid ps-store{block.page ? ' ps-grid--page' : ''}">{#each block.slots as slot (slot.id)}<div class="ps-place"><PrintCard {slot} settings={{ ...settings, showLabel: false }} {provider} /><span class="ps-place__word">{slotCaption(slot)}</span></div>{/each}</div>{:else if block.kind === 'credit'}<!--
  The name gives way, never the address. Both are on one line and a long name
  would push the address off it, so the name is the part allowed to be clipped —
  an ellipsis on a name the reader chose still says which collection this is,
  where half a URL says nothing and is not something anybody can type back in.
--><p class="ps-attribution">{#each block.lines as line, at (line)}{#if at > 0}<br />{/if}{line}{/each}<span class="ps-made"><span class="ps-made__name">{block.name}</span><span class="ps-made__tail"> · {t('ui.made_with')} <a class="ps-url" href={BILDHAFT_URL}>{BILDHAFT_URL}</a></span></span></p>{/if}{/snippet}

<div
  class="ps-sheet{settings.showCutLines ? ' ps-sheet--cutlines' : ''}{pages ? ' ps-sheet--paged' : ''}"
  style:--sym="{settings.symbolSizeMm}mm"
  style:--cut="{settings.cutMarginMm}mm"
  style:--card-w="{settings.cardWidthMm}mm"
  style:--card-h="{settings.cardHeightMm ?? settings.cardWidthMm}mm"
  style:--label="{settings.labelSizePt}pt"
  style:--page-w="{page.width}mm"
  style:--page-h="{page.height}mm"
  style:--page-margin="{PAGE_MARGIN_MM}mm"
  style:--frame-w="{settings.cardBorderMm}mm"
  style:--frame-color={settings.cardBorderColor}
  style:--frame-pad="{framePadMm(settings)}mm"
  style:--card-radius="{settings.cardRadiusMm}mm"
  style:--card-bg={settings.cardBackground ?? 'transparent'}
  style:--strip-w="{settings.cardBorderMm > 0 ? settings.cardBorderMm : 0.5}mm"
>{#if pages}{#each pages as held, at (at)}<div class="ps-page">{#each held as block, i (i)}{@render one(block)}{/each}</div>{/each}{:else}{#each blocks as block, i (i)}{@render one(block)}{/each}{/if}</div>
