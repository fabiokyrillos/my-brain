# Life Brain B.7 — closing report

**Date:** 5 November 2026; §7 added 6 November. **Branch:** `life-brain/b7-fill-and-suggest`, cut from `origin/main` at `09709a9`.
**Pull request:** fabiokyrillos/my-brain#370.
**Governing input:** `FEEDBACK_DONO_2026-11-05.md` (T1, T7, defects 1, 3 and 5). **Decisions:** ADR-160, and ADR-161 for the owner's three
answers of 6 November. **Migrations:** one — `202611060108`, authorized by the owner after this report was first written. **Read §7 before §6:**
§6 is the list of what was left for him, and §7 is what he decided.

---

## 1. Read this first: most of Part 1 was already shipped

The slice was briefed as "B.5 original + ampliação". **B.5 itself landed on `main` the day before**, as
PR #362 (`8755da9`, ADR-157), and the brief was written against the `life-brain/c0-life-copy`
branch, which is cut from a much older `main` and does not contain it.

What the brief asked for in Part 1, against what `origin/main` already had:

| Asked | State on `origin/main` before this slice |
| --- | --- |
| One `Composer` with `mode` | **Shipped.** `src/features/capture/composer.tsx` dispatches `mode="capture" \| "chat"`. |
| Router pergunta / comando / relato | **Shipped.** `assistant/routing.ts` + `relato-intent.ts`. |
| `VoiceComposer` shared with the chat | **Shipped.** `chat-composer.tsx` mounts it; the chat pages bind `transcribeRecording`. |
| Retire `assistant-composer.tsx` | **Shipped.** The file is gone; `ChatComposer` moved to `capture/chat-composer.tsx`. |
| Remove the "Perguntar ao {agente}" door from Hoje | Still there. **Done here.** |
| Remove `<BrainLensTabs active="chat">` from `/app/chat` | Still there. **Done here.** |
| The chips must fill the field, not navigate | Still `ButtonLink` to `?q=`. **Done here.** |

So the four structural items of B.5 were not re-done, and nothing was reverted to re-do them. This
slice is the remainder of T1 plus the whole of T7 plus three defects, and it is recorded as **B.7**
rather than as B.5 for that reason. `IMPLEMENTATION_PLAN.md`'s slice order was **not** changed —
the promotion of B.5 stays a proposal, and B.5 is now simply marked as landed.

## 2. The birthday question answered itself

The brief said `people` has no birthday column, told me to read birthdays from recurring reminders
(path **a**), and told me not to create `people.birthday` because that is slice C.5 and a possible
fourth migration needing the owner's authorization.

**On `origin/main`, C.5 has already landed.** Migration `202611050107_life_brain_m4_birthdays.sql`
is applied, `people.birthday_day/month/year` exist with `set_person_birthday`, there is a whole
`src/features/birthdays/` feature, and ADR-158 added birthdays read from records by the extraction.
The feedback analysis's own recommendation was *"(c), beginning with (a)… with (b) winning over (a)
when both exist."* (b) exists, so `birthday_soon` reads the structured columns and no reminder
parsing was written. **No migration was created, and no schema was touched.**

## 3. What shipped

