"use client";

import { useMemo, useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import {
  NeedsAttentionViewed,
  recordAttentionItemResolved,
} from "@/features/product-analytics/interaction-events";
import { presentationFor } from "@/features/sensitivity/contracts";
import { NeedsAttentionItemRow } from "./needs-attention-item";
import { trackedAttentionReasons, type NeedsAttentionItemView, type TrackedAttentionReason } from "./contracts";
import type { AttentionCursor } from "./attention-projection";
import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";

export type LoadMoreNeedsAttentionPage = {
  readonly items: readonly NeedsAttentionItemView[];
  readonly hasNext: boolean;
  readonly nextCursor: AttentionCursor | null;
};

export type LoadMoreNeedsAttentionResult =
  | { ok: true; page: LoadMoreNeedsAttentionPage }
  | { ok: false; code: "session_expired" | "action_failed" };

export type LoadMoreNeedsAttention = (cursor: AttentionCursor, locale: DailyCycleLocale) => Promise<LoadMoreNeedsAttentionResult>;

/**
 * `2J-ATTN-007`. The one reason whose resolution is a single bounded action.
 *
 * The audit checked all five against the actions that already own them:
 * `review_interpretation` needs the interpretation, `confirm_existing_candidates`
 * needs the candidate list, `answer_existing_question` needs an answer, and
 * `resolve_consistency` needs the entry's context. Each of those is a decision,
 * not a click, and offering a one-tap version would either guess for the user or
 * be a shortcut that drops them somewhere mid-flow.
 *
 * `retry_processing` is different: the whole action is "try again", it is
 * already idempotent through `enqueue_entry_reprocessing`'s operation key, and
 * there is nothing for the user to choose. So it -- and only it -- resolves in
 * place. Everything else navigates, and says so.
 */
const RESOLVABLE_IN_PLACE: TrackedAttentionReason = "retry_processing";

/**
 * `2J-ATTN-007`/`2J-CAPTURE-004`. The retry Server Action, injected.
 *
 * Typed structurally rather than imported, so this client component never
 * reaches into `interpretations/actions.ts` and pull `server-only` into the
 * browser bundle. More importantly: the page passes the **existing** action, so
 * there is no generic "resolve attention item" executor anywhere. A new write
 * path would have to be written somewhere visible rather than appearing as one
 * more prop on a list.
 */
export type AttentionActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type RetryProcessingAction = (
  state: AttentionActionState,
  formData: FormData,
) => Promise<AttentionActionState>;

const errorMessages: Record<DailyCycleLocale, Record<"session_expired" | "action_failed", string>> = {
  "pt-BR": {
    session_expired: "Sua sessão expirou. Entre novamente.",
    action_failed: "Não foi possível carregar mais itens agora.",
  },
  en: {
    session_expired: "Your session expired. Sign in again.",
    action_failed: "We could not load more items right now.",
  },
};

const filterCopy = {
  "pt-BR": {
    legend: "Filtrar por tipo",
    all: "Tudo",
    retry: "Tentar de novo",
    retryAll: "Tentar de novo tudo que falhou",
    retrying: "Tentando…",
    retryFailed: "Não foi possível tentar de novo agora. O original foi preservado.",
    masked: "Conteúdo muito sensível, oculto",
    emptyFiltered: "Nenhum item deste tipo entre os carregados.",
  },
  en: {
    legend: "Filter by type",
    all: "All",
    retry: "Try again",
    retryAll: "Try again for everything that failed",
    retrying: "Trying…",
    retryFailed: "Could not try again right now. The original was preserved.",
    masked: "Highly sensitive content, hidden",
    emptyFiltered: "No item of this type among the ones loaded.",
  },
} as const;

export function NeedsAttentionList({
  initialItems,
  initialCursor,
  initialHasNext,
  locale,
  agentName,
  loadMore,
  retryAction,
  timeZone,
}: {
  initialItems: readonly NeedsAttentionItemView[];
  initialCursor: AttentionCursor | null;
  initialHasNext: boolean;
  locale: DailyCycleLocale;
  agentName: string;
  loadMore: LoadMoreNeedsAttention;
  /** Omitted by callers that do not offer in-place retry (e.g. a preview). */
  retryAction?: RetryProcessingAction;
  /**
   * The owner's zone (`LDC-DAILY-001`). Threaded through the list rather than
   * read per row: twenty rows resolving their own zone is twenty chances for one
   * to resolve it differently, which is the shape the contract exists to stop.
   */
  timeZone: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasNext, setHasNext] = useState(initialHasNext);
  const [error, setError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retried, setRetried] = useState<ReadonlySet<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<TrackedAttentionReason | "all">("all");
  const [isPending, startTransition] = useTransition();
  const [isRetrying, startRetry] = useTransition();
  const pt = locale === "pt-BR";
  const text = filterCopy[locale];
  const copy = getDailyCycleCopy(locale, agentName);

  /**
   * `2J-ATTN-005`. A pure narrowing of what is already loaded -- not a second
   * query. A server-side filter would be a second shape over
   * `list_needs_attention`, and two shapes over one RPC is how an ownership
   * scope comes to differ between them.
   *
   * Only reasons actually present are offered, so the control never advertises
   * a filter that would yield nothing.
   */
  const availableReasons = useMemo(
    () => trackedAttentionReasons.filter((reason) => items.some((item) => item.kind === reason)),
    [items],
  );

  const visible = useMemo(
    () => (activeFilter === "all" ? items : items.filter((item) => item.kind === activeFilter)),
    [items, activeFilter],
  );

  /**
   * `2J-ATTN-010`. Bulk is offered only where the items are semantically
   * equivalent and independently safe: same reason, same action, no per-item
   * decision, and each already idempotent on its own operation key. Retry is
   * the only set that qualifies, and it is offered only when there is more than
   * one -- a "bulk" control over a single item is a second button for the
   * button beside it.
   */
  const retryable = useMemo(
    () => visible.filter((item) => item.kind === RESOLVABLE_IN_PLACE && !retried.has(item.key)),
    [visible, retried],
  );

  function handleLoadMore() {
    if (!cursor || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await loadMore(cursor, locale);
      if (!result.ok) {
        setError(errorMessages[locale][result.code]);
        return;
      }
      setItems((previous) => [...previous, ...result.page.items]);
      setCursor(result.page.nextCursor);
      setHasNext(result.page.hasNext);
    });
  }

  function retry(targets: readonly NeedsAttentionItemView[]) {
    if (!retryAction || isRetrying || targets.length === 0) return;
    setRetryError(null);
    // `2J-METRICS-002`. Measured from the click, bucketed at the emitter -- the
    // raw elapsed value never leaves this function.
    const startedAt = Date.now();
    const resolutionAction = targets.length > 1 ? ("bulk_retry" as const) : ("retry" as const);
    startRetry(async () => {
      const succeeded: string[] = [];
      for (const item of targets) {
        const form = new FormData();
        form.set("entryId", item.entryId);
        // A fresh key per attempt is correct here: this is a *user-requested*
        // reinterpretation, which the ledger counts as its own operation. The
        // idempotency that matters -- a double-tap producing one job -- is
        // covered because the button is disabled for the whole transition.
        form.set("operationKey", crypto.randomUUID());
        form.set("locale", locale);
        const result = await retryAction({ status: "idle", message: "" }, form);
        if (result.status === "error") {
          setRetryError(text.retryFailed);
          break;
        }
        succeeded.push(item.key);
      }
      if (succeeded.length > 0) {
        setRetried((previous) => new Set([...previous, ...succeeded]));
        const elapsedMs = Date.now() - startedAt;
        for (const item of targets.filter((candidate) => succeeded.includes(candidate.key))) {
          recordAttentionItemResolved({
            entryId: item.entryId,
            // The only reason resolvable in place, and the only one this event
            // can carry -- the enum has exactly one member.
            attentionReason: "retry_processing",
            resolutionAction,
            elapsedMs,
            locale,
          });
        }
      }
    });
  }

  return (
    <div className="list-stack needs-attention-list">
      <NeedsAttentionViewed surface="needs_attention" itemCount={items.length} locale={locale} />

      {availableReasons.length > 1 ? (
        <fieldset className="attention-filters">
          <legend>{text.legend}</legend>
          <button
            type="button"
            className="attention-filter"
            aria-pressed={activeFilter === "all"}
            onClick={() => setActiveFilter("all")}
          >
            {text.all}
          </button>
          {availableReasons.map((reason) => (
            <button
              key={reason}
              type="button"
              className="attention-filter"
              aria-pressed={activeFilter === reason}
              onClick={() => setActiveFilter(reason)}
            >
              {copy.attentionReasons[reason].title}
            </button>
          ))}
        </fieldset>
      ) : null}

      {retryAction && retryable.length > 1 ? (
        <button
          type="button"
          className="button-secondary attention-bulk-retry"
          onClick={() => retry(retryable)}
          disabled={isRetrying}
        >
          {isRetrying && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
          {isRetrying ? text.retrying : text.retryAll}
        </button>
      ) : null}

      {visible.length === 0 && items.length > 0 ? (
        <p className="quiet-state">{text.emptyFiltered}</p>
      ) : null}

      {visible.map((item) => {
        /*
          `2J-PRIVACY-001`/`004`/`005`. Masked in place: the row stays, so the
          count and the filter chips keep telling the truth, and only the entry
          preview is withheld.
        */
        if (presentationFor("attention", item.sensitivity).outcome === "mask") {
          return (
            <p className="home-masked" data-masked="true" key={item.key}>
              {text.masked}
            </p>
          );
        }
        const canRetryHere = Boolean(retryAction) && item.kind === RESOLVABLE_IN_PLACE && !retried.has(item.key);
        return (
          <div className="attention-entry" key={item.key}>
            <NeedsAttentionItemRow item={item} locale={locale} agentName={agentName} surface="needs_attention" timeZone={timeZone} />
            {canRetryHere ? (
              <button
                type="button"
                className="button-secondary attention-inline-retry"
                onClick={() => retry([item])}
                disabled={isRetrying}
              >
                {isRetrying ? text.retrying : text.retry}
              </button>
            ) : null}
          </div>
        );
      })}

      {retryError && <p role="alert" className="form-error">{retryError}</p>}
      {error && <p role="alert" className="form-error needs-attention-error">{error}</p>}
      {hasNext && (
        <button
          type="button"
          className="button-secondary load-more-button"
          onClick={handleLoadMore}
          disabled={isPending}
        >
          {isPending && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
          {pt ? "Carregar mais" : "Load more"}
        </button>
      )}
    </div>
  );
}
