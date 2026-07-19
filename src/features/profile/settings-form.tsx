"use client";

import { CheckCircle2, LoaderCircle, Save } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  MODEL_PROFILES,
  TEXT_MODEL_IDS,
  TEXT_MODEL_LABELS,
  type AIRoutingProfile,
  type AIProfilePreset,
  type TextModelId,
} from "@/lib/ai/model-routing";
import type { Locale } from "@/lib/preferences";
import type { SettingsFormValues } from "./settings-contracts";
import { getTimeZoneOptions } from "./timezones";

export type ProfileFormState = { status: "idle" | "success" | "error"; message: string };
export type ProfileFormAction = (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;

const idleState: ProfileFormState = { status: "idle", message: "" };
type TextRouteKey = "chatModel" | "extractionModel" | "reviewModel" | "fileModel";
type VisibleAIRoutes = Record<TextRouteKey, TextModelId>;

function Section({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="settings-section-heading"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div>;
}

function modelPrice(model: TextModelId, pt: boolean) {
  const prices = {
    "gpt-5.6-terra": "$2.50 in · $15 out / 1M",
    "gpt-5.6-luna": "$1 in · $6 out / 1M",
    "gpt-5-mini": "$0.25 in · $2 out / 1M",
  } as const;
  return pt ? prices[model].replace("in", "entrada").replace("out", "saída") : prices[model];
}

function ModelSelect({
  id,
  name,
  label,
  description,
  value,
  pt,
  onChange,
}: {
  id: string;
  name: TextRouteKey;
  label: string;
  description: string;
  value: TextModelId;
  pt: boolean;
  onChange: (route: TextRouteKey, model: TextModelId) => void;
}) {
  return <label className="ai-route" htmlFor={id}>
    <span className="ai-route-copy"><strong>{label}</strong><small>{description}</small></span>
    <span className="ai-route-control">
      <select id={id} name={name} aria-label={label} value={value} onChange={(event) => onChange(name, event.target.value as TextModelId)}>
        {TEXT_MODEL_IDS.map((model) => <option key={model} value={model}>{TEXT_MODEL_LABELS[model]} · {modelPrice(model, pt)}</option>)}
      </select>
    </span>
  </label>;
}

export function SettingsForm({
  action,
  initialState = idleState,
  locale,
  values,
}: {
  action: ProfileFormAction;
  initialState?: ProfileFormState;
  locale: Locale;
  values: SettingsFormValues;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const pt = locale === "pt-BR";
  const zones = getTimeZoneOptions(locale, values.timezone);
  const [aiProfile, setAIProfile] = useState<AIRoutingProfile>(values.aiProfile);
  const [routes, setRoutes] = useState<VisibleAIRoutes>({
    chatModel: values.chatModel,
    extractionModel: values.extractionModel,
    reviewModel: values.reviewModel,
    fileModel: values.fileModel,
  });

  function chooseProfile(profile: AIRoutingProfile) {
    setAIProfile(profile);
    if (profile === "custom") return;
    const preset = MODEL_PROFILES[profile as AIProfilePreset];
    setRoutes({
      chatModel: preset.chatModel,
      extractionModel: preset.extractionModel,
      reviewModel: preset.reviewModel,
      fileModel: preset.fileModel,
    });
  }

  function changeRoute(name: TextRouteKey, model: TextModelId) {
    setRoutes((current) => ({ ...current, [name]: model }));
    setAIProfile("custom");
  }

  const profiles: Array<{ id: AIRoutingProfile; title: string; description: string }> = [
    {
      id: "quality",
      title: pt ? "Qualidade máxima · Recomendado" : "Maximum quality · Recommended",
      description: pt ? "Terra no chat e nas revisões; Luna na captura e nos arquivos." : "Terra for chat and reviews; Luna for capture and files.",
    },
    {
      id: "balanced",
      title: pt ? "Equilibrado" : "Balanced",
      description: pt ? "Luna no chat e nas revisões; Mini na captura e nos arquivos." : "Luna for chat and reviews; Mini for capture and files.",
    },
    {
      id: "economy",
      title: pt ? "Econômico" : "Economy",
      description: pt ? "GPT-5 mini em todas as funções atualmente configuráveis." : "GPT-5 mini for every currently configurable function.",
    },
    {
      id: "custom",
      title: pt ? "Personalizado" : "Custom",
      description: pt ? "Controle separadamente somente as funções com consumer ativo." : "Control only functions with an active consumer separately.",
    },
  ];

  return <form action={formAction} className="settings-form">
    <input type="hidden" name="locale" value={locale} />

    <Section number="01" title={pt ? "Fuso horário" : "Time zone"} description={pt ? "Datas, prazos, revisões manuais e períodos silenciosos usam esta escolha." : "Dates, deadlines, manual reviews, and quiet periods use this setting."} />
    <div className="settings-fields"><label htmlFor="timezone">{pt ? "Fuso horário" : "Time zone"}<select id="timezone" name="timezone" aria-label={pt ? "Fuso horário" : "Time zone"} defaultValue={values.timezone}>{zones.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{pt ? "Também interpreta expressões como “amanhã”." : "It also resolves phrases such as tomorrow."}</small></label></div>

    <Section number="02" title={pt ? "Como o Brain responde" : "How Brain responds"} description={pt ? "Estas escolhas afetam chat e revisões geradas sob demanda." : "These settings affect chat and reviews generated on demand."} />
    <div className="settings-fields"><label htmlFor="personality">{pt ? "Personalidade" : "Personality"}<select id="personality" name="personality" defaultValue={values.personality}><option value="proactive">{pt ? "Proativa" : "Proactive"}</option><option value="direct">{pt ? "Direta" : "Direct"}</option><option value="warm">{pt ? "Acolhedora" : "Warm"}</option><option value="analytical">{pt ? "Analítica" : "Analytical"}</option></select></label><label htmlFor="tone">{pt ? "Tom" : "Tone"}<select id="tone" name="tone" defaultValue={values.tone}><option value="direct">{pt ? "Direto" : "Direct"}</option><option value="informal">Informal</option><option value="natural">Natural</option><option value="professional">{pt ? "Profissional" : "Professional"}</option></select></label><label htmlFor="response-detail">{pt ? "Detalhe das respostas" : "Response detail"}<select id="response-detail" name="responseDetail" defaultValue={values.responseDetail}><option value="short">{pt ? "Curto" : "Short"}</option><option value="balanced">{pt ? "Equilibrado" : "Balanced"}</option><option value="detailed">{pt ? "Detalhado" : "Detailed"}</option></select></label></div>

    <Section number="03" title={pt ? "Silêncio e frequência" : "Quiet hours and frequency"} description={pt ? "Limites aplicados pelo processamento de lembretes e acompanhamentos." : "Limits enforced by reminder and follow-up processing."} />
    <div className="settings-fields"><label htmlFor="quiet-start">{pt ? "Período silencioso começa" : "Quiet period starts"}<input id="quiet-start" name="quietStart" type="time" defaultValue={values.quietStart} /></label><label htmlFor="quiet-end">{pt ? "Período silencioso termina" : "Quiet period ends"}<input id="quiet-end" name="quietEnd" type="time" defaultValue={values.quietEnd} /></label><label htmlFor="max-followups">{pt ? "Máximo de acompanhamentos por dia" : "Maximum follow-ups per day"}<input id="max-followups" name="maxFollowupsPerDay" type="number" min="0" max="20" defaultValue={values.maxFollowupsPerDay} /></label><label className="settings-checkbox"><input name="importantReminderOverride" type="checkbox" defaultChecked={values.importantReminderOverride} /><span>{pt ? "Permitir lembretes importantes durante o silêncio" : "Allow important reminders during quiet hours"}</span></label></div>

    <details className="settings-advanced">
      <summary><span>04</span><div><strong>{pt ? "IA avançada" : "Advanced AI"}</strong><small>{pt ? "Roteamento e custos das funções com consumer ativo." : "Routing and costs for functions with active consumers."}</small></div></summary>
      <div className="settings-advanced-content">
        <fieldset className="ai-profile-fieldset"><legend>{pt ? "Perfil de custo e qualidade" : "Cost and quality profile"}</legend><div className="ai-profile-grid">{profiles.map((profile) => <label key={profile.id} className={`ai-profile-card${aiProfile === profile.id ? " active" : ""}`}><input type="radio" name="aiProfile" value={profile.id} checked={aiProfile === profile.id} onChange={() => chooseProfile(profile.id)} /><span><strong>{profile.title}</strong><small>{profile.description}</small></span></label>)}</div></fieldset>

        <div className="ai-routes"><div className="ai-routes-heading"><span>{pt ? "ROTEAMENTO POR FUNÇÃO" : "ROUTING BY FUNCTION"}</span><p>{pt ? "Somente funções com execução comprovada aparecem aqui." : "Only functions with proven execution appear here."}</p><Link href={`/${locale}/app/costs`}>{pt ? "Ver custos de IA" : "View AI costs"}</Link></div>
          <ModelSelect id="chat-model" name="chatModel" label={pt ? "Chat principal" : "Main chat"} description={pt ? "Respostas, contexto e conversa do dia a dia." : "Answers, context, and daily conversation."} value={routes.chatModel} pt={pt} onChange={changeRoute} />
          <ModelSelect id="extraction-model" name="extractionModel" label={pt ? "Captura e organização" : "Capture and organization"} description={pt ? "Classifica entradas e extrai tarefas, pessoas e datas." : "Classifies entries and extracts tasks, people, and dates."} value={routes.extractionModel} pt={pt} onChange={changeRoute} />
          <ModelSelect id="review-model" name="reviewModel" label={pt ? "Revisões e resumos" : "Reviews and summaries"} description={pt ? "Revisões geradas manualmente a partir dos seus registros." : "Reviews generated on demand from your records."} value={routes.reviewModel} pt={pt} onChange={changeRoute} />
          <ModelSelect id="file-model" name="fileModel" label={pt ? "Análise de arquivos" : "File analysis"} description={pt ? "Imagens, PDFs, documentos e planilhas." : "Images, PDFs, documents, and spreadsheets."} value={routes.fileModel} pt={pt} onChange={changeRoute} />
          <div className="ai-route ai-route-fixed"><span className="ai-route-copy"><strong>{pt ? "Busca semântica" : "Semantic search"}</strong><small>{pt ? "Informativo: o modelo fixo encontra memórias relacionadas e não é configurável." : "Informational: the fixed model finds related memories and is not configurable."}</small></span><span className="embedding-chip">text-embedding-3-small · $0.02 / 1M</span></div>
        </div>
      </div>
    </details>

    <div className="settings-save-bar"><div aria-live="polite">{state.status !== "idle" && <p className={`settings-feedback ${state.status}`} role={state.status === "success" ? "status" : "alert"}>{state.status === "success" && <CheckCircle2 size={18} />} {state.message}</p>}</div><button type="submit" disabled={pending} className="settings-submit">{pending ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} {pending ? (pt ? "Salvando…" : "Saving…") : (pt ? "Salvar preferências" : "Save preferences")}</button></div>
  </form>;
}
