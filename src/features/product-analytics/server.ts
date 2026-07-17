import "server-only";

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
    if (error || !Array.isArray(data) || !isProductEventRpcRow(data[0])) return telemetryUnavailable();

    const event = data[0];
    return event.recorded
      ? { accepted: true, recorded: true, eventId: event.event_id, code: "recorded" }
      : { accepted: true, recorded: false, eventId: event.event_id, code: "deduplicated" };
  } catch {
    return telemetryUnavailable();
  }
}
