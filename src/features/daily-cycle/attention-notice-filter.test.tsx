/**
 * The unanswered notices inside the full *Precisa de você* queue — the owner's
 * decision of 2026-08-25, stated by them and asserted here clause by clause:
 *
 * 1. unanswered notices appear under **Todos**;
 * 2. they get a filter of their **own**;
 * 3. they are **never** placed in a filter meant for records, conflicts or any
 *    other type;
 * 4. the count and the list derive from the **same set**, with no divergence;
 * 5. every existing filter behaves exactly as it did.
 *
 * The mobile half — reachable, readable, no horizontal overflow — is a property
 * of the rendered page at a phone viewport, and belongs to the rendered lane
 * rather than to jsdom. It is not claimed here.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/product-analytics/interaction-events", () => ({
  NeedsAttentionViewed: vi.fn(() => null),
  recordNeedsAttentionItemOpened: vi.fn(),
  recordAttentionItemResolved: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { NeedsAttentionViewed } from "@/features/product-analytics/interaction-events";
import { getNotificationActionCopy } from "@/features/notifications/action-copy";
import { getVerbCopy } from "@/features/notifications/verbs";
import { noticeHandlerSpies, noticeRow } from "@/test/notification-verb-fixtures";
import type { ConflictAttentionItemView, NeedsAttentionItemView } from "./contracts";
import { NeedsAttentionList } from "./needs-attention-list";

const OWNER_TIME_ZONE = "America/Sao_Paulo";
const NOTICES_CHIP = "Avisos";
const ALL_CHIP = "Tudo";
/** The labels the existing chips already carry — read from the copy, not invented. */
const RECORDS_CHIP = "Decida sobre as sugestões";
const CONFLICT_CHIP = "Duas datas que não podem estar certas";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function record(overrides: Partial<NeedsAttentionItemView> = {}): NeedsAttentionItemView {
  return {
    key: "entry-1:confirm_existing_candidates",
    kind: "confirm_existing_candidates",
    entryId: "entry-1",
    title: "Ligar para a Marina",
    explanation: "Há tarefas sugeridas prontas para sua confirmação.",
    primaryAction: { id: "confirm_existing_candidates", href: "/pt-BR/app/inbox/entry-1" },
    occurredAt: "2026-07-18T12:00:00.000Z",
    groupKey: "entry-1",
    sensitivity: "normal",
    ...overrides,
  };
}

function conflict(): ConflictAttentionItemView {
  return {
    key: "memory-1:resolve_validity_conflict",
    reason: "resolve_validity_conflict",
    memoryId: "11111111-1111-4111-8111-111111111111",
    content: "A Marina saiu da empresa",
    sensitivity: "normal",
    validFrom: "2026-07-01T00:00:00.000Z",
    validUntil: "2026-06-01T00:00:00.000Z",
    action: { id: "resolve_validity_conflict", href: "/pt-BR/app/memories/11111111" },
  } as ConflictAttentionItemView;
}

function renderQueue(options: {
  records?: readonly NeedsAttentionItemView[];
  conflicts?: readonly ConflictAttentionItemView[];
  noticeCount?: number;
  withHandlers?: boolean;
} = {}) {
  const {
    records = [record()],
    conflicts = [],
    noticeCount = 1,
    withHandlers = true,
  } = options;

  const notices = Array.from({ length: noticeCount }, (_, index) =>
    noticeRow({
      source: {
        id: `aaaaaaaa-${index}111-4111-8111-111111111111`,
        dedupe_key: `overdue:1111111${index}-1111-4111-8111-111111111111:2026-08-24`,
        body: `Aviso ${index}`,
      },
      subjectLabel: `Aviso ${index}`,
    }),
  );
  const spies = noticeHandlerSpies();

  render(
    <NeedsAttentionList
      agentName="Brain"
      conflicts={{ items: conflicts, bounded: false, limit: 0 }}
      initialCursor={null}
      initialHasNext={false}
      initialItems={records}
      loadMore={vi.fn()}
      locale="pt-BR"
      noticeHandlers={withHandlers ? spies.handlers : undefined}
      notices={notices}
      timeZone={OWNER_TIME_ZONE}
    />,
  );
  return { notices, spies };
}

function chip(name: string) {
  // An exact match: "Tudo" must not resolve the "Avisos" chip, and a partial
  // match over a growing chip row is how a filter test comes to assert the
  // wrong control.
  return screen.getByRole("button", { name: new RegExp(`^${name}$`) });
}

