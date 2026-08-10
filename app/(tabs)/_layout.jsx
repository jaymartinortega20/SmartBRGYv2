import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getValidatedAppUser } from "../../lib/supabase";

const tabs = {
  index: ["Home", "home"],
  announcement: ["News", "megaphone"],
  documents: ["Documents", "document-text"],
  report: ["Report", "shield"],
  feedback: ["Help Desk", "chatbubbles"],
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const [authState, setAuthState] = useState("checking");
  const bottomInset = Math.max(insets.bottom, 12);

  useEffect(() => {
    let active = true;

    getValidatedAppUser()
      .then((account) => {
        if (active) setAuthState(account ? "authorized" : "guest");
      })
      .catch(() => {
        if (active) setAuthState("guest");
      });

    return () => {
      active = false;
    };
  }, []);

  if (authState === "checking") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  if (authState === "guest") {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={({ route }) => {
        const item = tabs[route.name];
        return {
          headerShown: false,
          tabBarActiveTintColor: "#2e7d32",
          tabBarInactiveTintColor: "#8a948c",
          tabBarHideOnKeyboard: true,
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "800",
            marginTop: 1,
          },
          tabBarItemStyle: {
            paddingTop: 5,
          },
          tabBarStyle: {
            height: 64 + bottomInset,
            paddingBottom: bottomInset,
            paddingTop: 4,
            backgroundColor: "#ffffff",
            borderTopWidth: 1,
            borderTopColor: "#e4ebe5",
            elevation: 16,
            shadowColor: "#18351d",
            shadowOpacity: 0.13,
            shadowOffset: { width: 0, height: -4 },
            shadowRadius: 12,
          },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={item ? (focused ? item[1] : `${item[1]}-outline`) : "ellipse-outline"}
              size={route.name === "index" ? 24 : 23}
              color={color}
            />
          ),
        };
      }}
    >
      {Object.entries(tabs).map(([name, [title]]) => (
        <Tabs.Screen key={name} name={name} options={{ title }} />
      ))}
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="notification-details" options={{ href: null }} />
      <Tabs.Screen name="report-summary" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f8f5",
  },
});
