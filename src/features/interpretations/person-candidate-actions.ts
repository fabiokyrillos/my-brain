"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertActiveAccount } from "@/lib/auth/require-user";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  PERSON_CANDIDATE_BATCH_LIMIT,
  PERSON_CANDIDATE_NAME_MAX_LENGTH,
} from "./person-candidate-contract";

export type PersonCandidateActionState = {
  status: "idle" | "success" | "error";
  code?: "resolved" | "validation_failed" | "unauthenticated" | "operation_failed";
  message: string;
  undoId: string | null;
  replayed?: boolean;
  retryable?: boolean;
};

const localeSchema = z.enum(["pt-BR", "en"]);
const confirmedResolutionSchema = z.object({
  candidateIndex: z.number().int().min(0),
  disposition: z.literal("confirmed"),
  resolvedName: z.string().trim().min(1).max(PERSON_CANDIDATE_NAME_MAX_LENGTH).optional(),
}).strict();
const rejectedResolutionSchema = z.object({
  candidateIndex: z.number().int().min(0),
  disposition: z.literal("rejected"),
}).strict();
const resolutionsSchema = z.array(z.discriminatedUnion("disposition", [
  confirmedResolutionSchema,
  rejectedResolutionSchema,
])).min(1).max(PERSON_CANDIDATE_BATCH_LIMIT).superRefine((resolutions, context) => {
  const seen = new Set<number>();
  resolutions.forEach((resolution, index) => {
    if (seen.has(resolution.candidateIndex)) {
      context.addIssue({ code: "custom", path: [index, "candidateIndex"], message: "duplicate candidate index" });
    }
    seen.add(resolution.candidateIndex);
  });
});
const formSchema = z.object({
  entryId: z.string().uuid(),
  expectedInterpretationId: z.string().uuid(),
  operationKey: z.string().uuid(),
  locale: localeSchema,
  resolutions: resolutionsSchema,
});

type Locale = z.infer<typeof localeSchema>;
type RpcError = { code?: string; details?: string; message?: string };

const copy = {
  "pt-BR": {
    validation: "Revise as pessoas mencionadas e suas decisões.",
    unauthenticated: "Sua sessão expirou. Entre novamente.",
    stale: "A interpretação mudou. Atualize a página antes de continuar.",
    ambiguous: "Encontramos mais de uma pessoa com esse nome. Ajuste o nome antes de confirmar.",
    missing: "Essa menção não existe mais na interpretação atual.",
    invalidName: "Revise o nome da pessoa.",
    failed: "Não foi possível salvar essas decisões agora.",
    succeeded(created: number, linked: number, ignored: number) {
      const parts = [
        created ? `${created} ${created === 1 ? "pessoa criada" : "pessoas criadas"}` : "",
        linked ? `${linked} ${linked === 1 ? "pessoa vinculada" : "pessoas vinculadas"}` : "",
        ignored ? `${ignored} ${ignored === 1 ? "menção ignorada" : "menções ignoradas"}` : "",
      ].filter(Boolean);
      return `${parts.join(parts.length > 1 ? " e " : "")}.`;
    },
  },
  en: {
    validation: "Review the mentioned people and your decisions.",
    unauthenticated: "Your session expired. Sign in again.",
    stale: "The interpretation changed. Refresh the page before continuing.",
    ambiguous: "We found more than one person with this name. Adjust the name before confirming.",
    missing: "This mention is no longer in the current interpretation.",
    invalidName: "Review the person's name.",
    failed: "These decisions could not be saved right now.",
    succeeded(created: number, linked: number, ignored: number) {
      const parts = [
        created ? `${created} ${created === 1 ? "person created" : "people created"}` : "",
        linked ? `${linked} ${linked === 1 ? "person linked" : "people linked"}` : "",
        ignored ? `${ignored} ${ignored === 1 ? "mention ignored" : "mentions ignored"}` : "",
      ].filter(Boolean);
      return `${parts.join(parts.length > 1 ? " and " : "")}.`;
    },
  },
} as const;

function failure(locale: Locale, message: string, code: PersonCandidateActionState["code"] = "operation_failed", retryable = false): PersonCandidateActionState {
  return { status: "error", code, message, undoId: null, retryable };
}

function parseForm(formData: FormData) {
  let resolutions: unknown;
  try {
    resolutions = JSON.parse(String(formData.get("resolutions") ?? ""));
  } catch {
    resolutions = null;
  }
  return formSchema.safeParse({
    entryId: formData.get("entryId"),
    expectedInterpretationId: formData.get("expectedInterpretationId"),
    operationKey: formData.get("operationKey"),
    locale: formData.get("locale") ?? "pt-BR",
    resolutions,
  });
}

function mapRpcError(error: RpcError, locale: Locale): PersonCandidateActionState {
  const detail = error.details ?? "";
  if (/STALE_INTERPRETATION/i.test(detail)) return failure(locale, copy[locale].stale);
  if (/AMBIGUOUS_PERSON_MATCH/i.test(detail)) return failure(locale, copy[locale].ambiguous);
  if (/CANDIDATE_NOT_FOUND/i.test(detail)) return failure(locale, copy[locale].missing);
  if (/INVALID_PERSON_NAME/i.test(detail)) return failure(locale, copy[locale].invalidName);
  return failure(locale, copy[locale].failed, "operation_failed", true);
}

function readResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (typeof result.undoId !== "string" || !Array.isArray(result.results)) return null;
  const outcomes = result.results.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const outcome = (item as Record<string, unknown>).outcome;
    return outcome === "created" || outcome === "linked_existing" || outcome === "ignored" ? [outcome] : [];
  });
  if (outcomes.length !== result.results.length) return null;
  return { undoId: result.undoId, idempotent: result.idempotent === true, outcomes };
}

function refreshPersonSurfaces(entryId: string) {
  for (const locale of ["pt-BR", "en"] as const) {
    revalidatePath(`/${locale}/app/inbox`);
    revalidatePath(`/${locale}/app/inbox/${entryId}`);
    revalidatePath(`/${locale}/app/people`);
  }
}

export async function resolvePersonCandidates(
  _state: PersonCandidateActionState,
  formData: FormData,
): Promise<PersonCandidateActionState> {
  const localeResult = localeSchema.safeParse(formData.get("locale") ?? "pt-BR");
  const locale = localeResult.success ? localeResult.data : "pt-BR";
  const parsed = parseForm(formData);
  if (!localeResult.success || !parsed.success) {
    return failure(locale, copy[locale].validation, "validation_failed");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure(locale, copy[locale].unauthenticated, "unauthenticated");
  await assertActiveAccount(supabase, user.id, locale);

  const { data, error } = await supabase.rpc("resolve_entry_person_candidates", {
    p_entry_id: parsed.data.entryId,
    p_expected_interpretation_id: parsed.data.expectedInterpretationId,
    p_operation_key: parsed.data.operationKey,
    p_resolutions: parsed.data.resolutions as Json,
  });
  if (error) return mapRpcError(error, locale);

  const result = readResult(data);
  if (!result) return failure(locale, copy[locale].failed, "operation_failed", true);
  const created = result.outcomes.filter((outcome) => outcome === "created").length;
  const linked = result.outcomes.filter((outcome) => outcome === "linked_existing").length;
  const ignored = result.outcomes.filter((outcome) => outcome === "ignored").length;
  refreshPersonSurfaces(parsed.data.entryId);

  return {
    status: "success",
    code: "resolved",
    message: copy[locale].succeeded(created, linked, ignored),
    undoId: result.undoId,
    replayed: result.idempotent,
    retryable: false,
  };
}
