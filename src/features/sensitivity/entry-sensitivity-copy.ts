import type { Locale } from "@/lib/preferences";
import type { SensitivityLevel } from "./contracts";

/**
 * Life Brain C.1 (`LB-C-006`) — the record's sensitivity control. Typed, both
 * locales, no inline ternary (`LB-X-003`).
 */
export type EntrySensitivityCopy = {
  readonly label: string;
  readonly hint: string;
  readonly levels: Readonly<Record<SensitivityLevel, string>>;
  readonly save: string;
  readonly saving: string;
  readonly saved: string;
  readonly invalid: string;
  readonly notFound: string;
  readonly failed: string;
};

const COPY: Record<Locale, EntrySensitivityCopy> = {
  "pt-BR": {
    label: "Sensibilidade",
    hint: "Registros de saúde e de finanças começam como privados. Você decide: o que for muito sensível fica oculto até você pedir.",
    levels: { normal: "Normal", private: "Privado", highly_sensitive: "Muito sensível" },
    save: "Salvar sensibilidade",
    saving: "Salvando…",
    saved: "Sensibilidade salva.",
    invalid: "Escolha um dos níveis.",
    notFound: "Este registro não existe mais.",
    failed: "Não foi possível salvar agora.",
  },
  en: {
    label: "Sensitivity",
    hint: "Health and finance records start as private. You decide: anything highly sensitive stays hidden until you ask.",
    levels: { normal: "Normal", private: "Private", highly_sensitive: "Highly sensitive" },
    save: "Save sensitivity",
    saving: "Saving…",
    saved: "Sensitivity saved.",
    invalid: "Choose one of the levels.",
    notFound: "This record no longer exists.",
    failed: "Could not save right now.",
  },
};

export function getEntrySensitivityCopy(locale: Locale): EntrySensitivityCopy {
  return COPY[locale] ?? COPY["pt-BR"];
}
