# BYOK Security Definition

**Status — DEFINITION ONLY.** No PRD, no implementation plan, no migration, no product
code, no provider change, no Vault secret, no signup change. Nothing here is authorized.
Entity Graph Completion and Phase 2G remain unauthorized and unstarted.

- **Baseline** — `main` at `a745011`, clean; parity `202607310064` (local head
  `202607310064_reminder_lifecycle_command.sql`).
- **Date** — 2026-07-31.
- **Scope** — whether per-user OpenAI credentials can be implemented safely in *this*
  architecture, and what must change before self-service signup may open.

> **The proposal is not new to this repository.** `SECURITY.md:59` already lists
> **"BYOK com envelope encryption e rotação"** as a pre-production requirement, and
> `DATABASE.md:59` records BYOK as planned for after the pré-MVP. `PHASE_2_PLAN.md:93`
> placed it out of Phase 2 scope. The owner's proposal moves a named, already-agreed
> requirement forward; it does not introduce a new architecture direction. That does not
> make it approved, and this study does not treat it as approved.

---

## 1. Verified current state

| Claim | Verified | Evidence |
| --- | --- | --- |
| `main` at `a745011`, clean tree (two untracked definition documents) | yes | `git log`, `git status` |
| Parity `202607310064` | yes | migration chain head |
| Phase 2F complete; UX remediation complete | yes | `PHASE_2F_REPORT.md` §16; `PRODUCT_UX_CLOSEOUT.md` §10 |
| Phase 2G unauthorized; Entity Graph Completion investigated, unauthorized | yes | `PHASE_2G_DEFINITION.md`, `ENTITY_GRAPH_FINDINGS.md` |
| Application layer not publicly deployed | yes | `README.md:20`; `playwright.config.ts:14` (`localhost:3000`); `M19`/`M20` open |
| Hosted Supabase (DB, Auth, PostgREST, cron, Edge Functions) is live | yes | parity verified `--linked`; three `pg_cron` schedules; `process-jobs` v13 deployed |
| All AI calls use a project-level `OPENAI_API_KEY` | **yes — and there are exactly two read sites** | `openai-provider.ts:59`; `process-jobs/index.ts:11` |
| No signup gate exists in repository code | yes | `auth/actions.ts:91-111` — `supabase.auth.signUp` with Zod only; no allowlist, no invite, nothing in `proxy.ts` |
| Hosted signup posture not determinable from repository | yes | `config.toml` governs the **local** stack only |
| **Supabase Vault is enabled and already in production use** | **yes** | `202607170026:641,644` — `pg_cron` reads `vault.decrypted_secrets` for `entry_dispatch_url` / `entry_dispatch_secret` |
| `pgcrypto` installed | yes | `202607160001:1` |
| **No account-deletion path exists anywhere** | **yes — a gap this study inherits** | no `deleteUser` / `admin.deleteUser` / delete-account action in `src` or `scripts`. `SECURITY.md:57` lists account deletion as required before production and unbuilt |
| Heartbeat performs no AI | yes | `functions/heartbeat/index.ts` has no provider call |

### 1.1 The single most useful structural fact

**The project key is read in exactly two places, and in both it is already a parameter
downstream, not a global.**

- **Node** — `openai-provider.ts:59`: `const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY`.
  The constructor already accepts `apiKey`; the factory `getAIProvider({model, embeddingModel})`
  (`lib/ai/index.ts`) **does not thread it**, so today every Node call falls through to the
  project key. One factory signature and one fallback expression are the whole Node surface.
- **Deno** — `process-jobs/index.ts:11`: read once per request, 503 if absent, then passed
  **as an argument** through `dispatch.ts:26,56` → `entry.ts:199,347,405` and
  `attachment.ts:63`. The worker already threads the key as data.

BYOK is therefore a **credential-resolution change at two injection points**, not a
rewrite. That is the strongest argument that it is feasible here — and it is an argument
about feasibility, not about safety.

---

## 2. Complete AI call-path inventory

| # | Entry point | Environment | `user_id` established by | Authoritative? | Key source today | Provider operation | Usage recorded | Failure | Unattended? | Can a missing key block it safely? | Fallback today |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `chat/actions.ts:137` `embedText` | Server Action | `require-user` / session | **yes** | project env | embedding | yes | sync | no | yes | project key (implicit) |
| 2 | `chat/actions.ts:175` `answerFromKnowledge` | Server Action | session | **yes** | project env | responses | yes | sync | no | yes | project key |
| 3 | `agent/actions.ts:883` `answerFromKnowledge` (review generation) | Server Action | session | **yes** | project env | responses | yes | sync | no | yes | project key |
| 4 | `assistant/actions.ts:82,177,190` (composer → chat) | Server Action | session | **yes** | delegates to #1/#2 | — | via #1/#2 | sync | no | yes | project key |
| 5 | `task-commands/actions.ts:685` `parseTaskCommand` | Server Action | session | **yes** | project env | responses (bounded `max_output_tokens`) | yes | sync | no | yes | project key |
| 6 | `memories/actions.ts:120` `embedText` | Server Action | session | **yes** | project env | embedding | yes | sync | no | yes | project key |
| 7 | `operations/actions.ts:166` `embedText` (memory create) | Server Action | session | **yes** | project env | embedding | yes | sync | no | yes | project key |
| 8 | `process-jobs/entry.ts:243` extraction | **Edge Function (Deno)** | `jobs.user_id` from the claimed row; entry reloaded by `id` **+** `user_id` | **yes — database-held** | `Deno.env` → parameter | responses | yes (`entry.ts:278`) | **async** | **yes — `pg_cron` drain** | yes, but must not burn retries | project key |
| 9 | `process-jobs/entry.ts:357` embedding | Edge Function | same | **yes** | same parameter | embedding | yes (`entry.ts:373`) | async | **yes** | yes; already non-blocking | project key |
| 10 | `process-jobs/attachment.ts:162` file analysis | Edge Function | `jobs.user_id` | **yes** | same parameter | responses | yes (`attachment.ts:201`) | async | no — per-upload invocation only | yes | project key |
| 11 | `heartbeat` Edge Function | Edge Function | per-user loop in SQL | yes | **none — no AI** | — | — | — | yes | n/a | **none** |
| 12 | `scripts/remote-*.mjs` smokes | Node script | disposable fixture users | n/a — system | project env via `.env.local` / linked CLI | mixed | yes | sync | no | n/a | **project key — legitimately** |
| 13 | Vitest / Playwright | test runner | fixtures | n/a | mocked or project env | mixed | n/a | n/a | no | n/a | project key |

