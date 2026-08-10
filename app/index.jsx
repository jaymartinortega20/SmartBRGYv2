import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

import { getValidatedAppUser } from "../lib/supabase";

export default function LandingPage() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const [checking, setChecking] = useState(true);
  const compact = height < 680 || width < 360;

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const account = await getValidatedAppUser();
        if (!active) return;

        if (!account) {
          setChecking(false);
          return;
        }

        if (account.profile.role === "admin") {
          router.replace("/admin");
          return;
        }

        const onboarded = await AsyncStorage.getItem("hasOnboarded");
        if (active) {
          router.replace(onboarded === "true" ? "/(tabs)" : "/onboarding");
        }
      } catch (error) {
        console.warn("Unable to restore the saved session:", error?.message);
        if (active) setChecking(false);
      }
    }
    restoreSession();
    return () => { active = false; };
  }, [router]);

  return (
    <ImageBackground source={require("../assets/images/background-bg.jpg")} style={styles.bg}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          <View style={styles.official}><Ionicons name="shield-checkmark" size={15} color="#2e7d32" /><Text style={styles.officialText}>OFFICIAL BARANGAY TUBOD RESIDENT APP</Text></View>
          <Image source={require("../assets/images/logo.png")} style={[styles.logo, compact && styles.logoCompact]} resizeMode="contain" />
          <Text style={[styles.title, compact && styles.titleCompact]}>SmartBRGY</Text>
          <Text style={styles.subtitle}>Barangay services made accessible, organized, and secure for every verified resident.</Text>
        </View>
        <View style={styles.services}>
          <Service icon="megaphone-outline" text="Barangay announcements" />
          <Service icon="document-text-outline" text="Document requests" />
          <Service icon="shield-outline" text="Incident reporting" />
          <Service icon="chatbubbles-outline" text="Help Desk support" />
        </View>
        <View style={styles.bottom}>
          {checking ? <ActivityIndicator color="#2e7d32" size="large" /> :
            <>
              <TouchableOpacity activeOpacity={0.85} onPress={() => router.push("/welcome")}>
                <LinearGradient colors={["#257438", "#3b984c", "#d89b18"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
                  <Text style={styles.buttonText}>Get Started</Text><Ionicons name="arrow-forward" size={20} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.bottomText}>For residents of Barangay Tubod, Toledo City</Text>
            </>}
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

function Service({ icon, text }) { return <View style={styles.service}><View style={styles.serviceIcon}><Ionicons name={icon} size={18} color="#2e7d32" /></View><Text style={styles.serviceText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  bg: { flex: 1 }, safe: { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center", paddingHorizontal: 18 },
  top: { flex: 1.2, alignItems: "center", justifyContent: "flex-end" }, official: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "#dce7de" }, officialText: { color: "#527057", fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  logo: { width: 185, height: 185, marginTop: 5, marginBottom: -15 }, logoCompact: { width: 145, height: 145 }, title: { color: "#246e31", fontSize: 34, fontWeight: "900" }, titleCompact: { fontSize: 29 }, subtitle: { maxWidth: 330, color: "#5f6e62", marginTop: 7, textAlign: "center", fontSize: 11, lineHeight: 17 },
  services: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, paddingVertical: 18 }, service: { width: "48.6%", minHeight: 49, flexDirection: "row", alignItems: "center", gap: 8, padding: 9, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "#e0e8e1" }, serviceIcon: { width: 31, height: 31, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#eaf6ec" }, serviceText: { flex: 1, color: "#516056", fontSize: 8, lineHeight: 11, fontWeight: "800" },
  bottom: { minHeight: 115, justifyContent: "flex-start", paddingBottom: 18 }, button: { height: 55, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 16, elevation: 5 }, buttonText: { color: "#fff", fontSize: 14, fontWeight: "900" }, bottomText: { color: "#6f7a72", marginTop: 10, textAlign: "center", fontSize: 8 },
});
