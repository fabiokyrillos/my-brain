# Life Brain B.7 — closing report

**Date:** 5 November 2026. **Branch:** `life-brain/b5-one-composer`, cut from `origin/main` at `09709a9`.
**Governing input:** `FEEDBACK_DONO_2026-11-05.md` (T1, T7, defects 1, 3 and 5). **Decision:** ADR-160. **Migrations:** none.

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

**Not verified, and it matters:**

- **The ADR-159 screenshot baselines for Hoje and Conversar no longer match.** Both surfaces changed
  on purpose. They must be redrawn on this branch through the hand-dispatched `visual-baselines.yml`;
  until then the `database` CI job's screenshot lane will fail, and that failure is expected rather
  than a defect.
- **The authenticated journeys were not run.** `online-*` specs need a live environment and stay
  manual. The fill was proved in jsdom and the chip's geometry in a real browser; *clicking a chip in
  the signed-in app and watching the composer fill* has not been run anywhere.
- **No real device.** An emulated viewport is a viewport.
- `npm run dev` does not start in this container (`Can't resolve './tokens.css'`). Pre-existing and
  unrelated: `npm run build` and `npm run start` are both fine, and CI uses the latter.

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
