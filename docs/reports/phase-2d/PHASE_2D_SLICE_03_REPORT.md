# Phase 2D — Slice 2D.3 Acceptance Report

## 1. Status

| Field | Value |
| --- | --- |
| Slice | Phase 2D Slice 2D.3 — Suggested Answers and Source/Effect Preview |
| Status | Implemented, gate-verified, and independently reviewed on a local branch |
| Date | 2026-07-23 |
| Repository | `D:\Projetos\GitHub\my-brain` |
| Branch | `codex/phase-2d-slice-3` |
| Base SHA | `400ce03` (`origin/main`, Slice 2D.2 merged via PR #12) |
| Last code commit | `95f709e` |
| Final HEAD | the `docs(phase-2d): report Slice 2D.3 acceptance` commit that adds this report (a report cannot record its own SHA) |
| Commits | `5acfd50` (db allowlist), `b1d8dca` (agent), `95f709e` (review fixes), plus this docs commit |
| Migration | `202607230049_phase_2d_question_suggestion_analytics.sql` — product-event allowlist only |
| Publication state | Not pushed, no PR, not merged, no application code deployed |
| Governing documents | `PHASE_2D_PRD.md` §13.3/§17/§18, `PHASE_2D_IMPLEMENTATION_PLAN.md` §6, ADR-033 decisions 1/2/4 |

Slices 2D.4–2D.6 remain unauthorized and unstarted. The `undo_operation`
SQLSTATE `40001` residual (`2C-UNDO-004`) remains a hard gate for Slice 2D.4 and
is untouched here.

## 2. Acceptance IDs covered

| Requirement | Where satisfied |
| --- | --- |
| `2D-SUGGEST-002` | `src/features/agent/question-suggestions.ts` (bounded, closed, deterministic, owner-context-derived, safe empty fallback, no AI/schema/worker change) |
| `2D-SUGGEST-003` | `forms.tsx` chips (fill, never submit) + server-side provenance authentication in `actions.ts` |
| `2D-SUGGEST-004` | `src/features/agent/question-preview-projection.ts` (`loadQuestionPreviews`) + `question-preview-panels.tsx` |
| `2D-SUGGEST-005` | `toQuestionEffectPreview` + the effect disclosure panel |
| `2D-PROVENANCE-002` | Bounded `origin: typed \| suggested` on the persisted-outcome `question_answered_basic` event |
| `2D-ANALYTICS-001/002` | Migration `202607230049` allowlist + `product-analytics/contracts.ts` |
| `2D-UX-002/003`, `2D-I18N-001`, `2D-A11Y-001/002/003` | Chips/panels copy, focus, live region, `aria-pressed`, ≥44 px targets, no horizontal overflow at Pixel 7 |
| `2D-OPERATIONS-001/003` | Append-only migration, proved parity, unchanged generated types, no extraction-schema or worker change |

## 3. Implemented suggestion taxonomy

The extraction contract (`src/lib/ai/extraction-schema.ts`,
`pendingQuestionSchema`) stores exactly `question`, `reason`, and `confidence`.
**There is no persisted question type in this repository**, and no
extraction-schema field was added (ADR-033 decision 4 forbids it as the
default). The taxonomy is therefore *discovered* from the question's own
interrogative shape, combined with the entry's own owned domain context:

| Kind | Recognized shape (PT-BR / EN) | Option source |
| --- | --- | --- |
| `yes_no` | question opens with a polar auxiliary — `é`, `foi`, `deve`, `devo`, `preciso`, `posso`, `há`, `está`, `vai`, `existe`, … / `is`, `are`, `was`, `should`, `do`, `does`, `did`, `can`, `will`, `must`, … | the closed `{yes, no}` answer set, localized |
| `person` | leading `quem` / `who` / `whom` (one optional leading preposition allowed) | `extracted_people[].name` of the question's own interpretation |
| `project` | leading `qual projeto` / `que projeto` / `which project` / `what project` | `extracted_projects[].name` |
| `organization` | leading `qual empresa\|organização\|cliente` / `which company\|organization\|client` | `extracted_organizations[].name` |
| `context` | leading `qual contexto` / `which context` / `onde` / `where` | `extracted_contexts[].name` |

### Deliberately excluded

**`which-date` / "quando" / "when" is not implemented.** The implementation
plan lists it only as an illustrative example (`e.g. yes-no, which-date,
which-person/project, which-context`). No datum in the current schema is a
*truthful answer* to a "when" question: a task candidate's `dueAt` is the AI's
proposed deadline for a task, not an answer to the ambiguity, and emitting
"hoje / amanhã / esta semana" would be fabrication rather than derivation. Per
`2D-SUGGEST-002` ("safe to omit when no truthful deterministic suggestion
exists") and the PRD §20 risk mitigation ("safe empty fallback"), these
questions show no chips. This is the documented candidate for the later,
separately authorized additive extraction-schema fallback.

## 4. Deterministic generation rules

`buildQuestionSuggestions` is pure: no network, no AI, no provider, no worker,
no database, no clock, no randomness, no mutation.

- **Classification is leading-interrogative only.** Every interrogative pattern
  is anchored at the start of the folded question (one optional leading
  preposition permitted). A relative pronoun deeper in the sentence therefore
  cannot hijack the classification — `"Foi você quem enviou o relatório?"`
  stays `yes_no` — and a question opening with unrelated prose classifies as
  nothing at all rather than being mined for a keyword. Folding is
  NFD-normalize → strip `\p{M}` → lowercase → collapse non-alphanumerics;
  accent-bearing Portuguese openers (`é`, `há`, `será`, `está`) are matched on
  the accented form so a leading `é` is never confused with the conjunction `e`.
- **Bounded count:** at most `QUESTION_SUGGESTION_MAX_OPTIONS = 6`.
- **Bounded length:** values over `QUESTION_SUGGESTION_MAX_VALUE_LENGTH = 160`
  are **dropped, not truncated** — a clipped entity name is an untruthful
  suggestion.
- **Deduplication:** on a whitespace-collapsed, case-folded comparison key,
  keeping the first spelling; ids are deduplicated independently.
- **Empty values removed:** empty/whitespace-only values never produce a chip.
- **Untrusted content stays data:** values containing `<`/`>` or any control
  character are dropped; everything surviving is rendered through normal React
  text escaping. Question text is classified as data and never reaches a model.
- **Stable ids from semantics, not position:** `yes_no:yes`, `yes_no:no`, and
  `<kind>:<slug(value)>` (NFD-folded, hyphenated, ≤48 chars). Ids are therefore
  locale-independent even though `yes_no` values and labels localize
  (`Sim`/`Não` vs `Yes`/`No`), so a Portuguese user never persists an English
  answer and the server can still match the id.
- **Deterministic ordering:** the immutable interpretation row's own array
  order, preserved through dedupe.
- **Closed shape:** `{ id, value, label, kind }` — no metadata, no confidence,
  no free-form payload.

## 5. Safe empty fallback

`buildQuestionSuggestions` returns `[]` — and the UI renders no chip group at
all, keeping the ordinary free-text flow — when:

1. the question matches no supported shape (`quando`, `por que`, `quanto`,
   `how much`, `why`, plain prose, empty input); **or**
2. the supported kind's owned context list is empty (a `quem` question on an
   entry with no extracted people yields nothing — it never degrades to
   `yes/no`); **or**
3. every candidate value is empty, oversized, or markup-bearing; **or**
4. the interpretation's entity JSON is malformed (tolerantly parsed, falls back
   to nothing).

