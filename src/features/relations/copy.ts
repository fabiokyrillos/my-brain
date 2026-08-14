/**
 * `2N-ACCESS-005` — every state this surface has, in both locales, through a
 * typed module rather than scattered locale ternaries.
 *
 * The wording is doing real work here, so each string is chosen against a rule
 * rather than for tone:
 *
 * - **`unattributableOrigin` is not an error and not an accusation.** *"Não é
 *   possível dizer…"* states what the product knows. *"Vínculo inferido"* would
 *   assert the trigger created it, which is only probable; *"Falha ao verificar"*
 *   would blame the product for something no column records. `2N-RELATION-009`
 *   asks an edge to say where it came from and, where nothing can, to say that
 *   plainly instead of dressing it up as evidence.
 * - **`ownerAuthoredOrigin` claims no verification.** One sentence covers both
 *   owner-authored bases, because the difference between "no other writer exists"
 *   and "your own audit row proves it" is how the *product* knows, not something
 *   the reader can act on. *"Confirmado"* or *"Verificado"* would describe a check
 *   that never happened.
 * - **`notDrawnExplainer` explains an absence the reader can see.** A drawing
 *   that quietly held back six of its lines would be the misleading graph
 *   `2N-RELATION-011` refuses; one that says what it is not drawing, and keeps
 *   them one heading below, is neither misleading nor degraded.
 * - **`layoutMeansNothing` is rendered, not commented.** `2N-RELATION-010` is the
 *   requirement most likely to be violated by the reader rather than by the code,
 *   so the refusal is on the screen in both locales and in the figure's own
 *   description — never only in a tooltip, which `2N-ACCESS-004` would not reach.
 * - **The association terms name a link, not an activity.** *"Vínculo com o
 *   projeto"* is what `person_projects` records. *"Trabalha em"* would add a fact
 *   the row does not carry.
 */

import type { Locale } from "@/lib/preferences";

import type { RelationEdgeKind, RelationNodeType } from "./contracts";

export type RelationsCopy = {
  readonly pageTitle: string;
  readonly pageEyebrow: string;
  readonly pageIntro: string;

  /** The canonical presentation's heading, and why it comes first. */
  readonly listHeading: string;
  readonly listIntro: string;
  /** The drawing's heading and its accessible description. */
  readonly diagramHeading: string;
  readonly diagramDescription: string;
  readonly diagramLabel: string;

  /** The owner's own node. Never a name — the product does not print one here. */
  readonly ownerLabel: string;
  readonly nodeType: (type: RelationNodeType) => string;
  readonly edgeKind: (kind: RelationEdgeKind) => string;
  /** A relationship type the closed vocabulary does not carry. */
  readonly unknownRelationship: string;

  readonly originLabel: string;
  readonly ownerAuthoredOrigin: string;
  readonly unattributableOrigin: string;
  readonly notDrawnHeading: string;
  readonly notDrawnExplainer: string;

  readonly roleLabel: string;
  readonly sinceLabel: string;
  readonly descriptionLabel: string;

  readonly legendHeading: string;
  readonly layoutMeansNothing: string;

  readonly emptyHeading: string;
  readonly emptyBody: string;
  readonly nothingDrawableHeading: string;
  readonly nothingDrawableBody: string;
  readonly failedHeading: string;
  readonly failedBody: string;
  readonly loading: string;

  /** Accessible names, so two links never share one. */
  readonly openNode: (label: string, type: string) => string;
  readonly edgeSummary: (from: string, relation: string, to: string) => string;
  /** `2N-RELATION-005` — what a stored confidence would mean, if one were shown. */
  readonly confidenceNeverShown: string;
};

const PT_NODE_TYPE: Record<RelationNodeType, string> = {
  owner: "Você",
  person: "Pessoa",
  project: "Projeto",
  context: "Contexto",
  organization: "Organização",
};

const EN_NODE_TYPE: Record<RelationNodeType, string> = {
  owner: "You",
  person: "Person",
  project: "Project",
  context: "Context",
  organization: "Organization",
};

const PT_EDGE_KIND: Record<RelationEdgeKind, string> = {
  person_owner: "Relação com você",
  person_project: "Vínculo com o projeto",
  person_context: "Vínculo com o contexto",
  person_organization: "Pertence à organização",
  project_organization: "Pertence à organização",
};

const EN_EDGE_KIND: Record<RelationEdgeKind, string> = {
  person_owner: "Relationship to you",
  person_project: "Link to the project",
  person_context: "Link to the context",
  person_organization: "Belongs to the organization",
  project_organization: "Belongs to the organization",
};

