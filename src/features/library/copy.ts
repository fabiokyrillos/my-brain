/** `2I-LIB` copy — typed, both locales, no inline ternary. */

import type { Locale } from "@/lib/preferences";
import type { NavigationKey } from "@/features/shell/capabilities";

export type LibraryCopy = {
  readonly title: string;
  readonly intro: string;
  readonly searchLink: string;
  readonly empty: string;
  readonly recentLabel: string;
  readonly open: (label: string) => string;
  readonly descriptions: Readonly<Partial<Record<NavigationKey, string>>>;
};

const copy: Record<Locale, LibraryCopy> = {
  "pt-BR": {
    /*
      "Brain", matching the destination's label in the rail.
      The page said "Biblioteca" while the navigation that reached it said
      "Brain" — one destination with two names, which is the naming collision
      `2I-SHELL-002` removed between "Início" and "Hoje". The route is still
      `library`; only the name changed.
    */
    title: "Brain",
    intro: "Tudo que o Brain sabe sobre o seu mundo, em um lugar só.",
    searchLink: "Buscar em tudo",
    empty: "Nada aqui ainda.",
    recentLabel: "Recentes",
    open: (label) => `Abrir ${label}`,
    descriptions: {
      memories: "O que o Brain lembra sobre você.",
      people: "Quem aparece no seu trabalho.",
      projects: "No que você está trabalhando.",
      organizations: "Empresas e clientes.",
      contexts: "Áreas da sua vida.",
      files: "Documentos e anexos.",
      // 2N.6. Named for what it holds rather than for the drawing on it: the
      // canonical presentation there is a list, and the sentence should not
      // promise a picture to a reader who may never see one.
      relations: "Como essas coisas se ligam.",
      // The Conversas lens. Named for what it gives you access to, not for the
      // mechanism: a conversation is how you ask the Brain about everything above.
      chat: "Perguntar sobre tudo isto.",
    },
  },
  en: {
    title: "Brain",
    intro: "Everything the Brain knows about your world, in one place.",
    searchLink: "Search everything",
    empty: "Nothing here yet.",
    recentLabel: "Recent",
    open: (label) => `Open ${label}`,
    descriptions: {
      memories: "What the Brain remembers about you.",
      people: "Who shows up in your work.",
      projects: "What you are working on.",
      organizations: "Companies and clients.",
      contexts: "Areas of your life.",
      files: "Documents and attachments.",
      relations: "How these things connect.",
      chat: "Ask about all of this.",
    },
  },
};

export function getLibraryCopy(locale: Locale): LibraryCopy {
  return copy[locale] ?? copy["pt-BR"];
}

/**
 * `2N-FILES` copy — the enlarged library, typed in both locales.
 *
 * A second record rather than more members on `LibraryCopy`, because the two
 * describe different surfaces: that one is the navigation dashboard at
 * `/app/library`, this one is the file library at `/app/files`. Merging them
 * would put half the strings on a page that never renders them.
 *
 * ## The honest empty state is a copy decision, so it lives here
 *
 * `entity_attachments` has no writer in product code and this slice creates
 * none (owner decision, option A). The empty state therefore has to say two true
 * things at once — *no file is linked to this*, and *the product does not
 * currently offer a way to link one* — without a call to action behind either.
 * `linkedEmpty` and `linkedUnavailable` are that sentence pair, written out
 * rather than assembled at a call site, so the promise the product does not make
 * cannot be re-introduced by an edit three components away.
 */
export type FileLibraryCopy = {
  readonly filtersLabel: string;
  readonly filterState: string;
  readonly filterKind: string;
  readonly filterPeriod: string;
  readonly filterLinked: string;
  readonly filterAll: string;
  readonly filterClear: string;
  readonly filteredNotice: string;
  readonly kinds: Readonly<Record<"image" | "document" | "spreadsheet" | "text" | "other", string>>;
  readonly periods: Readonly<Record<"7d" | "30d" | "12m", string>>;
  readonly linkedHeading: string;
  readonly linkedEmpty: string;
  /** Why the emptiness is permanent for now. Stated, never dressed as a control. */
  readonly linkedNoWriter: string;
  readonly linkedFailed: string;
  readonly linkedFilesHeading: string;
  readonly linkedFilesEmpty: string;
  readonly linkedFilesFailed: string;
  readonly searchInFiles: string;
  readonly searchInFilesHint: string;
  readonly originalUnavailable: string;
  readonly analysisEntities: string;
};

const fileLibraryCopy: Record<Locale, FileLibraryCopy> = {
  "pt-BR": {
    filtersLabel: "Filtros",
    filterState: "Estado",
    filterKind: "Tipo",
    filterPeriod: "Período",
    filterLinked: "Vinculado a",
    filterAll: "Todos",
    filterClear: "Limpar filtros",
    filteredNotice: "Mostrando apenas os arquivos que atendem aos filtros ativos.",
    kinds: {
      image: "Imagem",
      document: "Documento",
      spreadsheet: "Planilha",
      text: "Texto",
      other: "Outro",
    },
    periods: { "7d": "7 dias", "30d": "30 dias", "12m": "12 meses" },
    linkedHeading: "Vinculado a",
    linkedEmpty: "Nenhum vínculo registrado para este arquivo.",
    linkedNoWriter:
      "O Brain mostra os vínculos que já existem. Ainda não há como criar um vínculo novo por aqui.",
    linkedFailed: "Não foi possível ler os vínculos agora. Isso não quer dizer que não existam.",
    linkedFilesHeading: "Arquivos vinculados",
    linkedFilesEmpty: "Nenhum arquivo vinculado.",
    linkedFilesFailed:
      "Não foi possível ler os arquivos vinculados agora. Isso não quer dizer que não existam.",
    searchInFiles: "Buscar dentro dos arquivos",
    searchInFilesHint: "A busca do Brain procura no nome, na descrição e no texto extraído.",
    originalUnavailable: "Link do original indisponível agora",
    analysisEntities: "Encontrado no documento",
  },
  en: {
    filtersLabel: "Filters",
    filterState: "State",
    filterKind: "Kind",
    filterPeriod: "Period",
    filterLinked: "Linked to",
    filterAll: "All",
    filterClear: "Clear filters",
    filteredNotice: "Showing only the files that match the active filters.",
    kinds: {
      image: "Image",
      document: "Document",
      spreadsheet: "Spreadsheet",
      text: "Text",
      other: "Other",
    },
    periods: { "7d": "7 days", "30d": "30 days", "12m": "12 months" },
    linkedHeading: "Linked to",
    linkedEmpty: "No link recorded for this file.",
    linkedNoWriter:
      "The Brain shows links that already exist. There is no way to create a new one here yet.",
    linkedFailed: "The links could not be read right now. That does not mean there are none.",
    linkedFilesHeading: "Linked files",
    linkedFilesEmpty: "No linked files.",
    linkedFilesFailed:
      "The linked files could not be read right now. That does not mean there are none.",
    searchInFiles: "Search inside files",
    searchInFilesHint: "The Brain's search looks in the name, the description and the extracted text.",
    originalUnavailable: "Original link unavailable right now",
    analysisEntities: "Found in the document",
  },
};

export function getFileLibraryCopy(locale: Locale): FileLibraryCopy {
  return fileLibraryCopy[locale] ?? fileLibraryCopy["pt-BR"];
}
