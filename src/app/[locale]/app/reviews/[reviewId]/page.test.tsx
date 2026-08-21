import { cleanup, render, screen, within } from "@testing-library/react";
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
function supabaseStub(row: unknown, error: unknown = null, cited: Record<string, unknown[]> = {}) {
  const calls: Record<string, unknown[][]> = {};
  let table = "";
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    query[method] = vi.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return query;
    });
  }
  query.maybeSingle = vi.fn(async () => ({ data: row, error }));
  /*
   * The citation re-read (`2Q-TRUST-001`). `in` resolves rather than chaining,
   * and it answers **per table** — so a resolver that looked a task up in
   * `memories` would get nothing back here, which is exactly the defect
   * `2Q-FOUNDATION-003` recorded. The fake must not agree with that bug.
   */
  query.in = vi.fn((...args: unknown[]) => {
    (calls.in ??= []).push([table, ...args]);
    return Promise.resolve({ data: cited[table] ?? [], error: null });
  });
  const from = vi.fn((requested: string) => {
    table = requested;
    (calls.from ??= []).push([requested]);
    return query;
  });
  return { calls, client: { from } };
}

/**
 * A stored citations envelope naming the ids given, in the shape
 * `buildCitationsEnvelope` writes. Written out rather than imported so this
 * file exercises the parser on a literal, exactly as a stored row would.
 */
function envelope(entryId: string | null, taskId: string | null) {
  const sources = [];
  if (entryId) sources.push({ id: `entry:${entryId}`, type: "entry", sourceId: entryId, support: "direct_record" });
  if (taskId) sources.push({ id: `task:${taskId}`, type: "task", sourceId: taskId, support: "product_state" });
  return { v: "2026-08-09.1", evidence: "evidenced", reach: ["entry", "task"], sources };
}

