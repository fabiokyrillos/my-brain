import { describe, expect, it, beforeEach, vi } from "vitest";

const { recordProductEventMock } = vi.hoisted(() => ({ recordProductEventMock: vi.fn() }));

vi.mock("./server", () => ({ recordProductEvent: recordProductEventMock }));

type ProductAnalyticsActions = {
  recordProductInteraction?: (value: unknown) => Promise<{ acknowledged: boolean }>;
};

const actionsPath = `./${"actions"}.ts`;
const actions = await vi.importActual<ProductAnalyticsActions>(actionsPath).catch(() => ({})) as ProductAnalyticsActions;

const validPayload = {
  name: "capture_started",
  surface: "capture",
  locale: "en",
  viewportClass: "mobile",
  appVersion: "2x-test-1",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  properties: { captureSource: "home" },
};

describe("recordProductInteraction", () => {
  beforeEach(() => {
    recordProductEventMock.mockReset();
  });

  it("acknowledges an accepted private event without returning analytics internals", async () => {
    recordProductEventMock.mockResolvedValue({ accepted: true, recorded: true, eventId: "event-id", code: "recorded" });

    await expect(actions.recordProductInteraction?.(validPayload)).resolves.toEqual({ acknowledged: true });
    expect(recordProductEventMock).toHaveBeenCalledWith(validPayload);
  });

  it("does not call the server boundary for invalid or free-content input", async () => {
    await expect(actions.recordProductInteraction?.({
      ...validPayload,
      answer: "never collect user answer text",
    })).resolves.toEqual({ acknowledged: false });

    expect(recordProductEventMock).not.toHaveBeenCalled();
  });

  it("never throws or changes the principal product flow when analytics is unavailable", async () => {
    recordProductEventMock.mockRejectedValue(new Error("telemetry unavailable"));

    await expect(actions.recordProductInteraction?.(validPayload)).resolves.toEqual({ acknowledged: false });
  });
});
