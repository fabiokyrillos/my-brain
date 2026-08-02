# Signup rollout gate — definition

Status: **Definition (skeleton).** This is the authority for what must be proven before public
self-service signup opens. It is fail-closed by construction: **a gate with no recorded artifact,
or a configuration that cannot be read back, is a FAILED gate — never a skipped one.** Opening
signup is the output of one green run of the verification script (SH-ROLLOUT-002), an owner flip,
and a second green run against the open state (SH-ROLLOUT-005). There is no manual-confidence path.

The machine-checkable gates are executed by `scripts/verify-signup-rollout.mjs` (built in SH.7);
this document and that script enumerate the **same** gate set, and a parity test (SH-ROLLOUT-004)
fails if they diverge. Human-judgment gates are labeled `[owner-signature]` and are honestly not
mechanized — they are not disguised as automated checks.

`ADR-068`'s rule governs the whole document: **BYOK is not a mitigation for open signup, and no
control here may be cited as satisfying another.** Each gate stands on its own executed evidence.

---

## How to read a gate

Each gate states: **the property**, **the proof** (the exact readback, artifact, or probe), and
**the failure rule** (what makes it red). The verification script implements the proof; a red gate
prints the gate id and no secret.

---

## Tier 1 — BYOK remains closed and green (inherited, re-proven)

| Gate | Property | Proof | Failure rule |
| --- | --- | --- | --- |
| **RG-BYOK-1** | BYOK closed, all guards green | latest `main` merge-SHA CI green on all three jobs; `npm run byok:verify-runtime` prints `IN PARITY` | any job red, or not `IN PARITY`, or no CI run recorded for the SHA |
| **RG-BYOK-2** | No project-key fallback anywhere | the project-key guard passes; `OPENAI_API_KEY` absent from deployed Edge Function secrets (readback) | the name present in deployed secrets, or the guard red |

## Tier 2 — Account lifecycle proven

| Gate | Property | Proof | Failure rule |
| --- | --- | --- | --- |
| **RG-DEL-1** | Account deletion exists and leaves zero residue | SH-DELETE-011 verifier exits 0 against a real disposable deletion, storage prefix included; transcript recorded | verifier non-zero, or no transcript, or storage prefix non-empty |
| **RG-DEL-2** | The cascade drill is green in CI | SH-DELETE-001 pgtap green on the merge SHA | drill red or absent |
| **RG-DEL-3** | Storage orphans are zero or manifested | SH-STORAGE-001 scanner exits 0, or a recorded manifest accounts for every orphan | non-zero orphan count with no manifest |
| **RG-DEL-4** | The six 2026-07-16 orphans are resolved | SH-DELETE-015 manifest recorded and the owner-authorized deletion transcript present | manifest or deletion transcript absent |
| **RG-SUS-1** | Suspension and reactivation exist and are boundary-only | SH-ADMIN grant probes green; SH-SUSPEND cycle transcript recorded | any client role can suspend, or no cycle transcript |
| **RG-SUS-2** | Worker suspension enforcement executed | SH-WORKER-004/005 deployed transcripts (queued job skipped across ticks; heartbeat skip) | transcript absent |

## Tier 3 — Legal and consent

| Gate | Property | Proof | Failure rule |
| --- | --- | --- | --- |
| **RG-LEG-1** | Terms and Privacy present, versioned, both locales | routes render; version constants resolve; content pins pass | a document missing, or a version constant unresolved |
| **RG-LEG-2** | Consent enforced server-side and versioned | SH-LEGAL-007/008/009 tests green; a fixture version bump re-interposes | consent bypassable, or no re-interposition |
| **RG-LEG-3** | Retention copy matches retained data | SH-LEGAL-014 policy-text pin green | policy text and residue verifier's enumerated set diverge |
| **RG-LEG-4** | `[owner-signature]` professional legal review | recorded owner attestation; SH-LEGAL-013 banner removed | banner still present, or no attestation |

## Tier 4 — Signup abuse controls active

