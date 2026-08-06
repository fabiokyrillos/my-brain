# Phase 2G — Conversational Creation — final report

**Status: COMPLETE, with two requirements not delivered and named.**
Authorized by ADR-083 on 2026-08-05; closed on 2026-08-06.

| | |
| --- | --- |
| Requirements | **29 declared · 27 delivered · 2 not delivered with a destination** |
| Migrations | **1 of 1 budgeted, spent and deployed** (`202608060078`) |
| Hosted parity | `202608060078`, read back row for row |
| Slices | 2G.1 `ad0b56c` · 2G.2 `e63e103` · 2G.3 `e2c3718` (+ deployment `4dcced9`) · 2G.4 `3d35b84`, `a87d543` |
| CI | every merge SHA green on all three jobs |
| Accounting | [`PHASE_2G_TRACEABILITY_MATRIX.md`](./PHASE_2G_TRACEABILITY_MATRIX.md), generated and fail-closed |

## 1. What the phase set out to do, and what it actually was

**"The unified composer can create, not only mutate — through the creation
contract that already exists, with no second path to `public.tasks`."**

The phase kept the promise it made about its own size. The definition study
said the create verb is *an addressability fix, not a new capability*: the
deployed creation family could already create a task, but only if the owner
phrased the request as a mutation that then failed to match. Saying
*"adicione uma tarefa…"* was refused. That is what changed.

The invariant it leaves behind, guarded mechanically:

> Every task the composer creates goes through `create_task_command`. There is
> no second creation path, and the direct-write allowlist for `public.tasks`
> stays empty.

`direct-write-guard.test.ts` is unchanged and green. The phase added **zero**
RPCs and **zero** grants.

## 2. What shipped

- **2G.1 — the create-intent contract.** `outcome: "create"` joins `proposal`
  and `unsupported` in the wire contract, with the object shape unchanged so
  the model gains no new field to misuse. `TASK_COMMAND_POLICY_VERSION` moved
  to `2026-08-05.1` with **all four policy-lock digests unmoved** — the proof
  that no mutation policy changed — and the fingerprint-invalidation
  consequence was exercised rather than argued.
- **2G.2 — creation from the composer.** Preview → server-minted single-use
  confirmation → `create_task_command` → registered undo. A qualified creation
  re-enters `deriveTaskCommand`, so one validator owns temporal resolution,
  vocabulary and bounds. Refusals name what the composer *can* create, in both
  locales.
- **2G.3 — capture routing.** The composer files an entry from an explicit
  imperative, reusing `captureEntry` **whole** — lifecycle gate, SH.6 quotas,
  idempotency key, `awaiting_ai_configuration` and the worker nudge all
  inherited. A sentence naming both a note and a task **asks** instead of
  choosing.
- **2G.4 — convergence and closeout.** The fail-closed traceability generator,
  the convergence audit of the phase-wide `2G-SAFETY` invariants, the funnel
  measurement, and this report.

## 3. What is NOT delivered

**`2G-ROUTE-008`** (authenticated journeys) and **`2G-CLOSE-003`**
(non-destructive hosted verification). The journeys are **written and not
executed**, for two reasons, neither a product defect:

1. Hosted CAPTCHA refuses automated sign-in, which blocks **all 28**
   authenticated online specs — a control working as designed against a
   harness that has not caught up.
2. No disposable BYOK product credential is provisioned, and every
   conversational turn is a provider call.

Evidence, with three approaches tried and three hypotheses eliminated:
[`PHASE_2G_ONLINE_JOURNEY_BLOCKER.md`](./PHASE_2G_ONLINE_JOURNEY_BLOCKER.md).

## 4. The funnel is empty, and that is the phase's honest result

**Zero qualifying commands.** The new paths reached `main` on 2026-08-05/06
and the hosted journeys cannot run, so nothing has exercised them against the
deployment.

ADR-055's semantic-retrieval gate expires on **2026-10-27**. The study's R9
named this exact outcome — *the phase produces capability but not evidence* —
and that is where it landed. The instruments are built and the paths are live;
what is missing is use, which no engineering here can manufacture. **If the
gate expires with the funnel empty, the honest reading is that nobody typed a
command, not that semantic retrieval was measured and found wanting.**

## 5. Four defects found, and what each teaches