### 2.1 What the matrix establishes

1. **Every user-triggered path carries an authoritative `user_id`.** Server Actions derive
   it from the Supabase session; the worker derives it from `jobs.user_id`, which is
   `not null references auth.users(id) on delete cascade` and is never supplied by a
   client at claim time. The direct-invocation path additionally filters the job lookup by
   `.eq("user_id", user.id)` against a Bearer token the function validates itself
   (`index.ts:52-58`). **There is no user-triggered AI path whose owner is client-supplied.**
   This is the precondition BYOK needs, and it already holds.
2. **Ten of thirteen paths are user-triggered and all ten use the project key.** Under
   BYOK all ten must resolve a per-owner credential. Rows 12–13 are system/test paths and
   are the only legitimate project-key survivors (§5).
3. **Two paths run unattended** (8 and 9, via the per-minute `pg_cron` drain). These are
   the hard cases: no session, no user present, `service_role` execution. They are why no
   design in this architecture can withhold decryption capability from the operator (§4.1).
4. **`answerFromKnowledge` appears twice** (rows 2 and 3) through two different features.
   A single provider-adapter choke point covers both; a per-call-site retrofit would not.
5. **Row 11 is the good news to state explicitly:** the heartbeat — the only always-on
   per-user scheduled work — performs no AI at all, so BYOK does not touch reminder
   delivery.

---

## 3. Key-flow diagrams

### 3.1 Current

```
 Browser ──► Server Action ──► getAIProvider() ──► new OpenAIProvider()
                                                      │
                                                      └─► process.env.OPENAI_API_KEY ──► OpenAI
                                                          (owner's project key)

 pg_cron ──► pg_net + vault(entry_dispatch_url/secret) ──► process-jobs (mode=dispatch)
                                                              │
 Browser ──► invoke({jobId}) + Bearer ──────────────────────► │
                                                              ├─ Deno.env.OPENAI_API_KEY  ← ONE read
                                                              └─► dispatch.ts ─► entry/attachment ─► OpenAI
                                                                   (key passed as an argument)
```

One key. One tenant, effectively. No per-owner resolution anywhere.

### 3.2 Proposed

```
                       ┌──────────────────────────────────────────────┐
                       │  public.user_ai_credentials  (RLS forced)    │
                       │  user_id · status · ciphertext · iv · tag    │
                       │  key_version · fingerprint · validated_at    │
                       │  NO plaintext. NO master key.                │
                       └──────────────────────────────────────────────┘
                                        ▲ ciphertext only
                                        │
   Server Action ─► resolveAICredential(ownerFrom: session)  ─┐
                                                              ├─► SECURITY DEFINER RPC
   Worker (claimed job) ─► resolveAICredential(ownerFrom:     │   returns CIPHERTEXT for an
                            jobs.user_id of the claimed row) ─┘   owner the caller cannot name
                                        │
                                        ▼
                        decrypt in runtime (AES-256-GCM, Web Crypto)
                        master key: BYOK_MASTER_KEY  ← env, NOT in the database
                                        │
                                        ▼
                        new OpenAIProvider({ apiKey })  ──► OpenAI
                                        │
                        no key → CredentialUnavailable → declared, localized, fail-closed
```

**Three properties are load-bearing, and each is a shape rather than a promise:**
the resolver takes **no user parameter** (the owner is derived, never chosen); it returns
**ciphertext** (the database never holds plaintext and never holds the master key); and
the provider constructor **loses its environment fallback** (`options.apiKey` becomes
required for user paths), so "forgot to pass a credential" becomes a type error rather
than a silent charge to the owner.

---

## 4. Secret-storage alternatives

| | **A — Supabase Vault** | **B — External secret manager** | **C — App-layer envelope encryption** | **D — per-user Edge Function env vars** | **E — encrypted blob in a normal table, key in DB** |
| --- | --- | --- | --- | --- | --- |
| Encryption at rest | yes, project root key | yes, vendor-managed | yes, AES-256-GCM, per-row IV | n/a | yes |
| Who holds the encryption key | **Supabase** (project root key, inside the platform) | vendor | **the application runtime** (`BYOK_MASTER_KEY` env), *outside* the database | n/a | **the database** — self-defeating |
| Who can decrypt | `postgres`/`supabase_admin` via `vault.decrypted_secrets`; anything you grant | whoever holds the vendor credential | any runtime holding the master key | Supabase admin | anyone who can read the database |
| RLS relevance | **none** — `vault.secrets` is not a user-owned table; isolation must be coded | none | **real** — the ciphertext row is `user_id`-scoped with forced RLS | none | real but irrelevant, since the key is beside the data |
| Backups / replication | encrypted at rest; a DB dump does **not** yield plaintext without the platform root key | external to backups | **a full DB dump is useless without the env master key** — the strongest property here | n/a | **a dump yields everything** |
| Rotation | `vault.update_secret` | vendor-native | re-encrypt row; `key_version` column supports master-key rotation | impossible in practice | possible, pointless |
| Deletion | `delete from vault.secrets` — **not reached by `auth.users` cascade** | vendor API | **`on delete cascade` from `auth.users` works**, because it is an ordinary table | n/a | cascade works |
| Auditability | Vault has no per-read audit | vendor audit log | you write it — metadata-only audit rows | none | none |
| Local development | `[db.vault]` is commented out in `config.toml`; needs verification on the local stack | needs vendor credentials on every dev machine — **the worst option for this repo's Docker-optional workflow** | works offline with a dev master key | impossible | trivial |
| Worker / Edge Function access | via a `SECURITY DEFINER` RPC (worker must never read the view) | vendor SDK in Deno + Node; second network hop **per AI call** | one RPC returning ciphertext; `crypto.subtle` in both runtimes | n/a | trivial |
| SQL-exposure risk | a misgranted RPC leaks plaintext | none | **an exposed RPC leaks ciphertext only** | n/a | **catastrophic** |
| Service-role exposure | service_role has no default grant on the view, but any DEFINER RPC you write is reachable by whatever you grant | service_role never sees the vendor credential *if* only the runtime holds it | service_role reaching the RPC gets ciphertext; still needs the master key | n/a | total |
| Operational complexity | low — already enabled and used | **high** — new vendor, new credential, new failure mode, new latency | medium — master-key custody, rotation, loss discipline | n/a | low |
| Vendor lock-in | Supabase | **new vendor** | none | Supabase | none |
| Migrations | metadata table + resolver RPC + a delete hook Vault does not give you | metadata table + resolver | metadata/ciphertext table + resolver RPC | n/a | table |
| **Recommendation** | **viable, second choice** | **rejected for this stage** | **RECOMMENDED** | **rejected — technically impossible** | **PROHIBITED** |

