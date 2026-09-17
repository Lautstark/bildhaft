<script lang="ts">
  /**
   * The Wortschatz: the words this household has settled, each with its picture
   * and its tags, as a place of its own.
   *
   * It began as the body of a settings panel and is now what adr/0002 said it
   * would become — a row in the sidebar with a work head, a composer and a wall
   * of cards, the same three parts a Sammlung has. Which is the point: adding a
   * word is typing, and typing looks the same everywhere in this app.
   *
   * A tag is a lens, not a folder: one list, looked at through one tag at a time.
   * The filter row is `.chip` from components.css, whose rule says the same thing
   * — "a chip changes what is shown, never what is stored" — so the tags on a
   * card, which *are* stored, are deliberately not chips.
   */
  import type { Candidate, Override, Slot } from '../core/types.ts';
  import { ownImageId } from '../core/types.ts';
  import {
    deleteOverride, dropTag, listOverrides, newId, putOverride, putOwnImage, renameTag,
    setOverrideCaption, setOverrideTags,
  } from '../db/repo.ts';
  import { topicsOf } from '../core/tags.ts';
  import { renameField, type RenameField } from '@lautstark/design/rename';
  import ActionMenu from './ActionMenu.svelte';
  import SymbolPicture from '../pieces/Symbol.svelte';
  import TypingBox from './TypingBox.svelte';
  import { openSlotPicker } from './slotPicker.svelte.ts';
  import { confirmDialog } from './dialog.ts';
  import { provider, providerId, s } from '../app/state.svelte.ts';
  import { answered, asking } from '../app/asking.svelte.ts';
  import { refreshCollections } from '../app/collections.ts';
  import { persistSettings } from '../app/settings.ts';
  import { notify } from '../app/notify.ts';
  import { t } from '../i18n/index.ts';

  const fold = (tag: string) => tag.trim().toLowerCase();
  const tagsOf = (entry: Override) => entry.tags ?? [];

  /**
   * An entry as the picker sees it — that dialog speaks Slot, and an entry is the
   * same three facts a slot carries: the word, the picture, and the words under
   * it. Passing the caption in is what makes „Text zum Symbol" open with
   * what is stored rather than empty.
   */
  const asSlot = (token: string, entry?: Override): Slot => ({
    id: newId(),
    sourceToken: token,
    concept: token.toLowerCase(),
    origin: 'manual',
    choice: entry ? { [entry.provider]: entry.symbolId } : {},
    candidates: {},
    ...(entry?.caption ? { label: entry.caption } : {}),
  });

  /** The tag being looked through, as written. `null` is all of them. */
  let lens = $derived(s.wortschatz?.tag ?? null);
  /** What the last read returned, so a write can merge rather than replace. */
  let entries = $state.raw<Override[]>([]);
  /** Typed words the source had no picture for. Not entries yet — see add(). */
  let pending = $state.raw<string[]>([]);
  let draft = $state('');
  let busy = $state(false);
  /** The entry whose tag input is open, by key. One at a time. */
  let editing = $state<string | null>(null);

  /* Which read is the current one. Two writes in quick succession start two
     reads, and the slower one landing second would repaint the list as it was
     before the second write — a word deleted and back again in the same
     second, which is exactly what "it is not deleted" looks like. */
  let reading = 0;
  /* Bumped by every write, so the read below runs again. */
  let generation = $state(0);

  $effect(() => {
    const source = providerId();
    void generation;
    const mine = (reading += 1);
    void listOverrides(source).then((read) => { if (mine === reading) entries = read; });
  });

  const refresh = () => { generation += 1; };

  /* A lens is a different list, and the words that are still waiting for a
     picture belong to the typing that produced them rather than to the tag. */
  $effect(() => { void lens; pending = []; });

  function go(tag: string | null): void { s.wortschatz = { tag }; }

  /* A pinned tag that nothing carries any more is still a tag: it was made on
     purpose and is a row in the sidebar. So the lens survives an empty
     result, and only an unpinned one falls back to everything. */
  $effect(() => {
    const held = lens;
    if (!held) return;
    const pinned = s.settings?.pinnedTags ?? [];
    if (pinned.some((tag) => fold(tag) === fold(held))) return;
    if (entries.some((entry) => tagsOf(entry).some((tag) => fold(tag) === fold(held)))) return;
    go(null);
  });

  let shown = $derived(lens === null
    ? entries
    : entries.filter((entry) => tagsOf(entry).some((tag) => fold(tag) === fold(lens))));

  /* ------------------------------------------------------------- head --- */

  let titleInput: HTMLInputElement | undefined = $state();
  let titleField: RenameField | undefined;

  /* Debounced while typing, written on blur and on Enter. Renaming a tag is a
     write to every entry carrying it, which is what makes the debounce worth
     more here than on a Sammlung's name. */
  $effect(() => {
    if (!titleInput) { titleField = undefined; return; }
    const made = renameField(titleInput, (typed) => {
      const from = lens;
      if (!from || !typed.trim()) return undefined;
      const to = typed.trim();
      persistSettings({
        ...s.settings!,
        pinnedTags: (s.settings?.pinnedTags ?? []).map((tag) => (fold(tag) === fold(from) ? to : tag)),
      });
      go(to);
      return renameTag(from, typed).then(() => { void refreshCollections(); refresh(); });
    });
    titleField = made;
    return () => made.stop();
  });

  $effect(() => { titleField?.refresh(lens ?? ''); });

  /* „+ Neuer Tag" makes the tag and puts the caret in its name, selected;
     conventions.md §1.5, the same bargain a new Sammlung is made under. */
  $effect(() => {
    if (asking() !== 'tag-name' || !titleInput) return;
    titleInput.focus();
    titleInput.select();
    answered();
  });

  let count = $derived(shown.length === 1 ? t('ui.n_words_one') : t('ui.n_words', { n: shown.length }));

  async function deleteLens(): Promise<void> {
    const gone = lens;
    if (!gone) return;
    persistSettings({
      ...s.settings!,
      pinnedTags: (s.settings?.pinnedTags ?? []).filter((tag) => fold(tag) !== fold(gone)),
    });
    await dropTag(gone);
    go(null);
    await refreshCollections();
    refresh();
  }

  /* ------------------------------------------------------------ write --- */

  /**
   * Takes what is typed, one word per line.
   *
   * A word the source has no picture for is *not* written: an entry is a word
   * with a picture, and `symbolId` has nowhere to put "none". It waits in
   * `pending` as a card with a question mark instead — the same shape an
   * unresolved slot has in a Sammlung, and the same click opens the same
   * picker. That is where the proper nouns are, so it has to be one click and
   * not an apology.
   */
  async function add(): Promise<void> {
    const typed = [...new Set(draft.split('\n').map((line) => line.trim()).filter(Boolean))];
    if (typed.length === 0 || busy) return;

    busy = true;

    const held = new Map(entries.map((entry) => [entry.token, entry]));
    const missed: string[] = [];
    let added = 0;
    for (const word of typed) {
      const found = await provider().search(word).catch(() => []);
      const best = found[0];
      if (!best) { missed.push(word); continue; }
      await file(word, best, held.get(word.toLowerCase())?.tags ?? []);
      added += 1;
    }

    draft = '';
    busy = false;
    pending = [...new Set([...pending, ...missed])];
    if (added > 0) {
      notify(added === 1 ? t('ui.n_words_added_one') : t('ui.n_words_added', { n: added }));
    }
    await refreshCollections();
    refresh();
  }

  /** One word, one picture, plus the open tag if there is one. */
  async function file(word: string, candidate: Candidate, held: readonly string[]): Promise<void> {
    await putOverride(providerId(), word, candidate);
    if (lens) await setOverrideTags(providerId(), word, [...held, lens]);
  }

  function pick(word: string, entry?: Override): void {
    const held = entry?.tags ?? [];
    const done = () => {
      pending = pending.filter((one) => one !== word);
      void refreshCollections();
      refresh();
    };
    openSlotPicker(asSlot(word, entry), providerId(), {
      onChoose: (candidate) => void file(word, candidate, held).then(done),
      /* A picture of the person's own is the case this whole place exists for
         — Oma, Bello, Kita Sonnenschein — so it has to work here and not only
         inside a sentence. An entry points at it by the same prefixed id a
         Slot uses, which is why `Symbol.svelte` can already draw it. */
      onOwnImage: (picture, name) => void putOwnImage(picture, name)
        .then((image) => file(word, { id: ownImageId(image.id), label: word, score: 1000 }, held))
        .then(done),
      /* The words that go with the symbol are half of what an entry is, so this is
         the one field of the dialog that means the same thing here as it does
         in a Sammlung — and it means it for every sentence, rather than for
         one row. It was thrown away for a week, which is what made the entry
         impossible to read: the card showed a word and the picker offered to
         change a caption that went nowhere. */
      onLabel: (caption) => void setOverrideCaption(providerId(), word, caption)
        .then(() => { void refreshCollections(); refresh(); }),
      /* The rest acts on a Slot in a Sammlung. Crossing a symbol out is a thing
         a sentence does to a word in one place, and removing the slot removes
         the field rather than the word — the × on the card is what removes
         this. Nothing to do, and nothing to pretend. */
      onClearOwnImage: () => undefined,
      onNegate: () => undefined,
      onRemove: () => undefined,
      onClose: () => undefined,
    });
  }

  async function drop(entry: Override): Promise<void> {
    const name = entry.caption?.trim() || entry.token;
    const sure = await confirmDialog({
      title: t('ui.remove_word_title', { word: name }),
      body: t('ui.remove_word_body'),
      confirmLabel: t('ui.remove_word_confirm'),
      danger: true,
    });
    if (!sure) return;
    await deleteOverride(entry.provider, entry.token);
    await refreshCollections();
    refresh();
  }

  async function retag(entry: Override, tags: string[]): Promise<void> {
    editing = null;
    await setOverrideTags(entry.provider, entry.token, tags);
    await refreshCollections();
    refresh();
  }

  function pin(label: string, held: boolean): void {
    persistSettings({
      ...s.settings!,
      pinnedTags: held
        ? (s.settings?.pinnedTags ?? []).filter((tag) => fold(tag) !== fold(label))
        : [...(s.settings?.pinnedTags ?? []), label],
    });
    void refreshCollections();
    refresh();
  }

  /* ------------------------------------------------------------- tags --- */

  /**
   * What the source suggests this word is, already in the reader's language.
   *
   * Derived at every repaint rather than stored, because these are wordings and
   * the interface has two languages — see the note on `Override.categories`.
   * ARASAAC's own vocabulary is mapped onto our themes; METACOM's is the
   * person's folder names and is shown as it stands, because replacing what
   * somebody called a thing with what we would have called it is not a
   * translation.
   *
   * A suggestion a person has also typed themselves is dropped here: it is the
   * same tag, and one of them has a way to be removed.
   */
  function suggestedFor(entry: Override): string[] {
    const said: string[] = [];
    if (entry.wordClass) {
      said.push(t(entry.wordClass === 'noun' ? 'ui.wordclass_noun' : 'ui.wordclass_verb'));
    }
    said.push(...(entry.provider === 'arasaac'
      ? topicsOf(entry.categories).map((topic) => t(`ui.topic_${topic}`))
      : entry.categories ?? []));

    const own = new Set(tagsOf(entry).map(fold));
    return said.filter((tag) => !own.has(fold(tag)));
  }

  interface Tally { label: string; n: number }

  // First spelling wins for display; the count is over the folded form. A
  // suggested tag counts exactly like a typed one — a lens does not care who
  // said the word, only which entries carry it.
  let tallies = $derived.by(() => {
    const own = new Map<string, Tally>();
    const said = new Map<string, Tally>();
    const bump = (into: Map<string, Tally>, tag: string) => {
      const seen = into.get(fold(tag));
      if (seen) seen.n += 1;
      else into.set(fold(tag), { label: tag, n: 1 });
    };
    for (const entry of entries) {
      for (const tag of tagsOf(entry)) bump(own, tag);
      for (const tag of suggestedFor(entry)) bump(said, tag);
    }
    // A pinned tag with nothing in it still has a chip, or the row in the
    // sidebar would lead somewhere the filter row says does not exist.
    for (const tag of s.settings?.pinnedTags ?? []) if (!own.has(fold(tag))) own.set(fold(tag), { label: tag, n: 0 });
    return { own, said };
  });

  const byLabel = (a: Tally, b: Tally) => a.label.localeCompare(b.label);
  let ownTags = $derived([...tallies.own.values()].sort(byLabel));
  let saidTags = $derived([...tallies.said.values()].sort(byLabel));
  let anyTags = $derived(tallies.own.size > 0 || tallies.said.size > 0);
  const isPinned = (label: string) => (s.settings?.pinnedTags ?? []).some((tag) => fold(tag) === fold(label));

  /* Committing on the way out rather than asking for a save button: by §1.5 the
     thing is made when it is named, and a typed word that vanishes because the
     person clicked elsewhere is a word they will type twice. Empty simply
     closes. */
  function commit(entry: Override, input: HTMLInputElement): void {
    const typed = input.value.trim();
    if (!typed) { editing = null; return; }
    void retag(entry, [...tagsOf(entry), typed]);
  }

  /* The placeholder says what typing here will do, and in a tag that is one
     thing more than adding a word. */
  let placeholder = $derived(lens
    ? t('ui.add_words_to_tag_placeholder', { tag: lens })
    : t('ui.add_words_placeholder'));
