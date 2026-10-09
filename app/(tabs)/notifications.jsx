import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ExpoNotifications from "expo-notifications";
import { useFocusEffect, useRouter } from "expo-router";

import GradientHeader from "../../components/GradientHeader";
import { resolveNotificationRoute, syncBadgeCount } from "../../lib/pushNotifications";
import { supabase } from "../../lib/supabase";

const ICONS = {
  announcement: ["megaphone", "#1565c0", "#eaf3ff"],
  document: ["document-text", "#2e7d32", "#eaf6ec"],
  incident: ["warning", "#c47a08", "#fff3d6"],
  meeting: ["people", "#7b1fa2", "#f5eafa"],
  summons: ["mail-unread", "#c62828", "#ffebee"],
  concern: ["chatbubbles", "#2e7d32", "#eaf6ec"],
  general: ["notifications", "#546e7a", "#eef2f4"],
};

const FILTERS = [
  { key: "all", label: "All", icon: "apps-outline" },
  { key: "unread", label: "Unread", icon: "mail-unread-outline" },
  { key: "important", label: "Important", icon: "alert-circle-outline" },
];

function isImportant(item) {
  const content = `${item.title || ""} ${item.message || ""}`.toLowerCase();
  return ["summons", "meeting"].includes(item.type)
    || /ready to claim|emergency|urgent|action required|appearance notice/.test(content);
}

