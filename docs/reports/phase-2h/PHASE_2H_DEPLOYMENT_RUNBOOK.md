# Phase 2H — Deployment runbook

`2H-DEPLOY-001`, `2H-DEPLOY-003`, `2H-DEPLOY-004`, `2H-DEPLOY-006`.
Slice 2H.5. Written 2026-08-07.

**This runbook describes the system as observed across slices 2H.0–2H.4, not as
it was imagined.** Every command below has been executed against the live
project during this phase, and every hazard named is one that actually
happened here.

**Nothing in this document is a destructive production action.** The steps that
would be — enabling a retention schedule, running a purge, arming the deletion
reaper, opening signup, configuring SMTP, restoring a backup — are marked
**OWNER-ONLY** and carry the authorization each one needs. `2H-DEPLOY-006`
requires that separation to be visible rather than implied.

---

## 0. The two bars, and why conflating them let a defect survive

**A merge requires** the slice's PR-head CI green on all three jobs, the
acceptance record written and citing each requirement, and an explicit merge
authorization. **Green CI is not authorization.**

**A deployment additionally requires** all three jobs green on the **exact merge
SHA**, a re-read of hosted parity before and after, and `verify:edge-parity`
green for every function the slice touches.

These are different bars because a repository can be entirely green while the
deployed system is broken. That is not hypothetical: `delete-account` sat
undeployed for days while every test passed, because nothing in the repository
knew what was deployed. `verify:edge-parity` exists to close exactly that gap,
and step 4 makes it a **gate**, not a reminder.

---

## 1. Pre-flight — before anything is merged

| # | Action | Command | Refuse to continue if |
| --- | --- | --- | --- |
| 1.1 | Read hosted migration parity **before** | `npx supabase migration list --linked` | Local and Remote columns already disagree. Diagnose that first; a deploy on top of drift compounds it. |
| 1.2 | Read Edge Function parity **before** | `npm run verify:edge-parity` | Any function reads `STALE`. See §4. |
| 1.3 | Read the cron catalog **before** | `npm run ops:health` | Any job you did not expect. Record the count. |
| 1.4 | Read BYOK runtime parity | `npm run byok:verify-runtime` | The Node and Edge runtimes hold different master keys. **This is the highest-severity pre-flight in the repository** — a mismatch is silent at save time and terminal at execution time. |
| 1.5 | Read the rollout gate | `npm run rollout:verify` | Nothing. It is a read; record its exact output. |
| 1.6 | Read the destructive posture | `npm run ops:deletion-reaper-schedule`, `npm run ops:retention-schedule` | A sweep or the reaper is scheduled and you did not authorize it. |

**A pre-flight is worthless if you do not write down what it said.** Every slice
in this phase records these readings in its acceptance file, and the one time a
count was recorded without a reading (`due_now_count`) it was wrong for weeks.

### 1.7 The pgTAP pre-flight, when the change touches the database

`pgtap` is **not installed on the hosted project**, and extension creation is
transactional in Postgres. So the whole suite can be run against the real
project — real data, a real `cron.job` catalog — and rolled back:

```
begin;
create extension pgtap;
<the migration>
<the suite>
rollback;
```

This caught four defects before CI in 2H.4 and confirmed 31/31 for 2H.5's
retention suite before the branch was pushed. **Verify afterwards that nothing
persisted** (no new function, no seeded row, no `pgtap` extension) — the
rollback is the mechanism, and a mechanism you have not checked is a claim.

**The pre-flight harness itself had a defect first.** Splicing the migration in
with `String.replace` and a replacement *string* turns every `$$` into a literal
`$`, because `$$` is an escape there, and every dollar-quoted function body
becomes a syntax error. **Use a function replacer.** *Suspect the probe before
the product* — that is five times in this phase.

**And read the result correctly.** The Management API returns only the **last**
result set, so `select * from finish()` returning nothing looks identical
whether the run was clean or whether you simply cannot see the middle. Ask
pgTAP's own counters instead:

```sql
select _get('failed') as failed, _get('curr_test') as ran, _get('plan') as planned;
```