async function mount(
  row: unknown = ROW,
  reviewId = "r1",
  error: unknown = null,
  cited: Record<string, unknown[]> = {},
) {
  const stub = supabaseStub(row, error, cited);
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
  it("shows the content without a second click, and offers no reveal control", async () => {
    /*
      **ADR-124 Decision 1**, an owner amendment to OD-2J-1. This test is the
      inverse of the one it replaces, which asserted the page opened masked.

      The mask never came from the sensitivity rule — `review_summary` resolves
      `{ normal: SHOW, private: SHOW, highly_sensitive: MASK }` like every other
      content surface. It came from a component hard-coding `highly_sensitive`
      for every summary, because `summaries` carries no classification to read.
      A person who has signed in and deliberately opened a review that belongs to
      their own account now simply sees it.
    */
    const { container } = await mount();
    expect(container.querySelector(".review-content")).not.toBeNull();
    expect(container.textContent).toContain("Contrato");
    expect(screen.queryByRole("button", { name: "Mostrar resumo" })).toBeNull();
    expect(screen.queryByText("Resumo oculto por padrão.")).toBeNull();
    expect(container.querySelector("[data-masked]")).toBeNull();
  });

  it("renders headings and lists instead of hashes and asterisks", async () => {
    const { container } = await mount();

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

  it("2Q-LINK-007: a review with no recorded references says so, and shows no empty container", async () => {
    /*
     * **Updated by slice 2Q.2, and the sentence changed with the fact.** It used
     * to say the text is stored *without* its references — true of every review
     * before `202608210100`, and false of every one written after. It now says
     * the references *were not recorded*, which stays true of the historical
     * rows forever and claims nothing about new ones.
     *
     * ADR-125 Decision 4: a "Fontes" section without canonical links in it is
     * not delivery. So the honest statement appears **instead of** a list, never
     * beside an empty one.
     */
    const { container } = await mount();
    expect(screen.getByText(/não foram registradas quando ela foi escrita/)).toBeInTheDocument();
    expect(container.querySelectorAll("ul.review-cited-list")).toHaveLength(0);
    expect(screen.queryByText("Itens citados")).toBeNull();
  });

  it("2Q-LINK-006: a review that cited records lists them, each reachable by a canonical link", async () => {
    const ENTRY = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const TASK = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
    const { container } = await mount(
      { ...ROW, citations: envelope(ENTRY, TASK) },
      "r1",
      null,
      {
        entries: [{ id: ENTRY, occurred_at: "2026-08-11T10:00:00Z" }],
        tasks: [{ id: TASK, updated_at: "2026-08-12T10:00:00Z" }],
      },
    );

    const list = container.querySelector("ul.review-cited-list") as HTMLElement;
    expect(list).not.toBeNull();
    expect([...list.querySelectorAll("li")].map((item) => [
      item.querySelector(".review-cited-kind")?.textContent,
      item.querySelector("a")?.getAttribute("href"),
    ])).toEqual([
      ["Registro", `/pt-BR/app/inbox/${ENTRY}`],
      ["Tarefa", `/pt-BR/app/work/${TASK}`],
    ]);
    expect(screen.queryByText(/não foram registradas quando ela foi escrita/)).toBeNull();
  });

  it("2Q-TRUST-001: it re-reads every cited record under the reader's own session", async () => {
    const ENTRY = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const TASK = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
    const { stub } = await mount({ ...ROW, citations: envelope(ENTRY, TASK) }, "r1", null, {
      entries: [{ id: ENTRY, occurred_at: null }],
      tasks: [{ id: TASK, updated_at: null }],
    });
    expect(stub.calls.from).toEqual([["summaries"], ["entries"], ["tasks"]]);
    expect(stub.calls.from).not.toContainEqual(["memories"]);
    expect(stub.calls.eq).toContainEqual(["user_id", "user-1"]);
  });

  it("2Q-LINK-004: naming a real task by title creates no link, because no id vouched for it", async () => {
    /*
     * The requirement the owner stated by name: **no link is ever born from
     * matching a name in the Markdown against a record.** The task below is real
     * and its record resolves — it is simply not named by the prose as a link,
     * so the prose that mentions it stays prose.
     */
    const TASK = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
    const { container } = await mount(
      { ...ROW, content: "Você concluiu **Fechar o contrato** nesta semana.", citations: envelope(null, TASK) },
      "r1",
      null,
      { tasks: [{ id: TASK, updated_at: "2026-08-12T10:00:00Z" }] },
    );
    const rendered = container.querySelector(".review-content") as HTMLElement;
    expect(rendered.querySelectorAll("a")).toHaveLength(0);
    expect(rendered.textContent).toContain("Fechar o contrato");
    // Two-sided: the citation IS resolved, so the area below does link it — the
    // absence above is about the prose, not about a resolver that did nothing.
    expect(container.querySelectorAll("ul.review-cited-list a")).toHaveLength(1);
  });

  it("2Q-LINK-002: an entry-vouched id does not authorize a task route in the prose", async () => {
    const ENTRY = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const { container } = await mount(
      { ...ROW, content: `abra [a tarefa](/pt-BR/app/work/${ENTRY})`, citations: envelope(ENTRY, null) },
      "r1",
      null,
      { entries: [{ id: ENTRY, occurred_at: "2026-08-11T10:00:00Z" }] },
    );
    const rendered = container.querySelector(".review-content") as HTMLElement;
    expect(rendered.querySelectorAll("a")).toHaveLength(0);
    expect(rendered.textContent).toContain("a tarefa");

    // Two-sided: the SAME id on its own surface IS admitted, so the refusal is
    // about the pair rather than about an allow-set that admits nothing.
    cleanup();
    const { container: right } = await mount(
      { ...ROW, content: `abra [o registro](/pt-BR/app/inbox/${ENTRY})`, citations: envelope(ENTRY, null) },
      "r1",
      null,
      { entries: [{ id: ENTRY, occurred_at: "2026-08-11T10:00:00Z" }] },
    );
    expect((right.querySelector(".review-content") as HTMLElement).querySelectorAll("a")).toHaveLength(1);
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