Values are never fabricated to guarantee that every question has a suggestion.

## 6. Suggestion provenance

**No new resolution RPC version was introduced, and the closed database write
shape is unchanged.** ADR-033 decision 2 and implementation plan §7 explicitly
allocate `resolve_pending_question_v3` to **Slice 2D.4's consequence**; the plan
allocates no RPC version to 2D.3 and instead specifies an `origin: suggested`
flag "consumed by 2D.1's contract (additive, backward-compatible)". The
narrowest representation satisfying that is:

- `question-resolution-contract.ts` gains `questionAnswerOrigins`
  (`["typed", "suggested"]`) and `parseSubmittedSuggestionId`, a bounded
  `^[a-z_]+:[a-z0-9-]+$`, ≤64-char parser. **`questionResolutionCommandSchema`
  is unchanged and still rejects `suggestionId`/`origin` as unknown keys.**
- `serializeQuestionResolution` is unchanged: `p_resolution` remains exactly
  `{ kind: "answer", answer }`, so `resolve_pending_question_v2` is called
  byte-for-byte as in Slice 2D.2, and `_v1`/`_v2` stay callable, replay-safe,
  undo-safe, and namespace-isolated.
- The browser may submit only a bounded suggestion **id**. The Server Action
  re-derives the deterministic options server-side via `loadQuestionSuggestions`
  (owner-scoped) and requires the id to have been **presented for that
  question** *and* its canonical value to equal the **submitted answer**.
