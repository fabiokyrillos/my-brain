import { describe, expect, it } from "vitest";

import { SETTINGS_SECTIONS } from "@/features/settings/sections";
import { profileSchema } from "./schema";
import {
  PROFILE_FIELD_WITHOUT_SECTION,
  PROFILE_FORM_SECTIONS,
  PROFILE_SECTION_FIELDS,
  isProfileFormSection,
  ownedProfileFields,
} from "./settings-sections";

/**
 * The guard that makes `2P-SETTINGS-004` structural.
 *
 * A section's save writes the columns it owns and passes every other column
 * through from the stored row. That is only safe while the four groups
 * **partition** the schema: a field owned by nobody would be silently dropped
 * on every save, and a field owned by two sections would let either one
 * overwrite the other's edit.
 *
 * Both properties are derived from `profileSchema.shape` rather than compared
 * against a transcription, so adding a field to the schema is enough to fail
 * this — nobody has to remember to update a list here as well.
 */

/** Every key the strict schema declares, read from the schema itself. */
const schemaFields = Object.keys(profileSchema.shape).sort();
const ownedFields = [...new Set(PROFILE_FORM_SECTIONS.flatMap((section) => ownedProfileFields(section)))].sort();

describe("the four groups partition the profile schema", () => {
  it("covers every schema field exactly once, apart from `locale`", () => {
    const expected = schemaFields.filter((field) => field !== PROFILE_FIELD_WITHOUT_SECTION);
    expect(ownedFields).toEqual(expected);
  });

  it("claims no field twice", () => {
    const flat = PROFILE_FORM_SECTIONS.flatMap((section) => ownedProfileFields(section));
    expect(flat.length, "a field is claimed by two sections").toBe(new Set(flat).size);
  });

  it("never claims `locale`, which every section submits and none owns", () => {
    for (const section of PROFILE_FORM_SECTIONS) {
      expect(ownedProfileFields(section)).not.toContain(PROFILE_FIELD_WITHOUT_SECTION);
    }
  });

  /**
   * Non-vacuity, both directions.
   *
   * The two assertions above compare a derived set against a derived set, and a
   * comparison of two empty sets passes for free. These prove the comparison
   * really discriminates: a group missing one field fails, and a group claiming
   * one twice fails. Without them, a refactor that emptied
   * `PROFILE_SECTION_FIELDS` would leave this file green.
   */
  it("fails when a field loses its section", () => {
    const withHole = ownedFields.filter((field) => field !== "timezone");
    expect(withHole).not.toEqual(schemaFields.filter((f) => f !== PROFILE_FIELD_WITHOUT_SECTION));
  });

  it("fails when a field is claimed twice", () => {
    const duplicated = [...ownedFields, "timezone"];
    expect(duplicated.length).not.toBe(new Set(duplicated).size);
  });

  it("is not comparing an empty set with itself", () => {
    expect(ownedFields.length).toBeGreaterThan(10);
    expect(schemaFields).toContain(PROFILE_FIELD_WITHOUT_SECTION);
  });
});

describe("the four are real settings sections", () => {
  it("names only sections the routing contract declares", () => {
    for (const section of PROFILE_FORM_SECTIONS) {
      expect(SETTINGS_SECTIONS, `${section} is not a settings section`).toContain(section);
    }
  });

  it("leaves the four non-form sections owning no profile column", () => {
    const withoutForm = SETTINGS_SECTIONS.filter(
      (section) => !(PROFILE_FORM_SECTIONS as readonly string[]).includes(section),
    );
    // Notificações, Privacidade e dados, Aparência and Conta. Each has its own
    // writer or none at all, which is why none appears in the payload split.
    expect(withoutForm).toEqual(["notifications", "privacy", "appearance", "account"]);
  });

  it("recognises its own members and refuses anything else", () => {
    expect(isProfileFormSection("planning")).toBe(true);
    expect(isProfileFormSection("account")).toBe(false);
    expect(isProfileFormSection("")).toBe(false);
    expect(isProfileFormSection(null)).toBe(false);
  });
});

describe("the split follows the sections the owner named", () => {
  it("keeps the timezone alone in Geral, because it changes what every date means", () => {
    expect(PROFILE_SECTION_FIELDS.general).toEqual(["timezone"]);
  });

  it("keeps the routed models beside the credential that pays for them", () => {
    expect(PROFILE_SECTION_FIELDS.ai).toContain("aiProfile");
    expect(PROFILE_SECTION_FIELDS.ai).toContain("chatModel");
    expect(PROFILE_SECTION_FIELDS.ai).not.toContain("agentName");
  });

  it("keeps quiet hours and the follow-up cap together, since one consumer reads both", () => {
    expect(PROFILE_SECTION_FIELDS.planning).toContain("quietStart");
    expect(PROFILE_SECTION_FIELDS.planning).toContain("quietEnd");
    expect(PROFILE_SECTION_FIELDS.planning).toContain("maxFollowupsPerDay");
    expect(PROFILE_SECTION_FIELDS.planning).toContain("importantReminderOverride");
  });
});
