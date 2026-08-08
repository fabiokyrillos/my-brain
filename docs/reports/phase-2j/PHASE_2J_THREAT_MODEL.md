# Phase 2J — Threat Model

**Status:** planning. Mitigations are commitments for implementation, not claims about
shipped code. Nothing here is closed.

Scope: the fifteen threats the owner named, plus one this audit added (`T-2J-16`). Each
mitigation is repository-specific — it names the file, contract, constraint or guard that
would carry it. A mitigation that could be written for any codebase is not a mitigation.

Inherited and still binding: **`T-2I-01`** (search returns only the caller's rows, proved in
pgTAP with two accounts in both directions) and **`T-2I-02`** (no second write path).
Phase 2J's most dangerous slice is precisely the one that stresses `T-2I-02`.

---

## T-2J-01 — The unified attention surface leaks hidden or private state

**Risk.** *Precisa de você* aggregates from several places. An aggregate is the classic
place where a per-surface filter is forgotten and something the user had classified appears
in a glanceable list.

**Repository specifics.** `list_needs_attention` is `security definer` with
`set search_path = ''`, scoped by `auth.uid()`, granted to `authenticated` and revoked from
`public, anon`. Ownership is therefore sound. **Sensitivity is a different question and is
currently unanswered**: grepping `sensitivity` across `daily-cycle/`, `shell/` and `tasks/`
returns nothing, and the projection renders a 240-character `originalPreview` of
`entries.original_content`.

**Mitigation.** `2J-ATTN-002` admits only states already stored and deterministic.
`2J-PRIVACY-001`/`005` put one decision over every surface including the preview.
`2J-ATTN-005` forbids a second query shape that could diverge from the RPC's scope.
**Blocked on OD-2J-1** — this threat cannot be closed before that decision.

## T-2J-02 — Capture accidentally creates a second write path

**Risk.** "One capture surface" reads as an invitation to write one unifying record.

**Repository specifics.** `captureEntry` → `capture_entry_async` is the sole entry-write
path; `uploadAttachment` → `process_attachment` is the sole attachment path. They have
different idempotency semantics, different job types and different interpretations.

**Mitigation.** `2J-CAPTURE-002`/`003` keep both contracts unchanged. `2J-CAPTURE-004` adds
a structural guard in the `T-2I-02` shape, and **G-2J.3 requires the guard to fail against a
planted second path before the surface is written** — a guard authored after the code is
a guard shaped to pass.

## T-2J-03 — Voice audio is retained accidentally

**Risk.** A signed "discard the original" decision is undone by an implementation detail —
a debug log, a cache, an upload buffer that outlives its request.

**Mitigation.** `2J-VOICE-013` forbids durable audio, and the proof is an **absence
re-derived from the schema every run**, in the shape Phase 2I used to prove zero
pin/favourite columns exist: the guard reads `database.types.ts` and the storage
configuration, so a future migration that adds an audio bucket or column **breaks the
guard** instead of silently invalidating the claim. Because nothing durable is created,
there is also no new retention class, no new sweep and no new deletion-cascade entry — the
cheapest possible posture, and the reason to keep it.

## T-2J-04 — Temporary audio survives cancellation or failure

**Risk.** The user cancels; the blob stays in memory, in an object URL, or mid-flight to
the provider.

**Mitigation.** `2J-VOICE-008` requires cancellation to discard immediately and provably.
`2J-VOICE-011` preserves the *text draft* on failure — deliberately narrow, because
preserving the draft must not be read as preserving the audio. An in-flight request must be
abortable, and abortion must not leave a retained reference.

## T-2J-05 — The transcription provider retains the audio

**Risk.** Discarding locally is meaningless if the provider keeps a copy.

**Mitigation.** `2J-VOICE-002` sends audio under the **user's own credential**, which is the
strongest available answer: the retention relationship is between the user and their own
provider account, exactly as it already is for extraction, chat and embeddings — the
analysis the legal packet's §4.2 records for BYOK. The implementation must **name the actual
provider retention behaviour** in the slice acceptance document rather than describing it as
"Whisper-compatible", and must surface it to the user before the first recording.

## T-2J-06 — Transcription prompt or data leakage

**Risk.** Audio content, or the transcript, reaches a log, an error message or telemetry.

**Mitigation.** The BYOK failure vocabulary is already closed —
`invalid_key · insufficient_quota · rate_limited · revoked · unknown` — and
`byok/validation.ts` documents that the provider's error object never escapes and is never
pattern-matched. Transcription reuses that discipline. `2J-METRICS-006` forbids transcript
content in telemetry, enforced by the per-event property allow-list in
`private.validate_product_event_properties` — a database property, not a review habit.

## T-2J-07 — Project-paid AI introduced without owner or user awareness

**Risk.** Voice quietly becomes the first feature the project pays for.

**Repository specifics.** `user_ai_credentials.provider` is `check (provider in ('openai'))`
— a single provider whose API includes transcription. There is a project-key guard
(`src/lib/byok/project-key-guard.test.ts`) asserting no project key is reachable on any
deployed path.

