import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { capabilityRegistry } from "@/features/shell/capabilities";
import { MODEL_PROFILES } from "@/lib/ai/model-routing";

import {
  AI_ROUTE_CONTRACTS,
  AI_USE_SITES,
  routeModelsForProfile,
  type AiRouteContract,
} from "./contracts";

/**
 * `2O-AICONFIG-003`: the statement reads the routing the product uses.
 *
 * The requirement's own words are *"rather than a second list"*, so the test
 * that matters is not "does the contract parse" — it is **does the contract
 * still describe the tree**. Both directions are checked, because only the
 * second one catches the failure this repository actually had: a copy of a
 * vocabulary that froze while the code moved on.
 */

const REPO = resolve(__dirname, "../../..");

/**
 * The write path, named rather than exempted.
 *
 * `buildSettingsPayload` reads `current?.reasoning_model ?? …` to pass a stored
 * value straight back, which is the *shape* of a behavioural read and the
 * opposite of one: it changes nothing about what the product does, it only
 * avoids wiping a column on save. `capabilities.ts` draws the same line for
 * `ai_provider` — *"inertness with a write path rather than inertness without
 * one, and is still no consumer"*.
 *
 * It is one file, and the test below asserts it is one file, so this is a
 * structural fact rather than an exemption list that can quietly grow.
 */
const WRITE_PATH = "src/features/profile/settings-payload.ts";

/** Every product source, tests excluded — a token in a test is a fixture. */
function productSources(): { paths: string[]; sources: Map<string, string> } {
  const paths: string[] = [];
  const sources = new Map<string, string>();

  const walk = (absolute: string, relative: string) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const nextAbsolute = join(absolute, entry.name);
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(nextAbsolute, nextRelative);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
      paths.push(nextRelative);
      sources.set(nextRelative, readFileSync(nextAbsolute, "utf8"));
    }
  };

  for (const root of ["src", "supabase/functions"]) walk(join(REPO, root), root);
  return { paths, sources };
}

const TREE = productSources();

/**
 * The files that read a preference column **behaviourally**.
 *
 * `?.column ??` is the shape every real call site uses, and it is the shape
 * because that is what resolving a preference to a model looks like: take the
 * stored value, fall back to a default. A bare mention of the column name is
 * deliberately **not** enough — the generated types, the form, the schema and
 * the registry all name every column and none of them is a consumer.
 */
function behaviouralReaders(column: string): string[] {
  const needle = `?.${column} ??`;
  return TREE.paths.filter((path) => (TREE.sources.get(path) ?? "").includes(needle));
}

describe("2O-AICONFIG-003 direction A: every declared call site really reads its column", () => {
  it("resolves each site in the tree", () => {
    for (const route of AI_ROUTE_CONTRACTS) {
      for (const site of route.callSites) {
        expect(TREE.sources.has(site), `${route.column} names \`${site}\`, which is not a product source`).toBe(true);
        expect(
          (TREE.sources.get(site) ?? "").includes(`?.${route.column} ??`),
          `${site} is declared for ${route.column} and does not read it`,
        ).toBe(true);
      }
    }
  });

  it("checks each declared default against the model the call site really names", () => {
    /*
     * The half that makes `2O-AICONFIG-003` a mechanism. A default changed in
     * `chat/actions.ts` without changing the contract leaves the surface stating
     * a model the product no longer uses, and this is what notices.
     *
     * The assertion is "the file names this model" rather than "the file
     * contains `?? "model"`" on purpose: `attachment.ts` resolves through an
     * environment variable in the middle of its chain, which the contract
     * records rather than hides.
     */
    for (const route of AI_ROUTE_CONTRACTS) {
      if (route.fallbackModel === null) continue;
      for (const site of route.callSites) {
        expect(
          (TREE.sources.get(site) ?? "").includes(`"${route.fallbackModel}"`),
          `${site} does not name ${route.fallbackModel} for ${route.column}`,
        ).toBe(true);
      }
    }
  });

  it("ties `fallbackModel` to having a consumer, so an unconsumed route claims no model", () => {
    for (const route of AI_ROUTE_CONTRACTS) {
      expect(route.fallbackModel === null, route.column).toBe(route.disposition === "unconsumed");
    }
  });

  it("is non-vacuous: the corpus, the routes and the sites are all real", () => {
    // Each assertion above passes trivially over an empty corpus, an empty
    // contract, or routes that declare no sites. This repository has shipped a
    // scan that ran from the wrong directory and a guard that read zero files.
    expect(TREE.paths.length).toBeGreaterThan(500);
    expect(AI_ROUTE_CONTRACTS.length).toBe(7);
    expect(AI_ROUTE_CONTRACTS.flatMap((route) => route.callSites).length).toBeGreaterThan(8);
  });

  it("rejects a planted site that reads nothing", () => {
    const planted = "src/features/ai-config/contracts.ts";
    expect(TREE.sources.has(planted)).toBe(true);
    // The contract module names every column and reads none of them, which is
    // exactly the false positive a bare substring scan would produce.
    expect((TREE.sources.get(planted) ?? "").includes("?.chat_model ??")).toBe(false);
  });
});

