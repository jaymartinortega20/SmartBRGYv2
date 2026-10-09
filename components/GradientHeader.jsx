import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { GRADIENT } from "../constants/theme";

// The one header used on every SmartBRGY screen.
//   onBack:   true (or a function) shows a back arrow on the left
//   actions:  [{ icon, onPress, badge, label }] buttons on the right
//   rightIcon/onRightPress: single right button (kept for older screens)
// With no actions, the right side shows the barangay logo, which opens Profile.
export default function GradientHeader({ title, subtitle, eyebrow = "SMARTBRGY · BARANGAY TUBOD", onBack, actions, rightIcon, onRightPress }) {
  const router = useRouter();

  const goBack = () => {
    if (typeof onBack === "function") return onBack();
    if (router.canGoBack()) router.back();
    else router.navigate("/(tabs)");
  };

  const rightActions = actions
    || (rightIcon ? [{ icon: rightIcon, onPress: onRightPress, label: rightIcon }] : null);

  return (
    <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
      {onBack ? (
        <TouchableOpacity style={styles.action} onPress={goBack} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      ) : null}
      <View style={[styles.copy, onBack && styles.copyWithBack]}>
        {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <View style={styles.actions}>
        {rightActions ? rightActions.map((action) => (
          <TouchableOpacity key={action.icon} style={styles.action} onPress={action.onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={action.label || action.icon}>
            <Ionicons name={action.icon} size={22} color="#fff" />
            {action.badge > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{action.badge > 9 ? "9+" : action.badge}</Text></View>
            )}
          </TouchableOpacity>
        )) : (
          <TouchableOpacity style={styles.action} onPress={() => router.navigate("/profile")} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Open profile">
            <Image source={require("../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    elevation: 5,
    shadowColor: "#16371d",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 7,
  },
  copy: { flex: 1, minWidth: 0, paddingRight: 10 },
  copyWithBack: { marginLeft: 12 },
  eyebrow: { color: "#dff2e2", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  title: { color: "#fff", marginTop: 3, fontSize: 19, fontWeight: "900" },
  subtitle: { color: "#eef7ef", marginTop: 2, fontSize: 11 },
  actions: { flexDirection: "row", gap: 8 },
  action: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  logo: { width: 39, height: 39 },
  badge: { position: "absolute", top: -5, right: -5, minWidth: 20, height: 20, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#d32f2f", borderWidth: 2, borderColor: "#fff" },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
});
