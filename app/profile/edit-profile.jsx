import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

import GradientHeader from "../../components/GradientHeader";
import { getCurrentUserId, supabase } from "../../lib/supabase";
import { openNativePicker } from "../../lib/datePicker";

const ADDRESS = "Barangay Tubod, Toledo City";
const AREAS = ["Sitio Ibabaw", "Drilling", "Bulok-bulok", "Centro", "Gawad Kalinga", "Lawm Tabay", "Bakhaw", "Cajocson"];
const pad = (value) => String(value).padStart(2, "0");
const dateValue = (value) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const parseDate = (value) => value ? new Date(`${value}T12:00:00`) : new Date(2000, 0, 1);
const displayDate = (value) => value.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

export default function EditProfile() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [storedUser, setStoredUser] = useState({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthdate, setBirthdate] = useState(new Date(2000, 0, 1));
  const [purok, setPurok] = useState("");
  const [profilePic, setProfilePic] = useState("");
  const [profileImagePath, setProfileImagePath] = useState("");
  const [newAsset, setNewAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const stored = await AsyncStorage.getItem("currentUser");
      let parsed = {};
      try { parsed = stored ? JSON.parse(stored) : {}; } catch { parsed = {}; }
      const currentId = await getCurrentUserId();
      if (!currentId) throw new Error("Your session has expired. Please log in again.");
      setStoredUser({ ...parsed, id: currentId });
      setUserId(currentId);
      const { data, error } = await supabase.from("profiles").select("*").eq("id", currentId).single();
      if (error) throw error;
      setName(data.full_name || "");
      setEmail(data.email || parsed.email || "");
      setPhone(data.phone || "");
      setBirthdate(parseDate(data.birthdate));
      setPurok(data.purok || "");
      setProfileImagePath(data.profile_image_path || "");
      if (data.profile_image_path) {
        const { data: signed } = await supabase.storage.from("profile-images").createSignedUrl(data.profile_image_path, 3600);
        setProfilePic(signed?.signedUrl || "");
      }
    } catch (error) {
      Alert.alert("Unable to load profile", error.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert("Photo access required", "Allow photo access to change your profile picture.");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.75 });
    if (!result.canceled) {
      setNewAsset(result.assets[0]);
      setProfilePic(result.assets[0].uri);
    }
  }

  async function save() {
    if (saving) return;
    if (name.trim().split(/\s+/).length < 2 || !/^09\d{9}$/.test(phone.replace(/[\s-]/g, "")) || !purok) {
      return Alert.alert("Check your information", "Enter your complete name, valid 09 phone number, and Purok or Sitio.");
    }
    setSaving(true);
    try {
      let savedPath = profileImagePath || null;
      if (newAsset) {
        const mimeType = String(newAsset.mimeType || "image/jpeg").toLowerCase();
        const imageType = mimeType === "image/png" ? { extension: "png", contentType: "image/png" }
          : mimeType === "image/webp" ? { extension: "webp", contentType: "image/webp" }
          : mimeType === "image/jpeg" || mimeType === "image/jpg" ? { extension: "jpg", contentType: "image/jpeg" }
          : null;
        if (!imageType) throw new Error("Use a JPG, PNG, or WebP photo for your profile picture.");
        const response = await fetch(newAsset.uri);
        const fileData = await response.arrayBuffer();
        if (fileData.byteLength > 5 * 1024 * 1024) throw new Error("The profile photo must be 5 MB or smaller.");
        savedPath = `${userId}/profile-${Date.now()}.${imageType.extension}`;
        const { error: uploadError } = await supabase.storage.from("profile-images").upload(savedPath, fileData, { contentType: imageType.contentType });
        if (uploadError) throw uploadError;
      }
      const updates = {
        full_name: name.trim(),
        phone: phone.replace(/[\s-]/g, ""),
        birthdate: dateValue(birthdate),
        address: ADDRESS,
        purok,
        profile_image_path: savedPath,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
      if (error) throw error;
      if (newAsset && profileImagePath && profileImagePath !== savedPath && !profileImagePath.startsWith("http")) {
        // Remove the replaced photo so old pictures don't pile up in storage.
        supabase.storage.from("profile-images").remove([profileImagePath]).catch(() => undefined);
      }
      await AsyncStorage.setItem("currentUser", JSON.stringify({
        ...storedUser,
        name: updates.full_name,
        email,
        phone: updates.phone,
        birthdate: updates.birthdate,
        address: ADDRESS,
        purok,
        profilePic,
        profileImagePath: savedPath,
      }));
      Alert.alert("Profile updated", "Your resident information has been saved.", [{ text: "Done", onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert("Unable to save profile", error.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg}>
      <SafeAreaView style={styles.safe}>
        <GradientHeader title="Edit Profile" rightIcon="close" onRightPress={() => router.back()} />
        {loading ? <ActivityIndicator style={styles.loader} size="large" color="#2e7d32" /> :
          <KeyboardAvoidingView style={styles.flex} behavior="padding">
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.photoCard}>
                <TouchableOpacity onPress={pickPhoto} style={styles.photoButton}>
                  {profilePic ? <Image source={{ uri: profilePic }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Ionicons name="person" size={40} color="#2e7d32" /></View>}
                  <View style={styles.camera}><Ionicons name="camera" size={17} color="#fff" /></View>
                </TouchableOpacity>
                <Text style={styles.photoTitle}>Resident profile photo</Text><Text style={styles.photoHint}>Tap the photo to replace it.</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Resident information</Text><Text style={styles.sectionHint}>Correct mistakes when needed. Your account email is managed separately for security.</Text>
                <Label text="Full name *" /><Input icon="person-outline" value={name} onChangeText={setName} placeholder="Complete resident name" />
                <Label text="Email address" /><View style={[styles.inputWrap, styles.readOnly]}><Ionicons name="mail-outline" size={19} color="#78847a" /><Text style={styles.readOnlyText}>{email}</Text><Ionicons name="lock-closed" size={15} color="#909a92" /></View>
                <Label text="Phone number *" /><Input icon="call-outline" value={phone} onChangeText={setPhone} placeholder="09XXXXXXXXX" keyboardType="phone-pad" />
                <Label text="Birthdate *" /><TouchableOpacity style={styles.inputWrap} onPress={() => openNativePicker({ value: birthdate, mode: "date", minimumDate: new Date(1900, 0, 1), maximumDate: new Date(), onConfirm: setBirthdate })}><Ionicons name="calendar-outline" size={19} color="#2e7d32" /><Text style={styles.selectValue}>{displayDate(birthdate)}</Text><Ionicons name="chevron-down" size={18} color="#7d887f" /></TouchableOpacity>
                <Label text="Barangay address" /><View style={styles.address}><Ionicons name="location" size={20} color="#2e7d32" /><View><Text style={styles.addressLabel}>FIXED SERVICE AREA</Text><Text style={styles.addressValue}>{ADDRESS}</Text></View></View>
                <Label text="Purok / Sitio *" /><View style={styles.chips}>{AREAS.map((area) => <TouchableOpacity key={area} style={[styles.chip, purok === area && styles.chipActive]} onPress={() => setPurok(area)}><Text style={[styles.chipText, purok === area && styles.chipTextActive]}>{area}</Text></TouchableOpacity>)}</View>
              </View>
              <TouchableOpacity style={[styles.save, saving && styles.disabled]} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="save-outline" size={20} color="#fff" /><Text style={styles.saveText}>Save Profile Changes</Text></>}</TouchableOpacity>
              <Text style={styles.securityHint}>Change your password from Account Settings.</Text>
            </ScrollView>
          </KeyboardAvoidingView>}
      </SafeAreaView>
    </ImageBackground>
  );
}

function Label({ text }) { return <Text style={styles.label}>{text}</Text>; }
function Input({ icon, ...props }) { return <View style={styles.inputWrap}><Ionicons name={icon} size={19} color="#2e7d32" /><TextInput {...props} style={styles.input} placeholderTextColor="#929a93" /></View>; }

const styles = StyleSheet.create({
  bg: { flex: 1 }, safe: { flex: 1 }, flex: { flex: 1 }, loader: { marginTop: 70 }, content: { width: "100%", maxWidth: 560, alignSelf: "center", padding: 16, paddingBottom: 36 },
  photoCard: { alignItems: "center", padding: 19, marginBottom: 12, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dce7de", elevation: 3 },
  photoButton: { position: "relative" }, avatar: { width: 104, height: 104, borderRadius: 34, borderWidth: 3, borderColor: "#2e7d32" }, avatarFallback: { width: 104, height: 104, alignItems: "center", justifyContent: "center", borderRadius: 34, backgroundColor: "#eaf6ec", borderWidth: 2, borderColor: "#8fc397" },
  camera: { position: "absolute", right: -5, bottom: -4, width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#2e7d32", borderWidth: 3, borderColor: "#fff" }, photoTitle: { color: "#2d4132", marginTop: 12, fontSize: 12, fontWeight: "900" }, photoHint: { color: "#828c84", marginTop: 3, fontSize: 8 },
  card: { padding: 16, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dce7de", elevation: 3 }, sectionTitle: { color: "#225d29", fontSize: 16, fontWeight: "900" }, sectionHint: { color: "#7d877f", marginTop: 3, marginBottom: 14, fontSize: 8, lineHeight: 13 },
  label: { color: "#455548", marginBottom: 6, fontSize: 9, fontWeight: "900" }, inputWrap: { minHeight: 49, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, marginBottom: 12, borderRadius: 12, backgroundColor: "#f4f7f4", borderWidth: 1, borderColor: "#dce4dd" }, input: { flex: 1, color: "#26342a", paddingVertical: 12, fontSize: 11 },
  readOnly: { backgroundColor: "#eef1ee" }, readOnlyText: { flex: 1, color: "#657068", fontSize: 10 }, selectValue: { flex: 1, color: "#29382e", fontSize: 11, fontWeight: "700" },
  address: { flexDirection: "row", alignItems: "center", gap: 9, padding: 13, marginBottom: 12, borderRadius: 12, backgroundColor: "#eaf6ec", borderLeftWidth: 4, borderLeftColor: "#2e7d32" }, addressLabel: { color: "#6f7c72", fontSize: 7, fontWeight: "900" }, addressValue: { color: "#286731", marginTop: 3, fontSize: 11, fontWeight: "900" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, backgroundColor: "#f3f5f3", borderWidth: 1, borderColor: "#dce3dd" }, chipActive: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" }, chipText: { color: "#667068", fontSize: 8, fontWeight: "800" }, chipTextActive: { color: "#fff" },
  save: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 13, borderRadius: 15, backgroundColor: "#2e7d32", elevation: 4 }, saveText: { color: "#fff", fontSize: 12, fontWeight: "900" }, disabled: { opacity: 0.55 }, securityHint: { color: "#778179", marginTop: 12, textAlign: "center", fontSize: 8 },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(15,35,20,0.64)" }, picker: { width: "100%", maxWidth: 440, overflow: "hidden", borderRadius: 22, backgroundColor: "#fff", elevation: 14 }, pickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 17, borderBottomWidth: 1, borderBottomColor: "#e4ebe5" }, pickerKicker: { color: "#2e7d32", fontSize: 7, fontWeight: "900", letterSpacing: 1 }, pickerTitle: { color: "#26352a", marginTop: 4, fontSize: 17, fontWeight: "900" }, pickerClose: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#f1f5f2" },
  pickerBody: { minHeight: 225, justifyContent: "center" }, pickerActions: { flexDirection: "row", gap: 9, padding: 14, borderTopWidth: 1, borderTopColor: "#e4ebe5", backgroundColor: "#fafcfa" }, cancel: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 11, borderWidth: 1, borderColor: "#d8e2d9" }, cancelText: { color: "#5d6960", fontWeight: "900" }, confirm: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 12, borderRadius: 11, backgroundColor: "#2e7d32" }, confirmText: { color: "#fff", fontWeight: "900" },
});