- Failure modes **downgrade to `typed`, never reject**: a forged id, an id for
  another owner's question, a stale id, or an answer edited away from the chip
  all record `typed`. A UI hint must never fail a resolution, and a client can
  never forge attribution.
- A malformed/oversized id is rejected by the parser before any database read,
  so a forged id cannot even cause a query.
- The authenticated result is recorded as the bounded `origin` enum on the
  **persisted-outcome** `question_answered_basic` event — emitted only after the
  RPC actually persisted, and only when the operation was not a replay.

**Known limitation (accepted, documented):** the product-event ledger is
fail-open by design, so provenance is best-effort evidence rather than a
transactional guarantee. This is the granularity PRD §18 explicitly sanctions
("`none` (or a bounded `origin: typed|suggested` if approved)"). Recording it
transactionally would require widening the closed `p_resolution` shape, which
the approved documents reserve for Slice 2D.4. Deferred, not silently dropped.

## 7. Source projection

`src/features/agent/question-preview-projection.ts` is `server-only` and issues
exactly three owner-scoped `SELECT`s (`pending_questions`, `entries`,
`entry_interpretations`), each with an explicit `.eq("user_id", userId)` on top
of RLS. No `SECURITY DEFINER` RPC was added — the approved design needs no
database-owned read boundary here.

It verifies: authenticated user, question ownership, entry ownership,
interpretation ownership, that the question belongs to that interpretation, and
that the interpretation genuinely belongs to that entry. Anything failing is
silently absent from the returned map, so a cross-owner question is
indistinguishable from a missing one.

The closed DTO contains only: `questionId`, `entryId`, `question`, `reason`,
`candidateIndex`, `entryExcerpt` (whitespace-collapsed, ≤280 chars),
`entryExcerptTruncated`, `entryCreatedAt`, `entryOccurredAt`,
`interpretationVersion`, `interpretationCreatedAt`, `interpretationSummary`
(≤280 chars), and `isCurrent`.

Not exposed: raw rows, raw interpretation JSON, `raw_output`, embeddings,
provider responses, operation keys, audit internals, `user_id`,
`interpretation_id`, entity confidence/evidence, or any other owner's data. A
regression test asserts the serialized DTO contains none of these tokens. All
projected text is untrusted display data rendered through normal React escaping.

## 8. Effect-preview behavior

`toQuestionEffectPreview(isCurrent, locale)` is pure and deterministic, with
the closed shape
`{ kind: "none" | "reinterpret"; title; description; notice; willMutate: false }`.

| Question state | `kind` | Meaning |
| --- | --- | --- |
| interpretation is still the entry's current one | `reinterpret` | "If a reinterpretation is confirmed later, this record could be re-interpreted using your answer. That confirmation does not exist yet: answering now only records the answer." |
| interpretation superseded (stale) | `none` | "This question's interpretation is no longer the current one, so no consequence could be applied." |

Both variants always render the notice **"Nada foi aplicado ainda. Esta é
apenas uma previsão." / "Nothing has been applied yet. This is only a
prediction."** Reinterpretation is *described*, never selectable or
confirmable; no consequence field, no consequence enum in any command, and no
2D.4 contract is anticipated.

## 9. Proof of non-mutation

- **Static:** `question-suggestions.ts`, `question-preview-projection.ts`, and
  `question-preview-panels.tsx` contain no `.insert(`, `.update(`, `.upsert(`,
  `.delete(`, or `.rpc(` call. A branch-wide scan confirms no
  `resolve_pending_question_v3`, `enqueue_entry_reprocessing`,
  `correct_entry_interpretation`, or `undo_operation(` call was added.
- **Unit:** the projection test asserts the RPC channel is never used, that only
  the three expected tables are read, that every read is owner-scoped, and that
  no mutating method exists on the query stubs.
