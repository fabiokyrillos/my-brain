/**
 * The guided path's copy, as a typed record rather than as locale ternaries.
 *
 * `docs/ENGINEERING_STANDARDS.md` makes a feature `copy.ts` in the
 * `daily-cycle/copy.ts` shape the canonical mechanism for new user-facing text,
 * and UX-22's rule is that a slice leaves no more inline ternaries than it
 * found. Keying `steps` by `OnboardingStepKey` is what makes that structural:
 * a step added to `contracts.ts` without copy fails to compile, in both
 * locales, before anything renders a blank row.
 */

import type { OnboardingStepKey } from "./contracts";
import type { Locale } from "@/lib/preferences";

export type OnboardingStepCopy = Readonly<{
  title: string;
  /** What the step does, and — where it matters — what happens after it. */
  body: string;
  /** The label on the link that reaches the existing surface. */
  action: string;
}>;

export type OnboardingCopy = Readonly<{
  eyebrow: string;
  title: string;
  intro: string;
  progress: (done: number, total: number) => string;
  steps: Readonly<Record<OnboardingStepKey, OnboardingStepCopy>>;
  /** The state labels, one per value the path can hold. */
  states: Readonly<{ satisfied: string; unsatisfied: string; unreadable: string; blocked: string }>;
  /** `2O-ONBOARD-011`. The recovery, in the words the awaiting state already uses. */
  recovery: Readonly<{ title: string; body: string; action: string }>;
  /** `2O-ACTIVATION-003` surfacing in the UI: a read that failed says so. */
  unreadableNotice: string;
  dismiss: Readonly<{ action: string; hint: string }>;
  /** `2O-ONBOARD-010`'s reversal, mounted on the preferences surface. */
  restore: Readonly<{ title: string; body: string; action: string }>;
}>;

const PT: OnboardingCopy = {
  eyebrow: "PRIMEIROS PASSOS",
  title: "Um caminho até o primeiro resultado",
  intro:
    "Sugestão, não exigência. A captura continua disponível o tempo todo, e você pode fazer estes passos em qualquer ordem — ou nenhum.",
  progress: (done, total) => `${done} de ${total} concluídos`,
  steps: {
    locale_and_timezone: {
      title: "Idioma e fuso horário",
      body: "Define em que dia cada registro cai. Sem isso, datas e lembretes aparecem no dia errado.",
      action: "Ajustar idioma e fuso",
    },
    assistant_identity: {
      title: "Nome e jeito do assistente",
      body: "Escolha como o assistente se chama e o tom que ele usa. Você pode mudar quando quiser.",
      action: "Dar um nome",
    },
    ai_credential: {
      title: "Sua chave de IA",
      body: "A interpretação usa a sua própria chave. Ela é guardada cifrada e só você a usa.",
      action: "Configurar a chave",
    },
    entry_captured: {
      title: "A primeira captura",
      body: "Escreva do seu jeito. Suas palavras são guardadas antes de qualquer modelo rodar, e a tela devolve o controle na hora — a interpretação acontece depois, em segundo plano.",
      action: "Capturar agora",
    },
    interpretation_reviewed: {
      title: "Revisar a primeira interpretação",
      body: "Quando a interpretação ficar pronta, você decide o que vira tarefa. Nada é criado sem esse seu ato.",
      action: "Ver o que chegou",
    },
    task_confirmed: {
      title: "A primeira tarefa",
      body: "Confirme uma tarefa a partir do que foi entendido, ou crie uma direto. As duas passam pelo mesmo caminho.",
      action: "Ver as tarefas",
    },
    memory_created: {
      title: "A primeira memória",
      body: "Registre algo que o assistente deve lembrar em todas as conversas seguintes. Opcional, como todo o resto.",
      action: "Abrir memórias",
    },
  },
  states: {
    satisfied: "Feito",
    unsatisfied: "Pendente",
    unreadable: "Não foi possível verificar",
    blocked: "Precisa da chave de IA",
  },
  recovery: {
    title: "Configure a chave para seguir",
    body: "Sem uma chave de IA ativa, a interpretação não roda. O que você capturar fica guardado e aguardando — nada se perde.",
    action: "Ir para a configuração",
  },
  unreadableNotice:
    "Não foi possível verificar todos os passos agora. O que aparece como não verificado pode já estar feito.",
  dismiss: {
    action: "Dispensar este guia",
    hint: "Você pode trazê-lo de volta em Configurações.",
  },
  restore: {
    title: "Guia de primeiros passos",
    body: "O guia está dispensado neste navegador. Trazê-lo de volta não altera nada do que já foi feito.",
    action: "Mostrar o guia de novo",
  },
} as const;

const EN: OnboardingCopy = {
  eyebrow: "FIRST STEPS",
  title: "A path to your first real result",
  intro:
    "A suggestion, not a requirement. Capture stays available throughout, and you can take these in any order — or none of them.",
  progress: (done, total) => `${done} of ${total} done`,
  steps: {
    locale_and_timezone: {
      title: "Language and time zone",
      body: "This decides which day each record falls on. Without it, dates and reminders show up on the wrong day.",
      action: "Set language and zone",
    },
    assistant_identity: {
      title: "Your assistant's name and manner",
      body: "Choose what the assistant is called and the tone it uses. You can change this whenever you like.",
      action: "Give it a name",
    },
    ai_credential: {
      title: "Your AI key",
      body: "Interpretation runs on your own key. It is stored encrypted, and only you use it.",
      action: "Set up the key",
    },
    entry_captured: {
      title: "Your first capture",
      body: "Write it however you like. Your words are stored before any model runs, and the screen hands control straight back — interpretation happens afterwards, in the background.",
      action: "Capture now",
    },
    interpretation_reviewed: {
      title: "Review the first interpretation",
      body: "When the interpretation is ready, you decide what becomes a task. Nothing is created without that act of yours.",
      action: "See what arrived",
    },
    task_confirmed: {
      title: "Your first task",
      body: "Confirm a task from what was understood, or create one directly. Both go through the same path.",
      action: "Open tasks",
    },
    memory_created: {
      title: "Your first memory",
      body: "Record something the assistant should remember in every conversation after this. Optional, like the rest.",
      action: "Open memories",
    },
  },
  states: {
    satisfied: "Done",
    unsatisfied: "Pending",
    unreadable: "Could not be checked",
    blocked: "Needs your AI key",
  },
  recovery: {
    title: "Set up the key to continue",
    body: "Without an active AI key, interpretation does not run. Anything you capture is stored and waiting — nothing is lost.",
    action: "Go to the setup",
  },
  unreadableNotice:
    "Some steps could not be checked right now. Anything shown as unchecked may already be done.",
  dismiss: {
    action: "Dismiss this guide",
    hint: "You can bring it back from Settings.",
  },
  restore: {
    title: "First-steps guide",
    body: "The guide is dismissed in this browser. Bringing it back changes nothing about what is already done.",
    action: "Show the guide again",
  },
} as const;

export function getOnboardingCopy(locale: Locale): OnboardingCopy {
  return locale === "en" ? EN : PT;
}
