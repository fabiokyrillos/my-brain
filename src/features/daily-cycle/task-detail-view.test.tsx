import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getWorkCopy } from "@/features/operations/copy";
import type { Locale } from "@/lib/preferences";
import type { WorkItemView } from "./contracts";
import { taskDetailCopy } from "./task-detail-copy";
import { TaskDetailView } from "./task-detail-view";
import type { TaskDetailProjection } from "./task-detail-projection";

afterEach(cleanup);

function task(overrides: Partial<WorkItemView> = {}): WorkItemView {
  return {
    taskId: "task-1",
    title: "Revisar o contrato da Aurora",
    description: "Conferir a cláusula de rescisão.",
    dueAt: "2026-07-31T17:00:00.000Z",
    priority: "high",
    intentionalNoDue: false,
    humanState: "not_started",
    origin: "brain",
    availableActions: [{ id: "complete_task" }, { id: "wait_task" }],
    projects: [{ id: "project-1", label: "Aurora Participações" }],
    contexts: [{ id: "context-1", label: "Trabalho" }],
    people: [{ id: "person-1", label: "Marina Duarte" }],
    waitingOnPeople: [],
    dependsOn: [],
    // The default fixture is a task with a readable, ordinary source: the
    // surface's baseline behaviour is "render it", and the masked cases below
    // override this explicitly so a mask is never accidental.
    sensitivity: { kind: "derived", level: "normal" },
    ...overrides,
  };
}

function detail(overrides: Partial<TaskDetailProjection> = {}): TaskDetailProjection {
  return {
    task: task(),
    status: "todo",
    timezone: "America/Sao_Paulo",
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-29T14:00:00.000Z",
    completedAt: null,
    cancelledAt: null,
    provenance: {
      entryId: "entry-1",
      preview: "Preciso revisar o contrato da Aurora antes da reunião.",
      occurredAt: "2026-07-20T09:55:00.000Z",
    },
    history: [
      { id: "audit-1", actionType: "task_command_applied", actor: "you", reason: null, occurredAt: "2026-07-29T14:00:00.000Z" },
      { id: "audit-2", actionType: "task_created", actor: "brain", reason: "Confirmado a partir do registro", occurredAt: "2026-07-20T10:00:00.000Z" },
    ],
    ...overrides,
  };
}

function renderDetail(value: TaskDetailProjection, locale: Locale = "pt-BR") {
  return render(<TaskDetailView agentName="Brain" locale={locale} detail={value} actions={<button type="button">Concluir</button>} />);
}

