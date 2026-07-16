import { describe, expect, it } from "vitest";
import { getTimeZoneOptions } from "./timezones";

describe("getTimeZoneOptions", () => {
  it("uses friendly Brazilian Portuguese labels instead of raw IANA codes", () => {
    const options = getTimeZoneOptions("pt-BR", "America/Sao_Paulo");

    expect(options.find((option) => option.value === "America/Sao_Paulo")?.label)
      .toBe("Horário de Brasília · São Paulo e Rio (UTC−03:00)");
    expect(options.some((option) => option.label.includes("America/"))).toBe(false);
  });

  it("keeps a valid uncommon current timezone selectable", () => {
    const options = getTimeZoneOptions("pt-BR", "Pacific/Auckland");

    expect(options.some((option) => option.value === "Pacific/Auckland")).toBe(true);
  });
});