| Gate | Property | Proof | Failure rule |
| --- | --- | --- | --- |
| **RG-SIG-1** | Email confirmation active | hosted `mailer_autoconfirm: false` readback; behavioral proof a fresh account cannot sign in before confirming | autoconfirm true, or the behavioral probe passes sign-in pre-confirm |
| **RG-SIG-2** | CAPTCHA active and provider-enforced | hosted `security.captcha` readback; a raw missing-token signup call fails (SH-CAPTCHA-002) | missing-token call succeeds |
| **RG-SIG-3** | Signup + recovery throttling active | SH-THROTTLE concurrency tests green; ceilings ≤ provider limits (readback) | a ceiling exceeds the provider limit, or the concurrency test admits two |
| **RG-SIG-4** | Redirect configuration verified | hosted `site_url` + `additional_redirect_urls` readback contain only the app origin(s); no wildcard, no localhost | a wildcard or foreign origin present |
| **RG-SIG-5** | Origin not header-derived | SH-SIGNUP-003 test green (no `Origin` header read in link construction) | the header read still present |
| **RG-SIG-6** | Password policy enforced hosted-side | hosted minimum ≥ 12 readback | hosted minimum below 12 |
| **RG-SIG-7** | Enumeration-uniform responses | SH-SIGNUP-011 tests green; measured timing residual recorded | responses distinguishable by class |

## Tier 5 — Infrastructure quotas active

| Gate | Property | Proof | Failure rule |
| --- | --- | --- | --- |
| **RG-QUO-1** | Per-user quotas enforced | SH-QUOTA pgtap green (entries, jobs, concurrency, storage, attachments) | any quota test red |
| **RG-QUO-2** | Edge request bound | SH-QUOTA-008 deno green | absent |
| **RG-QUO-3** | Retention sweeps active with recorded dry-runs | SH-RETENTION tests green; each sweep's dry-run transcript recorded before its first live run | a sweep live without a recorded dry-run |

## Tier 6 — Exposure reviews recorded

| Gate | Property | Proof | Failure rule |
| --- | --- | --- | --- |
| **RG-EXP-1** | PostgREST exposure review complete | SH-EXPOSURE-002 grant matrix green; SH-EXPOSURE-007 re-census matches declared delta | matrix red, or delta unexplained |
| **RG-EXP-2** | Edge Function auth review recorded | `process-jobs` and `heartbeat` disposition recorded (SH-EXPOSURE-005) with readback | disposition absent |
| **RG-EXP-3** | service_role does not hold credential-table DML | SH-EXPOSURE-001 probe green against the deployment | grant present |
| **RG-EXP-4** | Proxy does not fail open in production mode | SH-EXPOSURE-006 test green | fail-open still reachable in production build |

## Tier 7 — Deployment posture (Phase 2H prerequisites, gated here)

| Gate | Property | Proof | Failure rule |
| --- | --- | --- | --- |
| **RG-DEP-1** | Production SMTP ready | `[owner-signature]` custom SMTP configured; a test send delivered | default mailer still in use, or no delivery proof |
| **RG-DEP-2** | Production domain and CSP | `[owner-signature]` domain live; CSP without `unsafe-eval` served (readback) | loopback URLs, or CSP absent |
| **RG-DEP-3** | Backup/restore verified | SH-ROLLOUT-006 restore-to-disposable transcript within the rollout window | no transcript, or restore failed |
| **RG-DEP-4** | `[owner-signature]` Monitoring and incident handling adequate | owner attestation against a stated minimum (error visibility, signup-rate alerting, a named incident contact) | no attestation |

## Tier 8 — The synthetic proof

| Gate | Property | Proof | Failure rule |
| --- | --- | --- | --- |
| **RG-E2E-1** | Production smoke green | the remote smoke suite exits 0 against the deployment | any smoke red |
| **RG-E2E-2** | Synthetic signup→delete leaves zero residue | SH-ROLLOUT-003 journey transcript: signup → confirm → accept terms → capture with BYOK key → process → delete → zero residue including storage | any step fails, or residue non-zero, or no transcript |

---

## The flip (SH-ROLLOUT-005) — post-initiative, owner-only

1. `scripts/verify-signup-rollout.mjs` green in one run (every machine-checkable gate above), and
   every `[owner-signature]` gate attested.
2. The owner flips `disable_signup` to `false` (and enables the app-level signup gate,
   SH-SIGNUP-001).
3. The same script re-runs green against the **open** state — CAPTCHA enforcement and the throttle
   ceilings are now observable live (RG-SIG-2/3 re-proven against real signups), and RG-E2E-2 runs
   through the open path.
4. Both transcripts are recorded.

A red gate at any point stops the flip. There is no step that reads "the owner is confident."

---

## Generation note

This document is regenerated by the traceability generator (SH-OPERATIONS-001) from the PRD's
SH-ROLLOUT / rollout register and the gate script's gate list, so the three cannot drift. The
skeleton above is the SH.0 seed; SH.7 produces the final generated form and the parity test that
binds it to `scripts/verify-signup-rollout.mjs`.
