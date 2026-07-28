import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function apiKeyValue(key) {
  return key.api_key ?? key.key ?? key.value;
}

function asText(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.toString === "function") return value.toString("utf8");
  return "";
}

/**
 * The service-role/publishable pair from a CLI answer, or null when the text is
 * not a usable key list.
 */
function readKeyPair(raw) {
  const text = asText(raw).trim();
  if (text === "") return null;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const serviceKey = parsed.find((key) => key?.name === "service_role")
    ?? parsed.find((key) => key?.type === "secret");
  const publicKey = parsed.find((key) => key?.name === "anon")
    ?? parsed.find((key) => key?.type === "publishable");
  if (!serviceKey || !publicKey) return null;
  if (!apiKeyValue(serviceKey) || !apiKeyValue(publicKey)) return null;

  return { serviceKey, publicKey };
}

/**
 * The CLI's key list, tolerating a non-zero exit that still produced one.
 *
 * The CLI flushes telemetry after writing its result, so a failed flush
 * ("Timeout while shutting down PostHog") exits non-zero with the complete,
 * valid JSON already on stdout. `execFileSync` throws on any non-zero exit, so
 * that hiccup made an otherwise-successful lookup fatal — and because every
 * remote smoke resolves credentials through here, it made every remote gate
 * randomly unrunnable (two of three consecutive runs during the Pre-2E
 * cutover). A genuine failure produces no key list and still throws.
 */
function fetchKeyPair(command, args) {
  try {
    return readKeyPair(execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch (error) {
    const recovered = readKeyPair(error?.stdout);
    if (recovered) return recovered;

    // Never re-raise the CLI's own error: its `stdout` property holds the key
    // list, and an uncaught throw prints an error's properties, which put a
    // live service-role key on the terminal and into any log capturing the run.
    const diagnostic = asText(error?.stderr).split("\n").find((line) => line.trim() !== "");
    throw new Error(
      `Supabase CLI could not return the linked project API keys: ${
        diagnostic ? diagnostic.trim().slice(0, 200) : "no diagnostic output"
      }`,
    );
  }
}

export function getLinkedSupabaseCredentials() {
  const projectRef = readFileSync(
    new URL("../supabase/.temp/project-ref", import.meta.url),
    "utf8",
  ).trim();
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error("Linked project reference is invalid");
  }

  const command = process.platform === "win32" ? process.env.ComSpec : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `npx supabase projects api-keys --project-ref ${projectRef} --output json`]
    : ["supabase", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"];

  const keys = fetchKeyPair(command, args);
  if (!keys) throw new Error("Project API keys are unavailable");

  return {
    url: `https://${projectRef}.supabase.co`,
    publishableKey: apiKeyValue(keys.publicKey),
    serviceRoleKey: apiKeyValue(keys.serviceKey),
  };
}
