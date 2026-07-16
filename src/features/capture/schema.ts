import { z } from "zod";

export const captureEntrySchema = z.object({
  content: z.string().trim().min(1, "Escreva algo para registrar.").max(12000, "A entrada deve ter no máximo 12.000 caracteres."),
  locale: z.enum(["pt-BR", "en"]),
  source: z.enum(["web", "chat", "whatsapp", "gmail", "calendar", "import", "api"]).default("web"),
});

export type CaptureEntryInput = z.infer<typeof captureEntrySchema>;
