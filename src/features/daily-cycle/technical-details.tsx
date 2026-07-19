import { Brain, History, ShieldCheck } from "lucide-react";
import { TrackedTechnicalDetails } from "@/features/product-analytics/interaction-events";
import { conceptLabels } from "@/features/interpretations/copy";
import type { InterpretationTechnicalDetailsView } from "./contracts";
import type { DailyCycleLocale } from "./copy";
import type { EntryReviewEditableCurrent, EntryReviewHistoryItem } from "./review-projection";

export type TechnicalDetailsStructuredContent = {
  concepts: EntryReviewEditableCurrent["concepts"];
  extractedDates: EntryReviewEditableCurrent["extractedDates"];
  entityLinks: EntryReviewEditableCurrent["entityLinks"];
  extractedMentions: readonly { name: string; evidence: string; confidence: number }[];
};

const policyLabels = {
  auto_apply: { "pt-BR": "Aplicação automática", en: "Auto-apply" },
  apply_and_flag: { "pt-BR": "Aplicado e sinalizado", en: "Applied and flagged" },
  request_review: { "pt-BR": "Revisão solicitada", en: "Review requested" },
  block_until_confirmation: { "pt-BR": "Bloqueado até confirmação", en: "Blocked until confirmation" },
} as const;

const originLabels: Record<string, { "pt-BR": string; en: string }> = {
  ai_generated: { "pt-BR": "Interpretação inicial", en: "Initial interpretation" },
  user_corrected: { "pt-BR": "Correção do usuário", en: "User correction" },
  ai_reprocessed: { "pt-BR": "Reinterpretação por IA", en: "AI reinterpretation" },
  question_resolved: { "pt-BR": "Pergunta resolvida", en: "Question resolved" },
};

const evidenceLabels: Record<string, { "pt-BR": string; en: string }> = {
  explicit_user_confirmation: { "pt-BR": "Confirmação explícita do usuário", en: "Explicit user confirmation" },
  semantic_similarity_not_available: { "pt-BR": "Similaridade semântica não participou desta decisão", en: "Semantic similarity was not used in this decision" },
  model_structured_output: { "pt-BR": "Saída estruturada do modelo", en: "Structured model output" },
  normalized_exact_name: { "pt-BR": "Nome exato após normalização", en: "Exact normalized name" },
  normalized_name_overlap: { "pt-BR": "Correspondência parcial de nome", en: "Partial name match" },
  exact_alias: { "pt-BR": "Alias exato e válido", en: "Exact valid alias" },
  historical_recurrence: { "pt-BR": "Vínculo recorrente no histórico", en: "Recurring historical link" },
  organization_context: { "pt-BR": "Organização compatível", en: "Matching organization" },
  temporal_validity: { "pt-BR": "Vínculo válido na data", en: "Link valid at that time" },
  candidate_set_bounded_50: { "pt-BR": "Busca limitada a 50 candidatos do usuário", en: "Search bounded to 50 user-owned candidates" },
};

const overrideLabels: Record<string, { "pt-BR": string; en: string }> = {
  material_ambiguity: { "pt-BR": "Ambiguidade relevante entre candidatos", en: "Material ambiguity between candidates" },
  low_candidate_margin: { "pt-BR": "Diferença pequena entre os melhores candidatos", en: "Small margin between top candidates" },
  insufficient_evidence: { "pt-BR": "Evidência insuficiente", en: "Insufficient evidence" },
  date_conflict: { "pt-BR": "Conflito de datas", en: "Date conflict" },
  ownership_conflict: { "pt-BR": "Conflito de propriedade", en: "Ownership conflict" },
  cross_user_entity: { "pt-BR": "Vínculo pertence a outro usuário", en: "Link belongs to another user" },
};

const fieldLabels: Record<string, { "pt-BR": string; en: string }> = {
  summary: { "pt-BR": "Resumo", en: "Summary" },
  concepts: { "pt-BR": "Conceitos", en: "Concepts" },
  occurredAt: { "pt-BR": "Data do acontecimento", en: "Event date" },
  extractedDates: { "pt-BR": "Datas identificadas", en: "Identified dates" },
  entityLinks: { "pt-BR": "Vínculos", en: "Links" },
  classifications: { "pt-BR": "Classificações", en: "Classifications" },
};

