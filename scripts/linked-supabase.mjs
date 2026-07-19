import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function apiKeyValue(key) {
  return key.api_key ?? key.key ?? key.value;
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
  const keys = JSON.parse(execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }));
  const serviceKey = keys.find((key) => key.name === "service_role") ?? keys.find((key) => key.type === "secret");
  const publicKey = keys.find((key) => key.name === "anon") ?? keys.find((key) => key.type === "publishable");
  if (!serviceKey || !publicKey) throw new Error("Project API keys are unavailable");

  return {
    url: `https://${projectRef}.supabase.co`,
    publishableKey: apiKeyValue(publicKey),
    serviceRoleKey: apiKeyValue(serviceKey),
  };
}
