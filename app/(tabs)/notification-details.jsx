import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ImageBackground, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import GradientHeader from "../../components/GradientHeader";
import { supabase } from "../../lib/supabase";

const ICONS = {
  announcement: ["megaphone", "#1565c0", "#eaf3ff"],
  document: ["document-text", "#2e7d32", "#eaf6ec"],
  incident: ["shield-checkmark", "#c47a08", "#fff3d6"],
  meeting: ["people", "#7b1fa2", "#f5eafa"],
  summons: ["mail-unread", "#c62828", "#ffebee"],
  concern: ["chatbubbles", "#2e7d32", "#eaf6ec"],
  general: ["notifications", "#546e7a", "#eef2f4"],
};

const clean = (value) => String(value ?? "").trim();
const titleCase = (value) => clean(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateTime = (value) => value ? new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "";
const dateOnly = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "";
const timeOnly = (value) => value ? new Date(`2000-01-01T${value}`).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "";

export default function NotificationDetails() {
  const router = useRouter();
  const { notificationId } = useLocalSearchParams();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (!notificationId) {
      setError("This notification does not have a valid reference.");
      setLoading(false);
      return;
    }
    if (refresh) setRefreshing(true);
    setError("");
    const { data, error: loadError } = await supabase.rpc("get_notification_details", { p_notification_id: notificationId });
    if (loadError) setError(loadError.message || "Unable to load notification details.");
    else setPayload(data);
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", notificationId);
    setLoading(false);
    setRefreshing(false);
  }, [notificationId]);

  useEffect(() => { load(); }, [load]);

  const notification = useMemo(() => payload?.notification || {}, [payload]);
  const details = useMemo(() => payload?.details || {}, [payload]);
  const fields = useMemo(() => getFields(notification, details), [notification, details]);
  const [icon, color, background] = ICONS[notification.type] || ICONS.general;
  const isSummons = notification.type === "summons" || details.viewer_role === "respondent";
  const serviceTarget = getServiceTarget(notification, details);

  return <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg}>
    <SafeAreaView style={styles.safe}>
      <GradientHeader title="Notification Details" />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#2e7d32"]} />}>
        <TouchableOpacity style={styles.back} onPress={() => router.navigate("/notifications")}>
          <Ionicons name="arrow-back" size={18} color="#2e7d32" /><Text style={styles.backText}>Back to notifications</Text>
        </TouchableOpacity>

        {loading ? <ActivityIndicator style={styles.loader} size="large" color="#2e7d32" /> : error ? <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={40} color="#c62828" />
          <Text style={styles.emptyTitle}>Details unavailable</Text><Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity style={styles.primary} onPress={() => load()}><Text style={styles.primaryText}>Try again</Text></TouchableOpacity>
        </View> : <>
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: background }]}><Ionicons name={icon} size={27} color={color} /></View>
            <View style={styles.heroCopy}><Text style={styles.eyebrow}>{titleCase(notification.type || "Update")}</Text><Text style={styles.heroTitle}>{notification.title || "Barangay update"}</Text><Text style={styles.heroDate}>{dateTime(notification.created_at)}</Text></View>
          </View>

          {isSummons && <View style={styles.noticeBox}><Ionicons name="information-circle" size={22} color="#8b1d1d" /><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>Official barangay appearance notice</Text><Text style={styles.noticeText}>Please review the reason and official schedule below. Contact Barangay Tubod if you need clarification.</Text></View></View>}

          <View style={styles.card}><Text style={styles.cardTitle}>Update message</Text><Text style={styles.message}>{notification.message || "Open the information below for this update."}</Text></View>

          <View style={styles.card}><Text style={styles.cardTitle}>{isSummons ? "Appearance details" : "Complete details"}</Text>
            {fields.length ? fields.map((field) => <Detail key={field.label} {...field} />) : <View style={styles.noRows}><Ionicons name="document-text-outline" size={28} color="#2e7d32" /><Text style={styles.noRowsTitle}>No additional fields were supplied</Text><Text style={styles.noRowsText}>The notification message above is the official update. You may contact the barangay for clarification.</Text></View>}
          </View>

          {serviceTarget && <TouchableOpacity style={styles.primaryWide} onPress={() => router.navigate(serviceTarget)}><Text style={styles.primaryText}>Open related service</Text><Ionicons name="arrow-forward" size={17} color="#fff" /></TouchableOpacity>}
        </>}
      </ScrollView>
    </SafeAreaView>
  </ImageBackground>;
}