---

## 2. The application (Vercel)

### What is actually true

- **A merge to `main` auto-deploys Production.** No separate deploy command is
  run, and none should be.
- **A branch push creates a Preview deployment.** Previews point at the *same*
  Supabase project, so a preview of a branch whose migration is not yet applied
  will fail against the live schema in exactly the way §3 describes.
- **A docs-only merge also deploys the application.** This surprises people and
  it matters: a documentation PR triggers a full production build. That is
  harmless when the schema is unchanged and dangerous when it is not, which is
  why the ordering in §3 is written the way it is.
- The deployed origin is `https://my-brain-dusky.vercel.app`, and it must equal
  `APP_ORIGIN` and the Supabase project's `site_url`.

### Identifying the deployed commit

The application **exposes no commit identifier over HTTP.** The response carries
`server: Vercel` and an `x-vercel-id` request trace, neither of which names a
commit. The authoritative reading is the Vercel dashboard's Deployments list,
which shows the commit SHA and branch for the current Production deployment.

> **Residual, recorded rather than fixed here:** an HTTP-readable build
> identifier would let a script assert "the deployed application is the merge
> SHA" the way `verify:edge-parity` asserts it for functions. Adding one is an
> application change outside 2H.5's declared requirements. **Destination:**
> `docs/TODO.md`, deployment observability.

### Verifying a production deployment

1. The Vercel dashboard shows the Production deployment at the expected commit
   and state `Ready`.
2. `GET https://my-brain-dusky.vercel.app/pt-BR/auth/login` returns **200** and
   the page contains the Turnstile script origin
   `https://challenges.cloudflare.com`. A login page without the widget is a
   CAPTCHA regression, and SH.5 proved that path is fail-**closed** — the form
   cannot produce a token and hosted Auth refuses — so it is a availability
   failure, not a security one, but it is a failure.
3. The security headers survive: `x-frame-options: DENY`,
   `x-content-type-options: nosniff`, and the CSP.

### Rollback and promotion posture

Vercel keeps previous deployments and can **promote** an earlier one to
Production. That is a genuine, fast rollback for **application code**.

**It is not a rollback for the database, and the asymmetry is the whole hazard.**
Promoting yesterday's build does not un-apply today's migration. If the two are
coupled — and §3 explains when they are — a promotion returns code that expects
the *old* schema to a database that now has the *new* one. Whether that is safe
depends entirely on whether the migration was written to be backward compatible,
which is a property of the migration, not of the rollback button.

---

## 3. The database

### The operator action is explicit

```
npx supabase db push --linked
```

There is **no auto-apply**. A merged migration sits unapplied until a person
runs this, and the repository will be green the whole time. That gap is real and
it is where `202608060078`-style drift comes from.

### Parity, before and after

```
npx supabase migration list --linked      # before: Local == Remote
npx supabase db push --linked             # the operator action
npx supabase migration list --linked      # after: Local == Remote, at the new head
```

`AUTHORIZED_MIGRATION_HEAD` in `src/lib/closeout/egc-invariants.test.ts` tracks
the head the repository believes is authorized, and it **moves in the same
commit as the migration**. A head that moved without a migration, or a migration
without a head move, fails CI.

### Ordering — the hazard SH.1 recorded and 2H re-learned

**When the new code requires the new schema, the migration goes FIRST.**

The failure mode is specific. A merge to `main` starts a Vercel build
immediately. If the migration has not been applied when that build finishes
deploying, the new code runs against the old schema and every request through
the new path fails — and it fails on **production**, not on a preview. The
window is however long the build takes.

So the safe order for a schema-coupled change is:

1. Merge the PR (this starts the build).
2. **Immediately** run `npx supabase db push --linked`.
3. Read parity, confirm the new head.
4. Let the build finish, then verify §2.

