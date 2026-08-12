# Local Day Correction — Audit

Census executed against `main` at **`9a1e8a2`** on 2026-08-12, by the same brace-depth detector the
guard uses, over `src/**/*.{ts,tsx}` excluding `*.test.*` and the contract modules.

**Result: 17 formatters without `timeZone` across 16 files — exactly the re-audited baseline** —
plus three further families the Phase 2M corpus never looked for. **31 occurrences total.**

Every row below is transcribed into `OPEN_OCCURRENCES` in
`src/lib/closeout/local-day-correction-guard.test.ts` with an exact count, so this table is
executable rather than descriptive: it cannot drift from the tree without failing the build.

---

## 1. The seventeen formatters

All render a **stored instant**. None is a wall date. Current zone is the **host's** — UTC on the
server, the device's in a client component. Correct zone is the owner's `profiles.timezone` in every
row. Consumer is the surface named.

### 1a. Inside the Phase 2M corpus — the four carried past close *(Unit 2)*

| # | file · line | function | field | user impact | existing test |
|---|---|---|---|---|---|
| 1 | `features/daily-cycle/entry-review.tsx:211` | outcome block | `outcome.resolvedAt` | a resolution shows yesterday's date after 21:00 | component test, zone-blind |
| 2 | `features/daily-cycle/inbox-item.tsx:10` | `InboxItem` | `item.significantAt` | inbox rows disagree with the entry detail | component test, zone-blind |
| 3 | `features/daily-cycle/needs-attention-item.tsx:15` | `NeedsAttentionItem` | `item.occurredAt` | attention rows disagree with Home | component test, zone-blind |
| 4 | `features/daily-cycle/technical-details.tsx:172` | revision list | `revision.createdAt` | interpretation history dated in UTC | component test, zone-blind |

These four were **recorded** by `2M-TIME-007` as `HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE` and
deferred honestly. Regression risk: low — each is a leaf component; the zone must be threaded from
the surface that already holds it.

### 1b. Outside the corpus — thirteen nobody was watching *(Units 3 and 4)*

| # | file · line | function | field | user impact | unit |
|---|---|---|---|---|---|
| 5 | `app/[locale]/app/people/[personId]/page.tsx:102` | `formatDate` | person dates | person page dated in UTC | 3 |
| 6 | `app/[locale]/app/people/[personId]/page.tsx:226` | entry list | `entry.occurred_at` | related entries disagree with the entry page | 3 |
| 7 | `app/[locale]/app/projects/[projectId]/page.tsx:146` | entry list | `entry.occurred_at` | same, on projects | 3 |
| 8 | `app/[locale]/app/memories/[memoryId]/page.tsx:215` | local `formatInstant` | memory instants | shadows the contract's own name | 3 |
| 9 | `app/[locale]/app/inbox/[entryId]/page.tsx:96` | `occurredAtLabel` | `view.original.occurredAt` | the entry's own date is UTC | 3 |
| 10 | `app/[locale]/app/files/page.tsx:237` | `retryAtLabel` | `job.next_attempt_at` | "retry at" is hours off | 3 |
| 11 | `app/[locale]/app/chat/page.tsx:87` | conversation list | `conversation.updated_at` | conversation list dated in UTC | 3 |
| 12 | `features/agent/actions.ts:801` | job-retry refusal | `job.next_attempt_at` | the sentence a user is told to wait for | 4 |
| 13 | `features/agent/question-outcome-panel.tsx:33` | `date` | outcome instants | question outcomes dated in UTC | 4 |
| 14 | `features/agent/question-preview-panels.tsx:60` | **catch fallback** | preview instants | the primary path is correct; the fallback drops the zone | 4 |
| 15 | `features/conversation-sources/source-list.tsx:55` | `Freshness` | `occurredAt` | a cited source's date differs from the source page | 4 |
| 16 | `features/search/search-surface.tsx:258` | `formatDate` | result instants | search disagrees with the contextual page | 4 |
| 17 | `features/shell/home-dashboard.tsx:152` | `todayLabel` | **`new Date()`** | **the header's day ≠ the list's day** | 4 |

Row 17 is not a formatting defect. It is **meaning**: the label is computed from `new Date()` with
no zone while `dueFormatter` and `selectTodayPriorities` fifteen lines above both use
`workProjection.timezone`. Between 21:00 and midnight in `America/Sao_Paulo` the two halves of one
screen name different days, every day.

Row 14 is the mirror image and worth stating: the code *knows* about the zone and loses it only when
`Intl` throws. Once the zone is resolved through the total `resolveOwnerTimeZone`, the fallback has
nothing left to catch and is removed rather than repaired.

---

## 2. Three families beyond the seventeen

| family | occurrences | where | verdict |
|---|---|---|---|
| `host-zone-field` | 7 | `features/agent/actions.ts:900–906` | **defect** |
| `utc-day-slice` | 4 | `agent/actions.ts:1022–1023`, `planning/planner-view.tsx:331`, `task-commands/detail-controls.ts:143` | **2 defects, 1 fragile, 1 correct-but-duplicated** |
| `zone-round-trip` | 3 | `byok/credential-panel.tsx:132`, `operations/actions.ts:481`, `task-commands/detail-actions.ts:280` | **1 defect, 2 fragile** |

**`generateReview` (`agent/actions.ts`)** is the substantive find. It computes the period start with
`setHours(0,0,0,0)` for `daily`, `getDay()`/`setDate()` for `weekly`, and
`new Date(getFullYear(), getMonth(), 1)` for `monthly` — all host-zone — then stores
`start.toISOString().slice(0, 10)` and `now.toISOString().slice(0, 10)` as the summary's
`startDate`/`endDate`. On the server that is UTC throughout. It reads `profiles.timezone` eleven
lines later and passes it only to the prompt. A daily review generated at 22:00 in São Paulo covers
the wrong day and is labelled with tomorrow's date.

