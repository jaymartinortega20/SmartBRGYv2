import { FunctionsHttpError } from "@supabase/supabase-js";

import { isNetworkError, supabase } from "./supabase";

// Calls the ai-assistant Edge Function. The Claude API key stays on the
// server; the app only sends the resident's signed-in session.
export async function callAssistant(payload) {
  const { data, error } = await supabase.functions.invoke("ai-assistant", { body: payload });
  if (error) {
    let message = data?.error;
    if (error instanceof FunctionsHttpError) {
      try {
        const details = await error.context.json();
        message = details?.error || message;
      } catch {
        // Response was not JSON.
      }
    }
    if (!message && isNetworkError(error)) message = "No internet connection. Please try again when you are online.";
    throw new Error(message || "The assistant is temporarily unavailable. Please try again.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const askAssistant = (messages) => callAssistant({ mode: "chat", messages });
export const draftIncidentReport = (text) => callAssistant({ mode: "report_assist", text });
export const translateAnnouncement = (text, language) => callAssistant({ mode: "translate", text, language });
