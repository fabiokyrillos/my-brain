# Phase 2N slice 2N.7 — re-audit against `main` after 2N.6, **NOT STARTED**

Written **before any code**, and this document starts nothing. It measures the
tree slice 2N.6 left behind against what `2N-METRICS-001…007`, `2N-SEC-001…006`,
`2N-ACCESS-006`, `2N-MOBILE-004`, `2N-TIME-005…006` and `2N-CLOSE-001…006`
require, so whoever implements 2N.7 begins from facts rather than from the plan's
expectations.

**Zero requirements are claimed here. Zero files were created for the slice.**

## 0. Baseline

| Fact | Value |
| --- | --- |
| Slice 2N.6 | **complete and merged**, zero migrations spent |
| Migrations | **94 local = 94 hosted**, parity **`202608140094`** |
| Budget | `3 allocated · 2 spent (M1, M3)` · **M2 available to this slice and to no other** · a fourth is a **STOP CONDITION** |
| Slice 2N.7 | **not started** |
| Slices remaining | **2N.7 only** |

## 1. M2 is the phase's last allocation, and it may close unspent

`OD-2N-15` **A** and `2N-METRICS-002` make M2 **conditional**: it lands
*"only if real producers and consumers are specified and delivered"*. If they are
not, **M2 closes unspent and the dependent requirements close
`not-built-by-rule`** — and the plan says in terms that *"an unspent allocation
is not a defect; a migration created to use one up fails the close."*

So the slice's opening question is not *what shall we measure* but **which
product questions have a real reader**, and the answer decides whether a
migration exists at all.

## 2. What the telemetry vocabulary actually looks like now

### 2.1 The surface CHECK has no Phase 2N surface, and that is why M2 exists

The live surface vocabulary admits `home`, `capture`, `inbox`, `needs_attention`,
`interpretation_review`, `technical_details`, `work`, `questions`, `server`,
`task_command`, `conversation`, `calendar`.

**There is no `person`, `project`, `memory`, `library`, `relation` or `graph`
surface, and no event about inspecting, correcting or removing knowledge.** Any
2N telemetry therefore costs a migration, and `2N-METRICS-002` requires the
event-name CHECK, `private.validate_product_event_properties` and the surface
CHECK to move **in a single change, before any producer exists**.

### 2.2 A trap this repository has paid for is already closed — do not re-import it

Handoff §-era notes record that `private.record_product_event` carried **its own
copy** of the event-name allowlist, frozen at `202607280061`, so it silently
refused events the CHECK already admitted. **That is fixed.**
`202608090089_post_2k_product_event_surface_deduplication.sql:143` re-declares
the writer with the list **deliberately deleted** — the table's own constraint is
the single authority now, and the function reports a constraint violation instead
of holding a stale opinion.

So 2N.7 inherits **three** copies to move together (`2N-METRICS-006`), not four:
the event-name CHECK, the property validator and the surface CHECK. The
TypeScript vocabulary in `src/features/product-analytics/contracts.ts` is the
fourth *reader* of the same facts and is asserted against them by existing
parity tests rather than being a fifth authority.

**This is a correction to carry forward, not a discovery to re-make**: a slice
that re-audited from the old note would budget for a writer change M2 does not
need.

## 3. What 2N.7 inherits from the six slices before it

Each is a **named remainder with a destination**, and none of them is started.

