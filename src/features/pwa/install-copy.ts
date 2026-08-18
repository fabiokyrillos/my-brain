import type { Locale } from "@/lib/preferences";

/**
 * `2O-MOBILE-004` — installing the product as an app, explained.
 *
 * ## What the product already ships, and what it therefore may claim
 *
 * `src/app/manifest.ts` declares `display: "standalone"` with a name, a
 * `start_url` and a 384px icon; `public/sw.js` is registered on every page by
 * `RegisterServiceWorker`. Installation works today and nothing here builds it.
 * What did not exist is anyone **saying so**: the only sentence in the product
 * that mentioned installing was a precondition inside the notifications page —
 * *"On iPhone, the app has to be installed to the home screen first"* — which
 * tells a reader that installation matters and not how to do it.
 *
 * ## Why the steps are per-browser and why there is no button
 *
 * There is no cross-browser way to install from a page. `beforeinstallprompt`
 * is Chromium-only and fires only when the browser has already decided the
 * install is offerable, so a button built on it is absent exactly when a reader
 * needs it and present when the browser was going to offer it anyway. **A
 * control that works on one engine and silently does nothing on the other is
 * `R-24`'s failure**, so this states the gesture each browser actually uses and
 * offers no control at all.
 *
 * ## What is deliberately not said
 *
 * **Nothing here claims notifications will work once installed.** Push fails
 * with HTTP 403 on a real iPhone and has never been executed on Android;
 * `OD-2O-11` declines that track and `2O-NOTIFY-006` states the fact rather
 * than resolving it. Installing the app is worth doing for the frame, the
 * launcher entry and the offline shell — the three things that are true — and
 * the copy says those and stops.
 */
export type InstallCopy = Readonly<{
  title: string;
  intro: string;
  /** What installing actually changes, with no promise about delivery. */
  benefits: readonly string[];
  steps: readonly Readonly<{ platform: string; instruction: string }>[];
  /** The honest limit, stated on the surface rather than only in a document. */
  caveat: string;
}>;

const PT: InstallCopy = {
  title: "Instalar como app",
  intro:
    "O My Brain pode ficar na tela de início do seu aparelho, como um aplicativo. Nada é baixado de uma loja: o próprio navegador guarda o atalho.",
  benefits: [
    "Abre em janela própria, sem a barra do navegador.",
    "Ganha um ícone na tela de início ou no menu de aplicativos.",
    "A estrutura da interface continua disponível quando a conexão cai — o conteúdo, não.",
  ],
  steps: [
    {
      platform: "iPhone e iPad (Safari)",
      instruction: "Toque no botão Compartilhar e escolha “Adicionar à Tela de Início”.",
    },
    {
      platform: "Android (Chrome)",
      instruction: "Abra o menu de três pontos e escolha “Instalar app” ou “Adicionar à tela inicial”.",
    },
    {
      platform: "Computador (Chrome ou Edge)",
      instruction: "Clique no ícone de instalar na barra de endereço, ou use o menu e escolha “Instalar”.",
    },
  ],
  caveat:
    "Instalar não ativa avisos. Os avisos no aparelho dependem de outra permissão e continuam sem entrega confirmada — o que a página de notificações diz.",
};

const EN: InstallCopy = {
  title: "Install as an app",
  intro:
    "My Brain can sit on your device's home screen like an application. Nothing is downloaded from a store: the browser keeps the shortcut itself.",
  benefits: [
    "Opens in its own window, without the browser bar.",
    "Gets an icon on the home screen or in the app menu.",
    "The interface shell stays available when the connection drops — the content does not.",
  ],
  steps: [
    {
      platform: "iPhone and iPad (Safari)",
      instruction: "Tap the Share button and choose “Add to Home Screen”.",
    },
    {
      platform: "Android (Chrome)",
      instruction: "Open the three-dot menu and choose “Install app” or “Add to home screen”.",
    },
    {
      platform: "Desktop (Chrome or Edge)",
      instruction: "Click the install icon in the address bar, or open the menu and choose “Install”.",
    },
  ],
  caveat:
    "Installing does not turn on alerts. Alerts on this device depend on a separate permission and still have no confirmed delivery — which is what the notifications page says.",
};

export function getInstallCopy(locale: Locale): InstallCopy {
  return locale === "en" ? EN : PT;
}
