import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingFact } from "./setting-fact";

/**
 * A setting as a fact changed in place (Editorial calmo, ADR-180).
 *
 * What is asserted is what the owner reads on the closed row, that the editor
 * is not on screen until it is asked for, and that it is the same mounted
 * editor afterwards — the property that lets a form keep its draft and its
 * outcome across a close and a reopen.
 */
function mount(open?: boolean) {
  return render(
    <SettingFact closeVerb="Fechar" group="g" heading="h3" label="Chave" labelId="k" open={open} value="Configurada" verb="Alterar">
      <label htmlFor="field">Campo</label>
      <input id="field" defaultValue="rascunho" />
    </SettingFact>,
  );
}

describe("SettingFact", () => {
  it("states what the setting is and what it is set to, with one verb", () => {
    mount();
    const summary = document.querySelector("summary")!;
    expect(screen.getByRole("heading", { level: 3, name: "Chave" })).toHaveAttribute("id", "k");
    expect(summary).toHaveTextContent("Configurada");
    // Both verbs are in the markup and the stylesheet shows one of them; each is marked for it.
    expect(summary.querySelector('[data-when="closed"]')).toHaveTextContent("Alterar");
    expect(summary.querySelector('[data-when="open"]')).toHaveTextContent("Fechar");
  });

  it("keeps the editor off screen until the row is opened, and mounted throughout", () => {
    mount();
    const field = screen.getByLabelText("Campo") as HTMLInputElement;
    expect(field).not.toBeVisible();

    field.value = "editado";
    const row = document.querySelector("details")!;
    row.open = true;
    expect(field).toBeVisible();
    row.open = false;
    row.open = true;
    // The same node, with what was typed: closing a row is not discarding it.
    expect(screen.getByLabelText("Campo")).toBe(field);
    expect(field.value).toBe("editado");
  });

  it("arrives open when the page is asking for it, and shares a group so one row is open at a time", () => {
    mount(true);
    const row = document.querySelector("details")!;
    expect(row.open).toBe(true);
    expect(row.getAttribute("name")).toBe("g");
    expect(screen.getByLabelText("Campo")).toBeVisible();
  });
});