Kept because the causes generalise, in this repository's habit.

1. **A producer with no consumer is invisible on both sides (ADR-084).** SH.6
   shipped `failureKind: 'quota'` and the value was in neither governing
   vocabulary, so `parseProductEventPayload` rejected the payload *before the
   RPC*, at a call site wrapping its emission in `.catch(() => {})`. **Every
   quota refusal recorded no telemetry at all** while the code read as though
   it recorded one — the ceilings SH.6 proved under genuine concurrency had
   invisible refusals from the day they deployed. Each layer was internally
   consistent; only reading them *against each other* found it. **The lost
   events do not backfill.**
2. **A test-harness fallback can make a whole assertion vacuous.** The
   regression test written for that defect was itself passing by not running:
   `contracts.test.ts` loads its module through
   `vi.importActual(...).catch(() => ({}))`, so `parse?.(…)` was `undefined`
   and every refusal assertion silently held. The fallback is right for a
   census case and wrong for a behavioural one.
3. **A probe whose controls agree with its positives has measured nothing.**
   Three probe shapes against the deployed validator returned identically for
   every case, controls included — wrong parameter names, a `service_role`
   caller stopped by the EXECUTE grant before the function body, and a
   password sign-in hosted CAPTCHA refuses by design. Publishing either of the
   first two as a pass would have repeated the false verdict SH.5 already paid
   for once.
4. **A document saying "this did not happen" must not satisfy the requirement
   it describes.** The traceability generator's own first cut counted any
   markdown file as delivery evidence, so the blocker report naming
   `2G-ROUTE-008` marked it delivered. Its second cut over-corrected and made
   the honest sentence unwritable in the document whose job is to say it.

## 6. Guards that fired correctly, and were retargeted rather than weakened

- **A13, the phase-start guard** — retargeted from Phase 2G to Phase 2H in the
  same commit as ADR-083, because an accepted ADR naming the phase is itself a
  start signal. The invariant never lapsed.
- **The `product-ux` prose guard** — `STATE.md` may say Phase 2G started only
  while naming ADR-083 beside the claim.
- **The `SECURITY.md` parity guard** — caught the chain head moving without
  the documentation following.
- **The Signup Hardening traceability generator** — pinned the chain *head* to
  its own, correct only while SH was the last initiative to spend a migration.
  It now asserts its head is *present in the chain*, and its negative control
  was rewritten to remove that head from a **non-empty** chain, because the
  check tolerates a repository with no migrations at all and deleting the only
  file proved nothing.
- **The stale-deployment-claim guard** — caught a sentence that associated
  "NOT APPLIED" with the wrong migration version.

## 7. Deliberate non-goals, unchanged

Reminder creation by any conversational route (it would reopen the Option C
posture Phase 2F bounded); projects, people, organizations, contexts and
events as creation surfaces (no command contract exists); the per-user USD
spend ceiling (withdrawn by the study's §22 — under BYOK the owner is not the
payer and SH.6 owns the infrastructure quotas); `audit_logs.operation_id`;
new Projects/People fields; semantic retrieval; AI provenance
`2E-COMMAND-012` (ADR-057's reopening gate remains unexecuted); and any second
write path to `public.tasks`.

Phase 2H's deferrals are re-raised by name and unmoved: distributed rate
limiting, error sink, cron dead-man's switch, retention triggers, deploy
runbook and backup/restore.

## 8. Nothing destructive moved

Public signup remains disabled at both layers. The retention sweeps remain
unscheduled (ADR-082) and **no purge has been authorized or executed**. SMTP
is unconfigured. The rollout gate's semantics are untouched, and the owner's
rollout tasks — retention activation, Resend SMTP, the backup-restore drill,
the legal and monitoring signatures, then the two-green-runs signup flip —
remain open and recorded in `TODO.md`.

**Phase 2H remains unauthorised.**

## 9. Repository maintenance this phase surfaced but did not own

**The authenticated online journey suite cannot run** — all 28 specs, every
initiative that plans a hosted lane inherits it, and it is neither a Phase 2G
defect nor a product defect. Disabling hosted CAPTCHA is **not** the fix. The
session helper (`e2e/support/online-session.ts`) is in the tree with three
hypotheses eliminated and its guard's positive case honestly `test.fixme`.
