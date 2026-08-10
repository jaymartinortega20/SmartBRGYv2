import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { registerSupabaseAuthLifecycle } from "../lib/supabase";
import { configureNotificationChannel, getNotificationTarget, getPushPreference, registerForPushNotificationsAsync } from "../lib/pushNotifications";

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
  const router = useRouter();

  useEffect(() => {
    registerSupabaseAuthLifecycle();
    if (Platform.OS === "web") return undefined;
    configureNotificationChannel().catch(() => {});
    getPushPreference().then((enabled) => {
      if (enabled) registerForPushNotificationsAsync().catch(() => {});
    });

    const openResponse = (response) => {
      const target = getNotificationTarget(response);
      if (typeof target === "string" && target.startsWith("/")) {
        setTimeout(() => router.push(target), 100);
      }
    };
    Notifications.getLastNotificationResponseAsync().then((response) => response && openResponse(response));
    const subscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    return () => subscription.remove();
  }, [router]);

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
