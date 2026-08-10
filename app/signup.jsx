import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { FunctionsHttpError } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "../lib/supabase";

const BARANGAY_ADDRESS = "Barangay Tubod, Toledo City";
const AREAS = ["Sitio Ibabaw", "Drilling", "Bulok-bulok", "Centro", "Gawad Kalinga", "Lawm Tabay", "Bakhaw", "Cajocson"];
const pad = (value) => String(value).padStart(2, "0");
const toDateValue = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const displayDate = (date) => date?.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

export default function Signup() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [birthdate, setBirthdate] = useState(null);
  const [purok, setPurok] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showPurok, setShowPurok] = useState(false);
  const [idFront, setIdFront] = useState(null);
  const [idBack, setIdBack] = useState(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function pickId(setter) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Photo access required", "Allow photo access to attach your valid ID.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: true, aspect: [16, 10] });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) return Alert.alert("File too large", "Each ID image must be 5 MB or smaller.");
    setter(asset);
  }

  function validate() {
    if (!fullName.trim() || !birthdate || !purok || !phone.trim() || !email.trim() || !password || !confirm) {
      Alert.alert("Incomplete registration", "Complete all required resident and account information.");
      return false;
    }
    if (fullName.trim().split(/\s+/).length < 2) {
      Alert.alert("Complete name required", "Enter your first and last name as shown on your valid ID.");
      return false;
    }
    if (!/^09\d{9}$/.test(phone.replace(/[\s-]/g, ""))) {
      Alert.alert("Invalid phone number", "Enter an 11-digit Philippine mobile number beginning with 09.");
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return false;
    }
    if (password.length < 8) {
      Alert.alert("Weak password", "Use at least 8 characters for your password.");
      return false;
    }
    if (password !== confirm) {
      Alert.alert("Passwords do not match", "Re-type the same password.");
      return false;
    }
    if (!idFront || !idBack) {
      Alert.alert("Valid ID required", "Attach clear photos of the front and back of your valid ID.");
      return false;
    }
    if (!consent) {
      Alert.alert("Confirmation required", "Confirm that the registration details belong to you and match your valid ID.");
      return false;
    }
    return true;
  }

  function review() {
    if (!validate()) return;
    Alert.alert(
      "Review registration",
      `${fullName.trim()}\n${displayDate(birthdate)}\n${purok}, ${BARANGAY_ADDRESS}\n${email.trim().toLowerCase()}\n\nBoth sides of the valid ID will be submitted securely.`,
      [{ text: "Back and edit", style: "cancel" }, { text: "Confirm and register", onPress: submit }]
    );
  }

  async function submit() {
    if (submitting || !validate()) return;
    if (!isSupabaseConfigured) return Alert.alert("Setup required", "Connect the app to Supabase first.");
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("full_name", fullName.trim());
      form.append("birthdate", toDateValue(birthdate));
      form.append("address", BARANGAY_ADDRESS);
      form.append("purok", purok);
      form.append("phone", phone.replace(/[\s-]/g, ""));
      form.append("email", email.trim().toLowerCase());
      form.append("password", password);
      form.append("id_front", { uri: idFront.uri, name: idFront.fileName || "id-front.jpg", type: idFront.mimeType || "image/jpeg" });
      form.append("id_back", { uri: idBack.uri, name: idBack.fileName || "id-back.jpg", type: idBack.mimeType || "image/jpeg" });

      const { data, error } = await supabase.functions.invoke("registered-resident", { body: form });
      if (error) {
        let functionMessage = data?.error || data?.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const details = await error.context.json();
            functionMessage = details?.error || details?.message || functionMessage;
          } catch {
            // Keep the SDK error when the response is not JSON.
          }
        }
        throw new Error(functionMessage || error.message);
      }
      if (data?.error) throw new Error(data.error);

      Alert.alert("Account created", data?.emailVerificationRequired === false
        ? "Your resident account is ready. You may now log in."
        : "Check your email and verify your account before logging in.",
      [{ text: "Continue to login", onPress: () => router.replace("/login") }]);
    } catch (error) {
      Alert.alert("Registration failed", error.message || "Unable to create your account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ImageBackground source={require("../assets/images/background-bg.jpg")} style={styles.bg}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.brand}><Image source={require("../assets/images/logo.png")} style={styles.logo} resizeMode="contain" /><View><Text style={styles.brandName}>SmartBRGY</Text><Text style={styles.brandSubtitle}>Resident Registration</Text></View></View>
            <View style={styles.notice}><Ionicons name="shield-checkmark" size={22} color="#2e7d32" /><Text style={styles.noticeText}>Register only if you are a resident of Barangay Tubod. Your details should match the valid ID you submit.</Text></View>

            <Section title="Resident information" subtitle="Use the same information shown on your valid ID.">
              <Field label="Full name *" icon="person-outline"><TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="First name, middle name, last name" placeholderTextColor="#929a93" autoCapitalize="words" /></Field>
              <Text style={styles.fieldLabel}>Birthdate *</Text>
              <TouchableOpacity style={styles.select} onPress={() => setShowDate(true)}><Ionicons name="calendar-outline" size={20} color="#2e7d32" /><Text style={[styles.selectText, !birthdate && styles.placeholder]}>{birthdate ? displayDate(birthdate) : "Select birthdate"}</Text><Ionicons name="chevron-down" size={19} color="#7b867d" /></TouchableOpacity>
              <View style={styles.fixedAddress}><Ionicons name="location" size={21} color="#2e7d32" /><View><Text style={styles.fixedLabel}>BARANGAY ADDRESS</Text><Text style={styles.fixedValue}>{BARANGAY_ADDRESS}</Text></View></View>
              <Text style={styles.fieldLabel}>Purok / Sitio *</Text>
              <TouchableOpacity style={styles.select} onPress={() => setShowPurok(true)}><Ionicons name="map-outline" size={20} color="#2e7d32" /><Text style={[styles.selectText, !purok && styles.placeholder]}>{purok || "Select Purok or Sitio"}</Text><Ionicons name="chevron-down" size={19} color="#7b867d" /></TouchableOpacity>
              <Field label="Phone number *" icon="call-outline"><TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="09XXXXXXXXX" placeholderTextColor="#929a93" keyboardType="phone-pad" maxLength={13} /></Field>
            </Section>

            <Section title="Account security" subtitle="Your email will be used to verify and recover your account.">
              <Field label="Email address *" icon="mail-outline"><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="resident@email.com" placeholderTextColor="#929a93" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} /></Field>
              <PasswordField label="Password *" value={password} onChangeText={setPassword} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />
              <PasswordField label="Confirm password *" value={confirm} onChangeText={setConfirm} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} />
              <Text style={styles.passwordHint}>Use at least 8 characters.</Text>
            </Section>

            <Section title="Valid ID verification" subtitle="Attach clear, readable images. The barangay administrator can securely review these attachments.">
              <View style={styles.idGrid}>
                <IdCard label="Front of valid ID *" asset={idFront} onPress={() => pickId(setIdFront)} onRemove={() => setIdFront(null)} />
                <IdCard label="Back of valid ID *" asset={idBack} onPress={() => pickId(setIdBack)} onRemove={() => setIdBack(null)} />
              </View>
              <View style={styles.idReminder}><Ionicons name="information-circle-outline" size={18} color="#8a6209" /><Text style={styles.idReminderText}>Make sure your name and birthdate are readable. Accepted examples include government-issued IDs that show your identity.</Text></View>
            </Section>

            <TouchableOpacity style={styles.consent} onPress={() => setConsent((value) => !value)}>
              <Ionicons name={consent ? "checkbox" : "square-outline"} size={23} color={consent ? "#2e7d32" : "#77827a"} />
              <Text style={styles.consentText}>I confirm that these details are mine, I am a Barangay Tubod resident, and my registration information matches the attached valid ID.</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={submitting} onPress={review} activeOpacity={0.85}>
              <LinearGradient colors={["#257438", "#3c984d", "#d99d19"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.register, submitting && styles.disabled]}>
                {submitting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="person-add" size={20} color="#fff" /><Text style={styles.registerText}>Review and Register</Text></>}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.loginLink} onPress={() => router.replace("/login")}><Text style={styles.loginText}>Already registered? <Text style={styles.loginStrong}>Log in</Text></Text></TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <DatePicker visible={showDate} value={birthdate || new Date(2000, 0, 1)} onClose={() => setShowDate(false)} onConfirm={setBirthdate} />
      <PurokPicker visible={showPurok} value={purok} onClose={() => setShowPurok(false)} onConfirm={setPurok} />
    </ImageBackground>
  );
}

