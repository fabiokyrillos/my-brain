"use client";

import { Check, ChevronRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type FormEvent, type ReactNode } from "react";
import {
  MODEL_PROFILES,
  TEXT_MODEL_IDS,
  TEXT_MODEL_LABELS,
  type AIRoutingProfile,
  type AIProfilePreset,
  type TextModelId,
} from "@/lib/ai/model-routing";
import { AI_ROUTE_CONTRACTS, routeModelsForProfile } from "@/features/ai-config/contracts";
import { getAiConfigCopy } from "@/features/ai-config/copy";
import { getSettingsCopy } from "@/features/settings/copy";
import type { Locale } from "@/lib/preferences";
import { LanguageRow } from "./language-row";
import { getReviewPreferencesCopy } from "./review-preferences-copy";
import type { SettingsFormValues } from "./settings-contracts";
import type { ProfileFormSection } from "./settings-sections";
import { getTimeZoneOptions } from "./timezones";

/**
 * `2P-SETTINGS-007`: *a failed save preserves input and names the affected
 * section.*
 *
 * The input half was already true and is documented at length below — this
 * returns a state rather than redirecting or revalidating, so React keeps what
 * was typed. The **section** half is new: with one form per section, a message
 * that only said *"could not save"* would leave a reader who had switched
 * sections since submitting with no idea which one failed.
 *
 * It is optional because `idleState` has no section and neither does a success
 * that arrived before this field existed.
 */
