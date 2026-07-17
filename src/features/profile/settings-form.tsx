"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, LoaderCircle, Save } from "lucide-react";
import {
  MODEL_PROFILES,
  TEXT_MODEL_IDS,
  TEXT_MODEL_LABELS,
  type AIRoutes,
  type AIRoutingProfile,
  type AIProfilePreset,
  type TextModelId,
} from "@/lib/ai/model-routing";
import type { Locale } from "@/lib/preferences";
import { getTimeZoneOptions } from "./timezones";

export type ProfileFormState = { status: "idle" | "success" | "error"; message: string };
export type ProfileFormAction = (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;

type Values = {
  displayName: string;
  agentName: string;
  locale: Locale;
  timezone: string;
  followUpIntensity: "calm" | "balanced" | "insistent" | "custom";
  dailyReviewTime: string;
  personality?: "direct" | "proactive" | "warm" | "analytical";
  tone?: "direct" | "informal" | "natural" | "professional";
  autonomyLevel?: "suggestive" | "balanced" | "autonomous";
  weeklyReviewDay?: number;
  weeklyReviewTime?: string;
  planningDay?: number;
  planningTime?: string;
  quietStart?: string;
  quietEnd?: string;
  importantReminderOverride?: boolean;
  maxFollowupsPerDay?: number;
  responseDetail?: "short" | "balanced" | "detailed";
  aiProvider?: "openai";
  aiProfile?: AIRoutingProfile;
  chatModel?: TextModelId;
  extractionModel?: TextModelId;
  reasoningModel?: TextModelId;
  reviewModel?: TextModelId;
  fileModel?: TextModelId;
  backgroundModel?: TextModelId;
  embeddingModel?: "text-embedding-3-small";
  privacyDefault?: "normal" | "private" | "highly_sensitive";
};

const idleState: ProfileFormState = { status: "idle", message: "" };
const daysPt = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type TextRouteKey = keyof Pick<AIRoutes, "chatModel" | "extractionModel" | "reasoningModel" | "reviewModel" | "fileModel" | "backgroundModel">;

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

export function SettingsForm({ action, initialState = idleState, locale, values }: { action: ProfileFormAction; initialState?: ProfileFormState; locale: Locale; values: Values }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const pt = locale === "pt-BR";
  const zones = getTimeZoneOptions(locale, values.timezone);
  const days = pt ? daysPt : daysEn;
  const initialRoutes: AIRoutes = {
    chatModel: values.chatModel ?? MODEL_PROFILES.quality.chatModel,
    extractionModel: values.extractionModel ?? MODEL_PROFILES.quality.extractionModel,
    reasoningModel: values.reasoningModel ?? MODEL_PROFILES.quality.reasoningModel,
    reviewModel: values.reviewModel ?? MODEL_PROFILES.quality.reviewModel,
    fileModel: values.fileModel ?? MODEL_PROFILES.quality.fileModel,
    backgroundModel: values.backgroundModel ?? MODEL_PROFILES.quality.backgroundModel,
    embeddingModel: values.embeddingModel ?? "text-embedding-3-small",
  };
  const [aiProfile, setAIProfile] = useState<AIRoutingProfile>(values.aiProfile ?? "quality");
  const [routes, setRoutes] = useState<AIRoutes>(initialRoutes);

  function chooseProfile(profile: AIRoutingProfile) {
    setAIProfile(profile);
    if (profile !== "custom") setRoutes({ ...MODEL_PROFILES[profile as AIProfilePreset] });
  }

  function changeRoute(name: TextRouteKey, model: TextModelId) {
    setRoutes((current) => ({ ...current, [name]: model }));
    setAIProfile("custom");
  }

  const profiles: Array<{ id: AIRoutingProfile; title: string; description: string }> = [
    { id: "quality", title: pt ? "Qualidade máxima" : "Maximum quality", description: pt ? "Terra onde julgamento importa; modelos econômicos no trabalho previsível." : "Terra where judgment matters; efficient models for predictable work." },
    { id: "balanced", title: pt ? "Equilibrado" : "Balanced", description: pt ? "Luna no uso diário e Terra somente no raciocínio avançado." : "Luna day to day and Terra only for advanced reasoning." },
    { id: "economy", title: pt ? "Econômico" : "Economy", description: pt ? "GPT-5 mini na maior parte das rotinas, com Luna como reforço." : "GPT-5 mini for most routines, with Luna as backup quality." },
    { id: "custom", title: pt ? "Personalizado" : "Custom", description: pt ? "Controle cada tipo de operação separadamente." : "Control every operation separately." },
  ];

  return <form action={formAction} className="settings-form">
    <Section number="01" title={pt ? "Identidade" : "Identity"} description={pt ? "Como você e o agente aparecem na conversa." : "How you and the agent appear in conversation."} />
    <div className="settings-fields"><label htmlFor="display-name">{pt ? "Seu nome" : "Your name"}<input id="display-name" name="displayName" required defaultValue={values.displayName} autoComplete="name" /></label><label htmlFor="agent-name">{pt ? "Nome do agente" : "Agent name"}<input id="agent-name" name="agentName" required defaultValue={values.agentName} /></label></div>

    <Section number="02" title={pt ? "Idioma e horário" : "Language and time"} description={pt ? "Datas, lembretes e resumos seguem estas escolhas." : "Dates, reminders, and reviews follow these choices."} />
    <div className="settings-fields"><label htmlFor="locale">{pt ? "Idioma" : "Language"}<select id="locale" name="locale" defaultValue={values.locale}><option value="pt-BR">Português (Brasil)</option><option value="en">English</option></select></label><label htmlFor="timezone">{pt ? "Fuso horário" : "Time zone"}<select id="timezone" name="timezone" defaultValue={values.timezone} aria-label={pt ? "Fuso horário" : "Time zone"}>{zones.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{pt ? "Usado para interpretar “amanhã”, prazos e períodos silenciosos." : "Used to interpret tomorrow, deadlines, and quiet periods."}</small></label></div>

    <Section number="03" title={pt ? "Personalidade e autonomia" : "Personality and autonomy"} description={pt ? "Ajuste como o Brain fala, decide e acompanha." : "Tune how Brain speaks, decides, and follows up."} />
    <div className="settings-fields"><label>{pt ? "Personalidade" : "Personality"}<select name="personality" defaultValue={values.personality ?? "proactive"}><option value="proactive">{pt ? "Proativa" : "Proactive"}</option><option value="direct">{pt ? "Direta" : "Direct"}</option><option value="warm">{pt ? "Acolhedora" : "Warm"}</option><option value="analytical">{pt ? "Analítica" : "Analytical"}</option></select></label><label>{pt ? "Tom" : "Tone"}<select name="tone" defaultValue={values.tone ?? "direct"}><option value="direct">{pt ? "Direto" : "Direct"}</option><option value="informal">Informal</option><option value="natural">Natural</option><option value="professional">{pt ? "Profissional" : "Professional"}</option></select></label><label>{pt ? "Nível de autonomia" : "Autonomy level"}<select name="autonomyLevel" defaultValue={values.autonomyLevel ?? "autonomous"}><option value="autonomous">{pt ? "Autônomo" : "Autonomous"}</option><option value="balanced">{pt ? "Equilibrado" : "Balanced"}</option><option value="suggestive">{pt ? "Somente sugestões" : "Suggestions only"}</option></select></label><label>{pt ? "Intensidade das cobranças" : "Follow-up intensity"}<select name="followUpIntensity" defaultValue={values.followUpIntensity}><option value="calm">{pt ? "Tranquila" : "Calm"}</option><option value="balanced">{pt ? "Equilibrada" : "Balanced"}</option><option value="insistent">{pt ? "Insistente" : "Insistent"}</option><option value="custom">{pt ? "Personalizada" : "Custom"}</option></select></label></div>

    <Section number="04" title={pt ? "Revisões programadas" : "Scheduled reviews"} description={pt ? "Escolha quando o Brain fecha o dia e organiza a semana." : "Choose when Brain closes the day and organizes the week."} />
    <div className="settings-fields"><label>{pt ? "Resumo diário" : "Daily review"}<input name="dailyReviewTime" type="time" defaultValue={values.dailyReviewTime} /></label><label>{pt ? "Revisão semanal" : "Weekly review"}<span className="compound-field"><select name="weeklyReviewDay" defaultValue={values.weeklyReviewDay ?? 5}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><input name="weeklyReviewTime" type="time" defaultValue={values.weeklyReviewTime ?? "19:00"} /></span></label><label>{pt ? "Planejamento semanal" : "Weekly planning"}<span className="compound-field"><select name="planningDay" defaultValue={values.planningDay ?? 1}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><input name="planningTime" type="time" defaultValue={values.planningTime ?? "08:00"} /></span></label></div>

    <Section number="05" title={pt ? "Silêncio e frequência" : "Quiet hours and frequency"} description={pt ? "Limites para o Brain ser útil sem ser invasivo." : "Limits that keep Brain useful without becoming intrusive."} />
    <div className="settings-fields"><label htmlFor="quiet-start">{pt ? "Período silencioso começa" : "Quiet period starts"}<input id="quiet-start" name="quietStart" type="time" defaultValue={values.quietStart ?? "22:30"} /></label><label>{pt ? "Período silencioso termina" : "Quiet period ends"}<input name="quietEnd" type="time" defaultValue={values.quietEnd ?? "07:00"} /></label><label>{pt ? "Máximo de cobranças por dia" : "Maximum follow-ups per day"}<input name="maxFollowupsPerDay" type="number" min="0" max="20" defaultValue={values.maxFollowupsPerDay ?? 3} /></label><label className="settings-checkbox"><input name="importantReminderOverride" type="checkbox" defaultChecked={values.importantReminderOverride ?? true} /><span>{pt ? "Permitir lembretes importantes durante o silêncio" : "Allow important reminders during quiet hours"}</span></label></div>

    <Section number="06" title={pt ? "IA, custo e privacidade" : "AI, cost, and privacy"} description={pt ? "Escolha onde priorizar qualidade e onde economizar." : "Choose where to prioritize quality and where to save."} />
    <div className="settings-fields"><label>{pt ? "Detalhe das respostas" : "Response detail"}<select name="responseDetail" defaultValue={values.responseDetail ?? "short"}><option value="short">{pt ? "Curto" : "Short"}</option><option value="balanced">{pt ? "Equilibrado" : "Balanced"}</option><option value="detailed">{pt ? "Detalhado" : "Detailed"}</option></select></label><label>{pt ? "Privacidade padrão" : "Default privacy"}<select name="privacyDefault" defaultValue={values.privacyDefault ?? "normal"}><option value="normal">Normal</option><option value="private">{pt ? "Privado" : "Private"}</option><option value="highly_sensitive">{pt ? "Muito sensível" : "Highly sensitive"}</option></select></label><label>{pt ? "Provedor de IA" : "AI provider"}<select name="aiProvider" defaultValue={values.aiProvider ?? "openai"}><option value="openai">OpenAI</option></select></label></div>

    <fieldset className="ai-profile-fieldset"><legend>{pt ? "Perfil de custo e qualidade" : "Cost and quality profile"}</legend><div className="ai-profile-grid">{profiles.map((profile) => <label key={profile.id} className={`ai-profile-card${aiProfile === profile.id ? " active" : ""}`}><input type="radio" name="aiProfile" value={profile.id} checked={aiProfile === profile.id} onChange={() => chooseProfile(profile.id)} /><span><strong>{profile.title}</strong><small>{profile.description}</small></span></label>)}</div></fieldset>

    <div className="ai-routes"><div className="ai-routes-heading"><span>{pt ? "ROTEAMENTO POR FUNÇÃO" : "ROUTING BY FUNCTION"}</span><p>{pt ? "Os valores abaixo são salvos por usuário. Alterar um deles ativa o perfil Personalizado." : "These values are saved per user. Changing one activates the Custom profile."}</p></div>
      <ModelSelect id="chat-model" name="chatModel" label={pt ? "Chat principal" : "Main chat"} description={pt ? "Respostas, contexto e conversa do dia a dia." : "Answers, context, and daily conversation."} value={routes.chatModel} pt={pt} onChange={changeRoute} />
      <ModelSelect id="extraction-model" name="extractionModel" label={pt ? "Captura e organização" : "Capture and organization"} description={pt ? "Classifica entradas e extrai tarefas, pessoas e datas." : "Classifies entries and extracts tasks, people, and dates."} value={routes.extractionModel} pt={pt} onChange={changeRoute} />
      <ModelSelect id="reasoning-model" name="reasoningModel" label={pt ? "Raciocínio avançado" : "Advanced reasoning"} description={pt ? "Decisões complexas e análises que exigem mais julgamento." : "Complex decisions and analysis that need stronger judgment."} value={routes.reasoningModel} pt={pt} onChange={changeRoute} />
      <ModelSelect id="review-model" name="reviewModel" label={pt ? "Revisões e resumos" : "Reviews and summaries"} description={pt ? "Fechamentos diários, semanais e mensais." : "Daily, weekly, and monthly synthesis."} value={routes.reviewModel} pt={pt} onChange={changeRoute} />
      <ModelSelect id="file-model" name="fileModel" label={pt ? "Análise de arquivos" : "File analysis"} description={pt ? "Imagens, PDFs, documentos e planilhas." : "Images, PDFs, documents, and spreadsheets."} value={routes.fileModel} pt={pt} onChange={changeRoute} />
      <ModelSelect id="background-model" name="backgroundModel" label={pt ? "Rotinas internas" : "Background routines"} description={pt ? "Classificações simples e tarefas em segundo plano." : "Simple classifications and background work."} value={routes.backgroundModel} pt={pt} onChange={changeRoute} />
      <div className="ai-route ai-route-fixed"><span className="ai-route-copy"><strong>{pt ? "Busca semântica" : "Semantic search"}</strong><small>{pt ? "Modelo especializado para encontrar memórias relacionadas." : "Specialized model for finding related memories."}</small></span><span className="embedding-chip">text-embedding-3-small · $0.02 / 1M</span><input type="hidden" name="embeddingModel" value={routes.embeddingModel} /></div>
    </div>

    <div className="settings-save-bar"><div aria-live="polite">{state.status !== "idle" && <p className={`settings-feedback ${state.status}`} role={state.status === "success" ? "status" : "alert"}>{state.status === "success" && <CheckCircle2 size={18} />} {state.message}</p>}</div><button type="submit" disabled={pending} className="settings-submit">{pending ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />} {pending ? (pt ? "Salvando…" : "Saving…") : (pt ? "Salvar preferências" : "Save preferences")}</button></div>
  </form>;
}
