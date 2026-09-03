# ADR 0002 — The Wortschatz is a place of its own, and material has a kind

**Status:** accepted · **Date:** 2026-09-02 · **Amended:** 2026-09-03 · **Applies
to:** the sidebar shell,
`src/db/repo.ts`'s overrides, `src/db/folder.ts`'s `woerterbuch` kind, and every
future editor that is not the sentence editor

## Context

bildhaft today has one noun. A Sammlung holds Sätze, a Satz holds Slots, a Slot
resolves to a symbol, and the whole sidebar is a list of Sammlungen. Everything
else the app knows about words lives in Einstellungen: the corrections a person
made are in the „Mein Wörterbuch" panel, the function words are in another panel
below it, and neither is anywhere a person goes on purpose.

Two things have happened to that shape.

The first is that the corrections stopped being local. An override is keyed
`lang:provider:token` — not by Sammlung — so a person who fixes *Oma* once has
fixed it for every Sammlung they will ever write, including the ones that do not
exist yet. That was already true before anybody called it a Wortschatz. Since
`src/db/folder.ts`, those overrides are also filed to the Ablage under the kind
`woerterbuch`, which means they are on disk, in a folder the person picked, in
one file per record. The store that a shared vocabulary needs is built.

The second is what bildhaft is for. It was a way to turn sentences into strips of
symbols and print them. What the household actually makes is broader than that
and is not all sentences: Wortkarten, Satzstreifen, Kommunikationstafeln,
Kommunikationsfächer, Plauderbücher, Abläufe. These are not variations of a
sentence strip. They share the words and share nothing else — a Tafel has a grid
and a print sheet, an Ablauf has an order and arrows, a Fächer is cut and bound.
An editor that tried to be all of them at once would be an editor that is good at
none of them, which the druckwerk spike demonstrated at length before it was
paused.

## Decision

**bildhaft has two nouns, and both are in the sidebar.** *Wortschatz* is the
words a household has settled: this picture for this word, in this language.
*Sammlung* is what gets made out of them and printed, and it keeps that name:
„Material" was a word from the druckwerk spike and names nothing a Sammlung does
not already name, so the second noun is the one that is already there. The
sidebar carries a WORTSCHATZ section above the SAMMLUNGEN, and Einstellungen
stays at its foot.

**The dictionary panel goes, rather than staying as a second door.** This said
the opposite when it was written — the panel would keep working — and it was
wrong in a way worth recording: the panel held the list only because there was
nowhere else to put it, and once there is a place, every trace of it left in
Einstellungen is the same count kept in two places and two answers to "where is
my Wortschatz". What §3.10 has left there is only what a setting is.

**A tag is a lens, not a folder.** A word carries any number of tags. Some are
derived — ARASAAC hands back `categories` and a keyword `type` per pictogram, so
Wortart and Thema can be filled in without anybody typing them — and some are the
person's own (*Kita*, *Oma*, *Urlaub*). The WORTSCHATZ section lists „Alle
Wörter" plus the tags the person pinned there, and each row is a filter over one
list, not a container holding its own copy. A word in no tag is not lost; it is
in „Alle Wörter", which is where it always was.

**The Wortschatz ranks; it never blocks.** When a word resolves, an entry in the
Wortschatz moves its picture to the front of the candidates. It does not remove
the others, does not stop the picker from offering them, and does not stop a
person from choosing differently for one Slot. This is what `prefer()` in
bildquelle's `ResolveOptions` is for, and it is why that hook exists rather than
a fifth `ProviderId`.

**A Sammlung has a kind, chosen when it is created, and the kind decides the
editor and the print dialog.** vorlaut already works this way. The kind is
written once and not changed afterwards: a Sammlung of Sätze does not become a
Tafel by a menu, it becomes one by being made as a Tafel from the same words. The
sentence editor that exists today is the kind `saetze`, and nothing about it
changes.

**A Sammlung can be made without the Wortschatz.** Typing sentences into a new
Sammlung — no tags, no words filed, nothing pinned — stays a complete way to use
bildhaft. The Wortschatz is what a person accumulates by using the app, not a
step they have to complete before the app does anything.

## Why