</script>

{#snippet meta()}<span>{@html t('ui.add_words_hint')}</span>{/snippet}

<TypingBox value={draft} {busy} {placeholder} label={t('ui.add_words_label')} action={t('ui.add_words')} {meta} onChange={(value) => { draft = value; }} onSubmit={() => void add()} />

<!--
  No action in this head, and that is deliberate. „Sammlung daraus" stood here
  for an afternoon and only ever made a *new* Sammlung — which is the rarer half
  of what people do with a Wortschatz. Adding words to the one they already have
  open is the other half and the commoner one, so the action lives there
  instead, in the Sammlung's own ⋯ where it can be used again and again. The
  composer is this place's action.
--><div class="collection-head">{#if lens === null}<span class="work-title">{t('ui.all_words')}</span><span class="small faint" style="white-space:nowrap">{count}</span>{:else}<input bind:this={titleInput} class="title-input" aria-label={t('ui.tag_name')} placeholder={t('ui.tag_name')} /><span class="small faint" style="white-space:nowrap">{count}</span><span><ActionMenu label={t('ui.tag_actions')} build={(item) => {
  item(t('ui.unpin_tag'), () => pin(lens!, true));
  item(t('ui.delete_tag'), () => void deleteLens(), { danger: true });
}} /></span>{/if}</div>

