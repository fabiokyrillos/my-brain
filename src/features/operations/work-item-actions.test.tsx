import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkItemActions } from "./work-item-actions";
import { idleWorkItemActionState } from "./work-action-state";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("WorkItemActions optimistic feedback", () => {
  it("marks the selected reversible action as applying before the server settles", async () => {
    let settle!: () => void;
    const action = vi.fn(async () => {
      await new Promise<void>((resolve) => { settle = resolve; });
      return idleWorkItemActionState;
    });
    render(
      <WorkItemActions
        action={action}
        locale="pt-BR"
        task={{ taskId: "task-1", title: "Enviar contrato", availableActions: [{ id: "complete_task" }] } as never}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Concluir" }));

    expect(screen.getByRole("button", { name: "Aplicando…" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Aplicando…" })).toBeDisabled();
    settle();
  });
});