### 4.1 The property no alternative provides — stated before the recommendation

**The unattended `pg_cron` drain interprets entries with no user present.** Any design in
which that drain can call OpenAI on a user's behalf is a design in which a server-side
component can obtain that user's plaintext key. Therefore:

> **No storage choice can prevent the application operator from decrypting a user's API
> key.** Encryption at rest protects against database theft, backups, SQL injection and DB
> administrator reads. It does **not** protect the user from the operator, because the
> operator's worker must decrypt to do the work the user asked for.

The only architecture that removes operator decryption is client-held keys with the browser
calling OpenAI directly — which **cannot support this product**: it would kill the
`pg_cron` drain, asynchronous interpretation, the attachment worker, and every capability
that happens while the user is away. That is the product's core loop, not a peripheral.

This is not a defect to be engineered away; it is a boundary to be **stated honestly in the
copy** (§11) and constrained mechanically (§9).

### 4.2 Why C over A

Vault is already enabled here and already used by `pg_cron` (`202607170026:641`), and
"we already have it" is exactly the reason §Architecture-alternatives warns against.
Three substantive reasons prefer C:

1. **The master key is outside the database.** Under A, the decryption key is held by the
   platform alongside the data; a sufficiently privileged read inside the database yields
   plaintext. Under C, a complete database compromise — dump, injection, DB admin,
   backup — yields ciphertext and nothing else. For the threat list in §12 this is the
   single largest difference.
2. **Deletion is ordinary.** Vault secrets live in `vault.secrets`, which **no
   `auth.users` cascade reaches** — the orphan-secret threat (§12, T-19) is structural
   under A and requires a bespoke cleanup path. Under C the ciphertext is a column on a
   `user_id`-scoped table and `on delete cascade` already does the right thing.
3. **RLS becomes meaningful.** Under A, isolation is entirely code-enforced. Under C, the
   ciphertext row is a normal owned row with forced RLS and own-row policies — the same
   boundary every other table in this schema uses, and the one this codebase already knows
   how to test.

**What C costs, stated plainly:** master-key custody. `BYOK_MASTER_KEY` must exist in both
runtimes (Next.js and the Edge Function), must never enter the database, and **if it is
lost every user's key is unrecoverable** — users must re-enter them. That is an acceptable
failure mode (keys are re-obtainable from OpenAI) but it must be written into the runbook
rather than discovered.

**Never permitted, regardless of alternative:** plaintext in `profiles`,
`agent_preferences`, browser storage, cookies, analytics, `audit_logs`, `product_events`,
job payloads, conversation messages, or dynamically-named environment variables. And **RLS
is not encryption** — it is an access-control predicate inside one database engine and
protects nothing in a dump.

---

## 5. The two invariants

### 5.1 Isolation invariant

> For every user-owned AI operation, the credential used is the credential of the operation's
> authoritative owner, where the owner is **derived** from the authenticated session or from
> an owned database row — **never from a caller-supplied parameter**.

Mechanically: `resolve_ai_credential()` takes **no `user_id` argument**. Two overloads,
each deriving the owner from something the caller cannot forge:

- **Synchronous** — derives from `auth.uid()`. A caller with no session gets `42501`.
- **Asynchronous** — takes a **job id**, is `service_role`-only, and derives the owner from
  `jobs.user_id` on that row. A forged job id resolves that job's real owner, and the
  worker's existing reload-by-`id`-**and**-`user_id` (SECURITY.md:20) means it would then
  be working on rows it cannot read. The forgery gains nothing and yields no key it can
  aim at chosen data.

Isolation is thereby a property of the **function signature**, not of a privilege grant —
which matters precisely because §4.1 establishes that the privilege cannot be withheld.

### 5.2 No-fallback invariant

> user key configured **and** active → use it.
> No active user key → **do not call the provider.**
> The project key is **never** a fallback for a user-owned operation.

**Inventoried, named exceptions** — the complete list, and nothing may be added without an ADR:

| Exception | Why it is not a user operation | Guard |
| --- | --- | --- |
| Local development (`.env.local`) | no real user; disposable data | dev-only; must not be reachable from a deployed build |
| Repository tests / Vitest / Playwright | fixture users only | mocked provider by default; live calls confined to opt-in lanes |
| `scripts/remote-*.mjs` smokes | system-owned validation against disposable fixtures | already isolated in `scripts/`; excluded from the product import guard |
| The **owner's own account**, *if* Owner Decision 7 allows it | it is the owner's key and the owner's operation | must be an explicit per-account credential row, not an environment fallback — see below |

**On the owner's own account:** the safe form is *not* "fall back to `process.env` when the
owner has no row". It is "the owner configures their key through the same Settings flow as
everyone else, and it is stored the same way". Otherwise the fallback branch exists in the
code and one predicate error re-enables it for everyone. **Recommendation: the project key
never serves any account, including the owner's.**

---

## 6. Where the trust boundary belongs

**A combination, and each part is chosen for a reason:**

| Concern | Home | Why not elsewhere |
| --- | --- | --- |
| Owner derivation + ciphertext retrieval | **database RPC** (`SECURITY DEFINER`, `search_path = ''`) | Only the database can prove `jobs.user_id` for a claimed job without trusting the worker's own bookkeeping |
| Decryption | **runtime** (Next.js and Deno), never SQL | The master key must not be in the database (§4.2). `crypto.subtle` AES-GCM exists in both runtimes |
| Provider construction | **shared provider adapter** (`lib/ai`, and the Deno mirror) | Rows 2 and 3 of §2 share `answerFromKnowledge`; a per-call-site retrofit would miss one |
| Fail-closed refusal | **adapter**, surfaced as a declared result | A thrown error becomes an unhandled 500; this codebase's convention is a declared, localized outcome |

The Deno worker cannot import `src/lib/ai` — `server-only` throws outside a bundler
(SECURITY.md:23) — so the credential adapter joins the existing hand-mirrored
`_shared/` modules and **must** be covered by the same source-parity lock that
`extraction-parity.test.ts` and `deno-parity.test.ts` already apply. A BYOK adapter that
drifts between runtimes is a fallback waiting to happen.

---

## 7. Architecture guards (CI, fail-closed)

Comments and review do not hold this. Five executable guards, each in the shape this
repository already uses (`direct-write-guard.test.ts`, `policy-lock.test.ts`,
`extraction-parity.test.ts`):