function humanEvidence(value: string, locale: DailyCycleLocale) {
  return evidenceLabels[value]?.[locale] ?? value.replaceAll("_", " ");
}

function changeValue(field: string, value: unknown, locale: DailyCycleLocale) {
  if (field === "concepts" && Array.isArray(value)) {
    return value.map((concept) => typeof concept === "string" ? conceptLabels[concept as keyof typeof conceptLabels]?.[locale] ?? concept : "").filter(Boolean).join(", ");
  }
  if (field === "entityLinks" && Array.isArray(value)) {
    return value.map((link) => link && typeof link === "object" && "name" in link ? String(link.name) : "").filter(Boolean).join(", ");
  }
  if (field === "extractedDates" && Array.isArray(value)) {
    return value.map((date) => date && typeof date === "object" && "value" in date ? String(date.value) : "").filter(Boolean).join(", ");
  }
  if (field === "classifications" && value && typeof value === "object") {
    return Object.entries(value).map(([key, classification]) => `${key}: ${String(classification)}`).join(" · ");
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value ?? "—");
}

export function TechnicalDetails({
  entryId,
  technical,
  history,
  hasTechnicalDetails,
  locale,
  structured,
}: {
  entryId: string;
  technical: InterpretationTechnicalDetailsView | null;
  history: readonly EntryReviewHistoryItem[];
  hasTechnicalDetails: boolean;
  locale: DailyCycleLocale;
  structured?: TechnicalDetailsStructuredContent | null;
}) {
  if (!hasTechnicalDetails) return null;
  const pt = locale === "pt-BR";
  const comparisons = technical ? Object.entries(technical.comparisons) : [];

  return (
    <TrackedTechnicalDetails entryId={entryId} locale={locale} className="technical-details">
      <summary>{pt ? "Ver detalhes técnicos" : "View technical details"}</summary>
      <div className="technical-details-body">
        {!technical && (
          <p className="technical-details-unavailable">
            {pt
              ? "Não foi possível carregar os detalhes técnicos agora. A revisão principal continua correta."
              : "We could not load technical details right now. The main review remains accurate."}
          </p>
        )}

        {structured && (structured.concepts.length > 0 || structured.extractedDates.length > 0 || structured.entityLinks.length > 0 || structured.extractedMentions.length > 0) && (
          <section className="interpretation-main">
            <div className="section-heading"><span aria-hidden="true">01</span><div><h2>{pt ? "O que foi extraído" : "What was extracted"}</h2><p>{pt ? "Dados estruturados sem alterar o registro original." : "Structured data without changing the original record."}</p></div></div>
            {structured.concepts.length > 0 && (
              <div className="tag-cloud">
                {structured.concepts.map((concept) => <span key={concept}>{conceptLabels[concept]?.[locale] ?? concept}</span>)}
              </div>
            )}
            {structured.extractedDates.length > 0 && (
              <div className="identified-dates"><h3>{pt ? "Datas identificadas" : "Identified dates"}</h3>{structured.extractedDates.map((date, index) => <p key={`${date.value}-${index}`}><time>{date.value}</time>{date.label ? ` · ${date.label}` : ""}</p>)}</div>
            )}
            {structured.entityLinks.length > 0 && (
              <div className="entity-list">
                {structured.entityLinks.map((entity) => <article key={`${entity.entityType}:${entity.entityId}`}><strong>{entity.name}</strong><span>{entity.mention}</span><small>{Math.round(entity.confidence * 100)}%</small></article>)}
              </div>
            )}
            {structured.extractedMentions.length > 0 && (
              <div className="extracted-mention-list">
                <h3>{pt ? "Menções extraídas" : "Extracted mentions"}</h3>
                <div className="entity-list">
                  {structured.extractedMentions.map((entity, index) => <article key={`${entity.name}:${index}`}><strong>{entity.name}</strong><span>{entity.evidence}</span><small>{Math.round(entity.confidence * 100)}%</small></article>)}
                </div>
              </div>
            )}
          </section>
        )}

        {technical && Object.keys(technical.scores).length > 0 && (
          <section className="interpretation-trust-panel">
            <div className="section-heading"><span aria-hidden="true">%</span><div><h2>{pt ? "Confiança por elemento" : "Trust by element"}</h2><p>{pt ? "Sinais, política e evidências persistidos nesta versão." : "Signals, policy, and evidence persisted for this version."}</p></div></div>
            <div className="trust-list">
              {Object.keys(technical.scores).map((element) => {
                const policy = technical.policies[element] as keyof typeof policyLabels;
                const evidenceList = Array.isArray(technical.evidence[element]) ? technical.evidence[element] as string[] : [];
                const overrideList = Array.isArray(technical.overrides[element]) ? technical.overrides[element] as string[] : [];
                const signalRecord = technical.signals[element];
                const signalEntries = signalRecord && typeof signalRecord === "object" && !Array.isArray(signalRecord)
                  ? Object.entries(signalRecord as Record<string, number>)
                  : [];
                return (
                  <details key={element} className={`trust-card trust-policy-${policy}`}>
                    <summary><span><ShieldCheck size={17} aria-hidden="true" />{element}</span><strong>{Math.round(Number(technical.scores[element]) * 100)}%</strong><small>{policyLabels[policy]?.[locale] ?? policy}</small></summary>
                    {evidenceList.length > 0 && <ul>{evidenceList.map((evidence) => <li key={evidence}>{humanEvidence(evidence, locale)}</li>)}</ul>}
                    {overrideList.length > 0 && <div className="trust-overrides"><strong>{pt ? "Bloqueios" : "Overrides"}</strong>{overrideList.map((override) => <p key={override}>{overrideLabels[override]?.[locale] ?? override.replaceAll("_", " ")}</p>)}</div>}
                    <div className="trust-signals">{signalEntries.map(([signal, value]) => <span key={signal}>{signal.replaceAll(/([A-Z])/g, " $1")}: {Math.round(Number(value) * 100)}%</span>)}</div>
                  </details>
                );
              })}
            </div>
          </section>
        )}

        {history.length > 0 && (
          <section className="interpretation-history">
            <div className="section-heading"><span aria-hidden="true"><History size={14} /></span><div><h2>{pt ? "Histórico imutável" : "Immutable history"}</h2><p>{pt ? "Cada correção, undo e reinterpretação acrescenta uma versão." : "Every correction, undo, and reinterpretation appends a version."}</p></div></div>
            <ol className="revision-timeline">
              {history.map((revision) => (
                <li key={revision.interpretationId} className={revision.isCurrent ? "revision-current" : undefined}>
                  <History size={17} aria-hidden="true" />
                  <div><strong>v{revision.version} · {originLabels[revision.origin]?.[locale] ?? revision.origin}</strong><p>{revision.summary}</p>{revision.correctionReason && <small>{revision.correctionReason}</small>}</div>
                  <time>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(revision.createdAt))}</time>
                </li>
              ))}
            </ol>
            {comparisons.length > 0 && (
              <div className="revision-comparisons">
                <h3>{pt ? "O que mudou" : "What changed"}</h3>
                {comparisons.map(([key, changes]) => {
                  const [from, to] = key.split("-");
                  const changeList = Array.isArray(changes) ? changes as Array<{ field: string; before: unknown; after: unknown }> : [];
                  return (
                    <details key={key}>
                      <summary>v{from} → v{to} · {changeList.length} {pt ? "alterações" : "changes"}</summary>
                      {changeList.length === 0 ? <p>{pt ? "Sem mudança de conteúdo." : "No content change."}</p> : changeList.map((change) => (
                        <article key={change.field}><strong>{fieldLabels[change.field]?.[locale] ?? change.field}</strong><p><del>{changeValue(change.field, change.before, locale)}</del></p><p><ins>{changeValue(change.field, change.after, locale)}</ins></p></article>
                      ))}
                    </details>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {technical?.model && <p className="model-note"><Brain size={14} aria-hidden="true" />{technical.model}</p>}
      </div>
    </TrackedTechnicalDetails>
  );
}
