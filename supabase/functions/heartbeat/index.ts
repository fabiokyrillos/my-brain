import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const expectedSecret = Deno.env.get("HEARTBEAT_SECRET");
  if (!expectedSecret || request.headers.get("x-heartbeat-secret") !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) return Response.json({ error: "Server configuration missing" }, { status: 500 });
  const supabase = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("run_all_heartbeats");
  if (error) return Response.json({ error: "Heartbeat failed" }, { status: 500 });
  return Response.json({ ok: true, usersProcessed: data, completedAt: new Date().toISOString() });
});
