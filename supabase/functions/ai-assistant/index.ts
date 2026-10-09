// SmartBRGY AI assistant (Gemini free tier or Claude).
//
// The mobile app never talks to the AI provider directly: the API key lives only
// in Supabase secrets. Every request is tied to a signed-in, non-banned resident
// and counted against a daily limit (public.ai_consume_quota).
//
// Modes:
//   chat           Barangay Assistant: answers questions about services, fees,
//                  requirements and announcements; can hand off to the Help Desk.
//   report_assist  Turns a resident's own description into a structured
//                  incident report draft (category, urgency, clear details).
//   translate      Translates/summarizes an announcement into Cebuano,
//                  Filipino or English.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// AI_PROVIDER = "gemini" (free tier, default when GEMINI_API_KEY is set) or "claude".
const PROVIDER = (Deno.env.get("AI_PROVIDER") || (Deno.env.get("GEMINI_API_KEY") ? "gemini" : "claude")).toLowerCase();
const MODEL = Deno.env.get("AI_MODEL") || (PROVIDER === "gemini" ? "gemini-3.5-flash" : "claude-haiku-5-5");
// Google may use free-tier Gemini requests to improve its products, so residents'
// own records (name, request statuses) are not sent unless explicitly allowed.
const SHARE_PERSONAL_CONTEXT = PROVIDER === "claude" || Deno.env.get("AI_ALLOW_PERSONAL_CONTEXT") === "true";
const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") || "40");

const INCIDENT_TYPES = ["Theft", "Fight", "Disturbance", "Harassment", "Suspicious Activity", "Property Damage", "Fire", "Accident", "Other"];
const AREAS = ["Sitio Ibabaw", "Drilling", "Bulok-bulok", "Centro", "Gawad Kalinga", "Lawm Tabay", "Bakhaw", "Cajocson"];
const HELPDESK_CATEGORIES = ["Garbage Collection", "Drainage/Flooding", "Streetlight", "Road or Pathway Damage", "Water Supply", "Stray Animals", "Public Cleanliness", "Barangay Service Complaint", "Request for Assistance", "Suggestion", "Other"];
const LANGUAGES: Record<string, string> = { ceb: "Cebuano (Bisaya)", fil: "Filipino (Tagalog)", en: "English" };

const clip = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

type ChatMessage = { role: "user" | "assistant"; content: string };

function callModel(system: string, messages: ChatMessage[], maxTokens: number) {
  return PROVIDER === "gemini" ? callGemini(system, messages, maxTokens) : callClaude(system, messages, maxTokens);
}

async function callGemini(system: string, messages: ChatMessage[], maxTokens: number) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
      // Extra room because newer Flash models count their thinking toward this limit.
      generationConfig: { maxOutputTokens: maxTokens + 2048, responseMimeType: "application/json" },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Gemini API error", response.status, result?.error?.message);
    throw new Error(response.status === 429 || response.status === 503 ? "AI_BUSY" : "AI_FAILED");
  }
  const parts = result?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part: { text?: string; thought?: boolean }) => typeof part.text === "string" && !part.thought)
    .map((part: { text: string }) => part.text)
    .join("")
    .trim();
}

