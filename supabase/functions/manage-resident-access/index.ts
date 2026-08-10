import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return reply({ error: "Authentication required" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: callerData, error: callerError } = await caller.auth.getUser();
    if (callerError || !callerData.user) return reply({ error: "Invalid administrator session" }, 401);

    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: adminProfile } = await service.from("profiles").select("role").eq("id", callerData.user.id).single();
    if (adminProfile?.role !== "admin") return reply({ error: "Administrator access required" }, 403);

    const { residentId, action, reason } = await request.json();
    if (!residentId || !["ban", "unban"].includes(action)) return reply({ error: "Invalid access request" }, 400);
    if (residentId === callerData.user.id) return reply({ error: "Administrators cannot restrict their own account" }, 400);
    if (action === "ban" && !String(reason || "").trim()) return reply({ error: "A ban reason is required" }, 400);

    const isBanned = action === "ban";
    const { error: authError } = await service.auth.admin.updateUserById(residentId, {
      ban_duration: isBanned ? "876000h" : "none",
    });
    if (authError) throw authError;

    const { error: profileError } = await service.from("profiles").update({
      is_banned: isBanned,
      ban_reason: isBanned ? String(reason).trim() : null,
      banned_at: isBanned ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", residentId).eq("role", "resident");
    if (profileError) throw profileError;

    return reply({ success: true });
  } catch (error) {
    return reply({ error: error.message || "Unable to update resident access" }, 400);
  }
});
