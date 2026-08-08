# Phase 2I — Threat model

**Status:** PLANNING ONLY. **Date:** 2026-08-07.
Scope: the parent PRD's Etapa 0 + Etapa 1, as bounded by `PHASE_2I_PRD.md`.

---

## 0. The shape of this phase's risk, stated first

**Phase 2I's attack surface is unusually small, and that is a reason to do it
first rather than a reason to skip this document.**

| Class | Phase 2I |
| --- | --- |
| New write path | **none** — the phase adds no mutation |
| New AI/model call | **none** — no tokens spent, no prompt |
| New RLS policy | **none** |
| New grant | **none**, unless 2I.5 adds indexes — which change no privilege |
| New secret | **none** |
| New external service | **none** |
| New privileged boundary | **none** — no `service_role` surface, no admin route |
| Deletion / lifecycle change | **none** |
| Rate-limit change | **none** — no provider-reaching work |

**So the residual risk is concentrated in exactly two places**: search becoming a
way to learn about records you do not own (T-2I-01), and the palette becoming a
second way to write (T-2I-02). Everything else below is smaller.

A phase that adds no mutation and no model call still deserves a threat model,
because **search is the first surface in this product that queries seven tables
from one untrusted string.**

---

## 1. Threats

### T-2I-01 — Global search as an enumeration oracle · **HIGH**

**The threat.** A cross-domain search takes one user-supplied string and queries
seven tables. If ownership is applied *after* retrieval, or if a "no results"
response differs observably from a "not yours" response — by timing, by status
code, by wording, by a count — search becomes a way to learn whether a record
exists in someone else's account.

**Why it is the phase's principal threat.** Every other read surface in this
product is reached by navigating to something you own. Search is the first that
accepts an arbitrary string and returns across domains, so it is the first where
"the query matched nothing" and "the query matched something you may not see"
are distinguishable outcomes at all.

**Mitigations.**
- `2I-SEARCH-004` — ownership enforced **in the query**, under the authenticated
  client and forced RLS. Never a post-filter.
- `2I-SEARCH-005` — zero-result and not-owned are **indistinguishable**.
- **Proved in pgTAP with a second account.** An ownership test with one user in
  the database cannot fail for the reason it exists.
- Forced RLS on all seven tables is the structural backstop: even a badly
  written predicate cannot return another user's rows through the authenticated
  client.

**The way this goes wrong in practice** is not a missing `WHERE user_id` — RLS
covers that. It is a **`service_role` client introduced "for performance"** in
the search path, which bypasses RLS entirely and turns a correct predicate into
the only thing standing between accounts. The guard should assert that no search
code path constructs a service-role client.

**Residual.** Timing differences across domains are theoretically observable.
Accepted: the population is small and controlled, no public signup exists, and
the bounded result count limits the work per query.

### T-2I-02 — The command palette as a second write path · **HIGH**

**The threat.** A palette that "starts flows" is one refactor away from a generic
command executor: a map of strings to handlers, then a handler that takes
parameters, then a handler that writes. Phase 2F established **one write path**
with per-action authorization, audit and undo. A palette that writes directly
would be a second one, in the surface most likely to be reused everywhere.

**Why it is likely rather than hypothetical.** The generic version is *better
engineering* by every local measure — less duplication, easier to extend — which
is exactly why it gets built.

**Mitigations.**
- `2I-PALETTE-004` — task/create flows only through existing contracts, with
  their preview and confirmation.
- `2I-PALETTE-005` — **no generic command executor**; a closed, enumerated
  action set.
- `2I-PALETTE-005` also holds the input rule: **a string the user types is a
  query, never an instruction.** The standing "user content is data" rule at the
  UI layer.
- `2I-TRUST-008` — no component performs a write; components take handlers.
- A guard asserting neither the palette nor the component library constructs a
  Supabase write client.

**Residual.** None accepted; this is a hard boundary.

### T-2I-03 — Personal content leaking into telemetry · **MEDIUM-HIGH**

**The threat.** Search and the palette are the two surfaces where the *most
sensitive possible string* — what the user was looking for — passes through code
that is naturally instrumented. "Search performed: `<query>`" is the obvious
event and the wrong one.

**Mitigations.**
- `2I-METRIC-004` — the forbidden list is explicit: query content, entry text,
  task text, memory text, file names, prompt content, personal entity names.
- **Enforced by event shape, not by redaction.** Closed vocabularies and counts;
  **no free-text column to put a string in.** This is `error_events`' proven
  pattern — the privacy property is the absence of a place, not a careful
  writer.
- `2I-METRIC-006` — one telemetry path, the existing `record_product_event` RPC
  and its validator.

**Note.** A validator that rejects an unknown property is also what caught
ADR-084's silent producer. Reusing it means a badly-shaped new event fails
loudly rather than recording nothing.

### T-2I-04 — Search results rendering untrusted content · **MEDIUM**

