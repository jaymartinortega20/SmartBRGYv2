import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ImageBackground, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import GradientHeader from "../../components/GradientHeader";
import { supabase } from "../../lib/supabase";
import { openNativePicker } from "../../lib/datePicker";

const pad = (value) => String(value).padStart(2, "0");
const dateValue = (value) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const timeValue = (value) => `${pad(value.getHours())}:${pad(value.getMinutes())}`;
const parseDate = (value) => value ? new Date(`${value}T12:00:00`) : new Date(Date.now() + 86400000);
const parseTime = (value) => { const date = new Date(); const [hour, minute] = String(value || "09:00").split(":"); date.setHours(Number(hour), Number(minute), 0, 0); return date; };
const displayDate = (value) => value.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
const displayTime = (value) => value.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });

export default function ReportSummary() {
  const router = useRouter();
  const { reportId } = useLocalSearchParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [preferredDate, setPreferredDate] = useState(new Date());
  const [preferredTime, setPreferredTime] = useState(new Date());
  const [saving, setSaving] = useState(false);

  const loadReport = useCallback(async () => {
    if (!reportId) return setLoading(false);
    const { data, error } = await supabase.from("incident_reports").select("*").eq("id", reportId).single();
    if (!error && data) {
      setReport(data);
      setPreferredDate(parseDate(data.preferred_meeting_date));
      setPreferredTime(parseTime(data.preferred_meeting_time));
      if (data.photo_path) {
        const { data: signed } = await supabase.storage.from("incident-photos").createSignedUrl(data.photo_path, 600);
        setEvidenceUrl(signed?.signedUrl || "");
      }
    }
    setLoading(false);
  }, [reportId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  useEffect(() => {
    if (!reportId) return undefined;
    const channel = supabase
      .channel(`resident-report-${reportId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incident_reports", filter: `id=eq.${reportId}` },
        () => loadReport()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadReport, reportId]);

  async function savePreferredSchedule() {
    setSaving(true);
    const moment = new Date(preferredDate);
    moment.setHours(preferredTime.getHours(), preferredTime.getMinutes(), 0, 0);
    if (moment.getTime() <= Date.now()) {
      setSaving(false);
      Alert.alert("Invalid schedule", "Choose a preferred meeting date and time in the future.");
      return;
    }
    const { error } = await supabase.from("incident_reports").update({ preferred_meeting_date: dateValue(preferredDate), preferred_meeting_time: timeValue(preferredTime), updated_at: new Date().toISOString() }).eq("id", report.id).is("scheduled_meeting_date", null);
    if (error) Alert.alert("Unable to save availability", error.message || "Please try again.");
    else { setEditing(false); await loadReport(); }
    setSaving(false);
  }

  if (loading) return <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg}><SafeAreaView style={styles.safe}><GradientHeader title="Report Summary" /><ActivityIndicator style={styles.loader} size="large" color="#2e7d32" /></SafeAreaView></ImageBackground>;
  if (!report) return <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg}><SafeAreaView style={styles.safe}><GradientHeader title="Report Summary" /><View style={styles.empty}><Ionicons name="document-outline" size={36} color="#2e7d32" /><Text style={styles.emptyTitle}>Report unavailable</Text><TouchableOpacity style={styles.primary} onPress={() => router.back()}><Text style={styles.primaryText}>Go back</Text></TouchableOpacity></View></SafeAreaView></ImageBackground>;

  const canEdit = report.request_meeting && !report.scheduled_meeting_date && !["resolved", "rejected"].includes(report.status);
  return <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg}><SafeAreaView style={styles.safe}><GradientHeader title="Report Summary" /><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <TouchableOpacity style={styles.back} onPress={() => router.back()}><Ionicons name="arrow-back" size={18} color="#2e7d32" /><Text style={styles.backText}>Back to notifications</Text></TouchableOpacity>
    <View style={styles.ticket}><View><Text style={styles.eyebrow}>INCIDENT TICKET</Text><Text style={styles.ticketNumber}>{report.reference_number || "No reference number"}</Text></View><Status value={report.status} /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Incident summary</Text><Detail icon="warning-outline" label="Incident type" value={report.incident_type} /><Detail icon="alert-circle-outline" label="Urgency" value={report.urgency} /><Detail icon="calendar-outline" label="When it happened" value={[report.incident_date, report.incident_time].filter(Boolean).join(" · ")} /><Detail icon="location-outline" label="Location" value={report.location} /><Detail icon="people-outline" label="Persons involved" value={report.persons_involved || "Not provided"} /><Detail icon="document-text-outline" label="Report details" value={report.details} /></View>
    {report.photo_path && <View style={styles.card}><Text style={styles.cardTitle}>Supporting evidence</Text>{evidenceUrl ? <Image source={{ uri: evidenceUrl }} style={styles.evidence} /> : <Text style={styles.muted}>Evidence preview is temporarily unavailable.</Text>}</View>}
    {report.request_meeting && <View style={styles.card}><View style={styles.meetingHeading}><View><Text style={styles.cardTitle}>Barangay meeting request</Text><Text style={styles.muted}>The final schedule is issued by the barangay official.</Text></View>{canEdit && !editing && <TouchableOpacity style={styles.editButton} onPress={() => setEditing(true)}><Ionicons name="create-outline" size={16} color="#2e7d32" /><Text style={styles.editText}>Edit availability</Text></TouchableOpacity>}</View><Detail icon="person-outline" label="Person requested to appear" value={report.respondent_name} /><Detail icon="location-outline" label="Known address" value={report.respondent_address} /><Detail icon="chatbox-outline" label="Meeting reason" value={report.meeting_reason} />
      {report.scheduled_meeting_date ? <View style={styles.confirmedBox}><Text style={styles.confirmedTitle}>Official schedule</Text><Text style={styles.confirmedValue}>{report.scheduled_meeting_date} · {report.scheduled_meeting_time}</Text><Text style={styles.confirmedValue}>{report.meeting_venue || "Barangay Tubod Hall"}</Text>{report.assigned_official && <Text style={styles.confirmedSmall}>Assigned official: {report.assigned_official}</Text>}</View> : editing ? <View style={styles.editor}><Text style={styles.editorNote}>Update the times when you are available. The barangay may still issue a different official schedule.</Text><View style={styles.dateRow}><DateButton label="Preferred date" value={displayDate(preferredDate)} icon="calendar-outline" onPress={() => openNativePicker({ value: preferredDate, mode: "date", minimumDate: new Date(), onConfirm: setPreferredDate })} /><DateButton label="Preferred time" value={displayTime(preferredTime)} icon="time-outline" onPress={() => openNativePicker({ value: preferredTime, mode: "time", onConfirm: setPreferredTime })} /></View><View style={styles.editorActions}><TouchableOpacity style={styles.secondary} onPress={() => setEditing(false)}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.primary} onPress={savePreferredSchedule} disabled={saving}><Text style={styles.primaryText}>{saving ? "Saving..." : "Save availability"}</Text></TouchableOpacity></View></View> : <Detail icon="time-outline" label="Preferred schedule" value={[report.preferred_meeting_date, report.preferred_meeting_time].filter(Boolean).join(" · ")} />}
    </View>}
    <Text style={styles.footer}>Submitted {new Date(report.created_at).toLocaleString("en-PH")}</Text>
  </ScrollView></SafeAreaView></ImageBackground>;
}

function Status({ value }) { return <View style={styles.status}><Text style={styles.statusText}>{String(value || "submitted").replaceAll("_", " ")}</Text></View>; }
function Detail({ icon, label, value }) { return <View style={styles.detail}><View style={styles.detailIcon}><Ionicons name={icon} size={18} color="#2e7d32" /></View><View style={styles.detailCopy}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value || "—"}</Text></View></View>; }
function DateButton({ label, value, icon, onPress }) { return <TouchableOpacity style={styles.dateButton} onPress={onPress}><Ionicons name={icon} size={19} color="#2e7d32" /><View><Text style={styles.dateLabel}>{label}</Text><Text style={styles.dateValue}>{value}</Text></View></TouchableOpacity>; }

const styles = StyleSheet.create({
  bg: { flex: 1 }, safe: { flex: 1 }, loader: { marginTop: 70 }, content: { padding: 16, paddingBottom: 105 }, back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 8, marginBottom: 7 }, backText: { color: "#2e7d32", fontSize: 11, fontWeight: "900" },
  ticket: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 17, marginBottom: 12, borderRadius: 17, backgroundColor: "#225d29", elevation: 4 }, eyebrow: { color: "#b9dfbf", fontSize: 8, fontWeight: "900", letterSpacing: 1.2 }, ticketNumber: { color: "#fff", marginTop: 5, fontSize: 18, fontWeight: "900" }, status: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, backgroundColor: "#fff1c9" }, statusText: { color: "#73530f", fontSize: 8, fontWeight: "900", textTransform: "capitalize" },
  card: { padding: 16, marginBottom: 12, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 3 }, cardTitle: { color: "#225d29", marginBottom: 10, fontSize: 16, fontWeight: "900" }, detail: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#edf1ed" }, detailIcon: { width: 35, height: 35, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#eaf6ec" }, detailCopy: { flex: 1 }, detailLabel: { color: "#808982", fontSize: 8, fontWeight: "900", textTransform: "uppercase" }, detailValue: { color: "#2f3b32", marginTop: 3, fontSize: 11, lineHeight: 17, fontWeight: "700" }, evidence: { width: "100%", height: 250, resizeMode: "contain", borderRadius: 12, backgroundColor: "#eef2ee" }, muted: { color: "#747e76", fontSize: 9, lineHeight: 14 },
  meetingHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }, editButton: { flexDirection: "row", alignItems: "center", gap: 4, padding: 7, borderRadius: 9, backgroundColor: "#eaf6ec" }, editText: { color: "#2e7d32", fontSize: 8, fontWeight: "900" }, confirmedBox: { padding: 13, marginTop: 12, borderRadius: 12, backgroundColor: "#eaf6ec", borderWidth: 1, borderColor: "#b9dabf" }, confirmedTitle: { color: "#23632b", fontSize: 9, fontWeight: "900", textTransform: "uppercase" }, confirmedValue: { color: "#2b3d2f", marginTop: 5, fontSize: 12, fontWeight: "800" }, confirmedSmall: { color: "#607064", marginTop: 6, fontSize: 9 },
  editor: { marginTop: 13 }, editorNote: { color: "#76560e", padding: 10, marginBottom: 10, borderRadius: 9, backgroundColor: "#fff5d9", fontSize: 9, lineHeight: 14 }, dateRow: { flexDirection: "row", gap: 8 }, dateButton: { flex: 1, minHeight: 62, flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 11, backgroundColor: "#f5f8f5", borderWidth: 1, borderColor: "#dfe5df" }, dateLabel: { color: "#7a847c", fontSize: 8, fontWeight: "800", textTransform: "uppercase" }, dateValue: { color: "#344438", marginTop: 3, fontSize: 9, fontWeight: "800" }, editorActions: { flexDirection: "row", gap: 8, marginTop: 12 }, primary: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10, backgroundColor: "#2e7d32" }, primaryText: { color: "#fff", fontWeight: "900" }, secondary: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: "#dbe3dc" }, secondaryText: { color: "#58645b", fontWeight: "900" }, footer: { color: "#7c857e", textAlign: "center", fontSize: 9 },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(15,35,20,0.62)" }, picker: { width: "100%", maxWidth: 440, padding: 16, borderRadius: 20, backgroundColor: "#fff" }, pickerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, pickerTitle: { color: "#243128", fontSize: 16, fontWeight: "900" }, empty: { alignItems: "center", padding: 30, margin: 18, borderRadius: 16, backgroundColor: "#fff" }, emptyTitle: { marginVertical: 12, fontWeight: "900" },
});
