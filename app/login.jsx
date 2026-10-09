import React, { useRef, useState } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

import { isNetworkError, isSupabaseConfigured, supabase } from "../lib/supabase";
import { getPushPreference, registerForPushNotificationsAsync } from "../lib/pushNotifications";
import { GRADIENT } from "../constants/theme";

export default function Login() {
  const router = useRouter();
  const passwordRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      Alert.alert("Missing information", "Enter your email address and password.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert("Setup required", "Connect the app to Supabase first.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (profileError) throw profileError;

      if (profile.is_banned) {
        await supabase.auth.signOut();
        throw new Error("ACCOUNT_RESTRICTED");
      }

      const userData = {
        id: data.user.id,
        email: data.user.email,
        name: profile.full_name,
        phone: profile.phone,
        birthdate: profile.birthdate,
        address: profile.address,
        purok: profile.purok,
        profilePic: profile.profile_image_path,
        role: profile.role,
      };

      await AsyncStorage.setItem("currentUser", JSON.stringify(userData));
      await AsyncStorage.setItem(
        "isAdmin",
        profile.role === "admin" ? "true" : "false",
      );

      // Re-link this phone's push token to the account that just signed in.
      getPushPreference()
        .then((enabled) => (enabled ? registerForPushNotificationsAsync() : null))
        .catch(() => undefined);

      if (profile.role === "admin") {
        router.replace("/admin");
      } else {
        const hasOnboarded = await AsyncStorage.getItem("hasOnboarded");
        router.replace(hasOnboarded === "true" ? "/(tabs)" : "/onboarding");
      }
    } catch (loginError) {
      console.log(loginError);
      const rawMessage = loginError?.message || "";
      const lowerMessage = rawMessage.toLowerCase();
      const message = rawMessage === "ACCOUNT_RESTRICTED" || lowerMessage.includes("banned")
        ? "This resident account has been restricted by the barangay administrator. Contact the Barangay Tubod office for assistance."
        : lowerMessage.includes("email not confirmed")
          ? "Please verify your email before logging in."
          : isNetworkError(loginError)
            ? "Unable to reach SmartBRGY. Check your internet connection and try again."
            : lowerMessage.includes("is_banned") || lowerMessage.includes("column")
              ? "The SmartBRGY database needs an update. Please contact the barangay administrator."
              : "The email address or password is incorrect.";
      Alert.alert("Login failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require("../assets/images/background-bg.jpg")}
      style={styles.bg}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding"
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.brand}>
              <Image
                source={require("../assets/images/logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
              <View>
                <Text style={styles.brandName}>SmartBRGY</Text>
                <Text style={styles.brandSubtitle}>Resident Login</Text>
              </View>
            </View>

            <View style={styles.notice}>
              <Ionicons name="shield-checkmark" size={22} color="#2e7d32" />
              <Text style={styles.noticeText}>
                Secure access for registered residents of Barangay Tubod. Use the email address connected to your resident account.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Account access</Text>
              <Text style={styles.sectionSubtitle}>
                Enter your registered email and password to continue.
              </Text>

              <Text style={styles.fieldLabel}>Email address *</Text>
              <View
                style={[
                  styles.inputWrap,
                  focusedField === "email" && styles.inputWrapFocused,
                ]}
              >
                <Ionicons name="mail-outline" size={19} color="#2e7d32" />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField("")}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  placeholder="resident@email.com"
                  placeholderTextColor="#929a93"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  selectionColor="#2e7d32"
                  editable={!loading}
                />
              </View>

              <View style={styles.passwordHeading}>
                <Text style={styles.fieldLabel}>Password *</Text>
                <TouchableOpacity
                  onPress={() => router.push("/forgotPassword")}
                  disabled={loading}
                  hitSlop={8}
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              <View
                style={[
                  styles.inputWrap,
                  focusedField === "password" && styles.inputWrapFocused,
                ]}
              >
                <Ionicons name="lock-closed-outline" size={19} color="#2e7d32" />
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField("")}
                  onSubmitEditing={handleLogin}
                  placeholder="Enter password"
                  placeholderTextColor="#929a93"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  selectionColor="#2e7d32"
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((value) => !value)}
                  disabled={loading}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#6f7b72"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                disabled={loading}
                onPress={handleLogin}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.loginButton, loading && styles.disabled]}
                >
                  {loading ? (
                    <>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.loginButtonText}>Signing in...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="log-in" size={20} color="#fff" />
                      <Text style={styles.loginButtonText}>Log In</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.registerLink}
              onPress={() => router.push("/signup")}
              disabled={loading}
            >
              <Text style={styles.registerLinkText}>
                New Barangay Tubod resident?{" "}
                <Text style={styles.registerStrong}>Create an account</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.securityNote}>
              <Ionicons name="lock-closed-outline" size={15} color="#607064" />
              <Text style={styles.securityText}>
                Your login details are securely protected.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 560,
    minHeight: "100%",
    alignSelf: "center",
    justifyContent: "center",
    padding: 16,
    paddingBottom: 38,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginVertical: 10,
  },
  logo: { width: 76, height: 76 },
  brandName: { color: "#246e31", fontSize: 24, fontWeight: "900" },
  brandSubtitle: {
    color: "#657068",
    marginTop: 2,
    fontSize: 11,
    fontWeight: "800",
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 13,
    marginBottom: 12,
    borderRadius: 15,
    backgroundColor: "#eaf6ec",
    borderWidth: 1,
    borderColor: "#cbe2ce",
  },
  noticeText: { flex: 1, color: "#526457", fontSize: 11, lineHeight: 14 },
  card: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#dce7de",
    elevation: 3,
  },
  sectionTitle: { color: "#225d29", fontSize: 16, fontWeight: "900" },
  sectionSubtitle: {
    color: "#7d877f",
    marginTop: 3,
    marginBottom: 15,
    fontSize: 11,
    lineHeight: 14,
  },
  fieldLabel: {
    color: "#445448",
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "900",
  },
  passwordHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  forgotText: {
    color: "#2e7d32",
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "900",
  },
  inputWrap: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: "#f4f7f4",
    borderWidth: 1,
    borderColor: "#dce4dd",
  },
  inputWrapFocused: {
    borderColor: "#75aa7c",
    backgroundColor: "#f8fbf8",
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: "#26342a",
    paddingVertical: 12,
    fontSize: 11,
  },
  loginButton: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    borderRadius: 15,
    elevation: 4,
  },
  loginButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  registerLink: { alignItems: "center", padding: 15 },
  registerLinkText: { color: "#69736b", textAlign: "center", fontSize: 11 },
  registerStrong: { color: "#2e7d32", fontWeight: "900" },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: -3,
  },
  securityText: { color: "#718075", fontSize: 10, fontWeight: "700" },
});