<div class="wortschatz"><div class="tag-filters">{#if anyTags}<button class="chip" type="button" aria-pressed={lens === null} onclick={() => go(null)}>{t('ui.filter_all')}<span class="n">{entries.length}</span></button>{#if tallies.own.size > 0}<span class="tag-filters__sep"></span>{/if}{#each ownTags as tag (tag.label)}{@const on = lens !== null && fold(lens) === fold(tag.label)}<button class="chip" type="button" aria-pressed={on} onclick={() => go(tag.label)}>{tag.label}<span class="n">{tag.n}</span><!--
  The pin sits on the chip that is on, and only on a tag somebody typed. A
  suggested one is a wording — „Nomen" is „Noun" tomorrow — and a sidebar row
  remembering a word this app translated is a row that empties itself when the
  interface changes language.
-->{#if on}{@const held = isPinned(tag.label)}<span class="chip__pin" role="button" tabindex="0" title={held ? t('ui.unpin_tag') : t('ui.pin_tag')} aria-label={held ? t('ui.unpin_tag') : t('ui.pin_tag')} style:opacity={held ? '1' : '.45'} onclick={(event) => { event.stopPropagation(); pin(tag.label, held); }} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); pin(tag.label, held); } }}>📌</span>{/if}</button>{/each}{#if tallies.said.size > 0}<span class="tag-filters__sep"></span>{/if}{#each saidTags as tag (tag.label)}<button class="chip" type="button" aria-pressed={lens !== null && fold(lens) === fold(tag.label)} onclick={() => go(tag.label)}>{tag.label}<span class="n">{tag.n}</span></button>{/each}{/if}</div><div class="words">{#if shown.length === 0 && pending.length === 0}<div class="empty"><b>{lens ? t('ui.tag_empty') : t('ui.no_entries')}</b><small>{lens ? t('ui.tag_empty_hint') : t('ui.wortschatz_empty_hint')}</small></div>{:else}{#each pending as word (word)}<div class="word word--waiting"><button class="word__pic word__pic--asking" type="button" aria-label={t('ui.pick_picture_for', { word })} onclick={() => pick(word)}>?</button><b class="word__name">{word}</b><span class="tags"><button class="tag tag--ask" type="button" onclick={() => pick(word)}>{t('ui.pick_picture')}</button></span></div>{/each}{#each shown as entry (entry.key)}<div class="word"><button class="word__pic" type="button" aria-label={t('ui.change_picture_for', { word: entry.token })} onclick={() => pick(entry.token, entry)}><SymbolPicture provider={entry.provider} id={entry.symbolId} alt={entry.label} /></button><!--
  Asked first. The settings panel this replaced had a labelled „Entfernen"
  button that took a deliberate press; a cross in the corner of a card takes a
  stray one, and what it throws away is a picture somebody chose and a text they
  wrote.
--><button class="word__drop" type="button" aria-label={t('ui.remove_word', { word: entry.token })} onclick={() => void drop(entry)}>×</button><!--
  What is stored, in the order it is stored: the picture, the words that go with
  it, and — only when they differ — the word this answers to. The second line is
  why: „Omi" under a picture that answers to „oma" is a fact somebody has to be
  able to see, or the entry is a black box with a photograph in it.
--><b class="word__name">{entry.caption?.trim() || entry.token}</b>{#if entry.caption?.trim() && entry.caption.trim().toLowerCase() !== entry.token}<span class="word__for">{t('ui.stands_for', { word: entry.token })}</span>{/if}<span class="tags">{#each tagsOf(entry) as tag (tag)}<span class="tag"><span>{tag}</span><button class="tag__x" type="button" aria-label={t('ui.remove_tag', { tag })} onclick={() => void retag(entry, tagsOf(entry).filter((one) => fold(one) !== fold(tag)))}>×</button></span>{/each}{#each suggestedFor(entry) as tag (tag)}<span class="tag tag--auto">{tag}</span>{/each}{#if editing === entry.key}<input class="tag-input" type="text" list="wortschatz-tags" placeholder={t('ui.tag_name')} aria-label={t('ui.tag_name')} autocomplete="off" spellcheck="false" {@attach (node: HTMLInputElement) => node.focus()} onkeydown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(entry, event.currentTarget); } else if (event.key === 'Escape') editing = null; }} onblur={(event) => commit(entry, event.currentTarget)} />{:else}<button class="tag tag--add" type="button" onclick={() => { editing = entry.key; }}>{t('ui.add_tag')}</button>{/if}</span></div>{/each}{/if}</div><!--
  Known tags, offered to every tag input on the page. One per view rather than
  one per card: the browser matches a datalist by id, so a second copy would be
  dead markup.
--><datalist id="wortschatz-tags">{#each ownTags as tag (tag.label)}<option value={tag.label}></option>{/each}{#each saidTags as tag (tag.label)}<option value={tag.label}></option>{/each}</datalist></div>
