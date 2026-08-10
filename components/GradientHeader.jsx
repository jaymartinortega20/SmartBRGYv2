import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

export default function GradientHeader({ title, subtitle, rightIcon, onRightPress }) {
  const router = useRouter();
  const handleRight = onRightPress || (() => router.push("/profile"));

  return (
    <LinearGradient
      colors={["#1f6e31", "#2e8b3f", "#d89a17"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.header}
    >
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>SMARTBRGY · BARANGAY TUBOD</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <TouchableOpacity style={styles.action} onPress={handleRight} activeOpacity={0.8}>
        {rightIcon ? <Ionicons name={rightIcon} size={22} color="#fff" /> :
          <Image source={require("../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />}
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 9,
    elevation: 5,
    shadowColor: "#16371d",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 7,
  },
  copy: { flex: 1, minWidth: 0, paddingRight: 10 },
  eyebrow: { color: "#dff2e2", fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  title: { color: "#fff", marginTop: 3, fontSize: 18, fontWeight: "900" },
  subtitle: { color: "#eef7ef", marginTop: 2, fontSize: 8 },
  action: {
    width: 43,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  logo: { width: 39, height: 39 },
});