async function callClaude(system: string, messages: ChatMessage[], maxTokens: number) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Claude API error", response.status, result?.error?.message);
    throw new Error(response.status === 429 || response.status === 529 ? "AI_BUSY" : "AI_FAILED");
  }
  return (result?.content || [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("")
    .trim();
}

// The model is asked for JSON; this pulls the first JSON object out of the text.
function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return reply({ error: "Please log in to use the SmartBRGY Assistant." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: callerData, error: callerError } = await caller.auth.getUser();
    if (callerError || !callerData.user) return reply({ error: "Your session has expired. Please log in again." }, 401);
    const userId = callerData.user.id;

    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: profile } = await service.from("profiles").select("full_name,purok,role,is_banned").eq("id", userId).maybeSingle();
    if (!profile || profile.is_banned) return reply({ error: "This account cannot use the assistant." }, 403);

    const body = await request.json().catch(() => ({}));
    const mode = String(body?.mode || "chat");
    if (!["chat", "report_assist", "translate"].includes(mode)) return reply({ error: "Unknown assistant mode." }, 400);

    const { data: allowed, error: quotaError } = await service.rpc("ai_consume_quota", { p_user_id: userId, p_daily_limit: DAILY_LIMIT });
    if (quotaError) throw quotaError;
    if (!allowed) {
      return reply({ error: `You have reached today's limit of ${DAILY_LIMIT} assistant requests. Please try again tomorrow or use the Help Desk.` }, 429);
    }

    if (mode === "translate") {
      const text = clip(body?.text, 4000);
      const target = LANGUAGES[String(body?.language || "ceb")] ? String(body.language) : "ceb";
      if (!text) return reply({ error: "Nothing to translate." }, 400);
      const system = `You translate official announcements of Barangay Tubod, Toledo City, Cebu, Philippines for residents.
Translate into ${LANGUAGES[target]}. Keep names, dates, times, places, phone numbers and amounts exactly as written.
Use simple, respectful wording that ordinary residents and elderly people understand.
Respond with JSON only: {"translation": "...", "summary": "one or two short sentences in ${LANGUAGES[target]}"}`;
      const output = await callModel(system, [{ role: "user", content: text }], 1500);
      const parsed = parseJson(output);
      return reply({
        translation: clip(parsed?.translation ?? output, 6000),
        summary: clip(parsed?.summary, 600),
        language: target,
      });
    }

    if (mode === "report_assist") {
      const text = clip(body?.text, 2000);
      if (text.length < 5) return reply({ error: "Describe what happened in a few words first." }, 400);
      const system = `You help residents of Barangay Tubod, Toledo City write clear incident reports for barangay officials.
The resident may write in Cebuano, Filipino, English or a mix. Do not invent facts that are not in their description.
Respond with JSON only, using exactly these keys:
{
  "incident_type": one of ${JSON.stringify(INCIDENT_TYPES)},
  "other_type": short label if incident_type is "Other", else "",
  "urgency": "low" | "medium" | "high"  (high = someone hurt, in danger, fire, ongoing violence),
  "area": one of ${JSON.stringify(AREAS)} if clearly mentioned, else "",
  "landmark": specific place mentioned (street, store, chapel), else "",
  "persons_involved": people described, else "",
  "details": a clear, factual 2-5 sentence report written in the same language the resident used,
  "emergency": true if anyone is in immediate danger right now,
  "missing": list of short questions about important details that are missing (max 3)
}`;
      const output = await callModel(system, [{ role: "user", content: text }], 900);
      const parsed = parseJson(output);
      if (!parsed) return reply({ error: "The assistant could not prepare a draft. Please fill in the form manually." }, 502);
      const incidentType = INCIDENT_TYPES.includes(String(parsed.incident_type)) ? String(parsed.incident_type) : "Other";
      return reply({
        incident_type: incidentType,
        other_type: incidentType === "Other" ? clip(parsed.other_type, 80) : "",
        urgency: ["low", "medium", "high"].includes(String(parsed.urgency)) ? String(parsed.urgency) : "medium",
        area: AREAS.includes(String(parsed.area)) ? String(parsed.area) : "",
        landmark: clip(parsed.landmark, 200),
        persons_involved: clip(parsed.persons_involved, 300),
        details: clip(parsed.details, 2000),
        emergency: parsed.emergency === true,
        missing: Array.isArray(parsed.missing) ? parsed.missing.slice(0, 3).map((item) => clip(item, 160)) : [],
      });
    }

    // mode === "chat"
    const history = Array.isArray(body?.messages) ? body.messages.slice(-12) : [];
    const messages = history
      .map((message: { role?: string; content?: string }) => ({
        role: message?.role === "assistant" ? "assistant" as const : "user" as const,
        content: clip(message?.content, 1500),
      }))
      .filter((message: { content: string }) => message.content);
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return reply({ error: "Type a question for the assistant." }, 400);
    }

    const none = Promise.resolve({ data: [] as Record<string, unknown>[] });
    const [documentTypes, announcements, requests, reports, concerns] = await Promise.all([
      service.from("document_types").select("name,fee,requirements,instructions").eq("is_active", true).order("name"),
      service.from("announcements").select("title,announcement_type,message,event_date,event_time,location,contact_person,contact_number,priority,created_at").order("created_at", { ascending: false }).limit(8),
      SHARE_PERSONAL_CONTEXT ? service.from("document_requests").select("status,copies,created_at,admin_note,document_types(name)").eq("resident_id", userId).order("created_at", { ascending: false }).limit(10) : none,
      SHARE_PERSONAL_CONTEXT ? service.from("incident_reports").select("reference_number,incident_type,status,created_at,scheduled_meeting_date,scheduled_meeting_time,meeting_venue").eq("resident_id", userId).order("created_at", { ascending: false }).limit(5) : none,
      SHARE_PERSONAL_CONTEXT ? service.from("concerns").select("ticket_number,category,status,updated_at").eq("resident_id", userId).order("updated_at", { ascending: false }).limit(5) : none,
    ]);

    const context = {
      resident: SHARE_PERSONAL_CONTEXT ? { first_name: String(profile.full_name || "").split(/\s+/)[0] || "Resident", purok: profile.purok || null } : { first_name: "Resident" },
      personal_records_available: SHARE_PERSONAL_CONTEXT,
      today: new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric", weekday: "long" }),
      documents_offered: (documentTypes.data || []).map((item) => ({ name: item.name, fee_php: Number(item.fee), requirements: item.requirements, instructions: item.instructions })),
      recent_announcements: (announcements.data || []).map((item) => ({ ...item, message: clip(item.message, 700) })),
      my_document_requests: (requests.data || []).map((item) => ({ document: (item.document_types as { name?: string } | null)?.name, status: item.status, copies: item.copies, requested: item.created_at, barangay_note: item.admin_note })),
      my_incident_reports: reports.data || [],
      my_help_desk_tickets: concerns.data || [],
    };

    const system = `You are the SmartBRGY Assistant, the official helper inside the SmartBRGY resident app of Barangay Tubod, Toledo City, Cebu, Philippines.

How to answer:
- Reply in the language the resident uses (Cebuano/Bisaya, Filipino/Tagalog, English, or a mix). Be warm, short and clear: at most 6 sentences or a short list.
- Use ONLY the barangay data below for fees, requirements, schedules, statuses and announcements. Never invent fees, office hours, phone numbers, officials' names or requirements. If something is not in the data, say you are not sure and suggest the Help Desk or visiting the Barangay Tubod hall.
- In the app, residents request documents in the "Documents" tab, report incidents in the "Report" tab, and talk to barangay staff in the "Help Desk" tab. Payment is collected upon pickup at the barangay office.
- You cannot change records, approve requests, or schedule meetings. Only barangay officials can.
- If someone is in immediate danger (fire, violence, medical emergency), tell them to call the national emergency hotline 911 right away, then report in the app.
- If the resident needs a barangay official to act on a community problem (garbage, flooding, streetlight, water, road, animals, complaints, assistance), offer a Help Desk handoff.
- If personal_records_available is false, you cannot see the resident's own requests: for status questions, tell them to check the Documents tab (document requests), Report tab and Notifications (incident reports), or Help Desk tab (concerns).
- Do not give legal advice; for disputes, explain they can report it and request a barangay meeting in the Report tab.

Respond with JSON only:
{"reply": "your message to the resident",
 "handoff": null or {"category": one of ${JSON.stringify(HELPDESK_CATEGORIES)}, "details": "a short summary of the concern, in the resident's language"},
 "emergency": true or false}

Barangay data (JSON):
${JSON.stringify(context)}`;

    const output = await callModel(system, messages, 800);
    const parsed = parseJson(output);
    const handoff = parsed?.handoff && typeof parsed.handoff === "object" ? parsed.handoff as Record<string, unknown> : null;
    return reply({
      reply: clip(parsed?.reply ?? output, 3000) || "Pasensya, I could not answer that. Please try again or use the Help Desk.",
      handoff: handoff
        ? {
          category: HELPDESK_CATEGORIES.includes(String(handoff.category)) ? String(handoff.category) : "Request for Assistance",
          details: clip(handoff.details, 2000),
        }
        : null,
      emergency: parsed?.emergency === true,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "AI_NOT_CONFIGURED") return reply({ error: "The assistant is not set up yet. Please contact the barangay administrator." }, 503);
    if (code === "AI_BUSY") return reply({ error: "The assistant is busy right now. Please try again in a minute." }, 503);
    console.error("ai-assistant failure", error);
    return reply({ error: "The assistant is temporarily unavailable. Please try again or use the Help Desk." }, 500);
  }
});
