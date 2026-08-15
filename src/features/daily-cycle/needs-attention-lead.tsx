"use client";

import { recordNeedsAttentionItemOpened } from "@/features/product-analytics/interaction-events";
import { formatInstant } from "@/lib/time/instant-format";
import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";
import type { NeedsAttentionItemView } from "./contracts";

/**
 * The first item in "Precisa de você", expanded (`03 - Desktop, ciclo diário`,
 * frame 01: *"Precisa de você" abre com a proposta completa … e as duas atenções
 * seguintes ficam colapsadas em uma linha cada*).
 *
 * ## Why the decision is not taken here
 *
 * The mockup's caption says the user decides without leaving the page. The
 * **documentation** — which the handoff's own rule says wins where the two
 * disagree — describes the interaction differently: `06-interacoes.md` §4
 * ("Revisar uma interpretação") specifies *clique na linha → desktop abre o
 * detalhe (rota)*, with the confirmation flow (§5) living on that route, where
 * the version conflict, the idempotency key and the undo window already are.
 *
 * So this card's job is to make the decision **legible before it is opened**:
 * the entry's own words, what the assistant proposes, and the fact that nothing
 * has been created yet. That is the substance the collapsed row could not carry.
 * Duplicating the confirm write path onto the cockpit would put two surfaces on
 * one mutation — and the second would be the one without the stale-interpretation
 * handling.
 *
 * ## Ordering
 *
 * The quotation comes first and the proposal second, without exception:
 * `03-componentes.md` (InterpretationCard) — *aparece sempre **abaixo** do
 * conteúdo original, nunca acima nem no lugar dele*.
 */
export function NeedsAttentionLeadCard({
  item,
  locale,
  agentName,
  surface,
  timeZone,
  proposesLabel,
  reversibleLabel,
}: {
  item: NeedsAttentionItemView;
  locale: DailyCycleLocale;
  agentName: string;
  surface: "home" | "needs_attention";
  /** The owner's zone (`LDC-DAILY-001`). Required, never defaulted. */
  timeZone: string;
  /** "o {agent} propõe", already interpolated by the calling surface's copy. */
  proposesLabel: string;
  /** "Nada foi criado ainda." */
  reversibleLabel: string;
}) {
  const copy = getDailyCycleCopy(locale, agentName);
  const reasonCopy = copy.attentionReasons[item.kind];
  const actionLabel = copy.actions[item.primaryAction.id];
  const timestamp = formatInstant(item.occurredAt, "dayAndTime", locale, timeZone);

  return (
    <article className="attention-lead">
      <div className="attention-lead-original">
        {/*
          The owner's own words, in the reading face. Not editable, not
          summarised, and above the proposal — the InterpretationCard rule.
        */}
        <p className="attention-lead-quote">{item.title}</p>
        {timestamp ? <p className="attention-lead-stamp">{timestamp}</p> : null}
      </div>

      <div className="attention-lead-proposal">
        <p className="attention-lead-eyebrow">
          <span>{proposesLabel}</span>
          <span className="attention-lead-reversible">{reversibleLabel}</span>
        </p>
        <h3 className="attention-lead-title">{reasonCopy.title}</h3>
        <p className="attention-lead-explanation">{item.explanation}</p>

        <div className="attention-lead-actions">
          <a
            className="attention-lead-primary"
            href={item.primaryAction.href ?? "#"}
            onClick={() => recordNeedsAttentionItemOpened({
              entryId: item.entryId,
              attentionReason: item.kind,
              surface,
              locale,
            })}
          >
            {actionLabel}
          </a>
          {/*
            The secondary action is rendered only when the projection carries
            one. A fixed second button would be an affordance invented by the
            surface — the "controle falso" the direction forbids.
          */}
          {item.secondaryAction ? (
            <a className="attention-lead-secondary" href={item.secondaryAction.href ?? "#"}>
              {copy.actions[item.secondaryAction.id]}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
