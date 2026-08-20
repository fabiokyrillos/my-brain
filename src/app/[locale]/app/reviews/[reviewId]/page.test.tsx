import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { requireUser } from "@/lib/auth/require-user";
import ReviewDetailPage from "./page";

const notFound = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));

vi.mock("@/features/calendar/calendar-projection", () => ({
  requireProfileTimeZone: vi.fn(async () => "America/Sao_Paulo"),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/agent/actions", () => ({ generateReview: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  notFound,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const ROW = {
  id: "r1",
  title: "Revisão semanal",
  content: "## Revisão da semana\n\n### Entregas\n\n- **Contrato** fechado.",
  period_type: "weekly_review",
  period_start: "2026-08-10",
  period_end: "2026-08-13",
  status: "generated",
  generated_at: "2026-08-13T18:00:00.000Z",
  model: "gpt-5.6-terra",
};

/**
 * The client records what it was asked, and answers the same thing whatever it
 * is asked for.
 *
 * A stub keyed by table name cannot detect a wrong table name — this repository
 * shipped `.from("reviews")` for weeks past a green unit test because the fake
 * agreed with the bug. So the assertions check the **arguments**, and the
 * `from` spy is what proves the table.
 */
function supabaseStub(row: unknown, error: unknown = null) {
  const calls: Record<string, unknown[][]> = {};
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    query[method] = vi.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return query;
    });
  }
  query.maybeSingle = vi.fn(async () => ({ data: row, error }));
  const from = vi.fn((table: string) => {
    (calls.from ??= []).push([table]);
    return query;
  });
  return { calls, client: { from } };
}

async function mount(row: unknown = ROW, reviewId = "r1", error: unknown = null) {
  const stub = supabaseStub(row, error);
  vi.mocked(requireUser).mockResolvedValue({ supabase: stub.client, user: { id: "user-1" } } as never);
  const element = await ReviewDetailPage({
    params: Promise.resolve({ locale: "pt-BR", reviewId }),
  }) as React.ReactElement;
  return { ...render(element), stub };
}

describe("the review opens on a page of its own", () => {
  it("reads one summaries row, owner-scoped and by id", async () => {
    const { stub } = await mount();
    expect(stub.calls.from).toEqual([["summaries"]]);
    expect(stub.calls.eq).toEqual([["user_id", "user-1"], ["id", "r1"]]);
  });

  it("states the kind, the period, the state and when it was generated", async () => {
    await mount();
    expect(screen.getByRole("heading", { level: 1, name: "Revisão semanal" })).toBeInTheDocument();
    expect(screen.getByText("Concluída")).toBeInTheDocument();
    expect(screen.getByText(/Gerada em/)).toBeInTheDocument();
    // The span comes from the review's OWN stored start, not from today.
    expect(screen.getByText(/10 de agosto de 2026/)).toBeInTheDocument();
  });

  it("offers a way back to the tab this review files under", async () => {
    await mount();
    const back = screen.getByRole("link", { name: "Voltar para Revisões" });
    expect(back.getAttribute("href")).toBe("/pt-BR/app/reviews?period=week");
  });

  it("links the period to the calendar at the orientation that shows it", async () => {
    await mount();
    const link = screen.getByRole("link", { name: "Ver este período no calendário" });
    // Built by `calendarHref` from canonical columns — never hand-written.
    expect(link.getAttribute("href")).toContain("/pt-BR/app/calendar?date=2026-08-10");
    expect(link.getAttribute("href")).toContain("orientation=week");
  });
});

