import React, { useCallback, useEffect, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import GradientHeader from "../../components/GradientHeader";
import { supabase } from "../../lib/supabase";

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const stored = await AsyncStorage.getItem("currentUser");
      const parsed = stored ? JSON.parse(stored) : {};
      if (!parsed.id) {
        setUser(parsed);
        return;
      }
      const { data, error } = await supabase.from("profiles").select("*").eq("id", parsed.id).single();
      if (error) throw error;
      let profilePic = data.profile_image_path || null;
      if (profilePic && !profilePic.startsWith("http")) {
        const { data: signed } = await supabase.storage.from("profile-images").createSignedUrl(profilePic, 3600);
        profilePic = signed?.signedUrl || null;
      }
      const updated = {
        ...parsed,
        name: data.full_name,
        email: data.email || parsed.email,
        phone: data.phone,
        birthdate: data.birthdate,
        address: data.address,
        purok: data.purok,
        profilePic,
        profileImagePath: data.profile_image_path,
        role: data.role,
      };
      setUser(updated);
      await AsyncStorage.setItem("currentUser", JSON.stringify(updated));
    } catch (error) {
      console.warn("Unable to load profile:", error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  useEffect(() => {
    let channel;
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      channel = supabase
        .channel(`resident-profile-${data.user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${data.user.id}` },
          () => loadProfile()
        )
        .subscribe();
    });
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadProfile]);

  return (
    <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        <GradientHeader title="Resident Profile" rightIcon="settings-outline" onRightPress={() => router.push("/settings")} />
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadProfile(true)} tintColor="#2e7d32" />}
        >
          {loading ? <ActivityIndicator style={styles.loader} size="large" color="#2e7d32" /> :
            <>
              <View style={styles.identityCard}>
                <TouchableOpacity onPress={() => router.push("/profile/edit-profile")} activeOpacity={0.82}>
                  {user.profilePic ? <Image source={{ uri: user.profilePic }} style={styles.avatar} /> :
                    <View style={styles.avatarFallback}><Ionicons name="person" size={44} color="#2e7d32" /></View>}
                  <View style={styles.camera}><Ionicons name="camera" size={15} color="#fff" /></View>
                </TouchableOpacity>
                <Text style={styles.name}>{user.name || "Registered Resident"}</Text>
                <View style={styles.verified}><Ionicons name="checkmark-circle" size={15} color="#2e7d32" /><Text style={styles.verifiedText}>Verified Barangay Tubod Resident</Text></View>
                <Text style={styles.address}>{[user.purok, user.address].filter(Boolean).join(", ") || "Barangay Tubod, Toledo City"}</Text>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeading}><View><Text style={styles.cardTitle}>Resident Information</Text><Text style={styles.cardHint}>Information used for barangay services</Text></View><TouchableOpacity style={styles.editSmall} onPress={() => router.push("/profile/edit-profile")}><Ionicons name="create-outline" size={17} color="#2e7d32" /><Text style={styles.editSmallText}>Edit</Text></TouchableOpacity></View>
                <Info icon="person-outline" label="Full name" value={user.name} />
                <Info icon="mail-outline" label="Email address" value={user.email} />
                <Info icon="call-outline" label="Phone number" value={user.phone} />
                <Info icon="calendar-outline" label="Birthdate" value={user.birthdate} />
                <Info icon="location-outline" label="Registered address" value={[user.purok, user.address].filter(Boolean).join(", ")} last />
              </View>

              <TouchableOpacity style={styles.settingsButton} onPress={() => router.push("/settings")}>
                <View style={styles.settingsIcon}><Ionicons name="settings-outline" size={22} color="#2e7d32" /></View>
                <View style={styles.settingsCopy}><Text style={styles.settingsTitle}>Account Settings</Text><Text style={styles.settingsHint}>Notifications, security, support, and sign out</Text></View>
                <Ionicons name="chevron-forward" size={20} color="#8b958d" />
              </TouchableOpacity>
            </>}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function Info({ icon, label, value, last }) {
  return <View style={[styles.info, last && styles.infoLast]}><View style={styles.infoIcon}><Ionicons name={icon} size={19} color="#2e7d32" /></View><View style={styles.infoCopy}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value || "Not provided"}</Text></View></View>;
}

const styles = StyleSheet.create({
  bg: { flex: 1 }, safe: { flex: 1 }, container: { padding: 16, paddingBottom: 105 }, loader: { marginTop: 70 },
  identityCard: { alignItems: "center", padding: 22, marginBottom: 13, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dce7de", elevation: 4 },
  avatar: { width: 106, height: 106, borderRadius: 35, borderWidth: 3, borderColor: "#2e7d32" },
  avatarFallback: { width: 106, height: 106, alignItems: "center", justifyContent: "center", borderRadius: 35, backgroundColor: "#eaf5eb", borderWidth: 2, borderColor: "#8fc397" },
  camera: { position: "absolute", right: -4, bottom: -3, width: 31, height: 31, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#2e7d32", borderWidth: 3, borderColor: "#fff" },
  name: { color: "#203d26", marginTop: 14, textAlign: "center", fontSize: 21, fontWeight: "900" },
  verified: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, marginTop: 7, borderRadius: 20, backgroundColor: "#eaf6ec" },
  verifiedText: { color: "#286a31", fontSize: 8, fontWeight: "900" },
  address: { color: "#778179", marginTop: 8, textAlign: "center", fontSize: 10, lineHeight: 15 },
  card: { padding: 16, marginBottom: 13, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 3 },
  cardHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  cardTitle: { color: "#225d29", fontSize: 15, fontWeight: "900" }, cardHint: { color: "#858e87", marginTop: 2, fontSize: 8 },
  editSmall: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: "#eaf6ec" },
  editSmallText: { color: "#2e7d32", fontSize: 9, fontWeight: "900" },
  info: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#edf1ed" }, infoLast: { borderBottomWidth: 0 },
  infoIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#edf6ee" }, infoCopy: { flex: 1 },
  label: { color: "#858e87", fontSize: 8, fontWeight: "900", textTransform: "uppercase" }, value: { color: "#2e3b31", marginTop: 3, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  settingsButton: { flexDirection: "row", alignItems: "center", gap: 11, padding: 15, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 3 },
  settingsIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#eaf6ec" },
  settingsCopy: { flex: 1 }, settingsTitle: { color: "#2b3a2f", fontSize: 12, fontWeight: "900" }, settingsHint: { color: "#858e87", marginTop: 3, fontSize: 8, lineHeight: 12 },
});
