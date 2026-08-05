# BYOK.5 — Owner cutover: acceptance record, and the boundary it stops at

**Branch:** `codex/byok-slice-5` · **Base:** `main` at `81b1110` · **Migrations: 0.**

**Status: INCOMPLETE BY DESIGN.** Every task that can be performed from a
repository is done. Three of the five gates require actions no agent may take —
changing deployed platform secrets, and entering a credential through an
authenticated product surface. This record says which is which, and states the
exact owner action for each.

---

## 1. What this slice could do, and did

### The allowlist is closed, classified, and pinned at three

`BYOK-GUARD-006`. The list was already three entries after BYOK.4 deleted the
worker's. What BYOK.5 adds is the part that makes it *stay* three:

- an explicit **classification per entry**, compared against the list in **both
  directions**, so an entry without a classification and a classification without
  an entry fail identically — they are the same defect, somebody editing one list
  and not the other;
- an assertion that **no script is an exception**, measured;
- a proof that **every exception is unreachable from a deployed user bundle**,
  by its own mechanism rather than by its file extension;
- a scan asserting **no deployed module in either runtime** reads the project key
  or any `API_KEY`-shaped environment name.

### A correction to the implementation plan, recorded rather than absorbed

Plan task 5.3 names three classified exceptions: *local development
configuration, mocked or opt-in tests, and `scripts/remote-*.mjs`*.

**The third is empty in fact.** No script under `scripts/` references
`OPENAI_API_KEY` at all — `remote-supabase-smoke.mjs` contains the literal
`"openai"` only as a provider *name* inside a preferences payload, and
`byok-crypto-interop.mjs` touches no provider key. The allowlist has three
entries and the plan describes three exceptions, and **the count agreeing hides
that the composition does not**:

| Plan's exception | Repository truth |
| --- | --- |
| local development configuration | `.env.example` — present |
| mocked or opt-in tests | `project-key-guard.test.ts`, `guards.test.ts` — present, two of them |
| `scripts/remote-*.mjs` | **empty** — no script needs it |

The scripts are not an exception that was removed; they were never one. The guard
now asserts this in both directions, so a future edit that "restores" a scripts
entry to match the plan's prose fails rather than widening the surface to match a
sentence.

### No account is privileged, proven as an absence

Gate E3 asks whether removing the owner's credential blocks the owner's AI
exactly as it would any user's. That is normally shown by configuring the owner
and watching them fail — which needs a deployment and a credential entry.

The **stronger** property is structural and checkable here: *there is no code
that could privilege anybody*. The resolution chain — `gate.ts`, `adapter.ts`,
`src/lib/ai/index.ts`, `_shared/byok-adapter.ts` — is asserted to contain no
identity comparison, no identity read from configuration, and no hardcoded uuid.
A future "just let the owner through while we debug" fails on it.

This does **not** discharge E3, and is not claimed to. It removes the mechanism
by which E3 could fail; the journey still has to be run.

### `.env.example` says what is true about `OPENAI_API_KEY`

The line stays — it is a classified exception — but it now carries the fact that
**nothing that ships reads it**, and why that matters. The failure this whole
initiative guards against is not somebody deciding to re-add a fallback; it is
somebody needing a key at 3am, finding this line, and wiring it into "one path
that just needs to work". A name with no explanation invites exactly that.

---

## 2. Acceptance gates

| Gate | Status | Evidence, or what is missing |
| --- | --- | --- |
| **E1** — every AI capability works for the owner on the owner's own credential | **BLOCKED** | Requires the owner to enter a credential through Settings. No agent may do this. |
| **E2** — `OPENAI_API_KEY` absent from the deployed function's secrets, verified against the deployment | **BLOCKED** | Requires platform access to Supabase Edge Function secrets and the application runtime environment. |
| **E3** — removing the owner's credential blocks the owner's AI exactly as any user's | **BLOCKED**, mechanism removed | Needs E1 first. The *absence of a privileging mechanism* is proven and asserted; the journey is not run. |
| **E4** — the allowlist contains exactly three entries, compared in both directions | **EXECUTED** | `project-key-guard.test.ts`, `BYOK-GUARD-006` block: exact-set equality against the classification map, length pinned at 3, plus the empty-scripts assertion and the bundle-reachability proof. |
| **E5** — the full remote suite exits 0 | **NOT RUN, deliberately** | Its purpose is to confirm task 5.4 — that the remote scripts still work **after** the cutover. Running it before E1 and E2 would prove nothing about the state it exists to check, and it writes to a real linked project. Deferred to after the owner actions, not skipped. |