*Two nouns rather than one.* The alternative was to let a Sammlung be the only
container and give it a type — the shape bildhaft has now. It fails on the fact
that already holds: an override is not owned by a Sammlung. Filing a
household-wide thing inside one of many Sammlungen means either copying it (and
then having two answers to "what does Oma look like") or leaving it in
Einstellungen where nobody finds it. The Wortschatz is at the top of the sidebar
because that is the thing a household builds once and uses for years, and the
material is the thing they make on a Tuesday and throw away in March.

*Ranking rather than binding.* A vocabulary that replaced the symbol would be
wrong the first time somebody wanted the generic picture for a generic sentence
— *Oma kommt* wants the person's grandmother, *eine Oma* on a Wortkarte for a
book may not. Ranking is also the only version that degrades correctly: an entry
whose picture cannot be read falls back to the source instead of leaving a hole.

*Tags as lenses.* Folders force a word into one place and then ask what to do
with *Apfel* under both *Essen* and *Kita*. The mock made the answer obvious the
moment two tags wanted the same word. Deriving what can be derived matters
separately: a person who has to tag three hundred words by hand will tag none of
them, and ARASAAC is already telling us the noun-or-verb and the theme on every
response we make.

*A kind per material.* The alternative — one editor that transforms between
shapes — was considered and rejected. It assumes every shape can be derived from
every other, and it cannot: there is no honest way to turn a Kommunikationstafel
into a sequence of Sätze, and pretending there is produces an app that is
confusing everywhere instead of clear in one place. A kind per material means a
new material shape is a new editor and a new print dialog beside the existing
ones, and it means adding one cannot break the sentence editor that people use
today.

## Consequences

The sidebar shell changes, which is the one part of this that touches something
every screen depends on. It is worth doing in its own step, before any second
editor exists, so that the shell change can be judged on its own.

`Override` becomes the storage of a Wortschatz entry rather than of a correction,
and will grow: tags, and a picture that is the person's own file rather than a
provider's id. The `woerterbuch` kind in the Ablage is where those files already
go, so growing the record does not need a new place to put it.

Four products want the same Wortschatz and sit on four origins, so no shared
IndexedDB can serve them. The Ablage can — a folder is not bound to an origin —
but `AblageOptions.app` keys both the subtree and the remembered folder handle,
so a second, shared `wortschatz` compartment would ask a household to pick the
same folder twice. That is a small additive gap in `@lautstark/sicherung`, and it
is the only package change this decision needs. Until it is closed, the Wortschatz
is bildhaft's and is complete as bildhaft's.

## Not to be "fixed" later

**"Two lists in one sidebar is redundant — merge them."** They are not two lists
of the same thing. One holds words that outlive every Sammlung, the other holds
Sammlungen. Merging them means picking one lifetime for both, and whichever is
picked, the other becomes wrong: either the Wortschatz gets thrown away with a
Sammlung, or a printed Tafel from last March is still sitting in the sidebar
because a word in it is still in use.

**"A tag should be a folder — then the sidebar row can just show its contents."**
Then *Apfel* is in *Essen* or in *Kita* and not both, and the person who wanted
it in both has to duplicate the word. Two copies of *Apfel* is two answers to
what an apple looks like, which is precisely what the Wortschatz exists to
prevent. Whoever proposes this has to say which folder *Apfel* goes in.

**"The Wortschatz should replace the symbol, not just rank it — a person who set
a picture means it."** They mean it for that word in their household, not for
every use of it in every material forever. Ranking gives them the picture by
default in one click and leaves the other candidates reachable; replacing gives
them the picture and no way back except deleting the entry. It also makes an
unreadable own picture a blank slot rather than a fallback.

**"The kind should be changeable — somebody will pick the wrong one."** They
will, and the fix is to make the material again from words that are all still
there, which costs a minute. A changeable kind costs a defined transformation
between every pair of kinds, most of which have no honest definition, and every
one of which has to keep working as kinds are added. Whoever proposes it has to
say what a Kommunikationsfächer becomes when it is turned into Sätze.

**"A Sammlung without a Wortschatz is a special case — require the Wortschatz and
there is one path."** The empty case is not a special case, it is the first ten
minutes of everybody's use of the app, and an app that asks a person to build a
vocabulary before it will print anything is an app they close. The Wortschatz is
what using bildhaft leaves behind, not what it demands up front.
