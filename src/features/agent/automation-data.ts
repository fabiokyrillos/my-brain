import "server-only";
import { z } from "zod";

import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";

import {
  AUTOMATION_CATEGORIES,
  AUTOMATION_DECISION_REASONS,
  AUTOMATION_POLICY_STATES,
  CALIBRATION_THRESHOLDS,
  type AutomationCategory,
  type AutomationCategoryDecision,
  type AutomationPolicyState,
} from "./automation-policy";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The projection is validated on the way in, like every other untrusted
 * boundary in this tree.
 *
 * "Untrusted" is not an accusation against the database — it is that this row
 * decides whether the interface tells the owner their agent may act on its own,
 * and a shape that drifted would be read as an answer rather than as a defect.
 */
const rowSchema = z.object({
  category: z.enum(AUTOMATION_CATEGORIES),
  state: z.enum(AUTOMATION_POLICY_STATES),
  eligible: z.boolean(),
  reason: z.enum(AUTOMATION_DECISION_REASONS),
  reviewed: z.number().int().min(0),
  approved: z.number().int().min(0),
  corrected: z.number().int().min(0),
  rejected: z.number().int().min(0),
  undone: z.number().int().min(0),
  precision_ratio: z.number().min(0).max(1).nullable(),
  recent_reviewed: z.number().int().min(0),
  newest_observed_at: z.string().nullable(),
  recent_undo: z.boolean(),
  has_producer: z.boolean(),
  required_reviewed: z.number().int().min(0),
  required_precision: z.number().min(0).max(1),
});

/**
 * The owner's six categories, in the order the database returns them.
 *
 * Six rows always, including for categories that have never been touched: a
 * projection that returned only stored rows would render an empty screen and
 * say nothing at all, and "nothing" is exactly what the owner must not read as
 * "nothing is happening".
 */
export async function loadAutomationStatus(
  supabase: SupabaseClient,
): Promise<readonly AutomationCategoryDecision[]> {
  const result = await supabase.rpc("automation_category_status");
  const rows = requireSupabaseData(result, "load automation status");
  const parsed = z.array(rowSchema).parse(rows);

  return parsed.map((row) => ({
    category: row.category,
    state: row.state,
    eligible: row.eligible,
    reason: row.reason,
    calibration: {
      reviewed: row.reviewed,
      approved: row.approved,
      corrected: row.corrected,
      rejected: row.rejected,
      undone: row.undone,
      precision: row.precision_ratio,
      recentReviewed: row.recent_reviewed,
      newestObservedAt: row.newest_observed_at,
      recentUndo: row.recent_undo,
      hasProducer: row.has_producer,
    },
    requiredReviewed: row.required_reviewed,
    requiredPrecision: row.required_precision,
  }));
}

export type AutomationPolicyChange = Readonly<{
  undoId: string;
  category: AutomationCategory;
  /** `null` when the category had no policy row at all before the change. */
  from: AutomationPolicyState | null;
  to: AutomationPolicyState;
  changedAt: string;
  /** Whether the reversal is still offered. Never the authority — the router re-reads. */
  undoable: boolean;
}>;

const changeSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
  before_state: z.unknown(),
  after_state: z.unknown(),
});

const stateShape = z.object({
  category: z.enum(AUTOMATION_CATEGORIES),
  state: z.enum(AUTOMATION_POLICY_STATES).nullable(),
});

/**
 * The history of automatic-authority decisions, and the reversal for each.
 *
 * The undo offer is rendered from the PERSISTED row rather than from a banner
 * the previous action returned. That is deliberate: a confirmation banner is
 * destroyed by the revalidation that follows the write, so the control would
 * vanish before it could be pressed — a shape this repository has already paid
 * for once.
 *
 * `undoable` is a courtesy, not the control: `public.undo_operation` re-reads
 * the row and refuses regardless of what this projection believed.
 */
export async function loadAutomationPolicyHistory(
  supabase: SupabaseClient,
  nowIso: string,
): Promise<readonly AutomationPolicyChange[]> {
  const result = await supabase
    .from("undo_operations")
    .select("id,status,expires_at,created_at,before_state,after_state")
    .eq("action_type", "set_automation_category_policy")
    .order("created_at", { ascending: false })
    .limit(5);
  const rows = requireSupabaseData(result, "load automation policy history");

  return z
    .array(changeSchema)
    .parse(rows)
    .flatMap((row) => {
      const after = stateShape.safeParse(row.after_state);
      if (!after.success || after.data.state === null) return [];
      const before = stateShape.safeParse(row.before_state);
      return [
        {
          undoId: row.id,
          category: after.data.category,
          from: before.success ? before.data.state : null,
          to: after.data.state,
          changedAt: row.created_at,
          undoable: row.status === "available" && row.expires_at > nowIso,
        },
      ];
    });
}

/**
 * The thresholds this build believes in, per category.
 *
 * Exposed so the parity test can compare them to what the database returned in
 * a real projection rather than to a second copy of the same constants. The
 * database is the authority; a disagreement is a defect in this file.
 */
export function declaredThreshold(category: AutomationCategory) {
  return CALIBRATION_THRESHOLDS[category];
}