- **Component:** opening a disclosure produces no action dispatch; picking a
  chip produces no action dispatch and no undo control.
- **Remote (authenticated, linked project):** a per-owner evidence footprint
  (`audit_logs`, `undo_operations`, `jobs`, `entry_interpretations`, `tasks`,
  `product_events`) is captured before and after the full preview path and
  asserted **byte-identical**; the `pending_questions` row is re-read and
  asserted still `open` with null `answer`/`answered_at`/`snoozed_until`; the
  immutable interpretation (`pending_questions`, `extracted_people`,
  `extracted_projects`) is asserted byte-identical across the whole cycle.
- **E2E:** after picking chips and opening both panels, the page is reloaded and
  the question is still listed as actionable.

## 10. Server changes

| File | Change |
| --- | --- |
| `src/features/agent/question-suggestions.ts` (new) | Pure deterministic generator + `findPresentedSuggestion` provenance matcher |
| `src/features/agent/question-preview-projection.ts` (new) | `server-only` owner-scoped projection, `toQuestionEffectPreview`, `loadQuestionSuggestions` |
| `src/features/agent/question-resolution-contract.ts` | Adds `questionAnswerOrigins` and `parseSubmittedSuggestionId`; **command schema and serializer unchanged** |
| `src/features/agent/actions.ts` | `resolvePendingQuestion` authenticates provenance server-side and sets the bounded `origin` on the persisted-outcome event; RPC call unchanged |
| `src/features/product-analytics/contracts.ts` | Adds `question_effect_previewed`, the `questions` surface, and the `origin` property |
| `src/features/product-analytics/interaction-events.tsx` | Adds `TrackedQuestionPreview` (session-deduplicated, fail-open) |
| `scripts/remote-question-preview-smoke.mjs` (new) | Fail-closed authenticated remote smoke (`npm run test:remote:2d:preview`) |

## 11. UI changes

- `forms.tsx` — `QuestionAnswerForm` accepts `suggestions`; renders a labelled
  chip group with `aria-pressed`, a hint, a polite live region announcing
  selection, and a hidden bounded `suggestionId`. Picking a chip fills the
  controlled answer field and moves focus to it; editing away from the chip
  clears provenance deterministically (trim-normalized, matching the server's
  comparison); picking another chip replaces it; a successful undo clears it.
  The existing defer/dismiss/not-relevant controls are untouched.
- `question-preview-panels.tsx` (new) — two collapsed `<details>` disclosures
  (source, predicted effect) over the bounded DTOs, both read-only.
- `questions/page.tsx` — one owner-scoped batch load, passed as props. The load
  is wrapped so a transient projection failure degrades to no chips/panels
  instead of breaking answering (see §16).
- `agent.css` — appended chip and panel styles; ≥44 px targets, `overflow-wrap:
  anywhere`, single-column chips below 600 px.

## 12. Analytics

| Event | Properties | Emission |
| --- | --- | --- |
| `question_answered_basic` (existing) | `origin: "typed" \| "suggested"` — optional in the database for rollback safety, always sent by the new server code | Server, after the RPC persisted, only when not a replay, keyed by the operation key, fail-open |
| `question_effect_previewed` (new) | none | Client, on a confirmed disclosure open, session-deduplicated per question (both panels share one key), fail-open |
| `question_resolved` (2D.2) | unchanged bounded `kind` | unchanged |

No event carries question text, answer text, reason, suggestion id, suggestion
value, suggestion label, entry content, entity names, or any free text — asserted
in the contract tests and against persisted rows in the remote smoke. A new
`questions` product surface was added so the pending-questions page is attributed
truthfully rather than folded into an unrelated surface. Analytics failure never
blocks suggestions, previews, answers, or dispositions.

## 13. Security and privacy

- Every projection read is owner-scoped by explicit predicate **and** RLS;
  cross-owner and anonymous reads are denied and non-disclosing (proved
  remotely, including a forged `user_id` filter).
- The browser submits only bounded identifiers; no arbitrary object crosses into
  domain authority. Client-supplied suggestion labels and values are never
  trusted — only a bounded id, validated against server-regenerated options.
- The closed `p_resolution` payload still rejects a smuggled `origin` or
  `suggestionId` key with `22023` (proved remotely).
