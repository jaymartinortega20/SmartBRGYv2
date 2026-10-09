import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";

import { useFocusEffect, useRouter } from "expo-router";
import GradientHeader from "../../components/GradientHeader";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { draftIncidentReport } from "../../lib/ai";

const TYPES = ["Theft", "Fight", "Disturbance", "Harassment", "Suspicious Activity", "Property Damage", "Fire", "Accident", "Other"];
const AREAS = ["Sitio Ibabaw", "Drilling", "Bulok-bulok", "Centro", "Gawad Kalinga", "Lawm Tabay", "Bakhaw", "Cajocson"];
const URGENCY = ["low", "medium", "high"];

const pad = (value) => String(value).padStart(2, "0");
const dateValue = (value) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const timeValue = (value) => `${pad(value.getHours())}:${pad(value.getMinutes())}`;
const displayDate = (value) => value.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
const displayTime = (value) => value.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
// Must match the incident-photos storage bucket limit (5 MB, JPG/PNG/WebP).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const combineDateAndTime = (date, time) => {
  const value = new Date(date);
  value.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return value;
};

const getImageType = (asset) => {
  const mimeType = String(asset?.mimeType || "").toLowerCase();
  if (mimeType === "image/png") return { extension: "png", contentType: "image/png" };
  if (mimeType === "image/webp") return { extension: "webp", contentType: "image/webp" };
  if (mimeType === "image/heic" || mimeType === "image/heif") return null;
  return { extension: "jpg", contentType: "image/jpeg" };
};

