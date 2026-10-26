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
  import PrintPicture from './PrintPicture.svelte';
  import {
    BILDHAFT_URL, bleeds, framePadMm, pageMargins, printableArea, SHOPPING, SHOPPING_SCALE,
    TITLE_RULE_GAP_MM, TITLE_RULE_MM, titleColour, titlePictureMm, type Block, type SheetPlan,
  } from './printSheet.ts';
  import { t } from '../i18n/index.ts';

  let { blocks, plan, settings, provider }: {
    blocks: Block[];
    plan: SheetPlan;
    settings: PrintSettings;
    provider: ProviderId;
  } = $props();

  let page = $derived(printableArea(settings.paper, settings.orientation, settings.punch));
  let margins = $derived(pageMargins(settings.punch));
  /* The colour behind every page — but an Einkaufsliste's, which is behind
     its board's page and no other: its cards and their places are cut and
     stored, not hung up. */
  let pageColour = $derived(settings.layout === 'einkaufsliste' ? null : settings.pageColour);
  const boardColour = (held: Block[]): string | null =>
    held.some((block) => block.kind === 'shopping-board') ? settings.pageColour : null;
  /* With a colour, the paper has no margin of its own and every page carries
     it inside — a white page beside a coloured one too, or it would print to
     the edge. printDialog asks the same question of @page. */
  let bleed = $derived(bleeds(settings));

  /* A sentence's own words, over its row or under it — a strip and a song line alike. */
  const captionAt = (where: 'above' | 'below'): boolean =>
    settings.showSentenceText && settings.sentencePosition === where;

  /* How far a field's layer reaches into the next field of its group. A hair
     was not enough: the preview draws the page scaled down, a third of a
     millimetre came to less than a pixel there, and the softened edges of two
     layers let the page show through as a pale line between every two fields
     of a block. As far as the block steps in at its ends, so the layers always
     overlap by a whole step, at any scale. */
  const ZONE_OVERLAP = '-1mm';

  /* The piece of frame that turns an inner corner of a block, in millimetres.
     The same shape the screen draws in pixels — see Tafel.svelte. */
  const printJoint = (corner: 'tl' | 'tr' | 'br' | 'bl', colour: string): Record<string, string> => {
    const j = zoneJoint(corner, '1mm', ZONE_OVERLAP, '0.6mm');
    return {
      ...j.position, width: j.size, height: j.size,
      backgroundImage: `linear-gradient(${colour}, ${colour}), linear-gradient(${colour}, ${colour})`,
      backgroundPosition: `${j.x} 0, 0 ${j.y}`, backgroundSize: '0.6mm 100%, 100% 0.6mm',
    };
  };

  const asStyle = (from: Record<string, string>): string =>
    Object.entries(from).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`).join(';');

  /**
   * Whether anything on this paper is cut out.
   *
   * Asked of the blocks, because what is being printed is the only thing that
   * can answer it. A Tafel is laminated whole and a Satzstreifen is cut along
   * its strip, so neither is offered the switch in the print dialog — but the
   * setting is one remembered list shared by every template, so an answer
   * given on a card sheet reached this paper anyway and was honoured: a dashed
   * line through every field of a Tafel, three lines under that same dialog's
   * own sentence saying nothing on a Tafel is cut.
   */
  const CUT_UP = new Set(['row', 'grid', 'cut', 'talk-cut']);
  let cutUp = $derived(blocks.some((block) => CUT_UP.has(block.kind)));

  /** The blocks of each page, or one page holding all of them while unplanned. */
  let pages = $derived.by(() => {
    if (!plan.pages) return null;
    const body = blocks.filter((block) => block.kind !== 'credit');
    const out: Block[][] = [];
    let taken = 0;
    for (const count of plan.pages) { out.push(body.slice(taken, taken + count)); taken += count; }
    // Cannot happen, and is checked anyway: a block the plan did not account
    // for would be a symbol silently missing from a printout.
    if (taken < body.length && out.length > 0) out[out.length - 1]!.push(...body.slice(taken));
    return out;
  });
  /* The licence notice, drawn at the foot of every page rather than packed
     with the content: a sheet handed on alone carries it too. */
  let credit = $derived(blocks.find((block) => block.kind === 'credit') ?? null);
  /* The title, drawn again over a sheet of places that starts without it, and
     over every page after the first when it is asked for there. */
  let heading = $derived(blocks.find((block) => block.kind === 'title') ?? null);

  /* A sheet of Plauderbuch cards to cut out has no foot: it is cut up, and
     neither a notice nor a number survives the scissors. Nor is it counted —
     „Seite 3 von 9" are the pages of the book. An Einkaufsliste's guide
     neither: it is about the material, and carries none of it. */
  const bare = (held: Block[]): boolean => held.length > 0
    && held.every((block) => block.kind === 'talk-cut' || block.kind === 'game-cut' || block.kind === 'shop-guide');
  /* A page only of cards to cut out is cut apart, not filed: no hole marks. */
  const cutOnly = (held: Block[]): boolean => held.length > 0
    && held.every((block) => block.kind === 'talk-cut' || block.kind === 'game-cut' || block.kind === 'cut');
  let numbered = $derived(pages ? pages.filter((held) => !bare(held)).length : 0);
  const numberOf = (at: number): number => pages!.slice(0, at + 1).filter((held) => !bare(held)).length;

  /* The millimetres of a Plauderbuch page, for its own rules in print.css. */
  const talkVars = (geo: { cardW: number; cardH: number; gap: number; air: number; k: number; height: number; symW: number }, cols: number): string =>
    `--talk-w:${geo.cardW.toFixed(3)}mm;--talk-h:${geo.cardH.toFixed(3)}mm;--talk-gap:${geo.gap.toFixed(3)}mm;`
    + `--talk-air:${geo.air.toFixed(3)}mm;--talk-k:${geo.k.toFixed(4)};--talk-page:${geo.height.toFixed(3)}mm;--sym:${geo.symW.toFixed(3)}mm;--cols:${cols}`;
  /* Its fields are the band's colour, paler; with no band, a quiet grey. */
  let talkSoft = $derived(settings.gameGroundColour ? `color-mix(in srgb, ${settings.gameGroundColour} 45%, #fff)` : '#f2efee');

  /* And of a Spiel's sheets, for theirs — said in the Plauderbuch's own
     variables, so its field, card and cutting rules apply as they are. */
  const gameVars = (geo: { fieldW: number; fieldH: number; gap: number; air: number; k: number; lagerW: number; lagerCols: number; units: number; symW: number; }, cols: number): string =>
    `--talk-w:${geo.fieldW.toFixed(3)}mm;--talk-h:${geo.fieldH.toFixed(3)}mm;--talk-gap:${geo.gap.toFixed(3)}mm;`
    + `--talk-air:${geo.air.toFixed(3)}mm;--talk-k:${geo.k.toFixed(4)};--sym:${geo.symW.toFixed(3)}mm;`
    + `--spiel-lager:${geo.lagerW.toFixed(3)}mm;--lager-cols:${geo.lagerCols};--spiel-units:${geo.units};--cols:${cols}`;

</script>

{#snippet shoppingZones(cols: number, rows: number, extra: string)}<div class="ps-zones{extra}" style:--cols={String(cols)}>{#each Array.from({ length: cols * rows }) as _, i (i)}<span class="ps-zone"><span class="ps-dot"></span></span>{/each}</div>{/snippet}

{#snippet one(block: Block)}{#if block.kind === 'title'}<h1 class="ps-title{settings.titleLine ? ' ps-title--lined' : ''}{block.pictures.length > 0 ? ' ps-title--pictured' : ''}">{#each block.pictures as picture (picture.id)}<PrintPicture slot={picture} {provider} />{/each}<span>{block.text}</span></h1>{:else if block.kind === 'strip'}<div class="ps-sentence{block.page ? ' ps-sentence--page' : ''}{block.framed ? ' ps-sentence--framed' : ''}">{#if block.first && captionAt('above')}<p class="ps-caption">{sentenceCaption(block.sentence)}</p>{/if}<div class="ps-row">{#each block.slots as slot (slot.id)}<PrintCard {slot} {settings} {provider} />{/each}</div>{#if block.last && captionAt('below')}<p class="ps-caption ps-caption--below">{sentenceCaption(block.sentence)}</p>{/if}</div>{:else if block.kind === 'row'}<!--
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
--><div class="ps-grid ps-tafel" style:--cols={String(block.board.cols)} style:--cell-h={block.cellH}>{#each block.board.cells as sentence, index (index)}{@const slot = sentence?.slots[0]}{@const zone = block.board.zones?.[index]}{@const map = { cols: block.board.cols, rows: block.board.rows, zones: block.board.zones ?? [], styles: block.board.styles ?? {} }}{@const zoneStyle = zone ? map.styles[zone] : undefined}{@const box = zone ? zoneBox(map, index, '1mm', '3mm', ZONE_OVERLAP) : null}{@const laid = box && zone ? {
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
-->{#if slot}<PrintCard {slot} settings={white ? { ...settings, cardBackground: '#fff' } : settings} {provider} fill background={white ? '#fff' : undefined} block={laid} />{:else}<div class="ps-card ps-card--fill ps-card--empty" aria-hidden="true">{#if laid}{#each laid.joints as joint, at (at)}<div class="ps-joint" style={asStyle(joint)}></div>{/each}<div class="ps-block" style:--zone={laid.fill} style:inset={laid.inset} style:border-radius={laid.borderRadius} style:border-color={laid.frame ?? 'transparent'} style:border-width={laid.borderWidth} style:clip-path={laid.clipPath}></div>{#if laid.shield}<div class="ps-shield" style:--shield={laid.shield.colour}>{laid.shield.text}</div>{/if}{/if}{#if settings.markFreeFields}<div class="ps-card__place"></div>{/if}</div>{/if}{/each}</div>{:else if block.kind === 'shopping-board'}<!--
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
  Drawn in the millimetres of an A4 sheet, times the paper's factor `k`.
-->{@const k = block.k}<div class="ps-grid ps-board ps-grid--page">{@render shoppingZones(SHOPPING.list.cols, SHOPPING.list.rows, '')}<div class="ps-cart"><svg viewBox="0 0 {block.cartW} {block.cartH}" preserveAspectRatio="none" aria-hidden="true" class="ps-cart__art"><path d="M {-5 * k} {-5 * k} H {block.cartW + 5 * k} V {block.cartH + 5 * k} H {-5 * k} Z" /><path d="M {-5 * k} {-5 * k} L {-13 * k} {-14 * k} H {-22 * k}" /><path d="M {-5 * k} {block.cartH + 5 * k} L {4 * k} {block.cartH + 16 * k} H {block.cartW - 7 * k}" /><circle cx={24 * k} cy={block.cartH + 22 * k} r={6 * k} /><circle cx={block.cartW - 21 * k} cy={block.cartH + 22 * k} r={6 * k} /></svg>{@render shoppingZones(SHOPPING.cart.cols, SHOPPING.cart.rows, ' ps-zones--cart')}</div></div>{:else if block.kind === 'cut'}<!--
  The cards carry no word. A card that is handed around in a shop has one job,
  and a word under it makes the picture smaller rather than clearer — the word
  is on the board nowhere and on the storage sheet always.
--><div class="ps-cut{block.last ? ' ps-break' : ''}">{#each block.slots as slot (slot.id)}<PrintCard {slot} settings={{ ...settings, showLabel: false }} {provider} />{/each}</div>{:else if block.kind === 'store'}<!--
  The storage sheet is the part most templates leave out and without which the
  material is in a bag by the third week: every card has a labelled place, with
  its symbol printed faintly so a child finds it without reading and the word so
  an adult does not have to hunt. The empty place is the information.
--><div class="ps-store ps-titled{block.last ? ' ps-break' : ''}">{#each block.slots as slot (slot.id)}<div class="ps-place"><PrintCard {slot} settings={{ ...settings, showLabel: false }} {provider} /><span class="ps-place__word">{slotCaption(slot)}</span></div>{/each}</div>{:else if block.kind === 'recipe-part'}<!--
  A Rezept's cards keep their word: unlike the Einkaufsliste's they are not
  handed around, they are read where they are, and „325 ml" is only on the card.
--><section class="ps-recipe-part"><h2 class="ps-recipe-head">{t(`ui.recipe_${block.part}`)}</h2><div class="ps-recipe-cards">{#each block.slots as slot (slot.id)}<PrintCard {slot} {settings} {provider} />{/each}</div></section>{:else if block.kind === 'recipe-step'}<!--
  The heading rides with the first Schritt, so a page can never end on
  „Schritte" with nothing under it.
--><div class="ps-recipe-step">{#if block.first}<h2 class="ps-recipe-head">{t('ui.recipe_schritt')}</h2>{/if}<div class="ps-recipe-step__row"><span class="ps-recipe-step__n">{block.n}</span><div class="ps-recipe-step__slots">{#each block.slots as slot (slot.id)}<PrintCard {slot} {settings} {provider} />{/each}</div></div></div>{:else if block.kind === 'song-part'}<!--
  A part of a Lied: its name when headings are asked for, then its lines, one
  row of pictures each. The Refrain stands on a ground of the Lied's colour, so
  a child finds it again on the sheet without reading its name. Lines folded
  under „2×" share a bar down their right side with the count beside it, so it
  is plain which lines the „2×" means. A piece of a part too tall for a page
  after its first says it goes on, on its own ground again.
--><section class="ps-song-part{block.part === 'refrain' ? ' ps-song-part--refrain' : ''}">{#if settings.songHeadings}<h2 class="ps-song-head">{block.part === 'refrain' ? t('ui.song_refrain') : t('ui.song_strophe', { n: block.n })}{#if block.more}{' '}{t('ui.song_more')}{/if}</h2>{/if}{#each block.groups as group, g (g)}<div class="ps-song-group{group.times > 1 ? ' ps-song-group--again' : ''}"><div class="ps-song-lines">{#each group.lines as line, k (k)}{#if captionAt('above')}<p class="ps-caption">{sentenceCaption(line)}</p>{/if}<div class="ps-song-line">{#each line.slots as slot (slot.id)}<PrintCard {slot} {settings} {provider} />{/each}</div>{#if captionAt('below')}<p class="ps-caption ps-caption--below">{sentenceCaption(line)}</p>{/if}{/each}</div>{#if group.times > 1}<span class="ps-song-times">{t('ui.song_sung', { n: group.times })}</span>{/if}</div>{/each}</section>{:else if block.kind === 'song-again'}<!--
  The Refrain once more, by reference: its colour, an arrow round, its name.
--><p class="ps-song-again"><span class="ps-song-again__loop" aria-hidden="true">↻</span>{t('ui.song_refrain')}</p>{:else if block.kind === 'talk-page'}<!--
  A page of a Plauderbuch: the question on its band, the free field the
  answer is put into beside it, then a field for each Antwort the page holds.
--><section class="ps-grid ps-grid--page ps-talk" style={talkVars(block.geo, block.geo.cols)}><div class="ps-talk__band">{#each block.pictures as picture (picture.id)}<PrintPicture slot={picture} {provider} />{/each}<p class="ps-talk__question">{block.text}</p><span class="ps-talk__field ps-talk__field--free"><span class="ps-talk__dot"></span></span></div><div class="ps-talk__fields">{#each Array.from({ length: block.count }) as _, at (at)}<span class="ps-talk__field"><span class="ps-talk__dot"></span></span>{/each}</div></section>{:else if block.kind === 'talk-cut'}<!--
  The cards for the fields, the laminate's seam smaller than a field, with
  the Rand round each for the scissors; the cut lines where they are asked for.
--><section class="ps-grid ps-grid--page ps-talk-cut{settings.showLabel && settings.labelPosition === 'above' ? ' ps-talk-cut--above' : ''}" style="{talkVars(block.geo, block.cols)};--talk-w:{block.geo.cutW.toFixed(3)}mm;--talk-h:{block.geo.cutH.toFixed(3)}mm">{#each block.slots as slot (slot.id)}<span class="ps-talk-cut__cell"><span class="ps-talk__card"><PrintPicture {slot} {provider} />{#if settings.showLabel}<span class="ps-talk__word">{slotCaption(slot)}</span>{/if}</span></span>{/each}</section>{:else if block.kind === 'game-board'}<!--
  A Spiel's sheet, laminated whole: left the Ablage, a dashed field with a
  Klett dot per card, where the cut cards live between games; right the
  rows — the fixed pictures, then a dashed field per card to lay.
--><section class="ps-grid ps-grid--page ps-spiel{settings.showLabel && settings.labelPosition === 'above' ? ' ps-spiel--above' : ''}" style={gameVars(block.geo, 1)}><div class="ps-spiel__lager">{#each Array.from({ length: block.lager }) as _, k (k)}<span class="ps-talk__field"><span class="ps-talk__dot"></span></span>{/each}</div><span class="ps-spiel__zaun" aria-hidden="true"></span><div class="ps-spiel__rows">{#each block.rows as row, at (at)}<div class="ps-spiel__zelle">{#each row.cells as cell, z (z)}{#if cell.platz}<span class="ps-talk__field ps-talk__field--free"><span class="ps-talk__dot"></span></span>{:else}<span class="ps-spiel__bild"><PrintPicture slot={cell.slot} {provider} />{#if settings.showLabel}<span class="ps-spiel__wort">{slotCaption(cell.slot)}</span>{/if}</span>{/if}{/each}</div>{/each}</div></section>{:else if block.kind === 'game-cut'}<!--
  The cards for the fields: the Plauderbuch's cutting sheet, reused as it
  is — the fields' size, air round each, a dashed line for the scissors.
--><section class="ps-grid ps-grid--page ps-talk-cut ps-spiel-cut{settings.showLabel && settings.labelPosition === 'above' ? ' ps-spiel--above' : ''}" style="{gameVars(block.geo, block.cols)};--talk-w:{block.geo.cutW.toFixed(3)}mm;--talk-h:{block.geo.cutH.toFixed(3)}mm">{#each block.slots as slot (slot.id)}<span class="ps-talk-cut__cell"><span class="ps-talk__card"><PrintPicture {slot} {provider} />{#if settings.showLabel}<span class="ps-talk__word ps-spiel__wort">{slotCaption(slot)}</span>{/if}</span></span>{/each}</section>{:else if block.kind === 'shop-guide'}<!--
  A page of its own and the first: what the sheets become and how, for
  whoever is handed them without the person who printed them.
--><section class="ps-guide ps-break"><h2 class="ps-guide__head">{t('ui.shop_guide')}</h2><p>{t('ui.shop_guide_intro')}</p><h3>{t('ui.shop_guide_need')}</h3><p>{t('ui.shop_guide_need_text')}</p><div class="ps-guide__cols"><div><h3>{t('ui.shop_guide_make')}</h3><ol><li>{t('ui.shop_guide_make_1')}</li><li>{t('ui.shop_guide_make_2')}</li><li>{t('ui.shop_guide_make_3')}</li><li>{t('ui.shop_guide_make_4')}</li></ol><p class="ps-guide__tip">{t('ui.shop_guide_tip')}</p></div><div><h3>{t('ui.shop_guide_use')}</h3><ol><li>{t('ui.shop_guide_use_1')}</li><li>{t('ui.shop_guide_use_2')}</li><li>{t('ui.shop_guide_use_3')}</li></ol></div></div></section>{:else if block.kind === 'credit'}<!--
  The notice and where the sheet came from, and nothing else: the collection's
  name is the title's job, and on a credit line it only repeated it. The tail
  is held together, so on a narrow page it moves to a line of its own whole
  rather than leaving half an address behind.
--><p class="ps-attribution">{#each block.lines as line, at (line)}{#if at > 0}<br />{/if}{line}{/each}<span class="ps-made">, {t('ui.made_with')} <a class="ps-url" href={BILDHAFT_URL}>{BILDHAFT_URL}</a></span></p>{/if}{/snippet}

<div
  class="ps-sheet{cutUp && settings.showCutLines ? ' ps-sheet--cutlines' : ''}{pages ? ' ps-sheet--paged' : ''}{settings.layout === 'rezept' ? ' ps-sheet--recipe' : ''}{settings.layout === 'lied' ? ' ps-sheet--song' : ''}{settings.layout === 'plauderbuch' ? ' ps-sheet--talk' : ''}{settings.layout === 'spiel' ? ' ps-sheet--spiel' : ''}{settings.layout === 'einkaufsliste' ? ' ps-sheet--shop' : ''}{bleed ? ' ps-sheet--bleed' : ''}{settings.punch === 'left' ? ' ps-sheet--punch-left' : ''}{settings.anybookCircle ? ` ps-sheet--anybook ps-sheet--any-${settings.anybookPlace}` : ''}"
  style:--sym="{settings.symbolSizeMm}mm"
  style:--cut="{settings.cutMarginMm}mm"
  style:--card-w="{settings.cardWidthMm}mm"
  style:--card-h="{settings.cardHeightMm ?? settings.cardWidthMm}mm"
  style:--label="{settings.labelSizePt}pt"
  style:--sentence="{settings.sentenceSizePt}pt"
  style:--page-w="{page.width}mm"
  style:--page-h="{page.height}mm"
  style:--pm-top="{margins.top}mm"
  style:--pm-right="{margins.right}mm"
  style:--pm-bottom="{margins.bottom}mm"
  style:--pm-left="{margins.left}mm"
  style:--frame-w="{settings.cardBorderMm}mm"
  style:--frame-color={settings.cardBorderColor}
  style:--frame-pad="{framePadMm(settings)}mm"
  style:--card-radius="{settings.cardRadiusMm}mm"
  style:--card-bg={settings.cardBackground ?? 'transparent'}
  style:--page-bg={pageColour}
  style:--strip-w="{settings.cardBorderMm > 0 ? settings.cardBorderMm : 0.5}mm"
  style:--title-size="{settings.titleSizePt}pt"
  style:--title-pic="{titlePictureMm(settings.titleSizePt).toFixed(2)}mm"
  style:--title-colour={titleColour(settings)}
  style:--title-rule-gap="{TITLE_RULE_GAP_MM}mm"
  style:--title-rule="{TITLE_RULE_MM}mm"
  style:--recipe={settings.accentColour}
  style:--song={settings.accentColour}
  style:--spiel-accent={settings.accentColour}
  style:--spiel-grund={settings.gameGroundColour ?? 'transparent'}
  style:--talk-soft={talkSoft}
  style:--shop={String(SHOPPING_SCALE[settings.paper])}
  style:--cart={settings.cartColour}
>{#if pages}{#each pages as held, at (at)}<!--
  One line at the foot of every page: the licence notice on the left, the page
  number on the right — the usual footer of handed-out material.
--><div class="ps-page" class:ps-page--coloured={pageColour !== null || boardColour(held) !== null} style:--page-bg={boardColour(held)}>{#if settings.punch && settings.punchMarks && !cutOnly(held)}{#each ['a', 'b', 'mid'] as at (at)}<span class="ps-punch ps-punch--{settings.punch} ps-punch--{at}" aria-hidden="true"></span>{/each}{/if}{#if heading && (held[0]?.kind === 'store' || (settings.titleEvery && at > 0))}{@render one(heading)}{/if}{#each held as block, i (i)}{@render one(block)}{/each}{#if (credit || settings.showPageNumbers) && !bare(held)}<div class="ps-foot">{#if credit}{@render one(credit)}{/if}{#if settings.showPageNumbers}<p class="ps-page__n">{t('ui.page_n', { n: numberOf(at), total: numbered })}</p>{/if}</div>{/if}</div>{/each}{:else}{#each blocks as block, i (i)}{@render one(block)}{/each}{/if}</div>