- Question, reason, entry, summary, and suggestion text remain untrusted data:
  classified by shape, rendered as React text, never treated as instructions,
  never sent to a model, never placed in analytics.
- No new secret, cron, queue, Edge Function, worker, provider, or extraction
  schema. RLS, grants, and `search_path` discipline are unchanged; the migration
  reproduces the existing `SECURITY DEFINER`/`SECURITY INVOKER` bodies with
  `set search_path = ''` and re-applies the same revokes.
- Failures map to the existing stable localized application codes; no raw
  database or internal error is surfaced.

## 14. Verification

| Gate | Result |
| --- | --- |
| ESLint | 0 errors, 0 warnings |
| TypeScript (`tsc --noEmit`) | 0 errors |
| Vitest | **854/854 passed across 91 files** (62 new cases) |
| Production build | Green |
| Linked migration parity | Local = remote = applied through `202607230049` |
| Linked DB lint (`--level error`) | Clean |
| Linked DB lint (`--level warning`) | Only the pre-existing `public.run_user_heartbeat` note |
| Generated types | Re-generated from the linked schema and **content-identical**; `database.types.ts` is unmodified by this branch |

New test coverage: 27 suggestion-taxonomy/determinism/bounds cases, 20
projection/effect-preview cases, 15 component cases, 7 provenance-contract
cases, 7 Server-Action provenance cases, 2 analytics-contract cases.

## 15. Remote evidence

`npm run test:remote:2d:preview` — **passed, 10 case groups**, fixture prefix
`phase-2d-preview-1784855663442-b1e1ce83`:

1. owner reads the bounded source projection, with provenance consistency;
2. cross-owner reads (question, entry, interpretation, forged `user_id` filter)
   are empty and indistinguishable from a missing row;
3. anonymous reads denied;
4. owned suggestion context byte-stable across identical reads;
5. **the whole preview path wrote nothing** (per-owner footprint identical);
6. `question_effect_previewed` accepted only property-free from the `questions`
   surface; unallowlisted surfaces and any property rejected `22023`;
7. `question_answered_basic` accepts only `origin ∈ {typed, suggested}`, still
   accepts the pre-cutover `{}` payload, rejects extra keys and out-of-enum
   values; persisted rows contain no suggestion/question content;
8. a suggestion-originated answer resolves, replays idempotently, rejects an
   operation-key mismatch (`P0001`/`2D_IDEMPOTENCY_MISMATCH`), audits without
   recording a suggestion id, and undoes to exact prior state;
9. typed answers, `resolve_pending_question_v1`, and all three 2D.2
   dispositions still work; the closed payload rejects smuggled provenance keys;
10. the immutable interpretation is byte-identical.

Regressions re-run green: `test:remote:2d:resolution` (28 cases),
`test:remote:product-events` (19-event taxonomy, 9 controls).

Cleanup is fail-closed and verified on every run: disposable users deleted,
zero prefixed users/entries remaining, pre-existing Auth users and all table
counts byte-identical before and after. No shared queue data was claimed or
mutated; no application code was deployed.

## 16. Independent review

Full-branch-diff review against the Slice 2D.3 checklist. Two findings, both
**fixed on this branch**:

- **Important — availability regression.** `loadQuestionPreviews` used
  `requireSupabaseData`, which throws. A transient failure of this *purely
  additive* read would have broken the entire questions page, removing the
  ability to answer, defer, dismiss, or mark not relevant. Fixed: the page now
  degrades to no chips/panels while every pre-existing control keeps working.
  Provenance is authenticated independently in the Server Action, so a missing
  preview cannot weaken that check.
- **Important — source robustness.** The accent-folding regex embedded raw
  U+0300–U+036F combining marks in a character class: functionally correct but
  unreadable, tripping binary-content heuristics and fragile under re-encoding.
  Fixed by using the `\p{M}` Unicode property escape.

Verified clean: deterministic-suggestion truthfulness (no fabricated values,
no date guessing), bounded/closed shape, safe empty fallback, no AI/extraction/
worker/provider/Edge-Function change, provenance authenticity and
forged-provenance protection, source ownership and minimization, no raw-row or
raw-JSON leakage, prompt-injection/data boundary, preview non-mutation, no
enqueue or reinterpretation, analytics privacy, answer/disposition backward
compatibility, PT-BR/English localization, accessibility, desktop/mobile
usability, and **absence of any Slice 2D.4 work** (no `_v3`, no consequence
field, no `40001` change).

