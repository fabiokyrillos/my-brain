# Phase 2J — Current Experience Audit

**Date:** 2026-08-08 · **Baseline:** `main` at `a02c74e` · **Hosted parity:** `202608070084`, 84 migrations, local = remote.

This audit answers one question for every item in the parent PRD's **Etapa 2 — Hoje,
captura e atenção**: *does the repository already do this?* Phase 2I's own audit was
wrong three times about what had already shipped, and that is the reason this document
exists in the shape it does. Every claim below cites the exact file, route, action, RPC
or constraint it was re-derived from. A claim that something must be built is only
admissible with such a citation.

## Classification vocabulary

Carried forward from Phase 2I's traceability contract, unchanged:

| Class | Meaning |
| --- | --- |
| **DELIVERED** | Ships today and satisfies the parent PRD item as written. |
| **BASELINE** | The behaviour exists; asserting it is not building it. A phase must not report it as work. |
| **RECOMPOSE** | Every underlying contract exists. The gap is composition, routing or naming — not schema, not a write path. |
| **MISSING** | No contract exists. Requires new product surface, and possibly new schema. |

---

## 1. The finding that reframes the phase

**`/app/today` is a redirect, and the cockpit lives at `/app`.**

[today/page.tsx](src/app/[locale]/app/today/page.tsx) is nine lines and its whole body is:

```
redirect(`/${locale}/app/work?view=today&page=${page}`);
```

The surface the parent PRD calls *Hoje* — capture at the top, attention, today's items,
waiting, pending questions, recent activity — is [home-dashboard.tsx](src/features/shell/home-dashboard.tsx),
rendered at the app root [app/page.tsx](src/app/[locale]/app/page.tsx). It already
composes four projections in parallel:

```
loadWorkProjection(supabase, { userId, locale, view: "today", page: 1 })
loadHomeSupplementalProjection(supabase, userId)
loadInboxProjection(supabase, { locale, page: 1 })
loadAttentionProjection(supabase, { locale, limit: NEEDS_ATTENTION_HOME_LIMIT })
```

with `NEEDS_ATTENTION_HOME_LIMIT = 3`, `TODAY_HOME_LIMIT = 5`, `RECENT_ACTIVITY_LIMIT = 4`,
and [home-view.tsx](src/features/shell/home-view.tsx) rendering five `<section>`s —
attention, today, waiting, question, recent — each with its own heading, hint and quiet
empty state.

**So the parent PRD's premise that Hoje must be built is wrong.** Most of Etapa 2's Slice
2.1 and 2.2 content is BASELINE. What is genuinely broken is that *the product has two
things called "today"* and the one a user navigates to is the weaker one. That is an IA
defect, not a construction project, and it is the single highest-value item in the phase.

---

## 2. Slice 2.1 — *Hoje: captura e prioridades*

| Parent PRD item | Class | Evidence |
| --- | --- | --- |
| captura no topo | **DELIVERED** | `HomeDashboard` renders `QuickCaptureForm` bound to `captureEntry` with `captureSource: "home"`. |
| até três prioridades do dia | **MISSING** | No priority concept exists. The nearest thing is `workProjection.items.slice(0, TODAY_HOME_LIMIT)` — a truncation to five, not a ranking, not a selection, not a cap of three. Grep for a priority column across `database.types.ts` returns nothing. |
| prazos e atrasos | **RECOMPOSE** | `work-projection.ts` already owns the `"today"` view definition and `HomeDashboard` formats `task.dueAt` via `Intl.DateTimeFormat` in the projection's timezone. **Overdue is not distinguished from due-today** in the Home view model — one label, one tone. The data is present; the distinction is not made. |
| acesso imediato ao plano diário | **MISSING** | No daily-plan surface exists. `/app/today` redirects into the Work list. |
| ausência de métricas decorativas | **BASELINE** | Home renders lists and one count (`waitingCount`), no metric tiles. The constraint is already honoured; a phase must not claim it as work. |

## 3. Slice 2.2 — *Hoje: contexto e encerramento*

| Parent PRD item | Class | Evidence |
| --- | --- | --- |
| `Aguardando retorno` | **DELIVERED** | `loadHomeSupplementalProjection` counts `tasks` where `status = 'waiting'`; rendered as its own Home section; `/app/waiting` is a full route. |
| `O Brain percebeu` | **MISSING** | No derived-observation concept exists anywhere — no table, no projection, no copy key. See §8: this audit recommends it stay missing. |
| perguntas e registros pendentes | **DELIVERED** | `loadHomeSupplementalProjection` returns `openQuestionPreview` from `pending_questions` filtered by `actionablePendingQuestionFilter()`; `/app/questions` is a full route; pending records reach Home through `loadInboxProjection` and the attention section. |
| encerramento do dia | **MISSING** | No end-of-day concept exists. |
| continuidade para revisão diária | **RECOMPOSE** | The review domain exists and is reachable — `/app/reviews` calls `generateReview` with `period` in `daily · weekly_review · weekly_plan · monthly` ([reviews/page.tsx](src/app/[locale]/app/reviews/page.tsx), [review-list.ts](src/features/reviews/review-list.ts)). **It is not reachable from Hoje**, and no review is offered in the context of ending a day. The contract exists; the continuity does not. |

