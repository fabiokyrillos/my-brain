"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import { NeedsAttentionItemRow } from "./needs-attention-item";
import type { NeedsAttentionItemView } from "./contracts";
import type { AttentionCursor } from "./attention-projection";
import type { DailyCycleLocale } from "./copy";

export type LoadMoreNeedsAttentionPage = {
  readonly items: readonly NeedsAttentionItemView[];
  readonly hasNext: boolean;
  readonly nextCursor: AttentionCursor | null;
};

export type LoadMoreNeedsAttentionResult =
  | { ok: true; page: LoadMoreNeedsAttentionPage }
  | { ok: false; code: "session_expired" | "action_failed" };

export type LoadMoreNeedsAttention = (cursor: AttentionCursor, locale: DailyCycleLocale) => Promise<LoadMoreNeedsAttentionResult>;

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

export function NeedsAttentionList({
  initialItems,
  initialCursor,
  initialHasNext,
  locale,
  loadMore,
}: {
  initialItems: readonly NeedsAttentionItemView[];
  initialCursor: AttentionCursor | null;
  initialHasNext: boolean;
  locale: DailyCycleLocale;
  loadMore: LoadMoreNeedsAttention;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasNext, setHasNext] = useState(initialHasNext);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const pt = locale === "pt-BR";

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

  return (
    <div className="list-stack needs-attention-list">
      <NeedsAttentionViewed surface="needs_attention" itemCount={items.length} locale={locale} />
      {items.map((item) => <NeedsAttentionItemRow item={item} locale={locale} surface="needs_attention" key={item.key} />)}
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