describe("TaskDetailView", () => {
  /**
   * `2M-CAL-008`. Found by the deployment journey, which pressed a back link
   * labelled "Trabalho" expecting the calendar and waited ninety seconds for a
   * page it was already able to reach. The href had learned about the calendar
   * and the words had not.
   */
  describe("the back affordance names where it goes", () => {
    it.each([
      ["pt-BR", "calendar", "Calendário"],
      ["pt-BR", "work", "Trabalho"],
      ["en", "calendar", "Calendar"],
      ["en", "work", "Work"],
    ] as const)("%s / %s reads %s", (locale, destination, label) => {
      render(
        <TaskDetailView
          agentName="Brain"
          locale={locale}
          detail={detail()}
          actions={null}
          backHref="/x"
          backDestination={destination}
        />,
      );
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", "/x");
    });

    it("names Work when the route says nothing, matching the href default", () => {
      renderDetail(detail());
      expect(screen.getByRole("link", { name: "Trabalho" })).toHaveAttribute(
        "href",
        "/pt-BR/app/work",
      );
    });
  });

  it("separates what the task is, what it relates to, where it came from and what happened to it", () => {
    renderDetail(detail());

    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Detalhes",
      "Relações",
      "De onde veio",
      "Histórico desta tarefa",
    ]);
  });

  it("makes every relation a link to the thing it names", () => {
    renderDetail(detail());
    const relations = screen.getByRole("region", { name: "Relações" });

    expect(within(relations).getByRole("link", { name: "Aurora Participações" })).toHaveAttribute(
      "href",
      "/pt-BR/app/projects/project-1",
    );
    expect(within(relations).getByRole("link", { name: "Marina Duarte" })).toHaveAttribute(
      "href",
      "/pt-BR/app/people/person-1",
    );
  });

  it("renders a context as plain text, because contexts have no page to open", () => {
    renderDetail(detail());
    const relations = screen.getByRole("region", { name: "Relações" });

    // A control that leads nowhere must not look like one that does (UX-20).
    expect(within(relations).queryByRole("link", { name: "Trabalho" })).toBeNull();
    expect(within(relations).getByText("Trabalho")).toBeInTheDocument();
  });

  it("shows what the user originally wrote and links to that record", () => {
    renderDetail(detail());
    const provenance = screen.getByRole("region", { name: "De onde veio" });

    expect(within(provenance).getByText(/Preciso revisar o contrato da Aurora/)).toBeInTheDocument();
    expect(within(provenance).getByRole("link", { name: "Abrir o registro original" })).toHaveAttribute(
      "href",
      "/pt-BR/app/inbox/entry-1",
    );
  });

  it("says plainly when a task was created by hand rather than from a capture", () => {
    renderDetail(detail({ provenance: null }));

    expect(
      within(screen.getByRole("region", { name: "De onde veio" }))
        .getByText("Você criou esta tarefa diretamente, sem partir de um registro."),
    ).toBeInTheDocument();
  });

  it("describes history as sentences and never as a raw action_type", () => {
    renderDetail(detail());
    const history = screen.getByRole("region", { name: "Histórico desta tarefa" });

    expect(within(history).getByText("Você alterou a tarefa")).toBeInTheDocument();
    expect(within(history).getByText("O Brain criou a tarefa")).toBeInTheDocument();
    expect(within(history).queryByText(/task_command_applied|task_created/)).toBeNull();
    // `audit_logs.reason` is English prose written by SQL. Rendering it would put
    // untranslated text in front of a Portuguese reader, and every value it holds
    // for a task only restates the action already named above.
    expect(within(history).queryByText("Confirmado a partir do registro")).toBeNull();
  });

  it("falls back to a neutral sentence for an action type it has no copy for", () => {
    renderDetail(
      detail({
        history: [{ id: "audit-9", actionType: "some_future_action", actor: "system", reason: null, occurredAt: "2026-07-29T14:00:00.000Z" }],
      }),
    );

    // The audit log is written by several call sites and by triggers, so an
    // unmapped value is possible; printing it would put a database token in
    // front of someone who cannot read it (UX-21).
    expect(screen.getByText("O sistema registrou uma alteração")).toBeInTheDocument();
    expect(screen.queryByText(/some_future_action/)).toBeNull();
  });

  it("states an absent due date instead of leaving the field blank", () => {
    renderDetail(detail({ task: task({ dueAt: undefined, intentionalNoDue: true, noDueReason: undefined }) }));

    expect(screen.getByText("Sem prazo definido")).toBeInTheDocument();
  });

  it("says so when nothing is related and when nothing has happened yet", () => {
    renderDetail(
      detail({
        task: task({ projects: [], contexts: [], people: [], waitingOnPeople: [], dependsOn: [], parent: undefined }),
        history: [],
      }),
    );

    expect(screen.getByText("Nenhuma relação registrada.")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma alteração registrada ainda.")).toBeInTheDocument();
  });

  it("renders the whole surface in English without leaking Portuguese", () => {
    renderDetail(detail(), "en");

    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Details",
      "Relationships",
      "Where this came from",
      "History of this task",
    ]);
    expect(screen.getByText("You changed the task")).toBeInTheDocument();
    expect(screen.getByText("Suggested by Brain and confirmed by you")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Detalhes|Relações|Histórico|Sugerida pelo Brain/);
  });

  it("mounts the injected actions rather than owning a write path", () => {
    renderDetail(detail());
    expect(screen.getByRole("button", { name: "Concluir" })).toBeInTheDocument();
  });
});

