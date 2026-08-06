# Documentation — index and placement rule

`docs/` holds two different kinds of document, and telling them apart is the
whole taxonomy:

- **Living canon** — the contract, at the `docs/` root. Phase-independent, always
  current, and the thing to read first.
- **Governing artifacts** — one phase's or one initiative's PRD, plan, proposal
  or closing report, in `docs/initiatives/<name>/`. It says what that work was
  *supposed* to do.
- **Records** — what that work actually did, in `docs/reports/<name>/`, indexed
  by [`reports/README.md`](./reports/README.md).

The directory names in `initiatives/` and `reports/` are the same on purpose:
`initiatives/byok/` states BYOK's contract, `reports/byok/` holds its evidence.
Knowing one path tells you the other.

`src/lib/closeout/docs-taxonomy-guard.test.ts` and
`src/lib/closeout/reports-taxonomy-guard.test.ts` enforce this in the
`application` CI job.

---

## The living canon

Read in this order when picking up unfamiliar work.

| File | What it is |
| --- | --- |
| [`STATE.md`](./STATE.md) | **The source of truth for what is currently true** — active phase, what shipped, what is blocked. Never infer status from code alone. |
| [`TODO.md`](./TODO.md) | The active backlog, ordered by execution priority. |
| [`DECISIONS.md`](./DECISIONS.md) | Append-only ADR log. Add to it; never rewrite it. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Technical changelog, newest first. |
| [`ENGINEERING_STANDARDS.md`](./ENGINEERING_STANDARDS.md) | **The binding engineering contract.** Read before nontrivial work. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System architecture. |
| [`DATABASE.md`](./DATABASE.md) | Schema conventions, RLS and ownership rules. |
| [`AI_AGENT.md`](./AI_AGENT.md) | The AI extraction and chat contract. |
| [`SECURITY.md`](./SECURITY.md) | Security posture and open risks. |
| [`PRD.md`](./PRD.md) | Whole-product requirements and vision. |
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | Whole-product phase plan (Fases 1–N). |

Nothing else belongs at the `docs/` root. The list is closed, and the guard
fails the build on an addition to it.

---

## The placement rule

1. **Every new phase or initiative gets `docs/initiatives/<name>/`** — lowercase
   kebab-case — before its first governing artifact is committed, and
   `docs/reports/<name>/` before its first report. Same name in both.
2. **A PRD, implementation plan, proposal, or phase-closing report is a
   governing artifact.** It goes in `initiatives/`, never at the `docs/` root.
3. **Acceptance, evidence, deployment transcripts, adversarial reviews and
   traceability matrices are records.** They go in `reports/<name>/`. See
   [`reports/README.md`](./reports/README.md).
4. **Nothing new goes at the `docs/` root** unless it is genuinely
   whole-product and phase-independent — which, in practice, means it does not.
5. **Placement is guard-covered**, filesystem-only, with a failure message that
   names the path the file should have used. Nothing inside an initiative
   directory is constrained, so no historical tree is frozen.

---

## `initiatives/` — governing artifacts

| Directory | Contents |
| --- | --- |
| [`initiatives/sprint-1-5/`](./initiatives/sprint-1-5/) | `SPRINT_1_5_REPORT.md` — foundation hardening, closed 2026-07-17. |
| [`initiatives/phase-2/`](./initiatives/phase-2/) | `PHASE_2_PLAN.md`, `PHASE_2_ARCHITECTURE_REVIEW.md`, `PHASE_2B_REPORT.md` — the Phase 2 umbrella (2A/2B) the lettered phases descend from. |
| [`initiatives/phase-2x/`](./initiatives/phase-2x/) | PRD, implementation plan, closing report. |
| [`initiatives/phase-2c/`](./initiatives/phase-2c/) | PRD, implementation plan, closing report. |
| [`initiatives/phase-2d/`](./initiatives/phase-2d/) | PRD, implementation plan, closing report. |
| [`initiatives/phase-2e/`](./initiatives/phase-2e/) | `PHASE_2E_PRD.md`. The closing report is `reports/phase-2e/PHASE_2E_FINAL_REPORT.md`. |
| [`initiatives/phase-2f/`](./initiatives/phase-2f/) | `PHASE_2F_PRD.md`, `PHASE_2F_PROPOSAL.md`. The closing report is `reports/phase-2f/PHASE_2F_REPORT.md`. |
| [`initiatives/product-ux/`](./initiatives/product-ux/) | `MY_BRAIN_PRODUCT_AUDIT.md` → `MY_BRAIN_UX_ROADMAP.md` → `MY_BRAIN_DESIGN_SYSTEM_PLAN.md`, the audit-to-plan chain behind `reports/product-ux/`. |
| [`initiatives/entity-graph/`](./initiatives/entity-graph/) | PRD and implementation plan for Entity Graph Completion. |
| [`initiatives/byok/`](./initiatives/byok/) | PRD and implementation plan for bring-your-own-key. |
| [`initiatives/signup-hardening/`](./initiatives/signup-hardening/) | PRD and implementation plan for SH.0–SH.7. |
| [`initiatives/phase-2g/`](./initiatives/phase-2g/) | `PHASE_2G_PRD.md`, `PHASE_2G_IMPLEMENTATION_PLAN.md` — Conversational Creation, authorized by ADR-083 (2026-08-05). The definition study behind them is `reports/phase-2g/PHASE_2G_DEFINITION.md`. |

**Phase 2H has no governing artifact and must not acquire one without owner
authorization.** The A13 guard in
`src/lib/closeout/phase-2f-documentation.test.ts` fails the build the moment a
`PHASE_2H_PRD.md` or `PHASE_2H_IMPLEMENTATION_PLAN.md` appears anywhere under
`docs/`, or any file declares a `2H-…` requirement, or an accepted ADR names
Phase 2H in its heading. Phase 2G was started the sanctioned way — ADR-083 and
the guard's retarget landed in one commit — and that is the precedent a Phase 2H
start must follow.

---

## The other directories

| Directory | What it is |
| --- | --- |
| [`reports/`](./reports/) | The historical record, one directory per phase or initiative. Start at its [README](./reports/README.md). |
| [`reviews/`](./reviews/) | Standalone reviews owned by no single initiative — currently `ARCHITECTURE_REVIEW_2026_07.md`, the input to the pre-2E hardening pass. |
| `screenshots/` | Reference captures used by product documentation. |
| [`superpowers/`](./superpowers/) | `plans/` and `specs/` produced by the brainstorming and planning workflow, named by date. |

---

## Durable handoff state

`docs/reports/AUTONOMOUS_LOOP_HANDOFF.md` holds §1–§32; the repository-root
`AUTONOMOUS_LOOP_HANDOFF.md` continues from §33. **Read both** — they are one
log split across two paths, and §33 was written by a loop that did not find the
older file.
