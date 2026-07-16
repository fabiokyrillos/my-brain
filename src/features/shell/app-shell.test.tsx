import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("exposes navigation and quick capture accessibly", () => {
    render(<AppShell locale="pt-BR"><div>Conteúdo</div></AppShell>);
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /captura rápida/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
  });
});