## 4. Slice 2.3 — *Precisa de você*

**The queue already exists, and it is narrower than the parent PRD assumes.**

`list_needs_attention` is a `security definer` SQL function with `set search_path = ''`,
scoped by `auth.uid()`, keyset-paginated, and bounded `least(greatest(coalesce(p_limit, 21), 1), 200)`
— [202607180030](supabase/migrations/202607180030_phase_2x_needs_attention_projection.sql),
corrected by [202607180031](supabase/migrations/202607180031_fix_needs_attention_candidate_correlation.sql).
It is granted to `authenticated` and revoked from `public, anon`.

Its candidate set is **entry-scoped only**:

```
where e.user_id = u.id
  and e.status in ('awaiting_review', 'partially_processed', 'recoverable_error', 'terminal_error')
```

| Aspect | Class | Evidence |
| --- | --- | --- |
| reunir sugestões, ambiguidades, perguntas, falhas recuperáveis | **BASELINE (partially)** | Five reasons ship in `attentionReasons`: `review_interpretation`, `confirm_existing_candidates`, `answer_existing_question`, `retry_processing`, `resolve_consistency`. These cover task suggestions, ambiguity, questions and recoverable failure — all as *entry* states. |
| configuração pendente | **MISSING from the queue, by design** | `configure_ai_credential` is a sixth `AttentionReason` but is **deliberately excluded** from `trackedAttentionReasons`, and [contracts.ts:36-50](src/features/daily-cycle/contracts.ts) explains why: `needs_attention_item_opened` validates `attentionReason` against a **five-member enum inside the database** (`202607170024:205`). Widening the queue to carry it is a migration, not a mapper change. |
| conflitos de memória | **MISSING — and must not be invented** | No memory-conflict concept exists in the schema. The parent PRD lists it; the repository has never had it. |
| a dedicated surface | **MISSING** | There is no `/app/attention` route. Attention exists **only** as a three-item Home section plus `loadMoreNeedsAttention`. |
| filtros por tipo | **MISSING** | `loadAttentionProjection` takes `locale`, `cursor`, `limit` — no reason filter. |
| confirmar, editar, dispensar, adiar | **MISSING** | [attention-actions.ts](src/features/daily-cycle/attention-actions.ts) exports exactly one function, `loadMoreNeedsAttention`, and it only pages. Every item's `primaryAction` is a **link** — `href: /${locale}/app/inbox/${entryId}` — so today resolution always means leaving the surface. |
| ações em lote | **MISSING** | No bulk concept exists. |
| adiar / snooze | **MISSING, and it needs state** | Deferring an item means storing "not until T" somewhere. No such column exists on `entries`, and the queue is derived from `entries.status`. Snooze is the one attention feature that cannot be composed. |

**Composition verdict.** A unified attention surface should be a *rendering and an action
layer over `list_needs_attention`*, not a new table. The states that qualify are the five
already in `trackedAttentionReasons`; `configure_ai_credential` qualifies as a product
state but reaches the user through the Inbox and entry detail instead, and pulling it into
the queue costs a migration. Nothing else in the parent PRD's list has a deterministic
source in this schema.

## 5. Slice 2.4 — *Captura unificada*

| Path | Class | Evidence |
| --- | --- | --- |
| text capture | **DELIVERED, single authoritative write path** | [capture/actions.ts](src/features/capture/actions.ts) → `capture_entry_async` RPC, idempotency key required, `assertActiveAccount`, quota refusal, `after()` side effects, `CaptureReceipt`. `captureSource` is a closed enum: `home · capture_page · composer`. |
| attachment capture | **DELIVERED, but a separate contract** | `uploadAttachment` and `retryAttachmentJob` live in [agent/actions.ts](src/features/agent/actions.ts), surfaced at `/app/files`, backed by the `process_attachment` job type and a distinct file-analysis interpretation with its own `extracted_text`. |
| one surface for both | **RECOMPOSE** | Two mature contracts, two surfaces. The unification is a UI composition. |
| classification before capture | **DELIVERED (as an absence)** | `captureEntrySchema` takes `content`, `locale`, `source`. Nothing requires a type, project or person before saving. |

**The load-bearing constraint.** Phase 2I closed `T-2I-02` — *no second write path* — three
ways. Unified capture is precisely the feature most likely to break it, because "one
surface" reads as an invitation to write one unifying record. It must not. One surface,
two existing contracts, dispatched by modality.