**Mitigation.** `2J-VOICE-002` binds transcription to the user's credential. The existing
project-key guard already fails if a project key becomes reachable; the slice must confirm
it covers the new call site rather than assuming it does. **No new secret, no new
environment variable, no new vendor.**

## T-2J-08 — Duplicate capture on retry

**Risk.** A voice capture confirmed twice — a double-tap, a retried request — creates two
entries.

**Mitigation.** `2J-CAPTURE-006` preserves the existing idempotency-key contract for every
modality. `capture_entry_async` already returns `replayed`, and the receipt already
distinguishes `capture_replayed` from `capture_saved`. Voice inherits both; it does not get
its own retry semantics.

## T-2J-09 — The transcript is interpreted before confirmation

**Risk.** The transcript is treated as a captured entry and enters interpretation before the
user has read it — the exact failure the reviewable-draft flow exists to prevent.

**Mitigation.** `2J-VOICE-015` and `2J-VOICE-001`. The draft lives client-side; nothing is
enqueued until `captureEntry` is called, and `captureEntry` is called only on explicit
confirmation. This is also why voice needs no new job type: interpretation begins where it
already begins.

## T-2J-10 — *O Brain percebeu* becomes unbounded proactive AI

**Risk.** A section that must produce something becomes a generated feed on a cadence
nobody specified, billed to the user's key.

**Mitigation.** **Removed from scope.** The audit found no deterministic source, and the
parent PRD's own principle is *"Silence is also a result."* Recorded as a named deferral
(`2J-CLOSE-004`) with the contract it would need — creation rule, determinism, source
requirement, confidence, cost, frequency, suppression, dismissal, expiry — so a future phase
must satisfy it rather than rediscover it.

## T-2J-11 — Today surfaces `highly_sensitive` content unexpectedly

**Risk.** A phone on a table shows a `highly_sensitive` preview in the attention list.

**Repository specifics.** Phase 2I decided this for **search only**: `DEFAULT_SENSITIVITY =
["normal", "private"]`, with neither existence nor count leaked. Hoje and attention apply no
predicate at all today.

**Mitigation.** `2J-PRIVACY-001`–`005`. One decision, expressed as data, asserted by guard,
covering the preview as well as the record. **Blocked on OD-2J-1.** Note that this is
pre-existing behaviour: the phase does not introduce the exposure, it concentrates it — and
concentrating it is what makes deciding unavoidable.

## T-2J-12 — Attention urgency becomes an engagement dark pattern

**Risk.** Badges, counts and "urgent" styling manufacture pressure rather than reflect state.

**Mitigation.** `2J-HOJE-008` forbids decorative metrics — a count appears only where a
count is the action's subject. `2J-HOJE-006` forbids padding the priority list. `2J-ATTN-006`
requires deterministic, stable ordering, so nothing is surfaced because it is "engaging".
Every attention reason must trace to a stored state the user created.

## T-2J-13 — Personal content enters telemetry

**Mitigation.** `2J-METRICS-006` enumerates the forbidden classes, and the enforcement is
`private.validate_product_event_properties`' per-event allow-list — a write with an unknown
key fails in the database. `2J-METRICS-002` and `004` specify **buckets**, not durations, so
a timestamp cannot become a behavioural fingerprint. `2J-METRICS-007` requires a consumer
for every producer, so a dead event cannot accumulate unread data.

## T-2J-14 — Mobile lock-screen and shoulder-surfing exposure

**Risk.** Hoje is the first screen; notification previews and a glanceable attention list are
the most exposed surfaces the product has.

**Mitigation.** `2J-PRIVACY-001` explicitly names **notifications** and **capture receipts**
as governed by the same decision as the surfaces — a receipt that echoes captured content is
the same exposure by a different name. This is a genuine limit of the mitigation: the
product cannot control an OS notification preview beyond what it puts in the payload, and
the slice must state that limit rather than imply protection it does not have.

## T-2J-15 — Accessibility regression from dense cockpit composition

**Risk.** A denser Hoje breaks heading order, focus order or touch targets, and nobody
notices because the checks are component-level.

**Mitigation.** **2J.0 runs first** and lands in CI's existing browser job, so every
subsequent slice is measured against it on desktop and Pixel 7 on every PR.
`2J-ACCESS-006` measures rendered boxes, not CSS source. `2J-ACCESS-008` keeps the
screen-reader session honest by naming it manual.

## T-2J-16 — The phase reports composition as construction *(added by this audit)*

**Risk.** Most of Etapa 2's Hoje content already ships. A phase that reports
`loadHomeSupplementalProjection`, the waiting section and the questions preview as things it
built would overstate itself the way Phase 2I's audit did three times.

**Mitigation.** The `baseline` class stays in the traceability matrix as a distinct outcome,
and `2J-CLOSE-001`'s generator is fail-closed. Each requirement above is written against a
gap this audit re-derived from source; where the parent PRD asked for something that already
ships, the audit says **BASELINE** and the PRD does not declare a requirement for it.
