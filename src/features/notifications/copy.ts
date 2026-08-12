/**
 * The notification governance surface's words, typed, in the canonical feature
 * `copy.ts` shape.
 *
 * `2M-NOTIFY-010` requires the five states to have **defined copy**, not just
 * defined behaviour, and this is where that definition lives. Each sentence says
 * what is true and what the user can do about it — including the two cases where
 * the answer is "nothing, from here", which is a worse answer to hide than to
 * give.
 */

import type { NotificationConsentState } from "./consent-contract";

export type NotificationLocale = "pt-BR" | "en";

export type NotificationSettingsCopy = {
  readonly heading: string;
  /** `2M-NOTIFY-003`: the benefit, explained **before** any prompt exists. */
  readonly benefit: string;
  /** What the payload will and will not carry, said plainly rather than implied. */
  readonly contentPromise: string;
  readonly stateHeading: string;
  readonly states: Readonly<Record<NotificationConsentState, string>>;
  /** Where content still lives, which is the in-app list on this same page. */
  readonly inAppNote: string;
  /**
   * The honest statement for the case where the controls genuinely cannot work.
   *
   * Slice 2M.4a used this for "no persistence yet". Slice 2M.4b keeps it for
   * the two cases that remain real: a browser with no Push API, and a
   * deployment whose VAPID public key is not configured. `R-24` is why it still
   * exists — a control that cannot do anything is not rendered, and the reason
   * is said out loud instead.
   */
  readonly notAvailableYet: string;
  readonly noPromptYet: string;

  /* Slice 2M.4b — the controls `2M-NOTIFY-004` asks for, each with a consumer. */
  readonly enableAction: string;
  readonly enablePending: string;
  readonly disableAction: string;
  readonly typesHeading: string;
  readonly types: Readonly<Record<"reminder" | "follow_up" | "review" | "digest", string>>;
  readonly frequencyHeading: string;
  readonly frequencies: Readonly<Record<"immediate" | "daily_digest" | "off", string>>;
  readonly quietHeading: string;
  readonly quietStartLabel: string;
  readonly quietEndLabel: string;
  readonly quietNote: string;
  readonly dailyCapLabel: string;
  readonly dailyCapNote: string;
  readonly savePreferences: string;
  readonly saved: string;
  readonly saveFailed: string;
  readonly permissionRefused: string;
};

const PT_BR: NotificationSettingsCopy = {
  heading: "Notificações no aparelho",
  benefit: "Se você quiser, o Brain pode avisar no aparelho quando houver um lembrete, algo para acompanhar ou uma revisão pronta — sem que você precise abrir o app para descobrir.",
  contentPromise: "O aviso nunca carrega o conteúdo: nada de título de tarefa, descrição, nome de pessoa, projeto ou texto do seu registro. Ele diz que há algo esperando, e o que é fica aqui dentro, atrás do seu login.",
  stateHeading: "Situação atual",
  states: {
    granted: "Você autorizou os avisos neste aparelho. Pode retirar a autorização quando quiser.",
    denied: "Este navegador está bloqueando os avisos. Só dá para mudar isso nas permissões do próprio navegador — o app não consegue perguntar de novo.",
    unsupported: "Este navegador ou este aparelho não oferece avisos. No iPhone, é preciso instalar o app na tela de início primeiro.",
    revoked: "Você retirou a autorização. Pode autorizar de novo quando quiser.",
    expired: "A inscrição deste aparelho expirou. Não foi você que desligou — dá para renovar.",
  },
  inAppNote: "As notificações com conteúdo continuam nesta página, atrás do seu login.",
  notAvailableYet: "Este navegador não oferece avisos, ou o envio ainda não está configurado neste ambiente. Por isso os controles não aparecem — em vez de aparecerem sem fazer nada.",
  noPromptYet: "Nada será perguntado ao navegador até que você peça, nesta página.",
  enableAction: "Ativar avisos neste aparelho",
  enablePending: "Ativando…",
  disableAction: "Desativar avisos neste aparelho",
  typesHeading: "O que pode avisar",
  types: {
    reminder: "Lembretes",
    follow_up: "Coisas para acompanhar",
    review: "Revisões prontas",
    digest: "Resumos",
  },
  frequencyHeading: "Com que frequência",
  frequencies: {
    immediate: "Assim que acontecer",
    daily_digest: "Uma vez por dia",
    off: "Não avisar",
  },
  quietHeading: "Período silencioso",
  quietStartLabel: "Começa às",
  quietEndLabel: "Termina às",
  quietNote: "Durante esse período nada é enviado. O mesmo período vale para os avisos dentro do app.",
  dailyCapLabel: "Máximo de avisos por dia",
  dailyCapNote: "Vale para o aparelho e para o app, contados separadamente em cada um.",
  savePreferences: "Salvar preferências",
  saved: "Preferências salvas.",
  saveFailed: "Não foi possível salvar. Nada foi alterado.",
  permissionRefused: "O navegador não autorizou. Nada foi ativado.",
};

const EN: NotificationSettingsCopy = {
  heading: "Notifications on this device",
  benefit: "If you want it, Brain can tell you on your device when there is a reminder, something to follow up, or a review ready — without you having to open the app to find out.",
  contentPromise: "The alert never carries the content: no task title, no description, no person, no project, no text from your records. It says something is waiting, and what it is stays in here, behind your login.",
  stateHeading: "Current state",
  states: {
    granted: "You allowed alerts on this device. You can withdraw that whenever you want.",
    denied: "This browser is blocking alerts. That can only be changed in the browser's own permissions — the app cannot ask again.",
    unsupported: "This browser or device does not offer alerts. On iPhone, the app has to be installed to the home screen first.",
    revoked: "You withdrew permission. You can allow it again whenever you want.",
    expired: "This device's subscription expired. You did not turn it off — it can be renewed.",
  },
  inAppNote: "Notifications with content stay on this page, behind your login.",
  notAvailableYet: "This browser does not offer alerts, or delivery is not configured in this environment. That is why the controls are absent — rather than present and doing nothing.",
  noPromptYet: "Nothing will be asked of the browser until you ask for it, on this page.",
  enableAction: "Turn on alerts on this device",
  enablePending: "Turning on…",
  disableAction: "Turn off alerts on this device",
  typesHeading: "What may alert you",
  types: {
    reminder: "Reminders",
    follow_up: "Things to follow up",
    review: "Reviews that are ready",
    digest: "Summaries",
  },
  frequencyHeading: "How often",
  frequencies: {
    immediate: "As soon as it happens",
    daily_digest: "Once a day",
    off: "Do not alert",
  },
  quietHeading: "Quiet period",
  quietStartLabel: "Starts at",
  quietEndLabel: "Ends at",
  quietNote: "Nothing is sent during this period. The same period applies to in-app alerts.",
  dailyCapLabel: "Most alerts per day",
  dailyCapNote: "Applies to this device and to the app, counted separately on each.",
  savePreferences: "Save preferences",
  saved: "Preferences saved.",
  saveFailed: "Could not save. Nothing was changed.",
  permissionRefused: "The browser did not allow it. Nothing was turned on.",
};

export function getNotificationSettingsCopy(locale: string): NotificationSettingsCopy {
  return locale === "en" ? EN : PT_BR;
}
