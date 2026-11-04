"use server";

/**
 * Life Brain C.1 (`LB-C-006`, ADR-148) — the owner sets a record's sensitivity.
 *
 * Through `set_entry_sensitivity` only: the RPC checks ownership, writes the
 * audit row that marks the level as the owner's own choice, and that row is
 * what keeps a later area reading from raising it again. This action never
 * updates `entries` itself.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { resolveLocale } from "@/lib/preferences";
import { SENSITIVITY_LEVELS, type SensitivityLevel } from "./contracts";
import { getEntrySensitivityCopy } from "./entry-sensitivity-copy";
import type { EntrySensitivityState } from "./entry-sensitivity-state";

const schema = z.object({
  locale: z.enum(["pt-BR", "en"]),
  entryId: z.string().uuid(),
  sensitivity: z.enum(SENSITIVITY_LEVELS),
}).strict();

export async function setEntrySensitivity(
  _previous: EntrySensitivityState,
  formData: FormData,
): Promise<EntrySensitivityState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getEntrySensitivityCopy(locale);
  const parsed = schema.safeParse({
    locale: formData.get("locale"),
    entryId: formData.get("entryId"),
    sensitivity: formData.get("sensitivity"),
  });
  if (!parsed.success) return { status: "error", message: copy.invalid, sensitivity: null };

  const { supabase } = await requireUser(parsed.data.locale);
  const { error } = await supabase.rpc("set_entry_sensitivity", {
    p_entry_id: parsed.data.entryId,
    p_sensitivity: parsed.data.sensitivity,
  });
  if (error) {
    const gone = (error as { code?: string }).code === "P0002";
    return { status: "error", message: gone ? copy.notFound : copy.failed, sensitivity: null };
  }

  revalidatePath(`/${parsed.data.locale}/app/inbox/${parsed.data.entryId}`);
  revalidatePath(`/${parsed.data.locale}/app/inbox`);
  return { status: "success", message: copy.saved, sensitivity: parsed.data.sensitivity as SensitivityLevel };
}