describe("a review that is not the reader's own is indistinguishable from one that never existed", () => {
  it("calls notFound for a missing row", async () => {
    await expect(mount(null)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound for a row the presentation contract refuses", async () => {
    // A `period_type` outside the deployed vocabulary is a row the page cannot
    // describe truthfully, so it is refused rather than rendered around.
    await expect(mount({ ...ROW, period_type: "quarterly" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("gives the same answer in every case, so the page is not a probe for foreign ids", async () => {
    /*
     * Under RLS a foreign row simply does not come back, which is the same
     * `data: null` a deleted row produces. There is deliberately no branch that
     * could tell them apart — a "this review was deleted" message would answer
     * differently for a foreign id than for a missing one, and that difference
     * is the leak.
     *
     * `undefined` is passed through `mount`'s explicit third state rather than
     * as the row argument: `mount(undefined)` takes the parameter's default and
     * would have rendered the ordinary review while appearing to test absence.
     */
    for (const id of ["r1", "not-a-review", "00000000-0000-0000-0000-000000000000"]) {
      cleanup();
      notFound.mockClear();
      await expect(mount(null, id)).rejects.toThrow("NEXT_NOT_FOUND");
      expect(notFound, `${id} did not fail closed`).toHaveBeenCalledTimes(1);
    }
  });

  it("refuses an unknown locale before it reads anything", async () => {
    await expect(
      ReviewDetailPage({ params: Promise.resolve({ locale: "fr", reviewId: "r1" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireUser).not.toHaveBeenCalled();
  });
});

describe("the stored Markdown is rendered, never shown raw and never executed", () => {
  it("hides the content until it is explicitly asked for", async () => {
    // OD-2J-1: `summaries` has no sensitivity column, so every summary is masked.
    const { container } = await mount();
    expect(screen.getByText("Resumo oculto por padrão.")).toBeInTheDocument();
    expect(container.textContent).not.toContain("Contrato");
    expect(container.querySelector('[data-masked="true"]')).not.toBeNull();
  });

  it("renders headings and lists instead of hashes and asterisks once revealed", async () => {
    const { container } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar resumo" }));

    const content = container.querySelector(".review-content")!;
    expect(content).not.toBeNull();
    expect(within(content as HTMLElement).getByText("Revisão da semana").tagName).toBe("H3");
    expect(within(content as HTMLElement).getByText("Entregas").tagName).toBe("H4");
    expect(content.querySelector("li strong")?.textContent).toBe("Contrato");
    expect(content.textContent).not.toContain("##");
    expect(content.textContent).not.toContain("**");
  });

  it("renders markup in the content as text, with no element and no script", async () => {
    const hostile = '<script>alert(1)</script> e <img src=x onerror=alert(1)> e <b>negrito</b>';
    const { container } = await mount({ ...ROW, content: hostile });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar resumo" }));

    const content = container.querySelector(".review-content") as HTMLElement;
    expect(content.querySelector("script")).toBeNull();
    expect(content.querySelector("img")).toBeNull();
    expect(content.querySelector("b")).toBeNull();
    // …and the words survive, so nothing was silently deleted from the report.
    expect(content.textContent).toContain("alert(1)");
    expect(content.textContent).toContain("negrito");
  });

  it("renders a dangerous link as its own words, never as an anchor", async () => {
    const content = "veja [aqui](javascript:alert(1)) e [ali](https://evil.test/steal)";
    const { container } = await mount({ ...ROW, content });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar resumo" }));

    const rendered = container.querySelector(".review-content") as HTMLElement;
    expect(rendered.querySelectorAll("a")).toHaveLength(0);
    expect(rendered.textContent).toContain("aqui");
    expect(rendered.textContent).toContain("ali");
  });

  it("renders a fabricated internal id as text too, because nothing vouches for it", async () => {
    /*
     * The allow-set this page passes is EMPTY: `summaries` carries no foreign
     * key and `generateReview` discards the provider's `citedSourceIds`, so no
     * id inside a stored review has been proved to exist or to belong to the
     * reader. A well-formed route to a plausible id is still a guess.
     */
    const content = "abra [a tarefa](/pt-BR/app/work/0f8fad5b-d9cb-469f-a165-70867728950e)";
    const { container } = await mount({ ...ROW, content });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar resumo" }));

    const rendered = container.querySelector(".review-content") as HTMLElement;
    expect(rendered.querySelectorAll("a")).toHaveLength(0);
    expect(rendered.textContent).toContain("a tarefa");
  });

  it("says so plainly when the stored text renders to nothing", async () => {
    await mount({ ...ROW, content: "   \n\n  " });
    expect(screen.getByText("Esta revisão foi gravada sem texto legível.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mostrar resumo" })).toBeNull();
  });

  it("renders a long review without truncating it", async () => {
    const long = Array.from({ length: 150 }, (_, index) => `- item ${index}`).join("\n");
    const { container } = await mount({ ...ROW, content: long });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar resumo" }));
    expect(container.querySelectorAll(".review-content li")).toHaveLength(150);
  });
});

describe("sources are stated only as far as the row can prove them", () => {
  it("names the model, the kind and the stored period", async () => {
    await mount();
    const section = screen.getByRole("region", { name: "Fontes" });
    expect(within(section).getByText("gpt-5.6-terra")).toBeInTheDocument();
    expect(within(section).getByText("10/08/2026 — 13/08/2026")).toBeInTheDocument();
  });

  it("says the model is not recorded rather than inventing one", async () => {
    await mount({ ...ROW, model: null });
    expect(within(screen.getByRole("region", { name: "Fontes" })).getByText("Não registrado"))
      .toBeInTheDocument();
  });

  it("states the limit instead of showing an empty list of sources", async () => {
    // The honest pendência: the citations exist at generation time and are
    // discarded at write time, so the page cannot list them.
    await mount();
    expect(screen.getByText(/não pode apontar com certeza quais itens entraram nela/))
      .toBeInTheDocument();
  });
});

describe("regenerating is offered only where it would update this review", () => {
  it("offers no generate control for a period that has passed", async () => {
    // `generateReview` upserts on a key computed from NOW, so pressing it here
    // would write a different row while appearing to refresh this one.
    await mount();
    expect(screen.queryByRole("button", { name: /Revisão da semana/ })).toBeNull();
    expect(screen.getByText(/Este período já passou/)).toBeInTheDocument();
  });

  it("offers it for the period that is still running", async () => {
    // The control for the check above: with the stored start equal to the
    // current week's Monday, the button must appear — otherwise the assertion
    // above passes because the button was never rendered at all.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T15:00:00.000Z"));
    try {
      await mount({ ...ROW, period_start: "2026-08-10", period_end: "2026-08-12" });
      expect(screen.getByRole("button", { name: /Revisão da semana/ })).toBeInTheDocument();
      expect(screen.queryByText(/Este período já passou/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("opening the page writes nothing", () => {
  it("makes no insert, update, upsert, delete or rpc", async () => {
    const { stub } = await mount();
    // The query object only ever received reads. A write would have needed a
    // method this stub does not carry, and would have thrown.
    expect(Object.keys(stub.calls)).toEqual(["from", "select", "eq"]);
  });
});
