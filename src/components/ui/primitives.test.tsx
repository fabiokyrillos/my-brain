import { render, screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  List,
  ListItem,
  PageHeader,
  SegmentedControl,
  TextLink,
  fieldDescribedBy,
} from "./index";

describe("Button", () => {
  it("defaults to a non-submitting secondary button of the touch size", () => {
    render(<Button>Salvar</Button>);
    const button = screen.getByRole("button", { name: "Salvar" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className.split(" ")).toEqual(expect.arrayContaining(["ui-button", "ui-button--secondary", "ui-button--md"]));
  });

  it("maps every variant and size to its own class, so a page cannot invent one", () => {
    const { rerender } = render(<Button variant="primary" size="lg" width="full">Enviar</Button>);
    let classes = screen.getByRole("button").className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["ui-button--primary", "ui-button--lg", "ui-button--full"]));
    rerender(<Button variant="danger" size="sm">Excluir</Button>);
    classes = screen.getByRole("button").className.split(" ");
    expect(classes).toEqual(expect.arrayContaining(["ui-button--danger", "ui-button--sm"]));
    expect(classes).not.toContain("ui-button--full");
  });

  it("announces and disables itself while loading, replacing the icon with a spinner", () => {
    render(<Button icon={<Plus data-testid="plus" />} loading>Salvando</Button>);
    const button = screen.getByRole("button", { name: "Salvando" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(screen.queryByTestId("plus")).toBeNull();
    expect(button.querySelector(".ui-spin")).not.toBeNull();
  });

  it("hides the icon from assistive technology and keeps the label as the name", () => {
    render(<Button icon={<Plus />}>Adicionar</Button>);
    const button = screen.getByRole("button", { name: "Adicionar" });
    expect(button.querySelector(".ui-button__icon")).toHaveAttribute("aria-hidden", "true");
  });

  it("still submits when a form asks it to", () => {
    render(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});

describe("ButtonLink and TextLink", () => {
  it("renders a navigation as an anchor with the button look", () => {
    render(<ButtonLink href="/pt-BR/app/chat" variant="primary">Conversar</ButtonLink>);
    const link = screen.getByRole("link", { name: "Conversar" });
    expect(link).toHaveAttribute("href", "/pt-BR/app/chat");
    expect(link.className.split(" ")).toEqual(expect.arrayContaining(["ui-button", "ui-button--primary"]));
  });

  it("renders an inline link, underlined always only when asked", () => {
    const { rerender } = render(<TextLink href="/x">Ver tudo</TextLink>);
    expect(screen.getByRole("link").className.split(" ")).toEqual(["ui-link"]);
    rerender(<TextLink href="/x" tone="muted" underline="always">Ver tudo</TextLink>);
    expect(screen.getByRole("link").className.split(" ")).toEqual(expect.arrayContaining(["ui-link--muted", "ui-link--underline-always"]));
  });
});

describe("IconButton", () => {
  it("is named by its required aria-label and is square", () => {
    render(<IconButton aria-label="Adicionar" icon={<Plus />} />);
    const button = screen.getByRole("button", { name: "Adicionar" });
    expect(button.className.split(" ")).toEqual(expect.arrayContaining(["ui-icon-button", "ui-button--ghost"]));
    expect(button.querySelector(".ui-button__label")).toBeNull();
  });
});

describe("Card", () => {
  it("renders the element it is asked to, with padding and tone classes", () => {
    render(<Card as="section" aria-label="Hoje" padding="compact" tone="subtle" interactive>conteúdo</Card>);
    const card = screen.getByRole("region", { name: "Hoje" });
    expect(card.tagName).toBe("SECTION");
    expect(card.className.split(" ")).toEqual(expect.arrayContaining(["ui-card", "ui-card--compact", "ui-card--subtle", "ui-card--interactive"]));
  });
});

describe("Field and Input", () => {
  it("wires label, hint and error to the control", () => {
    render(
      <Field error="Obrigatório" hint="Só para você" id="name" label="Nome" required>
        <Input aria-describedby={fieldDescribedBy("name", { hint: true, error: true })} id="name" invalid />
      </Field>,
    );
    const input = screen.getByLabelText(/Nome/);
    expect(input).toHaveAttribute("aria-describedby", "name-error name-hint");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.className.split(" ")).toEqual(expect.arrayContaining(["ui-input", "ui-input--invalid"]));
    expect(screen.getByRole("alert")).toHaveTextContent("Obrigatório");
  });

  it("describes nothing when there is nothing to describe", () => {
    expect(fieldDescribedBy("x", {})).toBeUndefined();
  });
});

describe("Badge", () => {
  it("carries a tone class and no mono face", () => {
    render(<Badge tone="success" size="sm">Feito</Badge>);
    const badge = screen.getByText("Feito");
    expect(badge.className.split(" ")).toEqual(expect.arrayContaining(["ui-badge", "ui-badge--success", "ui-badge--sm"]));
  });
});

describe("EmptyState", () => {
  it("is quiet by default and holds at most the one action it is given", () => {
    render(<EmptyState action={<Button>Registrar</Button>} description="Escreva algo." title="Nada por aqui" />);
    const title = screen.getByText("Nada por aqui");
    expect(title.closest(".ui-empty")?.className.split(" ")).not.toContain("ui-empty--info");
    expect(screen.getByRole("button", { name: "Registrar" })).toBeInTheDocument();
  });

  it("becomes the information box only when told to", () => {
    render(<EmptyState title="Atenção" tone="info" />);
    expect(screen.getByText("Atenção").closest(".ui-empty")?.className.split(" ")).toContain("ui-empty--info");
  });
});

describe("PageHeader", () => {
  it("renders an h1 by default, an h2 for a section, and no eyebrow slot", () => {
    const { rerender } = render(<PageHeader actions={<Button>Novo</Button>} description="Uma linha." title="Tarefas" />);
    expect(screen.getByRole("heading", { level: 1, name: "Tarefas" })).toBeInTheDocument();
    expect(screen.getByText("Uma linha.")).toHaveClass("ui-page-header__description");
    expect(document.querySelector(".eyebrow")).toBeNull();
    rerender(<PageHeader headingLevel={2} size="compact" title="Hoje" />);
    expect(screen.getByRole("heading", { level: 2, name: "Hoje" })).toBeInTheDocument();
    expect(document.querySelector(".ui-page-header--compact")).not.toBeNull();
  });
});

describe("List and ListItem", () => {
  it("makes the whole row the link when it has a destination", () => {
    render(
      <List aria-label="Tarefas">
        <ListItem href="/t/1" meta="até sexta" title="Exame de sangue" />
        <ListItem title="Sem link" trailing={<Badge>ok</Badge>} />
      </List>,
    );
    const list = screen.getByRole("list", { name: "Tarefas" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    const link = screen.getByRole("link", { name: /Exame de sangue/ });
    expect(link).toHaveAttribute("href", "/t/1");
    expect(link.className.split(" ")).toEqual(expect.arrayContaining(["ui-list-item", "ui-list-item--interactive"]));
    expect(screen.getByText("Sem link").closest("li")?.className.split(" ")).not.toContain("ui-list-item--interactive");
  });
});

describe("SegmentedControl", () => {
  it("marks the active option as the current page and names the group", () => {
    render(
      <SegmentedControl
        label="Visão"
        options={[
          { value: "today", label: "Hoje", href: "?view=today" },
          { value: "all", label: "Todas", href: "?view=all" },
        ]}
        value="all"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Visão" });
    expect(nav.querySelectorAll("a")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Todas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Hoje" })).not.toHaveAttribute("aria-current");
  });
});
