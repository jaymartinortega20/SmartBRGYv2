import React, { useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { GRADIENT } from "../constants/theme";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const handleReset = async () => {
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert("Setup required", "Connect the app to Supabase first.");
      return;
    }

    try {
      setSending(true);
      const redirectTo = Linking.createURL("reset-password");
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo },
      );

      if (error) throw error;
      setSent(true);
    } catch (error) {
      console.log("Password reset request failed:", error);
      Alert.alert(
        "Unable to send email",
        error.message || "Please wait a moment and try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <ImageBackground
      source={require("../assets/images/background-bg.jpg")}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.safeArea}
          behavior="padding"
        >
          <ScrollView
            contentContainerStyle={styles.screen}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.replace("/login")}
              accessibilityRole="button"
              accessibilityLabel="Back to login"
            >
              <Ionicons name="arrow-back" size={22} color="#1f6f32" />
            </TouchableOpacity>

            <View style={styles.brandBlock}>
              <Image
                source={require("../assets/images/logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.appName}>SmartBRGY</Text>
              <Text style={styles.barangay}>Barangay Tubod, Toledo City</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <Ionicons
                  name={sent ? "mail-open-outline" : "lock-closed-outline"}
                  size={31}
                  color="#2e7d32"
                />
              </View>

              <Text style={styles.title}>
                {sent ? "Check your email" : "Forgot your password?"}
              </Text>

              <Text style={styles.subtitle}>
                {sent
                  ? `If an account exists for ${normalizedEmail}, a secure password reset link has been sent.`
                  : "Enter the email registered to your resident account. We will send you a secure reset link."}
              </Text>

              {!sent && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email address</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="mail-outline" size={20} color="#667268" />
                    <TextInput
                      style={styles.input}
                      placeholder="name@example.com"
                      placeholderTextColor="#929a94"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      keyboardType="email-address"
                      returnKeyType="send"
                      value={email}
                      onChangeText={setEmail}
                      onSubmitEditing={handleReset}
                      editable={!sending}
                    />
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryButton, sending && styles.buttonDisabled]}
                onPress={sent ? () => router.replace("/login") : handleReset}
                disabled={sending}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={GRADIENT}
                  style={styles.buttonGradient}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name={sent ? "log-in-outline" : "paper-plane-outline"}
                        size={19}
                        color="#fff"
                      />
                      <Text style={styles.primaryText}>
                        {sent ? "BACK TO LOGIN" : "SEND RESET LINK"}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {sent && (
                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={() => setSent(false)}
                >
                  <Text style={styles.resendText}>Use a different email</Text>
                </TouchableOpacity>
              )}

              <View style={styles.securityNote}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={18}
                  color="#2e7d32"
                />
                <Text style={styles.securityText}>
                  For your security, the reset link expires after a limited time.
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  screen: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  backButton: {
    position: "absolute",
    top: 22,
    left: 20,
    zIndex: 2,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 14,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  brandBlock: { alignItems: "center", marginBottom: 18 },
  logo: { width: 104, height: 104 },
  appName: {
    color: "#1f6f32",
    fontSize: 25,
    fontWeight: "900",
    marginTop: -5,
  },
  barangay: { color: "#5c675e", fontSize: 12, marginTop: 3 },
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    alignItems: "center",
    padding: 22,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 16,
    elevation: 7,
    shadowColor: "#153c1c",
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  iconCircle: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9f5eb",
    borderRadius: 21,
    marginBottom: 14,
  },
  title: {
    color: "#18251b",
    fontSize: 23,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "#637067",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 21,
  },
  fieldGroup: { width: "100%" },
  label: {
    color: "#304336",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
  },
  inputContainer: {
    width: "100%",
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    backgroundColor: "#f6f8f6",
    borderWidth: 1,
    borderColor: "#dbe4dc",
    borderRadius: 14,
  },
  input: { flex: 1, color: "#152219", fontSize: 15, paddingVertical: 13 },
  primaryButton: {
    width: "100%",
    marginTop: 18,
    borderRadius: 14,
    overflow: "hidden",
  },
  buttonDisabled: { opacity: 0.68 },
  buttonGradient: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 16,
  },
  primaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  resendButton: { paddingHorizontal: 12, paddingVertical: 13 },
  resendText: { color: "#2e7d32", fontSize: 13, fontWeight: "800" },
  securityNote: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 18,
    padding: 12,
    backgroundColor: "#f1f7f2",
    borderRadius: 12,
  },
  securityText: { flex: 1, color: "#56625a", fontSize: 11, lineHeight: 16 },
});
