import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InlineCreateForm, type CreateRecordAction } from "./inline-create-form";

describe("InlineCreateForm", () => {
  it("keeps the entity kind and locale in the submission", () => {
    const action = vi.fn(async () => ({ status: "idle" as const, message: "" })) as CreateRecordAction;
    const { container } = render(<InlineCreateForm action={action} kind="project" locale="pt-BR" />);

    expect(screen.getByRole("textbox", { name: "Nome do projeto" })).toBeInTheDocument();
    expect(container.querySelector('input[name="kind"]')).toHaveValue("project");
    expect(container.querySelector('input[name="locale"]')).toHaveValue("pt-BR");
  });
});
