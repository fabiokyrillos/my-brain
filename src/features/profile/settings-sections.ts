/**
 * Phase 2P slice 2P.5 — which Settings section owns which profile column.
 *
 * ## The defect this exists to prevent
 *
 * `profileSchema` is `.strict()` over seventeen owned fields and
 * `save_profile_settings` writes all of them in one call. Before this slice all
 * seventeen lived in one `<form>`, so "submit everything" and "submit what the
 * owner changed" were the same thing.
 *
 * `2P-SETTINGS-001` splits that form across four sections. A section that
 * submits only its own four fields would either fail the strict parse or — far
 * worse — reach the payload builder with thirteen fields absent and blank them.
 * That is exactly what `2P-SETTINGS-004` forbids: *saving one section cannot
 * reset unsaved or stored values owned by another section.*
 *
 * ## The shape that fixes it
 *
 * A section declares the columns it owns. `updateProfile` then assembles a
 * **complete** payload from two sources — the form for the owned fields, the
 * **stored row** for everything else — and parses that whole object with the
 * unchanged strict schema. Validation is not weakened for the fields a section
 * does own, and no other section's value passes through the client where a
 * stale tab could overwrite a newer save with what it happened to render.
 *
 * `updateProfile` already reads that row: the snapshot exists for the
 * pass-through columns `planning_day`, `planning_time`, `ai_provider` and
 * `privacy_default`. This generalises a pattern the file already uses rather
 * than introducing a mechanism.
 *
 * ## Why the groups are guarded rather than trusted
 *
 * `settings-sections.test.ts` derives the expected field set from
 * `profileSchema.shape` and compares it against the union of these groups, so a
 * field added to the schema without an owning section fails the build and a
 * field claimed twice fails the build. Transcribing the list here and asserting
 * the transcription would be a check that can only ever agree with itself.
 */

import type { SettingsSection } from "@/features/settings/sections";
import type { ProfileInput } from "./schema";

/**
 * The four sections that own persisted profile columns.
 *
 * The other four Settings sections — Notificações, Privacidade e dados,
 * Aparência and Conta — own no `profiles` or `agent_preferences` column written
 * by this form. Notification preferences have their own record and their own
 * writer, the appearance choice is held in this browser, and the remaining two
 * are navigational.
 */
export const PROFILE_FORM_SECTIONS = ["general", "assistant", "ai", "planning"] as const;

export type ProfileFormSection = (typeof PROFILE_FORM_SECTIONS)[number];

/**
 * `ProfileFormSection` is a subset of `SettingsSection` by construction rather
 * than by coincidence: a section name that stopped existing in the routing
 * contract would fail to compile here.
 */
const _sectionsAreSettingsSections: readonly SettingsSection[] = PROFILE_FORM_SECTIONS;
void _sectionsAreSettingsSections;

/**
 * `locale` belongs to no section.
 *
 * Every section's form carries it, because the action needs it to localise the
 * message it returns. It is not a column any section owns — the stored
 * `profiles.locale` is passed through untouched by `buildSettingsPayload` and
 * always has been.
 */
export const PROFILE_FIELD_WITHOUT_SECTION = "locale" as const;

export type OwnedProfileField = Exclude<keyof ProfileInput, typeof PROFILE_FIELD_WITHOUT_SECTION>;

/**
 * The four groups.
 *
 * The split follows what a reader is doing rather than what the database
 * stores: the timezone is the one setting that changes what every date in the
 * product means, so it opens Geral alone; how the assistant sounds is one
 * decision made in one place; the routed models belong beside the credential
 * that pays for them; and everything that decides *when* the product may
 * interrupt is one section, because quiet hours and the follow-up cap are read
 * by the same consumer.
 */
export const PROFILE_SECTION_FIELDS: Readonly<
  Record<ProfileFormSection, readonly OwnedProfileField[]>
> = {
  general: ["timezone"],
  assistant: ["agentName", "personality", "tone", "responseDetail"],
  ai: ["aiProfile", "chatModel", "extractionModel", "reviewModel", "fileModel"],
  planning: [
    "quietStart",
    "quietEnd",
    "importantReminderOverride",
    "maxFollowupsPerDay",
    "dailyReviewTime",
    "weeklyReviewTime",
    "weeklyReviewDay",
  ],
};

export function isProfileFormSection(value: unknown): value is ProfileFormSection {
  return typeof value === "string" && (PROFILE_FORM_SECTIONS as readonly string[]).includes(value);
}

/**
 * The fields a section's submission may name.
 *
 * Used by the writer to decide what to take from the form, and by the form to
 * decide what to render — one list, so the two cannot disagree about who owns a
 * column.
 */
export function ownedProfileFields(section: ProfileFormSection): readonly OwnedProfileField[] {
  return PROFILE_SECTION_FIELDS[section];
}