export type ProfileFormState = {
  status: "idle" | "success" | "error";
  message: string;
  section?: ProfileFormSection;
};
export type ProfileFormAction = (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;

const idleState: ProfileFormState = { status: "idle", message: "" };
type TextRouteKey = "chatModel" | "extractionModel" | "reviewModel" | "fileModel";
type VisibleAIRoutes = Record<TextRouteKey, TextModelId>;

/**
 * Life Brain E.1 (ADR-169): one titled card of rows, replacing 2P.5's numbered
 * section headings ("01 Fuso horário"). The title stays an `<h2>`, so the
 * page's outline (h1 → h2 → h3) is the one the layout documents.
 */
function Group({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="settings-group">
    <h2 className="settings-group-title" id={id}>{title}</h2>
    {note ? <p className="settings-group-note">{note}</p> : null}
    <div className="settings-card">{children}</div>
  </section>;
}

/**
 * A row: the label and its hint on the left, the control on the right. The hint
 * sits outside the label and is linked by `aria-describedby` — the pattern the
 * timezone and assistant-name fields were corrected to — so it is announced as
 * a description and never joins the control's name.
 */
function Row({ htmlFor, label, hint, hintId, children }: { htmlFor: string; label: string; hint?: string; hintId?: string; children: ReactNode }) {
  return <div className="settings-row">
    <span className="settings-row-copy"><label htmlFor={htmlFor}>{label}</label>{hint ? <small id={hintId}>{hint}</small> : null}</span>
    <span className="settings-row-control">{children}</span>
  </div>;
}

/*
 * `modelPrice` was here, and `2O-COST-005` is why it is not.
 *
 * It held a hardcoded tariff per model — `$2.50 in · $15 out / 1M` and two more
 * — rendered inside every `<option>` of every model select. Three problems, and
 * the third is the one that makes it a defect rather than a preference:
 *
 * 1. It **states a price before the call**, which is what `R-2O-18` refuses:
 *    prices are provider facts recorded at call time.
 * 2. It is a **second copy** of `ai_model_pricing`, carrying neither
 *    `pricing_version` nor `source_url`, so it could not be audited and could
 *    not be told apart from the real one by a reader.
 * 3. It could **silently disagree with what is actually charged**. The applied
 *    price is snapshotted into `ai_usage_events` on every call; this literal was
 *    updated by hand or not at all. This repository has paid for a hand-kept
 *    copy of a vocabulary before — `product_events`' writer list froze and
 *    refused newer events for weeks, and nobody noticed.
 *
 * The catalogue is **not** removed from the product: `/app/costs` renders it
 * from `ai_model_pricing` with its version and its source URL, and the routing
 * block already links there. So this deletes a claim the form could not back and
 * keeps the one the product can.
 */

function ModelSelect({
  id,
  name,
  label,
  description,
  value,
  onChange,
}: {
  id: string;
  name: TextRouteKey;
  label: string;
  description: string;
  value: TextModelId;
  // `pt` left with `modelPrice`: the only locale-dependent text in this control
  // was the tariff's "in"/"out", and the option is now just the model's name.
  onChange: (route: TextRouteKey, model: TextModelId) => void;
}) {
  /**
   * The row is a `<div>` with a `<label>` inside it, not a `<label>` wrapping
   * everything.
   *
   * Wrapping put the route's description inside the control's accessible name;
   * the `aria-label` here hid that, at the cost of the description never being
   * announced at all. Split, the label names the select and `aria-describedby`
   * carries the description — the same correction the assistant-name and
   * timezone fields take, for the same reason.
   */
  return <div className="ai-route settings-row">
    <span className="ai-route-copy settings-row-copy">
      <label htmlFor={id}>{label}</label>
      <small id={`${id}-description`}>{description}</small>
    </span>
    <span className="ai-route-control settings-row-control">
      <select aria-describedby={`${id}-description`} id={id} name={name} value={value} onChange={(event) => onChange(name, event.target.value as TextModelId)}>
        {TEXT_MODEL_IDS.map((model) => <option key={model} value={model}>{TEXT_MODEL_LABELS[model]}</option>)}
      </select>
    </span>
  </div>;
}

/**
 * `2O-PREF-011`: *"a save that fails … keeps the user's input."*
 *
 * (Life Brain E.1: the form now submits through a transition from `onSubmit`,
 * which React does not reset; the snapshot and restore below stay, as the
 * guarantee no longer depends on how React treats a form action.)
 *
 * ## The defect, which a test found rather than a review
 *
 * React resets an uncontrolled form after a form action returns, and it cannot
 * tell a failed save from a successful one — the action function returned
 * normally either way; the failure is in its *value*. So a save that failed for
 * any reason (offline, an expired session, a database error) wiped every field
 * back to the values the server had sent, and the reader who had just retyped
 * four of them was told to *try again* with their work already gone.
 *
 * `aiProfile` and the model routes never had this problem, because they are React
 * state. Everything else in this form is uncontrolled.
 *
 * ## What is done instead, and why not the alternatives
 *
 * The submission is snapshotted on its way out and written back if the outcome
 * is an error. *Make every field controlled* — declined: it is a much larger
 * change to a form that is otherwise correct, and it would put a dozen more
 * `useState` calls in a component whose job is rendering. *Return the submitted
 * values from the Server Action and re-seed `defaultValue`* — declined: a
 * `defaultValue` change does not reach a mounted uncontrolled input, so it needs
 * a `key` remount as well, and it would send the reader's draft on a round trip
 * to the server to be handed straight back.
 *
 * It restores in a **layout** effect, so the write lands before the browser
 * paints and no reader sees their input blink back to the old values on the way
 * to being restored.
 */
type FormDraft = Readonly<Record<string, string | boolean>>;

function snapshotForm(formData: FormData): FormDraft {
  const draft: Record<string, string | boolean> = {};
  for (const [key, value] of formData.entries()) {
    // Framework metadata, not the reader's input.
    if (key.startsWith("$ACTION_") || typeof value !== "string") continue;
    draft[key] = value;
  }
  return draft;
}

function restoreForm(form: HTMLFormElement, draft: FormDraft) {
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) continue;
    if (!element.name || element.type === "hidden") continue;
    if (element.type === "checkbox" && element instanceof HTMLInputElement) {
      // An unticked checkbox submits nothing, so absence is the value.
      element.checked = element.name in draft;
      continue;
    }
    // Radios are React-controlled here (`aiProfile`), so they are left alone —
    // writing `checked` on them would fight the state that already survived.
    if (element.type === "radio") continue;
    const stored = draft[element.name];
    if (typeof stored === "string") element.value = stored;
  }
}


