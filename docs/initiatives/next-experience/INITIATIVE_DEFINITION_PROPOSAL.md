# Proposed initiative definition — for owner decision

**Date:** 2026-08-07 · **Status: PROPOSAL. Not authorized.**

> **This document creates no ADR and authorizes no implementation.** It stops
> exactly at the point where an authorization decision would be made, which is
> the owner's. Planning was authorized; implementation was not.

Reads on top of `CURRENT_EXPERIENCE_AUDIT.md`, `UX_PRD_REVIEW.md` and
`UX_GAPS_AND_OPPORTUNITIES.md`.

---

## 1. Should this be called Phase 2I?

**Recommendation: yes — but only for the first, bounded portion, and not for
the PRD as a whole.**

### Why "Phase 2I" is the right label for something here

- **A13, the phase-start guard, is already retargeted to Phase 2I** (ADR-085).
  The mechanism is armed and waiting for exactly this.
- **ADR-068 names no Phase 2I**, and records that the real successor gate is the
  fail-closed signup rollout checklist rather than A13. So the label is free and
  its use is a deliberate act.
- Every phase since 2C has had a PRD, a plan, a threat model, a migration budget
  and a traceability contract. This work needs all five.

### Why the label must not cover the whole PRD

The PRD is a **14–20 month roadmap for a team that does not exist** (F-7). No
phase in this repository has ever been larger than six slices, and the largest —
Phase 2H, 44 requirements — took one day of concentrated execution because it
was **bounded and its requirements were closed**.

Labelling a seven-etapa roadmap "Phase 2I" would produce a phase that cannot
close, and a phase that cannot close cannot be traced, budgeted or gated. It
would break the one mechanism that has made every phase since 2C verifiable.

### The recommendation

> **Phase 2I = the PRD's Etapa 0 + Etapa 1, re-sequenced.**
> The rest stays a roadmap under `docs/initiatives/`, and each later etapa
> becomes its own phase when the one before it closes.

This is exactly how Phases 2C→2H already worked: one governing pair per phase,
one migration budget per phase, one closing report, then the next authorization.

**Proposed name: "Phase 2I — Foundation and Findability."** It says what the
phase delivers and it does not promise the whole PRD.

---

## 2. Objective

> **Make the product's existing capability findable and its surfaces coherent on
> mobile first — without weakening any invariant established through Phase 2H.**

Deliberately *not* "redesign the product". Etapa 0 + Etapa 1 is a **foundation
and retrieval** phase: after it, a user can reach anything from anywhere, every
later slice consumes one visual language instead of inventing one, and the
asynchronous states the architecture already produces have one home.

---

## 3. Requirement families (proposed)

Sized against the phase-per-family shape used since 2C.

| Family | Covers | ~Reqs |
| --- | --- | --- |
| `2I-LANG` | Semantic colour, the user-text / interpretation / suggestion / confirmed-action distinction, typography, spacing, density. Meaning never carried by colour alone. | 5–6 |
| `2I-TRUST` | Suggestion, confirmation and source cards; chips; timeline; the desktop panel / mobile full-screen pair; undo feedback. | 6–7 |
| `2I-STATE` | Empty, loading, **interpreting**, recoverable error, terminal error, offline. Focus return and context preservation. **F-4's asynchronous-capture contract lives here.** | 6–7 |
| `2I-NAV` | Hoje / Registros / Trabalho / Conversar / Biblioteca, the `Mais` grouping rendered, old routes preserved, desktop↔mobile state parity. | 5–6 |
| `2I-FIND` | Command palette (keyboard + touch) and global lexical search across the seven types, with filters and empty/reformulation states. | 6–8 |
| `2I-CLOSE` | Fail-closed traceability, accessibility acceptance, both-locale acceptance, closing report. | 4–5 |

**Total ≈ 32–39.** Comparable to Phase 2H's 44 and Phase 2G's 29.

---

## 4. Candidate slices

