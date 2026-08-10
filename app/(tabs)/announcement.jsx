import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import GradientHeader from "../../components/GradientHeader";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

const COLORS = {
  green: "#2e7d32",
  greenDark: "#1d5a23",
  greenSoft: "#eaf6ec",
  amber: "#f9a825",
  red: "#c62828",
  blue: "#1565c0",
  ink: "#243128",
  muted: "#6e776f",
  line: "#dfe8e0",
};

const TYPE_STYLES = {
  emergency: { color: COLORS.red, background: "#ffebee", icon: "warning" },
  advisory: { color: "#ad6f00", background: "#fff6dd", icon: "information-circle" },
  event: { color: COLORS.blue, background: "#eaf3ff", icon: "calendar" },
  health: { color: "#7b1fa2", background: "#f5eafa", icon: "medkit" },
  community: { color: COLORS.green, background: COLORS.greenSoft, icon: "people" },
  general: { color: "#546e7a", background: "#eef2f4", icon: "megaphone" },
};

const normalizeType = (value) => String(value || "General").trim().toLowerCase();

const getTypeStyle = (value) =>
  TYPE_STYLES[normalizeType(value)] || TYPE_STYLES.general;

const parseLocalDateTime = (date, time = "00:00") => {
  if (!date) return null;
  const value = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(value.getTime()) ? null : value;
};

const formatTime = (time) => {
  if (!time) return "";
  const value = parseLocalDateTime("2000-01-01", time);
  if (!value) return String(time);
  return value.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatEventDate = (date, time) => {
  if (!date) return "Date to be announced";
  const value = parseLocalDateTime(date, time);
  if (!value) return String(date);
  return value.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(time ? { hour: "numeric", minute: "2-digit" } : {}),
  });
};

const formatEventRange = (item) => {
  const start = formatEventDate(item.event_date, item.event_time);
  if (item.end_date) {
    return `${start} – ${formatEventDate(item.end_date, item.end_time)}`;
  }
  return item.end_time ? `${start} – ${formatTime(item.end_time)}` : start;
};

const isExpired = (item) => {
  if (!item.event_date) return false;
  const finalDate = item.end_date || item.event_date;
  const finalTime = item.end_time || "23:59:59";
  const eventEnd = parseLocalDateTime(finalDate, finalTime);
  return eventEnd ? eventEnd.getTime() < Date.now() : false;
};

const isNew = (createdAt) => {
  if (!createdAt) return false;
  const age = Date.now() - new Date(createdAt).getTime();
  return age >= 0 && age <= 3 * 24 * 60 * 60 * 1000;
};

