import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "./supabase";

export const PUSH_PREFERENCE_KEY = "pushNotificationsEnabled";
export const PUSH_MODE_KEY = "notificationDeliveryMode";
const PUSH_TOKEN_KEY = "expoPushToken";

function getEasProjectId() {
  return process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    || Constants.easConfig?.projectId
    || Constants.expoConfig?.extra?.eas?.projectId
    || null;
}

function isExpoGo() {
  return Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient";
}

async function saveInAppMode(reason) {
  await AsyncStorage.multiSet([
    [PUSH_PREFERENCE_KEY, "true"],
    [PUSH_MODE_KEY, "in_app"],
  ]);
  return { mode: "in_app", reason };
}

export async function configureNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("smartbrgy-updates", {
    name: "SmartBRGY Updates",
    description: "Barangay announcements and service status updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 180, 250],
    lightColor: "#2e7d32",
    sound: "default",
  });
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === "web") {
    throw new Error("Notification alerts are configured from the Android or iOS app.");
  }

  await configureNotificationChannel();
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    status = requested.status;
  }
  if (status !== "granted") {
    throw new Error("Notification permission was not granted. Enable it in your phone settings and try again.");
  }

  const projectId = getEasProjectId();
  if (isExpoGo()) {
    return saveInAppMode("Expo Go supports in-app/local alerts only. Background push becomes available in the installed EAS build.");
  }
  if (!Device.isDevice) {
    return saveInAppMode("An Android or iOS physical device is required for background push. In-app alerts remain enabled.");
  }
  if (!projectId) {
    return saveInAppMode("The EAS project ID is not configured yet. In-app alerts remain enabled.");
  }

  try {
    const response = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = response.data;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error("Please log in again before enabling background notifications.");

    const { error } = await supabase.from("push_tokens").upsert({
      user_id: authData.user.id,
      expo_push_token: token,
      platform: Platform.OS,
      device_name: Device.deviceName || Device.modelName || "Mobile device",
      is_enabled: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id,expo_push_token" });
    if (error) throw error;

    // A phone can be shared. Turn this device's token off for every other
    // account so a previous resident's alerts never reach the new user.
    await supabase.rpc("claim_push_token", { p_token: token }).then(() => undefined, () => undefined);

    await AsyncStorage.multiSet([
      [PUSH_PREFERENCE_KEY, "true"],
      [PUSH_MODE_KEY, "push"],
      [PUSH_TOKEN_KEY, token],
    ]);
    return { mode: "push", token };
  } catch (error) {
    return saveInAppMode(error.message || "Background push registration is temporarily unavailable.");
  }
}

export async function disablePushNotificationsAsync() {
  const [token, authResult] = await Promise.all([
    AsyncStorage.getItem(PUSH_TOKEN_KEY),
    supabase.auth.getUser(),
  ]);
  if (token && authResult.data.user) {
    await supabase.from("push_tokens").update({
      is_enabled: false,
      last_seen_at: new Date().toISOString(),
    }).eq("user_id", authResult.data.user.id).eq("expo_push_token", token);
  }
  await AsyncStorage.multiRemove([PUSH_TOKEN_KEY, PUSH_MODE_KEY]);
  await AsyncStorage.setItem(PUSH_PREFERENCE_KEY, "false");
}

// Used when the session is no longer valid (expired, banned, removed). The
// server-side row is disabled when still possible; the local token is always
// forgotten so the next login registers it again for the right account.
export async function disablePushNotificationsLocally() {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (token) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user?.id) {
        await supabase.from("push_tokens").update({
          is_enabled: false,
          last_seen_at: new Date().toISOString(),
        }).eq("user_id", data.session.user.id).eq("expo_push_token", token);
      }
    } catch {
      // Best-effort only.
    }
  }
  await AsyncStorage.multiRemove([PUSH_TOKEN_KEY, PUSH_MODE_KEY]);
}

export async function getPushPreference() {
  return (await AsyncStorage.getItem(PUSH_PREFERENCE_KEY)) === "true";
}

export async function getPushMode() {
  return (await AsyncStorage.getItem(PUSH_MODE_KEY)) || "off";
}

export function normalizeAppRoute(target) {
  if (typeof target !== "string" || !target.startsWith("/")) return null;
  if (target === "/(tabs)" || target === "/(tabs)/index") return "/(tabs)";
  return target.replace(/^\/\(tabs\)/, "") || "/";
}

export function getNotificationTarget(response) {
  const data = response?.notification?.request?.content?.data || {};
  return normalizeAppRoute(data.target_path || data.targetPath || null);
}

// Where a notification can be opened in the app. Notifications that point to
// the notification list itself (for example appearance notices) have nothing
// more to open, so they return null instead of reloading the same screen.
export function getOpenableTarget(target) {
  const route = normalizeAppRoute(target);
  if (!route || route === "/notifications" || route === "/notification-details") return null;
  return route;
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) return;
  try {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("is_read", false);
  } catch {
    // Read state is refreshed the next time the list loads.
  }
}

// Keeps the phone's app-icon badge in step with unread notifications.
export async function syncBadgeCount(count) {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Number(count) || 0));
  } catch {
    // Some Android launchers do not support badges.
  }
}

// ---- Opening a tapped push notification exactly once -----------------------
// Android remembers the last tapped notification. Without this guard the app
// re-opened it on every launch, which looked like a navigation loop.
const HANDLED_RESPONSE_KEY = "lastHandledNotificationResponse";
let queuedTarget = null;
const queueListeners = new Set();

function responseKey(response) {
  const request = response?.notification?.request;
  return request ? `${request.identifier}:${response?.notification?.date || ""}` : null;
}

export async function claimNotificationResponse(response) {
  const key = responseKey(response);
  if (!key) return false;
  const handled = await AsyncStorage.getItem(HANDLED_RESPONSE_KEY);
  if (handled === key) return false;
  await AsyncStorage.setItem(HANDLED_RESPONSE_KEY, key);
  return true;
}

// The tapped notification's screen is opened by the signed-in tab layout, so
// it never races the login check on app start.
export function queueNotificationTarget(target) {
  queuedTarget = target || "/notifications";
  queueListeners.forEach((listener) => listener());
}

export function takeQueuedNotificationTarget() {
  const target = queuedTarget;
  queuedTarget = null;
  return target;
}

export function onQueuedNotificationTarget(listener) {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}