| Slice | Content | Migrations | Why here |
| --- | --- | :-: | --- |
| **2I.0** | Pre-code gates: baseline CI green; **decide the search implementation** (§5); confirm the calendar's schema question for the *next* phase; census the 34 files carrying locale ternaries. | 0 | Phase 2H's 2H.0 pattern. The search decision must precede 2I.4, not surface inside it. |
| **2I.1** | `2I-LANG` — visual language and semantic states. | 0 | Nothing else can be consistent before this. |
| **2I.2** | `2I-TRUST` — the shared component vocabulary. | 0 | Consumed by every later slice and every later phase. |
| **2I.3** | `2I-STATE` — universal states **including the interpreting/failed contract**. | 0 | F-4. Architecture, not polish. |
| **2I.4** | `2I-FIND` — palette + global search. **Promoted ahead of navigation** (F-2). | **0 or 1** | The highest-leverage slice, and the one that generates ADR-055's missing evidence. |
| **2I.5** | `2I-NAV` — the five destinations and Biblioteca, rendering the grouping that already exists in `capabilities.ts`. | 0 | Cheapest structural win; smaller than the PRD assumes (F-1). |
| **2I.6** | `2I-CLOSE` — convergence, traceability, accessibility and locale acceptance, closing report. | 0 | |

**The re-sequencing versus the PRD** — search (1.3/1.4) before navigation
(1.1/1.2) — is finding F-2 and is the one substantive change proposed to the
owner's ordering. Everything else preserves the PRD's sequence.

---

## 5. Migration budget recommendation

> **Recommended budget: ONE, allocated to slice 2I.4 only, non-transferable.**

Every other slice is UI, copy and projection over existing tables — **zero**.

The one exists solely for the possibility that global search needs Postgres
full-text indexes (`tsvector` + GIN). Two properties make this the right shape:

- **It is decided in 2I.0, before any code.** If `ILIKE` is sufficient at
  current volumes, the migration is **not spent**, and the phase closes 1
  allocated · 0 spent. That is a legitimate outcome, not a shortfall.
- **Retrofitting FTS later touches every searchable table again.** Budgeting one
  now is cheaper than discovering it in 2I.4 and stopping for an amendment.

**Non-transferable, per the standing rule.** A second migration is an owner
amendment. This matters more than usual here: `2I-STATE` and `2I-TRUST` will
*feel* like they want a preferences column, and they do not — `agent_preferences`
already declares the relevant keys as `future`.

---

## 6. Threat and security impact

**Assessment: this phase's surface is unusually small**, which is a reason to do
it first.

| Area | Impact |
| --- | --- |
| **RLS** | **None.** No new cross-user read. Search is owner-scoped like every existing query. |
| **Grants** | **None**, unless 2I.4 adds indexes — which change no privilege. |
| **Write paths** | **None.** This phase adds no new mutation. Cards in 2I.2 are components; their *use* is a later phase. |
| **AI** | **None.** No new model call. Semantic search is explicitly out (§8). |
| **Secrets** | **None.** |
| **Deletion / lifecycle** | **None.** |
| **Rate limiting** | **None** — no new provider-reaching work. |
| **Untrusted content** | **Real but bounded.** Search results render user content in a new place; the existing rule holds — content is data, never instructions, and never markup. |
| **New threat, named** | **T-2I-01 — search as an enumeration oracle.** A cross-entity search is the first surface that queries seven tables from one input. It must be owner-scoped **in the query**, never filtered after the fact, and a zero-result must be indistinguishable from a not-owned result. This is the one thing in the phase that deserves a pgTAP test. |
| **New threat, named** | **T-2I-02 — the palette as an action surface.** If the palette can *start* an action (§1.3 says "iniciar captura, conversa e tarefa"), it must route through the same authorized path, not a shortcut. One write path. |

**Both are design constraints rather than discoveries**, and both are cheap if
stated before the slice rather than after.

---

## 7. Acceptance strategy

Reuses the machinery that already exists; invents nothing.

1. **Fail-closed traceability generator** over every `2I-*` id, in the shape of
   `generate-phase-2h-traceability.mjs` — **refuses rather than print an
   unresolved claim.** Mutation-proved against fixtures.
2. **Playwright, desktop + mobile, both locales.** §12 makes both-locale copy a
   completion requirement, so the locale dimension is not optional. Mobile is
   `Pixel 7` + `iPhone SE 375`, as product-ux used.