function Section({ title, subtitle, children }) { return <View style={styles.card}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text>{children}</View>; }
function Field({ label, icon, children }) { return <View><Text style={styles.fieldLabel}>{label}</Text><View style={styles.inputWrap}><Ionicons name={icon} size={19} color="#2e7d32" />{children}</View></View>; }
function PasswordField({ label, value, onChangeText, visible, onToggle }) { return <View><Text style={styles.fieldLabel}>{label}</Text><View style={styles.inputWrap}><Ionicons name="lock-closed-outline" size={19} color="#2e7d32" /><TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholder="Enter password" placeholderTextColor="#929a93" secureTextEntry={!visible} autoCapitalize="none" /><TouchableOpacity onPress={onToggle}><Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color="#6f7b72" /></TouchableOpacity></View></View>; }
function IdCard({ label, asset, onPress, onRemove }) { return <View style={styles.idColumn}><Text style={styles.fieldLabel}>{label}</Text><TouchableOpacity style={styles.idCard} onPress={onPress}>{asset ? <><Image source={{ uri: asset.uri }} style={styles.idImage} /><Pressable style={styles.removeId} onPress={onRemove}><Ionicons name="close" size={17} color="#fff" /></Pressable></> : <><Ionicons name="card-outline" size={27} color="#2e7d32" /><Text style={styles.idTitle}>Choose photo</Text><Text style={styles.idHint}>JPG, PNG or WEBP</Text></>}</TouchableOpacity></View>; }

