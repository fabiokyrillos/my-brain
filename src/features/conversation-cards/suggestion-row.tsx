/**
 * `2K-SUGG-001` / `2K-SUGG-003` / `2K-SUGG-004` — the rendered suggestions.
 *
 * ## What it is, and what it deliberately is not
 *
 * A short list of questions the user could ask, built from **their own** state:
 * people, projects, and — since Life Brain B.7 — what is late, what is due
 * today, what is coming, whose birthday is near, what the agent asked and what
 * is still unreviewed. It is not a prompt wall: OD-2K-4 caps it at three, and
 * the derivation returns **zero** when nothing is honestly appropriate — in
 * which case this renders nothing at all and the surface says what it already
 * said.
 *
 * ## They fill the field; they still do not ask
 *
 * The sentence this file used to carry was *"Making it a control that submitted
 * a question on their behalf would put words in their mouth and turn a hint into
 * an action."* The objection is to **submitting**, and it is unchanged. The
 * owner asked for filling — *"é preencher, não enviar"* — and `seed-chip.tsx`
 * holds that distinction, with the guard on both files.
 *
 * ## Sensitivity
 *
 * `people` and `projects` carry no `sensitivity` column, so for those two there
 * is no classification to consult and nothing to mask — the user's own names, on
 * their own screen, behind RLS.
 *
 * **The dated categories are different**, and the difference is the reason this
 * paragraph is longer than it was. A task, a reminder, a pending question and a
 * record each derive a level from their source entry, and the Home withholds a
 * `highly_sensitive` one behind "Conteúdo muito sensível, oculto". Naming the
 * same row here would be that mask, walked around — so `suggestions.ts` resolves
 * the conversation surface's own rule and never hands this component a row it
 * may not name. Nothing is masked *at this layer*, because nothing withheld
 * arrives.
 *
 * A client component since B.7, and that cost is stated in `seed-chip.tsx`.
 */

import { ConversationSuggestionsShown } from "@/features/product-analytics/interaction-events";
import type { Locale } from "@/lib/preferences";

import { getConversationCardsCopy } from "./copy";
import { SeedChip } from "./seed-chip";
import type { ConversationSuggestion } from "./suggestions";

export function SuggestionRow({
  locale,
  source = "derived",
  suggestions,
}: {
  locale: Locale;
  /** Life Brain B.8: who chose these — the date rules or the model. Reported, never shown. */
  source?: "derived" | "model";
  suggestions: readonly ConversationSuggestion[];
}) {
  if (suggestions.length === 0) return null;
  const copy = getConversationCardsCopy(locale).suggestions;

  return (
    <div className="conversation-suggestions">
      <p className="conversation-suggestions-label">{copy.label}</p>
      <ul className="conversation-suggestions-list">
        {suggestions.map((suggestion) => {
          const question = copy.byCategory[suggestion.category](suggestion.name);
          return (
            <li key={`${suggestion.category}:${suggestion.id}`} data-category={suggestion.category}>
              <SeedChip fillLabel={copy.fill(question)} question={question} />
            </li>
          );
        })}
      </ul>
      {/*
        `2K-SUGG-005`. Categories, never suggestions: there is no name in scope
        at the call site, so none can reach the event.

        Unfiltered since `202611060108` widened both database gates to all eight
        categories (ADR-161). The narrowing that used to stand here existed
        because the writer is fail-open: a category the deployed chain refuses is
        swallowed, so the surface would have looked instrumented while reporting
        nothing. The migration landed first and in the same pull request, which
        is the ordering `2M-METRICS-001` makes a rule.
      */}
      <ConversationSuggestionsShown
        categories={suggestions.map((suggestion) => suggestion.category)}
        locale={locale === "en" ? "en" : "pt-BR"}
        source={source}
      />
    </div>
  );
}