3. **Accessibility as a gate, not a pass** (§4.10): keyboard reachability, focus
   return after every action, visible focus, touch targets, reduced motion, and
   **meaning never carried by colour alone** — which `2I-LANG` can assert
   statically.
4. **A locale-ternary guard that ratchets.** `locale-ternary-guard.test.ts`
   already exists. Pin the count at the phase's start and require it to
   **decrease**, so the 266 retire incrementally and cannot grow (F-10).
5. **A visual-language guard.** Semantic tokens declared once and asserted as
   the only source of state colour — the `copy.ts`/parity-test pattern applied
   to design tokens.
6. **T-2I-01 proved in pgTAP**, with a second account as the control. An
   owner-scoping test with one user in the database proves nothing.
7. **Evidence screenshots** at four viewports, as `ux-evidence/` already does.
8. **`npm run rollout:verify` re-read at close** and recorded — every phase since
   SH has done this, and a UX phase must not be the one that stops.

---

## 8. Explicitly out of scope

Out of scope for **Phase 2I**, not rejected — most are later phases.

| Out | Why |
| --- | --- |
| **Voice capture and transcription** | F-3. Largest unknown, five contracts, and **blocked on Q1** (audio retention). Deserves its own phase with its own budget. |
| **Semantic search** | ADR-055's evidence standard is unmet and 2I.4's lexical search is what would generate the evidence. Shipping semantic first inverts the argument, and §10.3 warns against it independently. |
| **Calendar** | Possibly zero migrations (§5 of the gaps document) and genuinely valuable — but it is a *destination*, and destinations come after findability. |
| **Memory conflicts** | The initiative's clearest real migration. Wants its own budget and threat model. |
| **Daily planner, contextual suggestions** | Both imply proactive spending of the user's money. Blocked on F-6's product decision. |
| **Bulk actions** | A write-path slice wearing a list-UI costume (§4 of the gaps document). |
| **Relationship graph** | §14 already calls it secondary. Last. |
| **Onboarding** | Depends on Q7. Also, §9 of the PRD says it should close only after the Etapa 1–3 journey exists. |
| **Data export** | Real gap (F-8), but it is a privacy/legal surface, not a findability one. Route to the rollout track. |
| **Push notifications** | External dependency; the notification *levels* are a later phase anyway. |
| **Dark mode** | §0.1 already says: only if it can be delivered complete, otherwise out. **Recommend out** — it doubles the visual QA surface of every later slice. |
| **Opening public signup** | **Not coupled to this work in any way.** The rollout gate is fail-closed and separate. |

---

## 9. Open questions the owner must answer before planning proceeds

| # | Question | Blocks |
| --- | --- | --- |
| **Q7** | **Does this initiative assume public signup opens?** | The meaning of every §7.1 activation metric. Today they would be measured over three hand-created accounts. **Answer this first.** |
| **Q1** | **Is the original audio kept or discarded?** | The voice phase entirely. Recommendation: **discard by default** — it removes a retention class, a quota interaction and a privacy surface without removing a single step of §2.5's flow. |
| Q-name | Accept **"Phase 2I — Foundation and Findability"** for Etapa 0+1, leaving the rest a roadmap? | The label and the scope. |
| Q-order | Accept promoting search ahead of Biblioteca (F-2)? | Slice order. |
| Q-budget | Accept **ONE** migration, allocated to 2I.4, possibly unspent? | The budget. |
| Q-dark | Dark mode in or out? | Recommendation: **out**. |
| Q-est | Re-label §10's absolute calendar totals as relative sizing (F-7)? | How the PRD is read six months from now. |

---

## 10. What happens next, and what does not

**If the owner accepts this shape**, the next step is the standard governing
pair — `PHASE_2I_PRD.md` and `PHASE_2I_IMPLEMENTATION_PLAN.md` under
`docs/initiatives/phase-2i/`, plus a threat model and a traceability contract
under `docs/reports/phase-2i/` — **and an ADR authorizing planning**, in the
shape of ADR-083 and ADR-085. This directory would then be superseded by that
pair and retained as the study that produced it.

**Nothing above is that ADR.** No implementation is authorized, no phase has
started, A13 remains green, and the funnel remains empty.