**The `toLocaleString` round-trip** (`new Date(new Date(ms).toLocaleString("en-US", { timeZone }))`)
carries a zone and is still wrong in kind: it re-parses a formatted string with the *host's* parser
to manufacture a `Date` whose host-zone fields mimic the target zone's wall clock. It produces a
different instant, and it depends on `toLocaleString`'s output being parseable — true in V8, not
guaranteed. Its only consumer is `dateBounds`, a ±730-day picker bound, so **no user-visible date is
currently wrong**; it is corrected because it is a second implementation of the contract, not
because it is presently producing a bad day.

**`planner-view.tsx:331` `shiftDay` is correct** — `Date.UTC(y, m - 1, d + delta)` is civil-date
arithmetic and DST-safe, and `2M-TIME-007` explicitly recorded it as correct and out of reach. It is
moved onto the contract anyway, for one reason: with it gone the `utc-day-slice` family reaches zero
**tree-wide with no exemption**, and a family at zero needs no allowlist that a later author could
widen.

---

## 3. Classified as correct, and left alone

Fifteen occurrences of `24 * 60 * 60 * 1000` / `86_400_000` are **durations**, not day boundaries:
undo and cooldown windows (`question-surfacing.ts:60`, `question-resolution-contract.ts:50`),
staleness thresholds (`heartbeat.ts:13`), a rotation window (`byok/rotation.ts:52`), duration clamps
(`capture/actions.ts:76,140`), a bounded-integer validator (`product-analytics/contracts.ts:686`),
rolling period filters (`search/contracts.ts:232`), and civil day differences computed on UTC-anchored
dates (`temporal.ts:147`, `matching.ts:307`).

The distinction is already enforced: `phase-2m-local-day-guard.test.ts` fires only when a fixed
24 hours is *correlated with a day-boundary name*, which is the shape that was actually wrong twice.
This initiative adds nothing there and removes nothing.

Two documented fail-open fallbacks are also correct and stay: `question-surfacing.ts:78`
(`slice(11, 16)` — a clock, not a day) and `question-surfacing-data.ts:42` (a rolling window when the
zone is unusable). `agent/forms.tsx:160` slices `0, 19` to canonicalise an **instant**, which is a
different operation and is not matched by the day-shaped pattern.

---

## 4. Four private answers to "is this zone usable"

The census set out to count formatters and found this instead. Outside the contract there are
**four** independent decisions about whether a stored zone can be used:

| where | symbol | shape | rule |
|---|---|---|---|
| `features/operations/actions.ts:273` | `isValidTimeZone` | predicate | `Intl.DateTimeFormat` constructs ⇒ valid |
| `features/task-commands/actions.ts:198` | `isValidTimeZone` | predicate | byte-identical |
| `features/task-commands/detail-actions.ts:123` | `isValidTimeZone` | predicate | byte-identical |
| `features/daily-cycle/review-projection.ts:374` | `resolveProfileTimezone` | **resolver** | same check, **plus `"America/Sao_Paulo"` as a literal** |
| `lib/time/local-day.ts:146` | `isSupportedTimeZone` | the contract | **and** `"/"` or `"UTC"` |

All four accept a value the contract refuses — a bare `EST` constructs happily and carries no DST
rule, so a day computed in it is silently fixed-offset. They agree about `America/Sao_Paulo` and
disagree only about the values that would hurt, which is why nothing noticed.

The fourth is the one worth naming separately: `resolveProfileTimezone` is **not** an
`isValidTimeZone` clone. It already does the job `resolveOwnerTimeZone` does, with a second
declaration of the default written into it, and **a census of formatters would have walked straight
past it**. It is recorded in `DUPLICATE_ZONE_RESOLVERS`, which is enumerated tree-wide so a fifth
cannot appear while the four are being removed, and each row must still exist until Unit 4 deletes
it.

One consequence for Unit 2, recorded here so it is not rediscovered: `EntryReviewProjection` already
carries `timezone`, so the entry-detail page needs **no new query** to repair `entry-review.tsx` and
`technical-details.tsx` — the zone is already loaded and already on the projection.

**Unit 2 added a fifth read path and a finding.** The Records list page had no zone at all, and the
obvious repair — `supabase.from("profiles")` on the page — was **refused by
`architecture.test.ts`**, which holds that page to the Slice 2X.16 projection boundary. The guard was
right. The zone now comes from `getOwnerTimeZone()` in `src/features/profile/owner-timezone.ts`, a
`cache()`-wrapped `server-only` accessor modelled on `getAgentName`: one query per request however
many surfaces ask, which is also the read path Units 3 and 4 use. The alternative — a `timezone`
field on every projection — was rejected as right only where a projection already computes *in* the
zone, and wrong where the inbox and attention projections never reason about days at all.

A sixth, unnamed copy is also recorded here: `work-projection.ts:166` implements
`resolveOwnerTimeZone`'s exact logic **inline** (`isSupportedTimeZone(...) ? ... :
defaultAgentPreferences.timezone`). It is correct, so it is not a defect and
`DUPLICATE_ZONE_RESOLVERS` does not name it — that list enumerates *declarations*. Unit 4 folds it
into the resolver for reuse.

## 5. Stop conditions — none encountered

No migration, column, schema, RLS, grant, policy or RPC change is required by any row above. Every
fix is at the read, render or compute boundary. No stored value is rewritten, no data is
reprocessed, `planned_at` keeps its meaning, and no signed Phase 2N contract is touched.
