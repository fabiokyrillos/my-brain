"use server";

import { parseProductEventPayload } from "./contracts";
import { recordProductEvent } from "./server";

export type ProductInteractionAcknowledgement = {
  acknowledged: boolean;
};

export async function recordProductInteraction(input: unknown): Promise<ProductInteractionAcknowledgement> {
  const payload = parseProductEventPayload(input);
  if (!payload) return { acknowledged: false };

  try {
    const result = await recordProductEvent(payload);
    return { acknowledged: result.accepted };
  } catch {
    return { acknowledged: false };
  }
}