| Guard | Fails the build when | Shape |
| --- | --- | --- |
| **G1 — project-key import guard** | any module under `src/features/**` or `src/lib/ai/**` references `process.env.OPENAI_API_KEY`, or the Deno worker reads `Deno.env.get("OPENAI_API_KEY")`, outside an explicit allowlist | exact-set comparison in **both** directions, so an allowlist naming a non-existent file also fails — the `direct-write-guard` pattern |
| **G2 — no-default-credential guard** | `OpenAIProvider`'s constructor accepts a missing `apiKey`, or `getAIProvider` can be called without a resolved credential | type-level (`apiKey: string`, required) **plus** a test asserting construction throws without one |
| **G3 — worker owner-resolution guard** | a job handler calls a provider without having resolved a credential from the claimed row's owner | Deno test over the worker entrypoints |
| **G4 — secret-serialization guard** | a credential value can reach a job payload, `audit_logs`, `product_events`, `jobs.error`, an action result, or a rendered prop | a branded `Secret` type whose `toJSON`/`toString` throw, plus a test that round-trips every declared result shape |
| **G5 — parity lock** | the Node and Deno credential adapters diverge | same mechanism as `extraction-parity.test.ts` |

G4 deserves emphasis: this repository has already been burned by a provider message
reaching `jobs.error` and rendering on the Jobs page (SECURITY.md:34, item 2). A secret in
the same position would be worse, and `jobs.error` is still rendered verbatim (`L11`,
`TODO.md:209`).

---

## 8. Settings and onboarding lifecycle

1. Account created — **no key, no AI**.
2. Deterministic product is fully usable (§10).
3. AI surfaces render a **gated state**, not a broken one: a declared
   `credential_required` outcome with a localized explanation and a link to Settings.
4. Settings explains what the key is for, what it costs the user, and what the product can
   and cannot promise (§11).
5. User submits over HTTPS to a Server Action. The field is `type="password"`,
   `autoComplete="off"`, **never prefilled**, and cleared from component state on submit.
6. Server-side shape validation with **no logging of the value**; the Zod issue may name
   the field, never the input.
7. **Live validation call** — one minimal request (a cheap models-list or a 1-token
   completion) with the submitted key, `maxRetries: 0`, a short timeout, and an error
   handler that maps to a closed vocabulary and never re-throws the provider error object.
8. Only on success is the credential encrypted, stored and marked `active`.
9. Browser receives **metadata only**: `{ configured, provider, fingerprint, validatedAt, status }`.
10. **No read path returns the key.** There is no "show key" action, and the resolver RPC
    returns ciphertext to server code only.
11. Replace — atomic (§9).
12. Remove — sets `status = 'removed'` **and** clears the ciphertext in one statement.
13. Test — re-validates the stored key without revealing it; updates `status`/`validatedAt`.
14. Invalid/revoked → `status = 'invalid'`, which gates AI exactly as "no key" does.
15. Account deletion → §13.

### 8.1 On last-four display

**Do not display the last four characters.** Current OpenAI keys (`sk-proj-…` and
successors) place their entropy in the tail, and the tail is the part a shoulder-surfer,
screenshot or support transcript can most usefully capture. The prefix is
low-entropy and equally recognisable.

**Recommended fingerprint:** the first ~7 characters of the *prefix* (e.g. `sk-proj`)
plus a truncated **HMAC** of the key under a server-held pepper — displayed as, e.g.,
`sk-proj · a3f9c1`. It is stable, comparable across rotations, and reveals no key
material. Store the fingerprint; **never store or display any substring of the key
itself**, and never store the fingerprint on `ai_usage_events` (§14).

---

## 9. Validation and atomic rotation

```
receive candidate ─► shape-validate ─► live-validate (new key only)
      │ fail                                   │ fail
      ▼                                        ▼
  reject, old credential UNCHANGED and still active
                                               │ success
                                               ▼
  single transaction: write new ciphertext + key_version + fingerprint
                      + validated_at, set status='active',
                      overwrite the previous ciphertext in place
                                               │
                                               ▼
                       return metadata only; audit row records
                       "credential rotated" with NO key material
```

The old credential survives any failure because nothing is written until validation
succeeds. Overwriting **in place** (one row per user, not a history table) means there is
no second ciphertext to leak or forget to delete.

### 9.1 Jobs queued across a rotation — recommendation

**Resolve the active credential at execution time. Do not pin, do not cancel.**

- *Pinning a credential version* would require the job to reference a superseded secret,
  which means keeping the old ciphertext alive — reintroducing exactly the artefact
  rotation exists to destroy, and defeating "removal blocks async work".
- *Cancel-and-retry* discards work the user asked for because they changed an unrelated
  setting.
