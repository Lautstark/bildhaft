# What conventions.md should say now that a Sammlung holds its symbol source

Written 2026-08-26, in bildhaft rather than in `~/Code/design`, because amending
that document is a design session with its own gates. This is the note that
session should start from. Nothing here has been applied anywhere.

## What changed here

`Collection.provider` is a new optional field: which symbol source that Sammlung
is drawn in, or absent for "follow the default". `settings.activeProvider` is
the default rather than the active source. The choice is made from the `⋯`
beside the Sammlung's name, and the line under the composer says which source is
in force and whose answer that is.

`~/Code/design/docs/conventions.md` §3.10 **exempts bildhaft's symbol provider
by name**, so nothing here was owed. The move is a product decision: a carer
with one Sammlung for school and one for home wants each to open in the source
that Sammlung uses, rather than reaching for a global switch every time. Made
after reading the exemption rather than around it.

## §3.10, the exemption bullet

The paragraph that names bildhaft is now a description of a state that no longer
exists. It is also the sentence that carries the reasoning, and the reasoning is
still right — which is the whole difficulty. It should say what the property
buys rather than what one product does with it:

> - **A setting that changes only what you see, and nothing you made, is
>   exempt — and exempt means the rule does not compel the move, not that the
>   move is wrong.** bildhaft's symbol source was the worked case, and on
>   2026-08-26 it became the worked case of a product making the move anyway. A
>   slot stores a concept key and a choice *per provider*, overrides are keyed
>   `${provider}:${token}`, and the picture is resolved at render time, so
>   switching source redraws the page and disturbs nothing that was made, and
>   switching back finds every manual correction still there. That is what made
>   the exemption correct, and it is the same property that made moving it onto
>   the Sammlung safe: what a Sammlung stores is a stored *view* preference, and
>   nothing about what is saved changed. A view setting is still not a content
>   setting. It is simply free to belong to a Sammlung, when a Sammlung is the
>   thing somebody switches between.

## §3.10, "Where the three stand"

The bildhaft bullet ends on the sentence this change falsified:

> nothing in an exported file names one library as *the* answer, so there is
> nothing for a per-Sammlung symbol setting to be.

There is something for it to be, and the exemption above had already named it: a
view. What the sentence was really protecting is the export notice, and that is
now kept by construction rather than by absence. It should say:

> - **bildhaft: not forced, and it moved anyway (2026-08-26).** It references
>   and resolves, and its export notice promises what that buys — the file
>   „kann unabhängig davon geteilt werden, welche Symbolsammlung die
>   Empfängerin oder der Empfänger besitzt". A Sammlung now holds a `provider`,
>   and `portable()` in `db/exportImport.ts` strips it from a single-Sammlung
>   export, so no file that leaves the machine names one library as *the*
>   answer. A Sicherung keeps it: that file goes back to the machine whose
>   folder is real. `tests/unit/export-portability.test.ts` is where the promise
>   is asserted rather than assumed.

## §3.6 gains a second product

The amendment of 2026-08-25 — the `⋯` holds what a Sammlung *is* as well as what
can be done to it — had vorlaut's *Raster* card as its only instance. bildhaft's
`Symbolquelle …` is a second, in the order that section gives: export, then what
the Sammlung is set to, then the delete. Worth recording, because a rule with
one instance reads as a description of that instance.

## §4.1 is untouched, and that is worth stating

bildhaft is still **one**: a sentence belongs to one Sammlung. Nothing about
arity moved, and this change is not the mitreden case in a second product.

There, the voice moved from the sentence to the Sammlung, and the arity followed
the model — a sentence in two Sammlungen would have had two answers to which
voice recorded it. Here nothing moved *off* a sentence. A slot's per-provider
choices are exactly where they were; what the Sammlung gained is a preference
about which of them to show. A sentence in two Sammlungen would have had no
contradiction to resolve, so this change says nothing either way about an arity
bildhaft answered on its own merits.

Also unchanged: bildhaft opens exactly one Sammlung at a time, so it needs no
equivalent of mitreden's `nextCollection()`. "The Sammlung you are in" is never
ambiguous here.

## One thing to look at rather than a conclusion

The **Wörterbuch panel** in Einstellungen now lists the entries for the source
the page is drawing in, not for the default. An override key is
`${provider}:${token}`, so a panel showing the default's corrections beside a
page rendering something else would be a list of the ones that are *not* in
force — and its own sentence, „jede Korrektur wird hier gemerkt … für METACOM",
would be about a source no correction made now would be filed under.

Read strictly against §3.10's test — *does this answer change when a different
thing is selected?* — that panel now answers differently per Sammlung, which is
the shape the section is written against. The judgement taken here is that it
passes: it is not a setting at all. It is a list of stored data, the data is
library-wide rather than per Sammlung, and what changes with the selection is
which slice of it is relevant, not what any of it is. But that is a judgement,
made by the person who moved the source, and the section's test does not
distinguish "a setting whose answer changes" from "a list whose filter changes".
It probably should, and that is a sentence for the design session rather than
for this one.