/**
 * One group's persisted preferences, as one form.
 *
 * ## Why the same component renders four different forms
 *
 * `2P-SETTINGS-001` splits these seventeen columns across four profile forms
 * (`general`, `assistant`, `planning`, `ai`). One component with a `section`
 * prop keeps the draft snapshot, the restore-on-failure effect, the receipt and
 * the `useActionState` wiring defined exactly once.
 *
 * ## What the `section` field in the payload does
 *
 * It tells `updateProfile` **which columns this submission owns**. Everything
 * else is read from the stored row rather than from the page, which is what
 * makes `2P-SETTINGS-004` structural: a form cannot blank another's values
 * because it never names them, and a stale tab cannot overwrite a newer save.
 *
 * ## Save on change, with undo (Life Brain E.1, ADR-169)
 *
 * There is no "Salvar preferências" button any more. A select, a checkbox or a
 * radio saves when it changes; a text, time or number field saves when it loses
 * focus with a different value. (Enter submits natively only in a form with a
 * single text field — the assistant name — since there is no submit button.)
 * Every save goes through the same action, so validation, the owned-columns
 * rule and the error path are unchanged.
 *
 * A successful save shows "Salvo · Desfazer". Undo writes back the values the
 * form held before that save and submits them through the same action — an
 * ordinary save of the previous values, not a second mechanism — and its
 * receipt says "Desfeito" with no further undo.
 *
 * The submit is requested from an effect after a render (`submitTick`), never
 * from inside the change handler: choosing a profile changes four controlled
 * selects through state, and the form must be read after React has committed
 * them, or the save would carry the routes from before the choice.
 */
