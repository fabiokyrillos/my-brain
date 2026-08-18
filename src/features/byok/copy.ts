import { resolveLocale, type Locale } from "@/lib/preferences";

/**
 * `BYOK-COPY-001…007` — every user-facing sentence this initiative adds, in one
 * typed module.
 *
 * ## Why one module rather than a section in each feature's copy
 *
 * The gated states say the **same thing** on five surfaces, and they have to.
 * "You have not configured a key" phrased five slightly different ways teaches
 * the user that five different things went wrong. A single module also means
 * `locale-ternary-guard.test.ts` sees no new ternaries, which is the mechanism
 * `UX-22` left behind.
 *
 * ## What the copy is not allowed to say
 *
 * It never promises the key is unreadable by the operator — `BYOK_SECURITY_DEFINITION.md`
 * is explicit that an operator with the master key and a database copy can
 * decrypt, and copy that implied otherwise would be a lie the architecture
 * cannot back. It says what is true: the key is encrypted, it is never shown
 * again, and removing it is immediate in the live system while backups age out
 * on the provider's schedule.
 */

export type ByokMessageKey =
  | "credentialRequired"
  | "credentialUnreadable";

export type ByokValidationOutcome =
  | "invalid_key"
  | "insufficient_quota"
  | "rate_limited"
  | "revoked"
  | "unknown"
  | "throttled";

export type ByokCopy = {
  /** The gated states, shared by every AI surface. */
  readonly messages: Record<ByokMessageKey, string>;
  /** Settings section chrome. */
  readonly settings: {
    readonly title: string;
    readonly intro: string;
    readonly honesty: string;
    readonly fieldLabel: string;
    readonly fieldHint: string;
    readonly save: string;
    readonly rotate: string;
    readonly remove: string;
    readonly removeConfirm: string;
    readonly statusConfigured: string;
    readonly statusInvalid: string;
    readonly statusAbsent: string;
    /**
     * `removed` said `statusAbsent` until slice 2O.7, and the two are not the
     * same fact.
     *
     * `CredentialStatus` has four members and the panel rendered three
     * sentences, so a key the account **had and deleted** read exactly like a
     * key that was never entered. The polish pass between 2O.6 and 2O.7 gave
     * the two different `data-status` values, which distinguishes them for a
     * stylesheet and for a test — and for nobody using the product. A
     * distinction carried only by an attribute is not an accessible
     * distinction, which is `2O-ACCESS-003` stated about text rather than
     * about colour.
     *
     * The owner minted this sentence; the agent did not. Nothing about
     * storage, encryption, the write path or the state transitions moved with
     * it.
     */
    readonly statusRemoved: string;
    readonly validatedAt: string;
    readonly neverShown: string;
    readonly costsNote: string;
  };
  /** Every declared validation outcome, mapped from the closed vocabulary. */
  readonly validation: Record<ByokValidationOutcome, string>;
  readonly saved: string;
  readonly rotated: string;
  readonly removed: string;
  readonly rotationConflict: string;
  readonly shapeInvalid: string;
  /**
   * `BYOK-CAPTURE-004`/`005`/`006` — the bounded, explicit pending-entry action.
   *
   * `queued` and `partial` carry `{count}`, and `partial` exists because a
   * bounded action that reports only "done" after processing 25 of 200 entries
   * has told the user something false by omission.
   */
  readonly pendingEntries: {
    readonly title: string;
    readonly description: string;
    readonly button: string;
    readonly none: string;
    readonly queued: string;
    readonly partial: string;
    readonly alreadyQueued: string;
  };
};

