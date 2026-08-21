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
| [`initiatives/phase-2h/`](./initiatives/phase-2h/) | `PHASE_2H_PRD.md`, `PHASE_2H_IMPLEMENTATION_PLAN.md` — Deploy and Operate, authorized by ADR-085. **Complete 2026-08-07.** |
| [`initiatives/post-2h-rollout/`](./initiatives/post-2h-rollout/) | `POST_2H_ROLLOUT_READINESS.md` — the governing artifact for the bounded post-2H rollout track. **Not a phase.** |
| [`initiatives/next-experience/`](./initiatives/next-experience/) | The neutral-named planning study that reviewed the owner's mobile-first PRD and proposed Phase 2I. **Superseded by `initiatives/phase-2i/`; retained as the study that produced it.** |
| [`initiatives/phase-2i/`](./initiatives/phase-2i/) | `PHASE_2I_PRD.md`, `PHASE_2I_IMPLEMENTATION_PLAN.md` — Foundation and Findability, authorized by ADR-092 (2026-08-07). Scope was the parent mobile-first PRD's Etapa 0 + Etapa 1. **Complete 2026-08-07.** |
| [`initiatives/phase-2j/`](./initiatives/phase-2j/) | `PHASE_2J_PRD.md`, `PHASE_2J_IMPLEMENTATION_PLAN.md` — Today, Capture and Attention, authorized for planning by ADR-094 and for implementation by ADR-095 (2026-08-08). Scope was the parent mobile-first PRD's Etapa 2. **Complete 2026-08-08.** |
| [`initiatives/phase-2k/`](./initiatives/phase-2k/) | `PHASE_2K_PRD.md`, `PHASE_2K_IMPLEMENTATION_PLAN.md` — Conversar as the primary interface, authorized for planning by ADR-097 (2026-08-08) and for implementation through closeout by ADR-101 (2026-08-09). Scope was the parent mobile-first PRD's Etapa 3. **Concluded 2026-08-09**, after an extraordinary post-phase correction charged to no phase. |
| [`initiatives/phase-2l/`](./initiatives/phase-2l/) | `PHASE_2L_PRD.md`, `PHASE_2L_IMPLEMENTATION_PLAN.md` — Work and execution, authorized for planning by ADR-102 and for **implementation through closeout by ADR-103** (both 2026-08-09), which also signed all five owner decisions. Scope is the parent mobile-first PRD's Etapa 4, slices 4.1–4.3. **Complete 2026-08-09**, closeout corrected the same day. |
| [`initiatives/phase-2m/`](./initiatives/phase-2m/) | `PHASE_2M_PRD.md`, `PHASE_2M_IMPLEMENTATION_PLAN.md` — Calendar, daily planning and notifications, authorized for planning by ADR-104 (2026-08-09) and for **implementation through closeout by ADR-105** (2026-08-11), which signed all seven owner decisions. Scope is the parent mobile-first PRD's Etapa 4, slices 4.4–4.7. Migration budget **2 allocated · 0 spent, non-transferable**; push is authorized **opt-in and content-free**; real-device proof is owner-run and **blocks closeout**. |
| [`initiatives/phase-2n/`](./initiatives/phase-2n/) | `PHASE_2N_PRD.md`, `PHASE_2N_IMPLEMENTATION_PLAN.md` — People, projects, memory and files, authorized for planning by ADR-108 and for implementation by ADR-112. **Complete**, 127 of 127 classified. |
| [`initiatives/phase-2o/`](./initiatives/phase-2o/) | `PHASE_2O_PRD.md`, `PHASE_2O_IMPLEMENTATION_PLAN.md` — Activation, preferences and control, authorized for planning by ADR-115, decisions signed by ADR-116/117, implementation by ADR-118. **Complete**, 116 of 116 classified, zero migrations. |
| [`initiatives/phase-2p/`](./initiatives/phase-2p/) | `PHASE_2P_PRD.md`, `PHASE_2P_IMPLEMENTATION_PLAN.md` — Trustworthy capture and everyday UX, authorized for planning by ADR-121 and for implementation by ADR-122, with a second migration by ADR-123. **CLOSED 2026-08-20 by ADR-125**: 87 of 87 classified — 66 built, 12 baseline, 5 not-built-by-rule, 4 partial, 0 undelivered. VoiceOver is **waived, not passed**, and `2P-REVIEW-CITATIONS` is **not delivered**. |
| [`initiatives/phase-2q/`](./initiatives/phase-2q/) | `PHASE_2Q_PRD.md`, `PHASE_2Q_IMPLEMENTATION_PLAN.md` — Evidence: the record behind the claim. **PLANNING AUTHORIZED ONLY**, by ADR-126 (2026-08-21), which supersedes ADR-125 Decision 6 alone; **all eight owner decisions SIGNED by ADR-127** the same day, which authorizes no implementation either. **42 requirements, six families, six slices, none implemented and none classified.** `OD-2Q-5` was signed as **option C against the recommendation** — the sources area identifies and links, shows no content preview and carries no reveal control. Migration budget **1 allocated · 0 spent**; a second is a stop condition. |

*(The rows for phases 2N, 2O and 2P were missing from this table until
2026-08-21 and are added here with the Phase 2Q row, because this index is one
of the two places the repository has already recorded drifting behind the ADRs.)*

**The roadmap successor has no governing artifact and must not acquire one
without owner authorization.** Phase 2Q now has one — ADR-126 — and the guard
has moved past it, so "the successor" below means the phase **after** 2Q. The
A13 guard in
`src/lib/closeout/phase-2f-documentation.test.ts` fails the build the moment a
successor `*_PRD.md` or `*_IMPLEMENTATION_PLAN.md` appears anywhere under
`docs/`, or any file declares a successor requirement, or an accepted ADR names
the successor in its heading, or a migration or source file is named for its
implementation.

**The retarget precedent, now applied eleven times.** Phase 2G was started the
sanctioned way — ADR-083 and the guard's retarget in one commit — then Phase 2H
by ADR-085, Phase 2I by ADR-092, Phase 2J by ADR-094, Phase 2K by ADR-097,
Phase 2L by ADR-102, Phase 2M by ADR-104, Phase 2N by ADR-108, Phase 2O by
ADR-115, Phase 2P by ADR-121, and Phase 2Q by **ADR-126** (2026-08-21), each
moving the guard to the next
unauthorized lettered phase in the same change that recorded the authorization.
*(This sentence said "eight times" and stopped listing at ADR-104 until
2026-08-21; the count and the list are corrected here rather than left to be
noticed, which is the same failure mode the paragraph below describes.)*
The invariant is never unenforced in between, and **no ADR names the successor's
scope**: inventing one would be the error the guard exists to prevent — which is
why ADR-104's heading says *"retargets to the roadmap successor"* rather than
naming it, and why a test asserts that property across the **whole series**
instead of leaving it to memory. Each retarget **adds** a series entry rather
than replacing one, so a future retarget cannot quietly drop an earlier check.

Note the shape of those ADR headings — *"retargets to the roadmap successor"*,
never *"retargets to Phase 2X"*. That is deliberate and it is enforced: the
detector treats an accepted ADR **naming the next phase in its heading** as a
start signal, so an authorizing ADR that named its successor would fail the very
guard it was moving. ADR-092 hit exactly that during authoring and was reworded.

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
