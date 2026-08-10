import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!expectedSecret || request.headers.get("x-smartbrgy-webhook-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  try {
    const payload = await request.json();
    const notification = payload.record || payload;
    if (!notification?.user_id || !notification?.title || !notification?.message) {
      return new Response(JSON.stringify({ error: "Invalid notification payload" }), { status: 400, headers: jsonHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("expo_push_token")
      .eq("user_id", notification.user_id)
      .eq("is_enabled", true);
    if (error) throw error;

    if (!tokens?.length) {
      return new Response(JSON.stringify({ delivered: 0, reason: "No enabled devices" }), { status: 200, headers: jsonHeaders });
    }

    const messages = tokens.map(({ expo_push_token }) => ({
      to: expo_push_token,
      sound: "default",
      title: notification.title,
      body: notification.message,
      priority: "high",
      channelId: "smartbrgy-updates",
      data: {
        notificationId: notification.id,
        type: notification.type || "general",
        relatedId: notification.related_id,
        target_path: notification.target_path || "/notifications",
      },
    }));

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    const result = await expoResponse.json();
    if (!expoResponse.ok) throw new Error(result?.errors?.[0]?.message || "Expo push service rejected the request");

    return new Response(JSON.stringify({ delivered: messages.length, result }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Push delivery failed" }), { status: 500, headers: jsonHeaders });
  }
});
