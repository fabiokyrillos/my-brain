import Link from "next/link";
import { formatInstant } from "@/lib/time/instant-format";
import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";
import { getRecordsCopy } from "./records-copy";
import type { InboxItemView } from "./contracts";

/**
 * Registros as a decision queue (mockup 03, frame 03).
 *
 * The list stopped being a chronological feed and became a queue with a fixed
 * row grammar: **estado · registro · o que o brain propõe · quando**. The third
 * column is the point of the redesign — it says what is at stake before the row
 * is opened, which is the difference between a feed you scroll and a queue you
 * empty.
 *
 * On a narrow viewport the proposal column becomes the card's second line
 * (`05-responsividade.md`: *a coluna "o que o Brain propõe" … vira a segunda
 * linha do cartão*). That is a CSS regrouping of the same DOM, not a second
 * markup path, so the two layouts cannot drift apart.
 */
export function RecordsQueue({
  items,
  locale,
  agentName,
  timeZone,
}: {
  items: readonly InboxItemView[];
  locale: DailyCycleLocale;
  agentName: string;
  /** The owner's zone (`LDC-DAILY-001`). Required, never defaulted. */
  timeZone: string;
}) {
  const copy = getRecordsCopy(locale);

  return (
    <div className="records-queue">
      {/*
        A real header row, hidden from the accessible tree: the columns are a
        visual alignment aid, and each cell below already carries its own label
        for a screen reader. Announcing "estado, registro, o que o brain propõe"
        before every one of twenty rows would be noise, not structure.
      */}
      <div className="records-head" aria-hidden="true">
        <span>{copy.columns.state}</span>
        <span>{copy.columns.record}</span>
        <span>{copy.columns.proposal}</span>
        <span>{copy.columns.when}</span>
      </div>
      <ul className="records-list">
        {items.map((item) => (
          <RecordRow agentName={agentName} item={item} key={item.entryId} locale={locale} timeZone={timeZone} />
        ))}
      </ul>
    </div>
  );
}

/**
 * What the assistant proposes for this record, in one line.
 *
 * Composed from the state the projection already decided — never from a second
 * read, and never invented. A record with nothing to say gets the copy for
 * *nothing to do*, which is a real answer; an empty cell would read as missing
 * information.
 */
function proposalFor(item: InboxItemView, locale: DailyCycleLocale): string {
  const copy = getRecordsCopy(locale);
  if (item.attentionReason === "answer_existing_question") return copy.proposals.question;
  if (item.attentionReason === "confirm_existing_candidates") return copy.proposals.candidates;
  if (item.attentionReason === "review_interpretation") return copy.proposals.review;
  if (item.attentionReason === "resolve_consistency") return copy.proposals.inconsistent;
  if (item.attentionReason === "retry_processing") return copy.proposals.failed;
  if (item.attentionReason === "configure_ai_credential") return copy.proposals.noCredential;
  if (item.productState === "organizing") return copy.proposals.organizing;
  if (item.isRecordOnly) return copy.proposals.nothing;
  if (item.productState === "ready") return copy.proposals.done;
  return copy.proposals.saved;
}

function RecordRow({
  item,
  locale,
  agentName,
  timeZone,
}: {
  item: InboxItemView;
  locale: DailyCycleLocale;
  agentName: string;
  timeZone: string;
}) {
  const cycle = getDailyCycleCopy(locale, agentName);
  const copy = getRecordsCopy(locale);
  const stateCopy = cycle.productStates[item.productState];
  const openHref = item.availableActions.find((action) => action.id === "open_entry")?.href ?? "#";
  const timestamp = formatInstant(item.significantAt, "dayAndTime", locale, timeZone);
  const needsYou = item.productState === "needs_attention";

  return (
    <li className="records-row" data-state={item.productState} data-attention={needsYou ? "true" : undefined}>
      <Link className="records-link" href={openHref}>
        {/*
          `04-estados.md`: cor + palavra + forma. The pill carries a dot and a
          word; the row's 3px left rule is the third signal, and none of the
          three is colour on its own.
        */}
        <span className="records-state">
          <span className="records-dot" aria-hidden="true" />
          <span className="records-state-label">
            {/* "Só registro" is a reading of the product, not a `ProductState` —
                see `InboxItemView.isRecordOnly`. */}
            {item.isRecordOnly ? copy.states.recordOnly : stateCopy.label}
          </span>
        </span>

        <span className="records-content">
          {/* The owner's own words, quoted. The interpretation summary is not
              what identifies a record in a queue about deciding on it. */}
          <span className="records-original">{item.originalPreview}</span>
        </span>

        <span className="records-proposal">{proposalFor(item, locale)}</span>

        <span className="records-when">
          <span className="sr-only">{copy.columns.when}: </span>
          {timestamp}
        </span>
      </Link>
    </li>
  );
}
