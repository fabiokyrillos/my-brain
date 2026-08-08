# Phase 2I — Slice 2I.4 acceptance — command palette

**Date:** 2026-08-07 · **Migrations: 0** · **Requirements:** `2I-PALETTE-001` … `2I-PALETTE-010`

---

## Requirements

| Id | Class | Evidence |
| --- | --- | --- |
| `2I-PALETTE-001` | **built** | `Ctrl`/`Cmd`+`K` from any authenticated screen **and** an explicit `palette-trigger` button. On mobile there is no shortcut, so the button *is* the entry point; full-screen presentation under 760 px with the field at the top so the virtual keyboard does not cover the results it filters |
| `2I-PALETTE-002` | **built** | Destinations derived from `navigationCapabilities` + `getNavigationHref`, never a second list. A destination added tomorrow appears tomorrow; one removed cannot linger |
| `2I-PALETTE-003` | **built** | `create:capture` → the capture surface, `create:conversation` → the composer |
| `2I-PALETTE-004` | **built** | `create:task` routes to the composer, which owns `task-commands`' create-intent path **with its preview and confirmation**. The palette creates nothing |
| `2I-PALETTE-005` | **built** | **No generic executor.** See §2 — asserted three independent ways |
| `2I-PALETTE-006` | **built** | Grouped `create` / `navigate` / `search`, each a labelled `role="group"` |
| `2I-PALETTE-007` | **built** | `canCreate: false` **omits** create actions; navigation survives. Test proves both directions, so the absence is caused by the flag rather than by the builder never producing them |
| `2I-PALETTE-008` | **built** | No network call on the open-or-filter path — asserted structurally. The list is built in memory from `capabilities.ts` and filtered with a string match |
| `2I-PALETTE-009` | **not built, by rule** | Recents would need per-user action history. The action **kind** is content-free and safe, but storing it is state that outlives the palette, which `2I-PALETTE-010` forbids. `2I-PALETTE-009` says *only if* it can be built inside the constraint; it cannot, so it is not built |
| `2I-PALETTE-010` | **built** | No `localStorage`/`sessionStorage`/`cookie`/`indexedDB`, no nested navigation, no multi-step flow — asserted structurally |

## The boundary, asserted three ways

`2I-PALETTE-005` is **T-2I-02**, which the threat model rates *likelier than the
search oracle*. The generic version — a map of strings to handlers, then
handlers with parameters, then a handler that writes — is **better engineering
by every local measure**, which is exactly why it gets built.

Three independent assertions, each of which would have to be defeated
separately:

1. **The directory constructs no client and calls no RPC** — the same scan
   shape as `2I-TRUST-008`.
2. **An action has no invocable field.** Not *the palette declines to call a
   handler* but *an action has no handler to call*: the test walks every built
   action and asserts no property is a `function`. This is the strongest form,
   because it survives a refactor that adds a call site.
3. **The query cannot invent an action.** For `""`, a normal word, `'; drop
   table tasks; --`, `<script>` and `../../etc/passwd`, every filtered result is
   asserted to be a member of the pre-built list. **User text selects; it never
   constructs.**

Plus: no handler-map indexing (`commands[x]()`), no `eval`/`new Function`, no
`dangerouslySetInnerHTML`.

## Accessibility

Combobox semantics with `aria-activedescendant`, so arrow keys move the active
option **without** moving DOM focus off the input — otherwise typing stops
working mid-list. `aria-selected` marks the active option for assistive
technology rather than only tinting it. The result count is announced politely
so it updates as the user types without stealing focus. `Escape` closes and
**returns focus to whatever opened the palette**, captured at open rather than
assumed to be the trigger.

Nine behavioural assertions cover exactly these.

## Two defects, both in this slice's own test fixture

1. **The accent test failed for the wrong reason.** `labelsFor()` omitted the
   `memories` label, and `buildPaletteActions` skips a capability with no label
   — so `memorias` found nothing because the action was never built, not
   because normalisation was broken. The fixture now carries an **accented**
   label, which also makes the assertion meaningful rather than incidental.
2. **The shell tests could not construct the palette.** Adding it to the top bar
   made `useRouter` reachable from `app-shell.test.tsx`, whose `next/navigation`
   mock did not export one. Eight tests failed on a missing mock rather than on
   behaviour. Mock extended, with a comment saying why it exists.

One lint finding was also real: resetting the active index from a `useEffect`
on `query` renders once with a stale highlight before correcting — which
`aria-activedescendant` would announce. Moved into the change handler.

## Verification

lint clean · typecheck clean · build passes · palette behaviour **20/20** ·
palette guard **12/12** · shell suite **87/87** · full suite **4364/4364** ·
**zero migrations**.
