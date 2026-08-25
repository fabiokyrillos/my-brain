/**
 * *Precisa de você* holds the unanswered notices too — `2S-SILENCE-008`,
 * `2S-ACT-011`.
 *
 * ## What this file is responsible for
 *
 * That Home **mounts** the notice rows in its attention section, that the
 * section's own numbers account for them, and that adding them displaced
 * nothing that was already there. The verbs themselves, their copy and their
 * behaviour belong to `attention-notice-row.test.tsx` and
 * `notification-row-actions.test.tsx`; the import graph belongs to
 * `phase-2s-verb-authority.test.ts`.
 *
 * ## What it deliberately does not claim
 *
 * `2S-ATTENTION-001` … `-008` are **slice 2S.3's**, and their evidence bar is
 * the rendered route with planted rows — dedupe against a subject the list
 * already holds from its own source, a count proved derived, an empty state
 * reached after planting, axe on the real page. Nothing here stands in for any
 * of that. What 2S.2 owes is that the verbs are reachable from the attention
 * surface at all, and that is what these tests read.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  recordNeedsAttentionItemOpened: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import type { NeedsAttentionItemView } from "@/features/daily-cycle/contracts";
import { getNotificationActionCopy } from "@/features/notifications/action-copy";
import { getVerbCopy } from "@/features/notifications/verbs";
import { noticeHandlerSpies, noticeRow } from "@/test/notification-verb-fixtures";
import { getHomeCopy } from "./home-copy";
import { HomeView, type HomeViewModel } from "./home-view";

afterEach(cleanup);

const COPY = getHomeCopy("pt-BR", "Brain");
const ATTENTION_TITLE = COPY.sections.attention.title;

function attentionItem(overrides: Partial<NeedsAttentionItemView> = {}): NeedsAttentionItemView {
  return {
    key: "attention-1",
    kind: "review_interpretation",
    sensitivity: "normal",
    entryId: "11111111-1111-4111-8111-111111111111",
    title: "Revisar a interpretação do registro de ontem",
    explanation: "O Brain não teve confiança suficiente para criar as tarefas sozinho.",
    primaryAction: { id: "review_interpretation", href: "/pt-BR/app/inbox/11111111" },
    occurredAt: "2026-08-24T14:32:00.000Z",
    groupKey: "g1",
    ...overrides,
  };
}

function viewModel(overrides: Partial<HomeViewModel> = {}): HomeViewModel {
  return {
    timeZone: "America/Sao_Paulo",
    todayLabel: "SEGUNDA-FEIRA, 24 DE AGOSTO",
    status: { kind: "saved" },
    priorities: [],
    attention: [],
    attentionHasMore: false,
    notices: [],
    noticesHaveMore: false,
    conflicts: { items: [], bounded: false, limit: 0 },
    today: [],
    todayHasMore: false,
    waitingCount: 0,
    openQuestion: null,
    organizing: [],
    organizedTodayCount: 0,
    agenda: [],
    agendaHasMore: false,
    ...overrides,
  };
}

function renderHome(overrides: Partial<HomeViewModel> = {}) {
  const spies = noticeHandlerSpies();
  render(
    <HomeView
      agentName="Brain"
      capture={<div>captura</div>}
      locale="pt-BR"
      noticeHandlers={spies.handlers}
      view={viewModel(overrides)}
    />,
  );
  return spies;
}

function attentionSection(): HTMLElement {
  return screen.getByRole("region", { name: ATTENTION_TITLE });
}

describe("2S-SILENCE-008: the verbs are reachable from the attention surface", () => {
  it("renders a notice's primary verb and its menu inside `Precisa de você`", () => {
    const row = noticeRow();
    renderHome({ notices: [row] });

    const section = attentionSection();
    const verbCopy = getVerbCopy("pt-BR");
    const copy = getNotificationActionCopy("pt-BR");

    expect(
      within(section).getByRole("button", { name: verbCopy.complete_task.accessibleName(row.subjectLabel) }),
    ).toBeTruthy();
    expect(within(section).getByRole("button", { name: copy.menuLabel(row.subjectLabel) })).toBeTruthy();
  });

  it("renders the notice's own words, and says which kind of row it is", () => {
    const row = noticeRow();
    renderHome({ notices: [row] });

    const section = attentionSection();
    expect(within(section).getByText(row.notification.title)).toBeTruthy();
    expect(within(section).getByText(getNotificationActionCopy("pt-BR").attentionEyebrow)).toBeTruthy();
  });

  it("renders DIFFERENT primaries for two subjects in different states, in the same list", () => {
    /*
     * `2S-ACT-001` in its own words: *"the primary action is derived from the
     * subject's own state, not fixed in the component; two subjects in
     * different states render different primaries IN THE SAME LIST."*
     *
     * Two separate renders cannot show that — a component with a hard-coded
     * primary would pass them both as long as the fixture changed between them.
     * One render, two rows, two primaries.
     */
    const live = noticeRow({
      source: {
        id: "aaaaaaaa-1111-4111-8111-111111111111",
        dedupe_key: "overdue:11111111-1111-4111-8111-111111111111:2026-08-24",
        body: "Pagar o aluguel",
      },
      subjectStatus: "todo",
      subjectLabel: "Pagar o aluguel",
    });
    const settled = noticeRow({
      source: {
        id: "bbbbbbbb-2222-4222-8222-222222222222",
        dedupe_key: "overdue:22222222-2222-4222-8222-222222222222:2026-08-24",
        body: "Enviar o contrato",
      },
      subjectStatus: "completed",
      subjectLabel: "Enviar o contrato",
    });
    renderHome({ notices: [live, settled] });

    const section = attentionSection();
    const verbCopy = getVerbCopy("pt-BR");

    expect(live.primaryVerb?.id).toBe("complete_task");
    expect(settled.primaryVerb?.id).toBe("mark_read");
    expect(
      within(section).getByRole("button", { name: verbCopy.complete_task.accessibleName("Pagar o aluguel") }),
    ).toBeTruthy();
    expect(
      within(section).queryByRole("button", { name: verbCopy.complete_task.accessibleName("Enviar o contrato") }),
    ).toBeNull();
    expect(
      within(section).getByRole("button", { name: verbCopy.mark_read.accessibleName("Enviar o contrato") }),
    ).toBeTruthy();
  });

  it("mounts nothing when there is no notice — the control that makes the above mean something", () => {
    renderHome({ attention: [attentionItem()] });
    expect(
      within(attentionSection()).queryByText(getNotificationActionCopy("pt-BR").attentionEyebrow),
    ).toBeNull();
  });
});

