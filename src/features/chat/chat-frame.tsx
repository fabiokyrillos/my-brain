"use client";

import { Menu, Search, SquarePen, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { useScrollLock } from "@/features/shell/use-scroll-lock";
import type { Locale } from "@/lib/preferences";

import { filterGroups, type ConversationGroup } from "./conversation-groups";
import { getChatSurfaceCopy } from "./surface-copy";

/** Below this width the menu covers the screen; above it, it sits beside the conversation. */
export const CHAT_MENU_OVERLAY_QUERY = "(max-width: 899px)";
/**
 * A per-tab convenience: on a wide screen the menu starts open beside the
 * conversation, and closing it holds for this session. `sessionStorage`, not
 * `localStorage`, which only the appearance choice may use (T-16).
 */
const MENU_PREFERENCE_KEY = "my-brain.chat-menu-closed";

function readMenuPreference(): boolean {
  try {
    return window.sessionStorage.getItem(MENU_PREFERENCE_KEY) !== "1";
  } catch {
    return true;
  }
}

function writeMenuPreference(open: boolean): void {
  try {
    window.sessionStorage.setItem(MENU_PREFERENCE_KEY, open ? "0" : "1");
  } catch {
    // Storage unavailable (private window, blocked site data): the menu still works.
  }
}

function subscribeToWidth(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(CHAT_MENU_OVERLAY_QUERY);
  media.addEventListener?.("change", onChange);
  return () => media.removeEventListener?.("change", onChange);
}

const noSubscription = () => () => {};

function isOverlay(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia(CHAT_MENU_OVERLAY_QUERY).matches;
}

/**
 * Life Brain E.6 (ADR-176) — the Conversar surface's frame: a header with the
 * conversations menu (☰), the title and "new conversation", and the menu
 * itself. The conversation list lives only here, as in the owner's reference
 * (ChatGPT): the screen is the conversation, and the others are a tap away.
 *
 * On a phone the menu covers the screen (scroll locked, Escape or the scrim
 * closes it, focus goes to the search and back to the button). On a wide
 * screen it opens beside the conversation, and closing it holds for the session.
 */
export function ChatFrame({
  activeId,
  children,
  groups,
  limited,
  locale,
  title,
}: {
  activeId: string | null;
  children: ReactNode;
  groups: readonly ConversationGroup[];
  /** True when the menu holds only the most recent conversations. */
  limited: number | null;
  locale: Locale;
  title: string;
}) {
  const copy = getChatSurfaceCopy(locale);
  const menuId = useId();
  const searchId = useId();
  // The server render and the first client render agree (closed, not an
  // overlay); the width and the remembered preference are read from the
  // browser after that, as external stores.
  const overlay = useSyncExternalStore(subscribeToWidth, isOverlay, () => false);
  const remembered = useSyncExternalStore(noSubscription, readMenuPreference, () => false);
  /** `null` until the owner toggles: then the wide-screen preference decides. */
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? (!overlay && remembered);
  const [query, setQuery] = useState("");
  const button = useRef<HTMLButtonElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);

  const covering = open && overlay;
  useScrollLock(covering);

  const close = useCallback(() => {
    setChosen(false);
    if (!isOverlay()) writeMenuPreference(false);
    button.current?.focus();
  }, []);

  const toggle = useCallback(() => {
    const next = !open;
    setChosen(next);
    if (!isOverlay()) writeMenuPreference(next);
  }, [open]);

  useEffect(() => {
    if (covering) search.current?.focus();
  }, [covering]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open]);

  /** On a phone, choosing a conversation (or a new one) closes the menu; on a wide screen it stays. */
  const onNavigate = useCallback(() => {
    if (isOverlay()) setChosen(false);
  }, []);

  const visible = useMemo(() => filterGroups(groups, query), [groups, query]);
  const empty = groups.length === 0;

  return (
    <div className="chat-surface" data-chat-surface="" data-menu={open ? "open" : "closed"}>
      <nav aria-label={copy.menuLabel} className="chat-menu" hidden={!open} id={menuId}>
        <div className="chat-menu-head">
          <Link className="chat-menu-new" href={`/${locale}/app/chat`} onClick={onNavigate}>
            <SquarePen aria-hidden="true" size={18} />
            {copy.newConversation}
          </Link>
          <button aria-label={copy.closeMenu} className="chat-menu-close" onClick={close} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        {empty ? null : (
          <div className="chat-menu-search">
            <Search aria-hidden="true" size={16} />
            <label className="sr-only" htmlFor={searchId}>{copy.searchLabel}</label>
            <input
              autoComplete="off"
              id={searchId}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              ref={search}
              type="search"
              value={query}
            />
          </div>
        )}
        <div className="chat-menu-groups">
          {empty ? <p className="chat-menu-empty">{copy.noConversations}</p> : null}
          {!empty && visible.length === 0 ? <p className="chat-menu-empty">{copy.noMatches}</p> : null}
          {visible.map((group) => (
            <section aria-labelledby={`${menuId}-${group.key}`} className="chat-menu-group" key={group.key}>
              <h2 className="chat-menu-group-title" id={`${menuId}-${group.key}`}>{group.label}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      aria-current={item.id === activeId ? "page" : undefined}
                      href={`/${locale}/app/chat/${item.id}`}
                      onClick={onNavigate}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {limited === null ? null : <p className="chat-menu-note">{copy.olderHidden(limited)}</p>}
        </div>
      </nav>
      {covering ? <div aria-hidden="true" className="chat-menu-scrim" onClick={close} /> : null}

      <div className="chat-column">
        <header className="chat-header">
          <button
            aria-controls={menuId}
            aria-expanded={open}
            aria-label={open ? copy.closeMenu : copy.openMenu}
            className="chat-header-button"
            onClick={toggle}
            ref={button}
            type="button"
          >
            <Menu aria-hidden="true" size={22} />
          </button>
          <h1 className="chat-header-title">{title}</h1>
          <Link
            aria-label={copy.newConversation}
            className="chat-header-button"
            data-current={activeId === null ? "" : undefined}
            href={`/${locale}/app/chat`}
          >
            <SquarePen aria-hidden="true" size={21} />
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}