**2H.5 is deliberately not schema-coupled, and that is a design choice rather
than luck.** Migration `202608070083` creates three sweeps, three twins and
three registry rows. **No TypeScript reads any of them** — the dry-run and
scheduling scripts are operator tooling run by hand, not application code. So
the application deployed by the merge is correct whether the migration has been
applied or not, and the ordering hazard does not apply to this slice. Record
that reasoning; do not assume it for the next one.

### Correction posture — append-only

**Migrations are append-only.** A migration applied to a shared environment is
never edited and never reverted as a normal rollback. A mistake is corrected by
a **new** migration that moves the schema forward to the intended state.

The reason is not ceremony. `supabase_migrations.schema_migrations` records that
a version was applied; editing that file makes the recorded history a fiction,
and the next `db reset` in CI applies something different from what production
holds. **Database rollback is not "revert the migration".** It is either a
forward correction or a restore from backup — and §6 of
`PHASE_2H_BACKUP_AND_RETENTION.md` records what restore actually costs here.

---

## 4. Edge Functions

### Deploy is explicit, per function, and never broad

```
npx supabase functions deploy process-jobs   --project-ref <ref>
npx supabase functions deploy delete-account --project-ref <ref>
```

**Deploy only the function the change touches.** `npx supabase functions deploy`
with no name deploys **every** function in `supabase/functions/`, which would
deploy `heartbeat` — a function that is **undeployed on purpose**
(`SH-EXPOSURE-005`: `pg_cron` calls `run_all_heartbeats()` inside the database,
so the HTTP wrapper was an internet-reachable service-role endpoint with no
caller). `src/lib/closeout/heartbeat-disposition.test.ts` guards the decision;
nothing guards your shell.

### `verify:edge-parity` is a hard gate

```
npm run verify:edge-parity
```

It compares each function's **deployed timestamp** to the **last commit
timestamp of its source**, and reports one of three states:

| State | Meaning | Response |
| --- | --- | --- |
| `ok` | deployed at or ahead of source | continue |
| `not deployed, by design` | `heartbeat` only, allowlisted with its reason | continue |
| **`STALE`** | **deployed behind its deployable source** | **stop** |

**A stale function is a FAILURE, not a warning.** This is the exact defect class
that stalled `delete-account`: the repository was green, the tests passed, and
the deployed function was months behind the source that the tests were testing.
The script exits non-zero on stale, so it can be a gate in a script rather than
a thing a person remembers.

Note the third state is deliberately **not** collapsed into `ok`. Flattening
them would let a function that silently stopped being deployed hide inside the
allowlist's shape.

### Version read-back

After deploying, read the version and `updated_at` back from the provider:

```
npx supabase functions list --project-ref <ref>
```

Record **old version → new version**. A deploy that reports success and leaves
the version unchanged has done nothing, and the only way to know is to have
written the old number down first.

### Rollback, stated honestly

**There is no Edge Function rollback.** The provider keeps versions but exposes
no promote-a-previous-version operation through the CLI. Rolling back means
checking out the previous source and deploying it forward as a new version. So:

- the "rollback" is a **deploy**, with the same gate and the same read-back;
- it takes as long as a deploy, which is fast, but it is not instant and it is
  not a button;
- if the previous source depended on a schema the migration has since changed,
  the same coupling hazard from §3 applies in reverse.

---

## 5. Cron

### Read the catalog before and after every change

```
npm run ops:health                       # classified, with liveness
```

or, for the raw catalog, the Management API:
`select jobname, schedule, active, command from cron.job order by jobname`.

**Five jobs are active today**, and each has an owner:

| Job | Schedule | Owner / authorization |
| --- | --- | --- |
| `my-brain-entry-dispatch` | `* * * * *` | 2X.5 — drains `interpret_entry` |
| `my-brain-job-reaper` | `* * * * *` | `202607170019` — recycles expired leases |
| `my-brain-hourly-heartbeat` | `0 * * * *` | Phase 2B — `run_all_heartbeats()` |
| `byok-prune-validation-attempts` | `17 4 * * *` | BYOK — **an authorized attempt prune** |
| `sh-prune-auth-event-attempts` | `43 4 * * *` | SH.5 — **an authorized attempt prune** |

### The distinction that must never be blurred

