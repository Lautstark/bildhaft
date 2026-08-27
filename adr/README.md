# Decisions

Decisions that will otherwise be "tidied up" later.

A file lands here when the decision it records **looks like an oversight from
the outside** — a table of one entry, a version the code deliberately refuses, a
destructive path kept alive on purpose. Each of those invites a cleanup, and the
cleanup would undo something that was decided. The last section of these files
says what the cleanup will look like when somebody proposes it.

This is the first one. The convention is the one the sibling repositories use:
four digits, a sentence for a title, and the number claimed by looking at `main`
rather than at your own branch.

| | |
|---|---|
| [0001](0001-an-upgrade-has-a-step-or-refuses.md) | An upgrade has a step for every version it crosses, or it refuses and changes nothing |
