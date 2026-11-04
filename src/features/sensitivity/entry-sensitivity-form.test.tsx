import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EntrySensitivityForm } from "./entry-sensitivity-form";
import type { EntrySensitivityState } from "./entry-sensitivity-state";

const ENTRY = "e1111111-1111-4111-8111-111111111111";

describe("EntrySensitivityForm", () => {
  it("offers the three levels with the current one selected", () => {
    render(<EntrySensitivityForm action={vi.fn()} entryId={ENTRY} locale="pt-BR" sensitivity="private" />);

    const select = screen.getByLabelText("Sensibilidade") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(["Normal", "Privado", "Muito sensível"]);
    expect(select.value).toBe("private");
  });

  it("submits the chosen level with the record and locale, and announces the outcome", async () => {
    const user = userEvent.setup();
    const seen: FormData[] = [];
    const action = vi.fn(async (_state: EntrySensitivityState, formData: FormData) => {
      seen.push(formData);
      return { status: "success", message: "Sensitivity saved.", sensitivity: "normal" } as const;
    });
    render(<EntrySensitivityForm action={action} entryId={ENTRY} locale="en" sensitivity="private" />);

    await user.selectOptions(screen.getByLabelText("Sensitivity"), "normal");
    await user.click(screen.getByRole("button", { name: "Save sensitivity" }));

    expect(seen[0]?.get("sensitivity")).toBe("normal");
    expect(seen[0]?.get("entryId")).toBe(ENTRY);
    expect(seen[0]?.get("locale")).toBe("en");
    expect(await screen.findByRole("status")).toHaveTextContent("Sensitivity saved.");
  });
});
