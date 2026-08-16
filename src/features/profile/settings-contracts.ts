import type { AIRoutingProfile, TextModelId } from "@/lib/ai/model-routing";

export type SettingsFormValues = Readonly<{
  timezone: string;
  /** The assistant's name. Persisted since `202607160001`; editable since Slice F1. */
  agentName: string;
  personality: "direct" | "proactive" | "warm" | "analytical";
  tone: "direct" | "informal" | "natural" | "professional";
  quietStart: string;
  quietEnd: string;
  importantReminderOverride: boolean;
  maxFollowupsPerDay: number;
  responseDetail: "short" | "balanced" | "detailed";
  /**
   * The three review preferences `OD-2O-6` **A** signs controls for, and the
   * only three (`2O-PREF-004`).
   *
   * They have a proved consumer — `day-review/review-schedule.ts` reads all
   * three and `/app/reviews` renders the result — which is what distinguishes
   * them from the nine `OD-2O-7` **A** keeps without a control. `planning_day`
   * and `planning_time` are deliberately **not** here: `2M-AUDIT-005` retired
   * them and `2O-PREF-007` forbids this phase reversing that.
   *
   * `weeklyReviewDay` is `Date.getUTCDay()`'s numbering — 0 is Sunday — because
   * that is what the column already holds and what `parseReviewWeekday` already
   * validates. Renumbering it here would make the form and the consumer disagree
   * about which day the stored 5 is.
   */
  dailyReviewTime: string;
  weeklyReviewTime: string;
  weeklyReviewDay: number;
  aiProfile: AIRoutingProfile;
  chatModel: TextModelId;
  extractionModel: TextModelId;
  reviewModel: TextModelId;
  fileModel: TextModelId;
}>;
