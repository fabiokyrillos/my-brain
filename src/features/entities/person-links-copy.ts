/**
 * Life Brain E.2 (ADR-170) — the words of the "Pessoas ligadas" panel, typed,
 * in the canonical feature `copy.ts` shape.
 */

import type { Locale } from "@/lib/preferences";

export type PersonLinksCopy = Readonly<{
  heading: string;
  explainer: (name: string) => string;
  empty: string;
  add: string;
  otherLabel: string;
  typeLabel: (name: string) => string;
  save: string;
  saving: string;
  end: (other: string) => string;
  added: string;
  ended: string;
  self: string;
  duplicate: string;
  notFound: string;
  linkNotFound: string;
  failed: string;
  invalid: string;
  noOtherPeople: string;
  toYou: string;
}>;

const copy: Readonly<Record<Locale, PersonLinksCopy>> = {
  "pt-BR": {
    heading: "Pessoas ligadas",
    explainer: (name) => `Família, amigos e colegas de ${name} entre as suas pessoas. Cada ligação aparece nas duas páginas.`,
    empty: "Nenhuma pessoa ligada ainda.",
    add: "Ligar a outra pessoa",
    otherLabel: "Pessoa",
    typeLabel: (name) => `O que ela é de ${name}`,
    save: "Salvar ligação",
    saving: "Salvando…",
    end: (other) => `Encerrar a ligação com ${other}`,
    added: "Ligação registrada. Ela aparece também na página da outra pessoa.",
    ended: "Ligação encerrada. O histórico continua guardado.",
    self: "Uma pessoa não pode ser ligada a ela mesma.",
    duplicate: "Essa ligação já está registrada.",
    notFound: "Não encontramos essa pessoa na sua conta.",
    linkNotFound: "Essa ligação já não existe.",
    failed: "Não foi possível salvar agora.",
    invalid: "Escolha a pessoa e o tipo de ligação.",
    noOtherPeople: "Cadastre outra pessoa para ligá-la a esta.",
    toYou: "para você",
  },
  en: {
    heading: "Linked people",
    explainer: (name) => `${name}'s family, friends and colleagues among your people. Each link shows on both pages.`,
    empty: "No linked people yet.",
    add: "Link to another person",
    otherLabel: "Person",
    typeLabel: (name) => `What they are to ${name}`,
    save: "Save link",
    saving: "Saving…",
    end: (other) => `End the link with ${other}`,
    added: "Link recorded. It also shows on the other person's page.",
    ended: "Link ended. The history is still kept.",
    self: "A person cannot be linked to themselves.",
    duplicate: "That link is already recorded.",
    notFound: "We could not find that person in your account.",
    linkNotFound: "That link no longer exists.",
    failed: "Could not save right now.",
    invalid: "Choose the person and the kind of link.",
    noOtherPeople: "Add another person to link them to this one.",
    toYou: "to you",
  },
};

export function getPersonLinksCopy(locale: string): PersonLinksCopy {
  return locale === "en" ? copy.en : copy["pt-BR"];
}
