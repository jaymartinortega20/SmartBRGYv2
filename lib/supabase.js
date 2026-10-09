import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import { createClient, processLock } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabasePublishableKey
);

const webStorage = {
  getItem: (key) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: (key, value) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  },
};

const authStorage = Platform.OS === "web" ? webStorage : AsyncStorage;

if (!isSupabaseConfigured) {
  console.warn(
    "Supabase is not configured. Copy .env.example to .env and add your project values."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabasePublishableKey || "placeholder-publishable-key",
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  }
);

export const clearLocalAuthState = async () => {
  await AsyncStorage.multiRemove(["currentUser", "isAdmin"]);
};

// Network problems (no signal, timeouts, server unreachable) must not be
// treated as "the session is invalid", otherwise residents with weak signal
// are logged out every time they open the app.
export const isNetworkError = (error) => {
  if (!error) return false;
  const name = String(error.name || "");
  const message = String(error.message || "").toLowerCase();
  return (
    name === "AuthRetryableFetchError" ||
    name === "TypeError" ||
    error.status === 0 ||
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("network error") ||
    message.includes("timeout")
  );
};

// Signs out locally and stops push alerts for this device so the next person
// who logs in on the same phone never receives the previous resident's alerts.
const forceLocalSignOut = async () => {
  try {
    const { disablePushNotificationsLocally } = require("./pushNotifications");
    await disablePushNotificationsLocally();
  } catch {
    // Push cleanup is best-effort.
  }
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  await clearLocalAuthState();
};

const readCachedProfile = async () => {
  try {
    const stored = await AsyncStorage.getItem("currentUser");
    const parsed = stored ? JSON.parse(stored) : null;
    if (!parsed?.id) return null;
    return { role: parsed.role || "resident", is_banned: false };
  } catch {
    return null;
  }
};

// A stored session is not enough to enter the app. Confirm that the token is
// still valid and that its resident/admin profile still exists and is allowed.
// When the phone is offline, the saved session is trusted until the app can
// reach Supabase again.
export const getValidatedAppUser = async () => {
  if (!isSupabaseConfigured) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError && isNetworkError(userError)) {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData?.session?.user;
    if (!sessionUser) return null;
    const cachedProfile = await readCachedProfile();
    return { user: sessionUser, profile: cachedProfile || { role: "resident", is_banned: false }, offline: true };
  }

  if (userError || !userData.user) {
    await forceLocalSignOut();
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_banned")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError && isNetworkError(profileError)) {
    const cachedProfile = await readCachedProfile();
    return { user: userData.user, profile: cachedProfile || { role: "resident", is_banned: false }, offline: true };
  }

  if (profileError || !profile || profile.is_banned) {
    await forceLocalSignOut();
    return null;
  }

  return { user: userData.user, profile };
};

// The signed-in user's id, taken from the auth session rather than from
// AsyncStorage (which can be empty after a session restore).
export const getCurrentUserId = async () => {
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user?.id) return data.session.user.id;
  const { data: userData } = await supabase.auth.getUser();
  return userData?.user?.id || null;
};

let authLifecycleRegistered = false;

export const registerSupabaseAuthLifecycle = () => {
  if (authLifecycleRegistered) return;
  authLifecycleRegistered = true;

  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
};
