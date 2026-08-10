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

// A stored session is not enough to enter the app. Confirm that the token is
// still valid and that its resident/admin profile still exists and is allowed.
export const getValidatedAppUser = async () => {
  if (!isSupabaseConfigured) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    await clearLocalAuthState();
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_banned")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.is_banned) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    await clearLocalAuthState();
    return null;
  }

  return { user: userData.user, profile };
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