## 6. Slice 2.5 — *Gravação de voz e transcrição revisável*

**This is the only genuinely greenfield item in Etapa 2.** A repository-wide search for
`transcri|mediarecorder|audio/webm|whisper` across `src/`, `supabase/` and the initiative
docs returns **zero hits in code** — the sole match is the parent PRD itself.

What that means concretely:

| Dependency | Current state |
| --- | --- |
| `AIProvider` | Four methods — `extractEntry`, `embedText`, `answerFromKnowledge`, `parseTaskCommand`. **None transcribe.** Adding voice adds a fifth capability to the portability interface. |
| model routing | `AIRoutes` has six slots — chat, extraction, review, file, background, embedding. **No audio slot.** `MODEL_PROFILES` covers three presets; none names an audio model. |
| `ai_usage_events.operation` | A closed `check` constraint, most recently re-declared in [202608070080:93](supabase/migrations/202608070080_phase_2h_error_sink_and_deadman.sql). Sixteen values. **No transcription operation.** It does carry `'other'` — see the migration analysis below. |
| BYOK | `user_ai_credentials.provider` is `check (provider in ('openai'))` — **one provider**, envelope-encrypted (AES-256-GCM), resolved through `resolveOwnCredential` / `openStoredCredential` in [byok/adapter.ts](src/lib/byok/adapter.ts), which is documented as the only path by which a key becomes usable. |
| storage | Attachments have a bucket and a lifecycle. **Audio has none, and this audit recommends it never gets one** — see the retention decision below. |

**The cost question resolves technically, not by owner decision.** The single provider this
product supports is OpenAI, whose API includes audio transcription. The user's existing
BYOK credential therefore already authorizes transcription: no project-paid AI, no
project-wide key, no new vendor commitment, no new secret, no new environment variable.
The BYOK envelope, the resolver and the failure vocabulary are reused unchanged.

**What does not resolve technically** is what the product does for a user with no valid
credential — see `OD-2J-2`.

**Browser reality that the implementation plan must respect** (to be re-verified by
measurement at the voice gate, not taken from this document):

- `MediaRecorder` is the only in-browser recording API in play; there is no repository
  abstraction over it today.
- Container/codec is **not uniform**: Chromium-family browsers emit `audio/webm` with
  Opus; Safari — including every browser on iOS — emits `audio/mp4`. A pipeline that
  assumes one container fails on half the target devices. The mobile-first PRD makes iOS
  Safari a primary target, not an edge case.
- The provider's transcription endpoint is a multipart upload with a per-request size
  ceiling, which is a **duration** ceiling in practice and must be enforced client-side
  before an upload, not discovered as a provider error.
- Microphone permission is a first-class state with its own denial path, and on iOS it is
  gated on a user gesture.

**Retention is already signed.** The owner's decision — record → transcribe → editable
draft → confirm → **original audio discarded**, no durable audio retention by default — is
recorded in Phase 2I's planning record. This audit's contribution is to name what makes
that decision *cheap*: if audio is never durable, voice needs **no storage bucket, no new
table, no retention sweep, no deletion-cascade entry, and no new class in the legal
retention document**. The draft lives in the client until the user confirms, and
confirmation goes through `captureEntry` — the write path that already exists.

## 7. Telemetry — the constraint that sets the migration budget

`product_events.event_name` is a **database `check` constraint**, most recently re-declared
in [202608070081:783](supabase/migrations/202608070081_phase_2h_rate_limiting.sql) with 27
allowed names, paired with `private.validate_product_event_properties`, which allow-lists
**properties per event**. The repository's stated convention is that Postgres cannot extend
a `case` arm in place, so each addition is a verbatim re-declaration of the whole function.

**Therefore: any new product event in Phase 2J costs a migration.** This is not a
preference. There is no application-side path that can record an event the constraint does
not name. Phase 2I spent zero migrations because it added no events — it reused
`needs_attention_viewed` and shipped search with no telemetry of its own.

## 8. *O Brain percebeu* — recommended for deferral

The parent PRD asks for derived observations on Hoje. The repository has no deterministic
source for one. Building it in Phase 2J would mean either:

- inventing an observation table and a rule engine with no product contract behind it; or
- making it model-generated — which introduces an **unbounded proactive-AI contract**
  billed to the user's own BYOK key, on a cadence nobody has specified, with no defined
  suppression, expiry or dismissal semantics.

The parent PRD's own principle is *"Silence is also a result."* A feed that must produce
something to justify its section is the opposite of that. **Recommendation: out of Phase
2J**, recorded as a named deferral rather than dropped silently.

## 9. Sensitivity — an open behaviour, not a decided one