const ptBR: ByokCopy = {
  messages: {
    credentialRequired:
      "Configure sua chave da OpenAI em Configurações para usar os recursos de IA.",
    credentialUnreadable:
      "Não foi possível usar sua chave da OpenAI. Configure-a novamente em Configurações.",
  },
  settings: {
    title: "Sua chave da OpenAI",
    intro:
      "Os recursos de IA usam a sua própria chave da OpenAI. O uso é cobrado diretamente na sua conta da OpenAI.",
    honesty:
      "A chave é guardada criptografada e nunca é exibida novamente. Depois de salva, ela não volta para o navegador e não é escrita em nenhum log. Remover é imediato no sistema ativo; cópias de backup expiram no prazo do provedor.",
    fieldLabel: "Chave da API",
    fieldHint: "Cole a chave. Ela é validada com uma chamada mínima antes de ser salva.",
    save: "Salvar chave",
    rotate: "Substituir chave",
    remove: "Remover chave",
    removeConfirm:
      "Remover a chave desativa os recursos de IA até que você configure outra. Nada é apagado: os registros já capturados continuam salvos, com as interpretações que já tiverem. Os registros capturados sem chave ficam aguardando e só são interpretados quando você pedir; o que já estava na fila volta a andar sozinho assim que houver uma chave nova. Continuar?",
    statusConfigured: "Configurada",
    statusInvalid: "Recusada pelo provedor",
    statusAbsent: "Nenhuma chave configurada",
    statusRemoved: "Chave removida",
    validatedAt: "Validada em",
    neverShown: "Por segurança, a chave nunca é exibida depois de salva.",
    costsNote:
      "Os custos mostrados aqui são estimativas. O valor verdadeiro está no painel da sua conta OpenAI.",
  },
  validation: {
    invalid_key: "A OpenAI recusou esta chave.",
    insufficient_quota: "Esta chave não tem saldo disponível na OpenAI.",
    rate_limited: "A OpenAI limitou as tentativas. Tente de novo em alguns minutos.",
    revoked: "Esta chave foi revogada na OpenAI.",
    unknown: "Não foi possível validar a chave agora.",
    throttled: "Muitas tentativas de validação. Tente novamente mais tarde.",
  },
  saved: "Chave salva e validada.",
  rotated: "Chave substituída e validada.",
  removed: "Chave removida.",
  rotationConflict: "Outra alteração aconteceu ao mesmo tempo. Recarregue e tente de novo.",
  shapeInvalid: "Formato de chave inválido.",
  pendingEntries: {
    title: "Registros aguardando interpretação",
    description:
      "Estes registros foram salvos enquanto nenhuma chave estava configurada. Nada é interpretado automaticamente: cada interpretação consome a sua cota na OpenAI, então ela só acontece quando você pedir.",
    button: "Interpretar registros pendentes",
    none: "Nenhum registro aguardando interpretação.",
    queued: "{count} registro(s) enviados para interpretação.",
    partial:
      "{count} registro(s) enviados para interpretação. Ainda há registros pendentes — use o botão de novo para continuar.",
    alreadyQueued: "Estes registros já estavam na fila.",
  },
};

const en: ByokCopy = {
  messages: {
    credentialRequired: "Configure your OpenAI key in Settings to use the AI features.",
    credentialUnreadable:
      "Your OpenAI key could not be used. Please configure it again in Settings.",
  },
  settings: {
    title: "Your OpenAI key",
    intro:
      "The AI features use your own OpenAI key. Usage is billed directly to your OpenAI account.",
    honesty:
      "The key is stored encrypted and is never shown again. Once saved it does not come back to the browser and is never written to a log. Removal is immediate in the live system; backups age out on the provider's schedule.",
    fieldLabel: "API key",
    fieldHint: "Paste the key. It is validated with one minimal call before it is saved.",
    save: "Save key",
    rotate: "Replace key",
    remove: "Remove key",
    removeConfirm:
      "Removing the key turns off the AI features until you configure another one. Nothing is deleted: records you already captured stay saved, with whatever interpretation they already have. Records captured without a key wait and are interpreted only when you ask; anything already queued resumes on its own as soon as a new key exists. Continue?",
    statusConfigured: "Configured",
    statusInvalid: "Rejected by the provider",
    statusAbsent: "No key configured",
    statusRemoved: "Key removed",
    validatedAt: "Validated on",
    neverShown: "For safety, the key is never displayed after it is saved.",
    costsNote:
      "The costs shown here are estimates. The authoritative figure is in your own OpenAI dashboard.",
  },
  validation: {
    invalid_key: "OpenAI rejected this key.",
    insufficient_quota: "This key has no available quota at OpenAI.",
    rate_limited: "OpenAI rate-limited the attempt. Try again in a few minutes.",
    revoked: "This key has been revoked at OpenAI.",
    unknown: "The key could not be validated right now.",
    throttled: "Too many validation attempts. Try again later.",
  },
  saved: "Key saved and validated.",
  rotated: "Key replaced and validated.",
  removed: "Key removed.",
  rotationConflict: "Something else changed at the same time. Reload and try again.",
  shapeInvalid: "Invalid key format.",
  pendingEntries: {
    title: "Records awaiting interpretation",
    description:
      "These records were saved while no key was configured. Nothing is interpreted automatically: each interpretation spends your own OpenAI quota, so it happens only when you ask.",
    button: "Interpret pending records",
    none: "No records are awaiting interpretation.",
    queued: "{count} record(s) queued for interpretation.",
    partial:
      "{count} record(s) queued for interpretation. More are still pending — use the button again to continue.",
    alreadyQueued: "Those records were already queued.",
  },
};

export const byokCopy: Record<Locale, ByokCopy> = { "pt-BR": ptBR, en };

export function getByokCopy(locale: unknown): ByokCopy {
  return byokCopy[resolveLocale(locale)];
}
