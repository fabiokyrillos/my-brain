import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuestionOutcomeCard } from "./question-outcome-panel";
import type { QuestionOutcomeView } from "./question-outcome-projection";

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a className={className} href={href}>{children}</a>
  ),
}));

afterEach(cleanup);

const ENTRY_ID = "11111111-1111-4111-8111-111111111111";

function outcome(overrides: Partial<QuestionOutcomeView> = {}): QuestionOutcomeView {
  return {
    questionId: "22222222-2222-4222-8222-222222222222",
    question: "Marina é a responsável ou só participa?",
    reason: "A captura cita duas pessoas sem definir papéis.",
    disposition: "answered",
    answer: "Ela é a responsável.",
    answeredAt: "2026-07-29T18:30:00.000Z",
    deferredUntil: null,
    entryId: ENTRY_ID,
    reinterpreted: false,
    ...overrides,
  };
}

describe("QuestionOutcomeCard", () => {
  it("shows what the owner wrote, which the queue never did", () => {
    render(<QuestionOutcomeCard agentName="Brain" locale="pt-BR" outcome={outcome()} />);

    expect(screen.getByText("Você respondeu")).toBeVisible();
    expect(screen.getByText("Ela é a responsável.")).toBeVisible();
  });

  it("distinguishes a re-read record from a merely recorded answer", () => {
    // The distinction is the point. `resolve_pending_question_v3` applies a
    // consequence only when the caller asks for one, so claiming a re-read on
    // every answer would describe work that never happened.
    const { unmount } = render(
      <QuestionOutcomeCard agentName="Brain" locale="pt-BR" outcome={outcome({ reinterpreted: true })} />,
    );
    expect(screen.getByText(/reinterpretou o registro/)).toBeVisible();
    unmount();

    render(<QuestionOutcomeCard agentName="Brain" locale="pt-BR" outcome={outcome({ reinterpreted: false })} />);
    expect(screen.getByText(/não reinterpretou nada/)).toBeVisible();
  });

  it("names the assistant by whatever the owner calls it", () => {
    render(<QuestionOutcomeCard agentName="Ada" locale="pt-BR" outcome={outcome({ reinterpreted: true })} />);

    expect(screen.getByText(/O Ada reinterpretou o registro/)).toBeVisible();
    expect(screen.queryByText(/\{agent\}/)).toBeNull();
  });

  it("always links to where the decision is recorded", () => {
    render(<QuestionOutcomeCard agentName="Brain" locale="pt-BR" outcome={outcome()} />);

    const link = screen.getByRole("link", { name: /Ver o registro/ });
    expect(link).toHaveAttribute("href", `/pt-BR/app/inbox/${ENTRY_ID}`);
  });

  it("says nothing changed when the question was dismissed", () => {
    render(
      <QuestionOutcomeCard
        agentName="Brain"
        locale="pt-BR"
        outcome={outcome({ disposition: "dismissed", answer: null, reinterpreted: false })}
      />,
    );

    expect(screen.getByText("Descartada")).toBeVisible();
    expect(screen.getByText(/Nada no registro mudou/)).toBeVisible();
    expect(screen.queryByText("Você respondeu")).toBeNull();
  });

  it("tells a deferred question when it comes back", () => {
    render(
      <QuestionOutcomeCard
        agentName="Brain"
        locale="pt-BR"
        outcome={outcome({
          disposition: "deferred",
          answer: null,
          answeredAt: null,
          deferredUntil: "2026-08-05T09:00:00.000Z",
        })}
      />,
    );

    expect(screen.getByText("Adiada")).toBeVisible();
    expect(screen.getByText(/volta em/)).toBeVisible();
    expect(screen.getByText(/volta para a fila/)).toBeVisible();
  });

  it("carries the disposition as data, so the surface can style it without re-deriving it", () => {
    const { container } = render(
      <QuestionOutcomeCard agentName="Brain" locale="pt-BR" outcome={outcome({ disposition: "deferred" })} />,
    );
    expect(container.querySelector(".question-outcome")).toHaveAttribute("data-disposition", "deferred");
  });

  it("localizes every visible string in English", () => {
    render(<QuestionOutcomeCard agentName="Brain" locale="en" outcome={outcome({ reinterpreted: true })} />);

    expect(screen.getByText("Answered")).toBeVisible();
    expect(screen.getByText("You answered")).toBeVisible();
    expect(screen.getByText(/Brain re-read the record/)).toBeVisible();
    expect(screen.getByRole("link", { name: /Open the record/ })).toBeVisible();
  });
});
