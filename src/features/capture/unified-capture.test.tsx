/**
 * `2J-CAPTURE-001` … `2J-CAPTURE-007`, as rendered.
 *
 * The structural half — that no second write path exists — is
 * `capture-write-path-guard.test.ts`. This file covers the behaviour a user
 * meets: one surface, several modalities, nothing classified first, and an
 * absent voice tab rather than a disabled one.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CAPTURE_MODES, UnifiedCapture } from "./unified-capture";

afterEach(cleanup);

function renderSurface(overrides: { voice?: React.ReactNode; onModeChange?: (m: string) => void } = {}) {
  return render(
    <UnifiedCapture
      locale="pt-BR"
      textAction={<div data-testid="text-panel">campo de texto</div>}
      attachmentAction={<div data-testid="file-panel">enviar arquivo</div>}
      voice={overrides.voice}
      onModeChange={overrides.onModeChange}
    />,
  );
}

describe("2J-CAPTURE-001: one surface, several modalities", () => {
  it("opens on text, because typing is the fastest path out of your head", () => {
    renderSurface();
    expect(screen.getByTestId("text-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("file-panel")).toBeNull();
  });

  it("switches to the attachment modality without leaving the surface", () => {
    renderSurface();
    fireEvent.click(screen.getByRole("tab", { name: /Arquivo/ }));
    expect(screen.getByTestId("file-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("text-panel")).toBeNull();
  });

  it("uses tab semantics, so the modalities announce themselves as alternatives", () => {
    renderSurface();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-label");
    // Roving tabindex: exactly one tab is in the tab order at a time.
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("points each panel back at the tab that controls it", () => {
    renderSurface();
    const panel = screen.getByRole("tabpanel");
    const labelledBy = panel.getAttribute("aria-labelledby");
    expect(document.getElementById(labelledBy ?? "")).toHaveAttribute("role", "tab");
  });
});

describe("2J-CAPTURE-005: nothing is classified before capture", () => {
  it("offers no type, project, person or tag control", () => {
    renderSurface();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByLabelText(/projeto|pessoa|tipo|tag/i)).toBeNull();
  });

  it("says so, because the absence of a rule is invisible", () => {
    renderSurface();
    expect(screen.getByText(/Não precisa classificar nada antes/)).toBeInTheDocument();
  });
});

describe("voice is absent until slice 2J.4 provides it", () => {
  it("renders no voice tab when no voice composer is supplied", () => {
    // `2I-PALETTE-007`'s shape: an unavailable action is absent, never
    // shown-and-refused -- refusing it would also announce it.
    renderSurface();
    expect(screen.queryByRole("tab", { name: /Falar/ })).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("renders the voice tab as soon as one is supplied, with no other change", () => {
    renderSurface({ voice: <div data-testid="voice-panel">gravar</div> });
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: /Falar/ }));
    expect(screen.getByTestId("voice-panel")).toBeInTheDocument();
  });

  it("declares all three modalities in its vocabulary", () => {
    expect([...CAPTURE_MODES]).toEqual(["text", "attachment", "voice"]);
  });
});

describe("mode reporting is content-free", () => {
  it("reports only which modality was chosen", () => {
    const onModeChange = vi.fn();
    renderSurface({ onModeChange });
    fireEvent.click(screen.getByRole("tab", { name: /Arquivo/ }));
    expect(onModeChange).toHaveBeenCalledWith("attachment");
    // One argument, and it is a closed enum member. There is nowhere to put a
    // filename, a draft or anything else the user wrote.
    expect(onModeChange.mock.calls[0]).toHaveLength(1);
  });

  it("does not report a change when the same modality is re-selected", () => {
    const onModeChange = vi.fn();
    renderSurface({ onModeChange });
    fireEvent.click(screen.getByRole("tab", { name: /Escrever/ }));
    expect(onModeChange).not.toHaveBeenCalled();
  });
});