const countdownLabel = (item) => {
  if (!item.event_date || isExpired(item)) return "";
  const event = parseLocalDateTime(item.event_date, item.event_time || "23:59");
  if (!event) return "";
  const days = Math.ceil((event.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days remaining`;
};

export default function Announcement() {
  const [announcements, setAnnouncements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadAnnouncements = useCallback(async (showRefresh = false) => {
    if (!isSupabaseConfigured) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    if (showRefresh) setRefreshing(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (loadError) setError(loadError.message || "Unable to load announcements.");
    else setAnnouncements(data || []);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadAnnouncements();

    if (!isSupabaseConfigured) return undefined;
    const channel = supabase
      .channel("resident-announcements")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => loadAnnouncements()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAnnouncements]);

  const categories = useMemo(() => {
    const uniqueTypes = new Map();
    announcements.forEach((item) => {
      const label = String(item.announcement_type || "").trim();
      const key = normalizeType(label);
      if (label && !uniqueTypes.has(key)) uniqueTypes.set(key, label);
    });
    return ["All", ...uniqueTypes.values()];
  }, [announcements]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return announcements.filter((item) => {
      const matchesType =
        selectedType === "All" ||
        normalizeType(item.announcement_type) === normalizeType(selectedType);
      const matchesSearch =
        !term ||
        [item.title, item.message, item.location, item.announcement_type, item.contact_person]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      return matchesType && matchesSearch;
    });
  }, [announcements, search, selectedType]);

  const activeAnnouncements = filtered.filter((item) => !isExpired(item));
  const historyAnnouncements = filtered.filter(isExpired);
  const featured = activeAnnouncements.find(
    (item) => item.priority === "emergency" || normalizeType(item.announcement_type) === "emergency"
  );
  const regularAnnouncements = featured
    ? activeAnnouncements.filter((item) => item.id !== featured.id)
    : activeAnnouncements;

  return (
    <ImageBackground
      source={require("../../assets/images/background-bg.jpg")}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea}>
        <GradientHeader title="Barangay Announcements" />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadAnnouncements(true)}
              colors={[COLORS.green]}
              tintColor={COLORS.green}
            />
          }
        >
          <View style={styles.introCard}>
            <View style={styles.introIcon}>
              <Ionicons name="megaphone" size={25} color="#fff" />
            </View>
            <View style={styles.introCopy}>
              <Text style={styles.introTitle}>Stay informed</Text>
              <Text style={styles.introText}>
                Official updates, advisories, and events from Barangay Tubod.
              </Text>
            </View>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={COLORS.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search announcements"
              placeholderTextColor="#899189"
              value={search}
              onChangeText={setSearch}
            />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={20} color="#9aa29b" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterList}
          >
            {categories.map((category) => {
              const active = selectedType === category;
              return (
                <TouchableOpacity
                  key={category}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setSelectedType(category)}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {category}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {!!error && announcements.length > 0 && (
            <View style={styles.refreshWarning}>
              <Ionicons name="cloud-offline-outline" size={18} color="#8a620d" />
              <Text style={styles.refreshWarningText}>
                Refresh failed. Showing the latest announcements saved on this screen.
              </Text>
            </View>
          )}

          {loading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator size="large" color={COLORS.green} />
              <Text style={styles.stateText}>Loading barangay updates…</Text>
            </View>
          ) : error && announcements.length === 0 ? (
            <View style={styles.errorBox}>
              <Ionicons name="cloud-offline-outline" size={28} color={COLORS.red} />
              <Text style={styles.errorTitle}>Unable to load announcements</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => loadAnnouncements()}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.stateBox}>
              <Ionicons name="search-outline" size={30} color={COLORS.green} />
              <Text style={styles.stateTitle}>No announcement found</Text>
              <Text style={styles.stateText}>Try another search or category.</Text>
            </View>
          ) : (
            <>
              {featured && (
                <View style={styles.section}>
                  <Text style={styles.sectionEyebrow}>IMPORTANT UPDATE</Text>
                  <FeaturedCard item={featured} onPress={() => setSelected(featured)} />
                </View>
              )}

              <AnnouncementSection
                title="Latest announcements"
                subtitle={`${regularAnnouncements.length} active update${regularAnnouncements.length === 1 ? "" : "s"}`}
                items={regularAnnouncements}
                onSelect={setSelected}
              />

              {!!historyAnnouncements.length && (
                <AnnouncementSection
                  title="Previous announcements"
                  subtitle="Past events and notices"
                  items={historyAnnouncements}
                  onSelect={setSelected}
                  history
                />
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <AnnouncementModal item={selected} onClose={() => setSelected(null)} />
    </ImageBackground>
  );
}

function AnnouncementSection({ title, subtitle, items, onSelect, history = false }) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {items.map((item) => (
        <AnnouncementCard
          key={item.id}
          item={item}
          onPress={() => onSelect(item)}
          history={history}
        />
      ))}
    </View>
  );
}

function AnnouncementCard({ item, onPress, history }) {
  const typeStyle = getTypeStyle(item.announcement_type);
  const countdown = countdownLabel(item);
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      style={[styles.card, history && styles.historyCard]}
      onPress={onPress}
    >
      <View style={[styles.typeIcon, { backgroundColor: typeStyle.background }]}>
        <Ionicons name={typeStyle.icon} size={21} color={typeStyle.color} />
      </View>
      <View style={styles.cardContent}>
        <View style={styles.badgeRow}>
          <View style={[styles.typeBadge, { backgroundColor: typeStyle.background }]}>
            <Text style={[styles.typeBadgeText, { color: typeStyle.color }]}>
              {item.announcement_type || "General"}
            </Text>
          </View>
          {isNew(item.created_at) && !history && <Text style={styles.newBadge}>NEW</Text>}
          {!!countdown && <Text style={styles.countdown}>{countdown}</Text>}
        </View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text numberOfLines={2} style={styles.cardMessage}>{item.message}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.muted} />
          <Text style={styles.metaText}>{formatEventDate(item.event_date, item.event_time)}</Text>
        </View>
        {!!item.target_audience && (
          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={14} color={COLORS.muted} />
            <Text numberOfLines={1} style={styles.metaText}>{item.target_audience}</Text>
          </View>
        )}
        {!!item.location && (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color={COLORS.muted} />
            <Text numberOfLines={1} style={styles.metaText}>{item.location}</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={19} color="#a0aaa2" />
    </TouchableOpacity>
  );
}

function FeaturedCard({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.featuredCard} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.featuredTopRow}>
        <View style={styles.emergencyBadge}>
          <Ionicons name="warning" size={14} color="#fff" />
          <Text style={styles.emergencyBadgeText}>EMERGENCY</Text>
        </View>
        {isNew(item.created_at) && <Text style={styles.featuredNew}>NEW</Text>}
      </View>
      <Text style={styles.featuredTitle}>{item.title}</Text>
      <Text numberOfLines={3} style={styles.featuredMessage}>{item.message}</Text>
      <View style={styles.featuredFooter}>
        <Text style={styles.featuredMeta}>{formatEventDate(item.event_date, item.event_time)}</Text>
        <View style={styles.viewDetails}>
          <Text style={styles.viewDetailsText}>View details</Text>
          <Ionicons name="arrow-forward" size={15} color="#fff" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function AnnouncementModal({ item, onClose }) {
  const typeStyle = getTypeStyle(item?.announcement_type);
  return (
    <Modal transparent visible={!!item} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close announcement details"
        />
        <View style={styles.modalCard}>
          {item && (
            <>
              <View style={styles.modalHeader}>
                <View style={[styles.modalIcon, { backgroundColor: typeStyle.background }]}>
                  <Ionicons name={typeStyle.icon} size={24} color={typeStyle.color} />
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Ionicons name="close" size={23} color={COLORS.muted} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                <View style={[styles.modalBadge, { backgroundColor: typeStyle.background }]}>
                  <Text style={[styles.modalBadgeText, { color: typeStyle.color }]}>
                    {item.announcement_type || "General"}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>{item.title}</Text>
                <View style={styles.detailsBox}>
                  <DetailRow icon="information-circle-outline" label="What" value={item.message} />
                  {!!item.target_audience && <DetailRow icon="people-outline" label="Who" value={item.target_audience} />}
                  <DetailRow
                    icon="calendar-outline"
                    label="When"
                    value={formatEventRange(item)}
                  />
                  {!!item.location && <DetailRow icon="location-outline" label="Where" value={item.location} />}
                  {!!item.purpose && <DetailRow icon="help-circle-outline" label="Why" value={item.purpose} />}
                  {!!item.contact_person && <DetailRow icon="person-outline" label="Contact" value={item.contact_person} />}
                  {!!item.contact_number && <DetailRow icon="call-outline" label="Contact number" value={item.contact_number} />}
                </View>

                <Text style={styles.postedText}>
                  Posted {new Date(item.created_at).toLocaleString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </ScrollView>

              <TouchableOpacity style={styles.doneButton} onPress={onClose}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={18} color={COLORS.green} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: 16, paddingBottom: 45 },
  introCard: { flexDirection: "row", alignItems: "center", padding: 16, marginBottom: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.95)", borderWidth: 1, borderColor: COLORS.line, elevation: 3 },
  introIcon: { width: 50, height: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.green },
  introCopy: { flex: 1, marginLeft: 13 },
  introTitle: { color: COLORS.greenDark, fontSize: 19, fontWeight: "900" },
  introText: { color: COLORS.muted, marginTop: 3, fontSize: 12, lineHeight: 18 },
  searchBox: { height: 50, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.line, elevation: 2 },
  searchInput: { flex: 1, height: "100%", marginHorizontal: 9, color: COLORS.ink, fontSize: 14 },
  filterList: { paddingVertical: 13, paddingRight: 8 },
  filterChip: { paddingHorizontal: 15, paddingVertical: 9, marginRight: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 1, borderColor: COLORS.line },
  filterChipActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  filterText: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: "#fff" },
  refreshWarning: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, marginBottom: 8, borderRadius: 12, backgroundColor: "#fff7df", borderWidth: 1, borderColor: "#f0d99c" },
  refreshWarningText: { flex: 1, color: "#765710", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  section: { marginTop: 8 },
  sectionEyebrow: { marginBottom: 8, color: COLORS.red, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  sectionHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: COLORS.greenDark, fontSize: 17, fontWeight: "900" },
  sectionSubtitle: { color: COLORS.muted, fontSize: 10 },
  featuredCard: { padding: 17, marginBottom: 15, borderRadius: 18, backgroundColor: COLORS.red, elevation: 5 },
  featuredTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  emergencyBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)" },
  emergencyBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  featuredNew: { color: COLORS.red, backgroundColor: "#fff", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, fontSize: 9, fontWeight: "900" },
  featuredTitle: { color: "#fff", marginTop: 14, fontSize: 20, fontWeight: "900" },
  featuredMessage: { color: "#ffecec", marginTop: 7, fontSize: 13, lineHeight: 19 },
  featuredFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 15 },
  featuredMeta: { flex: 1, color: "#ffdada", fontSize: 10, fontWeight: "700" },
  viewDetails: { flexDirection: "row", alignItems: "center", gap: 5 },
  viewDetailsText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  card: { flexDirection: "row", alignItems: "center", padding: 13, marginBottom: 10, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: COLORS.line, elevation: 2 },
  historyCard: { opacity: 0.68, backgroundColor: "#f5f7f5" },
  typeIcon: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 13, marginRight: 11 },
  cardContent: { flex: 1, minWidth: 0 },
  badgeRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginBottom: 5 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  typeBadgeText: { fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  newBadge: { color: "#fff", backgroundColor: COLORS.red, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20, fontSize: 8, fontWeight: "900" },
  countdown: { color: "#8a620d", backgroundColor: "#fff3cf", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 20, fontSize: 8, fontWeight: "800" },
  cardTitle: { color: COLORS.ink, fontSize: 14, fontWeight: "900" },
  cardMessage: { color: COLORS.muted, marginTop: 4, marginBottom: 7, fontSize: 11, lineHeight: 16 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  metaText: { flex: 1, color: COLORS.muted, fontSize: 10, fontWeight: "600" },
  stateBox: { alignItems: "center", padding: 34, marginTop: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: COLORS.line },
  stateTitle: { color: COLORS.ink, marginTop: 10, fontWeight: "900" },
  stateText: { color: COLORS.muted, marginTop: 7, textAlign: "center", fontSize: 12 },
  errorBox: { alignItems: "center", padding: 25, marginTop: 12, borderRadius: 16, backgroundColor: "#fff6f6", borderWidth: 1, borderColor: "#f0cccc" },
  errorTitle: { color: "#8f2929", marginTop: 8, fontWeight: "900" },
  errorText: { color: "#9b5b5b", marginTop: 5, textAlign: "center", fontSize: 11 },
  retryButton: { marginTop: 13, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.green },
  retryText: { color: "#fff", fontWeight: "900" },
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 18, backgroundColor: "rgba(12,31,17,0.65)" },
  modalCard: { width: "100%", maxWidth: 520, height: "88%", padding: 20, borderRadius: 22, backgroundColor: "#fff", elevation: 12, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalScroll: { flex: 1 },
  modalScrollContent: { paddingBottom: 12 },
  modalIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15 },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#f1f4f1" },
  modalBadge: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  modalBadgeText: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  modalTitle: { color: COLORS.greenDark, marginTop: 12, fontSize: 23, lineHeight: 29, fontWeight: "900" },
  detailsBox: { padding: 13, marginTop: 17, borderRadius: 15, backgroundColor: "#f6faf6", borderWidth: 1, borderColor: COLORS.line },
  detailRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7 },
  detailIcon: { width: 35, height: 35, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: COLORS.greenSoft },
  detailCopy: { flex: 1, marginLeft: 10 },
  detailLabel: { color: COLORS.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  detailValue: { color: COLORS.ink, marginTop: 2, fontSize: 12, fontWeight: "700" },
  postedText: { color: "#8a928b", marginTop: 14, marginBottom: 4, fontSize: 10 },
  doneButton: { alignItems: "center", paddingVertical: 13, marginTop: 15, borderRadius: 13, backgroundColor: COLORS.green },
  doneButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});