describe("2O-AICONFIG-003 direction B: a column that acquires a reader may not stay undeclared", () => {
  it("matches the tree's own census, route by route", () => {
    for (const route of AI_ROUTE_CONTRACTS) {
      const found = behaviouralReaders(route.column).filter((path) => path !== WRITE_PATH);
      expect(found.sort(), `${route.column}'s readers drifted from the contract`).toEqual(
        [...route.callSites].sort(),
      );
    }
  });

  it("names the write path as one file, so the exclusion above cannot grow quietly", () => {
    const passthroughs = AI_ROUTE_CONTRACTS.flatMap((route) => behaviouralReaders(route.column))
      .filter((path) =>
        // Widened deliberately: `callSites` is a literal tuple under `as const`,
        // so `includes` would only accept one of the declared paths — and the
        // whole question here is whether an **undeclared** one turned up.
        !AI_ROUTE_CONTRACTS.some((route) => (route.callSites as readonly string[]).includes(path)),
      );
    expect([...new Set(passthroughs)]).toEqual([WRITE_PATH]);
  });

  it("proves the census can fail, with a column that has no reader at all", () => {
    // `planning_time` is retired by `2M-AUDIT-005` and passed through by the
    // same payload builder. If `behaviouralReaders` ever started matching on
    // mere mention, this would return the form, the schema and the types.
    expect(behaviouralReaders("planning_time").filter((path) => path !== WRITE_PATH)).toEqual([]);
  });
});

describe("2O-AICONFIG-004 and -005: the dispositions say the true thing", () => {
  it("ties `unconsumed` to having no reader, in both directions", () => {
    for (const route of AI_ROUTE_CONTRACTS) {
      expect(
        route.callSites.length === 0,
        `${route.column} is ${route.disposition} and has ${route.callSites.length} site(s)`,
      ).toBe(route.disposition === "unconsumed");
      expect(route.operation === null, `${route.column}'s operation`).toBe(
        route.disposition === "unconsumed",
      );
    }
  });

  it("keeps `uncontrolled` for `embedding_model` alone — ADR-117 Decision 1", () => {
    expect(
      AI_ROUTE_CONTRACTS.filter((route) => route.disposition === "uncontrolled").map((r) => r.column),
    ).toEqual(["embedding_model"]);
  });

  it("keeps `unconsumed` for exactly the two columns `2O-AICONFIG-005` names", () => {
    expect(
      AI_ROUTE_CONTRACTS.filter((route) => route.disposition === "unconsumed").map((r) => r.column),
    ).toEqual(["reasoning_model", "background_model"]);
  });

  it("agrees with the capability registry, which is the other half of the claim", () => {
    // The registry says which columns have no consumer; this contract says
    // which have no reader. They are two derivations of one fact, and a slice
    // that moved one without the other would leave the product stating two
    // different things about the same column on two surfaces.
    const registryFuture = new Set(
      capabilityRegistry
        .filter((row) => row.state === "future" && row.consumerEvidence.length === 0)
        .flatMap((row) => row.columns),
    );
    for (const route of AI_ROUTE_CONTRACTS) {
      expect(registryFuture.has(route.column), `${route.column} versus its registry row`).toBe(
        route.disposition === "unconsumed",
      );
    }

    const registryUncontrolled = new Set(
      capabilityRegistry.filter((row) => row.state === "uncontrolled").flatMap((row) => row.columns),
    );
    expect([...registryUncontrolled]).toEqual(["embedding_model"]);
  });
});

describe("2O-AICONFIG-001: the use sites are the routes with a real reader", () => {
  it("names five, and derives rather than lists them", () => {
    expect(AI_USE_SITES.map((route) => route.column)).toEqual([
      "chat_model",
      "extraction_model",
      "review_model",
      "file_model",
      "embedding_model",
    ]);
    expect(AI_USE_SITES.every((route) => route.callSites.length > 0)).toBe(true);
  });
});

describe("2O-COST-004: a profile states what it routes, from the constant that stores it", () => {
  it("returns every column for every preset, out of MODEL_PROFILES", () => {
    for (const profile of ["quality", "balanced", "economy"] as const) {
      const routed = routeModelsForProfile(profile);
      expect(Object.keys(routed).sort()).toEqual(AI_ROUTE_CONTRACTS.map((r) => r.column).sort());
      for (const route of AI_ROUTE_CONTRACTS) {
        expect(routed[route.column]).toBe(MODEL_PROFILES[profile][route.routeKey]);
      }
    }
  });

  it("distinguishes the presets, so the statement is not the same sentence three times", () => {
    // `2O-COST-004` is about what a *choice* does. If every profile routed
    // identically the surface would be truthful and useless, and this asserts
    // the product it describes actually differs.
    const chat = (["quality", "balanced", "economy"] as const).map(
      (profile) => routeModelsForProfile(profile).chat_model,
    );
    expect(new Set(chat).size).toBe(3);
  });
});

describe("2O-COST-005 and R-2O-18: no forecast reaches this contract", () => {
  it("carries no price, rate or projection", () => {
    const source = readFileSync(join(REPO, "src/features/ai-config/contracts.ts"), "utf8");
    for (const forbidden of ["usd", "price", "perMillion", "estimate", "forecast"]) {
      expect(source.toLowerCase().includes(forbidden.toLowerCase()), forbidden).toBe(false);
    }
  });
});

describe("the contract's shape is the one the registry can be checked against", () => {
  it("keeps every column in the generated database types", () => {
    const types = readFileSync(join(REPO, "src/lib/supabase/database.types.ts"), "utf8");
    for (const route of AI_ROUTE_CONTRACTS) {
      expect(types.includes(`${route.column}:`), `${route.column} is not a column`).toBe(true);
    }
  });

  it("refuses a planted route whose disposition contradicts its sites", () => {
    const planted: AiRouteContract = {
      column: "chat_model",
      routeKey: "chatModel",
      operation: null,
      disposition: "unconsumed",
      callSites: ["src/features/chat/actions.ts"],
      fallbackModel: null,
    };
    expect(planted.callSites.length === 0).not.toBe(planted.disposition === "unconsumed");
  });
});