function getFields(notification, d) {
  const type = notification.type;
  if (["incident", "meeting", "summons"].includes(type)) return [
    ["Reference number", d.reference_number, "ticket-outline"], ["Status", titleCase(d.status), "pulse-outline"],
    ["Incident type", d.incident_type, "shield-outline"], ["Requested by", d.requesting_resident, "person-outline"],
    ["Reason for appearance", d.meeting_reason, "chatbox-ellipses-outline"],
    ["Official date", dateOnly(d.scheduled_date), "calendar-outline"], ["Official time", timeOnly(d.scheduled_time), "time-outline"],
    ["Venue", d.venue, "location-outline"], ["Assigned official", d.assigned_official, "person-circle-outline"],
    ["Urgency", titleCase(d.urgency), "alert-circle-outline"], ["Incident date", dateOnly(d.incident_date), "calendar-outline"],
    ["Incident time", timeOnly(d.incident_time), "time-outline"], ["Location", d.location, "location-outline"],
    ["Report summary", d.incident_details, "document-text-outline"], ["Barangay note", d.admin_note, "reader-outline"],
  ].map(toField).filter(Boolean);
  if (type === "document") return [
    ["Document", d.document_name, "document-text-outline"], ["Status", titleCase(d.status), "pulse-outline"], ["Copies", d.copies, "copy-outline"],
    ["Purpose", d.purpose, "reader-outline"], ["Fee per copy", money(d.fee_per_copy), "cash-outline"], ["Total payment", money(d.total_fee), "wallet-outline"],
    ["Claim schedule", dateTime(d.claim_schedule), "calendar-outline"], ["Barangay note", d.admin_note, "information-circle-outline"],
  ].map(toField).filter(Boolean);
  if (type === "concern") return [
    ["Ticket number", d.ticket_number, "ticket-outline"], ["Category", d.category || d.subject, "grid-outline"], ["Status", titleCase(d.status), "pulse-outline"],
    ["Location", [d.area, d.landmark].filter(Boolean).join(", "), "location-outline"], ["Concern", d.concern_details, "chatbox-outline"],
    ["Special request", d.special_request, "help-circle-outline"], ["Assigned to", d.assigned_to, "person-outline"], ["Barangay note", d.admin_note, "reader-outline"],
  ].map(toField).filter(Boolean);
  if (type === "announcement") return [
    ["What", d.what, "megaphone-outline"], ["Who", d.who, "people-outline"], ["Why", d.why, "help-circle-outline"],
    ["When", [dateOnly(d.event_date), timeOnly(d.event_time), d.end_time ? `until ${timeOnly(d.end_time)}` : ""].filter(Boolean).join(" · "), "calendar-outline"],
    ["Where", d.where, "location-outline"], ["Contact", [d.contact_person, d.contact_number].filter(Boolean).join(" · "), "call-outline"], ["Priority", titleCase(d.priority), "alert-circle-outline"],
  ].map(toField).filter(Boolean);
  return [];
}

function toField([label, value, icon]) { return clean(value) ? { label, value: clean(value), icon } : null; }
function money(value) { return value === null || value === undefined || value === "" ? "" : `₱${Number(value).toFixed(2)}`; }
function getServiceTarget(notification, details) {
  if (notification.type === "summons" || details.viewer_role === "respondent") return null;
  if (notification.type === "document") return "/documents";
  if (notification.type === "concern") return notification.related_id ? `/feedback?ticketId=${notification.related_id}` : "/feedback";
  if (notification.type === "announcement") return "/announcement";
  if (["incident", "meeting"].includes(notification.type) && notification.related_id) return `/report-summary?reportId=${notification.related_id}`;
  return null;
}

function Detail({ icon, label, value }) { return <View style={styles.detail}><View style={styles.detailIcon}><Ionicons name={icon} size={18} color="#2e7d32" /></View><View style={styles.detailCopy}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View></View>; }

const styles = StyleSheet.create({
  bg: { flex: 1 }, safe: { flex: 1 }, content: { padding: 16, paddingBottom: 105 }, back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 8, marginBottom: 7 }, backText: { color: "#2e7d32", fontSize: 11, fontWeight: "900" }, loader: { marginTop: 70 },
  hero: { flexDirection: "row", alignItems: "center", gap: 13, padding: 17, marginBottom: 12, borderRadius: 18, backgroundColor: "#225d29", elevation: 4 }, heroIcon: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 16 }, heroCopy: { flex: 1 }, eyebrow: { color: "#b9dfbf", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 }, heroTitle: { color: "#fff", marginTop: 4, fontSize: 17, fontWeight: "900" }, heroDate: { color: "#cce5d0", marginTop: 5, fontSize: 9 },
  noticeBox: { flexDirection: "row", gap: 10, padding: 14, marginBottom: 12, borderRadius: 15, backgroundColor: "#fff0f0", borderWidth: 1, borderColor: "#efbcbc" }, noticeCopy: { flex: 1 }, noticeTitle: { color: "#8b1d1d", fontSize: 12, fontWeight: "900" }, noticeText: { color: "#714545", marginTop: 4, fontSize: 9, lineHeight: 14 },
  card: { padding: 16, marginBottom: 12, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 3 }, cardTitle: { color: "#225d29", marginBottom: 10, fontSize: 15, fontWeight: "900" }, message: { color: "#38443a", fontSize: 11, lineHeight: 18 },
  detail: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#edf1ed" }, detailIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#eaf6ec" }, detailCopy: { flex: 1 }, detailLabel: { color: "#7c867e", fontSize: 8, fontWeight: "900", textTransform: "uppercase" }, detailValue: { color: "#2f3b32", marginTop: 3, fontSize: 11, lineHeight: 17, fontWeight: "700" },
  noRows: { alignItems: "center", paddingVertical: 18 }, noRowsTitle: { color: "#314036", marginTop: 8, fontSize: 11, fontWeight: "900" }, noRowsText: { color: "#737d75", marginTop: 5, textAlign: "center", fontSize: 9, lineHeight: 14 }, primaryWide: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 16, borderRadius: 13, backgroundColor: "#2e7d32", elevation: 3 }, primary: { minWidth: 140, alignItems: "center", padding: 12, marginTop: 15, borderRadius: 11, backgroundColor: "#2e7d32" }, primaryText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  empty: { alignItems: "center", padding: 28, marginTop: 20, borderRadius: 17, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8e3" }, emptyTitle: { color: "#303b32", marginTop: 10, fontWeight: "900" }, emptyText: { color: "#727b73", marginTop: 6, textAlign: "center", fontSize: 10, lineHeight: 16 },
});
