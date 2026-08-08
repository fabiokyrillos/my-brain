/**
 * `2I-PALETTE` copy — typed, both locales, no inline ternary.
 *
 * Keywords are here rather than in the registry because they are **copy**: the
 * words a Portuguese speaker types to find a destination are not translations
 * of the words an English speaker types. `tarefa` and `todo` both find Work,
 * and neither is a rendering of the other.
 */

import type { Locale } from "@/lib/preferences";

export type PaletteCopy = {
  readonly trigger: string;
  readonly triggerHint: string;
  readonly title: string;
  readonly inputLabel: string;
  readonly placeholder: string;
  readonly close: string;
  readonly noResults: string;
  readonly noResultsHint: string;
  readonly groups: Readonly<Record<"navigate" | "create" | "search", string>>;
  readonly createCapture: string;
  readonly createConversation: string;
  readonly createTask: string;
  readonly openSearch: string;
  readonly resultsAnnouncement: (count: number) => string;
  readonly keywords: Readonly<Record<string, readonly string[]>>;
};

const copy: Record<Locale, PaletteCopy> = {
  "pt-BR": {
    trigger: "Buscar e agir",
    triggerHint: "Ctrl+K",
    title: "O que você quer fazer?",
    inputLabel: "Buscar destinos e ações",
    placeholder: "Digite para ir a algum lugar…",
    close: "Fechar",
    noResults: "Nada corresponde a isso",
    noResultsHint: "Tente outra palavra, ou abra a busca global para procurar no seu conteúdo.",
    groups: { navigate: "Ir para", create: "Começar", search: "Buscar" },
    createCapture: "Capturar algo novo",
    createConversation: "Conversar com o Brain",
    createTask: "Criar uma tarefa",
    openSearch: "Buscar em tudo",
    resultsAnnouncement: (count) =>
      count === 1 ? "1 resultado" : `${count} resultados`,
    keywords: {
      home: ["hoje", "inicio", "dia", "agora"],
      inbox: ["registros", "caixa", "entradas", "capturas"],
      work: ["trabalho", "tarefas", "todo", "aguardando", "pendencias"],
      chat: ["conversar", "chat", "brain", "perguntar", "assistente"],
      capture: ["capturar", "anotar", "nova", "rapida"],
      memories: ["memorias", "lembrancas", "o que o brain sabe"],
      people: ["pessoas", "contatos", "gente"],
      projects: ["projetos"],
      organizations: ["empresas", "organizacoes", "clientes"],
      contexts: ["contextos", "areas"],
      files: ["arquivos", "documentos", "anexos", "pdf"],
      reviews: ["revisoes", "retrospectiva"],
      questions: ["perguntas", "pendentes", "duvidas"],
      reminders: ["lembretes", "alarmes"],
      history: ["historico", "auditoria", "log"],
      costs: ["custos", "gastos", "ia", "tokens"],
      settings: ["configuracoes", "ajustes", "preferencias", "conta"],
      notifications: ["notificacoes", "avisos"],
      task: ["tarefa", "todo", "criar tarefa"],
      search: ["buscar", "procurar", "encontrar", "pesquisa"],
    },
  },
  en: {
    trigger: "Search and act",
    triggerHint: "Ctrl+K",
    title: "What do you want to do?",
    inputLabel: "Search destinations and actions",
    placeholder: "Type to go somewhere…",
    close: "Close",
    noResults: "Nothing matches that",
    noResultsHint: "Try another word, or open global search to look inside your content.",
    groups: { navigate: "Go to", create: "Start", search: "Search" },
    createCapture: "Capture something new",
    createConversation: "Talk to the Brain",
    createTask: "Create a task",
    openSearch: "Search everything",
    resultsAnnouncement: (count) => (count === 1 ? "1 result" : `${count} results`),
    keywords: {
      home: ["today", "now", "day"],
      inbox: ["records", "entries", "captures"],
      work: ["work", "tasks", "todo", "waiting"],
      chat: ["talk", "chat", "brain", "ask", "assistant"],
      capture: ["capture", "note", "new", "quick"],
      memories: ["memories", "what the brain knows"],
      people: ["people", "contacts"],
      projects: ["projects"],
      organizations: ["companies", "organizations", "clients"],
      contexts: ["contexts", "areas"],
      files: ["files", "documents", "attachments", "pdf"],
      reviews: ["reviews", "retrospective"],
      questions: ["questions", "pending"],
      reminders: ["reminders", "alarms"],
      history: ["history", "audit", "log"],
      costs: ["costs", "spend", "ai", "tokens"],
      settings: ["settings", "preferences", "account"],
      notifications: ["notifications", "alerts"],
      task: ["task", "todo", "create task"],
      search: ["search", "find", "look"],
    },
  },
};

export function getPaletteCopy(locale: Locale): PaletteCopy {
  return copy[locale] ?? copy["pt-BR"];
}