export default function Report() {
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [incidentType, setIncidentType] = useState("");
  const [otherType, setOtherType] = useState("");
  const [urgency, setUrgency] = useState("medium");
  const [incidentDate, setIncidentDate] = useState(new Date());
  const [incidentTime, setIncidentTime] = useState(new Date());
  const [showIncidentDate, setShowIncidentDate] = useState(false);
  const [showIncidentTime, setShowIncidentTime] = useState(false);
  const [area, setArea] = useState("");
  const [landmark, setLandmark] = useState("");
  const [personsInvolved, setPersonsInvolved] = useState("");
  const [details, setDetails] = useState("");
  const [photo, setPhoto] = useState(null);
  const [requestMeeting, setRequestMeeting] = useState(false);
  const [respondentName, setRespondentName] = useState("");
  const [respondentAddress, setRespondentAddress] = useState("");
  const [meetingReason, setMeetingReason] = useState("");
  const [preferredDate, setPreferredDate] = useState(new Date(Date.now() + 86400000));
  const [preferredTime, setPreferredTime] = useState(new Date());
  const [showPreferredDate, setShowPreferredDate] = useState(false);
  const [showPreferredTime, setShowPreferredTime] = useState(false);
  const router = useRouter();
  const scrollRef = useRef(null);
  const [myReports, setMyReports] = useState([]);
  const [showAllReports, setShowAllReports] = useState(false);

  // The resident's own reports, so they can always go back and check them.
  const loadMyReports = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return;
    const { data } = await supabase
      .from("incident_reports")
      .select("id,reference_number,incident_type,status,created_at,request_meeting,scheduled_meeting_date")
      .eq("resident_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setMyReports(data || []);
  }, []);

  useFocusEffect(useCallback(() => { loadMyReports(); }, [loadMyReports]));
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMissing, setAiMissing] = useState([]);

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    setProfileError("");

    if (!isSupabaseConfigured) {
      setProfile(null);
      setProfileError("Supabase is not configured.");
      setLoadingProfile(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setProfile(null);
      setProfileError("Your session is unavailable. Please log in again.");
      setLoadingProfile(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("full_name,phone,address,purok")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (error || !data) {
      setProfile(null);
      setProfileError(error?.message || "Your verified resident profile could not be loaded.");
    } else {
      setProfile(data);
    }
    setLoadingProfile(false);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const acceptPhoto = (asset) => {
    if (!asset?.uri) return;
    if (!getImageType(asset)) {
      Alert.alert("Unsupported photo", "Use a JPG, PNG, or WebP photo. HEIC photos are not supported.");
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      Alert.alert("Photo too large", "Choose a photo that is 5 MB or smaller.");
      return;
    }
    setPhoto(asset);
  };

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Allow camera access to take an evidence photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.65,
      allowsEditing: false,
    });
    if (!result.canceled) acceptPhoto(result.assets[0]);
  }

  async function chooseFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Allow photo access to attach incident evidence.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.65,
      allowsEditing: false,
    });
    if (!result.canceled) acceptPhoto(result.assets[0]);
  }

  function pickImage() {
    Alert.alert("Add supporting photo", "Choose a photo source.", [
      { text: "Take photo", onPress: takePhoto },
      { text: "Choose from gallery", onPress: chooseFromGallery },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  // Turns the resident's own words into a draft of the form below. Nothing is
  // submitted: the resident reviews and edits every field first.
  async function draftWithAssistant() {
    const value = aiText.trim();
    if (value.length < 5 || aiLoading) {
      if (value.length < 5) Alert.alert("Describe the incident", "Write a few words about what happened first.");
      return;
    }
    setAiLoading(true);
    try {
      const draft = await draftIncidentReport(value);
      if (TYPES.includes(draft.incident_type)) setIncidentType(draft.incident_type);
      if (draft.incident_type === "Other") setOtherType(draft.other_type || "");
      if (URGENCY.includes(draft.urgency)) setUrgency(draft.urgency);
      if (AREAS.includes(draft.area)) setArea(draft.area);
      if (draft.landmark) setLandmark(draft.landmark);
      if (draft.persons_involved) setPersonsInvolved(draft.persons_involved);
      if (draft.details) setDetails(draft.details);
      setAiMissing(Array.isArray(draft.missing) ? draft.missing : []);
      if (draft.emergency) {
        Alert.alert(
          "Is someone in danger right now?",
          "Call the national emergency hotline 911 first. You can submit this report after you are safe.",
          [{ text: "Call 911", onPress: () => Linking.openURL("tel:911") }, { text: "Continue report", style: "cancel" }]
        );
      } else {
        Alert.alert("Draft ready", "The form below was filled in from your description. Please check every field before submitting.");
      }
    } catch (error) {
      Alert.alert("Assistant unavailable", error.message || "Please fill in the form manually.");
    } finally {
      setAiLoading(false);
    }
  }

  function validate() {
    if (!isSupabaseConfigured) {
      Alert.alert("Setup required", "Supabase is not connected.");
      return false;
    }
    if (!profile) {
      Alert.alert("Profile unavailable", "Load your verified resident profile before submitting a report.");
      return false;
    }
    if (!incidentType || (incidentType === "Other" && !otherType.trim()) || !area || !landmark.trim() || !details.trim()) {
      Alert.alert("Incomplete report", "Complete the incident type, location, and incident details.");
      return false;
    }
    const incidentMoment = combineDateAndTime(incidentDate, incidentTime);
    if (incidentMoment.getTime() > Date.now() + 60 * 1000) {
      Alert.alert("Invalid incident schedule", "The incident date and time cannot be in the future.");
      return false;
    }
    if (requestMeeting && (!respondentName.trim() || !respondentAddress.trim() || !meetingReason.trim())) {
      Alert.alert("Incomplete meeting request", "Enter the person to be called, known address, and reason for the meeting.");
      return false;
    }
    if (requestMeeting && combineDateAndTime(preferredDate, preferredTime).getTime() <= Date.now()) {
      Alert.alert("Invalid meeting schedule", "Choose a preferred meeting date and time in the future.");
      return false;
    }
    return true;
  }

  function reviewReport() {
    if (!validate()) return;
    const meeting = requestMeeting ? `\n\nMeeting requested for ${respondentName.trim()}\nPreferred: ${displayDate(preferredDate)}, ${displayTime(preferredTime)}` : "";
    Alert.alert(
      "Confirm Incident Report",
      `${incidentType === "Other" ? otherType.trim() : incidentType} · ${urgency.toUpperCase()}\n${displayDate(incidentDate)}, ${displayTime(incidentTime)}\n${area}, ${landmark.trim()}${meeting}`,
      [{ text: "Back and edit", style: "cancel" }, { text: "Confirm and submit", onPress: submitReport }]
    );
  }

  async function submitReport() {
    if (submitting || !validate()) return;
    setSubmitting(true);
    let uploadedPhotoPath = null;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Please log in again.");
      const reference = `INC-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
      let photoPath = null;
      if (photo?.uri) {
        const response = await fetch(photo.uri);
        if (!response.ok) throw new Error("The selected evidence photo could not be read.");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("The evidence photo must be 5 MB or smaller.");
        const imageType = getImageType(photo);
        if (!imageType) throw new Error("Use a JPG, PNG, or WebP evidence photo.");
        photoPath = `${authData.user.id}/${reference}-${Date.now()}.${imageType.extension}`;
        const { error: uploadError } = await supabase.storage
          .from("incident-photos")
          .upload(photoPath, bytes, { contentType: imageType.contentType, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPhotoPath = photoPath;
      }
      const { error } = await supabase.from("incident_reports").insert({
        reference_number: reference,
        resident_id: authData.user.id,
        incident_type: incidentType === "Other" ? otherType.trim() : incidentType,
        urgency,
        incident_date: dateValue(incidentDate),
        incident_time: timeValue(incidentTime),
        area,
        landmark: landmark.trim(),
        location: `${area}, ${landmark.trim()}, Barangay Tubod, Toledo City`,
        persons_involved: personsInvolved.trim() || null,
        details: details.trim(),
        photo_path: photoPath,
        request_meeting: requestMeeting,
        respondent_name: requestMeeting ? respondentName.trim() : null,
        respondent_address: requestMeeting ? respondentAddress.trim() : null,
        meeting_reason: requestMeeting ? meetingReason.trim() : null,
        preferred_meeting_date: requestMeeting ? dateValue(preferredDate) : null,
        preferred_meeting_time: requestMeeting ? timeValue(preferredTime) : null,
      });
      if (error) throw error;
      uploadedPhotoPath = null;
      Alert.alert("Report submitted", `Reference number: ${reference}\n\nYou will receive a notification when the barangay updates your report${requestMeeting ? " or confirms the meeting" : ""}.`);
      resetForm();
      await loadMyReports();
      // My reports is at the top of the screen; bring the resident back to it.
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (error) {
      if (uploadedPhotoPath) {
        await supabase.storage.from("incident-photos").remove([uploadedPhotoPath]);
      }
      Alert.alert("Submission failed", error.message || "Unable to submit the report.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    const now = new Date();
    setIncidentType(""); setOtherType(""); setUrgency("medium"); setIncidentDate(now); setIncidentTime(now); setArea(""); setLandmark(""); setPersonsInvolved(""); setDetails(""); setPhoto(null); setRequestMeeting(false); setRespondentName(""); setRespondentAddress(""); setMeetingReason(""); setPreferredDate(new Date(Date.now() + 86400000)); setPreferredTime(now); setShowIncidentDate(false); setShowIncidentTime(false); setShowPreferredDate(false); setShowPreferredTime(false); setAiText(""); setAiMissing([]);
  }

  return <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg} resizeMode="cover">
    <SafeAreaView style={styles.safe}>
      <GradientHeader title="Report Incident" />
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.notice}><Ionicons name="shield-checkmark" size={22} color="#2e7d32" /><Text style={styles.noticeText}><Text style={styles.noticeStrong}>Barangay incident reporting</Text>{"\n"}For immediate danger, contact the appropriate emergency authority.</Text></View>
        {myReports.length > 0 && (
          <View style={styles.myReports}>
            <View style={styles.myReportsHead}>
              <Text style={styles.myReportsTitle}>My reports ({myReports.length})</Text>
              <Text style={styles.myReportsHint}>Tap a report to see its status</Text>
            </View>
            {(showAllReports ? myReports : myReports.slice(0, 3)).map((item) => (
              <TouchableOpacity key={item.id} style={styles.myReportRow} onPress={() => router.navigate(`/report-summary?reportId=${item.id}`)}>
                <View style={styles.myReportIcon}><Ionicons name="document-text-outline" size={19} color="#2e7d32" /></View>
                <View style={styles.myReportCopy}>
                  <Text style={styles.myReportType} numberOfLines={1}>{item.incident_type}</Text>
                  <Text style={styles.myReportMeta} numberOfLines={1}>{item.reference_number || "Report"} · {new Date(item.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</Text>
                </View>
                <View style={styles.myReportStatus}><Text style={styles.myReportStatusText}>{String(item.status || "pending").replaceAll("_", " ")}</Text></View>
                <Ionicons name="chevron-forward" size={18} color="#9aa59c" />
              </TouchableOpacity>
            ))}
            {myReports.length > 3 && (
              <TouchableOpacity style={styles.myReportsMore} onPress={() => setShowAllReports((value) => !value)}>
                <Text style={styles.myReportsMoreText}>{showAllReports ? "Show fewer" : `Show all ${myReports.length} reports`}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Section title="Reporter information" subtitle="Automatically taken from your verified profile.">
          {loadingProfile ? <ActivityIndicator color="#2e7d32" /> : profileError ? <View style={styles.profileErrorBox}><Ionicons name="alert-circle-outline" size={22} color="#a43b32" /><View style={styles.profileDetails}><Text style={styles.profileErrorTitle}>Profile unavailable</Text><Text style={styles.profileErrorText}>{profileError}</Text></View><TouchableOpacity style={styles.retryProfile} onPress={loadProfile}><Text style={styles.retryProfileText}>Retry</Text></TouchableOpacity></View> : <View style={styles.profileBox}><Ionicons name="person-circle" size={42} color="#2e7d32" /><View style={styles.profileDetails}><Text style={styles.profileName}>{profile.full_name}</Text><Text style={styles.profileMeta}>{profile.phone || "No phone number"}</Text><Text style={styles.profileMeta}>{[profile.address, profile.purok].filter(Boolean).join(", ") || "No registered address"}</Text></View></View>}
        </Section>

        <View style={styles.aiCard}>
          <View style={styles.aiHead}><View style={styles.aiIcon}><Ionicons name="sparkles" size={18} color="#fff" /></View><View style={styles.aiHeadCopy}><Text style={styles.aiTitle}>Help me write this report</Text><Text style={styles.aiHint}>Describe what happened in your own words (Bisaya, Tagalog, or English). The assistant fills in the form for you to review.</Text></View></View>
          <TextInput style={styles.aiInput} value={aiText} onChangeText={setAiText} placeholder="Example: Gikawatan ko sa akong motor ganina alas 3 sa hapon duol sa kapilya sa Centro…" placeholderTextColor="#929a93" multiline maxLength={2000} editable={!aiLoading} />
          <TouchableOpacity style={[styles.aiButton, aiLoading && styles.aiButtonDisabled]} onPress={draftWithAssistant} disabled={aiLoading}>
            {aiLoading ? <ActivityIndicator color="#fff" /> : <><Ionicons name="sparkles" size={17} color="#fff" /><Text style={styles.aiButtonText}>Fill in the form</Text></>}
          </TouchableOpacity>
          {aiMissing.length > 0 && <View style={styles.aiMissing}><Text style={styles.aiMissingTitle}>Consider adding:</Text>{aiMissing.map((item) => <Text key={item} style={styles.aiMissingText}>• {item}</Text>)}</View>}
        </View>
        <Section title="Incident information" subtitle="Tell the barangay what happened.">
          <Label text="Incident category *" />
          <View style={styles.chips}>{TYPES.map((type) => <TouchableOpacity key={type} style={[styles.chip, incidentType === type && styles.chipActive]} onPress={() => setIncidentType(type)}><Text style={[styles.chipText, incidentType === type && styles.chipTextActive]}>{type}</Text></TouchableOpacity>)}</View>
          {incidentType === "Other" && <Input placeholder="Specify incident type" value={otherType} onChangeText={setOtherType} maxLength={80} />}
          <Label text="Urgency *" />
          <View style={styles.chips}>{URGENCY.map((level) => <TouchableOpacity key={level} style={[styles.urgency, styles[`urgency_${level}`], urgency === level && styles.urgencySelected]} onPress={() => setUrgency(level)}><Text style={styles.urgencyText}>{level.toUpperCase()}</Text></TouchableOpacity>)}</View>
          <View style={styles.dateRow}><DateButton label="Incident date" value={displayDate(incidentDate)} icon="calendar-outline" onPress={() => setShowIncidentDate(true)} /><DateButton label="Approx. time" value={displayTime(incidentTime)} icon="time-outline" onPress={() => setShowIncidentTime(true)} /></View>
          <PickerModal visible={showIncidentDate} title="Select incident date" mode="date" value={incidentDate} maximumDate={new Date()} onClose={() => setShowIncidentDate(false)} onConfirm={setIncidentDate} />
          <PickerModal visible={showIncidentTime} title="Select approximate time" mode="time" value={incidentTime} onClose={() => setShowIncidentTime(false)} onConfirm={setIncidentTime} />
          <Label text="Area/Purok *" />
          <View style={styles.chips}>{AREAS.map((value) => <TouchableOpacity key={value} style={[styles.chip, area === value && styles.chipActive]} onPress={() => setArea(value)}><Text style={[styles.chipText, area === value && styles.chipTextActive]}>{value}</Text></TouchableOpacity>)}</View>
          <Input placeholder="Specific landmark or house number *" value={landmark} onChangeText={setLandmark} maxLength={160} />
          <Input placeholder="Persons involved (optional)" value={personsInvolved} onChangeText={setPersonsInvolved} maxLength={200} />
          <Input placeholder="Describe what happened *" value={details} onChangeText={setDetails} maxLength={2000} multiline />
          {photo ? <View style={styles.imagePicker}><Image source={{ uri: photo.uri }} style={styles.image} /><TouchableOpacity style={styles.removePhoto} onPress={() => setPhoto(null)} accessibilityLabel="Remove evidence photo"><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity><TouchableOpacity style={styles.changePhoto} onPress={pickImage}><Ionicons name="camera-outline" size={16} color="#2e7d32" /><Text style={styles.changePhotoText}>Change photo</Text></TouchableOpacity></View> : <TouchableOpacity style={styles.imagePicker} onPress={pickImage}><Ionicons name="camera-outline" size={28} color="#2e7d32" /><Text style={styles.imageTitle}>Add supporting photo</Text><Text style={styles.imageHint}>Take a photo or choose from gallery · Maximum 5 MB</Text></TouchableOpacity>}
        </Section>

        <Section title="Barangay meeting" subtitle="Optional: request the barangay to call another person for a face-to-face meeting.">
          <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.switchTitle}>Request barangay meeting</Text><Text style={styles.switchHint}>The barangay will review and confirm the final schedule.</Text></View><Switch value={requestMeeting} onValueChange={setRequestMeeting} trackColor={{ false: "#ccd3cd", true: "#8bc490" }} thumbColor={requestMeeting ? "#2e7d32" : "#fff"} /></View>
          {requestMeeting && <View style={styles.meetingFields}><Input placeholder="Full name of person to be called *" value={respondentName} onChangeText={setRespondentName} maxLength={120} /><Input placeholder="Known address or Purok *" value={respondentAddress} onChangeText={setRespondentAddress} maxLength={200} /><Input placeholder="Reason for requesting the meeting *" value={meetingReason} onChangeText={setMeetingReason} maxLength={1000} multiline /><Text style={styles.preferredNote}>Preferred schedule only—the barangay official will approve or change this. You may edit it from your report summary until an official schedule is issued.</Text><View style={styles.dateRow}><DateButton label="Preferred date" value={displayDate(preferredDate)} icon="calendar-outline" onPress={() => setShowPreferredDate(true)} /><DateButton label="Preferred time" value={displayTime(preferredTime)} icon="time-outline" onPress={() => setShowPreferredTime(true)} /></View><PickerModal visible={showPreferredDate} mode="date" value={preferredDate} minimumDate={new Date()} onClose={() => setShowPreferredDate(false)} onConfirm={setPreferredDate} /><PickerModal visible={showPreferredTime} mode="time" value={preferredTime} onClose={() => setShowPreferredTime(false)} onConfirm={setPreferredTime} /></View>}
        </Section>

        <TouchableOpacity style={[styles.submit, (submitting || loadingProfile || !profile) && styles.disabled]} onPress={reviewReport} disabled={submitting || loadingProfile || !profile}><Ionicons name="paper-plane" size={19} color="#fff" /><Text style={styles.submitText}>{submitting ? "Submitting..." : "Review and Submit Report"}</Text></TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </ImageBackground>;
}

function Section({ title, subtitle, children }) { return <View style={styles.card}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text>{children}</View>; }
function Label({ text }) { return <Text style={styles.label}>{text}</Text>; }
function Input({ multiline, ...props }) { return <TextInput {...props} placeholderTextColor="#929a93" style={[styles.input, multiline && styles.textArea]} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} />; }
function DateButton({ label, value, icon, onPress }) { return <TouchableOpacity style={styles.dateButton} onPress={onPress}><Ionicons name={icon} size={19} color="#2e7d32" /><View style={styles.dateCopy}><Text style={styles.dateLabel}>{label}</Text><Text style={styles.dateValue} numberOfLines={2}>{value}</Text></View></TouchableOpacity>; }
function PickerModal({ visible, mode, value, minimumDate, maximumDate, onClose, onConfirm }) {
  if (!visible) return null;
  return <DateTimePicker
    value={value}
    mode={mode}
    display="default"
    minimumDate={minimumDate}
    maximumDate={maximumDate}
    onChange={(event, selected) => {
      onClose();
      if (event.type === "set" && selected) onConfirm(selected);
    }}
  />;
}

const styles = StyleSheet.create({
  myReports: { padding: 14, marginBottom: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 3 },
  myReportsHead: { marginBottom: 6 },
  myReportsTitle: { color: "#225d29", fontSize: 15, fontWeight: "900" },
  myReportsHint: { color: "#66736a", marginTop: 2, fontSize: 11 },
  myReportRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#edf1ed" },
  myReportIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#eaf6ec" },
  myReportCopy: { flex: 1, minWidth: 0 },
  myReportType: { color: "#2d3a30", fontSize: 13, fontWeight: "900" },
  myReportMeta: { color: "#7b847d", marginTop: 2, fontSize: 11 },
  myReportStatus: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: "#fff1c9" },
  myReportStatusText: { color: "#73530f", fontSize: 10, fontWeight: "900", textTransform: "capitalize" },
  myReportsMore: { alignSelf: "center", marginTop: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: "#eaf6ec" },
  myReportsMoreText: { color: "#2e7d32", fontSize: 12, fontWeight: "900" },
  aiCard: { padding: 14, marginBottom: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#cfe6d2", elevation: 3 },
  aiHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  aiIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#2e7d32" },
  aiHeadCopy: { flex: 1 },
  aiTitle: { color: "#225d29", fontSize: 14, fontWeight: "900" },
  aiHint: { color: "#66736a", marginTop: 3, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  aiInput: { minHeight: 80, maxHeight: 160, marginTop: 11, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: "#dbe5dc", backgroundColor: "#f8fbf8", color: "#243128", fontSize: 12, textAlignVertical: "top" },
  aiButton: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 10, borderRadius: 12, backgroundColor: "#2e7d32" },
  aiButtonDisabled: { opacity: 0.6 },
  aiButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  aiMissing: { marginTop: 10, padding: 10, borderRadius: 11, backgroundColor: "#fff6dc" },
  aiMissingTitle: { color: "#6d5410", fontSize: 11, fontWeight: "900", marginBottom: 3 },
  aiMissingText: { color: "#6d5410", fontSize: 11, lineHeight: 15 },
  bg: { flex: 1 }, safe: { flex: 1 }, keyboard: { flex: 1 }, container: { padding: 16, paddingBottom: 105 },
  notice: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14, marginBottom: 12, borderRadius: 15, backgroundColor: "#edf7ee", borderWidth: 1, borderColor: "#cce3cf" }, noticeText: { flex: 1, color: "#455448", fontSize: 11, lineHeight: 17 }, noticeStrong: { color: "#225d29", fontWeight: "900" },
  card: { padding: 16, marginBottom: 13, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 3 },
  sectionTitle: { color: "#225d29", fontSize: 17, fontWeight: "900" }, sectionSubtitle: { color: "#747d75", marginTop: 3, marginBottom: 15, fontSize: 11, lineHeight: 16 },
  profileBox: { flexDirection: "row", alignItems: "center", gap: 11, padding: 11, borderRadius: 16, backgroundColor: "#f2f8f3" }, profileDetails: { flex: 1, minWidth: 0 }, profileName: { color: "#253328", fontWeight: "900" }, profileMeta: { color: "#707a72", marginTop: 2, fontSize: 11, lineHeight: 15 },
  profileErrorBox: { flexDirection: "row", alignItems: "center", gap: 9, padding: 11, borderRadius: 16, backgroundColor: "#fff3f2", borderWidth: 1, borderColor: "#efcfcb" }, profileErrorTitle: { color: "#8d3029", fontWeight: "900" }, profileErrorText: { color: "#8a5b57", marginTop: 2, fontSize: 11, lineHeight: 13 }, retryProfile: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: "#2e7d32" }, retryProfileText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  label: { color: "#344438", marginBottom: 8, fontSize: 11, fontWeight: "900" }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 }, chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20, backgroundColor: "#f3f5f3", borderWidth: 1, borderColor: "#dce3dd" }, chipActive: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" }, chipText: { color: "#667068", fontSize: 11, fontWeight: "800" }, chipTextActive: { color: "#fff" },
  urgency: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 9, opacity: 0.55 }, urgency_low: { backgroundColor: "#dff2e2" }, urgency_medium: { backgroundColor: "#ffeab8" }, urgency_high: { backgroundColor: "#ffdada" }, urgencySelected: { opacity: 1, borderWidth: 2, borderColor: "#2e7d32" }, urgencyText: { color: "#3d493f", fontSize: 11, fontWeight: "900" },
  input: { minHeight: 48, paddingHorizontal: 13, marginBottom: 11, color: "#243128", backgroundColor: "#f5f7f5", borderWidth: 1, borderColor: "#dfe5df", borderRadius: 11 }, textArea: { minHeight: 100, paddingTop: 13 },
  dateRow: { flexDirection: "row", gap: 9, marginBottom: 12 }, dateButton: { flex: 1, minWidth: 0, minHeight: 61, flexDirection: "row", alignItems: "center", gap: 9, padding: 10, borderRadius: 11, backgroundColor: "#f5f8f5", borderWidth: 1, borderColor: "#dfe5df" }, dateCopy: { flex: 1, minWidth: 0 }, dateLabel: { color: "#7a847c", fontSize: 10, fontWeight: "800", textTransform: "uppercase" }, dateValue: { color: "#344438", marginTop: 3, fontSize: 11, lineHeight: 14, fontWeight: "800" },
  imagePicker: { position: "relative", height: 155, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 13, backgroundColor: "#f2f7f2", borderWidth: 1, borderStyle: "dashed", borderColor: "#a8c7ad" }, image: { width: "100%", height: "100%", resizeMode: "cover" }, imageTitle: { color: "#2e7d32", marginTop: 6, fontWeight: "900" }, imageHint: { color: "#858e87", marginTop: 3, fontSize: 11 }, removePhoto: { position: "absolute", top: 8, right: 8, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#bd3030" }, changePhoto: { position: "absolute", left: 8, bottom: 8, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.94)" }, changePhotoText: { color: "#2e7d32", fontSize: 11, fontWeight: "900" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, switchCopy: { flex: 1, minWidth: 0 }, switchTitle: { color: "#2f3c32", fontWeight: "900" }, switchHint: { color: "#7b847d", marginTop: 3, fontSize: 11, lineHeight: 13 }, meetingFields: { paddingTop: 15, marginTop: 13, borderTopWidth: 1, borderTopColor: "#e2e8e3" }, preferredNote: { color: "#76560e", padding: 10, marginBottom: 11, borderRadius: 9, backgroundColor: "#fff5d9", fontSize: 11, lineHeight: 14 },
  submit: { height: 55, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, backgroundColor: "#2e7d32", elevation: 4 }, submitText: { color: "#fff", fontSize: 14, fontWeight: "900" }, disabled: { opacity: 0.6 },
});