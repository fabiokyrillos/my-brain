# Phase 2P — Slice 2P.2 acceptance record

**Conversation is repaired at the boundary that was actually broken, every
failure becomes nameable, and it stops being the last thing in Brain.**

- **Authorization:** ADR-122 (2026-08-18), slices 2P.0 … 2P.8.
- **Requirements:** `2P-CHAT-001` … `-007` (7 of 87; 14 of 87 cumulative).
- **Migrations:** **none created, none spent.** 97 local = 97 hosted, parity
  `202608160097`, unchanged. Slice 2P.0 proved the whole telemetry contract was
  already deployed, so this slice adds a producer and no schema.
- **Baseline:** `main` `7d94cdb` (slice 2P.0's merge), worktree clean, no open
  PR, **CI green on the exact merge SHA** `7d94cdb` (three jobs, all `success`),
  rollout gate 25 pass · 3 fail · 2 owner-signature, signup closed.
- **Slice 2P.1 is deliberately skipped**, not forgotten. Its correction lives in
  deployed SQL and no authorization funds it (2P.0 §8). 2P.2 is an independent
  P0 that depends on nothing 2P.1 delivers.
- **No provider call was made and no BYOK credential was spent** by any part of
  this slice.

---

## 1. Re-audit against `7d94cdb`, before editing

`2P-FOUNDATION-007`. Per requirement, against the tree rather than the plan.

| Requirement | Already true? | Evidence |
|---|---|---|
| `-001` root cause fixed | **no** | `task-commands/actions.ts:290` rethrew every undeclared fault |
| `-002` five distinct classes | **partial** | credential (BYOK copy) and quota (`admission.message`) differed; **retrieval, provider and temporary were one sentence** |
| `-003` sink is not the only evidence | **no** | zero sink producers on the chat path |
| `-004` first Brain lens | **premise false** | see §5 |
| `-005` contextual entry | **no** | one link into chat existed and it returns to an existing thread |
| `-006` deterministic suggestions | **baseline** | `deriveConversationSuggestions` is a pure function; zero provider references |
| `-007` desktop and mobile journeys | **no** | see §7 |

**Two divergences were registered before any edit.** Both are in §5.

---

## 2. `2P-CHAT-001` — the root cause, and it was not the provider

Slice 2P.0 established that the grounded-answer path **works**: every hosted
question produced an answer, an audit row, a usage row and a well-formed
citations envelope. So the repair is not in retrieval or in the model call.

The mechanism was `guard()` in `features/task-commands/actions.ts`:

```
if (!known) throw error;
```

Four declared precondition classes were rendered; **everything else was
rethrown**, contradicting property 4 in that module's own header. The default
Conversation route runs `runTaskCommand` *before* the knowledge path, so an
undeclared fault escaped `runAssistantTurn`, React rendered the app error
boundary, and the owner's pending command was gone.

`guard` is now async and:

1. calls `unstable_rethrow(error)` **first**, at the top of the block, which is
   where Next's own documentation places it — `redirect()` and `notFound()`
   signal by throwing, and a catch this broad is exactly where a future one
   would be silently converted into a rendered refusal;
2. classifies every thrown value with the sink's own `classifyError`;
3. records one `error_events` row and renders the unchanged refusal sentence
   **plus the correlation id**.

The four declared classes keep their exact rendered outcome and are now recorded
too: a precondition fault nobody can count is a precondition fault nobody fixes.

**Proved non-vacuous against the old implementation.** `if (!known) throw error;`
was temporarily restored; the new test `records an UNDECLARED fault and renders
it instead of throwing out of the action` failed, and only that test. The probe
was removed and 42/42 returned green.

---

## 3. `2P-CHAT-002` — five classes, one classifier

`features/chat/diagnostics.ts` is new. It is a **total function over the sink's
fourteen reasons**, written as a `Record<ErrorReason, ChatFailureClass>` rather
than a `switch`, so adding a reason to `error_events` is a type error here
instead of a silent fallthrough.

| Class | Reasons | Recovery |
|---|---|---|
| `credential` | `permission_denied` | route to Settings; BYOK keeps its finer copy |
| `quota` | `quota_exceeded`, `throttled` | route to usage; wait |
| `retrieval` | `database_error`, `not_found` | retry; the question is saved |
| `provider` | `provider_error`, `provider_rate_limited` | retry in a few minutes |
| `temporary` | `provider_timeout`, `timeout`, `conflict` | retry now |
| `unexpected` | `validation_failed`, `storage_error`, `lifecycle_blocked`, `unclassified` | retry; quote the reference |

**The row and the sentence are the same decision.** `classifyChatFailure` returns
the reason *and* the class from one `classifyError` call; the reason goes to the
sink and the class chooses the copy. Two calls would have been two decisions and
would have drifted — the classic shape being a recovery state saying "try again"
while the row says `quota_exceeded`.

Three deliberate refusals:

- **`provider_rate_limited` is not `quota`.** That is the provider throttling us,
  not the owner spending their ceiling. Collapsing them would tell the owner they
  had spent something they had not.
- **`unexpected` exists.** The fourteenth reason is literally `unclassified`, and
  folding it into one of the five would attach a confident next step to a fault
  nobody has diagnosed.
- **`validation_failed`, `storage_error` and `lifecycle_blocked` are not given
  chat-shaped advice.** None can reach this path — the schema refuses the first
  before the try, attachments own the second, and the lifecycle gate redirects
  the third to `/account-state`. Inventing a recovery for a state that has its
  own surface would be a lie with a plausible shape.

`answerUnavailable` is **deleted** from `chatCopy`, not left unused: removing the
key is what stops a future caller reaching for the flattened sentence again.

---

## 4. `2P-CHAT-003` — every failure is nameable, and nothing else travels

`sendChatMessage` now records on three paths — the BYOK gate refusal, the
embedding phase and the answer phase — and the `operation` distinguishes
`embed_text` from `chat_answer`, so the sink can answer *"is retrieval failing or
is generation failing"*.

**`record_error_event` was verified against the hosted database before it was
relied on**, because the chat path runs as the *user's* client rather than
`service_role`:

| Check | Result |
|---|---|
| grants | `EXECUTE` to `authenticated`, `anon`, `service_role`, `postgres` |
| definer | `SECURITY DEFINER`, `SET search_path TO ''` |
| owner scoping | inserts `user_id = auth.uid()` |
| columns written | `surface`, `operation`, `reason`, `correlation_id`, `user_id` |
| free-text column | **none exists** |

So `T-11` is mitigated **by construction**: there is no column a provider string
or a fragment of the owner's question could reach.

The `console.error` on this path was changed too. It printed
`error.message`, which was the one place on this path a provider string could
reach a host log; it now prints the classification and the correlation id only —
the same rule the sink follows.

`error.tsx` no longer claims the product has no error sink. That claim shipped
before Phase 2H and has been false since `202608070080`. The comment is
deliberately **paraphrased rather than quoted** in the replacement: the guard
asserts the exact sentence is gone, and a comment reciting it would keep that
guard failing forever on correct code. (This cost one iteration to find.)

---

## 5. `2P-CHAT-004` and `-005` — the two registered divergences

### Divergence 1 — the requirement asked to preserve something that never existed

`2P-CHAT-004` says Conversation "**remains** the first lens inside Brain". The
order in `lenses.ts` was `overview people projects organizations contexts
memories files relations chat` — **chat was last**, and the module stated the
reason deliberately: *Conversas is the way to ask about the rest, and the rest
has to exist before the question means anything.*

That argument is right about a new owner's first visit. `OD-2P-7`, which the
owner signed, decides every visit after it: "becomes ... the first Brain lens".
So the signed decision is to move, and the word *remains* is the inaccuracy.

**Delivered:** `chat` is now first in `DECLARED_ORDER`, making it the first
**domain** lens. `overview` still leads `BRAIN_LENSES` — it is the space's own
summary rather than a domain, `phase-2i-library-guard.test.ts` pins it at
position zero, and displacing it would remove the one lens that explains the
other eight. **Every href is unchanged; no deep link moved.** Three tests that
pinned the old order were updated with the reason.

### Divergence 2 — the mobile half collides with a prior decision, and is PARTIAL

`mobileBarSlots` is `["home", "inbox", "capture", "work", "more"]`.
`mobile-reachability-guard.test.ts` asserts, in both directions, that the fifth
slot frees only when `AccountMenu` reaches the mobile header — and that the
destination for slot five is **Brain**, not chat.

So "a first-class mobile destination" cannot mean a bar slot without either
breaking that guard's stated destination or landing the account move that
belongs to slice 2P.5's Settings work.

**`2P-CHAT-004` is therefore classified `partial`, with this remainder:**

> **Remainder `2P-CHAT-004-MOBILE`.** Conversation occupies no mobile bar slot.
> Delivered: it is the first destination inside Brain on every viewport, one tap
> from the bar's disclosure, and reachable directly from four contextual
> workspaces. Outstanding: the bar slot, which requires `AccountMenu` to reach
> the mobile header so `Mais` can retire. **Destination: slice 2P.5**, whose
> Settings and account reorganization is where that move belongs. No authority
> in this slice retires `Mais`.

### `2P-CHAT-005` — delivered

A contextual entry now exists on all four subject workspaces (person, project,
organization, context). The design decision worth recording:

**the URL carries `type:id` and nothing else.** The obvious implementation puts a
ready-made question in the query string — which is owner content on a shared,
logged, bookmarked surface, and a copy of a name outside the row that owns it.
That is the defect `202608080087` had to delete when a stored citation excerpt
stopped tracking its source's classification. So the name is re-read
**server-side, under RLS, at render time**: a subject the caller does not own
resolves to null and renders identically to one that does not exist, so the link
is not an existence oracle; and a renamed subject is correct on the next view
because there is no second copy to disagree.

The type list is closed and the resolver uses four explicit queries.
`supabase.from(subject.type)` would have turned a query parameter into a table
selector, and the guard asserts that shape is absent.

The composer is **seeded, never submitted**: `initialText` applies on the `idle`
route only, loses to a restored `echo`, keeps the field uncontrolled and keeps
`required`. The ordering is the part that matters — reversed, a conversation
reached from a person's page would answer a failure by deleting what the owner
wrote and replacing it with a suggestion.

---

## 6. What shipped

| | |
|---|---|
| `src/features/chat/diagnostics.ts` | the closed failure classification, total over the sink's reasons |
| `src/features/chat/diagnostics.test.ts` | 13 tests, incl. a leak test over a thrown value carrying a key, a model and a SQLSTATE |
| `src/features/chat/chat-state.ts` | `failure` and `reference` on the returned state |
| `src/features/chat/actions.ts` | `unstable_rethrow`, phase-aware `operation`, three recording paths, `answerUnavailable` removed |
| `src/features/task-commands/actions.ts` | `guard` records instead of rethrowing; header property 4 corrected |
| `src/app/[locale]/app/error.tsx` | the false no-sink claim removed |
| `src/features/library/lenses.ts` | Conversas leads the domain lenses |
| `src/features/conversation-cards/ask-about.ts` | handle, routes, copy, `ResolvedAskAboutSubject` |
| `src/features/conversation-cards/resolve-ask-about.ts` | the RLS-scoped render-time read |
| `src/features/conversation-cards/ask-about-link.tsx` | the affordance |
| `src/features/conversation-cards/asking-about-banner.tsx` | the subject and the way back |
| `src/features/assistant/assistant-composer.tsx` | `initialText`, idle-only |
| four entity workspaces | mount the affordance |
| `src/app/conversation-cards.css` | the new rules, tokens only, 44px targets |
| `src/lib/closeout/phase-2p-foundation-guard.test.ts` | two 2P.0 assertions inverted, six 2P.2 assertions added |

**Zero migrations. No RLS change, no new authority, no new RPC, no CSP change,
no schema change, no product-event vocabulary change.**

One prop rename is worth recording: `AskAboutLink`'s subject prop is `about`, not
`subject`, because `phase-2n-project-guard.test.ts` scans the project page for
`subject={` and requires every one to be a provenance label. The collision was
real, and renaming was chosen over narrowing the guard — `subject` already means
something specific on that page, and overloading it for a second concept is a
readability problem regardless of the guard.

---

## 7. Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | **0 errors** |
| `npx eslint src` | **0 errors**, 1 pre-existing warning (`costs/page.tsx`, unused `Coins`) |
| `npm test` | **8323 passed, 0 failed tests**; 3 failed files with 0 tests are the known Windows shebang-parse baseline (`hosted-auth-parity`, `signup-hardening-admin-boundary`, `storage-orphan-scanner`), green in CI |
| production build | **pass** |
| `diagnostics.test.ts` | 13 pass |
| `ask-about.test.ts` | 14 pass |
| `ask-about-render.test.tsx` | 9 pass |
| `phase-2p-foundation-guard.test.ts` | 22 pass |
| `task-commands/actions.test.ts` | 42 pass, incl. the new undeclared-fault test proved against the old code |
| library + nav guards | 146 pass |
| hosted parity | 97 = 97, `202608160097`, unchanged |
| hosted writes | **none**; all hosted reads were `select`-only, so there is no residue |
| CSS tokens | all ten verified defined before use — an undefined `var()` voids the whole declaration in silence |
| rollout gate | 25 pass · 3 fail · 2 owner-signature, unchanged |
| signup | closed, unchanged |

### `2P-CHAT-007` is PARTIAL — NOT EXECUTED

> **Remainder `2P-CHAT-007-JOURNEY`.** Desktop and mobile browser journeys over
> new conversation, existing conversation, source round-trip, failure and
> recovery are **not executed**. Delivered instead: component-boundary proof of
> the round-trip rendering and the seeding rule (`ask-about-render.test.tsx`, 9
> tests against a real DOM), and unit proof of every failure class and its copy.
>
> The traceability contract is explicit that browser journeys prove rendered
> flows and that no lower boundary substitutes for a higher one, so **this record
> does not claim the journey**. Two blockers, named: the authenticated lane needs
> the hosted online harness (disposable account, service-role key), and the
> live-answer case needs a provider call the owner has not authorized spending
> on a proof. **Destination: slice 2P.8**, which runs the final journeys, plus an
> owner decision on whether one real answered turn may be spent.

---

## 8. Threats dispositioned

| Threat | Disposition |
|---|---|
| `T-11` conversation error exposes provider or user content | **closed by construction.** `error_events` has no free-text column; the copy is per-class and interpolates only the correlation id; the leak test throws a value carrying a key, a model id, a SQLSTATE, a status and a quota string and asserts none reaches either locale's sentence. |
| `T-12` chat navigation promotes a broken route | **held.** The repair and the promotion land in the same slice, in this order, and the promotion is a reorder inside Brain rather than a new prominent route — the bar slot is refused and named as a remainder. |
| `T-1` second entry writer | **untouched.** No capture path changed; `capture-write-path-guard` passes. |
| `T-16` nested modals lose focus or submit twice | **not reached.** This slice adds no modal. The composer keeps its existing focus move and pending lock. |
| `T-19` tests claim real-device accessibility | **held.** §7 records the journey as NOT EXECUTED rather than inferring it from the component tests. |
| `T-20` implementation absorbs rollout/push residuals | **held.** None touched. |

---

## 9. Where this stops

Slice 2P.3 (the shared multimodal composer) is next and is unblocked: slice
2P.0's census proved Today and Capture already submit through one action, one
write path and one draft store. **Slice 2P.1 remains blocked on the owner's
authorization for a corrected migration**, and this record does not claim,
weaken or work around it.
