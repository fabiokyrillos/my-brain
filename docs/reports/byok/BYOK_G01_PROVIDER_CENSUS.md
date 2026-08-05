# BYOK G-0.1 — provider call-site census

**Pre-code gate G-0.1** of [`BYOK_IMPLEMENTATION_PLAN.md`](../../initiatives/byok/BYOK_IMPLEMENTATION_PLAN.md).
Every module that reaches an AI provider, and every place the project key is read.

**Re-measured 2026-08-01 against `main` at `961feeb`** — not inherited from the definition
study. `BYOK-GUARD-001`'s allowlist is derived from a *current* measurement, because a
stale inventory silently permits a path.

---

## 1. The headline: the project key is read in exactly two places

| # | Runtime | File:line | Expression |
| --- | --- | --- | --- |
| 1 | Node | `src/lib/ai/openai-provider.ts:59` | `options?.apiKey ?? process.env.OPENAI_API_KEY` |
| 2 | Deno | `supabase/functions/process-jobs/index.ts:11` | `Deno.env.get("OPENAI_API_KEY")` |

**Confirmed: the definition study's central claim holds against current `main`.** There
are two injection points and no others. A repository-wide search for `OPENAI_API_KEY`
across `src/`, `supabase/`, `scripts/`, `.github/` and `.env.example`, excluding tests,
returns these two reads and nothing else.

### And in both, the key is *already* a parameter downstream

This is what makes BYOK a credential-resolution change rather than a rewrite.

**Node.** `OpenAIProvider`'s constructor already accepts `options.apiKey` and only falls
back to the environment when it is absent (`openai-provider.ts:58-60`). BYOK-ADAPTER-001's
"required explicit credential" is therefore the removal of one `??` clause plus a
signature change — the parameter exists.

**Deno.** `index.ts:11` reads the key once and threads it explicitly:
`dispatch.ts:26,33,35,56,75` → `entry.ts:199,405,465,509` and `attachment.ts:63`. Every
consumer already takes `openaiKey` as an argument. Nothing below the entrypoint reads the
environment.

---

## 2. Node — every provider construction

`getAIProvider` (`src/lib/ai/index.ts:6-8`) is the only constructor call in the
application. Its current signature is `{ model?, embeddingModel? }` — **it does not accept
a credential**, which is precisely the gap BYOK.3 closes.

| # | Call site | Operation | Reached by |
| --- | --- | --- | --- |
| 1 | `src/features/agent/actions.ts:883` | `answerFromKnowledge` | Assistant composer |
| 2 | `src/features/chat/actions.ts:133` | `embedText` + `answerFromKnowledge` | Chat |
| 3 | `src/features/memories/actions.ts:118` | `embedText` | Memory creation |
| 4 | `src/features/operations/actions.ts:166` | `embedText` | `createRecord` |
| 5 | `src/features/task-commands/actions.ts:675` | chat completion | Task command console |

**Five call sites, one constructor.** All five are Server Actions on the authenticated
product; none is a script, a route handler or a worker. Two of the five
(`memories`, `operations`) use a dynamic `await import("@/lib/ai")`, which a naive static
allowlist keyed on top-level imports would miss — noted here because BYOK-GUARD-001's scan
must match both forms.

`src/features/profile/settings-payload.ts:64` contains the literal `aiProvider: "openai"`.
It is **not** a call site: it is a display string in the settings payload. Listed so a
future scan that flags it is not mistaken for a discovery.

---

## 3. Deno — every provider call

| # | File:line | Endpoint | Operation |
| --- | --- | --- | --- |
| 1 | `supabase/functions/process-jobs/entry.ts:240` | `/v1/responses` | Entry extraction |
| 2 | `supabase/functions/process-jobs/entry.ts:355` | `/v1/embeddings` | Entry embedding |
| 3 | `supabase/functions/process-jobs/attachment.ts:159` | `/v1/responses` | File analysis |

All three take the key as a function argument. **No `fetch` to `api.openai.com` anywhere
reads the environment directly**, which is what makes BYOK-ADAPTER-003's "delete the
process-wide read" a single-line change at the entrypoint plus per-job resolution above
it.

---

## 4. What the census means for the allowlist

`BYOK-GUARD-001` forbids a project-key read in any deployed user path. Derived from the
measurement above, the allowlist after BYOK.5 must contain **exactly**:

- nothing in `src/` — `openai-provider.ts:59`'s fallback is deleted, not allowlisted;
- nothing in `supabase/functions/` — `index.ts:11`'s process-wide read is deleted;
- and only such test or local-development paths as BYOK.5 enumerates explicitly.

**Two reads today, zero permitted after cutover.** The guard's job is to keep that at
zero, and it can only do so honestly if it matches dynamic imports as well as static ones
(§2) and if it is derived from a re-measurement rather than from this document ageing.

---

## 5. Current failure behaviour, for comparison after cutover

Recorded so BYOK.4's "explicit awaiting-AI-configuration status" can be compared against
what the product does now rather than against a memory of it.

- **Node:** `OpenAIProvider`'s constructor throws `"OPENAI_API_KEY is not configured"`.
  This is a raw `Error`, not a localized refusal, and it surfaces wherever the Server
  Action's own error handling puts it.
- **Deno:** the worker returns `503` with `{ error: "Server is not configured", code:
  "missing_openai_key" }` before claiming any job — so with no key, nothing is claimed and
  nothing is marked failed.

Neither is a per-user state. Both are process-level, which is exactly the assumption BYOK
replaces.