const PT: RelationsCopy = {
  pageTitle: "Relações",
  pageEyebrow: "Contexto",
  pageIntro:
    "As ligações que o Cérebro guarda entre pessoas, projetos, contextos e organizações. A lista abaixo é a versão completa; o desenho mostra a parte que pode ser explicada.",

  listHeading: "Todos os vínculos",
  listIntro: "Cada linha diz o que o vínculo afirma e de onde ele veio.",
  diagramHeading: "Desenho",
  diagramDescription:
    "Um desenho das mesmas ligações da lista acima, em colunas por tipo: você e seus contextos à esquerda, depois as pessoas, os projetos e as organizações. Cada caixa abre a página do item. As linhas ligam as caixas relacionadas.",
  diagramLabel: "Desenho das relações",

  ownerLabel: "Você",
  nodeType: (type) => PT_NODE_TYPE[type],
  edgeKind: (kind) => PT_EDGE_KIND[kind],
  unknownRelationship: "Relação não reconhecida",

  originLabel: "Origem",
  ownerAuthoredOrigin: "Informado por você",
  unattributableOrigin:
    "Não é possível dizer se você registrou este vínculo ou se ele veio de uma leitura.",
  notDrawnHeading: "Vínculos sem origem confirmada",
  notDrawnExplainer:
    "Estes vínculos existem e continuam nas páginas de pessoa e de projeto. Eles não entram no desenho porque o Cérebro não consegue dizer de onde vieram.",

  roleLabel: "Papel",
  sinceLabel: "Desde",
  descriptionLabel: "Sua anotação",

  legendHeading: "Legenda",
  layoutMeansNothing:
    "A posição, a distância entre as caixas e a quantidade de linhas não significam nada. Um item com mais ligações não é mais importante.",

  emptyHeading: "Nenhum vínculo ainda",
  emptyBody:
    "Quando você registrar uma relação em uma pessoa, ou ligar uma pessoa a um projeto ou contexto, ela aparece aqui.",
  nothingDrawableHeading: "Nada para desenhar",
  nothingDrawableBody:
    "Os vínculos que você tem estão na lista acima. Nenhum deles tem origem confirmada, então não há o que desenhar.",
  failedHeading: "Não foi possível carregar suas relações",
  failedBody: "Isto é uma falha de leitura, não uma ausência de vínculos. Tente novamente.",
  loading: "Carregando as relações",

  openNode: (label, type) => `Abrir ${type.toLowerCase()}: ${label}`,
  edgeSummary: (from, relation, to) => `${from} — ${relation} — ${to}`,
  confidenceNeverShown:
    "O Cérebro guarda um número de confiança para cada vínculo e não o mostra: ele mede a consistência de uma leitura, não a verdade de um fato.",
};

const EN: RelationsCopy = {
  pageTitle: "Relations",
  pageEyebrow: "Context",
  pageIntro:
    "The links the Brain holds between people, projects, contexts and organizations. The list below is the complete version; the drawing shows the part that can be explained.",

  listHeading: "All links",
  listIntro: "Each row says what the link asserts and where it came from.",
  diagramHeading: "Drawing",
  diagramDescription:
    "A drawing of the same links as the list above, in columns by type: you and your contexts on the left, then people, projects and organizations. Each box opens that item's page. The lines join the boxes that are linked.",
  diagramLabel: "Relations drawing",

  ownerLabel: "You",
  nodeType: (type) => EN_NODE_TYPE[type],
  edgeKind: (kind) => EN_EDGE_KIND[kind],
  unknownRelationship: "Unrecognized relationship",

  originLabel: "Origin",
  ownerAuthoredOrigin: "Informed by you",
  unattributableOrigin:
    "The Brain cannot tell whether you recorded this link or it came from a reading.",
  notDrawnHeading: "Links with no confirmed origin",
  notDrawnExplainer:
    "These links exist and stay on the person and project pages. They are left out of the drawing because the Brain cannot say where they came from.",

  roleLabel: "Role",
  sinceLabel: "Since",
  descriptionLabel: "Your note",

  legendHeading: "Legend",
  layoutMeansNothing:
    "Position, the distance between boxes and the number of lines mean nothing. An item with more links is not more important.",

  emptyHeading: "No links yet",
  emptyBody:
    "When you record a relationship on a person, or link a person to a project or a context, it appears here.",
  nothingDrawableHeading: "Nothing to draw",
  nothingDrawableBody:
    "The links you have are in the list above. None of them has a confirmed origin, so there is nothing to draw.",
  failedHeading: "Your relations could not be loaded",
  failedBody: "This is a read failure, not an absence of links. Please try again.",
  loading: "Loading relations",

  openNode: (label, type) => `Open ${type.toLowerCase()}: ${label}`,
  edgeSummary: (from, relation, to) => `${from} — ${relation} — ${to}`,
  confidenceNeverShown:
    "The Brain stores a confidence number for each link and does not show it: it measures how consistent a reading was, not whether a fact is true.",
};

export function getRelationsCopy(locale: Locale): RelationsCopy {
  return locale === "pt-BR" ? PT : EN;
}
