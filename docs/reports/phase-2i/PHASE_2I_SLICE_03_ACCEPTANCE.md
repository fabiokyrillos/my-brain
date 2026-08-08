# Phase 2I — Slice 2I.3 acceptance — shell and navigation convergence

**Date:** 2026-08-07 · **Migrations: 0** · **Requirements:** `2I-SHELL-001` … `2I-SHELL-006`

---

## This slice mostly asserts, and that is the deliverable

The parent PRD leads with a navigation redesign. **Almost all of it was already
shipped.** This slice changed the one thing that was not, and locked the rest
against regression.

## Requirements

| Id | Class | Evidence |
| --- | --- | --- |
| `2I-SHELL-001` | **baseline** | `primaryNavigationKeys` is exactly `home`, `inbox`, `work`, `chat`; `capture` is `visibility: "global"`; `work` still aliases `today`/`tasks`/`waiting`. Delivered by product-UX slice H; asserted here so a later slice cannot quietly change it |
| `2I-SHELL-002` | **rename** | `home` → **Hoje / Today** in `src/i18n/messages.ts`. **The only rename this phase owns.** The guard asserts `chat: "Conversar"` is left alone and that `home`'s route key is still `""`, so no saved URL breaks |
| `2I-SHELL-003` | **baseline** | `Mais` already renders groups derived from `capability.group`, each with a visible label and `role="group"`, on both breakpoints |
| `2I-SHELL-004` | **built** | Route preservation asserted per key: every capability has a route, **no duplicate route**, and every destination has a visibility other than "nowhere" |
| `2I-SHELL-005` | **baseline** | Desktop rail and mobile bar read the same `capabilities.ts`; `app-shell.test.tsx` already covers DOM order and locale parity |
| `2I-SHELL-006` | **baseline** | `--page-bottom` plus `env(safe-area-inset-bottom)`; a `:focus-visible` ring on every interactive element |

## A correction to this phase's own audit

`PHASE_2I_CURRENT_EXPERIENCE_AUDIT.md` §2 called `Mais` *"an undifferentiated
list of twelve"* and classified the grouping as **MISSING**.

**That was wrong.** `moreNavigationGroups` derives its groups from
`capability.group`, and `navigation-links.tsx` renders each one with a visible
label and `role="group"` on desktop **and** mobile. It shipped before Phase 2I
began.

This is the **third** time a planning pass over-stated remaining navigation work
by reading the product's feel rather than its source — after the two the audit
itself caught. The rule the PRD already imposed is the right one, and it is now
proven necessary rather than merely prudent: **a requirement claiming a rename
or a rebuild must cite the exact constant or component it changes.**

`2I-SHELL-003` is therefore classified **baseline**, not *built*. That is
precisely what the `baseline` / `built` / `rename` marker in the traceability
contract exists to make visible: a matrix that reported it identically to a
requirement that built something would overstate the phase.

## The rename, and why it is more than two words

`Início` says *this is where you arrive*. `Hoje` says *this is what is
happening* — which is the only reason to open it. It is the same move `chat`
made when it became `Conversar`: a destination is a place, so it gets the thing
it is about.

Four existing shell tests asserted the old labels and were updated in the same
change, which is the correct coupling — a rename that left its tests passing
would mean the tests were not asserting the label.

## Verification

Shell guard **15/15** · existing shell suite **87/87** after the rename · lint,
typecheck and build clean · full suite **4332/4332**.
