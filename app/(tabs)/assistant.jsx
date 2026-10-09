import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Platform,
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
import { useRouter } from "expo-router";

import GradientHeader from "../../components/GradientHeader";
import { askAssistant } from "../../lib/ai";
import { getCurrentUserId } from "../../lib/supabase";

const SUGGESTIONS = [
  "What do I need for a Barangay Clearance?",
  "Unsa ang requirements sa Certificate of Indigency?",
  "What is the status of my document requests?",
  "Ano ang mga bagong announcement?",
];
const MAX_STORED_MESSAGES = 30;
const storageKey = (userId) => `assistantChat:${userId}`;
const welcome = {
  id: "welcome",
  role: "assistant",
  content: "Maayong adlaw! I'm the SmartBRGY Assistant. Ask me about barangay documents, fees, requirements, announcements, or the status of your requests. You can write in Bisaya, Tagalog, or English.",
};

export default function Assistant() {
  const router = useRouter();
  const scrollRef = useRef(null);
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([welcome]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Restore this resident's recent conversation on this phone.
  useEffect(() => {
    let active = true;
    (async () => {
      const id = await getCurrentUserId();
      if (!active || !id) return;
      setUserId(id);
      try {
        const stored = await AsyncStorage.getItem(storageKey(id));
        const parsed = stored ? JSON.parse(stored) : [];
        if (active && Array.isArray(parsed) && parsed.length) setMessages([welcome, ...parsed]);
      } catch {
        // Start fresh if the saved chat cannot be read.
      }
    })();
    return () => { active = false; };
  }, []);

  const persist = useCallback((next) => {
    if (!userId) return;
    const saved = next.filter((item) => item.id !== "welcome").slice(-MAX_STORED_MESSAGES);
    AsyncStorage.setItem(storageKey(userId), JSON.stringify(saved)).catch(() => undefined);
  }, [userId]);

  async function send(text) {
    const value = String(text ?? input).trim();
    if (!value || sending) return;
    if (value.length > 1500) return Alert.alert("Message too long", "Please keep your question under 1,500 characters.");

    const userMessage = { id: `u-${Date.now()}`, role: "user", content: value };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const history = next
        .filter((item) => item.id !== "welcome" && !item.failed)
        .map(({ role, content }) => ({ role, content }));
      const result = await askAssistant(history);
      const answer = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: result.reply,
        handoff: result.handoff || null,
        emergency: !!result.emergency,
      };
      const withAnswer = [...next, answer];
      setMessages(withAnswer);
      persist(withAnswer);
    } catch (error) {
      setMessages((current) => [...current, { id: `e-${Date.now()}`, role: "assistant", failed: true, content: error.message }]);
    } finally {
      setSending(false);
    }
  }

  function clearChat() {
    Alert.alert("Start a new conversation?", "This clears the assistant chat on this phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => {
        setMessages([welcome]);
        if (userId) AsyncStorage.removeItem(storageKey(userId)).catch(() => undefined);
      } },
    ]);
  }

  function openHelpDesk(handoff) {
    router.navigate({
      pathname: "/feedback",
      params: { prefillCategory: handoff.category, prefillDetails: handoff.details, prefillAt: String(Date.now()) },
    });
  }

  return (
    <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg} resizeMode="cover">
      <SafeAreaView style={styles.safe}>
        <GradientHeader title="SmartBRGY Assistant" subtitle="AI helper for barangay services" rightIcon="refresh" onRightPress={clearChat} />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            <View style={styles.notice}>
              <Ionicons name="sparkles" size={16} color="#6d4c00" />
              <Text style={styles.noticeText}>AI answers can make mistakes. Official decisions, schedules, and approvals come only from Barangay Tubod officials.</Text>
            </View>

            {messages.map((message) => (
              <View key={message.id} style={[styles.row, message.role === "user" && styles.rowUser]}>
                {message.role === "assistant" && (
                  <View style={[styles.avatar, message.failed && styles.avatarError]}>
                    <Ionicons name={message.failed ? "alert" : "sparkles"} size={15} color="#fff" />
                  </View>
                )}
                <View style={[styles.bubble, message.role === "user" ? styles.userBubble : styles.botBubble, message.failed && styles.errorBubble]}>
                  <Text style={[styles.bubbleText, message.role === "user" && styles.userText]}>{message.content}</Text>
                  {message.emergency && (
                    <TouchableOpacity style={styles.emergency} onPress={() => Linking.openURL("tel:911")}>
                      <Ionicons name="call" size={16} color="#fff" />
                      <Text style={styles.emergencyText}>Call 911 now</Text>
                    </TouchableOpacity>
                  )}
                  {message.handoff && (
                    <TouchableOpacity style={styles.handoff} onPress={() => openHelpDesk(message.handoff)}>
                      <Ionicons name="chatbubbles" size={16} color="#2e7d32" />
                      <Text style={styles.handoffText}>Send to Barangay Help Desk</Text>
                      <Ionicons name="chevron-forward" size={16} color="#2e7d32" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {sending && (
              <View style={styles.row}>
                <View style={styles.avatar}><Ionicons name="sparkles" size={15} color="#fff" /></View>
                <View style={[styles.bubble, styles.botBubble, styles.typing]}>
                  <ActivityIndicator size="small" color="#2e7d32" />
                  <Text style={styles.typingText}>Thinking…</Text>
                </View>
              </View>
            )}

            {messages.length <= 1 && !sending && (
              <View style={styles.suggestions}>
                <Text style={styles.suggestionsTitle}>Try asking</Text>
                {SUGGESTIONS.map((item) => (
                  <TouchableOpacity key={item} style={styles.suggestion} onPress={() => send(item)}>
                    <Text style={styles.suggestionText}>{item}</Text>
                    <Ionicons name="arrow-forward" size={15} color="#2e7d32" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about barangay services…"
              placeholderTextColor="#8b948d"
              multiline
              maxLength={1500}
              editable={!sending}
            />
            <TouchableOpacity style={[styles.send, (!input.trim() || sending) && styles.sendDisabled]} onPress={() => send()} disabled={!input.trim() || sending}>
              <Ionicons name="send" size={19} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 14, paddingBottom: 24 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 11, marginBottom: 14, borderRadius: 13, backgroundColor: "#fff6dc", borderWidth: 1, borderColor: "#f1dfa5" },
  noticeText: { flex: 1, color: "#6d5410", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 7, marginBottom: 10 },
  rowUser: { justifyContent: "flex-end" },
  avatar: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#2e7d32" },
  avatarError: { backgroundColor: "#a43232" },
  bubble: { maxWidth: "82%", paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16 },
  botBubble: { backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", borderBottomLeftRadius: 5 },
  userBubble: { backgroundColor: "#2e7d32", borderBottomRightRadius: 5 },
  errorBubble: { backgroundColor: "#fdecec", borderColor: "#f2c6c6" },
  bubbleText: { color: "#2f3b32", fontSize: 13, lineHeight: 19 },
  userText: { color: "#fff" },
  typing: { flexDirection: "row", alignItems: "center", gap: 8 },
  typingText: { color: "#5f6e62", fontSize: 12, fontWeight: "700" },
  emergency: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 9, borderRadius: 11, backgroundColor: "#c62828" },
  emergencyText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  handoff: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 11, backgroundColor: "#eaf6ec", borderWidth: 1, borderColor: "#cfe6d2" },
  handoffText: { flex: 1, color: "#2e7d32", fontSize: 12, fontWeight: "900" },
  suggestions: { marginTop: 6, padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 1, borderColor: "#dfe8e0" },
  suggestionsTitle: { color: "#225d29", marginBottom: 8, fontSize: 12, fontWeight: "900" },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 11, marginBottom: 7, borderRadius: 11, backgroundColor: "#f4f9f4", borderWidth: 1, borderColor: "#e0ece1" },
  suggestionText: { flex: 1, color: "#35503a", fontSize: 12, fontWeight: "700" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: "#e4ebe5" },
  input: { flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: "#f3f6f3", color: "#243128", fontSize: 13 },
  send: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#2e7d32" },
  sendDisabled: { opacity: 0.45 },
});
