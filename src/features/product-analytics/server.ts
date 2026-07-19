import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  parseProductEventPayload,
  type ProductEventPayload,
  type ProductEventResult,
} from "./contracts";

type ProductEventRpcRow = {
  event_id: string;
  recorded: boolean;
};

function telemetryUnavailable(): ProductEventResult {
  return { accepted: true, recorded: false, eventId: null, code: "telemetry_unavailable" };
}

export function createProductEventIdempotencyKey(...scope: string[]): string {
  const bytes = createHash("sha256").update(scope.join("\u001f"), "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mapRpcPayload(payload: ProductEventPayload) {
  return {
    p_event_name: payload.name,
    p_surface: payload.surface,
    p_locale: payload.locale,
    p_viewport_class: payload.viewportClass,
    p_app_version: payload.appVersion,
    p_properties: payload.properties,
    p_subject_type: payload.subject?.type ?? null,
    p_subject_id: payload.subject?.id ?? null,
    p_session_id: payload.sessionId ?? null,
    p_idempotency_key: payload.idempotencyKey,
    p_is_synthetic: payload.synthetic ?? false,
  };
}

function isProductEventRpcRow(value: unknown): value is ProductEventRpcRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.event_id === "string" && typeof row.recorded === "boolean";
}

export async function recordProductEvent(input: unknown): Promise<ProductEventResult> {
  const payload = parseProductEventPayload(input);
  if (!payload) return { accepted: false, recorded: false, eventId: null, code: "invalid_payload" };

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { accepted: false, recorded: false, eventId: null, code: "unauthenticated" };
    }

    const { data, error } = await supabase.rpc("record_product_event", mapRpcPayload(payload));
    if (error?.code === "22023") {
      return { accepted: false, recorded: false, eventId: null, code: "invalid_payload" };
    }
    if (error?.code === "42501") {
      return { accepted: false, recorded: false, eventId: null, code: "forbidden" };
    }
    if (error || !Array.isArray(data) || !isProductEventRpcRow(data[0])) return telemetryUnavailable();

    const event = data[0];
    return event.recorded
      ? { accepted: true, recorded: true, eventId: event.event_id, code: "recorded" }
      : { accepted: true, recorded: false, eventId: event.event_id, code: "deduplicated" };
  } catch {
    return telemetryUnavailable();
  }
}
