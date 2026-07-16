"use client";

import { useActionState } from "react";
import { CheckCircle2, LoaderCircle, Save } from "lucide-react";
import type { Locale } from "@/lib/preferences";
import { getTimeZoneOptions } from "./timezones";

export type ProfileFormState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type ProfileFormAction = (
  state: ProfileFormState,
  formData: FormData,
) => Promise<ProfileFormState>;

type Values = {
  displayName: string;
  agentName: string;
  locale: Locale;
  timezone: string;
  followUpIntensity: "calm" | "balanced" | "insistent" | "custom";
  dailyReviewTime: string;
};

const idleState: ProfileFormState = { status: "idle", message: "" };

export function SettingsForm({
  action,
  initialState = idleState,
  locale,
  values,
}: {
  action: ProfileFormAction;
  initialState?: ProfileFormState;
  locale: Locale;
  values: Values;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const pt = locale === "pt-BR";
  const timeZones = getTimeZoneOptions(locale, values.timezone);

  return (
    <form action={formAction} className="settings-form">
      <div className="settings-section-heading">
        <span>01</span>
        <div>
          <h2>{pt ? "Identidade" : "Identity"}</h2>
          <p>{pt ? "Como você e o agente aparecem na conversa." : "How you and the agent appear in conversation."}</p>
        </div>
      </div>

      <div className="settings-fields">
        <label htmlFor="display-name">
          {pt ? "Seu nome" : "Your name"}
          <input id="display-name" name="displayName" required defaultValue={values.displayName} autoComplete="name" />
        </label>
        <label htmlFor="agent-name">
          {pt ? "Nome do agente" : "Agent name"}
          <input id="agent-name" name="agentName" required defaultValue={values.agentName} />
        </label>
      </div>

      <div className="settings-section-heading">
        <span>02</span>
        <div>
          <h2>{pt ? "Idioma e horário" : "Language and time"}</h2>
          <p>{pt ? "Datas, lembretes e resumos seguem estas escolhas." : "Dates, reminders, and reviews follow these choices."}</p>
        </div>
      </div>

      <div className="settings-fields">
        <label htmlFor="locale">
          {pt ? "Idioma" : "Language"}
          <select id="locale" name="locale" defaultValue={values.locale}>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
          </select>
        </label>
        <label htmlFor="timezone">
          {pt ? "Fuso horário" : "Time zone"}
          <select
            id="timezone"
            name="timezone"
            defaultValue={values.timezone}
            aria-label={pt ? "Fuso horário" : "Time zone"}
            aria-describedby="timezone-help"
          >
            {timeZones.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <small id="timezone-help">{pt ? "Usado para interpretar “amanhã”, prazos e períodos silenciosos." : "Used to interpret tomorrow, deadlines, and quiet periods."}</small>
        </label>
      </div>

      <div className="settings-section-heading">
        <span>03</span>
        <div>
          <h2>{pt ? "Ritmo do agente" : "Agent rhythm"}</h2>
          <p>{pt ? "Defina quanto o Brain acompanha sem se tornar invasivo." : "Set how closely Brain follows up without becoming intrusive."}</p>
        </div>
      </div>

      <div className="settings-fields">
        <label htmlFor="follow-up-intensity">
          {pt ? "Intensidade das cobranças" : "Follow-up intensity"}
          <select id="follow-up-intensity" name="followUpIntensity" defaultValue={values.followUpIntensity}>
            <option value="calm">{pt ? "Tranquila" : "Calm"}</option>
            <option value="balanced">{pt ? "Equilibrada" : "Balanced"}</option>
            <option value="insistent">{pt ? "Insistente" : "Insistent"}</option>
            <option value="custom">{pt ? "Personalizada" : "Custom"}</option>
          </select>
        </label>
        <label htmlFor="daily-review-time">
          {pt ? "Resumo diário" : "Daily review"}
          <input id="daily-review-time" name="dailyReviewTime" type="time" defaultValue={values.dailyReviewTime} />
        </label>
      </div>

      <div className="settings-save-bar">
        <div aria-live="polite">
          {state.status !== "idle" && (
            <p className={`settings-feedback ${state.status}`} role={state.status === "success" ? "status" : "alert"}>
              {state.status === "success" && <CheckCircle2 size={18} />}
              {state.message}
            </p>
          )}
        </div>
        <button type="submit" disabled={pending} className="settings-submit">
          {pending ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}
          {pending ? (pt ? "Salvando…" : "Saving…") : (pt ? "Salvar preferências" : "Save preferences")}
        </button>
      </div>
    </form>
  );
}
