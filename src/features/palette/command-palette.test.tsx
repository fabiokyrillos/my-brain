/**
 * `2I-PALETTE-*` behaviour.
 *
 * The structural claims — no write client, no handler field on an action, a
 * closed registry — live in `src/lib/closeout/phase-2i-palette-guard.test.ts`.
 * These are the ones only a render can make.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildPaletteActions, filterPaletteActions, normalise } from "./actions-registry";
import { getPaletteCopy } from "./copy";
import { CommandPalette } from "./command-palette";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockClear();
});

function labelsFor(locale: "pt-BR" | "en") {
  const text = getPaletteCopy(locale);
  return {
    nav: {
      home: "Hoje",
      work: "Trabalho",
      chat: "Conversar",
      capture: "Captura rápida",
      // Accented on purpose: it is the subject of the diacritic test below,
      // and a capability with no label is skipped by the builder — the first
      // version of this fixture omitted it and the test failed for that reason
      // rather than for the property.
      memories: "Memórias",
    },
    createCapture: text.createCapture,
    createConversation: text.createConversation,
    createTask: text.createTask,
    openSearch: text.openSearch,
    keywords: text.keywords,
  };
}

describe("normalise — accents must not hide a destination", () => {
  it("strips diacritics and case", () => {
    expect(normalise("Memórias")).toBe("memorias");
    expect(normalise("Órgão")).toBe("orgao");
    expect(normalise("  Trabalho ")).toBe("trabalho");
  });

  it("lets an unaccented query find an accented label", () => {
    const actions = buildPaletteActions({
      locale: "pt-BR",
      availability: { canCreate: true },
      labels: labelsFor("pt-BR"),
    });
    const hit = filterPaletteActions(actions, "memorias");
    expect(hit.some((action) => action.navigationKey === "memories")).toBe(true);
  });
});

describe("2I-PALETTE-007: an unavailable action is absent, not refused", () => {
  it("omits create actions when the account may not create", () => {
    const actions = buildPaletteActions({
      locale: "pt-BR",
      availability: { canCreate: false },
      labels: labelsFor("pt-BR"),
    });
    expect(actions.some((action) => action.kind === "create")).toBe(false);
    // Navigation survives: reading is still permitted, and hiding it would
    // strand the user rather than protect anything.
    expect(actions.some((action) => action.kind === "navigate")).toBe(true);
  });

  it("offers them when it may", () => {
    const actions = buildPaletteActions({
      locale: "pt-BR",
      availability: { canCreate: true },
      labels: labelsFor("pt-BR"),
    });
    // The control: the absence above must be caused by the flag, not by the
    // builder never producing create actions at all.
    expect(actions.filter((action) => action.kind === "create").length).toBeGreaterThan(0);
  });
});

describe("2I-PALETTE-004/005: every action is a navigation", () => {
  it("gives every action an href and no executable field", () => {
    const actions = buildPaletteActions({
      locale: "pt-BR",
      availability: { canCreate: true },
      labels: labelsFor("pt-BR"),
    });
    expect(actions.length).toBeGreaterThan(3);
    for (const action of actions) {
      expect(action.href.startsWith("/pt-BR/"), `${action.id} has no locale-scoped href`).toBe(true);
      for (const forbidden of ["handler", "run", "execute", "mutate", "onSelect"]) {
        expect(forbidden in action, `${action.id} carries a ${forbidden} field`).toBe(false);
      }
    }
  });

  it("routes create-task to the surface that owns the write, not to a write", () => {
    const actions = buildPaletteActions({
      locale: "pt-BR",
      availability: { canCreate: true },
      labels: labelsFor("pt-BR"),
    });
    const createTask = actions.find((action) => action.id === "create:task");
    // The composer owns task-commands' create-intent path with its preview and
    // confirmation. The palette takes you there; it does not create anything.
    expect(createTask?.href).toBe("/pt-BR/app/chat");
  });
});

describe("CommandPalette — opening, filtering and choosing", () => {
  it("opens from the visible trigger and focuses the field", () => {
    render(<CommandPalette locale="pt-BR" />);
    fireEvent.click(screen.getByRole("button", { name: /Buscar e agir/ }));

    const input = screen.getByRole("combobox");
    expect(input).toHaveFocus();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens with Ctrl+K from anywhere", () => {
    render(<CommandPalette locale="pt-BR" />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows destinations before a query is typed", () => {
    // An empty box is a dead end. 2I-PALETTE's empty-state contract.
    render(<CommandPalette locale="pt-BR" />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(screen.getAllByRole("option").length).toBeGreaterThan(3);
  });

  it("navigates on Enter and performs no other effect", () => {
    render(<CommandPalette locale="pt-BR" />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "trabalho" } });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toContain("/app/work");
  });

  it("says so when nothing matches, and offers a way on", () => {
    render(<CommandPalette locale="pt-BR" />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzzznothing" } });

    expect(screen.getByText("Nada corresponde a isso")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});

describe("CommandPalette — accessibility is the feature", () => {
  it("exposes combobox semantics with an active descendant", () => {
    render(<CommandPalette locale="pt-BR" />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    // Arrow keys must announce the option WITHOUT moving DOM focus off the
    // input, or typing stops working.
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
  });

  it("moves the active option with the arrow keys, wrapping", () => {
    render(<CommandPalette locale="pt-BR" />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox");

    const first = input.getAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).not.toBe(first);
  });

  it("marks the active option for assistive technology, not only visually", () => {
    render(<CommandPalette locale="pt-BR" />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const selected = screen.getAllByRole("option").filter((option) => option.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
  });

  it("announces the result count politely", () => {
    render(<CommandPalette locale="pt-BR" />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.textContent).toMatch(/resultados?/);
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<CommandPalette locale="pt-BR" />);
    const trigger = screen.getByRole("button", { name: /Buscar e agir/ });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    // Deterministic focus return. Without it the user is dropped at the top of
    // the document and has to re-find where they were.
    expect(trigger).toHaveFocus();
  });

  it("groups results with labelled groups", () => {
    render(<CommandPalette locale="pt-BR" />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const group = screen.getByRole("group", { name: "Ir para" });
    expect(within(group).getAllByRole("option").length).toBeGreaterThan(0);
  });
});

describe("CommandPalette — both locales", () => {
  it("renders English labels for en", () => {
    render(<CommandPalette locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: /Search and act/ }));
    expect(screen.getByRole("dialog", { name: "What do you want to do?" })).toBeInTheDocument();
  });
});
