/**
 * The retention schedule, as data — SH-LEGAL-014, SH-RETENTION-001/010, T-31.
 *
 * The Privacy Policy states retention. The plan's §7 table declares it. A
 * policy and a table that are written twice drift, and the failure mode is the
 * worst kind: a document telling a user their data is deleted after 180 days
 * while nothing deletes it. So the policy's retention section is **generated
 * from this file**, and the tests pin this file to the plan.
 *
 * ## The honesty flag, and why it exists
 *
 * Approving a retention schedule is not the same as sweeping anything. The
 * automated purges are SH.6's work; today only BYOK's
 * `credential_validation_attempts` prune actually runs. A policy that stated
 * the windows as if they were enforced would be exactly the retention-copy
 * falsehood the threat model calls T-31 — so each class carries `sweepActive`,
 * the document renders a plain warning while any window is unenforced, and a
 * test asserts that warning is present **exactly while** one is. SH.6 flips the
 * flags and the warning disappears by construction rather than by somebody
 * remembering to delete a paragraph.
 *
 * ## Why SH.6 built the sweeps and did NOT flip the flags
 *
 * `202608050077` creates all seven sweeps and schedules them. The flags stay
 * `false` anyway, because they describe whether a window is enforced *for the
 * people reading the policy* — and that becomes true when the migration is
 * applied to the shared environment, not when it is merged. A policy that
 * announced enforcement on the strength of a merged file would be T-31 with
 * extra steps: the sentence would be false for exactly as long as the gap
 * between merge and deploy, which is the window in which nobody is looking.
 *
 * `documents.test.ts` pins the distinction: every unenforced window must
 * nonetheless have a sweep and a dry-run twin built for it in the chain, so
 * "not implemented" and "implemented, not yet deployed" cannot be confused.
 * Flipping these is a one-line change made after the deployment readback, and
 * the test that says "at least one window is genuinely unenforced" is deleted
 * in the same commit.
 */

import type { Locale } from "@/lib/preferences";

export type RetentionRule =
  | { readonly kind: "window"; readonly days: number }
  | { readonly kind: "window-past-expiry"; readonly days: number }
  | { readonly kind: "retained" };

export type RetentionClass = {
  /** The stored surface, named the way the user would recognise it. */
  readonly id: string;
  readonly rule: RetentionRule;
  /** Whether an automated sweep enforces the window today. */
  readonly sweepActive: boolean;
  /** Why a retained class is retained (SH-RETENTION-001 requires the reason). */
  readonly reasonKey: "audit" | "billing" | "history" | null;
};

/** Plan §7, as data. Every value here is owner-approved (ADR-077). */
export const RETENTION_SCHEDULE: readonly RetentionClass[] = [
  { id: "jobs", rule: { kind: "window", days: 90 }, sweepActive: false, reasonKey: null },
  { id: "notifications", rule: { kind: "window", days: 180 }, sweepActive: false, reasonKey: null },
  { id: "product_events", rule: { kind: "window", days: 180 }, sweepActive: false, reasonKey: null },
  { id: "heartbeat_runs", rule: { kind: "window", days: 30 }, sweepActive: false, reasonKey: null },
  {
    id: "undo_operations",
    rule: { kind: "window-past-expiry", days: 30 },
    sweepActive: false,
    reasonKey: null,
  },
  {
    id: "auth_event_attempts",
    rule: { kind: "window", days: 30 },
    sweepActive: false,
    reasonKey: null,
  },
  {
    id: "credential_validation_attempts",
    rule: { kind: "window", days: 30 },
    // The one that genuinely runs today: BYOK's scheduler-only prune.
    sweepActive: true,
    reasonKey: null,
  },
  { id: "audit_logs", rule: { kind: "retained" }, sweepActive: true, reasonKey: "audit" },
  { id: "ai_usage_events", rule: { kind: "retained" }, sweepActive: true, reasonKey: "billing" },
  {
    id: "entry_interpretation_versions",
    rule: { kind: "retained" },
    sweepActive: true,
    reasonKey: "history",
  },
];

/**
 * What survives an account deletion, enumerated — SH-LEGAL-014.
 *
 * These are the columns `public.account_deletion_log` actually has (migration
 * `202608040072`), and `retention-parity.test.ts` compares this list to that
 * migration's column list in **both directions**. The policy therefore cannot
 * claim less than the log keeps, and the log cannot grow a field the policy
 * does not disclose.
 */
export const DELETION_RETAINED_FIELDS = [
  "id",
  "requested_at",
  "storage_started_at",
  "storage_completed_at",
  "account_deleted_at",
  "completed_at",
  "outcome",
  "stop_reason",
  "storage_objects_removed",
  "storage_bytes_removed",
  "table_row_counts",
  "requester_session_hash",
  "created_at",
] as const;

export function hasUnenforcedWindow(): boolean {
  return RETENTION_SCHEDULE.some((entry) => entry.rule.kind !== "retained" && !entry.sweepActive);
}

const classLabels: Record<Locale, Record<string, string>> = {
  "pt-BR": {
    jobs: "processamentos concluídos",
    notifications: "notificações",
    product_events: "eventos de uso do produto",
    heartbeat_runs: "execuções do agente",
    undo_operations: "operações de desfazer",
    auth_event_attempts: "tentativas de autenticação",
    credential_validation_attempts: "tentativas de validação de chave",
    audit_logs: "trilha de auditoria",
    ai_usage_events: "registro de consumo de IA",
    entry_interpretation_versions: "versões de interpretação",
  },
  en: {
    jobs: "completed processing jobs",
    notifications: "notifications",
    product_events: "product usage events",
    heartbeat_runs: "agent runs",
    undo_operations: "undo operations",
    auth_event_attempts: "authentication attempts",
    credential_validation_attempts: "key validation attempts",
    audit_logs: "audit trail",
    ai_usage_events: "AI usage ledger",
    entry_interpretation_versions: "interpretation versions",
  },
};

const reasonLabels: Record<Locale, Record<"audit" | "billing" | "history", string>> = {
  "pt-BR": {
    audit: "integridade da auditoria",
    billing: "reconciliação de custos",
    history: "histórico imutável do produto",
  },
  en: {
    audit: "audit integrity",
    billing: "cost reconciliation",
    history: "immutable product history",
  },
};

/** One line per class, generated — never hand-written twice. */
export function retentionLine(locale: Locale, entry: RetentionClass): string {
  const label = classLabels[locale][entry.id];
  if (entry.rule.kind === "retained") {
    const reason = entry.reasonKey ? reasonLabels[locale][entry.reasonKey] : "";
    return locale === "pt-BR"
      ? `${label}: retidos (${reason}).`
      : `${label}: retained (${reason}).`;
  }
  if (entry.rule.kind === "window-past-expiry") {
    return locale === "pt-BR"
      ? `${label}: removidos ${entry.rule.days} dias após expirarem.`
      : `${label}: removed ${entry.rule.days} days after they expire.`;
  }
  return locale === "pt-BR"
    ? `${label}: removidos após ${entry.rule.days} dias.`
    : `${label}: removed after ${entry.rule.days} days.`;
}
