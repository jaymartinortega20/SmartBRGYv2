import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  RefreshControl,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";

import { isSupabaseConfigured, supabase } from "../../lib/supabase";

const services = [
  { title: "Announcements", subtitle: "Barangay news and alerts", icon: "megaphone", color: "#287b3b", route: "/announcement" },
  { title: "Documents", subtitle: "Request certificates", icon: "document-text", color: "#b67a05", route: "/documents" },
  { title: "Report Incident", subtitle: "Send a secure report", icon: "shield-checkmark", color: "#b33a3a", route: "/report" },
  { title: "Help Desk", subtitle: "Chat with the barangay", icon: "chatbubbles", color: "#3973a8", route: "/feedback" },
];

const inactiveCaseStatuses = new Set(["resolved", "rejected", "closed"]);
const inactiveConcernStatuses = new Set(["resolved", "closed"]);
const EMPTY_ACTIVITY = { documents: 0, reports: 0, concerns: 0 };
const normalizedStatus = (value) => String(value || "").trim().toLowerCase();

export default function ResidentHome() {
  const router = useRouter();
  const requestSequence = useRef(0);
  const { width } = useWindowDimensions();
  const [user, setUser] = useState({});
  const [latestAnnouncement, setLatestAnnouncement] = useState(null);
  const [unread, setUnread] = useState(0);
  const [activity, setActivity] = useState({ documents: 0, reports: 0, concerns: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [residentId, setResidentId] = useState(null);
  const [error, setError] = useState("");

  const compact = width < 370;
  const firstName = useMemo(() => (user.name || "Ka-Barangay").trim().split(/\s+/)[0], [user.name]);

  const resetResidentData = useCallback(() => {
    setUser({});
    setResidentId(null);
    setUnread(0);
    setLatestAnnouncement(null);
    setActivity(EMPTY_ACTIVITY);
  }, []);

  const loadHome = useCallback(async (refresh = false, silent = false) => {
    const requestId = ++requestSequence.current;
    if (refresh) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError("");
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
      const stored = await AsyncStorage.getItem("currentUser");
      let parsed = {};
      if (stored) {
        try { parsed = JSON.parse(stored); }
        catch { await AsyncStorage.removeItem("currentUser"); }
      }
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const currentResidentId = authData.user?.id;
      if (!currentResidentId) {
        resetResidentData();
        throw new Error("Your session has expired. Please log in again.");
      }

      const results = await Promise.all([
        supabase.from("profiles").select("full_name,profile_image_path,purok").eq("id", currentResidentId).single(),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", currentResidentId).eq("is_read", false),
        supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("document_requests").select("status").eq("resident_id", currentResidentId),
        supabase.from("incident_reports").select("status").eq("resident_id", currentResidentId),
        supabase.from("concerns").select("status").eq("resident_id", currentResidentId),
      ]);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      if (requestId !== requestSequence.current) return;

      const profileResult = results[0];
      let nextUser = { ...parsed, id: currentResidentId };
      if (profileResult?.data) {
        let profilePic = profileResult.data.profile_image_path || parsed.profilePic || null;
        if (profilePic && !profilePic.startsWith("http")) {
          const { data: signed, error: signedError } = await supabase.storage.from("profile-images").createSignedUrl(profilePic, 3600);
          profilePic = signedError ? parsed.profilePic || null : signed?.signedUrl || parsed.profilePic || null;
        }
        nextUser = {
          ...parsed,
          id: currentResidentId,
          name: profileResult.data.full_name || parsed.name,
          purok: profileResult.data.purok || parsed.purok,
          profilePic,
        };
      }
      if (requestId !== requestSequence.current) return;
      setUser(nextUser);
      setResidentId(currentResidentId);
      await AsyncStorage.setItem("currentUser", JSON.stringify(nextUser));

      const notificationResult = results[1];
      setUnread(notificationResult?.count || 0);
      const announcementResult = results[2];
      setLatestAnnouncement(announcementResult?.data || null);

      const documentRows = results[3].data || [];
      const reportRows = results[4].data || [];
      const concernRows = results[5].data || [];
      setActivity({
        documents: documentRows.filter((row) => !["claimed", "cancelled", "canceled", "rejected"].includes(normalizedStatus(row.status))).length,
        reports: reportRows.filter((row) => !inactiveCaseStatuses.has(normalizedStatus(row.status))).length,
        concerns: concernRows.filter((row) => !inactiveConcernStatuses.has(normalizedStatus(row.status))).length,
      });
    } catch (loadError) {
      if (requestId === requestSequence.current) setError(loadError.message || "Unable to refresh the resident dashboard.");
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [resetResidentData]);

  useFocusEffect(useCallback(() => {
    loadHome();
  }, [loadHome]));

  useEffect(() => {
    if (!residentId || !isSupabaseConfigured) return undefined;
    const refreshSilently = () => loadHome(false, true);
    const channel = supabase.channel(`resident-home-${residentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${residentId}` }, refreshSilently)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, refreshSilently)
      .on("postgres_changes", { event: "*", schema: "public", table: "document_requests", filter: `resident_id=eq.${residentId}` }, refreshSilently)
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_reports", filter: `resident_id=eq.${residentId}` }, refreshSilently)
      .on("postgres_changes", { event: "*", schema: "public", table: "concerns", filter: `resident_id=eq.${residentId}` }, refreshSilently)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadHome, residentId]);

  return (
    <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadHome(true)} tintColor="#2e7d32" />}
        >
          {!!error && (
            <TouchableOpacity style={styles.errorCard} onPress={() => loadHome(true)} activeOpacity={0.8}>
              <Ionicons name="alert-circle" size={19} color="#a63232" />
              <Text style={styles.errorText}>{error} Tap to retry.</Text>
              <Ionicons name="refresh" size={18} color="#a63232" />
            </TouchableOpacity>
          )}
          <View style={styles.topbar}>
            <TouchableOpacity style={styles.identity} onPress={() => router.push("/profile")}>
              {user.profilePic ? <Image source={{ uri: user.profilePic }} style={styles.avatar} /> :
                <View style={styles.avatarFallback}><Ionicons name="person" size={22} color="#2e7d32" /></View>}
              <View style={styles.identityText}>
                <Text style={styles.kicker}>MAAYONG ADLAW</Text>
                <Text style={styles.greeting} numberOfLines={1}>Hello, {firstName}!</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.topActions}>
              <TouchableOpacity style={styles.iconButton} onPress={() => router.push("/settings")}>
                <Ionicons name="settings-outline" size={21} color="#36543b" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={() => router.push("/notifications")}>
                <Ionicons name="notifications-outline" size={22} color="#36543b" />
                {unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text></View>}
              </TouchableOpacity>
            </View>
          </View>

          <LinearGradient colors={["#1f6f32", "#339147", "#dda11c"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroGlow} />
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>OFFICIAL RESIDENT PORTAL</Text>
              <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>Barangay Tubod</Text>
              <Text style={styles.heroLocation}><Ionicons name="location" size={13} color="#fff" /> Toledo City, Cebu</Text>
              <Text style={styles.heroMessage}>Community services, notices, and assistance in one secure place.</Text>
            </View>
            <Image source={require("../../assets/images/logo.png")} style={styles.heroLogo} resizeMode="contain" />
          </LinearGradient>

          <View style={styles.sectionHeading}>
            <View><Text style={styles.sectionTitle}>Barangay Services</Text><Text style={styles.sectionHint}>What do you need today?</Text></View>
          </View>
          <View style={styles.serviceGrid}>
            {services.map((service) => (
              <TouchableOpacity key={service.title} activeOpacity={0.82} style={styles.serviceCard} onPress={() => router.navigate(service.route)}>
                <View style={[styles.serviceIcon, { backgroundColor: `${service.color}16` }]}><Ionicons name={service.icon} size={25} color={service.color} /></View>
                <Text style={styles.serviceTitle}>{service.title}</Text>
                <Text style={styles.serviceSubtitle}>{service.subtitle}</Text>
                <Ionicons name="arrow-forward-circle" size={20} color={service.color} style={styles.serviceArrow} />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity activeOpacity={0.85} style={styles.assistantCard} onPress={() => router.navigate("/assistant")}>
            <View style={styles.assistantIcon}><Ionicons name="sparkles" size={22} color="#fff" /></View>
            <View style={styles.assistantCopy}>
              <Text style={styles.assistantTitle}>Ask the SmartBRGY Assistant</Text>
              <Text style={styles.assistantHint}>Requirements, fees, and request status — in Bisaya, Tagalog, or English</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#2e7d32" />
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Your Activity</Text>
          <View style={styles.activityCard}>
            <ActivityItem icon="document-text-outline" label="Document requests" value={activity.documents} color="#b67a05" />
            <View style={styles.divider} />
            <ActivityItem icon="shield-outline" label="Incident reports" value={activity.reports} color="#b33a3a" />
            <View style={styles.divider} />
            <ActivityItem icon="chatbubble-ellipses-outline" label="Help desk" value={activity.concerns} color="#3973a8" />
          </View>

          <View style={styles.sectionHeading}>
            <View><Text style={styles.sectionTitle}>Latest Announcement</Text><Text style={styles.sectionHint}>From Barangay Tubod</Text></View>
            <TouchableOpacity onPress={() => router.navigate("/announcement")}><Text style={styles.viewAll}>View all</Text></TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator style={styles.loader} color="#2e7d32" /> :
            latestAnnouncement ? (
              <TouchableOpacity style={styles.newsCard} onPress={() => router.push({ pathname: "/announcement", params: { announcementId: String(latestAnnouncement.id) } })}>
                <View style={styles.newsIcon}><Ionicons name="megaphone" size={22} color="#fff" /></View>
                <View style={styles.newsCopy}>
                  <Text style={styles.newsType}>{latestAnnouncement.announcement_type || latestAnnouncement.category || "BARANGAY NOTICE"}</Text>
                  <Text style={styles.newsTitle} numberOfLines={2}>{latestAnnouncement.title}</Text>
                  <Text style={styles.newsMeta}>{latestAnnouncement.created_at && !Number.isNaN(new Date(latestAnnouncement.created_at).getTime()) ? new Date(latestAnnouncement.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "Recently posted"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color="#748078" />
              </TouchableOpacity>
            ) : (
              <View style={styles.emptyNews}><Ionicons name="newspaper-outline" size={25} color="#6f7d72" /><Text style={styles.emptyNewsText}>No announcements posted yet.</Text></View>
            )}

          <View style={styles.safetyNote}><Ionicons name="information-circle" size={20} color="#2e7d32" /><Text style={styles.safetyText}>For urgent emergencies, contact the appropriate emergency authority immediately.</Text></View>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function ActivityItem({ icon, label, value, color }) {
  return <View style={styles.activityItem}><Ionicons name={icon} size={20} color={color} /><Text style={styles.activityValue}>{value}</Text><Text style={styles.activityLabel} numberOfLines={2}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#f2f6f2" },
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 108 },
  errorCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, marginBottom: 10, borderRadius: 13, backgroundColor: "#fff1f1", borderWidth: 1, borderColor: "#e8bbbb" },
  errorText: { flex: 1, color: "#8c3030", fontSize: 9, lineHeight: 14, fontWeight: "700" },
  topbar: { minHeight: 57, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  identity: { flex: 1, flexDirection: "row", alignItems: "center" },
  avatar: { width: 45, height: 45, borderRadius: 15, borderWidth: 2, borderColor: "#2e7d32" },
  avatarFallback: { width: 45, height: 45, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#e5f2e7", borderWidth: 1, borderColor: "#b9d7bd" },
  identityText: { flex: 1, marginLeft: 10 },
  kicker: { color: "#768279", fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  greeting: { color: "#203d26", marginTop: 2, fontSize: 18, fontWeight: "900" },
  topActions: { flexDirection: "row", gap: 8 },
  iconButton: { position: "relative", width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 2 },
  badge: { position: "absolute", right: -3, top: -3, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#cf3434", borderWidth: 2, borderColor: "#fff" },
  badgeText: { color: "#fff", fontSize: 8, fontWeight: "900" },
  hero: { minHeight: 174, overflow: "hidden", flexDirection: "row", alignItems: "center", padding: 20, marginBottom: 22, borderRadius: 23, elevation: 7, shadowColor: "#19371e", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12 },
  heroGlow: { position: "absolute", width: 170, height: 170, right: -40, top: -65, borderRadius: 85, backgroundColor: "rgba(255,255,255,0.12)" },
  heroCopy: { flex: 1, zIndex: 1 },
  heroEyebrow: { color: "#dff3e2", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 },
  heroTitle: { color: "#fff", marginTop: 7, fontSize: 27, fontWeight: "900" },
  heroTitleCompact: { fontSize: 23 },
  heroLocation: { color: "#fff", marginTop: 3, fontSize: 11, fontWeight: "800" },
  heroMessage: { maxWidth: 225, color: "#edf8ee", marginTop: 11, fontSize: 10, lineHeight: 15 },
  heroLogo: { width: 84, height: 84, marginLeft: 7 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  assistantCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, marginBottom: 16, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#cfe6d2", elevation: 3 },
  assistantIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#2e7d32" },
  assistantCopy: { flex: 1 },
  assistantTitle: { color: "#225d29", fontSize: 13, fontWeight: "900" },
  assistantHint: { color: "#66736a", marginTop: 3, fontSize: 9, lineHeight: 13, fontWeight: "700" },
  sectionTitle: { color: "#213d27", fontSize: 16, fontWeight: "900" },
  sectionHint: { color: "#7d877f", marginTop: 2, fontSize: 9 },
  viewAll: { color: "#2e7d32", fontSize: 10, fontWeight: "900" },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10, marginBottom: 23 },
  serviceCard: { position: "relative", width: "48.4%", aspectRatio: 1, padding: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#e0e8e1", elevation: 3 },
  serviceIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  serviceTitle: { color: "#293a2d", marginTop: 10, paddingRight: 20, fontSize: 13, fontWeight: "900" },
  serviceSubtitle: { color: "#818a83", marginTop: 3, paddingRight: 13, fontSize: 8, lineHeight: 12 },
  serviceArrow: { position: "absolute", right: 12, bottom: 12 },
  activityCard: { flexDirection: "row", alignItems: "stretch", paddingVertical: 15, marginTop: 9, marginBottom: 23, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "#e0e8e1", elevation: 3 },
  activityItem: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 5 },
  activityValue: { color: "#243629", marginTop: 4, fontSize: 18, fontWeight: "900" },
  activityLabel: { color: "#78827a", marginTop: 2, textAlign: "center", fontSize: 7, lineHeight: 10 },
  divider: { width: 1, backgroundColor: "#e5ebe6" },
  newsCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 3 },
  newsIcon: { width: 45, height: 45, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#2e7d32" },
  newsCopy: { flex: 1 },
  newsType: { color: "#b57a05", fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  newsTitle: { color: "#2a392e", marginTop: 3, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  newsMeta: { color: "#8a938c", marginTop: 4, fontSize: 8 },
  loader: { marginVertical: 28 },
  emptyNews: { flexDirection: "row", alignItems: "center", gap: 10, padding: 18, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.9)" },
  emptyNewsText: { color: "#6f7d72", fontSize: 10, fontWeight: "700" },
  safetyNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 13, marginTop: 14, borderRadius: 14, backgroundColor: "#edf6ee", borderWidth: 1, borderColor: "#d0e3d2" },
  safetyText: { flex: 1, color: "#536557", fontSize: 9, lineHeight: 14 },
});
