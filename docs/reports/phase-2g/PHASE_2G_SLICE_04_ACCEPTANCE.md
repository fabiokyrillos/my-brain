# Phase 2G Slice 2G.4 — Convergence and closeout — acceptance record

Slice of [`PHASE_2G_IMPLEMENTATION_PLAN.md`](../../initiatives/phase-2g/PHASE_2G_IMPLEMENTATION_PLAN.md);
requirements from [`PHASE_2G_PRD.md`](../../initiatives/phase-2g/PHASE_2G_PRD.md) §3.5.
**Zero migrations.** The phase's budget was spent by 2G.3 and was not exceeded.

## 1. What this slice delivers

- **2G-CLOSE-001 — the fail-closed traceability generator.**
  `scripts/generate-phase-2g-traceability.mjs` writes
  `PHASE_2G_TRACEABILITY_MATRIX.md` and **refuses to write it** when any
  declared requirement is neither cited by an acceptance record nor declared
  undelivered with a destination. Delivery is evidenced by *citation* — a real
  artifact resolved on disk — rather than by a status column somebody typed.
  The migration budget is read from the chain, so a second `phase_2g`
  migration is a finding even if everything else passes.
- **2G-CLOSE-002 — documentation reconciliation.** `STATE.md`, `TODO.md`,
  `CHANGELOG.md`, `SECURITY.md`, `DECISIONS.md` (ADR-083, ADR-084) and the
  handoff (§37–§42) carry the phase. Every partial is labelled partial and
  every deferral names a destination.
- **2G-CLOSE-004 — per-slice acceptance and adversarial review.** Each of
  2G.1, 2G.2, 2G.3 has an acceptance record with its own adversarial review in
  this directory, and each merged with exact merge-SHA CI green on all three
  jobs: `ad0b56c`, `e63e103`, `e2c3718` (+ deployment record `4dcced9`).

## 2. The generator found three real gaps, and one flaw in itself

Run against the repository before anything was adjusted, it refused — which is
the behaviour, not a defect:

| Finding | Disposition |
| --- | --- |
| `2G-ROUTE-005` cited by no acceptance record | **Real gap in the record, not in the product.** The undo affordance shipped in 2G.2 and that report described it in prose without naming the id. The id was added to the evidence table, which makes existing evidence traceable rather than inventing any. |
| `2G-CLOSE-001` / `2G-CLOSE-004` uncited | Delivered by this slice; this record cites them. |
| `2G-ROUTE-008` / `2G-CLOSE-003` "declared undelivered but cited as evidence" | **A flaw in the generator's own first design.** It counted *any* markdown file in the directory as delivery evidence, so a blocker report naming the requirement it reports as blocked, and a threat model naming the ones its mitigations serve, both read as delivery. A document saying "this did not happen" satisfying the requirement it describes is the exact inversion a traceability matrix exists to prevent. The evidence set is now `*_ACCEPTANCE.md` and `*_DEPLOYMENT.md` — documents whose purpose is to record delivery. |

## 3. The convergence audit — the phase-wide invariants, verified here

The `2G-SAFETY` family is not any one slice's, which is why it is checked at
convergence against the merged result rather than claimed by each slice in
turn.

| Requirement | Verified against the merged repository |
| --- | --- |
| **2G-SAFETY-001** — no new privileged boundary | `direct-write-guard.test.ts` unchanged with the `tasks` allowlist still empty; the phase added zero RPCs and zero grants; its one migration creates, drops and grants nothing (`PHASE_2G_MIGRATION_078_DEPLOYMENT.md` §1) |
| **2G-SAFETY-002** — every provider call goes through the BYOK gate | `startTaskCommand` gates before the operation key is minted and before any preference read; the create and capture routes both branch *after* it. The capture route additionally inherits `capture_entry_async`'s `awaiting_ai_configuration` path, so a gateless owner stores an entry and spends nothing |
| **2G-SAFETY-003** — provider failure and product refusal stay distinct | Pinned in `actions.test.ts`: a `TaskCommandProviderError` returns its own declared code with `unsupportedReason: null`, so it cannot be read as a refusal — and the composer's fallthrough keys on the refusal value, never on translated prose |
| **2G-SAFETY-004** — content-minimized telemetry | The phase added **no** event property carrying content. Its one migration widens two closed enums by one member each; `contracts.test.ts`'s content-free assertions are unchanged and green |
| **2G-SAFETY-005** — user content is never an instruction | The create classification originates only in the owner's live composer turn; the capture route calls no provider at all, so retrieved content cannot reach a routing decision. The command prompt's fencing assertions are unchanged |

## 4. What is NOT delivered, named rather than counted

Two requirements, both blocked by the same measured cause and both declared in
the generator with a destination:

- **2G-ROUTE-008** — the authenticated journeys are **written and not
  executed**.
- **2G-CLOSE-003** — the non-destructive hosted verification of those journeys
  could not run.

The cause is not a product defect:
[`PHASE_2G_ONLINE_JOURNEY_BLOCKER.md`](./PHASE_2G_ONLINE_JOURNEY_BLOCKER.md)
records that hosted CAPTCHA blocks **all 28** authenticated online specs — a
control working as designed, against a harness that has not caught up — and
that a disposable BYOK product credential is not provisioned. Three approaches
were tried and three hypotheses eliminated; the session helper is in the tree
with its guard's negative control passing and its positive case honestly
`test.fixme`.

## 4. The funnel measurement (ADR-055)

**Zero qualifying commands.** The composer's create verb and capture routing
reached `main` on 2026-08-05/06 and the hosted journeys cannot run, so no
command has been issued against the deployment through either new path.

Stated plainly because ADR-055's expiry is **2026-10-27** and the study's R9
named this exact risk: *the phase produces capability but not evidence.* That
is where the phase lands. The instruments are built and the paths are live;
what is missing is use, and no engineering here can manufacture it. If the
gate expires with the funnel empty, the honest reading is that nobody typed a
command — not that semantic retrieval was measured and found wanting.

## 5. Gates

| Gate | Result |
| --- | --- |
| `npm run lint` / `npm run typecheck` | zero errors |
| Full unit suite | **4076 / 4076**, with only the 3 known Windows-only shebang parse failures. Recorded rather than smoothed over: one run in this slice reported a single failing test that did not reproduce on the next two runs and whose name the reporter did not surface. `TODO.md` already carries two timing-sensitive component files (`task-candidate-form.test.tsx`, `question-answer-form.test.tsx`) with the same history. Not fixed here, because a fix without a reproduction is a guess |
| `npm run docs:phase-2g:traceability` | generates, and refuses when seeded with any of the defects above |
| Closeout test | both directions — the real repository is clean, and fixtures carrying one deliberate defect each are caught |
| Migration budget | 1 of 1 spent, read from the chain |
| Authenticated journeys | **NOT EXECUTED** — §3 |

## 6. What this slice does not do

No product code, no migration, no hosted change. It does not fix the online
journey blocker, which is phase-independent repository maintenance recorded in
`TODO.md` and affects every initiative that plans a hosted lane. Phase 2H
remains unauthorised.
