import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";

import { supabase } from "../lib/supabase";
import {
  disablePushNotificationsAsync,
  getPushMode,
  getPushPreference,
  registerForPushNotificationsAsync,
} from "../lib/pushNotifications";

export default function Settings() {
  const router = useRouter();
  const [user, setUser] = useState({});
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushMode, setPushMode] = useState("off");
  const [loading, setLoading] = useState(true);
  const [updatingPush, setUpdatingPush] = useState(false);

  useFocusEffect(useCallback(() => {
    Promise.all([AsyncStorage.getItem("currentUser"), getPushPreference(), getPushMode()]).then(([stored, enabled, mode]) => {
      setUser(stored ? JSON.parse(stored) : {});
      setPushEnabled(enabled);
      setPushMode(mode);
      setLoading(false);
    });
  }, []));

  async function togglePush(nextValue) {
    if (updatingPush) return;
    setUpdatingPush(true);
    try {
      if (nextValue) {
        const registration = await registerForPushNotificationsAsync();
        setPushEnabled(true);
        setPushMode(registration.mode);
        Alert.alert(
          "Notifications enabled",
          registration.mode === "push"
            ? "Background push alerts are active on this device."
            : `${registration.reason}\n\nYou will still receive notification-center updates and local alerts while SmartBRGY is running.`
        );
      } else {
        await disablePushNotificationsAsync();
        setPushEnabled(false);
        setPushMode("off");
      }
    } catch (error) {
      setPushEnabled(false);
      Alert.alert("Unable to update notifications", error.message || "Please try again.");
    } finally {
      setUpdatingPush(false);
    }
  }

  function sendPasswordReset() {
    if (!user.email) return Alert.alert("Email unavailable", "Your account email could not be loaded.");
    Alert.alert("Reset password", `Send a secure password reset link to ${user.email}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Send link", onPress: async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(user.email);
        Alert.alert(error ? "Unable to send link" : "Reset link sent", error?.message || "Check your email for the password reset link.");
      } },
    ]);
  }

  function signOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out of SmartBRGY?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: async () => {
        try { await disablePushNotificationsAsync(); } catch {}
        await supabase.auth.signOut();
        await AsyncStorage.multiRemove(["currentUser", "isAdmin", "hasOnboarded"]);
        router.replace("/login");
      } },
    ]);
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color="#2e7d32" /></View>;

  return (
    <ImageBackground source={require("../assets/images/background-bg.jpg")} style={styles.bg}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
          <View style={styles.headerCopy}><Text style={styles.headerEyebrow}>SMARTBRGY ACCOUNT</Text><Text style={styles.headerTitle}>Settings</Text></View>
          <View style={styles.headerIcon}><Ionicons name="settings" size={22} color="#fff" /></View>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.accountCard}>
            <View style={styles.accountAvatar}><Text style={styles.accountLetter}>{(user.name || "R").charAt(0).toUpperCase()}</Text></View>
            <View style={styles.accountCopy}><Text style={styles.accountName}>{user.name || "Registered Resident"}</Text><Text style={styles.accountEmail}>{user.email || "SmartBRGY account"}</Text></View>
            <Ionicons name="shield-checkmark" size={22} color="#2e7d32" />
          </View>

          <Section title="Notifications">
            <View style={styles.toggleRow}>
              <View style={styles.rowIcon}><Ionicons name="notifications-outline" size={20} color="#2e7d32" /></View>
              <View style={styles.rowCopy}><Text style={styles.rowTitle}>Push notifications</Text><Text style={styles.rowHint}>Alerts for document status, reports, meetings, help desk replies, and announcements—even when the app is closed.</Text></View>
              {updatingPush ? <ActivityIndicator color="#2e7d32" /> : <Switch value={pushEnabled} onValueChange={togglePush} disabled={Platform.OS === "web"} trackColor={{ false: "#cdd5ce", true: "#8bc490" }} thumbColor={pushEnabled ? "#2e7d32" : "#f7f7f7"} />}
            </View>
            <Text style={styles.permissionNote}>{Platform.OS === "web" ? "Notification alerts are configured from the Android or iOS app." : pushMode === "push" ? "Background push is active for this installed build." : pushEnabled ? "In-app/local alerts are active. Install an EAS build to receive alerts while the app is closed." : "Enable alerts to receive barangay updates on this device."}</Text>
          </Section>

          <Section title="Account & Security">
            <SettingRow icon="person-outline" title="Edit resident profile" subtitle="Correct your contact details or profile photo" onPress={() => router.push("/profile/edit-profile")} />
            <SettingRow icon="key-outline" title="Change password" subtitle="Send a secure reset link to your email" onPress={sendPasswordReset} />
          </Section>

          <Section title="Support & Information">
            <SettingRow icon="headset-outline" title="Barangay Help Desk" subtitle="Start or continue a barangay concern" onPress={() => router.navigate("/feedback")} />
            <SettingRow icon="document-lock-outline" title="Privacy and data use" subtitle="Your information is used only for authorized barangay services" onPress={() => Alert.alert("Privacy and data use", "SmartBRGY stores your verified resident details, service requests, and attachments in the barangay's secured Supabase project. Only authorized accounts should be granted access.")} />
            <SettingRow icon="information-circle-outline" title="About SmartBRGY" subtitle={`Version ${Constants.expoConfig?.version || "2.0.0"} · Barangay Tubod, Toledo City`} onPress={() => Alert.alert("SmartBRGY", "Official resident service application for Barangay Tubod, Toledo City.")} last />
          </Section>

          <TouchableOpacity style={styles.systemSettings} onPress={() => Platform.OS !== "web" && Linking.openSettings()}>
            <Ionicons name="phone-portrait-outline" size={20} color="#4f6153" />
            <Text style={styles.systemSettingsText}>Open phone notification settings</Text>
            <Ionicons name="open-outline" size={17} color="#7c887e" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.logout} onPress={signOut}><Ionicons name="log-out-outline" size={21} color="#b52e2e" /><Text style={styles.logoutText}>Sign out</Text></TouchableOpacity>
          <Text style={styles.footer}>SmartBRGY · Barangay Tubod Administration</Text>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function Section({ title, children }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.sectionCard}>{children}</View></View>;
}
function SettingRow({ icon, title, subtitle, onPress, last }) {
  return <TouchableOpacity style={[styles.settingRow, last && styles.last]} onPress={onPress} activeOpacity={0.75}><View style={styles.rowIcon}><Ionicons name={icon} size={20} color="#2e7d32" /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowHint}>{subtitle}</Text></View><Ionicons name="chevron-forward" size={19} color="#929c94" /></TouchableOpacity>;
}

const styles = StyleSheet.create({
  bg: { flex: 1 }, safe: { flex: 1 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f2f6f2" },
  header: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: "#246f32", elevation: 5 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "rgba(255,255,255,0.14)" },
  headerCopy: { flex: 1 }, headerEyebrow: { color: "#cfe8d2", fontSize: 7, fontWeight: "900", letterSpacing: 1 }, headerTitle: { color: "#fff", marginTop: 3, fontSize: 20, fontWeight: "900" },
  headerIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "rgba(255,255,255,0.14)" },
  content: { padding: 16, paddingBottom: 38 },
  accountCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 15, marginBottom: 17, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dce7de", elevation: 3 },
  accountAvatar: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#2e7d32" }, accountLetter: { color: "#fff", fontSize: 18, fontWeight: "900" },
  accountCopy: { flex: 1 }, accountName: { color: "#27372b", fontSize: 13, fontWeight: "900" }, accountEmail: { color: "#7c867e", marginTop: 3, fontSize: 9 },
  section: { marginBottom: 17 }, sectionTitle: { color: "#47604c", marginLeft: 4, marginBottom: 7, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  sectionCard: { overflow: "hidden", borderRadius: 17, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 2 },
  settingRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#edf1ed" },
  toggleRow: { minHeight: 80, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, paddingTop: 12 },
  last: { borderBottomWidth: 0 }, rowIcon: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#eaf6ec" },
  rowCopy: { flex: 1, minWidth: 0 }, rowTitle: { color: "#2c3b30", fontSize: 11, fontWeight: "900" }, rowHint: { color: "#7f8981", marginTop: 3, fontSize: 8, lineHeight: 12 },
  permissionNote: { color: "#7a847c", paddingHorizontal: 14, paddingBottom: 12, fontSize: 8, lineHeight: 12 },
  systemSettings: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, marginBottom: 11, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.93)", borderWidth: 1, borderColor: "#dfe7df" },
  systemSettingsText: { flex: 1, color: "#4f6153", fontSize: 10, fontWeight: "800" },
  logout: { height: 51, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 15, backgroundColor: "#fff3f3", borderWidth: 1, borderColor: "#eccaca" },
  logoutText: { color: "#b52e2e", fontSize: 12, fontWeight: "900" }, footer: { color: "#7f8981", marginTop: 17, textAlign: "center", fontSize: 8 },
});
