import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const allowedAreas = new Set(["Sitio Ibabaw", "Drilling", "Bulok-bulok", "Centro", "Gawad Kalinga", "Lawm Tabay", "Bakhaw", "Cajocson"]);
const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  let createdUserId = "";
  try {
    const form = await request.formData();
    const fullName = String(form.get("full_name") || "").trim();
    const birthdate = String(form.get("birthdate") || "");
    const address = String(form.get("address") || "").trim();
    const purok = String(form.get("purok") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");
    const idFront = form.get("id_front");
    const idBack = form.get("id_back");

    if (fullName.split(/\s+/).length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate) || address !== "Barangay Tubod, Toledo City" || !allowedAreas.has(purok) || !/^09\d{9}$/.test(phone) || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      return respond({ error: "Invalid or incomplete registration information." }, 400);
    }
    if (!(idFront instanceof File) || !(idBack instanceof File)) return respond({ error: "Both sides of the valid ID are required." }, 400);
    for (const file of [idFront, idBack]) {
      if (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        return respond({ error: "ID attachments must be JPG, PNG, or WEBP files up to 5 MB." }, 400);
      }
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: signup, error: signupError } = await anon.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, birthdate, address, purok, phone },
        // The verification link opens the SmartBRGY app's login screen.
        // Add this URL in Supabase → Authentication → URL Configuration → Redirect URLs.
        emailRedirectTo: Deno.env.get("EMAIL_REDIRECT_URL") || "smartbrgyv2://login",
      },
    });
    if (signupError || !signup.user) throw new Error(signupError?.message || "Unable to create the resident account.");
    // With email confirmation on, Supabase returns a placeholder user (no
    // identities) instead of an error when the email is already registered.
    if (Array.isArray(signup.user.identities) && signup.user.identities.length === 0) {
      return respond({ error: "This email address is already registered. Log in or use Forgot Password." }, 409);
    }
    createdUserId = signup.user.id;

    const extension = (file: File) => file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const frontPath = `${createdUserId}/id-front-${Date.now()}.${extension(idFront)}`;
    const backPath = `${createdUserId}/id-back-${Date.now()}.${extension(idBack)}`;
    const [{ error: frontError }, { error: backError }] = await Promise.all([
      service.storage.from("resident-valid-ids").upload(frontPath, await idFront.arrayBuffer(), { contentType: idFront.type, upsert: false }),
      service.storage.from("resident-valid-ids").upload(backPath, await idBack.arrayBuffer(), { contentType: idBack.type, upsert: false }),
    ]);
    if (frontError || backError) throw new Error(frontError?.message || backError?.message || "Unable to store ID attachments.");

    const { data: updatedProfiles, error: profileError } = await service.from("profiles").update({
      full_name: fullName,
      birthdate,
      address,
      purok,
      phone,
      email,
      id_front_path: frontPath,
      id_back_path: backPath,
    }).eq("id", createdUserId).select("id");
    if (profileError) throw profileError;
    if (!updatedProfiles?.length) throw new Error("The resident profile could not be created. Please try again.");

    return respond({ success: true, emailVerificationRequired: !signup.session });
  } catch (error) {
    if (createdUserId) {
      const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      await service.auth.admin.deleteUser(createdUserId);
    }
    return respond({ error: error.message || "Registration failed." }, 400);
  }
});
