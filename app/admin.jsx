import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";

import { supabase } from "../lib/supabase";

const closed = new Set(["claimed", "resolved", "rejected", "closed", "cancelled"]);
const openCount = (result, fallbackRows) => (
  result?.status === "fulfilled" && !result.value.error && typeof result.value.count === "number"
    ? result.value.count
    : fallbackRows.filter((row) => !closed.has(row.status)).length
);

export default function MobileAdminDashboard() {
  const router = useRouter();
  const [adminName, setAdminName] = useState("Barangay Administrator");
  const [counts, setCounts] = useState({ residents: 0, documents: 0, reports: 0, concerns: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("full_name,role").eq("id", authData.user.id).single();
      if (profile?.role !== "admin") {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }
      setAdminName(profile.full_name || "Barangay Administrator");

      const results = await Promise.allSettled([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "resident"),
        supabase.from("document_requests").select("id,status,created_at,document_types(name),profiles(full_name)").order("created_at", { ascending: false }).limit(12),
        supabase.from("incident_reports").select("id,status,created_at,incident_type,reference_number").order("created_at", { ascending: false }).limit(12),
        supabase.from("concerns").select("id,status,created_at,category,subject,ticket_number").order("created_at", { ascending: false }).limit(12),
        // Open counts are computed by the database across all rows, not only the 12 shown.
        supabase.from("document_requests").select("id", { count: "exact", head: true }).not("status", "in", "(claimed,rejected)"),
        supabase.from("incident_reports").select("id", { count: "exact", head: true }).not("status", "in", "(resolved,rejected,closed)"),
        supabase.from("concerns").select("id", { count: "exact", head: true }).not("status", "in", "(resolved,rejected,closed)"),
      ]);
      const residents = results[0].status === "fulfilled" ? results[0].value.count || 0 : 0;
      const documents = results[1].status === "fulfilled" ? results[1].value.data || [] : [];
      const reports = results[2].status === "fulfilled" ? results[2].value.data || [] : [];
      const concerns = results[3].status === "fulfilled" ? results[3].value.data || [] : [];
      const failure = results.find((result) => result.status === "fulfilled" && result.value.error);
      if (failure?.value?.error) setError(failure.value.error.message);

      setCounts({
        residents,
        documents: openCount(results[4], documents),
        reports: openCount(results[5], reports),
        concerns: openCount(results[6], concerns),
      });
      setRecent([
        ...documents.map((row) => ({ ...row, kind: "Document", title: row.document_types?.name || "Document request", icon: "document-text", color: "#b67a05" })),
        ...reports.map((row) => ({ ...row, kind: "Incident", title: row.incident_type || row.reference_number || "Incident report", icon: "shield", color: "#b33a3a" })),
        ...concerns.map((row) => ({ ...row, kind: "Help Desk", title: row.category || row.subject || row.ticket_number || "Concern", icon: "chatbubbles", color: "#3973a8" })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10));
    } catch (loadError) {
      setError(loadError.message || "Unable to load the dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const totalActive = useMemo(() => counts.documents + counts.reports + counts.concerns, [counts]);

  function signOut() {
    Alert.alert("Sign out", "Sign out of the administrator dashboard?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: async () => {
        await supabase.auth.signOut();
        await AsyncStorage.multiRemove(["currentUser", "isAdmin"]);
        router.replace("/login");
      } },
    ]);
  }

  return (
    <ImageBackground source={require("../assets/images/background-bg.jpg")} style={styles.bg}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.shield}><Ionicons name="shield-checkmark" size={23} color="#fff" /></View>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>SMARTBRGY ADMIN</Text><Text style={styles.headerTitle}>Operations Overview</Text></View>
          <TouchableOpacity style={styles.signOut} onPress={signOut}><Ionicons name="log-out-outline" size={21} color="#fff" /></TouchableOpacity>
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#2e7d32" />}
        >
          <View style={styles.welcome}>
            <View style={{ flex: 1 }}><Text style={styles.welcomeKicker}>MOBILE CHECKING DASHBOARD</Text><Text style={styles.welcomeTitle}>Good day, {adminName.split(/\s+/)[0]}</Text><Text style={styles.welcomeText}>Monitor activity here. Use the desktop admin website for official updates, replies, and approvals.</Text></View>
            <View style={styles.activeBubble}><Text style={styles.activeNumber}>{totalActive}</Text><Text style={styles.activeLabel}>ACTIVE</Text></View>
          </View>

          {!!error && <View style={styles.error}><Ionicons name="alert-circle" size={18} color="#a52e2e" /><Text style={styles.errorText}>{error}</Text></View>}
          {loading ? <ActivityIndicator style={styles.loader} size="large" color="#2e7d32" /> :
            <>
              <Text style={styles.sectionTitle}>Barangay activity</Text>
              <View style={styles.grid}>
                <Stat icon="people" label="Residents" value={counts.residents} color="#2e7d32" />
                <Stat icon="document-text" label="Active documents" value={counts.documents} color="#b67a05" />
                <Stat icon="shield" label="Open reports" value={counts.reports} color="#b33a3a" />
                <Stat icon="chatbubbles" label="Help Desk tickets" value={counts.concerns} color="#3973a8" />
              </View>

              <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Recent activity</Text><TouchableOpacity onPress={() => load(true)}><Ionicons name="refresh" size={20} color="#2e7d32" /></TouchableOpacity></View>
              <View style={styles.list}>
                {recent.map((item) => <View key={`${item.kind}-${item.id}`} style={styles.row}><View style={[styles.rowIcon, { backgroundColor: `${item.color}16` }]}><Ionicons name={item.icon} size={20} color={item.color} /></View><View style={styles.rowCopy}><Text style={styles.rowKind}>{item.kind}</Text><Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.rowDate}>{new Date(item.created_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text></View><Status value={item.status} /></View>)}
                {!recent.length && <View style={styles.empty}><Ionicons name="file-tray-outline" size={30} color="#708074" /><Text style={styles.emptyText}>No recent activity.</Text></View>}
              </View>

              <View style={styles.desktopNote}><Ionicons name="desktop-outline" size={27} color="#2e7d32" /><View style={{ flex: 1 }}><Text style={styles.desktopTitle}>Full administration is web-based</Text><Text style={styles.desktopText}>Open the SmartBRGY Admin website on a desktop to review attachments, update statuses, reply to residents, and publish announcements.</Text></View></View>
            </>}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function Stat({ icon, label, value, color }) {
  return <View style={styles.stat}><View style={[styles.statIcon, { backgroundColor: `${color}16` }]}><Ionicons name={icon} size={22} color={color} /></View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}
function Status({ value }) {
  return <View style={styles.status}><Text style={styles.statusText}>{String(value || "pending").replaceAll("_", " ")}</Text></View>;
}

const styles = StyleSheet.create({
  bg: { flex: 1 }, safe: { flex: 1 }, header: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, padding: 13, backgroundColor: "#246f32", elevation: 5 },
  shield: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)" },
  headerCopy: { flex: 1 }, eyebrow: { color: "#cde7d0", fontSize: 7, fontWeight: "900", letterSpacing: 1 }, headerTitle: { color: "#fff", marginTop: 3, fontSize: 18, fontWeight: "900" },
  signOut: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "rgba(255,255,255,0.14)" },
  content: { padding: 16, paddingBottom: 35 }, welcome: { flexDirection: "row", alignItems: "center", gap: 12, padding: 17, marginBottom: 14, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dce7de", elevation: 3 },
  welcomeKicker: { color: "#2e7d32", fontSize: 7, fontWeight: "900", letterSpacing: 0.9 }, welcomeTitle: { color: "#24382a", marginTop: 5, fontSize: 18, fontWeight: "900" }, welcomeText: { color: "#778179", marginTop: 5, fontSize: 9, lineHeight: 14 },
  activeBubble: { width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: "#eaf6ec" }, activeNumber: { color: "#2e7d32", fontSize: 20, fontWeight: "900" }, activeLabel: { color: "#528159", fontSize: 6, fontWeight: "900" },
  error: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, marginBottom: 12, borderRadius: 13, backgroundColor: "#fff0f0", borderWidth: 1, borderColor: "#e9c8c8" }, errorText: { flex: 1, color: "#8d3333", fontSize: 9 },
  loader: { marginTop: 70 }, sectionTitle: { color: "#263d2b", marginLeft: 2, marginBottom: 9, fontSize: 14, fontWeight: "900" }, sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }, stat: { width: "48.3%", minHeight: 120, padding: 14, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#e0e8e1", elevation: 2 },
  statIcon: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderRadius: 12 }, statValue: { color: "#26372b", marginTop: 8, fontSize: 21, fontWeight: "900" }, statLabel: { color: "#7c867e", marginTop: 2, fontSize: 8, fontWeight: "700" },
  list: { overflow: "hidden", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: "#edf1ed" }, rowIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12 }, rowCopy: { flex: 1, minWidth: 0 },
  rowKind: { color: "#768178", fontSize: 7, fontWeight: "900", textTransform: "uppercase" }, rowTitle: { color: "#2f3d33", marginTop: 2, fontSize: 10, fontWeight: "900" }, rowDate: { color: "#929a94", marginTop: 3, fontSize: 7 },
  status: { maxWidth: 86, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: "#fff1c9" }, statusText: { color: "#73530f", fontSize: 7, fontWeight: "900", textTransform: "capitalize" },
  empty: { alignItems: "center", padding: 26 }, emptyText: { color: "#708074", marginTop: 7, fontSize: 9 },
  desktopNote: { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 15, marginTop: 14, borderRadius: 16, backgroundColor: "#eaf6ec", borderWidth: 1, borderColor: "#cde2d0" },
  desktopTitle: { color: "#275e2e", fontSize: 11, fontWeight: "900" }, desktopText: { color: "#637066", marginTop: 4, fontSize: 8, lineHeight: 13 },
});
