# Phase 2I — Slice 2I.2 acceptance — trust and action components

**Date:** 2026-08-07 · **Migrations: 0** · **Requirements:** `2I-TRUST-001` … `2I-TRUST-008`

---

## Requirements

| Id | Class | Evidence |
| --- | --- | --- |
| `2I-TRUST-001` | **built** | `SuggestionCard` — preview, optional edit, confirm **and dismiss**. Dismiss is not optional: a suggestion the user cannot decline is not a suggestion |
| `2I-TRUST-002` | **built** | `ConfirmationCard`. **`consequence` is required by the TYPE when `destructive`** — a discriminated union, not a comment |
| `2I-TRUST-003` | **built** | `SourceCard` renders a real `href`, so middle-click, Back and a screen reader's link list all work; the type is **text**, never colour alone |
| `2I-TRUST-004` | **built** | `ProcessingBanner` consumes `2I-LANG-005`'s copy rather than restating it |
| `2I-TRUST-005` | **built** | `UndoFeedback` renders undo when a handler exists and **says so plainly when none does** — never a disabled control, because a dead button stops the user looking for another way back |
| `2I-TRUST-006` | **built** | `EntityChip` takes a **string** label, so it has no way to render a raw database enum |
| `2I-TRUST-007` | **built** | `DetailSurface` — one contract, `role="dialog"`, labelled close, `Escape` handled; desktop side panel and mobile full-screen differ **in CSS only**, because two components is how two breakpoints drift apart |
| `2I-TRUST-008` | **built** | **Four structural assertions** over the whole directory: no Supabase client, no `.rpc(`/`.from(`/`.insert(`/`.update(`/`.upsert(`/`.delete(`, no `"use server"`, and **no `fetch`** |

## The requirement that carries the phase's biggest risk

`2I-TRUST-008` is **T-2I-02** in the threat model, and the threat model rates it
**likelier than the search oracle**. The reason is uncomfortable: the generic
version — a `<ConfirmationCard>` that takes a table name and an id — is *better
engineering* by every local measure. Less duplication, easier to extend. It is
also a second write path into a product whose per-action authorization, audit
and undo all live on the first one.

So the boundary is **structural, not advisory**: the guard reads every file in
`src/features/experience/` and fails on a client, an RPC, a table call, a server
action or a `fetch`. Components receive handlers; the handler is an existing
Server Action owned by a feature.

`ConfirmationCard`'s destructive variant makes the same point in the type
system. A destructive confirmation whose consequence is unstated is the exact
shape this product removed from task deletion and account deletion — a shared
component that permitted it would reintroduce it everywhere at once, which is
why the union requires `consequence` rather than a comment asking for it.

## Verification

Behavioural tests cover: dismiss always present; the destructive consequence
rendered and its button styled destructively; a routine confirmation **not**
dressed as destructive; undo present with a handler and replaced by an honest
note without one; `SourceCard`'s type label and real `href`.

lint clean · typecheck clean · build passes · **14/14** behavioural · **18/18**
structural.