function DatePicker({ visible, value, onClose, onConfirm }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (visible) setDraft(value); }, [value, visible]);
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.modalCard}><View style={styles.modalHead}><View><Text style={styles.modalKicker}>RESIDENT INFORMATION</Text><Text style={styles.modalTitle}>Select birthdate</Text></View><TouchableOpacity style={styles.modalClose} onPress={onClose}><Ionicons name="close" size={22} color="#627066" /></TouchableOpacity></View><View style={styles.dateBody}><DateTimePicker value={draft} mode="date" display="spinner" maximumDate={new Date()} minimumDate={new Date(1900, 0, 1)} themeVariant="light" onChange={(_, selected) => selected && setDraft(selected)} /></View><ModalActions onClose={onClose} onConfirm={() => { onConfirm(draft); onClose(); }} /></View></View></Modal>;
}
function PurokPicker({ visible, value, onClose, onConfirm }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (visible) setDraft(value); }, [value, visible]);
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.modalCard}><View style={styles.modalHead}><View><Text style={styles.modalKicker}>BARANGAY TUBOD</Text><Text style={styles.modalTitle}>Select Purok or Sitio</Text></View><TouchableOpacity style={styles.modalClose} onPress={onClose}><Ionicons name="close" size={22} color="#627066" /></TouchableOpacity></View><ScrollView style={styles.areaList}>{AREAS.map((area) => <TouchableOpacity key={area} style={[styles.areaRow, draft === area && styles.areaActive]} onPress={() => setDraft(area)}><Ionicons name={draft === area ? "radio-button-on" : "radio-button-off"} size={20} color={draft === area ? "#2e7d32" : "#8a958c"} /><Text style={[styles.areaText, draft === area && styles.areaTextActive]}>{area}</Text></TouchableOpacity>)}</ScrollView><ModalActions onClose={onClose} disabled={!draft} onConfirm={() => { if (draft) { onConfirm(draft); onClose(); } }} /></View></View></Modal>;
}
function ModalActions({ onClose, onConfirm, disabled }) { return <View style={styles.modalActions}><TouchableOpacity style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={[styles.confirmButton, disabled && styles.disabled]} disabled={disabled} onPress={onConfirm}><Ionicons name="checkmark" size={18} color="#fff" /><Text style={styles.confirmText}>Confirm</Text></TouchableOpacity></View>; }