export function SettingsForm({
  action,
  initialState = idleState,
  locale,
  section,
  values,
}: {
  action: ProfileFormAction;
  initialState?: ProfileFormState;
  locale: Locale;
  /** Which columns this form owns. Submitted, and enforced by the action. */
  section: ProfileFormSection;
  values: SettingsFormValues;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef<FormDraft | null>(null);
  /** What the database holds, as far as this form knows. */
  const savedRef = useRef<FormDraft | null>(null);
  const undoingRef = useRef(false);
  const [submitTick, setSubmitTick] = useState(0);
  /** The last submission: whether it was an undo, and what the form held before it. */
  const [submission, setSubmission] = useState<{ undo: boolean; previous: FormDraft | null }>({ undo: false, previous: null });
  /** The outcome whose receipt was dismissed, by the timer or by pressing undo. */
  const [dismissed, setDismissed] = useState<ProfileFormState | null>(null);
  const pt = locale === "pt-BR";
  const settingsCopy = getSettingsCopy(locale);

  /*
    Submitted through a transition from `onSubmit`, not through the form's
    `action` prop. React resets an uncontrolled form after a form action
    finishes; with save on change, that reset would wipe a field the reader is
    still typing in while another field's save completes. `requestSubmit()`
    still runs the browser's own validation first (the name's `required`).
  */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    draftRef.current = snapshotForm(formData);
    setSubmission({ undo: undoingRef.current, previous: savedRef.current });
    undoingRef.current = false;
    startTransition(() => formAction(formData));
  }

  useEffect(() => {
    const form = formRef.current;
    if (form) savedRef.current = snapshotForm(new FormData(form));
  }, []);

  useEffect(() => {
    if (submitTick > 0) formRef.current?.requestSubmit();
  }, [submitTick]);

  useLayoutEffect(() => {
    if (state.status === "error") {
      const form = formRef.current;
      const draft = draftRef.current;
      if (form && draft) restoreForm(form, draft);
      return;
    }
    if (state.status === "success" && draftRef.current) savedRef.current = draftRef.current;
  }, [state]);

  // The receipt is derived from the outcome, not stored beside it, so it can
  // never describe a save other than the one that just finished.
  const receipt: "saved" | "undone" | null =
    state.status === "success" && state !== dismissed ? (submission.undo ? "undone" : "saved") : null;
  const canUndo = receipt === "saved" && submission.previous !== null;

  useEffect(() => {
    if (!receipt) return;
    const timer = window.setTimeout(() => setDismissed(state), 8000);
    return () => window.clearTimeout(timer);
  }, [receipt, state]);

  const zones = getTimeZoneOptions(locale, values.timezone);
  const reviews = getReviewPreferencesCopy(locale);
  // Shared with `AiConfigSection`, deliberately: the form and the statement
  // below it must call the same route by the same name.
  const aiConfig = getAiConfigCopy(locale);
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

  function saveSoon() {
    setSubmitTick((tick) => tick + 1);
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      saveSoon();
      return;
    }
    if (target instanceof HTMLInputElement && (target.type === "checkbox" || target.type === "radio")) saveSoon();
  }

  function onBlur(event: FocusEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.name) return;
    if (!["text", "time", "number"].includes(target.type)) return;
    if (savedRef.current?.[target.name] === target.value) return;
    saveSoon();
  }

  function undo() {
    const form = formRef.current;
    const previous = submission.previous;
    if (!form || !previous) return;
    restoreForm(form, previous);
    if (section === "ai") {
      const profile = previous.aiProfile;
      if (typeof profile === "string") setAIProfile(profile as AIRoutingProfile);
      setRoutes((current) => ({
        chatModel: (previous.chatModel as TextModelId | undefined) ?? current.chatModel,
        extractionModel: (previous.extractionModel as TextModelId | undefined) ?? current.extractionModel,
        reviewModel: (previous.reviewModel as TextModelId | undefined) ?? current.reviewModel,
        fileModel: (previous.fileModel as TextModelId | undefined) ?? current.fileModel,
      }));
    }
    undoingRef.current = true;
    setDismissed(state);
    saveSoon();
  }

  const profiles: Array<{ id: AIRoutingProfile; title: string; description: string }> = [
    {
      id: "quality",
      title: pt ? "Qualidade máxima" : "Maximum quality",
      description: pt ? "Recomendado. Terra no chat e nas revisões; Luna na captura e nos arquivos." : "Recommended. Terra for chat and reviews; Luna for capture and files.",
    },
    {
      id: "balanced",
      title: pt ? "Equilibrado" : "Balanced",
      description: pt ? "Luna no chat e nas revisões; Mini na captura e nos arquivos." : "Luna for chat and reviews; Mini for capture and files.",
    },
    {
      id: "economy",
      title: pt ? "Econômico" : "Economy",
      description: pt ? "GPT-5 mini em todas as funções que você pode escolher." : "GPT-5 mini for every function you can choose.",
    },
    {
      id: "custom",
      title: pt ? "Personalizado" : "Custom",
      description: pt ? "Você escolhe o modelo de cada função abaixo." : "You choose each function's model below.",
    },
  ];
  const activeProfile = profiles.find((profile) => profile.id === aiProfile);
  const failureVisible = state.status === "error" && (state.section === undefined || state.section === section);

  return <form className="settings-form" data-settings-form={section} onBlur={onBlur} onChange={onChange} onSubmit={handleSubmit} ref={formRef}>
    <input type="hidden" name="locale" value={locale} />
    {/* The section this submission owns; see `settings-sections.ts`. */}
    <input type="hidden" name="section" value={section} />

    {section === "general" ? <Group id="settings-group-where" title={settingsCopy.groups.whereWhen}>
      <Row htmlFor="timezone" label={pt ? "Fuso horário" : "Time zone"} hint={pt ? "Define o que “hoje” e “amanhã” significam, inclusive quando você escreve “amanhã”." : "Decides what today and tomorrow mean, including when you write “tomorrow”."} hintId="timezone-hint">
        <select id="timezone" name="timezone" aria-describedby="timezone-hint" defaultValue={values.timezone}>{zones.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </Row>
      <LanguageRow locale={locale} />
    </Group> : null}

    {section === "assistant" ? <Group id="settings-group-assistant" title={settingsCopy.groups.assistant}>
      {/*
        UX-06's field. `maxLength` mirrors the column's own 1–60 check, and the
        input is `required` because the column is `not null`.
      */}
      <Row htmlFor="agent-name" label={pt ? "Nome do assistente" : "Assistant name"} hint={pt ? "Como ele se chama nas telas e nas respostas. O produto continua sendo My Brain." : "What it is called on screen and in its answers. The product is still My Brain."} hintId="agent-name-hint">
        <input id="agent-name" name="agentName" type="text" required minLength={1} maxLength={60} autoComplete="off" aria-describedby="agent-name-hint" defaultValue={values.agentName} />
      </Row>
      <Row htmlFor="personality" label={pt ? "Personalidade" : "Personality"} hint={pt ? "Como ele se comporta no chat e nas revisões." : "How it behaves in chat and reviews."} hintId="personality-hint">
        <select id="personality" name="personality" aria-describedby="personality-hint" defaultValue={values.personality}><option value="proactive">{pt ? "Proativa" : "Proactive"}</option><option value="direct">{pt ? "Direta" : "Direct"}</option><option value="warm">{pt ? "Acolhedora" : "Warm"}</option><option value="analytical">{pt ? "Analítica" : "Analytical"}</option></select>
      </Row>
      <Row htmlFor="tone" label={pt ? "Tom" : "Tone"}>
        <select id="tone" name="tone" defaultValue={values.tone}><option value="direct">{pt ? "Direto" : "Direct"}</option><option value="informal">Informal</option><option value="natural">Natural</option><option value="professional">{pt ? "Profissional" : "Professional"}</option></select>
      </Row>
      <Row htmlFor="response-detail" label={pt ? "Detalhe das respostas" : "Response detail"}>
        <select id="response-detail" name="responseDetail" defaultValue={values.responseDetail}><option value="short">{pt ? "Curto" : "Short"}</option><option value="balanced">{pt ? "Equilibrado" : "Balanced"}</option><option value="detailed">{pt ? "Detalhado" : "Detailed"}</option></select>
      </Row>
    </Group> : null}

    {section === "planning" ? <>
    <Group id="settings-group-quiet" title={settingsCopy.groups.quiet} note={pt ? "Limites que valem para lembretes e acompanhamentos." : "Limits for reminders and follow-ups."}>
      <Row htmlFor="quiet-start" label={pt ? "Período silencioso começa" : "Quiet period starts"}>
        <input id="quiet-start" name="quietStart" type="time" defaultValue={values.quietStart} />
      </Row>
      <Row htmlFor="quiet-end" label={pt ? "Período silencioso termina" : "Quiet period ends"}>
        <input id="quiet-end" name="quietEnd" type="time" defaultValue={values.quietEnd} />
      </Row>
      <Row htmlFor="max-followups" label={pt ? "Máximo de acompanhamentos por dia" : "Maximum follow-ups per day"}>
        <input id="max-followups" name="maxFollowupsPerDay" type="number" min="0" max="20" defaultValue={values.maxFollowupsPerDay} />
      </Row>
      <Row htmlFor="important-override" label={pt ? "Permitir lembretes importantes durante o silêncio" : "Allow important reminders during quiet hours"}>
        <input className="settings-switch" id="important-override" name="importantReminderOverride" role="switch" type="checkbox" defaultChecked={values.importantReminderOverride} />
      </Row>
    </Group>

    {/*
      `2O-PREF-004` and `2O-PREF-005`. The note repeats `/app/reviews`'s promise
      — nothing runs from a configured schedule — because this is the one place
      a reader could conclude the opposite. `planning_day` and `planning_time`
      stay absent (`2O-PREF-007`).
    */}
    <Group id="settings-group-reviews" title={reviews.sectionTitle} note={reviews.sectionDescription}>
      <Row htmlFor="daily-review-time" label={reviews.dailyLabel} hint={reviews.dailyHint} hintId="daily-review-hint">
        <input id="daily-review-time" name="dailyReviewTime" type="time" aria-describedby="daily-review-hint" defaultValue={values.dailyReviewTime} />
      </Row>
      <Row htmlFor="weekly-review-day" label={reviews.weeklyDayLabel}>
        <select id="weekly-review-day" name="weeklyReviewDay" defaultValue={String(values.weeklyReviewDay)}>{reviews.weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select>
      </Row>
      <Row htmlFor="weekly-review-time" label={reviews.weeklyTimeLabel} hint={reviews.weeklyHint} hintId="weekly-review-hint">
        <input id="weekly-review-time" name="weeklyReviewTime" type="time" aria-describedby="weekly-review-hint" defaultValue={values.weeklyReviewTime} />
      </Row>
    </Group>
    </> : null}

    {section === "ai" ? <>
    <section aria-labelledby="settings-group-profile" className="settings-group">
      <h2 className="settings-group-title" id="settings-group-profile">{settingsCopy.groups.profile}</h2>
      <div className="settings-card">
        <fieldset className="ai-profile-fieldset settings-row settings-row-stack">
          <legend className="settings-row-legend">{pt ? "Perfil de custo e qualidade" : "Cost and quality profile"}</legend>
          <div className="settings-segmented">{profiles.map((profile) => <label key={profile.id} className={`settings-segment${aiProfile === profile.id ? " active" : ""}`}><input type="radio" name="aiProfile" value={profile.id} checked={aiProfile === profile.id} onChange={() => chooseProfile(profile.id)} /><span>{profile.title}</span></label>)}</div>
          {activeProfile ? <small className="settings-row-hint">{activeProfile.description}</small> : null}
        </fieldset>
        <Link className="settings-row settings-row-link" href={`/${locale}/app/costs`}>
          <span className="settings-row-copy"><strong>{pt ? "Custos de IA" : "AI costs"}</strong><small>{pt ? "Quanto cada função gastou, com o preço de cada chamada." : "What each function spent, with each call's price."}</small></span>
          <ChevronRight aria-hidden="true" size={16} />
        </Link>
      </div>
    </section>

    <section aria-labelledby="settings-group-models" className="settings-group">
      <h2 className="settings-group-title" id="settings-group-models">{settingsCopy.groups.models}</h2>
      <div className="settings-card ai-routes">
        <ModelSelect id="chat-model" name="chatModel" label={pt ? "Chat principal" : "Main chat"} description={pt ? "Respostas, contexto e conversa do dia a dia." : "Answers, context, and daily conversation."} value={routes.chatModel} onChange={changeRoute} />
        <ModelSelect id="extraction-model" name="extractionModel" label={pt ? "Captura e organização" : "Capture and organization"} description={pt ? "Lê o que você escreveu e propõe tarefas, pessoas e datas." : "Reads what you wrote and proposes tasks, people, and dates."} value={routes.extractionModel} onChange={changeRoute} />
        <ModelSelect id="review-model" name="reviewModel" label={pt ? "Revisões e resumos" : "Reviews and summaries"} description={pt ? "Revisões que você pede a partir dos seus registros." : "Reviews you ask for from your records."} value={routes.reviewModel} onChange={changeRoute} />
        <ModelSelect id="file-model" name="fileModel" label={pt ? "Análise de arquivos" : "File analysis"} description={pt ? "Imagens, PDFs, documentos e planilhas." : "Images, PDFs, documents, and spreadsheets."} value={routes.fileModel} onChange={changeRoute} />
      </div>
      {/*
        `2O-COST-004` and `2O-AICONFIG-005`: the routes the chosen profile also
        writes and the form has no control for, derived from
        `AI_ROUTE_CONTRACTS` so the model shown is the one the preset will save.
        Behind a disclosure since Life Brain E.1; still inside the form, because
        it follows the profile chosen above before anything is saved.
      */}
      <details className="settings-how ai-routes-fixed">
        <summary>{pt ? "Outras funções que o perfil escolhe" : "Other functions the profile sets"}</summary>
        <p className="ai-routes-fixed-intro">{aiConfig.profileIntro}</p>
        {AI_ROUTE_CONTRACTS.filter((route) => route.disposition !== "controlled").map((route) => {
          const preset = aiProfile === "custom" ? null : routeModelsForProfile(aiProfile);
          const model = preset?.[route.column] ?? route.fallbackModel;
          return <div key={route.column} className="ai-route ai-route-fixed"><span className="ai-route-copy"><strong>{aiConfig.routes[route.column].name}</strong><small>{aiConfig.dispositions[route.disposition]}</small></span>{model ? <span className="embedding-chip">{model}</span> : null}</div>;
        })}
      </details>
    </section>
    </> : null}

    {/*
      The outcome. A failure keeps `2P-SETTINGS-007`'s message, naming the group,
      and is only rendered on the form whose section failed. A success is the
      receipt with its undo.
    */}
    <div aria-live="polite" className="settings-feedback-region">
      {failureVisible ? <p className="settings-feedback error" role="alert">{state.message}</p> : null}
      {pending ? <p className="settings-receipt" data-state="saving"><LoaderCircle aria-hidden="true" className="spin" size={16} />{settingsCopy.saving}</p> : null}
      {!pending && receipt ? <p className="settings-receipt" data-state={receipt} role="status">
        <Check aria-hidden="true" size={16} />
        <span>{receipt === "undone" ? settingsCopy.undone : state.message || settingsCopy.saved}</span>
        {receipt === "saved" && canUndo ? <button className="settings-receipt-undo" onClick={undo} type="button">{settingsCopy.undo}</button> : null}
      </p> : null}
    </div>
  </form>;
}