describe("task history vocabulary", () => {
  it("has copy for every action_type the migrations actually write against a task", () => {
    // The first version of this map was written from the *taxonomy* verbs —
    // `set_priority`, `complete_task` and so on — which are the names the command
    // contract uses and **not** what reaches `audit_logs`. Running the surface
    // against the real database showed a real history row rendering as the
    // neutral fallback. This test reads the migrations so the two vocabularies
    // cannot drift apart again silently.
    const migrations = join(process.cwd(), "supabase", "migrations");
    const written = new Set<string>();

    for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql"))) {
      const sql = readFileSync(join(migrations, file), "utf8");
      for (const statement of sql.match(/insert into public\.audit_logs[\s\S]*?;/g) ?? []) {
        // Only statements that name a task as the subject.
        if (!/'task'/.test(statement)) continue;
        for (const [, literal] of statement.matchAll(/'([a-z][a-z_]{3,})'\s*,\s*\n?\s*'task'/g)) {
          written.add(literal);
        }
      }
    }

    expect(written.size, "no audit_logs task action types were found to check").toBeGreaterThan(0);

    const covered = Object.keys(taskDetailCopy["pt-BR"].history.actions);
    const missing = [...written].filter((action) => !covered.includes(action)).sort();
    expect(missing, `these action types would render as the neutral fallback: ${missing.join(", ")}`).toEqual([]);

    // Both locales describe the same vocabulary, or one of them silently falls back.
    expect(Object.keys(taskDetailCopy.en.history.actions).sort()).toEqual(covered.sort());
  });
});

/* -------------------------------------------------------------------------- *
 * `2L-PRIVACY-001`, `-003`, `-005`, `-007` — the derived classification, on the
 * task detail.
 * -------------------------------------------------------------------------- */

describe("TaskDetailView: withheld content (OD-2L-1 option B)", () => {
  const secret = { kind: "derived", level: "highly_sensitive" } as const;

  it("withholds the title, the description and the original note together", () => {
    // The provenance blockquote is a 400-character excerpt of the very entry
    // whose classification produced the mask, so leaving it printed would make
    // masking the title theatre.
    renderDetail(detail({ task: task({ sensitivity: secret }) }), "en");

    expect(screen.queryByText("Revisar o contrato da Aurora")).toBeNull();
    expect(screen.queryByText("Conferir a cláusula de rescisão.")).toBeNull();
    expect(screen.queryByText(/Preciso revisar o contrato/)).toBeNull();
    expect(screen.getAllByText(getWorkCopy("en").protected.label).length).toBeGreaterThan(0);
  });

  it("keeps every fact about the task that is not its content", () => {
    // `2L-PRIVACY-003`: the row is withheld, not removed. Dates, state, origin
    // and history are facts *about* the task and were never the classified
    // content.
    renderDetail(detail({ task: task({ sensitivity: secret }) }), "en");

    expect(screen.getByRole("region", { name: "Details" })).toBeVisible();
    expect(screen.getByRole("region", { name: "History of this task" })).toBeVisible();
  });

  it("shows an ordinary task untouched", () => {
    renderDetail(detail(), "en");

    expect(screen.getByText("Revisar o contrato da Aurora")).toBeVisible();
    expect(screen.getByText(/Preciso revisar o contrato/)).toBeVisible();
    expect(screen.queryByText(getWorkCopy("en").protected.label)).toBeNull();
  });

  it("shows a manual task untouched and says why it is not protected", () => {
    // `2L-PRIVACY-004`. A task with no source has no derivable classification,
    // and the surface says so rather than letting the user infer protection it
    // does not have.
    renderDetail(
      detail({ task: task({ sensitivity: { kind: "undetermined" } }), provenance: null }),
      "en",
    );

    expect(screen.getByText("Revisar o contrato da Aurora")).toBeVisible();
    expect(screen.getByText(getWorkCopy("en").protected.partialCoverage)).toBeVisible();
  });

  it("does not decide anything itself: the rule comes from the shared component", () => {
    const source = readFileSync(join(__dirname, "task-detail-view.tsx"), "utf8");
    expect(source).toMatch(/ProtectedContent/);
    expect(source).not.toMatch(/highly_sensitive|presentationFor/);
  });
});
