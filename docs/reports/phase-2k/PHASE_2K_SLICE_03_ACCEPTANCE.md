# Phase 2K — Slice 2K.3 acceptance

**Continuity by server re-derivation: a pending action survives looking at its own evidence.**

**Written after execution, from executed evidence.** Every gate is reported as executed, skipped or **NOT PROVED** — never inferred.

**Authorization.** ADR-101. **Governing contract:** ADR-100 — *returning always re-derives with a new `issuedAt` and always requires a fresh confirmation.*

**Baseline.** `main` = `799191c56e64c538f8e12e6ef58f0694b4ef1dc1` (PR #148, slice 2K.2), **CI green on that exact merge SHA across all three jobs**. Hosted parity unchanged at `202608080087`.

**Migration budget.** **`1 allocated · 0 spent`.** Continuity is re-derived, never stored — OD-2K-D forbids persisting a pending confirmation, and this slice creates no persistence of any kind.

---

## 1. Requirements this slice claims

| Id | Claim | Evidence |
|---|---|---|
| `2K-CONT-001` | **built** | Each message is an `<article id={messageAnchorId(message.id)}>`. The anchor is **derived**, never inlined, so the thread's anchor and a handle's anchor cannot drift; the guard asserts both halves |
| `2K-CONT-002` | **built** | A citation link carries `?from=<handle>`; the destination renders `ReturnToConversation`, which re-parses it and links back with `?resume=`. Wired on the two routes a citation can reach — `/app/inbox/{id}` and `/app/memories/{id}` |
| `2K-CONT-003` | **built** | A strict Zod schema of **five** identifier fields. Twelve forbidden names are refused **by name**, each proved against a planted instance; `.strict()` additionally refuses a field nobody listed |
| `2K-CONT-004` | **built** | `ResumedCard` restores the visual reference and links to the anchor; the resumption carries the position even when the object is unreadable, because the position is the user's own |
| `2K-CONT-005` | **built** | `resumeConversationCard` mints `new Date().toISOString()` on the return. No clock crosses the navigation, and none can: the handle has no field for one. No stored preview is restored — `parseTaskCommandSession`, `deriveTaskCommand` and `buildTaskCommandPreview` are all absent from the resume path, asserted structurally |
| `2K-CONT-006` | **built** | `requiresFreshConfirmation` is the literal `true` **as a type**, so no branch can set it false and compile. Proved across all three return shapes at runtime. The surface **invents no difference**: the handle carries nothing that could reconstruct one, so the third branch is the only one this shape can express |
| `2K-CONT-007` | **built** | The resume path issues no `insert`, `update`, `upsert`, `delete` or `rpc` — asserted structurally **and** by a behavioural test that records every mutation the stub would have seen and expects `[]` |
| `2K-CONT-008` | **built** | Deleted, foreign and errored reads all resolve to `unavailableCard(type)`, which takes no cause parameter. Byte-identical output asserted by comparing serialized cards |
| `2K-CARD-008` | **built** (extended) | `mayRenderMutatingControl` now reads the card's own `mutability` field rather than re-deriving from the type — see §2 |

---

## 2. The design point this slice forced, and why the contract changed

A memory card **can** mutate: slice 2K.2 gave it a confirm and an archival undo. But a memory reached as a **reference** — cited by an answer, or shown on a resumed card — is something the conversation *pointed at*, not something it proposes to change.

So mutability is a property of the card's **role**, not of its type alone. `mayRenderMutatingControl` now reads the card's own `mutability` field, which is exactly the rule `2K-CARD-009` already states for reversibility: a card declares from its own value rather than inheriting a sibling's.

**The type-level guarantee is not weakened; it moved to the builder.** `readOnlyPreviewCard` always writes `read_only`, and `unavailableCard` is the only builder that derives mutability from the type — so **no builder can produce a mutable card for a type OD-2K-B keeps read-only**, and `contracts.test.ts` asserts that directly for all five. Every assertion merged in 2K.1 still holds unchanged.

---

## 3. What "re-derive" can honestly mean with an identifier-only payload

The handle carries no command, no patch and no clock. So the **earlier preview is not reconstructible** — by design, not by omission.

What *is* derivable from the authorized identifiers alone is the object's current state, read under RLS at a fresh clock. That is precisely `2K-CONT-006`'s third branch, and it is the **only** branch this shape can express: *the earlier preview no longer applies, here is what the object looks like now, and the action must be stated again.*

The alternative — a payload rich enough to describe the difference — is a payload rich enough to authorize the change. That is the trade T-2K-02 refuses, and R17 refuses its reintroduction under any name.

**The copy says this as normal, not as an error.** ADR-100 is explicit: an unchanged object re-asking is the honest outcome of a genuine recomputation, and presenting it as a fault would train the user to read correct behaviour as failure. The panel is toned `information`, never `risk`.

---

## 4. Two deviations from the plan's file list, with reasons

**The re-derivation entry point is `conversation-cards/resume.ts`, not `assistant/actions.ts`.** A `"use server"` export becomes a **client-callable endpoint**. The resume needs no client call — the user arrives by navigation with the handle in the URL — so giving it an endpoint would add reachable surface for nothing, on the one path whose entire subject is that returning cannot be used as an authorization. It is a `server-only` module the page calls during render.

**`task-commands/session.ts` was not modified, and `TASK_COMMAND_SESSION_VERSION` was not bumped.** The plan made both conditional (*"only if re-derivation across a navigation needs an explicitly declared entry point"*). It does not: the resume path never touches the task-command envelope. That is the stronger outcome — the envelope carries `issuedAt` and the staleness witness, so transporting it would transport the clock under a different name, which is exactly what R17 refuses. `session` and `expected` are therefore on the forbidden-fields list by name.

---

## 5. Gates, as executed

| Gate | Command | Result |
|---|---|---|
| Tests first | continuity + guard tests run before implementation | **Executed**, red for the right reasons |
| Focused | `npx vitest run src/features/conversation-cards src/lib/closeout` | **Executed, green** — 48 files, **695 tests** |
| Lint | `npm run lint` | **Executed, zero errors** |
| Types | `npm run typecheck` | **Executed, zero errors** |
| Full unit | `npm test` | **Executed** — 287 files passed, **4760 tests passed, 0 failing tests**. 3 files fail to *load* on Windows — the known local baseline, green in CI |
| Build | `npm run build` | **Executed, green** |
| Browser, both viewports | `npx playwright test e2e/accessibility.spec.ts --project=desktop --project=mobile` | **Executed** — 25 passed, 1 skipped. The new `Conversar resumed` surface passes axe at both viewports |
| Whitespace | `git diff --check` | **Executed, clean** |
| Migrations | none created | **`1 allocated · 0 spent`** |
| pgTAP | not applicable — no database change | **Declared, not skipped silently** |
| Real device / assistive technology | not run | **NOT PROVED** |
| Full round-trip journey in a browser | not executed here | **Deferred to 2K.8**, where the authenticated online lane runs |

---

## 6. Negative controls and non-vacuity

- **Each forbidden field is planted individually**, not one representative. ADR-100 asks for this by name, because the defect it corrected read correctly for one field and wrongly for another.
- **The strict schema is proved separately** from the forbidden list: a field nobody listed is refused too, so a name invented tomorrow is refused today.
- **The R17 prose detector is proved non-vacuous** against the exact sentence ADR-100 removed — *"must carry the original pinned `issuedAt` … or state plainly that a fresh confirmation is required"* — and is asserted to be absent from every 2K.3 file. This is R17's second half, the one a field-by-field guard cannot catch.
- **The mutating-control detector** distinguishes a *use* from a *quoted refusal*: `buildTaskCommandPreview(input)` fires, `["requestFingerprint"]` does not. Slice 2K.3 is what forced that precision — the module written to satisfy the guard was being flagged by it.
- **"Always requires a fresh confirmation" is proved across all three return shapes**, because "always" is the requirement and one case would only prove "sometimes".
- **"Writes nothing" is proved behaviourally**, by a stub that records every mutation it would have seen and an expectation of `[]` — not only by a source scan.
- **A malformed handle is proved to cost no round trip**: `supabase.from` is asserted never called.

---

## 7. Security and authority

- **The handle is incapable of authorizing, not merely hard to forge.** Signing it would make it *authentic*, not *harmless* (T-2K-02). Five identifiers, a strict schema, and every check run again on arrival.
- **`requireUser` is the whole authorization story**: it authenticates, enforces the account lifecycle, and returns a client whose every read is under forced RLS. Nothing in the handle is trusted.
- **Ownership is proved twice** — RLS plus an explicit `user_id` predicate on all three reads, asserted both structurally and behaviourally.
- **No service-role client, no mutation, no new RLS policy, grant, secret or write path.**
- **A suspended account is refused one layer earlier and more strongly** than an `unavailable` card: `requireUser` redirects it to `/account-state` before the resume module is reached, so it sees no product surface at all. Stated here rather than folded into the byte-identical claim, because reporting it as "identical unavailable" would describe a code path that does not run.

---

## 8. Limitations, stated rather than rounded up

1. **No screen-reader session.** Never executed for this surface.
2. **The full round trip is not browser-proved.** The lane covers the resumed panel's markup, semantics, targets and focus paint at both viewports; the authenticated answer → open source → return → re-confirm journey needs live credentials and runs in 2K.8.
3. **Hydrated interactivity is not browser-proved.** The focus move is proved in jsdom; the markup that makes it focusable is proved in a browser.
4. **Only entries and memories can be referenced.** `CONTINUITY_OBJECT_TYPES` is deliberately two, because chat retrieval reaches exactly those. A handle naming a person would describe a reference that cannot exist.
5. **The citation link still renders the legacy stored excerpt** as its label. Replacing that is 2K.4's work (`2K-PRIVACY-003/004`); this slice added the handle to the link without touching what the link says.

---

## 9. What this slice did not do

No migration, no persistence, no TTL, no schema change, no deployment. No pending confirmation stored. `TASK_COMMAND_SESSION_VERSION` untouched and the task-command envelope never transported. No change to retrieval, to `chat/actions.ts`, or to the confirmation contract. Signup remains closed; the rollout gate is untouched at 25 pass · 3 fail · 2 owner-signature.