| Item | From | Shape |
| --- | --- | --- |
| **`2N-RELATION-TRIGGER`** | 2N.6 | `link_interpreted_entities` still persists co-mention associations — `OD-2N-8`'s refused option C, T-3 still live. Closing it is **a migration, an owner decision and a STOP CONDITION**, and it is **NOT transferable into M2** |
| **`2N-PRIVACY-FREETEXT`** | 2N.6 | Should ADR-110 Decision 4's masking posture extend to `person_projects.role`? An owner question; 2N.6 converged the three surfaces on the existing posture and decided nothing |
| **`2N-RELATION-END-ANNOUNCEMENT`** | 2N.6 | A successful *end* is announced through an `sr-only` region **inside the row being removed**, so `revalidatePath` unmounts it in the same commit. The §69 shape, one component over. Belongs with this slice's `2N-ACCESS` work |
| **`2N-FILES-WRITER`** | 2N.5 | `entity_attachments` has a reader and no writer. Creating one needs `INSERT` restored or a new definer RPC: **new authority, an owner decision, a stop condition**, **not transferable into M2** |
| **`2N-MOBILE`** | 2N.3 → 2N.6 | `online-memories.spec.ts:85`, a **21px** touch target against 44px, cause `.list-row-main a` carrying no sizing rule on any list surface. Reproduced unchanged in every slice since |
| **`needs_attention_viewed.itemCount`** | 2N.4 | Still counts entry rows only, so a conflict row is invisible to it. Redefining what an existing 2J metric measures **is telemetry work**, which is why its destination is this slice |
| **Real screen-reader run** | every slice | `2N-ACCESS-006` says no conformance may be claimed without one and **none has been executed**. Under `OD-2N-16` A its absence **does not block closeout**; it stays an open residual with a destination, beside `2L-ACCESS-008` |

## 4. What is NOT yet measured, and must be before the slice starts

This document establishes the load-bearing facts. It has **not** measured:

- **which product questions have a real consumer today.** `2N-METRICS-005`
  refuses an event with no reader, and this repository has shipped a producer
  with no consumer twice. The candidate consumers are the cost/transparency
  surfaces and the operator CLI; whether either would actually read a 2N event is
  a read nobody has done.
- **whether `2N-METRICS-003`'s nine-part declaration can be satisfied for any 2N
  event** — product question, producer, consumer, surface, closed properties,
  justification, forbidden-content test, planned hosted proof, and a cleanup and
  zero-residue proof. An event missing any one **is not declared**, and it is
  entirely possible that the honest answer for this phase is *none of them*.
- **how `2N-METRICS-007`'s residue proof will be owner-scoped.** `product_events`
  is **unreadable to `service_role`** — no `SELECT`, no `DELETE` — so a global
  count cannot prove anything and the probe must be built differently from every
  other one in this phase.
- **whether every threat in `PHASE_2N_THREAT_MODEL.md` is mitigated, accepted or
  refused** (`2N-SEC-001`). **T-3 is known to be still live** (§3), so this is at
  minimum an *accepted-with-a-named-remainder* rather than a mitigation, and
  saying so is part of the close rather than an embarrassment to be avoided.
- **the final requirement classification over all 127 ids**, which
  `2N-CLOSE-001` requires generated from the source rather than transcribed.

Each is a read, not a build, and each belongs to the slice's own opening step.

## 5. Stop conditions, restated against what was measured

- **A fourth migration** (`R-21d`). M2 is the only allocation left and is
  **exclusive to telemetry**; neither `2N-RELATION-TRIGGER` nor
  `2N-FILES-WRITER` may be funded from it.
- **A migration created to use M2 up.** If no event survives
  `2N-METRICS-003`/`-005`, M2 closes **unspent** and that is a correct outcome.
- **Any new authority** — a grant, an RPC, a policy or a writer — not already
  planned.
- **A hardware dependency.** `OD-2N-16` A holds: mobile is proved in viewports,
  and the absence of a screen-reader run does not block closeout.
- **Starting, planning or retargeting the successor phase.** `2N-CLOSE-006`
  requires it re-audited and **not started**, and **A13 still guards it**.

**Nothing in `2N-METRICS`, `2N-SEC`, `2N-ACCESS-006`, `2N-MOBILE-004`,
`2N-TIME-005…006` or `2N-CLOSE` is claimed, built, or partially built. Slice
2N.7 remains NOT STARTED.**
