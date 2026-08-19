import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutomationSection } from "./automation-section";
import type { AutomationPolicyChange } from "./automation-data";
import {
  AUTOMATION_CATEGORIES,
  CALIBRATION_THRESHOLDS,
  type AutomationCategory,
  type AutomationCategoryDecision,
} from "./automation-policy";

function decision(
  category: AutomationCategory,
  overrides: Partial<AutomationCategoryDecision> = {},
): AutomationCategoryDecision {
  return {
    category,
    state: "suggest_only",
    eligible: false,
    reason: "suggest_only_by_owner",
    calibration: {
      reviewed: 0,
      approved: 0,
      corrected: 0,
      rejected: 0,
      undone: 0,
      precision: null,
      recentReviewed: 0,
      newestObservedAt: null,
      recentUndo: false,
      hasProducer: category === "task" || category === "person",
    },
    requiredReviewed: CALIBRATION_THRESHOLDS[category].minimumReviewed,
    requiredPrecision: CALIBRATION_THRESHOLDS[category].minimumPrecision,
    ...overrides,
  };
}

function renderSection(
  decisions: readonly AutomationCategoryDecision[],
  history: readonly AutomationPolicyChange[] = [],
) {
  const saveAction = vi.fn(async () => {});
  const undoAction = vi.fn(async () => {});
  return {
    saveAction,
    undoAction,
    ...render(
      <AutomationSection
        locale="pt-BR"
        decisions={decisions}
        history={history}
        saveAction={saveAction}
        undoAction={undoAction}
      />,
    ),
  };
}

const allSix = AUTOMATION_CATEGORIES.map((category) => decision(category));

describe("the automation surface says what is actually happening", () => {
  it("renders all six categories, including the four nobody has touched", () => {
    renderSection(allSix);
    const list = screen.getByRole("list", { name: "Categorias e suas políticas" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    for (const name of ["Tarefas", "Pessoas", "Projetos", "Empresas", "Memórias", "Relações"]) {
      expect(within(list).getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("states the safe posture rather than leaving it to be inferred", () => {
    renderSection(allSix);
    expect(screen.getByText(/nenhuma categoria age sozinha/i)).toBeInTheDocument();
  });

  it("drops the posture line the moment a category really is automatic", () => {
    // The two-sided control for the assertion above: the line is conditional,
    // not decorative, so its presence is evidence rather than furniture.
    renderSection([
      decision("task", { state: "automatic_when_eligible", eligible: true, reason: "automatic" }),
      ...allSix.slice(1),
    ]);
    expect(screen.queryByText(/nenhuma categoria age sozinha/i)).not.toBeInTheDocument();
  });

  it("gives each category its own specific reason, never a generic one", () => {
    renderSection([
      decision("task", { state: "disabled", reason: "automation_disabled_by_owner" }),
      decision("person", { state: "automatic_when_eligible", reason: "insufficient_calibration" }),
      decision("project", { state: "automatic_when_eligible", reason: "blocked_by_recent_undo" }),
      decision("organization"),
      decision("memory"),
      decision("relation"),
    ]);

    expect(screen.getByText("Você desativou esta categoria.")).toBeInTheDocument();
    expect(screen.getByText(/exemplos revisados suficientes/i)).toBeInTheDocument();
    expect(screen.getByText(/desfez uma decisão recente/i)).toBeInTheDocument();
  });

  it("distinguishes `no evidence yet` from `no way to gather evidence`", () => {
    renderSection(allSix);
    // Four categories have no review flow at all; two have one and no rows.
    expect(screen.getAllByText(/não existe um fluxo de revisão/i)).toHaveLength(4);
    expect(screen.getAllByText("Nenhum exemplo revisado ainda.")).toHaveLength(2);
  });

  it("shows correction, rejection and undo as separate counts", () => {
    renderSection([
      decision("task", {
        calibration: {
          reviewed: 4,
          approved: 1,
          corrected: 1,
          rejected: 1,
          undone: 1,
          precision: 0.25,
          recentReviewed: 4,
          newestObservedAt: "2026-08-18T00:00:00.000Z",
          recentUndo: true,
          hasProducer: true,
        },
      }),
    ]);

    for (const label of ["revisados", "aceitos", "corrigidos", "rejeitados", "desfeitos", "acerto"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("names how many reviewed examples are still missing, only for an armed category", () => {
    renderSection([
      decision("task", { state: "automatic_when_eligible", reason: "insufficient_calibration" }),
      decision("person"),
    ]);
    expect(screen.getByText("Faltam 50 exemplos revisados.")).toBeInTheDocument();
    expect(screen.queryByText(/Faltam 80/)).not.toBeInTheDocument();
  });
});

describe("the control and its reversal", () => {
  it("offers the three states on every category, defaulted to the stored one", () => {
    renderSection([decision("memory", { state: "disabled" })]);
    const select = screen.getByLabelText("Política") as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual([
      "disabled",
      "suggest_only",
      "automatic_when_eligible",
    ]);
    expect(select.value).toBe("disabled");
  });

  it("carries the category in the payload rather than in the control name", () => {
    // One governed control name across six forms, and the category travels as a
    // hidden field. A per-category name would need six registry entries and
    // would make a seventh category a change in three places.
    const { container } = renderSection(allSix);
    expect(container.querySelectorAll('select[name="automationCategoryState"]')).toHaveLength(6);
    expect(container.querySelectorAll('input[type="hidden"][name="category"]')).toHaveLength(6);
  });

  it("describes each select by its own evidence block, so the refusal is announced with it", () => {
    renderSection([decision("relation")]);
    const select = screen.getByLabelText("Política");
    expect(select).toHaveAttribute("aria-describedby", "automation-evidence-relation");
    expect(document.getElementById("automation-evidence-relation")).toBeInTheDocument();
  });

  it("offers undo from the persisted history, not from a banner", () => {
    renderSection(allSix, [
      {
        undoId: "11111111-1111-4111-8111-111111111111",
        category: "task",
        from: null,
        to: "disabled",
        changedAt: "2026-08-19T11:00:00.000Z",
        undoable: true,
      },
    ]);
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
  });

  it("stops offering undo once the operation is spent", () => {
    renderSection(allSix, [
      {
        undoId: "22222222-2222-4222-8222-222222222222",
        category: "task",
        from: "suggest_only",
        to: "disabled",
        changedAt: "2026-08-19T11:00:00.000Z",
        undoable: false,
      },
    ]);
    expect(screen.queryByRole("button", { name: "Desfazer" })).not.toBeInTheDocument();
    // Non-vacuous: the entry itself is still listed, so the missing button is a
    // withdrawn offer rather than a missing row.
    expect(screen.getByText(/Tarefas: de Apenas sugerir/)).toBeInTheDocument();
  });
});

describe("both locales", () => {
  it("renders English without a single Portuguese string leaking through", () => {
    render(
      <AutomationSection
        locale="en"
        decisions={allSix}
        history={[]}
        saveAction={vi.fn(async () => {})}
        undoAction={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByRole("heading", { name: "Automation by category" })).toBeInTheDocument();
    expect(screen.getByText(/No category acts on its own today/)).toBeInTheDocument();
    expect(screen.queryByText(/Tarefas/)).not.toBeInTheDocument();
  });
});
