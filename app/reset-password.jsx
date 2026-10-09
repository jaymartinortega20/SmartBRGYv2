import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";

import { supabase } from "../lib/supabase";

const readRecoveryParameters = (url) => {
  const [beforeHash, fragment = ""] = String(url || "").split("#");
  const query = beforeHash.includes("?")
    ? beforeHash.slice(beforeHash.indexOf("?") + 1)
    : "";
  return new URLSearchParams([query, fragment].filter(Boolean).join("&"));
};

export default function ResetPassword() {
  const router = useRouter();
  const processedUrl = useRef("");
  const [recoveryState, setRecoveryState] = useState("checking");
  const [recoveryError, setRecoveryError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    const establishRecoverySession = async (incomingUrl) => {
      if (!incomingUrl || processedUrl.current === incomingUrl) return false;
      processedUrl.current = incomingUrl;

      try {
        const parameters = readRecoveryParameters(incomingUrl);
        const linkError =
          parameters.get("error_description") || parameters.get("error");
        if (linkError) throw new Error(linkError);

        const accessToken = parameters.get("access_token");
        const refreshToken = parameters.get("refresh_token");
        const code = parameters.get("code");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          return false;
        }

        if (mounted) {
          setRecoveryError("");
          setRecoveryState("ready");
        }
        return true;
      } catch (error) {
        if (mounted) {
          setRecoveryError(
            error.message || "This password reset link is invalid or has expired.",
          );
          setRecoveryState("invalid");
        }
        return false;
      }
    };

    const initialize = async () => {
      const initialUrl = await Linking.getInitialURL();
      const linked = await establishRecoverySession(initialUrl);
      if (linked || !mounted) return;

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        setRecoveryState("ready");
      } else {
        setRecoveryError("This password reset link is invalid or has expired.");
        setRecoveryState("invalid");
      }
    };

    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void establishRecoverySession(url);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (mounted && event === "PASSWORD_RECOVERY" && session) {
          setRecoveryError("");
          setRecoveryState("ready");
        }
      },
    );

    void initialize();

    return () => {
      mounted = false;
      linkSubscription.remove();
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async () => {
    if (password.length < 8) {
      Alert.alert(
        "Password too short",
        "Use at least 8 characters for your new password.",
      );
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Re-enter the same new password.");
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();
      Alert.alert(
        "Password updated",
        "Your password was changed successfully. You can now sign in.",
        [{ text: "Go to login", onPress: () => router.replace("/login") }],
      );
    } catch (error) {
      console.log("Password update failed:", error);
      Alert.alert(
        "Unable to update password",
        error.message || "Request another reset link and try again.",
      );
    } finally {
      setSaving(false);
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
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                {recoveryState === "checking" ? (
                  <ActivityIndicator color="#2e7d32" size="large" />
                ) : (
                  <Ionicons
                    name={
                      recoveryState === "ready"
                        ? "key-outline"
                        : "alert-circle-outline"
                    }
                    size={34}
                    color={recoveryState === "ready" ? "#2e7d32" : "#b23a35"}
                  />
                )}
              </View>

              <Text style={styles.title}>
                {recoveryState === "checking"
                  ? "Verifying reset link"
                  : recoveryState === "ready"
                    ? "Create a new password"
                    : "Reset link unavailable"}
              </Text>

              <Text style={styles.subtitle}>
                {recoveryState === "checking"
                  ? "Please wait while we verify your secure link."
                  : recoveryState === "ready"
                    ? "Choose a strong password that you have not used for this account before."
                    : recoveryError}
              </Text>

              {recoveryState === "ready" && (
                <>
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>New password</Text>
                    <View style={styles.inputContainer}>
                      <Ionicons name="lock-closed-outline" size={19} color="#667268" />
                      <TextInput
                        style={styles.input}
                        placeholder="At least 8 characters"
                        placeholderTextColor="#929a94"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="new-password"
                        value={password}
                        onChangeText={setPassword}
                        editable={!saving}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword((current) => !current)}
                        accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                      >
                        <Ionicons
                          name={showPassword ? "eye-off-outline" : "eye-outline"}
                          size={21}
                          color="#536158"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Confirm new password</Text>
                    <View style={styles.inputContainer}>
                      <Ionicons name="checkmark-circle-outline" size={19} color="#667268" />
                      <TextInput
                        style={styles.input}
                        placeholder="Re-enter your new password"
                        placeholderTextColor="#929a94"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="new-password"
                        returnKeyType="done"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        onSubmitEditing={handleUpdatePassword}
                        editable={!saving}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, saving && styles.buttonDisabled]}
                    onPress={handleUpdatePassword}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
                        <Text style={styles.primaryText}>UPDATE PASSWORD</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {recoveryState === "invalid" && (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => router.replace("/forgotPassword")}
                >
                  <Ionicons name="refresh-outline" size={20} color="#fff" />
                  <Text style={styles.primaryText}>REQUEST A NEW LINK</Text>
                </TouchableOpacity>
              )}

              {recoveryState !== "checking" && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.replace("/login")}
                >
                  <Text style={styles.secondaryText}>Back to login</Text>
                </TouchableOpacity>
              )}
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
    paddingVertical: 32,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    alignItems: "center",
    padding: 23,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 16,
    elevation: 7,
    shadowColor: "#153c1c",
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  iconCircle: {
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9f5eb",
    borderRadius: 22,
    marginBottom: 15,
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
  fieldGroup: { width: "100%", marginBottom: 14 },
  label: {
    color: "#304336",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7,
  },
  inputContainer: {
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
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 5,
    paddingHorizontal: 16,
    backgroundColor: "#2e7d32",
    borderRadius: 14,
  },
  buttonDisabled: { opacity: 0.68 },
  primaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  secondaryButton: { paddingHorizontal: 14, paddingVertical: 15 },
  secondaryText: { color: "#2e7d32", fontSize: 13, fontWeight: "800" },
});