- *Resolve-at-execution* is also the only option that satisfies requirement 9 ("removing
  the key must immediately prevent future AI work"): a job that resolves at claim time sees
  the current state, full stop.

The cost is that a job may run under a different key than the one active at enqueue. That
is correct behaviour — the credential is an account property, not a property of the request.

---

## 10. Feature behaviour without a key

| Feature | Classification |
| --- | --- |
| Manual task create/edit, all task commands' **apply** step | deterministic — **allowed** |
| Projects, People, Organizations, Contexts (incl. all Entity Graph Completion work) | deterministic — **allowed** |
| Memories: manual create/edit, listing | deterministic — **allowed** (embedding is best-effort and already degrades) |
| Reminders, heartbeat, notifications | deterministic — **allowed** (no AI, row 11 of §2) |
| History, Jobs, Costs, Settings | deterministic — **allowed** |
| **Capture** | **accepted, stored, explicitly unprocessed** — see §10.1 |
| Entry interpretation / reprocessing | AI — **blocked**, no job enqueued |
| Composer: task-command parsing | AI — **blocked** with a declared `credential_required` outcome |
| Composer: memory-intent branch | deterministic (`routing.ts` runs pre-provider) — **allowed**, and it is the one composer branch that still works |
| Knowledge questions / chat | AI — **blocked before** the conversation row is written, so no residue |
| Embeddings, semantic retrieval | AI — **blocked**; lexical paths unaffected |
| Attachments | upload **allowed**, analysis **blocked** — do not enqueue |
| Review generation | AI — **blocked** |

### 10.1 Capture without a key — recommend **B**

**Save the raw entry; mark it explicitly unprocessed; enqueue nothing.**

- **(A) refuse capture** — rejected. Capture is the product's front door and the entry is
  the user's own words; losing them to a configuration state is the worst outcome available.
- **(C) save and enqueue a blocked job** — rejected. It creates a queue of work that cannot
  run, burns the retry budget on a condition retrying cannot fix (the exact failure mode
  `extraction-validation.ts:163` and `202607250053:65` were written to prevent), and makes
  the drain do futile work on every tick.
- **(B)** keeps the data, tells the truth, and costs nothing until the user acts.

**This needs a migration** — and it is the one place BYOK requires schema beyond the
credential table. `entries.status` is a CHECK (`'processing'` default, replaced once
already at `202607170020:3-11`, so the pattern is precedented) and would gain a state
meaning *awaiting AI configuration*. The alternative — leaving `status = 'processing'` —
is a lie rendered on the Inbox, and "do not silently accept a capture that looks processed
when it is not" forbids it.

**Recovery lifecycle.** When a key becomes active, the user is offered — never
automatically charged — a bounded "interpret N pending entries" action that enqueues
through the existing `enqueue_entry_reprocessing` path. Automatic bulk interpretation on
key activation would spend the user's money without an explicit act, which is the same
class of error as an unconfirmed AI write.

### 10.2 The drain must skip owners without credentials

`claim_next_entry_interpretation_job(text, integer)` (`202607170025:350`, `service_role`
only) must not select jobs whose owner has no active credential — otherwise every tick
claims work that cannot run. A `create or replace` with an added `not exists` predicate;
signature, grants and lease semantics unchanged.

---

## 11. Security promises the product may truthfully make

**Permitted** — each with the property and the test that backs it:

| Claim | Property | Test |
| --- | --- | --- |
| "Stored encrypted; the encryption key is not kept in the database" | AES-256-GCM, master key in runtime env | assert the stored column is not the input; assert no migration/table holds the master key |
| "Never shown again after saving" | no read path returns plaintext | assert every action result and rendered prop for the Settings surface |
| "Used only for operations on your account" | resolver takes no user parameter (§5.1) | two-user isolation tests (§15) |
| "Never used for another user's work" | same | cross-user resolution tests |
| "Removable and replaceable at any time; removal stops future AI work" | resolve-at-execution (§9.1) | sync + async removal tests |
| "The application owner's key is never used for your work" | G1 + G2 (§7) | import guard + constructor guard |

**Forbidden** — and the reason is architectural, not stylistic:

- ❌ "Your key is completely safe."
- ❌ "Nobody can ever access your key."
- ❌ "Only you can see your key."
- ❌ "We cannot read your key."

**All four are false under §4.1.** The operator's worker decrypts user keys to do
unattended interpretation. The copy must say so:

> *"Your key is encrypted before it is stored and is never shown again. Our backend
> decrypts it only to run the AI work you asked for, including work that runs in the
> background while you are away — so our systems can technically access it. You can remove
> it at any time, and OpenAI charges for its use are billed to your own OpenAI account."*

**Also required in copy:** the user pays OpenAI directly (responsibility for charges); the
key should be created as a **dedicated key with a spend limit** in the user's own OpenAI
project (rotation guidance); and an incident-disclosure commitment naming key rotation as
the first user-facing remediation step.

---

## 12. Threat model

| # | Threat | Likelihood | Impact | Prevention | Detection | Residual |
| --- | --- | --- | --- | --- | --- | --- |
| T-1 | User A uses user B's key | Low | Critical | Resolver takes no user parameter (§5.1) | Two-user isolation tests in CI | Code error in the resolver — the reason G3 exists |
| T-2 | Manipulated `user_id` in a request | Low | Critical | No path accepts one (§2.1) | G3 | none material |
| T-3 | Foreign job/object id submitted | Medium | High | Owner derived from the row; worker reloads by `id` **and** `user_id` | job-lookup filter, claim RPC | Forgery resolves the real owner's key but cannot aim it at chosen data |
| T-4 | Compromised browser / XSS | Low | High | Key never returned; no `show key`; not in state after submit; no `NEXT_PUBLIC_*` | CSP (still `unsafe-eval`, `TODO.md:181`) | **A live XSS during submission captures the key in transit.** Unavoidable; mitigated by CSP hardening being a prerequisite |
| T-5 | Malicious query through an exposed RPC | Medium | High under A, **Low under C** | Resolver returns **ciphertext**; least-privilege grants | pgTAP posture assertions | Ciphertext without the master key |
| T-6 | Insecure logs / exception serialization / APM | **Medium — the most likely real leak** | Critical | Branded `Secret` type with throwing serializers (G4); provider errors mapped to a closed vocabulary, never re-thrown raw | G4 in CI; log-scan test | An unguarded `console.error(error)` in a path added later — G4 must cover new paths by construction |
| T-7 | Screenshots / support transcripts | Medium | Medium | No display, no last-four (§8.1) | — | Fingerprint only |
| T-8 | Database backups | Medium | **Low under C**, High under A/E | Master key outside the database (§4.2) | — | Backup + env compromise together |
| T-9 | `service_role` compromise | Low | **Critical** | service_role gets ciphertext only; master key is not in the database | — | **Real** — service_role + runtime env = all keys. §4.1 |
| T-10 | Database administrator access | Low | **Low under C** | Same | — | Ciphertext only |
| T-11 | Edge Function compromise | Low | Critical | — | — | **Real and unavoidable** — the function must decrypt. §4.1 |
| T-12 | SQL injection | Low | Low under C | Parameterized everywhere; `search_path = ''` | `db lint` | Ciphertext only |
| T-13 | Secret-reference guessing | Low | Low | No user-facing secret reference exists | — | none |
| T-14 | Race during rotation | Medium | Medium | Single-transaction in-place overwrite (§9) | concurrency test | A job mid-flight finishes on the old key — bounded and acceptable |
| T-15 | Stale queued jobs after removal | **Medium** | High | Resolve-at-execution (§9.1) + drain skip (§10.2) | async-removal test | none if §9.1 is honoured |
| T-16 | **Key-validation abuse — the product as a stolen-key oracle** | **Medium** | **High — reputational and legal** | Per-user **and** per-IP validation rate limits; a hard daily ceiling; validation only from an authenticated session | validation-attempt counters | **A new risk BYOK creates that does not exist today.** See §13 |
| T-17 | Users submitting stolen keys | Medium | High | Terms; T-16 limits; suspension capability | anomalous validation patterns | Cannot be fully prevented — the product cannot verify key ownership |
| T-18 | Mass signup / bot account farming | **High if signup opens** | High | §13 | Auth logs | **BYOK does not touch this.** §13 |
| T-19 | Account deletion leaves an orphan secret | **High under A**, Low under C | High | `on delete cascade` on an ordinary table (§4.2) | post-deletion residue assertion | Backup retention window only |
| T-20 | Provider response containing sensitive data | Low | Medium | Existing validated-schema boundary; model output is untrusted data | extraction validation | unchanged from today |
| T-21 | Usage-ledger failure hides consumption | Medium | Medium | §14 | — | Ledger is fail-open today |
| T-22 | DoS against OpenAI using user keys | Low | Medium | Per-user job/concurrency limits (§13) | job metrics | The user's own key, the user's own limits |

---

## 13. Signup and abuse controls

**BYOK moves the OpenAI bill. It does not make signup safe.** Everything below remains the
owner's cost and is entirely untouched by BYOK: Supabase Auth MAU, email delivery, database
growth, Storage, CPU, PostgREST throughput, the job queue, `pg_cron` capacity, and Edge
Function invocations. And BYOK **adds** T-16, a credential-validation oracle that does not
exist today.

| Control | Owner-only (deployed) | Invited users | **Public signup** |
| --- | --- | --- | --- |
| Hosted signup closed / invite-gated | **required now** | required | replaced by the controls below |
| Email confirmation | recommended | **required** | **required** |
| CAPTCHA (`config.toml` supports hCaptcha/Turnstile) | no | recommended | **required** |
| Signup rate limiting | no | recommended | **required** |
| **Key-validation rate limiting (T-16)** | recommended | **required** | **required** |
| Per-user entry / queued-job / concurrency limits | no | **required** | **required** |
| Input-size limits | already present (12 000 chars) | present | present |
| File-size and **storage quota** | 25 MB/file today; **no per-user quota** | **required** | **required** |
| Retention / purge (`M6`) | recommended | **required** | **required** |
| **Account deletion** (does not exist — §1) | **required before any non-owner user** | required | required |
| Admin suspension | no | **required** | **required** |
| Terms + privacy policy | no | **required** | **required** |
| Abuse reporting | no | recommended | **required** |
| Error sink (`H7`) | recommended | **required** | required |
| Cron dead-man (`H8`) | recommended | **required** | required |
| Rate limiting on AI paths (`C1b`) | no | recommended | **required** — for *infrastructure*, not spend |
| CSP without `unsafe-eval` (`TODO.md:181`) | recommended | **required** (T-4) | **required** |

**The honest conclusion:** BYOK is *necessary* for opening signup and nowhere near
*sufficient*. Of the fourteen rows above, BYOK addresses **one**.

---

## 14. Usage accounting under BYOK

`ai_usage_events` changes meaning, and the change must be surfaced:

- **It becomes an estimate of someone else's bill.** The pricing catalog is the
  application's, matched on the provider model string — and `M9`/`M10` (`TODO.md:201`)
  already record that a model rename silently flips events to `unpriced`. Users may also be
  on different OpenAI tiers or negotiated pricing.
- **The UI must say estimated.** "Custo estimado" / "Estimated cost", with a sentence that
  the authoritative figure is the user's own OpenAI dashboard. Presenting an unlabelled
  USD figure for a bill the product does not issue is a truthfulness defect of the same
  class the UX remediation spent eight slices removing.
- **Record `key_version`, never a key fingerprint.** Enough to attribute usage across a
  rotation; nothing that could correlate a key across accounts.
- **`recordAIUsage` should stay fail-open** — but for a *different reason* than today.
  Pre-BYOK it was a hole in a spend cap (`PHASE_2G_DEFINITION.md` R10). Post-BYOK, if the
  cap is advisory (below), losing a ledger row costs accuracy, not control. **If Owner
  Decision 9 makes any ceiling enforcing, R10 returns in full and the posture must be
  decided explicitly.**
- **Is a platform spend cap still meaningful?** It changes purpose entirely:

| Purpose | Pre-BYOK | Post-BYOK |
| --- | --- | --- |
| Protect the **owner's** OpenAI account | the whole point of C1 | **eliminated** — no fallback exists |
| Help each user understand their own use | secondary | **primary**, and it must be labelled an estimate |
| Prevent abuse of **application infrastructure** | not addressed by a USD cap | **the real remaining need** — and it is a *job/row/storage* quota, not a dollar figure |
| Protect users from accidental personal spend | not applicable | **new** — a courtesy ceiling, best delivered as guidance to set a limit in their own OpenAI project (§11) plus an optional in-app soft ceiling |

**This directly amends `PHASE_2G_DEFINITION.md` §9 items 4–5.** The per-user USD ceiling
proposed there was justified by the unattended drain spending *the owner's* budget. Under
BYOK that justification disappears and is replaced by infrastructure quotas.
`max_output_tokens` on every operation survives on its own merits — it protects the user's
wallet and bounds worst-case latency — but it is no longer "the ceiling's other half".

---

## 15. Test strategy

Provider mocked by default; **no live OpenAI call in CI**. The one live call BYOK genuinely
needs (§8 step 7) is proven in an opt-in remote lane against a disposable fixture user,
using a **dedicated low-limit OpenAI key held only by the operator**, mirroring
`ADR-059`'s opt-in Vitest lane. Synthetic well-formed-but-invalid keys cover every negative
path without spending anything.

| Group | Cases |
| --- | --- |
| **Isolation** | A saves key A, B saves key B; A's sync op uses A; B's uses B; A cannot reference B's credential; a foreign job id resolves its own owner and yields no usable access; the resolver rejects any attempt to pass a user id (it has no such parameter — asserted on the signature) |
| **No fallback** | missing key never reaches the provider (sync **and** async); G1 import guard; G2 constructor guard; a deliberately introduced fallback reds the build |
| **Validation & rotation** | invalid key never becomes active; old key survives failed rotation; successful rotation stops the old key; concurrent rotation is serialized; a job mid-rotation resolves the current credential |
| **Removal & deletion** | removal blocks sync; removal blocks async; the drain stops selecting that owner's jobs; deleted account leaves **no** row and no decryptable artefact — asserted by a residue verifier in the `verify-*-cleanup.mjs` family |
| **Secret containment** | browser never receives the key (assert every action result and rendered prop); no key in logs, errors, `jobs.error`, `audit_logs`, `product_events`, job payloads, or analytics; `Secret.toJSON`/`toString` throw; a snapshot test over the Settings DOM |
| **Job semantics** | configuration failures do **not** retry (bounded, declared terminal state); provider/infrastructure failures do; credential failure is distinguishable from provider, domain and infrastructure failure by a declared code |
| **Posture (pgTAP)** | resolver is `SECURITY DEFINER` with `search_path = ''`; `authenticated` cannot select ciphertext of another user (forced RLS, asserted **non-vacuously** — owner's positive row before the stranger's absence, per `2F-OWNERSHIP-001`); `anon` denied after a privileged positive control |
| **Surface** | Settings in both locales, desktop + mobile; the gated state on every AI surface; capture-without-key stores and labels correctly; the post-key recovery offer enqueues only on an explicit act |
| **Hygiene** | zero fixture credentials and zero fixture accounts after every run, fail-closed |

---

## 16. Roadmap impact

### 16.1 Does BYOK block Entity Graph Completion?

**No, and this is checkable.** Every EGC surface is deterministic: organizations, contexts,
person relationships, person↔context and person↔project associations, and
`person_projects.role` involve **no provider call on any path**
(`ENTITY_GRAPH_FINDINGS.md` §2). EGC neither adds an AI path to retrofit nor depends on one.
The two initiatives are genuinely independent.

### 16.2 Ordering alternatives

| | Order | Verdict |
| --- | --- | --- |
| **A** | BYOK → EGC → … | **Rejected.** Delays the only work with observed-in-use evidence behind a large security initiative whose trigger (opening signup) has no evidence-backed urgency |
| **B** | EGC → BYOK → … | Viable, but leaves BYOK undesigned while decisions accumulate around it |
| **C** | **Design BYOK now → implement EGC → implement BYOK + signup hardening → open signup → Phase 2G** | **RECOMMENDED — this is the owner's preference, and it survives challenge** |
| **D** | EGC → Phase 2G → BYOK | Defensible if signup stays closed indefinitely, and cheaper than it looks (Phase 2G adds ~0 new provider **call sites**: the create verb reuses `parseTaskCommand`, capture routing reuses extraction). Rejected only because it leaves the T-16 oracle and the §13 gaps unexamined for two more initiatives |

### 16.3 Challenges to the owner's ordering, and what survives

1. **"BYOK is being pulled forward by a desire to open signup, and opening signup has no
   evidence-backed urgency."** *Partly conceded.* The funnel is empty; two users exist. But
   the ordering only *designs* BYOK now and implements it later, which costs one study and
   buys the §13 inventory. **Survives.**
2. **"Step 5 (open signup) is one line in a list and is the riskiest step in the roadmap."**
   *Conceded — and it is the sharpest correction.* Step 5 is not a step; it is a gate with
   fourteen prerequisites (§13), of which BYOK is one, and three of which do not exist at
   all: **account deletion, admin suspension, and terms/privacy**. The ordering should read
   *"open signup **when the §13 public column is satisfied**"*, not *"open signup after BYOK"*.
3. **"Step 4 (verify no user path can consume the owner's key) is listed after
   implementation."** *Conceded.* It is not a verification step, it is G1–G5 (§7), and they
   must land **with** the implementation, not after it.
4. **"Phase 2G before Phase 2H means shipping a new AI surface before there is an error
   sink or a dead-man switch."** *Held.* Unchanged from `PHASE_2G_DEFINITION.md` §18 and
   still correct while the deployment is owner-only.
5. **"BYOK should precede Phase 2G, because Phase 2G adds AI paths to retrofit."**
   *Rejected on measurement.* Phase 2G adds no new provider call site — the create verb
   routes through the existing `parseTaskCommand`, and capture routing through the existing
   extraction path. The retrofit surface is the same either way.

### 16.4 Recommended order

```
0.  Decision 1 (hosted signup posture) — HARD GATE, unchanged, and NOT satisfied by BYOK
1.  BYOK Security Definition                       ← this document, awaiting review
2.  Entity Graph Completion                        ← deterministic, independent, unblocked
3.  Phase 2G — Conversational Creation             ← owner-only, project key still fine
4.  BYOK implementation + G1–G5 guards             ← before any non-owner account exists
5.  Signup hardening — the full §13 "invited" column, incl. the three that do not exist
6.  Phase 2H — Deploy and Operate
7.  Open signup — gated on the §13 "public" column, not on a date
```

**One deliberate change from the owner's ordering:** Phase 2G moves *ahead* of BYOK
implementation rather than after it. Rationale: while the deployment is owner-only, the
project key serving the owner's own account is the *status quo*, not a new risk; Phase 2G
adds zero provider call sites; and doing BYOK immediately before signup hardening keeps the
security work adjacent to the event that makes it matter. If the owner prefers BYOK earlier
for peace of mind, that is a legitimate preference and costs only sequencing — but it
should be recorded as a preference, not as a dependency, because the repository does not
support calling it one.

---

## 17. Owner decisions

| # | Decision | Options | Recommendation | Impact | Reversibility | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Ultimate signup model | public / invited / owner-only | **Invited first, public only when §13's public column is met.** Public is the only irreversible item in this study | Sets the §13 target | **Public is irreversible** — a URL cannot be un-exposed | The §13 scope |
| 2 | Any OpenAI key, or only the user's own project keys | any / verified-own / any-with-terms | **Any, with terms** — the product cannot technically verify key ownership, so a "verified own" claim would be false | T-17 | reversible | Terms copy |
| 3 | Is BYOK mandatory for every account? | mandatory / optional-with-owner-key / tiered | **Mandatory for every account, including the owner's** (§5.2) — an owner exemption is a fallback branch, and a fallback branch is one predicate away from serving everyone | The no-fallback invariant | reversible | G1/G2 shape |
| 4 | What may users do before configuring a key? | nothing / deterministic-only / read-only | **Full deterministic product** (§10) — it is most of the product, and a locked shell teaches nothing about why a key is needed | Onboarding | reversible | §10 classification |
| 5 | May raw captures be stored before a key exists? | refuse / **store unprocessed** / store+blocked job | **Store, explicitly unprocessed, no job** (§10.1) | One `entries.status` migration | additive | Capture behaviour |
| 6 | May the owner's key ever serve another user? | never / emergency / dev-only | **Never.** No exception, no emergency branch | The invariant | — | Everything |
| 7 | May the owner's key still serve the **owner's own** account? | yes via env fallback / **no — owner configures like everyone** / dev-only | **No.** Same reasoning as 3 | Removes the last fallback branch | reversible | G1 allowlist contents |
| 8 | Should users see estimated AI cost? | hide / **show, labelled estimated** / show unlabelled | **Show, labelled "estimated", with a pointer to their own OpenAI dashboard** (§14) | Costs page copy | reversible | Costs copy |
| 9 | Per-user limits even though users pay? | none / advisory / enforcing | **Advisory for spend; enforcing for infrastructure** (jobs, rows, storage). A USD cap is no longer the owner's protection | Determines whether R10 returns (§14) | reversible | §13 quotas |
| 10 | Behaviour when the key fails or has no credits | retry / **declared terminal state** / silent degrade | **Declared, localized, terminal for configuration-class failures; retry only provider/infrastructure classes** | Job status vocabulary | reversible | Job semantics |
| 11 | Should an invalid key disable queued jobs immediately? | **yes — resolve at execution** / pin / cancel | **Yes** (§9.1) — it is the only option satisfying requirement 9 | Resolver contract | reversible | Rotation design |
| 12 | Acceptable security wording | absolute / **architecture-grounded** / minimal | **Architecture-grounded, and it must state that the backend can decrypt** (§11) | Settings, onboarding, privacy policy | reversible | Legal review |
| 13 | Deletion / retention promise | best-effort / **cascade + verified residue check** / hard guarantee | **Cascade with a verified residue assertion**, and honest about backup retention windows. Requires building account deletion, which does not exist | Requires new work (§1) | — | Any non-owner account |
| 14 | Which stage requires CAPTCHA, quotas, suspension | — | **Per §13's three columns.** Account deletion, admin suspension and terms are required before the *first invited user*, not before public | Rollout gating | — | Signup opening |

---

## 18. Adversarial review

Fourteen attacks. **Six changed the report**; the changes are applied above and marked.

### Attacks that changed the report

**1. "The service role can read every key, so user isolation is false."**
**Conceded — and it forced the report's central honesty.** The first draft implied per-user
isolation was a security boundary. It is not: the unattended drain requires the operator's
worker to decrypt arbitrary users' keys. §4.1 now states this **before** the storage
recommendation rather than after it, §11 forbids four specific claims and supplies replacement
copy, and §5.1 reframes isolation as a *function-signature* property — the strongest thing
actually available — rather than a privilege boundary.

**6. "Vault encryption is being confused with access isolation."**
**Conceded, same root.** Vault gives encryption at rest and nothing about who may ask for
plaintext; `vault.decrypted_secrets` is a decrypting view, and isolation would be entirely
code-enforced. This is now one of the three stated reasons §4.2 prefers C — and C is
recommended *despite* Vault already being enabled and in production use here, which was the
temptation the study was warned against.

**7. "Account deletion leaves an orphan secret."**
**Conceded, and it is worse than the attack assumed.** Under Vault it is structural —
`vault.secrets` is reached by no `auth.users` cascade. And the repository has **no account
deletion path at all** (§1), so there is nothing to attach a cleanup to. This became a
second reason for C (ordinary cascade) and Owner Decision 13, and it is now listed in §13
as required *before the first invited user*.

**8. "BYOK protects the owner's OpenAI budget but public signup still bankrupts Supabase."**
**Conceded — the sharpest strategic finding.** §13 now states plainly that BYOK addresses
**one of fourteen** controls, and §14 reclassifies the spend cap: the control that protects
the owner is no longer a USD ceiling but an infrastructure quota.

**9. "Users can submit stolen keys and the product becomes an abuse proxy."**
**Conceded, and it is a risk BYOK *creates*.** A validation endpoint is an oracle for
testing stolen OpenAI keys — a capability this product does not have today. Added as **T-16**
with per-user *and* per-IP limits plus a daily ceiling, and as a §13 row required before
invited users. Owner Decision 2 records that "only your own keys" cannot be verified and
must not be claimed.

**12. "The security copy promises more than the architecture guarantees."**
**Conceded.** §11 now pairs every permitted claim with the property and the test that backs
it, lists four forbidden claims, and supplies copy that says the backend can decrypt.

### Attacks answered without change

**2. "A worker can resolve the wrong user after a forged job payload."** The resolver takes
a job id and derives the owner from `jobs.user_id` — a forged id resolves *that job's real
owner*, and the worker then reloads the entry by `id` **and** `user_id`, so it holds a
credential it cannot aim at chosen data. Verified against `index.ts:52-72` and SECURITY.md:20.
G3 guards it.

**3. "The browser or an error response can recover the key."** No read path returns
plaintext; the resolver returns ciphertext to server code only; G4's branded `Secret` type
makes serialization a throw rather than a leak. The genuine residual is T-4: a live XSS
*during submission* captures the key in transit, which is unpreventable and is why CSP
hardening (`TODO.md:181`) is a §13 prerequisite.

**4. "Removing the key does not stop already queued work."** Only true under credential
pinning, which §9.1 rejects for exactly this reason. Resolve-at-execution plus the drain-skip
predicate (§10.2) makes removal immediate.

**5. "A project-key fallback remains in one overlooked path."** The inventory found the
project key in **two** read sites (§1.1) and thirteen call paths (§2), and the honest answer
is that an inventory is a snapshot — which is why the control is **G1**, an exact-set import
guard in both directions, not this table.

**10. "The usage ledger is not authoritative for the user's OpenAI bill."** Agreed, and it
was already the report's position (§14): estimate, labelled as such, with the user's own
dashboard named as authoritative.

**11. "A live validation call leaks the key into logs or tracing."** Real, and §8 step 7
addresses it: `maxRetries: 0`, provider errors mapped to a closed vocabulary and never
re-thrown raw, G4 covering the serialization boundary. There is no APM today (`H7`) — which
means adding one later must treat this as a scrubbing requirement, and that belongs in
Phase 2H's error-sink scope.

**13. "The proposal over-engineers a pre-MVP."** **Rejected, and this is where the study's
recommended ordering answers the attack.** BYOK is not built now — it is *designed* now and
*implemented before the first non-owner account*. Nothing is built for users who do not
exist. Building it earlier would be over-engineering; leaving it undesigned while
considering opening signup would be the opposite error.

**14. "The proposal cannot work in the current Edge Function and cron architecture."**
**Refuted by inspection, and it was the attack most worth running.** `process-jobs/index.ts:11`
already reads the key once and threads it as an **argument** through `dispatch.ts` to
`entry.ts` and `attachment.ts`; `jobs.user_id` is database-held and authoritative; the claim
RPCs are `service_role`-only; `crypto.subtle` AES-GCM exists in Deno; and `pg_cron` already
reads secrets and already treats a missing secret as a **safe no-op** (`202607170026:649`) —
fail-closed on a missing credential is a pattern this codebase has shipped. The one real
constraint is that `src/lib/ai` cannot be imported from Deno, so the credential adapter must
be hand-mirrored under the existing source-parity lock (§6).
