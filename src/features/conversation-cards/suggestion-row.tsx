/**
 * `2K-SUGG-001` / `2K-SUGG-003` / `2K-SUGG-004` — the rendered suggestions.
 *
 * ## What it is, and what it deliberately is not
 *
 * A short list of questions the user could ask, built from **their own** people
 * and projects. It is not a prompt wall: OD-2K-4 caps it at three, and the
 * derivation returns **zero** when nothing is honestly appropriate — in which
 * case this renders nothing at all and the surface says what it already said.
 *
 * ## They are text, not links, and that is the point
 *
 * A suggestion tells the user what they *could type*. Making it a control that
 * submitted a question on their behalf would put words in their mouth and turn
 * a hint into an action — and the composer is one field away. The parent PRD's
 * principle is that the product does not act unprompted.
 *
 * ## Sensitivity
 *
 * `people` and `projects` carry no `sensitivity` column, so there is no
 * classification to consult and nothing to mask — these are the user's own
 * names, on their own screen, behind RLS. Stated here rather than assumed,
 * because "no mask" and "mask not applied" look identical from the outside.
 *
 * A server component: it holds no state and needs no interactivity, so it adds
 * nothing to the client bundle of a page that renders it.
 */

import type { Locale } from "@/lib/preferences";

import { getConversationCardsCopy } from "./copy";
import type { ConversationSuggestion } from "./suggestions";

export function SuggestionRow({
  locale,
  suggestions,
}: {
  locale: Locale;
  suggestions: readonly ConversationSuggestion[];
}) {
  if (suggestions.length === 0) return null;
  const copy = getConversationCardsCopy(locale).suggestions;

  return (
    <div className="conversation-suggestions">
      <p className="conversation-suggestions-label">{copy.label}</p>
      <ul className="conversation-suggestions-list">
        {suggestions.map((suggestion) => (
          <li key={`${suggestion.category}:${suggestion.id}`} data-category={suggestion.category}>
            {suggestion.category === "person"
              ? copy.person(suggestion.name)
              : copy.project(suggestion.name)}
          </li>
        ))}
      </ul>
    </div>
  );
}
