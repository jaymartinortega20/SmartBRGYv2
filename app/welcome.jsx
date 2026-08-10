import React from "react";
import {
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

export default function Welcome() {
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const compact = height < 700 || width < 360;

  return (
    <ImageBackground
      source={require("../assets/images/background-bg.jpg")}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.screen,
            compact && styles.screenCompact,
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace("/")}
            accessibilityRole="button"
            accessibilityLabel="Back to SmartBRGY welcome page"
          >
            <Ionicons name="arrow-back" size={22} color="#246e31" />
          </TouchableOpacity>

          <View style={styles.brandSection}>
            <View style={styles.officialBadge}>
              <Ionicons name="shield-checkmark" size={15} color="#2e7d32" />
              <Text style={styles.officialText}>OFFICIAL RESIDENT PORTAL</Text>
            </View>

            <Image
              source={require("../assets/images/logo.png")}
              style={[styles.logo, compact && styles.logoCompact]}
              resizeMode="contain"
            />

            <Text style={[styles.title, compact && styles.titleCompact]}>
              Welcome to SmartBRGY
            </Text>
            <Text style={styles.subtitle}>
              Access official services and updates from Barangay Tubod,
              Toledo City.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Continue to your account</Text>
            <Text style={styles.cardSubtitle}>
              Sign in as an existing resident or create a verified account.
            </Text>

            <TouchableOpacity
              style={styles.actionButton}
              activeOpacity={0.86}
              onPress={() => router.navigate("/login")}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={["#257438", "#43a047", "#d89b18"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryGradient}
              >
                <View style={styles.primaryIcon}>
                  <Ionicons name="log-in-outline" size={21} color="#fff" />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={styles.primaryTitle}>LOGIN</Text>
                  <Text style={styles.primaryDescription}>
                    I already have a resident account
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              style={styles.registerButton}
              activeOpacity={0.82}
              onPress={() => router.navigate("/signup")}
              accessibilityRole="button"
            >
              <View style={styles.registerIcon}>
                <Ionicons name="person-add-outline" size={21} color="#2e7d32" />
              </View>
              <View style={styles.actionCopy}>
                <Text style={styles.registerTitle}>REGISTER</Text>
                <Text style={styles.registerDescription}>
                  Create a verified Barangay Tubod account
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#2e7d32" />
            </TouchableOpacity>

            <View style={styles.residentNotice}>
              <Ionicons name="location-outline" size={19} color="#9a6810" />
              <Text style={styles.noticeText}>
                Registration is intended for Barangay Tubod residents. A valid
                ID is required to verify resident information.
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Ionicons name="lock-closed-outline" size={14} color="#667268" />
            <Text style={styles.footerText}>
              Your account information is protected and used only for
              barangay services.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  screen: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 62,
    paddingBottom: 24,
  },
  screenCompact: { justifyContent: "flex-start", paddingTop: 58 },
  backButton: {
    position: "absolute",
    top: 12,
    left: 20,
    zIndex: 2,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 14,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  brandSection: { alignItems: "center", marginBottom: 17 },
  officialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "#dce7de",
    borderRadius: 20,
  },
  officialText: {
    color: "#527057",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  logo: { width: 135, height: 135, marginTop: 2, marginBottom: -8 },
  logoCompact: { width: 110, height: 110 },
  title: {
    color: "#216b30",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  titleCompact: { fontSize: 24 },
  subtitle: {
    maxWidth: 355,
    color: "#5f6e62",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 22,
    elevation: 7,
    shadowColor: "#153c1c",
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  cardTitle: {
    color: "#1b291e",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  cardSubtitle: {
    color: "#6a746c",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 5,
    marginBottom: 16,
  },
  actionButton: { width: "100%", borderRadius: 15, overflow: "hidden" },
  primaryGradient: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
  },
  primaryIcon: {
    width: 39,
    height: 39,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.17)",
    borderRadius: 12,
  },
  actionCopy: { flex: 1 },
  primaryTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  primaryDescription: { color: "rgba(255,255,255,0.85)", fontSize: 9, marginTop: 2 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 13 },
  divider: { flex: 1, height: 1, backgroundColor: "#e1e7e2" },
  dividerText: { color: "#9aa19c", fontSize: 9, fontWeight: "800" },
  registerButton: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
    backgroundColor: "#f4faf5",
    borderWidth: 1.5,
    borderColor: "#79ad80",
    borderRadius: 15,
  },
  registerIcon: {
    width: 39,
    height: 39,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5f3e7",
    borderRadius: 12,
  },
  registerTitle: { color: "#2e7d32", fontSize: 14, fontWeight: "900" },
  registerDescription: { color: "#667268", fontSize: 9, marginTop: 2 },
  residentNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    marginTop: 16,
    padding: 12,
    backgroundColor: "#fff8e7",
    borderRadius: 12,
  },
  noticeText: { flex: 1, color: "#6f592d", fontSize: 10, lineHeight: 15 },
  footer: {
    maxWidth: 390,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 15,
    paddingHorizontal: 10,
  },
  footerText: {
    flexShrink: 1,
    color: "#667268",
    fontSize: 9,
    lineHeight: 14,
    textAlign: "center",
  },
});