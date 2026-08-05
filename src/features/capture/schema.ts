import { z } from "zod";
import { AI_INPUT_BOUNDS } from "@/lib/ai-input-bounds";

export const captureEntrySchema = z.object({
  content: z.string().trim().min(1, "Escreva algo para registrar.").max(AI_INPUT_BOUNDS.captureContent, "A entrada deve ter no máximo 12.000 caracteres."),
  locale: z.enum(["pt-BR", "en"]),
  source: z.enum(["web", "chat", "whatsapp", "gmail", "calendar", "import", "api"]).default("web"),
});

export type CaptureEntryInput = z.infer<typeof captureEntrySchema>;