**The threat.** Results render user content — and `attachments.extracted_text`
renders content extracted from a **document**, which the user may not have
written or read. A result list is a new place for that text to appear, and it
appears in fragments, next to other domains' fragments.

**Mitigations.** Content is rendered as **text, never as markup**, and never as
instructions to a model — Phase 2I makes no model call at all, so the
prompt-injection path does not exist in this phase. Snippets are length-bounded.

**Named for the future:** when a later phase feeds search results to a model
(the parent PRD's Etapa 3), this threat becomes prompt injection through
extracted document text, and the existing "sources enter the prompt as untrusted
data" rule must cover it explicitly.

### T-2I-05 — Sensitivity classes surfaced without a decision · **MEDIUM**

**The threat.** `entries`, `memories` and `attachments` carry
`sensitivity in ('normal','private','highly_sensitive')`. Global search would
surface all three by default. The user owns all of it, so this is not a
confidentiality breach — it is a **shoulder-surfing and expectation** issue: a
record the user marked `highly_sensitive` appearing in a result list on a phone
in public is a broken expectation the classification implies.

**Mitigation.** **OD-1**, raised to the owner at G-2I.5 and blocking 2I.5. Not
decided in planning. *A search feature that silently surfaces every class has
taken this decision by omission* — which is the actual threat here.

### T-2I-06 — The palette exposing unavailable actions · **LOW-MEDIUM**

**The threat.** An action listed but refused teaches the user the product is
unreliable; worse, an action listed for a state the account is not in (suspended,
deleting) leaks lifecycle state.

**Mitigation.** `2I-PALETTE-007` — an unavailable action is **absent**, and
absence is computed from the same predicate the surface uses, so the palette
cannot disagree with the product.

### T-2I-07 — Bounded results misread as complete · **LOW-MEDIUM**

**The threat.** A bounded result set that does not say it is bounded is a wrong
answer that looks complete — the user concludes the thing does not exist.

**Mitigation.** `2I-SEARCH-006` states the bound; `2I-SEARCH-007` labels partial
failure and names the failed domain.

### T-2I-08 — An unnecessary migration · **LOW impact, MEDIUM likelihood**

**The threat.** Spending the budget because it exists. A `tsvector` column plus
GIN indexes on seven tables is real, permanent schema surface with a maintenance
cost, added to answer a performance question nobody measured.

**Mitigation.** G-2I.2 measures **before** deciding and records the numbers;
`1 allocated · 0 spent` is an explicitly preferred close; every object in the
migration must be justified individually if it is spent.

### T-2I-09 — Accidentally satisfying ADR-055 · **LOW impact, governance**

**The threat.** Lexical search that grows ranking, then similarity, then
embeddings, quietly resolves a dated decision (**expires 2026-10-27**) that the
owner reserved.

**Mitigation.** `2I-SEARCH-010` — no embeddings, no vector retrieval, no
generated answers; `memories.embedding` and `entry_embeddings` untouched. The
slice must state at close that ADR-055 is neither satisfied nor superseded.

### T-2I-10 — Regression of delivered navigation · **LOW impact, MEDIUM likelihood**

**The threat.** A "convergence" slice removes a destination or breaks a saved
URL while reorganising `Mais`.

**Mitigation.** `2I-SHELL-004` — every existing route keeps working, asserted per
key from `capabilities.ts`.

---

## 2. What Phase 2I explicitly does not change

Recorded so a reviewer can check the claim rather than take it.

- **No new table, policy, grant, trigger or `SECURITY DEFINER` function** —
  unless 2I.5 spends its migration, and then only indexes and at most a search
  function, each justified individually.
- **No change** to account deletion, lifecycle, the deletion reaper, rate
  limiting, quotas, BYOK, the error sink, the dead-man switch, retention, or the
  cron catalog.
- **No change** to the signup rollout gate. Phase 2I does not touch it, and its
  close re-reads it (G-2I.6).
- **No Edge Function change**, so no deployment-parity exposure.
- **No secret**, no environment variable, no external service.

---

## 3. Verification map

| Threat | Verified by |
| --- | --- |
| T-2I-01 | pgTAP with a **second account**; a guard forbidding a service-role client in the search path |
| T-2I-02 | Guard: no write client in the palette or the component library; diff review for a generic executor |
| T-2I-03 | Event-shape review: no free-text column; the existing validator |
| T-2I-04 | Component tests rendering hostile strings as text |
| T-2I-05 | **Owner decision OD-1**, gate G-2I.5 |
| T-2I-06 | Journey test: an unavailable action is absent from the palette |
| T-2I-07 | Journey test: bound stated, partial failure named |
| T-2I-08 | G-2I.2's recorded measurement |
| T-2I-09 | Static assertion that no embedding column or vector RPC is referenced |
| T-2I-10 | Per-key route reachability assertion |