/** Every notice row currently rendered, by its eyebrow. */
function noticeRowCount(): number {
  return screen.queryAllByText(getNotificationActionCopy("pt-BR").attentionEyebrow).length;
}

describe("clause 1 and 2: notices appear under Todos, and under a filter of their own", () => {
  it("renders the notice rows with no filter chosen", () => {
    renderQueue({ conflicts: [conflict()] });
    expect(noticeRowCount()).toBe(1);
    expect(chip(ALL_CHIP).getAttribute("aria-pressed")).toBe("true");
  });

  it("offers an `Avisos` chip that shows the notices and nothing else", async () => {
    renderQueue({ conflicts: [conflict()] });

    await userEvent.click(chip(NOTICES_CHIP));

    expect(noticeRowCount()).toBe(1);
    // The record row and the conflict row are both gone.
    expect(screen.queryByText("Ligar para a Marina")).toBeNull();
    expect(screen.queryByText("A Marina saiu da empresa")).toBeNull();
  });

  it("carries the notice's own verbs into the queue, from the one shared mount", () => {
    const { notices } = renderQueue();
    const verbCopy = getVerbCopy("pt-BR");
    const section = screen.getByRole("region", { name: NOTICES_CHIP });
    expect(
      within(section).getByRole("button", {
        name: verbCopy[notices[0].primaryVerb!.id].accessibleName(notices[0].subjectLabel),
      }),
    ).toBeTruthy();
  });
});

describe("clause 3: no notice is ever placed in a filter meant for another type", () => {
  it("shows no notice under the records filter", async () => {
    renderQueue({ conflicts: [conflict()] });

    await userEvent.click(chip(RECORDS_CHIP));

    expect(noticeRowCount()).toBe(0);
    // And that filter still does its own job, unchanged.
    expect(screen.getByText("Ligar para a Marina")).toBeTruthy();
  });

  it("shows no notice under the conflict filter", async () => {
    renderQueue({ conflicts: [conflict()] });

    await userEvent.click(chip(CONFLICT_CHIP));

    expect(noticeRowCount()).toBe(0);
    expect(screen.getByText("A Marina saiu da empresa")).toBeTruthy();
  });
});

describe("clause 4: the count and the list derive from the same set", () => {
  it("reports every row the queue holds, across all three kinds", () => {
    renderQueue({ records: [record()], conflicts: [conflict()], noticeCount: 2 });
    expect(NeedsAttentionViewed).toHaveBeenCalledWith(
      expect.objectContaining({ itemCount: 4 }),
      undefined,
    );
    // The rendered rows agree with it: one record, one conflict, two notices.
    expect(noticeRowCount()).toBe(2);
    expect(screen.getByText("Ligar para a Marina")).toBeTruthy();
    expect(screen.getByText("A Marina saiu da empresa")).toBeTruthy();
  });

  it("counts nothing it does not render", () => {
    /*
     * The control that makes the above mean something. Without the handlers no
     * notice row can render, so no notice may be counted either — a number that
     * included rows the surface withheld would be exactly the divergence the
     * owner's decision forbids.
     */
    renderQueue({ noticeCount: 3, withHandlers: false });
    expect(noticeRowCount()).toBe(0);
    expect(NeedsAttentionViewed).toHaveBeenCalledWith(
      expect.objectContaining({ itemCount: 1 }),
      undefined,
    );
  });
});

describe("clause 5: the existing filters behave exactly as they did", () => {
  it("offers no notice chip on a queue with no notices", () => {
    renderQueue({ conflicts: [conflict()], noticeCount: 0 });
    expect(screen.queryByRole("button", { name: NOTICES_CHIP })).toBeNull();
    // The chips that were there still are.
    expect(chip(ALL_CHIP)).toBeTruthy();
    expect(chip(CONFLICT_CHIP)).toBeTruthy();
  });

  it("keeps the empty-filtered sentence honest about a queue that holds notices", async () => {
    /*
     * The line used to read `items.length > 0 || hasConflicts`. A queue whose
     * only rows were notices would have printed nothing at all when a record
     * filter matched none — and the reader would have been told neither that
     * the filter was empty nor that anything was there.
     */
    renderQueue({ records: [record()], noticeCount: 1 });

    await userEvent.click(chip(NOTICES_CHIP));
    expect(screen.queryByText("Nenhum item deste tipo entre os carregados.")).toBeNull();

    await userEvent.click(chip(RECORDS_CHIP));
    expect(noticeRowCount()).toBe(0);
    expect(screen.getByText("Ligar para a Marina")).toBeTruthy();
  });
});