---

## 3. The stop, and the exact owner actions

This is a **true stop condition** under the loop's own rules: privileged actions
that cannot be derived from the approved architecture, on platforms an agent
cannot reach, plus a credential entry through an authenticated product surface.

Everything coherent is committed and pushed. Nothing is half-applied: no
migration, no partially converted credential path, no incomplete security
surface.

### Owner action 1 — provision the three BYOK secrets for the target environment

Required **before** any deployment, and required in **both runtimes**. Values
must be distinct per environment and distinct from each other and from local and
test (Amendment A-1.2, `ADR-070`).

Generate three values, one at a time, and do not paste them into a chat, a
document, or a persistent shell history:

```
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Set them in the **Supabase Edge Function secret store** for the target project:

```
npx supabase secrets set --project-ref <REF> BYOK_MASTER_KEY=<value>
npx supabase secrets set --project-ref <REF> BYOK_FINGERPRINT_PEPPER=<value>
npx supabase secrets set --project-ref <REF> BYOK_RATE_LIMIT_PEPPER=<value>
```

And the **same three values** in the hosting platform's environment for the
Next.js runtime. `BYOK_MASTER_KEY` is the decryption-critical one: the worker
refuses to serve without it, by design, rather than degrading.

### Owner action 2 — apply the BYOK migrations to the target environment

Five migrations, `202608010065` through `202608010069`, none of which has reached
a shared environment. **Do this only after action 1**: a worker that boots
without `BYOK_MASTER_KEY` refuses every request.

```
npx supabase db push --linked
npx supabase migration list --linked
```

### Owner action 3 — deploy the worker, then remove the project key

Order matters. The new worker must be live *before* the secret it no longer reads
is removed, so there is no window in which a deployed old worker has neither.

```
npx supabase functions deploy process-jobs --project-ref <REF>
npx supabase secrets unset --project-ref <REF> OPENAI_API_KEY
npx supabase secrets list --project-ref <REF>
```

Then remove `OPENAI_API_KEY` from the hosting platform's environment for the
Next.js runtime. **Gate E2 is the read-back**: the name must be absent from the
listing, verified against the deployment rather than against the repository.

### Owner action 4 — configure the owner's own credential through Settings

Sign in as the owner, open `/pt-BR/app/settings` or `/en/app/settings`, and paste
an OpenAI key into the *Your OpenAI key* panel. It is validated with one minimal
call before it is stored.

**Do not seed this from `OPENAI_API_KEY`.** Not by script, not by migration, not
as a convenience — the whole point of BYOK.5 is that the owner is not privileged
in the credential-resolution contract, and a seeded credential would make the
owner the one account that never proved the flow.

### What resumes automatically once those four are done

Gates E1, E2, E3 and E5, plus the BYOK.3 and BYOK.4 items deferred on the same
blocker: the asynchronous matrix cases against the deployed function, the
deployed-bundle comparison, concurrent rotation, and the desktop/Pixel 7 Settings
journeys.

---

## 4. Verification of what is here

| Command | Result |
| --- | --- |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | 0 errors |
| `npx vitest run src/lib/byok/` | 149 passed, 0 failed |

Full-suite and build results are in the PR. The two known Windows-only
`sql-reachability` assertions continue to fail locally and pass in Linux CI; they
are reported as failures, not folded into a green claim.

---

## 5. One open question this slice raises and does not answer

After owner action 3, `OPENAI_API_KEY` is read by **nothing** — not the
application, not the worker, not a script, not a test. At that point the line in
`.env.example` is a name with no consumer, and this repository removes
consumer-less contracts rather than keeping them (the reasoning that removed
`retryProcessingJob` and next-intl).

It is **not** removed here, for two reasons. It would make `.env.example`
disagree with a deployed reality that still has the secret until action 3
completes; and `guards.test.ts` currently asserts its presence as the control
that keeps `BYOK_VALIDATION_OPENAI_API_KEY` distinct from it, so removing one
without deciding about the other would weaken a live guard.

Recorded as a decision for BYOK.6's convergence audit, whose job is exactly this:
*one adapter per runtime, one crypto module per runtime, one resolver per path*
— and, by the same standard, no environment name without a reader.

---

## Appendix — deployed reconciliation, 2026-08-02

Append-only. Nothing above is edited. Full evidence: `docs/reports/byok/BYOK_DEPLOYED_ACCEPTANCE.md`.

All four owner actions were performed. Three landed. The fourth exposed a fifth condition
that was never an action, because nothing existed to check it.

| Gate | Status | Evidence |
| --- | --- | --- |
| **E1** — every AI capability works for the owner on the owner's own credential | **EXECUTED, FAILED** | The owner's asynchronous path reached the deployed worker and terminated `credential_unreadable`. The credential row is `active`, `key_version` 1, with a fingerprint and a `validated_at` — and its ciphertext opens under no available key. The synchronous half could not be run at all: no Node runtime available to the implementer holds the deployed master key. |
| **E2** — `OPENAI_API_KEY` absent from the deployed function's secrets | **EXECUTED, PASSED** | Read back from `supabase secrets list` against the deployment: twelve names, and the project key is not among them. Also absent from the deployed bundle's executable code — the only textual occurrence is a doc comment describing the read BYOK.4 deleted. |
| **E3** — removing the owner's credential blocks their AI exactly as any user's | **NOT EXECUTED — deliberately refused** | Removal would be easy; restoration would not. Re-adding through the only available Settings runtime would seal a new credential under the **local** master key, which the deployed worker also cannot read — leaving the owner equally broken, with a real OpenAI key spent to get there. That is damage to live production state, so it was not attempted. The equivalent property was proven on a disposable account instead: removal blocked queued work, and reconfiguring made the same job claimable again. |
| **E4** — the allowlist is closed and classified | **EXECUTED, and since amended** | `ADR-072` removes `.env.example` — the census found no runtime consumer left anywhere — and adds the runtime-parity verifier and its test under a new `operator-verification-script` classification. Four entries, still compared in both directions. Every remaining entry now names the key **in order to assert its absence**, a stricter composition than before even though the count rose. |
| **E5** — the full remote suite exits 0 | **STILL NOT RUN** | Its purpose is to confirm the remote scripts still work *after* a successful cutover. The cutover is not successful. Running it now would test a state nobody intends to keep. |

**What the failure proved anyway.** Under the pre-BYOK architecture the owner's job would
have **succeeded** on the project key. It failed closed instead: no provider call, no
`ai_usage_events` row, a declared code and nothing else. So this slice's central claim —
that no deployed account receives a project-key fallback — was demonstrated
**behaviourally** rather than only statically, and the owner was subject to exactly the
rule a disposable account is subject to. That is what E3 exists to show, and what the
absence of an identity branch predicted.

**The fifth condition, now checkable.** The two runtimes of one environment must hold the
same three BYOK secrets, byte for byte. Nothing verified that, and nothing inside the
product could: `BYOK-CRYPTO-005` forbids a decryption failure from naming its cause, so
the mismatch is structurally invisible from within. `npm run byok:verify-runtime`
(`ADR-072`) is the outside check, and it reproduces the defect in one command without
printing a value or a digest. The owner remedy is `BYOK_DEPLOYED_ACCEPTANCE.md` §8.
