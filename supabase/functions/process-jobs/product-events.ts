type ProductEventRpcResult = {
  data: unknown;
  error: { code?: string } | null;
};

type ProductEventRpcClient = {
  rpc(name: string, payload: Record<string, unknown>): PromiseLike<ProductEventRpcResult>;
};

type ProcessingEventInput = {
  userId: string;
  entryId: string;
  locale: "pt-BR" | "en";
  event: "capture_processing_completed" | "capture_processing_failed" | "processing_retry_requested";
  properties: Record<string, string | number>;
  idempotencyScope: readonly string[];
};

function bytesToUuid(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function createProcessingEventIdempotencyKey(...scope: string[]): Promise<string> {
  const encoded = new TextEncoder().encode(scope.join("\u001f"));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
  return bytesToUuid(digest.slice(0, 16));
}

export function toProcessingOutcome(status: string | null | undefined): "ready" | "needs_attention" | null {
  if (status === "completed") return "ready";
  if (status === "partially_processed" || status === "awaiting_review") return "needs_attention";
  return null;
}

function isRecordedEventResult(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const row = value[0];
  return Boolean(row && typeof row === "object" && typeof (row as Record<string, unknown>).event_id === "string"
    && typeof (row as Record<string, unknown>).recorded === "boolean");
}

export async function recordEntryProcessingEvent(
  client: ProductEventRpcClient,
  input: ProcessingEventInput,
): Promise<boolean> {
  try {
    const idempotencyKey = await createProcessingEventIdempotencyKey(input.event, ...input.idempotencyScope);
    const { data, error } = await client.rpc("record_product_event_for_user", {
      p_user_id: input.userId,
      p_event_name: input.event,
      p_surface: "server",
      p_locale: input.locale,
      p_viewport_class: "unknown",
      p_app_version: "worker",
      p_properties: input.properties,
      p_subject_type: "entry",
      p_subject_id: input.entryId,
      p_session_id: null,
      p_idempotency_key: idempotencyKey,
      p_is_synthetic: false,
    });
    if (error) {
      console.warn("[product-analytics] worker event rejected", { code: error.code ?? "unknown" });
      return false;
    }
    return isRecordedEventResult(data);
  } catch {
    console.warn("[product-analytics] worker event unavailable");
    return false;
  }
}