const styles = StyleSheet.create({
  bg: { flex: 1 }, safe: { flex: 1 }, flex: { flex: 1 }, content: { width: "100%", maxWidth: 560, alignSelf: "center", padding: 16, paddingBottom: 38 },
  brand: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginVertical: 10 }, logo: { width: 76, height: 76 }, brandName: { color: "#246e31", fontSize: 24, fontWeight: "900" }, brandSubtitle: { color: "#657068", marginTop: 2, fontSize: 11, fontWeight: "800" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 13, marginBottom: 12, borderRadius: 15, backgroundColor: "#eaf6ec", borderWidth: 1, borderColor: "#cbe2ce" }, noticeText: { flex: 1, color: "#526457", fontSize: 9, lineHeight: 14 },
  card: { padding: 16, marginBottom: 12, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dce7de", elevation: 3 }, sectionTitle: { color: "#225d29", fontSize: 16, fontWeight: "900" }, sectionSubtitle: { color: "#7d877f", marginTop: 3, marginBottom: 15, fontSize: 9, lineHeight: 14 },
  fieldLabel: { color: "#445448", marginBottom: 6, fontSize: 9, fontWeight: "900" }, inputWrap: { minHeight: 49, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, marginBottom: 12, borderRadius: 12, backgroundColor: "#f4f7f4", borderWidth: 1, borderColor: "#dce4dd" }, input: { flex: 1, minWidth: 0, color: "#26342a", paddingVertical: 12, fontSize: 11 },
  select: { minHeight: 51, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, marginBottom: 12, borderRadius: 12, backgroundColor: "#f4f7f4", borderWidth: 1, borderColor: "#dce4dd" }, selectText: { flex: 1, color: "#26342a", fontSize: 11, fontWeight: "700" }, placeholder: { color: "#929a93", fontWeight: "500" },
  fixedAddress: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, marginBottom: 12, borderRadius: 13, backgroundColor: "#eaf6ec", borderLeftWidth: 4, borderLeftColor: "#2e7d32" }, fixedLabel: { color: "#6b7a6e", fontSize: 7, fontWeight: "900" }, fixedValue: { color: "#286731", marginTop: 3, fontSize: 12, fontWeight: "900" }, passwordHint: { color: "#7f8981", marginTop: -5, fontSize: 8 },
  idGrid: { flexDirection: "row", gap: 9 }, idColumn: { flex: 1 }, idCard: { position: "relative", height: 128, overflow: "hidden", alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#f2f7f2", borderWidth: 1, borderStyle: "dashed", borderColor: "#91b997" }, idImage: { width: "100%", height: "100%", resizeMode: "cover" }, removeId: { position: "absolute", right: 7, top: 7, width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "rgba(162,35,35,0.9)" }, idTitle: { color: "#2e7d32", marginTop: 6, fontSize: 10, fontWeight: "900" }, idHint: { color: "#89928b", marginTop: 3, fontSize: 7 },
  idReminder: { flexDirection: "row", alignItems: "flex-start", gap: 7, padding: 10, marginTop: 11, borderRadius: 11, backgroundColor: "#fff5d9" }, idReminderText: { flex: 1, color: "#755817", fontSize: 8, lineHeight: 13 },
  consent: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 14, marginBottom: 12, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.95)", borderWidth: 1, borderColor: "#dce6de" }, consentText: { flex: 1, color: "#536057", fontSize: 9, lineHeight: 14 },
  register: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 15, elevation: 4 }, registerText: { color: "#fff", fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.5 }, loginLink: { alignItems: "center", padding: 15 }, loginText: { color: "#69736b", fontSize: 10 }, loginStrong: { color: "#2e7d32", fontWeight: "900" },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 19, backgroundColor: "rgba(15,35,20,0.64)" }, modalCard: { width: "100%", maxWidth: 440, maxHeight: "82%", overflow: "hidden", borderRadius: 22, backgroundColor: "#fff", elevation: 14 }, modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 17, borderBottomWidth: 1, borderBottomColor: "#e4ebe5" }, modalKicker: { color: "#2e7d32", fontSize: 7, fontWeight: "900", letterSpacing: 1 }, modalTitle: { color: "#26352a", marginTop: 4, fontSize: 17, fontWeight: "900" }, modalClose: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#f1f5f2" }, dateBody: { minHeight: 225, justifyContent: "center", backgroundColor: "#fff" },
  areaList: { maxHeight: 390, paddingHorizontal: 12 }, areaRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: "#edf1ed" }, areaActive: { backgroundColor: "#eef7ef" }, areaText: { color: "#4d5b50", fontSize: 12, fontWeight: "700" }, areaTextActive: { color: "#276730", fontWeight: "900" },
  modalActions: { flexDirection: "row", gap: 9, padding: 14, borderTopWidth: 1, borderTopColor: "#e4ebe5", backgroundColor: "#fafcfa" }, cancel: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 11, borderWidth: 1, borderColor: "#d8e2d9" }, cancelText: { color: "#5d6960", fontWeight: "900" }, confirmButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 12, borderRadius: 11, backgroundColor: "#2e7d32" }, confirmText: { color: "#fff", fontWeight: "900" },
});
