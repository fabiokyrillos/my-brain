import type { Locale } from "@/lib/preferences";

/**
 * The entity-editing copy, as one typed record per locale (ADR-036).
 *
 * `satisfies Record<Locale, EntityCopy>` makes a missing key or a missing
 * locale a compile error, so English cannot silently receive Portuguese the way
 * the detail pages' inline `pt ? … : …` ternaries could.
 */

type EntityCopy = {
  readonly edit: string;
  readonly cancel: string;
  readonly save: string;
  readonly saving: string;
  readonly saved: string;
  readonly nameLabel: string;
  readonly descriptionLabel: string;
  readonly notesLabel: string;
  readonly statusLabel: string;
  readonly organizationLabel: string;
  readonly organizationNone: string;
  readonly organizationEmpty: string;
  readonly statuses: Readonly<Record<"active" | "paused" | "completed" | "archived", string>>;
  /** Failures, each one a distinct thing the user can act on. */
  readonly invalidInput: string;
  readonly sessionExpired: string;
  readonly duplicateName: string;
  readonly notFound: string;
  readonly saveFailed: string;
  /** The read-only relation blocks this slice surfaces. */
  readonly relationships: string;
  readonly relationshipsEmpty: string;
  readonly contexts: string;
  readonly contextsEmpty: string;
  readonly roleOnProject: string;
  readonly noRole: string;
  readonly company: string;
  readonly companyNone: string;
  readonly since: string;
};

const copy = {
  "pt-BR": {
    edit: "Editar",
    cancel: "Cancelar",
    save: "Salvar",
    saving: "Salvando…",
    saved: "Alterações salvas.",
    nameLabel: "Nome",
    descriptionLabel: "Descrição",
    notesLabel: "Notas",
    statusLabel: "Situação",
    organizationLabel: "Empresa",
    organizationNone: "Sem empresa",
    organizationEmpty: "Nenhuma empresa registrada ainda.",
    statuses: {
      active: "Ativo",
      paused: "Pausado",
      completed: "Concluído",
      archived: "Arquivado",
    },
    invalidInput: "Revise os campos.",
    sessionExpired: "Sua sessão expirou.",
    duplicateName: "Esse nome já existe.",
    notFound: "Este registro não existe mais.",
    saveFailed: "Não foi possível salvar agora.",
    relationships: "Relação com você",
    relationshipsEmpty: "Nenhuma relação registrada.",
    contexts: "Contextos",
    contextsEmpty: "Nenhum contexto registrado.",
    roleOnProject: "Papel",
    noRole: "Sem papel definido",
    company: "Empresa",
    companyNone: "Sem empresa",
    since: "desde",
  },
  en: {
    edit: "Edit",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    saved: "Changes saved.",
    nameLabel: "Name",
    descriptionLabel: "Description",
    notesLabel: "Notes",
    statusLabel: "Status",
    organizationLabel: "Company",
    organizationNone: "No company",
    organizationEmpty: "No company recorded yet.",
    statuses: {
      active: "Active",
      paused: "Paused",
      completed: "Completed",
      archived: "Archived",
    },
    invalidInput: "Review the fields.",
    sessionExpired: "Your session expired.",
    duplicateName: "That name already exists.",
    notFound: "This record no longer exists.",
    saveFailed: "We could not save right now.",
    relationships: "Relationship to you",
    relationshipsEmpty: "No relationship recorded.",
    contexts: "Contexts",
    contextsEmpty: "No context recorded.",
    roleOnProject: "Role",
    noRole: "No role set",
    company: "Company",
    companyNone: "No company",
    since: "since",
  },
} satisfies Record<Locale, EntityCopy>;

export function getEntityCopy(locale: Locale): EntityCopy {
  return copy[locale];
}
