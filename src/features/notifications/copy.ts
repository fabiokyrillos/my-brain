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
import type { ConsentFact, DeliveryFact, PermissionFact } from "./three-facts";

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

  /* ---- Slice 2O.6 ------------------------------------------------------- */

  /** `2O-NOTIFY-007` — the three facts, each with its own row and its own word. */
  readonly factsHeading: string;
  readonly factsIntro: string;
  readonly consentFactLabel: string;
  readonly permissionFactLabel: string;
  readonly deliveryFactLabel: string;
  readonly consentFactValues: Readonly<Record<ConsentFact, string>>;
  readonly permissionFactValues: Readonly<Record<PermissionFact, string>>;
  readonly deliveryFactValues: Readonly<Record<DeliveryFact, string>>;
  /** `2O-NOTIFY-006` — the operational truth, where it matters. */
  readonly deliveryCaveat: string;
  /** `2O-NOTIFY-004` — what a refused browser can actually do about it. */
  readonly deniedRecovery: string;
  /** `2O-NOTIFY-003` — how to stop, said at the ask rather than after it. */
  readonly howToStop: string;

  /** `2O-NOTIFY-005` — the bounds, stated where consent is given. */
  readonly boundsHeading: string;
  readonly boundsQuietHours: string;
  readonly boundsDailyCap: string;
  /**
   * `2O-NOTIFY-005` names an **important-reminder override** as the third
   * bound. There is none: `decideDelivery` refuses inside quiet hours with no
   * exemption for priority, type or urgency, and the words "important",
   * "priority" and "urgent" appear nowhere in the governance. So this states
   * the absence. Writing the requirement's sentence as though the override
   * existed would claim a capability the product does not have — which is the
   * single thing this phase forbids most consistently.
   */
  readonly boundsNoOverride: string;

  /**
   * The name of the in-app feed's own section.
   *
   * Added by the polish pass between slices 2O.6 and 2O.7, and it is the only
   * new sentence that pass introduces. The page carried **two** page-level
   * headings — the governance section's `<h2>` and the list's `<h1>` — with the
   * `<h1>` arriving in the middle of the page, so the document opened at level
   * two and "Notificações" appeared twice. The `<h1>` moved to the top where a
   * page title belongs, which left the list below with no name at all; this is
   * that name. It is a label for something that already shipped, not a new
   * capability, and it goes through the typed copy record rather than through a
   * locale ternary because that is the mechanism this repository has settled on.
   */
  readonly historyHeading: string;

  /** `2O-NOTIFY-002` — the invitation at a moment of demonstrated value. */
  readonly inviteHeading: string;
  readonly inviteBody: string;
  readonly inviteAction: string;
  readonly inviteDismiss: string;

  /* ---- Slice 2P.5 -------------------------------------------------------- */

  /**
   * `2P-SETTINGS-008`. The page becomes the history surface, so the states it
   * had been rendering as a CSS class alone now have words.
   *
   * `read`/`unread` was `className={\`list-row notification-row ${item.status}\`}`
   * and nothing else — a colour, invisible to a screen reader and to anyone who
   * cannot distinguish the two tints. The rows carry the word now, and the
   * unread count is announced above the list so the state is perceivable before
   * a reader has scanned twenty rows for it.
   */
  readonly unreadBadge: string;
  readonly readBadge: string;
  readonly unreadSummary: (count: number) => string;
  readonly allReadSummary: string;
  readonly markRead: string;
  readonly openDestination: string;
  /**
   * The **one** discreet contextual entry back to the preferences that
   * `2P-SETTINGS-008` allows. Its href is the Settings notifications section.
   */
  readonly preferencesLink: string;
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

  factsHeading: "Três coisas diferentes",
  factsIntro: "Estas três não são a mesma coisa, e uma pode estar certa enquanto as outras não estão. Por isso aparecem separadas.",
  consentFactLabel: "Você pediu",
  permissionFactLabel: "O navegador permite",
  deliveryFactLabel: "O aviso chega",
  consentFactValues: {
    given: "Sim — você ativou os avisos nesta conta.",
    withdrawn: "Não — você desativou. Nada é enviado até você pedir de novo.",
    lapsed: "A inscrição deste aparelho venceu. Sua intenção continua valendo; o registro é que precisa ser refeito.",
    never_given: "Ainda não. Nada foi ativado.",
  },
  permissionFactValues: {
    granted: "Sim — este navegador autorizou.",
    denied: "Não. Este navegador recusou, e ele não pergunta de novo a partir da página.",
    never_asked: "Ainda não perguntamos. Nada é perguntado sem você pedir.",
    unavailable: "Este navegador não oferece avisos, ou este ambiente ainda não está configurado para enviá-los.",
    unknown: "Não sabemos. A permissão fica no aparelho e pode mudar nas configurações do navegador sem avisar o produto — dizer “permitido” aqui seria chute.",
  },
  deliveryFactValues: {
    unproven: "Não comprovado. O envio está implementado e publicado, mas nenhuma entrega foi confirmada em aparelho real.",
  },
  deliveryCaveat: "Sendo específico, porque isto muda o que você deve esperar: no iPhone o envio falha com HTTP 403, e no Android ele nunca foi executado. Enquanto isso não for resolvido, trate o aviso no aparelho como um extra e não como o caminho pelo qual você fica sabendo das coisas. A lista aqui dentro continua sendo o caminho confiável.",
  deniedRecovery: "Para reverter, é preciso mudar nas configurações do navegador — o cadeado ou o ícone ao lado do endereço, permissões do site, notificações. A página não consegue perguntar de novo, então o botão fica desativado em vez de fingir que funciona.",
  howToStop: "Para parar: o botão de desativar nesta mesma página, a qualquer momento, sem passo adicional. Desativar aqui encerra a inscrição no navegador e o registro na conta.",

  boundsHeading: "O que limita esses avisos",
  boundsQuietHours: "Período silencioso: nada é enviado dentro da janela que você define. O mesmo período vale para os avisos dentro do app.",
  boundsDailyCap: "Máximo por dia: ao atingir o número que você definir, o resto do dia é recusado. Aparelho e app são contados separadamente.",
  boundsNoOverride: "Não existe exceção. Nenhum aviso — de nenhum tipo, com nenhuma urgência — passa por cima do período silencioso ou do máximo diário. Se algo importante for recusado, ele continua esperando aqui dentro em vez de tocar o aparelho.",

  historyHeading: "Avisos recebidos",

  inviteHeading: "Quer ser avisado quando chegar a hora?",
  inviteBody: "Você acabou de agendar algo. Se quiser, o Brain pode avisar no aparelho quando chegar a hora — sem carregar o conteúdo no aviso.",
  inviteAction: "Ver como funciona",
  inviteDismiss: "Agora não",
  unreadBadge: "Não lida",
  readBadge: "Lida",
  unreadSummary: (count) => (count === 1 ? "1 aviso não lido." : `${count} avisos não lidos.`),
  allReadSummary: "Nenhum aviso não lido.",
  markRead: "Marcar como lida",
  openDestination: "Abrir",
  preferencesLink: "Ajustar preferências de notificação",
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

  factsHeading: "Three different things",
  factsIntro: "These three are not the same thing, and one can be true while the others are not. That is why they are shown separately.",
  consentFactLabel: "You asked for it",
  permissionFactLabel: "The browser allows it",
  deliveryFactLabel: "The alert arrives",
  consentFactValues: {
    given: "Yes — you turned alerts on for this account.",
    withdrawn: "No — you turned them off. Nothing is sent until you ask again.",
    lapsed: "This device's subscription expired. Your intent still stands; it is the record that needs renewing.",
    never_given: "Not yet. Nothing was turned on.",
  },
  permissionFactValues: {
    granted: "Yes — this browser allowed it.",
    denied: "No. This browser refused, and it will not ask again from the page.",
    never_asked: "We have not asked. Nothing is asked without you asking first.",
    unavailable: "This browser does not offer alerts, or this environment is not configured to send them yet.",
    unknown: "We do not know. Permission lives on the device and can change in browser settings without telling the product — saying “allowed” here would be a guess.",
  },
  deliveryFactValues: {
    unproven: "Unproven. Sending is implemented and deployed, but no delivery has been confirmed on real hardware.",
  },
  deliveryCaveat: "Being specific, because it changes what you should expect: on iPhone sending fails with HTTP 403, and on Android it has never been run. Until that is resolved, treat the device alert as a bonus rather than as how you find things out. The list in here stays the reliable path.",
  deniedRecovery: "To undo it you have to change the browser's own settings — the padlock or icon beside the address, site permissions, notifications. The page cannot ask again, so the button is disabled rather than pretending to work.",
  howToStop: "To stop: the turn-off button on this same page, at any time, with no further step. Turning it off here ends both the browser subscription and the record on the account.",

  boundsHeading: "What bounds these alerts",
  boundsQuietHours: "Quiet period: nothing is sent inside the window you set. The same period applies to in-app alerts.",
  boundsDailyCap: "Daily maximum: once you hit the number you set, the rest of the day is refused. Device and app are counted separately.",
  boundsNoOverride: "There is no exception. No alert — of any type, at any urgency — overrides the quiet period or the daily maximum. If something important is refused, it keeps waiting in here rather than sounding on your device.",

  historyHeading: "Alerts you received",

  inviteHeading: "Want to be told when the time comes?",
  inviteBody: "You have just scheduled something. If you want it, Brain can tell you on your device when the time comes — without carrying the content in the alert.",
  inviteAction: "See how it works",
  inviteDismiss: "Not now",
  unreadBadge: "Unread",
  readBadge: "Read",
  unreadSummary: (count) => (count === 1 ? "1 unread alert." : `${count} unread alerts.`),
  allReadSummary: "No unread alerts.",
  markRead: "Mark as read",
  openDestination: "Open",
  preferencesLink: "Adjust notification preferences",
};

export function getNotificationSettingsCopy(locale: string): NotificationSettingsCopy {
  return locale === "en" ? EN : PT_BR;
}