`sensitivity text not null default 'normal' check (sensitivity in ('normal','private','highly_sensitive'))`
appears on `entries` ([202607160003:53](supabase/migrations/202607160003_intelligent_capture.sql)),
on two tables in [202607160006](supabase/migrations/202607160006_chat_memory.sql), and once
more in [202607160007:111](supabase/migrations/202607160007_agent_operations.sql), with
`agent_preferences.privacy_default` carrying the same vocabulary.

Phase 2I decided **OD-1 for search only**: `DEFAULT_SENSITIVITY = ["normal", "private"]`,
`highly_sensitive` excluded unless an explicit visible scope is on, and the default state
leaking neither existence nor count.

**Grepping `sensitivity` across `src/features/daily-cycle/`, `src/features/shell/` and
`src/features/tasks/` returns nothing.** Home, the attention queue and the Work views apply
no sensitivity predicate at all — and the attention projection renders a 240-character
`originalPreview` of `entries.original_content` directly.

This is a **pre-existing** condition, not a Phase 2J regression. But Phase 2J concentrates
attention onto one glanceable mobile surface, which is exactly the context where the
classification's implied promise matters most. Two surfaces of the same product would then
disagree about what `highly_sensitive` means. That is an owner expectation decision, not a
per-component choice — `OD-2J-1`.

## 10. Accessibility tooling — what exists for the Phase 2I residual

- `@playwright/test ^1.61.1` is a devDependency; `npm run test:e2e` runs desktop + mobile
  projects; `e2e/` holds 31 specs.
- **No axe dependency exists.** `grep 'axe' package.json` returns nothing. A browser-level
  automated scan requires adding `@axe-core/playwright` (or equivalent) as a devDependency.
- CI's `database` job already runs `e2e/foundation.spec.ts` against a production build on
  desktop and Pixel 7 — so a **local, non-online** accessibility lane can run in CI on
  every PR. The `online-*` specs are manual and must not be the home for this.

## 11. Migration analysis

Every candidate, with the reason it is or is not needed.

| # | Candidate | Verdict |
| --- | --- | --- |
| 1 | `product_events` event-name vocabulary + property validator, for Phase 2J's metrics | **REQUIRED.** A DB check constraint; no application path exists. |
| 2 | `ai_usage_events.operation` += a transcription value | **RECOMMENDED, avoidable.** `'other'` is an allowed value, so voice *can* ship without it. Logging an entire new AI capability as `'other'` defeats the per-operation cost attribution the ledger exists for, and would be invisible in `/app/costs`. Recorded as avoidable so the owner can refuse it. |
| 3 | Audio storage bucket / audio table | **NOT NEEDED.** The signed retention decision discards the original; nothing durable is created. |
| 4 | `agent_preferences` transcription-model column | **NOT NEEDED.** Pin the model as a routing constant. Per-user model choice for transcription is unrequested scope. |
| 5 | Attention snooze/defer state | **NOT NEEDED IF DEFERRED.** Snooze is the only attention action that cannot be composed. Recommendation: exclude snooze from Phase 2J and keep the surface at confirm/resolve/open. |
| 6 | Explicit user-selected daily priorities | **NOT NEEDED IF DETERMINISTIC.** Deriving priorities from existing due/overdue data costs nothing. User-pinned priorities need storage — an owner decision, `OD-2J-3`. |
| 7 | Widening `list_needs_attention` to carry `configure_ai_credential` | **NOT NEEDED.** The state already reaches the user via the Inbox and entry detail. Widening it also widens a DB-validated analytics enum. |
| 8 | New RLS policy, grant, secret or external service | **NONE.** Voice reuses the BYOK envelope and the existing capture write path. |

**Recommended budget: 2 migrations**, one per owning slice — telemetry and the usage
ledger. Item 2 is explicitly marked avoidable, so a `2 allocated · 1 spent` close is a
legitimate outcome and not a shortfall.

## 12. Summary

| Parent PRD Etapa 2 slice | Verdict |
| --- | --- |
| 2.1 Hoje: captura e prioridades | Mostly **BASELINE**; real gaps are overdue distinction, priorities, and the `/app/today` collision |
| 2.2 Hoje: contexto e encerramento | Waiting and questions **DELIVERED**; end-of-day **MISSING**; review continuity **RECOMPOSE**; *Brain percebeu* recommended **deferred** |
| 2.3 Precisa de você | Queue **BASELINE**; surface, filters and in-place actions **MISSING**; snooze needs state |
| 2.4 Captura unificada | Both contracts **DELIVERED**; unification is **RECOMPOSE** and must not create a write path |
| 2.5 Voz | **MISSING** — genuinely greenfield, and the only item that touches the AI provider interface |

The phase is smaller than the parent PRD implies everywhere except voice, where it is
larger — because voice is not a UI feature, it is a new provider capability.
