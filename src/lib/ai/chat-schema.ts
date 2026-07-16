import { z } from "zod";

export const chatAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(8000),
  citedSourceIds: z.array(z.string().trim().min(1).max(100)).max(20),
});

export type ChatAnswer = z.infer<typeof chatAnswerSchema>;