**The two attempt-prune jobs are authorized and running.** They delete
`credential_validation_attempts` and `auth_event_attempts` rows outside a 30-day
window — abuse evidence, bounded, and approved when those slices shipped.

**Nothing else that deletes is scheduled.** SH.6's five user-content sweeps
(`jobs`, `notifications`, `product_events`, `heartbeat_runs`,
`undo_operations`) are **built and unscheduled**. Phase 2H's three observability
sweeps (`error_events`, `scheduled_job_health`, `rate_limit_events`) are
**built and unscheduled**. No user-content purge has ever run.

Confusing "there are prune jobs scheduled" with "user-content retention is
enforced" would be the T-31 falsehood in operational form. They are different
sets of rows under different authorizations.

### No migration schedules destructive work — OWNER-ONLY to change

ADR-082 is binding: **scheduling IS authorization.** SH.6's migration scheduled
its own sweeps at apply time, which silently took the decision the gate existed
to hold open — the first live purge would have run at 04:11 UTC the next
morning, and the dry-run transcript meant to precede it would have described a
deletion that had already happened. The schedules were removed the same day.

Since then:

- a migration may **build** a sweep and must **never** schedule one;
- `202608070083` asserts this against `cron.job` **itself**, so the rule travels
  with the DDL;
- `src/lib/closeout/phase-2h-retention-guard.test.ts` fails on a `cron.schedule`
  in any Phase 2H migration;
- enabling a schedule is an operator act with a name and a timestamp:

```
npm run ops:retention-schedule                # reads, changes nothing
npm run ops:retention-dry-run                 # counts, deletes nothing
npm run ops:retention-schedule -- --enable    # OWNER-ONLY: authorizes the first live purge
```

**`--enable` has not been run and is not authorized by Phase 2H.**

---

## 6. Hosted Auth

### Read before, change narrowly, read after

```
node scripts/hosted-auth-config.mjs           # read the current posture
npm run rollout:verify                        # the gate's own reading
```

### Never push the whole config

`supabase config push` is **all-or-nothing**. It writes every setting in
`supabase/config.toml`, including ones the repository's file does not reflect
correctly — and in this project that would **open signup**, because the local
file and the hosted posture deliberately differ. SH.5 recorded this trap after
nearly walking into it.

**Mutate one setting at a time, through the Management API's targeted PATCH**,
and read the value back afterwards. A hosted config change is not verified by
the request returning 200; GoTrue in particular will accept a value and
silently rewrite it — a `redirect_to` outside the allow list returns 200 and
becomes `site_url`.

### The three postures to check on every deploy

| Setting | Required value | How it is read | OWNER-ONLY to change |
| --- | --- | --- | --- |
| `disable_signup` | **true** (signup closed) | `hosted-auth-config.mjs`, `rollout:verify` | **yes** — opening signup is a rollout decision |
| CAPTCHA (`security_captcha_enabled`, provider `turnstile`) | **enabled** | `hosted-auth-config.mjs`; and the widget renders on the deployed login page | **yes** |
| SMTP | **unconfigured** | `hosted-auth-config.mjs` | **yes** — configuring it makes real email deliverable to real addresses |

Signup is closed at **two** independent layers: hosted `disable_signup` and the
application's `SIGNUP_ENABLED` gate, which defaults **closed** on anything other
than the exact string `true`. A control with a single enforcement point is a
control that will eventually be off, and nothing in this repository would notice
a dashboard toggle flipping.

---

## 7. The environment and secret contract

The machine-checked contract is `src/lib/deployment/env-contract.ts`, and
`env-contract.test.ts` checks it against the repository in both directions. The
document does not restate the list; it states the rules the list encodes.

### The classes