describe("the section's numbers account for the notices", () => {
  it("counts them, so a row cannot render under a heading that says one fewer", () => {
    renderHome({ attention: [attentionItem()], notices: [noticeRow()] });
    expect(within(attentionSection()).getByText("2")).toBeTruthy();
  });

  it("opens the section for a day whose ONLY pending item is a notice", () => {
    /*
     * The failure this guards is not cosmetic. Before the notices joined the
     * count, a day with no entry attention and no conflict rendered the quiet
     * state — "Nada precisa de você agora." — while a notice sat unanswered
     * underneath it. A surface that says nothing needs you is making a claim.
     */
    renderHome({ notices: [noticeRow()] });
    const section = attentionSection();
    expect(within(section).getByText("1")).toBeTruthy();
    expect(within(section).queryByText(COPY.sections.attention.empty)).toBeNull();
  });

  it("still shows the quiet state when nothing at all is pending", () => {
    renderHome();
    expect(within(attentionSection()).getByText(COPY.sections.attention.empty)).toBeTruthy();
  });

  it("marks the count as partial when more notices exist than the bound shows", () => {
    renderHome({ notices: [noticeRow()], noticesHaveMore: true });
    expect(within(attentionSection()).getByText("1+")).toBeTruthy();
  });
});

describe("the notices displace nothing that was already there", () => {
  it("keeps the entry rows rendering beside them", () => {
    const item = attentionItem();
    const row = noticeRow();
    renderHome({ attention: [item], notices: [row] });

    const section = attentionSection();
    expect(within(section).getByText(item.title)).toBeTruthy();
    expect(within(section).getByText(row.notification.title)).toBeTruthy();
  });

  it("leaves the day's closing account counting both", () => {
    renderHome({ attention: [attentionItem()], notices: [noticeRow()] });
    const endOfDay = screen.getByRole("region", { name: COPY.sections.endOfDay.title });
    expect(within(endOfDay).getByText(new RegExp(`${ATTENTION_TITLE}: 2`))).toBeTruthy();
  });
});
