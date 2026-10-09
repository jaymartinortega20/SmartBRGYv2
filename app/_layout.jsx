import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { registerSupabaseAuthLifecycle } from "../lib/supabase";
import {
  claimNotificationResponse,
  configureNotificationChannel,
  getNotificationTarget,
  markNotificationRead,
  queueNotificationTarget,
} from "../lib/pushNotifications";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export default function RootLayout() {
  useEffect(() => {
    registerSupabaseAuthLifecycle();
    if (Platform.OS === "web") return undefined;
    configureNotificationChannel().catch(() => {});

    // Each tapped notification is handled once: mark it read, then let the
    // signed-in tab layout open its screen.
    const openResponse = async (response) => {
      if (!response || !(await claimNotificationResponse(response))) return;
      const data = response.notification?.request?.content?.data || {};
      markNotificationRead(data.notificationId);
      queueNotificationTarget(getNotificationTarget(response) || "/notifications");
    };
    Notifications.getLastNotificationResponseAsync().then(openResponse).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor="#f7faf7" translucent={false} />
      <Stack screenOptions={{ headerShown: false, animation: "fade_from_bottom" }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="forgotPassword" options={{ presentation: "card" }} />
        <Stack.Screen name="reset-password" options={{ presentation: "card" }} />
        <Stack.Screen name="settings" options={{ presentation: "card" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