| Class | Where the value may exist | Examples |
| --- | --- | --- |
| `public` | inlined into the browser bundle at build time | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |
| `server` | the Next.js server runtime only | `SUPABASE_SERVICE_ROLE_KEY`, every `BYOK_*`, `APP_ORIGIN`, `SIGNUP_ENABLED` |
| `edge-secret` | a deployed Edge Function's secrets | `WORKER_DISPATCH_SECRET`, `DELETION_REAP_SECRET` |
| `edge-config` | non-secret Edge configuration | `SUPABASE_URL` |
| `operator` | an operator workstation or CI, never a deployed runtime | `SUPABASE_ACCESS_TOKEN`, the online-journey credentials |
| `hosted-provider` | the provider's own configuration | `TURNSTILE_SECRET_KEY` |

### The rule that has no error message

**A secret-class variable must never carry a `NEXT_PUBLIC_` prefix.** Next.js
inlines any `NEXT_PUBLIC_*` variable into the browser bundle at build time. The
build stays green, nothing warns, and the key is public from the first page
load. `env-contract.test.ts` fails on any secret with a `NEXT_PUBLIC_` twin
anywhere in `src`, `scripts`, `supabase/functions` or `e2e`.

The check distinguishes **secret** from **non-public**, and the distinction is
load-bearing: `SUPABASE_URL` is not public-class, yet `NEXT_PUBLIC_SUPABASE_URL`
is a legitimate, separately declared twin. `SUPABASE_SERVICE_ROLE_KEY` has no
such twin and never may.

### There is no project-wide provider key, and the name cannot be written down

BYOK removed it: the last Node read, the last Deno read, and the deployed Edge
Function secret at the cutover. `src/lib/byok/project-key-guard.test.ts` fails
the build if the name reappears anywhere outside its two-file allowlist — the
env contract module included. The failure mode it guards against was never
somebody deciding to add a fallback; it was somebody needing a key at 3am,
finding the name in a contract, and wiring it into "one path that just needs to
work". **There is no name to find.**

### BYOK's constraints, unchanged

- The Next.js and Edge runtimes of one environment must hold the **same**
  `BYOK_MASTER_KEY`, `BYOK_MASTER_KEY_VERSION` and `BYOK_FINGERPRINT_PEPPER`,
  **byte for byte**.
- A mismatch is **silent at save time and terminal at execution time**:
  Settings reports "configured" and every asynchronous job then fails
  `credential_unreadable` forever. That is what the first BYOK deployment did.
- **Run `npm run byok:verify-runtime` before any deploy that touches these**,
  and drive a rotation only through `npm run byok:rotate-master-key`.

---

## 8. The destructive steps, all in one place — OWNER-ONLY

`2H-DEPLOY-006`. None of these is performed by Phase 2H.

| Action | Authorization it needs | State today |
| --- | --- | --- |
| Enable a retention schedule | the owner's authorization of the **first live purge** (ADR-082) | **not done.** 8 sweeps built, 0 scheduled |
| Run a user-content purge | the same, plus a recorded dry-run transcript read first | **never run** |
| Arm the deletion reaper | the owner sets 2 Vault secrets **and** schedules the job | **not done.** 0/2 secrets, no cron job |
| Open public signup | rollout gate `RG-*` signatures, both layers flipped deliberately | **not done.** closed at both layers |
| Configure SMTP | the owner — it makes real email deliverable to real addresses | **not done.** unconfigured |
| Restore a backup | the owner, into a **disposable** project only | **not done.** see `PHASE_2H_BACKUP_AND_RETENTION.md` |
| `supabase config push` | never, as written — it is all-or-nothing and would open signup | **not done** |

---

## 9. The whole sequence, for a slice that touches everything

1. Pre-flight §1 — six reads, all recorded.
2. Open the PR. Require **PR-head CI green ×3 per job**.
3. Re-read the full diff.
4. Merge with explicit authorization.
5. **Immediately** `npx supabase db push --linked` if the change is
   schema-coupled (§3). Read parity after.
6. Deploy each touched Edge Function **by name** (§4). Read versions back.
7. `npm run verify:edge-parity` — a gate, not a reminder.
8. Verify the application (§2).
9. Require **exact merge-SHA CI green ×3 per job**.
10. Re-read the cron catalog, the rollout gate, and the destructive posture.
11. Write the acceptance record with every reading in it.
