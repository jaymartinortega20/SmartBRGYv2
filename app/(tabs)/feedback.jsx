import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, BackHandler, ImageBackground, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import GradientHeader from "../../components/GradientHeader";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

const CATEGORIES = ["Garbage Collection", "Drainage/Flooding", "Streetlight", "Road or Pathway Damage", "Water Supply", "Stray Animals", "Public Cleanliness", "Barangay Service Complaint", "Request for Assistance", "Suggestion", "Other"];
const AREAS = ["Sitio Ibabaw", "Drilling", "Bulok-bulok", "Centro", "Gawad Kalinga", "Lawm Tabay", "Bakhaw", "Cajocson"];
const CLOSED_STATUSES = ["resolved", "rejected", "closed"];
const MESSAGE_PAGE_SIZE = 50;

const cleanStatus = (value) => String(value || "open").replaceAll("_", " ");
const validDate = (value) => value && !Number.isNaN(new Date(value).getTime());
const displayDate = (value) => validDate(value) ? new Date(value).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—";
const displayTime = (value) => validDate(value) ? new Date(value).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "";

export default function Feedback() {
  const router = useRouter();
  const { ticketId } = useLocalSearchParams();
  const ticketParam = Array.isArray(ticketId) ? ticketId[0] : ticketId;
  const scrollRef = useRef(null);
  const lastAutoOpenedTicket = useRef("");
  const messageRequest = useRef(0);
  const messageLimit = useRef(MESSAGE_PAGE_SIZE);
  const nearBottom = useRef(true);
  const [profile, setProfile] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [wizard, setWizard] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [pageError, setPageError] = useState("");

  const loadTickets = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      setPageError("");
      if (!isSupabaseConfigured) throw new Error("Supabase is not connected.");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Please log in again to use the Help Desk.");
      const [residentResult, ticketResult] = await Promise.all([
        supabase.from("profiles").select("full_name,phone,address,purok").eq("id", authData.user.id).single(),
        supabase.from("concerns").select("*").eq("resident_id", authData.user.id).order("updated_at", { ascending: false }),
      ]);
      if (residentResult.error) throw residentResult.error;
      if (ticketResult.error) throw ticketResult.error;
      setProfile(residentResult.data || null);
      let ticketRows = ticketResult.data || [];
      const ids = ticketRows.map((row) => row.id);
      if (ids.length) {
        const { data: recent, error: recentError } = await supabase.from("concern_messages").select("concern_id,message,sender_role,is_read,created_at").in("concern_id", ids).order("created_at", { ascending: false });
        if (recentError) throw recentError;
        const summaries = {};
        for (const message of recent || []) {
          const summary = summaries[message.concern_id] || { latest: "", unread: 0 };
          if (!summary.latest) summary.latest = message.message;
          if (message.sender_role === "admin" && !message.is_read) summary.unread += 1;
          summaries[message.concern_id] = summary;
        }
        ticketRows = ticketRows.map((row) => ({ ...row, latest_message: summaries[row.id]?.latest || row.details, unread_count: summaries[row.id]?.unread || 0 }));
      }
      setTickets(ticketRows);
      setActive((current) => current ? ticketRows.find((row) => row.id === current.id) || current : current);
      if (ticketParam && lastAutoOpenedTicket.current !== ticketParam) {
        const found = ticketRows.find((row) => String(row.id) === String(ticketParam));
        if (found) {
          lastAutoOpenedTicket.current = ticketParam;
          setActive(found);
        }
      }
    } catch (error) {
      setPageError(error.message || "Unable to load your conversations.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ticketParam]);

  const loadMessages = useCallback(async (limitOverride) => {
    if (!active?.id) return;
    const requestId = ++messageRequest.current;
    const limit = limitOverride || messageLimit.current;
    setLoadingMessages(true);
    const { data, error, count } = await supabase.from("concern_messages").select("*", { count: "exact" }).eq("concern_id", active.id).order("created_at", { ascending: false }).limit(limit);
    if (requestId !== messageRequest.current) return;
    if (error) {
      setPageError(error.message || "Unable to load the messages.");
      setLoadingMessages(false);
      return;
    }
    setMessages([...(data || [])].reverse());
    setHasOlderMessages((count || 0) > (data || []).length);
    const { error: readError } = await supabase.from("concern_messages").update({ is_read: true, read_at: new Date().toISOString() }).eq("concern_id", active.id).eq("sender_role", "admin").eq("is_read", false);
    if (readError) setPageError(readError.message);
    setLoadingMessages(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
  }, [active?.id]);

  useFocusEffect(useCallback(() => { loadTickets(); }, [loadTickets]));
  useEffect(() => {
    messageLimit.current = MESSAGE_PAGE_SIZE;
    setMessages([]);
    if (active?.id) loadMessages(MESSAGE_PAGE_SIZE);
  }, [active?.id, loadMessages]);
  useEffect(() => { if (!ticketParam) lastAutoOpenedTicket.current = ""; }, [ticketParam]);
  useEffect(() => {
    if (!active?.id) return undefined;
    const channel = supabase.channel(`helpdesk-${active.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "concern_messages", filter: `concern_id=eq.${active.id}` }, () => loadMessages()).on("postgres_changes", { event: "UPDATE", schema: "public", table: "concerns", filter: `id=eq.${active.id}` }, ({ new: row }) => { setActive((current) => current?.id === row.id ? { ...current, ...row } : current); loadTickets(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [active?.id, loadMessages, loadTickets]);

  function startConcern() {
    setActive(null);
    setWizard({ stage: "category", category: "", area: "", landmark: "", details: "" });
    setComposer("");
  }

  const returnToTicketList = useCallback(() => {
    setActive(null);
    setWizard(null);
    setMessages([]);
    setComposer("");
    if (ticketParam) router.replace("/feedback");
    else loadTickets();
  }, [loadTickets, router, ticketParam]);

  const handleBack = useCallback(() => {
    if (active || !wizard || wizard.stage === "category") returnToTicketList();
    else if (wizard.stage === "area") setWizard((current) => ({ ...current, stage: "category", category: "" }));
    else if (wizard.stage === "landmark") setWizard((current) => ({ ...current, stage: "area", area: "" }));
    else if (wizard.stage === "details") { setComposer(wizard.landmark); setWizard((current) => ({ ...current, stage: "landmark", landmark: "" })); }
    else if (wizard.stage === "review") { setComposer(wizard.details); setWizard((current) => ({ ...current, stage: "details", details: "" })); }
  }, [active, returnToTicketList, wizard]);

  useFocusEffect(useCallback(() => {
    if (!active && !wizard) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [active, handleBack, wizard]));

  function chooseCategory(category) { setWizard((current) => ({ ...current, category, stage: "area" })); }
  function chooseArea(area) { setWizard((current) => ({ ...current, area, stage: "landmark" })); }

  function submitWizardText() {
    const value = composer.trim();
    if (!value) return;
    if (wizard.stage === "landmark" && (value.length < 2 || value.length > 200)) return Alert.alert("Check location", "Enter 2 to 200 characters.");
    if (wizard.stage === "details" && (value.length < 2 || value.length > 2000)) return Alert.alert("Check details", "Enter 2 to 2,000 characters.");
    if (wizard.stage === "landmark") setWizard((current) => ({ ...current, landmark: value, stage: "details" }));
    if (wizard.stage === "details") setWizard((current) => ({ ...current, details: value, stage: "review" }));
    setComposer("");
  }

  async function createTicket() {
    if (sending) return;
    setSending(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Please log in again before sending a concern.");
      const { data, error } = await supabase.rpc("create_helpdesk_ticket", { category_input: wizard.category, area_input: wizard.area, landmark_input: wizard.landmark.trim(), details_input: wizard.details.trim() });
      if (error) throw error;
      const ticket = Array.isArray(data) ? data[0] : data;
      if (!ticket?.id) throw new Error("The Help Desk did not return the new ticket. Run fix_helpdesk_atomic.sql in Supabase.");
      setWizard(null);
      setActive(ticket);
      setMessages([]);
      loadTickets();
    } catch (error) {
      Alert.alert("Concern not sent", error.message || "Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function sendMessage() {
    const value = composer.trim();
    if (!value || !active || sending) return;
    if (CLOSED_STATUSES.includes(String(active.status).toLowerCase())) return Alert.alert("Conversation closed", "This ticket can no longer receive replies.");
    if (value.length > 2000) return Alert.alert("Message too long", "Use no more than 2,000 characters.");
    setSending(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Please log in again before replying.");
      const { data: sent, error } = await supabase.from("concern_messages").insert({ concern_id: active.id, sender_id: authData.user.id, sender_role: "resident", message: value }).select("*").single();
      if (error) throw error;
      setComposer("");
      setMessages((current) => current.some((item) => item.id === sent.id) ? current : [...current, sent]);
    } catch (error) {
      Alert.alert("Message not sent", error.message || "Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg}><SafeAreaView style={styles.safe}><GradientHeader title="Barangay Help Desk" /><ActivityIndicator style={{ marginTop: 70 }} size="large" color="#2e7d32" /></SafeAreaView></ImageBackground>;

  return <ImageBackground source={require("../../assets/images/background-bg.jpg")} style={styles.bg}><SafeAreaView style={styles.safe}><GradientHeader title="Barangay Help Desk" />
    {!active && !wizard ? <TicketList tickets={tickets} onOpen={setActive} onNew={startConcern} refreshing={refreshing} onRefresh={() => loadTickets(true)} error={pageError} /> :
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <View style={styles.chatHeader}><TouchableOpacity style={styles.back} onPress={handleBack}><Ionicons name="arrow-back" size={20} color="#2e7d32" /></TouchableOpacity><View style={styles.adminAvatar}><Ionicons name="headset" size={21} color="#fff" /></View><View style={styles.headerCopy}><Text style={styles.headerTitle}>Barangay Tubod Help Desk</Text><Text style={styles.headerSubtitle} numberOfLines={1}>{active ? `${active.ticket_number} · ${cleanStatus(active.status)}` : "Guided concern assistant"}</Text></View></View>
        {!!pageError && <View style={styles.inlineError}><Ionicons name="alert-circle" size={16} color="#a43232" /><Text style={styles.inlineErrorText}>{pageError}</Text></View>}
        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled" onScroll={({ nativeEvent }) => { nearBottom.current = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y < 90; }} scrollEventThrottle={16} onContentSizeChange={() => { if (nearBottom.current) scrollRef.current?.scrollToEnd({ animated: true }); }}>
          {wizard ? <Wizard profile={profile} wizard={wizard} chooseCategory={chooseCategory} chooseArea={chooseArea} onConfirm={createTicket} sending={sending} /> : <Conversation messages={messages} ticket={active} loading={loadingMessages} hasOlder={hasOlderMessages} onLoadOlder={() => { messageLimit.current += MESSAGE_PAGE_SIZE; loadMessages(messageLimit.current); }} />}
        </ScrollView>
        {active && CLOSED_STATUSES.includes(String(active.status).toLowerCase()) ? <View style={styles.closedBanner}><Ionicons name="lock-closed" size={16} color="#6d756e" /><Text style={styles.closedText}>This conversation is closed and read-only.</Text></View> : ((wizard && ["landmark", "details"].includes(wizard.stage)) || active) && <View style={styles.composer}><TextInput style={styles.composerInput} value={composer} onChangeText={setComposer} maxLength={2000} multiline placeholder={wizard?.stage === "landmark" ? "Enter specific location or landmark" : wizard?.stage === "details" ? "Describe your concern" : "Reply to Barangay Help Desk"} placeholderTextColor="#8b948d" /><TouchableOpacity style={[styles.send, (!composer.trim() || sending) && styles.sendDisabled]} disabled={!composer.trim() || sending} onPress={wizard ? submitWizardText : sendMessage}>{sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={19} color="#fff" />}</TouchableOpacity></View>}
      </KeyboardAvoidingView>}
  </SafeAreaView></ImageBackground>;
}

function TicketList({ tickets, onOpen, onNew, refreshing, onRefresh, error }) {
  return <ScrollView contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2e7d32"]} />}><View style={styles.welcome}><View style={styles.welcomeIcon}><Ionicons name="chatbubbles" size={27} color="#fff" /></View><View style={{ flex: 1 }}><Text style={styles.welcomeTitle}>Barangay Tubod Help Desk</Text><Text style={styles.welcomeText}>Send important barangay service concerns and continue the conversation with an authorized official.</Text></View></View>{!!error && <TouchableOpacity style={styles.errorCard} onPress={onRefresh}><Ionicons name="refresh" size={18} color="#a43232" /><Text style={styles.errorCardText}>{error} Tap to retry.</Text></TouchableOpacity>}<TouchableOpacity style={styles.newButton} onPress={onNew}><Ionicons name="add-circle" size={21} color="#fff" /><Text style={styles.newButtonText}>Start New Concern</Text></TouchableOpacity><Text style={styles.listTitle}>Your conversations</Text>{tickets.map((ticket) => <TouchableOpacity key={ticket.id} style={styles.ticketRow} onPress={() => onOpen(ticket)}><View style={styles.ticketIcon}><Ionicons name="chatbox-ellipses-outline" size={22} color="#2e7d32" /></View><View style={styles.ticketCopy}><Text style={styles.ticketCategory}>{ticket.category || ticket.subject}</Text><Text style={styles.ticketNumber}>{ticket.ticket_number || "Concern ticket"}</Text><Text style={styles.ticketPreview} numberOfLines={1}>{ticket.latest_message || ticket.details}</Text></View><View style={styles.ticketSide}>{ticket.unread_count > 0 && <View style={styles.unread}><Text style={styles.unreadText}>{ticket.unread_count > 99 ? "99+" : ticket.unread_count}</Text></View>}<Status value={ticket.status} /><Text style={styles.ticketDate}>{displayDate(ticket.updated_at || ticket.created_at)}</Text></View></TouchableOpacity>)}{!tickets.length && !error && <View style={styles.empty}><Ionicons name="file-tray-outline" size={33} color="#2e7d32" /><Text style={styles.emptyTitle}>No conversations yet</Text><Text style={styles.emptyText}>Start a concern to contact the Barangay Tubod Help Desk.</Text></View>}</ScrollView>;
}

function Wizard({ profile, wizard, chooseCategory, chooseArea, onConfirm, sending }) {
  return <><SystemBubble text={`Hi ${profile?.full_name || "Resident of Barangay Tubod"}! What is your concern today?`} />
    {wizard.category && <UserBubble text={wizard.category} />}
    {wizard.stage === "category" && <QuickReplies values={CATEGORIES} onChoose={chooseCategory} />}
    {wizard.category && <SystemBubble text="Where is the concern located?" />}
    {wizard.area && <UserBubble text={wizard.area} />}
    {wizard.stage === "area" && <QuickReplies values={AREAS} onChoose={chooseArea} />}
    {wizard.area && <SystemBubble text="Please provide a specific landmark, street, or nearby establishment." />}
    {wizard.landmark && <UserBubble text={wizard.landmark} />}
    {wizard.stage === "details" && <SystemBubble text="Please describe the concern clearly so the barangay can assist you." />}
    {wizard.details && <UserBubble text={wizard.details} />}
    {wizard.stage === "review" && <><SystemBubble text="Please review the concern before submitting." /><View style={styles.review}><Text style={styles.reviewTitle}>Concern summary</Text><Summary label="Category" value={wizard.category} /><Summary label="Area" value={wizard.area} /><Summary label="Location" value={wizard.landmark} /><Summary label="Details" value={wizard.details} /><TouchableOpacity style={styles.confirm} onPress={onConfirm} disabled={sending}><Text style={styles.confirmText}>{sending ? "Submitting..." : "Confirm and Start Conversation"}</Text></TouchableOpacity></View></>}
  </>;
}

function Conversation({ messages, ticket, loading, hasOlder, onLoadOlder }) { return <>{loading && !messages.length && <ActivityIndicator color="#2e7d32" style={{ margin: 20 }} />}{hasOlder && <TouchableOpacity style={styles.olderButton} onPress={onLoadOlder} disabled={loading}><Text style={styles.olderText}>{loading ? "Loading..." : "Load earlier messages"}</Text></TouchableOpacity>}<SystemBubble text={`Concern ${ticket.ticket_number} is ${cleanStatus(ticket.status)}. A barangay official will reply through this conversation.`} />{messages.map((message) => message.sender_role === "resident" ? <UserBubble key={message.id} text={message.message} time={message.created_at} /> : message.sender_role === "system" ? <SystemBubble key={message.id} text={message.message} /> : <AdminBubble key={message.id} text={message.message} time={message.created_at} />)}</>; }
function QuickReplies({ values, onChoose }) { return <View style={styles.quickReplies}>{values.map((value) => <TouchableOpacity key={value} style={styles.quickReply} onPress={() => onChoose(value)}><Text style={styles.quickText}>{value}</Text></TouchableOpacity>)}</View>; }
function SystemBubble({ text }) { return <View style={styles.systemRow}><View style={styles.botAvatar}><Ionicons name="headset" size={17} color="#fff" /></View><View style={styles.systemBubble}><Text style={styles.systemText}>{text}</Text></View></View>; }
function AdminBubble({ text, time }) { return <View style={styles.systemRow}><View style={styles.adminSmall}><Text style={styles.adminLetter}>B</Text></View><View style={styles.adminMessageCopy}><Text style={styles.senderLabel}>Barangay Official</Text><View style={styles.adminBubble}><Text style={styles.adminText}>{text}</Text></View>{displayTime(time) && <Text style={styles.messageTime}>{displayTime(time)}</Text>}</View></View>; }
function UserBubble({ text, time }) { return <View style={styles.userRow}><View style={styles.userBubble}><Text style={styles.userText}>{text}</Text></View>{displayTime(time) && <Text style={styles.messageTime}>{displayTime(time)}</Text>}</View>; }
function Status({ value }) { return <View style={styles.status}><Text style={styles.statusText}>{cleanStatus(value)}</Text></View>; }
function Summary({ label, value }) { return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  bg: { flex: 1 }, safe: { flex: 1 }, flex: { flex: 1 }, listContent: { padding: 16, paddingBottom: 105 }, welcome: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dce6dd", elevation: 3 }, welcomeIcon: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#2e7d32" }, welcomeTitle: { color: "#225d29", fontSize: 17, fontWeight: "900" }, welcomeText: { color: "#727c74", marginTop: 4, fontSize: 10, lineHeight: 15 }, newButton: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginVertical: 13, borderRadius: 14, backgroundColor: "#2e7d32", elevation: 3 }, newButtonText: { color: "#fff", fontWeight: "900" }, listTitle: { color: "#225d29", margin: 4, fontSize: 14, fontWeight: "900" }, ticketRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, marginTop: 9, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 2 }, ticketIcon: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#eaf6ec" }, ticketCopy: { flex: 1, minWidth: 0 }, ticketCategory: { color: "#2d3a30", fontSize: 12, fontWeight: "900" }, ticketNumber: { color: "#2e7d32", marginTop: 2, fontSize: 9, fontWeight: "800" }, ticketPreview: { color: "#7b847d", marginTop: 4, fontSize: 9 }, ticketSide: { alignItems: "flex-end", gap: 6 }, ticketDate: { color: "#909891", fontSize: 8 }, status: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 20, backgroundColor: "#fff1c9" }, statusText: { color: "#73530f", fontSize: 7, fontWeight: "900", textTransform: "capitalize" }, unread: { minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#d32f2f" }, unreadText: { color: "#fff", fontSize: 8, fontWeight: "900" }, empty: { alignItems: "center", padding: 32, marginTop: 10, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.9)" }, emptyTitle: { marginTop: 9, fontWeight: "900" }, emptyText: { color: "#78817a", marginTop: 5, textAlign: "center", fontSize: 9 }, errorCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, marginTop: 12, borderRadius: 12, backgroundColor: "#fff1f1", borderWidth: 1, borderColor: "#e9b9b9" }, errorCardText: { flex: 1, color: "#8d2e2e", fontSize: 10, lineHeight: 15 },
  chatHeader: { height: 67, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#dfe7e0" }, back: { width: 35, height: 35, alignItems: "center", justifyContent: "center" }, adminAvatar: { width: 41, height: 41, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#2e7d32" }, headerCopy: { flex: 1, minWidth: 0 }, headerTitle: { color: "#26352a", fontSize: 13, fontWeight: "900" }, headerSubtitle: { color: "#7a847c", marginTop: 2, fontSize: 8, textTransform: "capitalize" }, chatContent: { padding: 14, paddingBottom: 20 }, inlineError: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: "#fff1f1" }, inlineErrorText: { flex: 1, color: "#8d2e2e", fontSize: 9 },
  systemRow: { flexDirection: "row", alignItems: "flex-end", gap: 7, marginBottom: 11, maxWidth: "88%" }, botAvatar: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#2e7d32" }, systemBubble: { flexShrink: 1, padding: 11, borderRadius: 14, borderBottomLeftRadius: 4, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe7e0" }, systemText: { color: "#435047", fontSize: 11, lineHeight: 17 }, adminSmall: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#f9a825" }, adminLetter: { color: "#fff", fontWeight: "900" }, adminMessageCopy: { flexShrink: 1, minWidth: 0 }, senderLabel: { color: "#637067", marginBottom: 3, fontSize: 8, fontWeight: "900" }, adminBubble: { flexShrink: 1, padding: 11, borderRadius: 14, borderBottomLeftRadius: 4, backgroundColor: "#fff9e8", borderWidth: 1, borderColor: "#efd88d" }, adminText: { color: "#4b432d", fontSize: 11, lineHeight: 17 }, userRow: { alignItems: "flex-end", marginBottom: 11, marginLeft: "12%" }, userBubble: { maxWidth: "100%", padding: 11, borderRadius: 14, borderBottomRightRadius: 4, backgroundColor: "#2e7d32" }, userText: { color: "#fff", fontSize: 11, lineHeight: 17 }, messageTime: { color: "#929991", marginTop: 3, fontSize: 7 }, quickReplies: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginLeft: 37, marginBottom: 12 }, quickReply: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "#79ad80" }, quickText: { color: "#2e7d32", fontSize: 9, fontWeight: "800" }, olderButton: { alignSelf: "center", paddingHorizontal: 13, paddingVertical: 8, marginBottom: 12, borderRadius: 14, backgroundColor: "#eaf6ec" }, olderText: { color: "#2e7d32", fontSize: 9, fontWeight: "800" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, paddingBottom: 15, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#dfe7e0" }, composerInput: { flex: 1, maxHeight: 105, minHeight: 43, paddingHorizontal: 13, paddingVertical: 10, color: "#26332a", backgroundColor: "#f2f5f2", borderRadius: 16 }, send: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#2e7d32" }, sendDisabled: { opacity: 0.45 }, closedBanner: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, padding: 13, backgroundColor: "#eef1ee", borderTopWidth: 1, borderTopColor: "#dfe4df" }, closedText: { color: "#6d756e", fontSize: 10, fontWeight: "700" }, review: { padding: 15, marginLeft: 37, borderRadius: 15, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d8e4da" }, reviewTitle: { color: "#225d29", marginBottom: 9, fontSize: 14, fontWeight: "900" }, summaryRow: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#edf1ed" }, summaryLabel: { color: "#838c85", fontSize: 8, fontWeight: "900", textTransform: "uppercase" }, summaryValue: { color: "#334037", marginTop: 3, fontSize: 10, lineHeight: 15, fontWeight: "700" }, confirm: { alignItems: "center", paddingVertical: 12, marginTop: 12, borderRadius: 11, backgroundColor: "#2e7d32" }, confirmText: { color: "#fff", fontSize: 11, fontWeight: "900" },
});