**The chips fill the field.** `composer-seed.tsx` is a client channel: the composer registers a
filler, a chip calls it, and there is no path from a chip to a submission. `MAX_SEED_LENGTH = 240`
moved out of `chat/page.tsx` so the `?q=` seed and the client fill share one bound. A chip joins
text the owner has already typed (`2P-CAPTURE-006`'s rule, reused rather than re-decided) and
replaces only its own previous fill.

The principle `suggestion-row.tsx` carried — *a control that submitted a question on their behalf
would put words in their mouth* — is kept **and sharpened**. It was an objection to **sending**, and
the guard now says exactly that: no `<form>`, no `formAction`, no `type="submit"`, no
`requestSubmit`, in the row, the chip **or** the channel. The weaker edit — leaving the old regex
alone and putting the button in a file it does not read — would have kept the guard green while
deleting the property, so the chip's file is named in it.

**Six new suggestion categories**, with the vocabulary array as the precedence: `overdue_task`,
`due_today`, `reminder_soon`, `birthday_soon`, `open_question`, `unreviewed_entry`, then `person`
and `project`. One row per dated bucket (earliest first, id tiebreak), so three slots show three
*kinds* rather than three late tasks. Nothing scores, samples or calls a model.

**The mask the brief asked to be tested.** The module's old reasoning — people and projects carry no
classification, so there is nothing to mask — does not transfer, and the slice treats that as the
central risk rather than a footnote. Every dated row carries the `TaskSensitivity` its caller
resolved; `resolveConversationContent` asks the `chat` surface's own rule; a withheld row is
**dropped**, not masked, because a suggestion whose subject is hidden says nothing and its presence
would still report that such a row exists. Tested across all six buckets, each with a non-vacuity
case, plus `private` (shown), `undetermined` (shown, never inferred to be `normal`), an unreadable
source (most protective), and the case where a dropped row does not cost its category's slot.

**A scoped conversation gets scoped suggestions or none** (defect 3). The generic starters stand
down entirely; the derivation keeps only the matching person or project; an organization, an area,
or a subject the reader does not own all resolve to zero — identically, so the surface is not an
existence oracle.

**Defect 1:** `Ctrl+K` is withheld under `@media (hover: none) and (pointer: coarse)`. The trigger
stays — the palette opens by tap — and only the hint goes.

**Defect 5:** "Lembrete avulso" → "Sem vínculo" / "Standalone reminder" → "Not linked". The label is
chosen by `reminder.link === null`, so it reports the absence of a **subject**; *avulso* reads as the
absence of **recurrence**, which the same card contradicted two lines below with "REPETE — Todo dia
5 de junho". Copy, not data, exactly as the analysis said.

## 4. What the browser lane caught

`e2e/life-brain-b7-conversation.spec.ts` — 24 tests, desktop and Pixel 7, both locales — failed on
its first run for a real reason: `.ui-button` is `white-space: nowrap`, which is right for "Enviar"
and wrong for a sentence, so the pt-BR chip *"O prazo de Pagar a escola já passou. O que eu faço?"*
pushed the page 15 CSS px wide at 320. Fixed with a local override, not in the primitive.

## 5. Verified, and not verified

**Verified:** `npm run lint` clean on every file this slice touches; `npm run typecheck` clean;
10,500+ unit tests green; `npm run build` green; the new lane 24/24 on desktop + mobile in both
locales; `accessibility`, `layout-contracts`, `daily-surfaces` and `calendar` 413 passing on both
projects.

**Two guards caught this slice from the other side of the repository, and both were right to.**
Neither was weakened:

- `phase-2m-local-day-guard` refuses any module holding both a day-boundary name and a hard-coded
  `24 * 60 * 60 * 1000`, because deriving a day from a fixed 24 hours is how this product got a wrong
  answer at 23:00 three times. The birthday distance was a UTC millisecond subtraction, which was
  *correct* — both ends are wall-clock dates, not instants — but a reader cannot see that from the
  arithmetic. It now walks calendar days with `addLocalDays`, bounded by the horizon.
- `phase-2i-library-guard` asserted that every Brain lens surface mounts the lens strip. `/app/chat`
  deliberately stopped. The guard now names `chat` as the one exemption and asserts the **absence**,
  so a strip that comes back fails there — and additionally asserts `chat` is still in the lens
  vocabulary, because what left is the self-mount and not the lens.

**Not verified, and it matters:**

- **The ADR-159 screenshot baselines for Hoje and Conversar no longer match.** Both surfaces changed
  on purpose. They must be redrawn on this branch through the hand-dispatched `visual-baselines.yml`;
  until then the `database` CI job's screenshot lane will fail, and that failure is expected rather
  than a defect.
- **The authenticated journeys were not run.** `online-*` specs need a live environment and stay
  manual. The fill was proved in jsdom and the chip's geometry in a real browser; *clicking a chip in
  the signed-in app and watching the composer fill* has not been run anywhere.
- **No real device.** An emulated viewport is a viewport.

**Two pre-existing faults found while verifying, neither caused by this slice and neither fixed by
it** — recorded because both cost time to diagnose and will cost it again:

- **Three test files cannot be loaded at all**, and have nothing to do with B.7:
  `src/features/auth/hosted-auth-parity.test.ts`,
  `src/lib/closeout/signup-hardening-admin-boundary.test.ts` and
  `src/lib/closeout/storage-orphan-scanner.test.ts` each import a `scripts/*.mjs` that begins with a
  `#!/usr/bin/env node` shebang, and this Vitest's rolldown transform fails on it
  (`Invalid Character '!'`). Neither those tests nor those scripts are in this branch's diff, so the
  failure is byte-for-byte identical on `origin/main`. It reports as "3 failed" in any full run and
  should not be read as a regression.
- **`npm run dev` does not start in this checkout** (`Can't resolve './tokens.css'`, resolved from
  the repo root instead of `src/app`). `npm run build` and `npm run start` are both fine, so it is a
  dev-server-only fault. It matters for Playwright: `playwright.config.ts` runs `npm run dev` as its
  `webServer` unless `CI` is set, so a plain `npx playwright test` dies after a 120 s timeout with a
  wall of webpack resolver output. Build first, then run lanes as
  `CI=1 npx playwright test <spec> --project=desktop --project=mobile`.

## 6. Left for the owner, not decided here

1. **Model-generated suggestions.** Still refused, and still the owner's call. The price is a billed
   call on his own BYOK credential every time the main screen loads.
2. **Does Conversar replace Hoje as the app's front door?** Not touched. The suggestions therefore
   still appear only on the empty conversation surface, which is also what keeps their six reads free
   for anyone who already has conversations.
3. **Telemetry for the six new categories needs SQL.** `record_product_event` validates
   `conversation_suggestion_shown.category` against `array['person', 'project']`. This slice ships no
   migration, so the dated categories are rendered and **not reported** —
   `REPORTABLE_SUGGESTION_CATEGORIES` makes that gap a list rather than six events a fail-open writer
   silently swallows. Widening it is one `require_product_event_enum` call in a new migration.
4. **`Ctrl+K` on a Mac still reads `Ctrl+K`.** The defect filed was the iPhone, and that is what was
   fixed; a platform-aware hint (⌘K) was left out of scope.
5. **Defects 2 and 4 of the analysis are not here.** Defect 2 ("Cérebro" in `relations/copy.ts`) is
   in another branch's scope and was not touched; defect 4 (the timeline stamping `created_at`) is
   C.4's.

## 7. The owner answered, on 6 November

Three questions, three answers, and the work they did or did not produce. ADR-161 records them.

### 7.1 "pode fazer a migration" — done, and it landed before the code that needed it

`202611060108_life_brain_b7_suggestion_telemetry.sql` re-declares
`private.validate_product_event_properties` whole, with `conversation_suggestion_shown.category`
validated against the eight names of `SUGGESTION_CATEGORIES` in the derivation's own precedence
order. The diff against `202608110090` is exactly that one `case` arm; the other 346 lines were
assembled from that migration's own text rather than retyped, because a hand-copy of 347 lines is
how a pre-existing arm gets silently dropped — and the file's verification blocks assert that none
was, that the arm admits exactly eight names, and that the event-name CHECK and the validator still
name the same vocabulary.

The event-name CHECK and the surface CHECK are **not** touched. Both already admitted this event and
the `chat` surface, so re-running `drop constraint if exists` — the one fail-open operation in this
chain — would have risked silently narrowing a vocabulary in exchange for nothing.

`REPORTABLE_SUGGESTION_CATEGORIES` and the renderer's `.filter` came out in the same pull request and
**after** the migration. That ordering is the rule rather than a preference: a producer naming a
value the deployed chain refuses is rejected `22023` at the last real write path, inside a
`.catch(() => {})`, so the code reads as instrumented and the ledger stays empty. That is
`202608080087` and `202608090089` both, and §6 of this report described B.7 deliberately carrying the
same state.

**Applied to the hosted project on 6 November**, after the pull request merged with all three CI jobs
green — which means the `database` job had already applied the whole chain from an empty database and
run the pgTAP suite, so the migration and its verification blocks executed for real before production
saw them. Parity is 108 = 108.

Verified against the **live** database afterwards, by calling the validator rather than writing a row,
because `product_events` is an append-only ledger and a test event would be a lie in it: the eight
categories are accepted, `'invented'` is refused with `22023` (`Invalid product event property`), and
the deployed function keeps the posture it had — `security invoker`, empty `search_path`, `execute` for
`postgres` alone, with neither `anon` nor `authenticated` able to call it directly.

The before-reading is worth recording, because it is the thing this whole exercise was about: at the
moment of the push the deployed database still held `array['person', 'project']`. The refusals really
were happening and really were being swallowed.

### 7.2 A guard was missing, and this is what found it

`phase-2m-telemetry-guard.test.ts` exists precisely so that no producer precedes its migration. It
checked the event **name** against the chain and the **surface** against the chain, and it never
looked at a property's enum — which is how B.7 could render six categories the deployed database
refused while every guard in the repository stayed green. The gap was visible here only because the
slice wrote the narrowing down instead of shipping the silence.

It now reads the chain's latest validator with `enumValuesFor()` and holds `SUGGESTION_CATEGORIES`
itself to it. The extraction is bounded at **both** ends, and the right bound is the interesting one:
these enum calls sit directly before the next `when` arm and its comment, so a fixed-width window
reads a literal out of the following arm and reports a vocabulary that is not there. A first draft of
the migration's own verification block did exactly that — it would have counted nine names and
aborted a correct migration in CI — and it was caught by simulating the extraction before pushing
rather than by watching the `database` job fail.

Three more places now assert the same thing from different directions: `contracts.test.ts` holds the
analytics restatement to the derivation's list by exact equality and in order, and exercises every
category through `parseProductEventPayload` while still refusing an invented value and a name
travelling beside one; `post_2j_product_event_write_path.sql` writes all eight through the real
writer (plan 39 → 42) with the same two refusals proved at the database; and
`phase-2k-suggestion-guard.test.ts`'s assertion is now the inverse of what it was — the narrowing's
**absence** is pinned, so a filter that comes back fails rather than quietly stopping six categories
again.

### 7.3 "não, pode ficar o hoje e manter conversa como atalho embaixo" — no code changed

`mobileBarSlots` has been `["home", "chat", "capture", "calendar", "library"]` since A.2, so
Conversar is already the second slot of the bottom bar: the shortcut he wants kept was never the
thing B.7 removed. This also settles that removing Hoje's in-page *"Perguntar ao {agente}"* block was
the right half to remove — what he objected to was a second text door stacked on the first screen,
not the route being reachable.

The open question §6 recorded — whether Conversar replaces Hoje as the app's front door — is
**closed**. What remains is narrower and still unasked: whether the suggestions belong above the
conversation list on every visit to Conversar, rather than only on the empty surface.

### 7.4 "sem problemas, só usar um modelo barato pra isso" — approved, and not built here

The objection §6 recorded was the price of a billed call on his own BYOK credential every time the
main screen loads. A cheap model answers that objection; it does not waive it, and it does not supply
the four decisions the slice needs:

1. **Which `agent_preferences` operation routes it.** `background` is the existing cheap lane.
2. **Cached per day, or recomputed per render.** A suggestion derived from today's state has a
   natural cache key; a per-render call does not.
3. **What happens with no key, or a rate limit.** The derived suggestions are free and never fail the
   surface; a generated one must degrade to them rather than to nothing.
4. **How a generated sentence stays inside `2K-SUGG-005`.** This is the real one. The whole reason a
   name can never reach telemetry today is that the derivation keeps `{category, name}` apart and
   the renderer builds the sentence from copy. **A model that writes the sentence can write a name
   into it** — and into anything that logs it. Whatever that slice does, it cannot be "ask the model
   for a sentence and show it".

Until that slice exists, `phase-2k-suggestion-guard.test.ts` keeps refusing
`getAIProvider`, `recordAIUsage`, `answerFromKnowledge` and `embedText` anywhere in the derivation or
its reader. That refusal is now deliberate rather than merely unreviewed.

### 7.5 What is still not verified

- ~~The migration has not been applied anywhere.~~ **Since resolved** — CI's `database` job ran it
  against the whole chain from an empty database, and it is now applied to the hosted project (§7.1).
  It is recorded here because of how it was de-risked without Docker: the extraction logic in its
  verification blocks was simulated line-for-line before pushing, which is why the nine-name defect
  above was found rather than deployed.
- **The ADR-159 screenshot baselines for Hoje and Conversar are still unredrawn**, and they are the
  one thing standing between this branch and a green pipeline. Both surfaces changed on purpose.
- **The authenticated journeys still have not been run** (§5), and the three unloadable test files
  and the broken `npm run dev` are still exactly as §5 describes them — neither caused nor fixed by
  any of this.

## 8. The screenshot baselines: what actually moved, and the hole it exposed

`visual-baselines.yml` ran on this branch on 6 November and redrew **two** images:
`hoje-light-mobile` and `hoje-dark-mobile`. Not four, not eight — two. §5 and ADR-160 both said the
baselines "for Hoje and Conversar" no longer matched. That was half right, and the half that was
wrong is the interesting half.

**Hoje, mobile.** Redrawn, and the new image is the proof that the run built this branch: the
"Perguntar ao Brain" door is gone from it, and so is the `Ctrl+K` hint — which also settles that
Playwright's Pixel 7 emulation does report `(hover: none) and (pointer: coarse)`, something the B.7
lane deliberately did not assume.

**Hoje, desktop.** Unchanged, because `toHaveScreenshot` captures the **viewport**, not the page,
and the removed block sits below the fold at 1280 × 720.

**Conversar: unchanged on all four, and that is a defect in the baseline rather than in the page.**
The same run rendered Conversar from the same build, compared it against a baseline drawn on `main`
before B.7 — one that still shows the lens strip and the `Ctrl+K` hint — and **passed** it. The
difference is real and it is below `maxDiffPixelRatio: 0.005`: at 412 × 839 that is 1,728 pixels,
and what changed is thin anti-aliased glyph text (a four-item strip, a 2px underline, a separator
rule, and a small `kbd`) with nothing reflowing underneath, because the space below the strip was
already empty. So the gate tolerates it — and `--update-snapshots` runs in `changed` mode, so it
never rewrites a baseline it considers matching. **A baseline that depicts a removed element can
therefore survive indefinitely**, and the next person redrawing baselines for an unrelated change
would inherit a phantom strip.

The fix here is the blunt one that cannot be fooled: the four Conversar baselines are **deleted**, so
the runner has to write them from scratch rather than compare and keep. That also makes it an
experiment rather than a cleanup — if the redrawn image still shows the lens strip, the page is
wrong rather than the baseline, and it will be visible in the pull request.

**And the first `verify` run proved nothing about Conversar either.** The lane is
`test.describe.configure({ mode: "serial" })`, so when `hoje (light)` failed on mobile the remaining
seven mobile tests were **skipped** — the reporter's `·F°°°°°°°·······`. A serial lane reports the
first failure per project and nothing after it, which is worth knowing before reading a green-looking
dot sequence as coverage.

**The experiment's answer: the page was right and the baseline was lying.** With the four files gone,
the runner wrote them from scratch, and the new Conversar images have **no lens strip** and **no
`Ctrl+K` hint**. So nothing is wrong with the route — the old baseline had simply survived a change
it was supposed to catch.

That redraw is also the first time either change has been proved **in the real signed-in
application**. Until now the lens strip's removal was proved by a guard reading source, and the
`Ctrl+K` hint by a fixture branching on `matchMedia`; both are now visible in a screenshot of the
actual route, rendered against a real database.

**Not fixed here, and not mine to decide:** `maxDiffPixelRatio: 0.005` is ADR-159's number. This
slice does not change it. But it is now written down that the threshold is large enough to hide the
removal of a navigation strip, which is the kind of change the lane exists to catch.