## 17. Playwright

| Journey | desktop | Pixel 7 |
| --- | --- | --- |
| Deterministic suggestions + read-only previews, non-mutating (PT-BR) | ✅ | ✅ |
| English suggestion and preview chrome | ✅ | ✅ |
| Safe empty fallback keeps the plain typed flow (PT-BR) | ✅ | ✅ |
| 2D.1 answer / undo / stale (regression) | ✅ | ✅ |
| 2D.2 defer / dismiss / not-relevant (regression) | ✅ | ✅ |
| 2D.2 English disposition copy (regression) | ✅ | ✅ |
| 2D.1 English resolution copy (regression) | ✅ | ✅ |
| Needs-attention open-question surfacing (regression) | ✅ | ✅ |

The 2D.3 journeys assert: bounded chip count, ≥44×44 px targets on mobile,
keyboard operation (`Enter` on a focused chip), `aria-pressed` selected state,
focus landing on the still-editable answer field, no auto-submit, deterministic
provenance clearing on edit and replacement on re-pick, both disclosures opening
read-only with the "nothing applied yet" notice, **no horizontal overflow**,
survival of a reload (nothing was resolved), continued availability of every
disposition control, and a suggestion-originated answer resolving normally.

Full online suite: **46 passed, 2 failed, 2 skipped, 18 not run.**

## 18. Known gaps and non-blocking notes

- **Pre-existing `Criar N tarefas` failure (non-blocking).** `e2e/intelligent-capture.spec.ts:281`
  fails on desktop and Pixel 7. **Verified to fail identically on `main` at
  `400ce03`** — same file, same line, same locator, both projects — by checking
  out `main` and re-running the single test. The candidate-confirmation surface
  it exercises (`src/features/tasks/*`, the interpretation review page) is
  untouched by this branch. The 18 "did not run" tests are downstream of it in
  the same serial describe. This is not a Slice 2D.3 regression.
- **`public.run_user_heartbeat` DB-lint warning** — pre-existing, unrelated,
  unchanged.
- **pgTAP** remains Docker-gated on this machine (Docker Desktop unavailable),
  as throughout Phase 2. The database contract change here is an allowlist
  change with no new function signature; equivalent authenticated linked remote
  behavior is proved in §15, including accept/reject matrices for every new and
  changed allowlist entry.

## 19. Assumptions

1. **No RPC version belongs to Slice 2D.3.** ADR-033 decision 2 and plan §7
   assign `_v3` to 2D.4's consequence and assign no version to 2D.3; plan §6
   routes the `origin` flag through the contract rather than the write shape.
   Provenance therefore lands on the persisted-outcome analytics event, the
   granularity PRD §18 explicitly sanctions.
2. **A forged/mismatched suggestion id downgrades rather than rejects.** The
   approved documents do not specify; downgrading keeps a UI hint from ever
   failing a resolution while making forged attribution impossible.
3. **`reinterpret` is the truthful predicted effect for a current question.**
   PRD §11.3/§12.3 name reinterpretation as the consequence a resolution may
   later carry; a stale question can carry none, so it previews `none`.
4. **Suggestions come from the entry's own interpretation candidates**, not the
   user's global entity catalogue: an unrelated project name is not a truthful
   answer to *this* entry's ambiguity, and reading the global catalogue would
   widen the read surface without improving truth.

## 20. Deferred follow-ups

- Date/"quando" suggestions, if ever justified, via the separately authorized
  additive extraction-schema fallback (§3).
- Transactional (non-fail-open) suggestion provenance, if Slice 2D.4's `_v3`
  write-shape change makes it free to carry.
- Retiring the legacy `answerPendingQuestion` wrapper and
  `resolve_pending_question_v1` — still explicitly out of scope.

## 21. Verdict

**READY WITH NON-BLOCKING NOTES.**

Slice 2D.3 is implemented, gate-verified, remotely proved, independently
reviewed, and documented. Every Critical and Important finding is fixed. The
only outstanding failure is the pre-existing `Criar N tarefas` e2e assertion,
demonstrated to fail identically on `main` in files this branch does not touch.
The branch is local only: not pushed, no PR, not merged, nothing deployed, and
Slice 2D.4 has not been started.