function groupNotifications(rows) {
  const groups = new Map();

  rows.forEach((item) => {
    const transactionKey = item.related_table && item.related_id
      ? `${item.related_table}:${item.related_id}`
      : `${item.type || "general"}:${item.id}`;

    if (!groups.has(transactionKey)) groups.set(transactionKey, []);
    groups.get(transactionKey).push(item);
  });

  return Array.from(groups.entries())
    .map(([key, items]) => {
      const sortedItems = [...items].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      const latest = sortedItems[0];
      return {
        key,
        latest,
        items: sortedItems,
        unreadCount: sortedItems.filter((item) => !item.is_read).length,
        important: sortedItems.some(isImportant),
      };
    })
    .sort(
      (a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime(),
    );
}

function relativeTime(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 45) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function fullDate(value) {
  return new Date(value).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Notifications() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    setError("");

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const id = authData.user?.id;
      if (!id) throw new Error("Please log in again to view notifications.");

      setUserId(id);
      const { data, error: notificationError } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (notificationError) throw notificationError;
      setRows(data || []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the screen is opened (tab screens stay mounted).
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    syncBadgeCount(rows.filter((item) => !item.is_read).length);
  }, [rows]);

  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void load(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  const groups = useMemo(() => groupNotifications(rows), [rows]);
  const unreadCount = rows.filter((item) => !item.is_read).length;
  const unreadGroups = groups.filter((group) => group.unreadCount > 0).length;
  const filteredGroups = groups.filter((group) => {
    if (filter === "unread") return group.unreadCount > 0;
    if (filter === "important") return group.important;
    return true;
  });

  const newGroups = filteredGroups.filter((group) => group.unreadCount > 0);
  const earlierGroups = filteredGroups.filter((group) => group.unreadCount === 0);

  async function markIdsRead(ids) {
    if (!ids.length) return true;
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: readAt })
      .in("id", ids);

    if (updateError) {
      Alert.alert("Unable to update", updateError.message);
      return false;
    }

    const idSet = new Set(ids);
    setRows((current) => current.map((row) => (
      idSet.has(row.id) ? { ...row, is_read: true, read_at: readAt } : row
    )));
    return true;
  }

  async function previewGroup(group) {
    setSelectedGroup(group);
    const unreadIds = group.items.filter((item) => !item.is_read).map((item) => item.id);
    await markIdsRead(unreadIds);
  }

  function openSelectedUpdate() {
    const target = resolveNotificationRoute(selectedGroup?.latest);
    setSelectedGroup(null);
    if (target) router.navigate(target);
  }

  async function markAllRead() {
    if (!userId || !unreadCount) return;

    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: readAt })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (updateError) {
      Alert.alert("Unable to update", updateError.message);
      return;
    }

    setRows((current) => current.map((row) => ({ ...row, is_read: true, read_at: readAt })));
    ExpoNotifications.dismissAllNotificationsAsync().catch(() => undefined);
  }

  return (
    <ImageBackground
      source={require("../../assets/images/background-bg.jpg")}
      style={styles.bg}
    >
      <SafeAreaView style={styles.safe}>
        <GradientHeader title="Notifications" subtitle="Barangay service updates" onBack />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              colors={["#2e7d32"]}
              tintColor="#2e7d32"
            />
          )}
        >
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="notifications" size={25} color="#fff" />
              {unreadCount > 0 && <View style={styles.heroDot} />}
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.title}>Barangay updates</Text>
              <Text style={styles.subtitle}>
                {unreadCount
                  ? `${unreadCount} new update${unreadCount === 1 ? "" : "s"} in ${unreadGroups} conversation${unreadGroups === 1 ? "" : "s"}`
                  : "You’re all caught up"}
              </Text>
            </View>
            {unreadCount > 0 && (
              <TouchableOpacity style={styles.markButton} onPress={markAllRead}>
                <Ionicons name="checkmark-done" size={16} color="#2e7d32" />
                <Text style={styles.markAll}>Read all</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            {FILTERS.map((item) => {
              const active = filter === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.filter, active && styles.filterActive]}
                  onPress={() => setFilter(item.key)}
                >
                  <Ionicons
                    name={item.icon}
                    size={15}
                    color={active ? "#fff" : "#49604d"}
                  />
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {error ? (
            <View style={styles.errorCard}>
              <Ionicons name="cloud-offline-outline" size={25} color="#b33a35" />
              <View style={styles.errorCopy}>
                <Text style={styles.errorTitle}>Updates unavailable</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
              <TouchableOpacity onPress={() => load(true)}>
                <Text style={styles.retry}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : loading ? (
            <ActivityIndicator style={styles.loader} size="large" color="#2e7d32" />
          ) : filteredGroups.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name={filter === "unread" ? "checkmark-done" : "notifications-off-outline"}
                  size={34}
                  color="#2e7d32"
                />
              </View>
              <Text style={styles.emptyTitle}>
                {filter === "unread" ? "No unread updates" : "No notifications here"}
              </Text>
              <Text style={styles.emptyText}>
                Important barangay service updates will appear here automatically.
              </Text>
            </View>
          ) : (
            <>
              {!!newGroups.length && (
                <NotificationGroup title="New" groups={newGroups} onOpen={previewGroup} />
              )}
              {!!earlierGroups.length && (
                <NotificationGroup title="Earlier" groups={earlierGroups} onOpen={previewGroup} />
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <NotificationTimeline
        group={selectedGroup}
        onClose={() => setSelectedGroup(null)}
        onOpen={resolveNotificationRoute(selectedGroup?.latest) ? openSelectedUpdate : null}
        openLabel={openLabelFor(resolveNotificationRoute(selectedGroup?.latest))}
      />
    </ImageBackground>
  );
}

function openLabelFor(route) {
  const path = String(route || "").split("?")[0];
  if (path === "/report-summary" || path === "/report") return "Open incident report";
  if (path === "/documents") return "Open my document requests";
  if (path === "/feedback") return "Open Help Desk conversation";
  if (path === "/announcement") return "Open announcement";
  return "View details";
}

function NotificationGroup({ title, groups, onOpen }) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeading}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.groupCount}>{groups.length}</Text>
      </View>
      {groups.map((group) => (
        <NotificationRow
          key={group.key}
          group={group}
          onPress={() => onOpen(group)}
        />
      ))}
    </View>
  );
}

function NotificationRow({ group, onPress }) {
  const item = group.latest;
  const [icon, color, background] = ICONS[item.type] || ICONS.general;

  return (
    <TouchableOpacity
      style={[styles.row, group.unreadCount > 0 && styles.unreadRow]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={[styles.icon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={styles.copy}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          {group.important && (
            <View style={styles.importantPill}>
              <Text style={styles.importantText}>Important</Text>
            </View>
          )}
        </View>
        <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
        <View style={styles.rowMeta}>
          <Text style={styles.date}>{relativeTime(item.created_at)}</Text>
          {group.items.length > 1 && (
            <View style={styles.updatePill}>
              <Ionicons name="layers-outline" size={10} color="#2e7d32" />
              <Text style={styles.updateText}>{group.items.length} updates</Text>
            </View>
          )}
        </View>
      </View>
      {group.unreadCount > 0 ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{Math.min(group.unreadCount, 99)}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#a0aaa2" />
      )}
    </TouchableOpacity>
  );
}

function NotificationTimeline({ group, onClose, onOpen, openLabel }) {
  const latest = group?.latest;
  const [icon, color, background] = ICONS[latest?.type] || ICONS.general;

  return (
    <Modal visible={!!group} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          {group && (
            <>
              <View style={styles.sheetHeader}>
                <View style={[styles.sheetIcon, { backgroundColor: background }]}>
                  <Ionicons name={icon} size={23} color={color} />
                </View>
                <View style={styles.sheetHeaderCopy}>
                  <Text style={styles.sheetTitle}>{latest.title}</Text>
                  <Text style={styles.sheetSubtitle}>
                    {group.items.length} update{group.items.length === 1 ? "" : "s"} in this activity
                  </Text>
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Ionicons name="close" size={20} color="#506054" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.timeline} showsVerticalScrollIndicator={false}>
                {group.items.map((item, index) => (
                  <View key={item.id} style={styles.timelineItem}>
                    <View style={styles.timelineRail}>
                      <View style={[styles.timelineDot, index === 0 && styles.timelineDotLatest]} />
                      {index < group.items.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={styles.timelineCard}>
                      <View style={styles.timelineTitleLine}>
                        <Text style={styles.timelineTitle}>{item.title}</Text>
                        {index === 0 && <Text style={styles.latestLabel}>LATEST</Text>}
                      </View>
                      <Text style={styles.timelineMessage}>{item.message}</Text>
                      <Text style={styles.timelineDate}>{fullDate(item.created_at)}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              {onOpen ? (
                <TouchableOpacity style={styles.openButton} onPress={onOpen} activeOpacity={0.85}>
                  <Text style={styles.openButtonText}>{openLabel}</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.openButton} onPress={onClose} activeOpacity={0.85}>
                  <Text style={styles.openButtonText}>Done</Text>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 110 },
  hero: { flexDirection: "row", alignItems: "center", padding: 15, marginBottom: 13, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dce8de", elevation: 3 },
  heroIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#2e7d32" },
  heroDot: { position: "absolute", top: 7, right: 7, width: 9, height: 9, borderRadius: 5, backgroundColor: "#ef5350", borderWidth: 2, borderColor: "#fff" },
  heroCopy: { flex: 1, marginLeft: 12 },
  title: { color: "#225d29", fontSize: 18, fontWeight: "900" },
  subtitle: { color: "#737d75", marginTop: 3, fontSize: 11, lineHeight: 14 },
  markButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 10, backgroundColor: "#eaf6ec" },
  markAll: { color: "#2e7d32", fontSize: 11, fontWeight: "900" },
  filters: { gap: 8, paddingBottom: 15 },
  filter: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.95)", borderWidth: 1, borderColor: "#dce5dd" },
  filterActive: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  filterText: { color: "#49604d", fontSize: 11, fontWeight: "800" },
  filterTextActive: { color: "#fff" },
  group: { marginBottom: 17 },
  groupHeading: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 8 },
  groupTitle: { color: "#225d29", fontSize: 13, fontWeight: "900" },
  groupCount: { minWidth: 19, paddingHorizontal: 5, paddingVertical: 2, overflow: "hidden", color: "#607064", backgroundColor: "#e5ece6", borderRadius: 9, textAlign: "center", fontSize: 10, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13, marginBottom: 9, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#dfe8e0", elevation: 2 },
  unreadRow: { borderColor: "#82ba8a", backgroundColor: "#f7fff8" },
  icon: { width: 47, height: 47, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  copy: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowTitle: { flex: 1, color: "#273329", fontSize: 12, fontWeight: "900" },
  importantPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: "#ffebee" },
  importantText: { color: "#c62828", fontSize: 10, fontWeight: "900" },
  message: { color: "#626d64", marginTop: 4, fontSize: 11, lineHeight: 15 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 7 },
  date: { color: "#879188", fontSize: 10, fontWeight: "700" },
  updatePill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: "#eaf6ec" },
  updateText: { color: "#2e7d32", fontSize: 10, fontWeight: "900" },
  unreadBadge: { minWidth: 22, height: 22, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, borderRadius: 11, backgroundColor: "#d32f2f" },
  unreadBadgeText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  loader: { marginTop: 55 },
  errorCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 15, borderRadius: 16, backgroundColor: "#fff4f3", borderWidth: 1, borderColor: "#efc1bd" },
  errorCopy: { flex: 1 },
  errorTitle: { color: "#8d2f2b", fontSize: 11, fontWeight: "900" },
  errorText: { color: "#8d5f5b", marginTop: 3, fontSize: 11, lineHeight: 13 },
  retry: { color: "#b33a35", fontSize: 11, fontWeight: "900" },
  empty: { alignItems: "center", padding: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.95)", borderWidth: 1, borderColor: "#dfe8e0" },
  emptyIcon: { width: 62, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: "#eaf6ec" },
  emptyTitle: { color: "#2e3b31", marginTop: 12, fontWeight: "900" },
  emptyText: { maxWidth: 260, color: "#79817a", marginTop: 6, textAlign: "center", fontSize: 11, lineHeight: 15 },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17,31,20,0.48)" },
  sheet: { maxHeight: "82%", paddingHorizontal: 18, paddingTop: 9, paddingBottom: 24, backgroundColor: "#fff", borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  handle: { alignSelf: "center", width: 42, height: 5, marginBottom: 15, borderRadius: 3, backgroundColor: "#d9ded9" },
  sheetHeader: { flexDirection: "row", alignItems: "center", paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#e5ebe6" },
  sheetIcon: { width: 47, height: 47, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  sheetHeaderCopy: { flex: 1, marginHorizontal: 11 },
  sheetTitle: { color: "#26352a", fontSize: 14, fontWeight: "900" },
  sheetSubtitle: { color: "#7a857d", marginTop: 3, fontSize: 11 },
  closeButton: { width: 35, height: 35, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "#f0f4f0" },
  timeline: { marginTop: 15 },
  timelineItem: { flexDirection: "row", minHeight: 86 },
  timelineRail: { width: 22, alignItems: "center" },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#b7c1b9", borderWidth: 2, borderColor: "#fff", elevation: 1 },
  timelineDotLatest: { backgroundColor: "#2e7d32" },
  timelineLine: { flex: 1, width: 2, backgroundColor: "#dfe6e0" },
  timelineCard: { flex: 1, paddingBottom: 15, marginLeft: 7 },
  timelineTitleLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  timelineTitle: { flex: 1, color: "#2d3930", fontSize: 11, fontWeight: "900" },
  latestLabel: { color: "#2e7d32", fontSize: 10, fontWeight: "900" },
  timelineMessage: { color: "#626c64", marginTop: 5, fontSize: 11, lineHeight: 15 },
  timelineDate: { color: "#949b95", marginTop: 6, fontSize: 10 },
  openButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 51, marginTop: 8, borderRadius: 14, backgroundColor: "#2e7d32" },
  openButtonText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});