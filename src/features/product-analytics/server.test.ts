import { describe, expect, it, beforeEach, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

type ProductAnalyticsServer = {
  createProductEventIdempotencyKey?: (...scope: string[]) => string;
  recordProductEvent?: (value: unknown) => Promise<{
    accepted: boolean;
    recorded: boolean;
    eventId: string | null;
    code: string;
  }>;
};

const serverPath = `./${"server"}.ts`;
const analytics = await vi.importActual<ProductAnalyticsServer>(serverPath);

const validPayload = {
  name: "capture_started",
  surface: "capture",
  locale: "pt-BR",
  viewportClass: "desktop",
  appVersion: "2x-test-1",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  properties: { captureSource: "home" },
};

describe("product analytics server boundary", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("records only a sanitized allowlisted payload for the authenticated owner", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "owner-id" } }, error: null });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ event_id: "44444444-4444-4444-8444-444444444444", recorded: true }],
      error: null,
    });
    createClientMock.mockResolvedValue({ auth: { getUser }, rpc });

    const result = await analytics.recordProductEvent?.(validPayload);

    expect(result).toEqual({
      accepted: true,
      recorded: true,
      eventId: "44444444-4444-4444-8444-444444444444",
      code: "recorded",
    });
    expect(rpc).toHaveBeenCalledWith("record_product_event", expect.objectContaining({
      p_event_name: "capture_started",
      p_properties: { captureSource: "home" },
      p_idempotency_key: validPayload.idempotencyKey,
    }));
  });

  it("does not call Supabase for malformed or free-content payloads", async () => {
    const rpc = vi.fn();
    createClientMock.mockResolvedValue({ auth: { getUser: vi.fn() }, rpc });

    const result = await analytics.recordProductEvent?.({
      ...validPayload,
      properties: { captureSource: "home", original: "never telemetry" },
    });

    expect(result).toEqual({ accepted: false, recorded: false, eventId: null, code: "invalid_payload" });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a deduplicated acknowledgement without exposing database details", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ event_id: "44444444-4444-4444-8444-444444444444", recorded: false }],
      error: null,
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner-id" } }, error: null }) },
      rpc,
    });

    await expect(analytics.recordProductEvent?.(validPayload)).resolves.toEqual({
      accepted: true,
      recorded: false,
      eventId: "44444444-4444-4444-8444-444444444444",
      code: "deduplicated",
    });
  });

  it("contains telemetry unavailability so the product action can continue", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "raw database error must not escape" },
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner-id" } }, error: null }) },
      rpc,
    });

    await expect(analytics.recordProductEvent?.(validPayload)).resolves.toEqual({
      accepted: true,
      recorded: false,
      eventId: null,
      code: "telemetry_unavailable",
    });
  });

  it.each([
    ["22023", "invalid_payload"],
    ["42501", "forbidden"],
  ])("classifies contract and ownership rejection %s without treating it as availability", async (code, expectedCode) => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code, message: "sensitive database detail" },
    });
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner-id" } }, error: null }) },
      rpc,
    });

    await expect(analytics.recordProductEvent?.(validPayload)).resolves.toEqual({
      accepted: false,
      recorded: false,
      eventId: null,
      code: expectedCode,
    });
  });

  it("derives stable UUID idempotency keys from logical operation scopes", () => {
    const derive = analytics.createProductEventIdempotencyKey;
    expect(derive).toBeTypeOf("function");

    const first = derive?.("capture_save_succeeded", "operation-1");
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(derive?.("capture_save_succeeded", "operation-1")).toBe(first);
    expect(derive?.("capture_save_failed", "operation-1")).not.toBe(first);
  });
});
