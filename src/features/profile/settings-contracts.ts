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
  aiProfile: AIRoutingProfile;
  chatModel: TextModelId;
  extractionModel: TextModelId;
  reviewModel: TextModelId;
  fileModel: TextModelId;
}>;
