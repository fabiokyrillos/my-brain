"use client";

/**
 * `2I-PALETTE-001` … `2I-PALETTE-010` — the command palette.
 *
 * ## What it is, stated by what it cannot do
 *
 * It **navigates**. That is the whole capability. Every entry comes from
 * `actions-registry.ts`, which is data with no handler field, so there is no
 * arrangement of props that lets this component mutate anything. Starting a
 * capture, a conversation or a task means going to the surface that already
 * owns that write, with its preview and confirmation intact.
 *
 * `2I-PALETTE-010`: **not a second application shell.** No nested navigation,
 * no multi-step flow, no state that outlives it. It opens, it filters, it
 * navigates, it closes.
 *
 * ## Accessibility is the feature, not a pass over it
 *
 * A palette that only opens with a keyboard is a desktop power-user toy. This
 * one has an explicit touch trigger (`2I-PALETTE-001`), combobox semantics with
 * `aria-activedescendant` so arrow keys announce the option without moving DOM
 * focus off the input, and **deterministic focus return** to whatever opened
 * it.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { getMessages } from "@/i18n/messages";
import type { Locale } from "@/lib/preferences";

import {
  buildPaletteActions,
  filterPaletteActions,
  type PaletteAction,
} from "./actions-registry";
import { getPaletteCopy } from "./copy";

export type CommandPaletteProps = {
  readonly locale: Locale;
  /**
   * Whether create actions are offered. `false` for a suspended or deleting
   * account: `2I-PALETTE-007` says an unavailable action is **absent**, never
   * shown-and-refused, because refusing it would also confirm the state.
   */
  readonly canCreate?: boolean;
  /** Records the chosen action kind. Content-free by construction. */
  readonly onActionChosen?: (actionId: string, kind: PaletteAction["kind"]) => void;
};

export function CommandPalette({ locale, canCreate = true, onActionChosen }: CommandPaletteProps) {
  const router = useRouter();
  const text = getPaletteCopy(locale);
  const messages = getMessages(locale);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  /** Where focus goes on close. Captured at open, so it is always truthful. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const listId = useId();

  const actions = useMemo(
    () =>
      buildPaletteActions({
        locale,
        availability: { canCreate },
        labels: {
          nav: messages.nav as unknown as Record<string, string>,
          createCapture: text.createCapture,
          createConversation: text.createConversation,
          createTask: text.createTask,
          openSearch: text.openSearch,
          keywords: text.keywords,
        },
      }),
    [locale, canCreate, messages.nav, text],
  );

  const results = useMemo(() => filterPaletteActions(actions, query), [actions, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    // Deterministic focus return. Without this the user is dropped at the top
    // of the document and has to re-find where they were.
    const target = returnFocusRef.current ?? triggerRef.current;
    target?.focus();
  }, []);

  const openPalette = useCallback(() => {
    returnFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    setOpen(true);
  }, []);

  // Ctrl/Cmd+K from anywhere. Registered once, on the document, because the
  // palette must be reachable from a surface that has never heard of it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else openPalette();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close, openPalette]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // The active index resets where the query changes — in the change handler,
  // not in an effect. Resetting from an effect means the list renders once with
  // a stale highlight before correcting itself, which `aria-activedescendant`
  // would announce.
  function onQueryChange(value: string) {
    setQuery(value);
    setActiveIndex(0);
  }

  function choose(action: PaletteAction) {
    // The only effect: a route change. No write, no RPC, no handler lookup.
    onActionChosen?.(action.id, action.kind);
    setOpen(false);
    setQuery("");
    router.push(action.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (results.length === 0 ? 0 : (index - 1 + results.length) % results.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const action = results[activeIndex];
      if (action) choose(action);
    }
  }

  const grouped = useMemo(() => {
    const order: PaletteAction["kind"][] = ["create", "navigate", "search"];
    return order
      .map((kind) => ({ kind, items: results.filter((action) => action.kind === kind) }))
      .filter((group) => group.items.length > 0);
  }, [results]);

  // A flat index across groups, so arrow keys traverse what the eye sees.
  const flat = useMemo(() => grouped.flatMap((group) => group.items), [grouped]);
  const activeId = flat[activeIndex] ? `${listId}-${flat[activeIndex].id}` : undefined;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="palette-trigger"
        onClick={openPalette}
        aria-haspopup="dialog"
        data-palette-trigger="true"
      >
        <span>{text.trigger}</span>
        <kbd aria-hidden="true">{text.triggerHint}</kbd>
      </button>

      {open ? (
        <div className="palette-backdrop" onMouseDown={close} data-palette-backdrop="true">
          <div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label={text.title}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="palette-field">
              <input
                ref={inputRef}
                className="palette-input"
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeId}
                aria-label={text.inputLabel}
                placeholder={text.placeholder}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={onInputKeyDown}
              />
              <button type="button" className="palette-close" onClick={close} aria-label={text.close}>
                ×
              </button>
            </div>

            {/* Announced politely so a screen-reader user hears the count
                change as they type, without the list stealing focus. */}
            <p className="sr-only" role="status" aria-live="polite">
              {text.resultsAnnouncement(flat.length)}
            </p>

            <div className="palette-results" id={listId} role="listbox" aria-label={text.title}>
              {flat.length === 0 ? (
                <div className="palette-empty">
                  <strong>{text.noResults}</strong>
                  <span>{text.noResultsHint}</span>
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.kind} className="palette-group" role="group" aria-label={text.groups[group.kind]}>
                    <span className="palette-group-label" aria-hidden="true">
                      {text.groups[group.kind]}
                    </span>
                    {group.items.map((action) => {
                      const index = flat.indexOf(action);
                      return (
                        <button
                          key={action.id}
                          id={`${listId}-${action.id}`}
                          type="button"
                          role="option"
                          aria-selected={index === activeIndex}
                          className={`palette-option${index === activeIndex ? " is-active" : ""}`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => choose(action)}
                          data-action-id={action.id}
                        >
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
