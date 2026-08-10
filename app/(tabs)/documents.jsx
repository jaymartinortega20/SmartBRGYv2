import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ImageBackground,
  Alert,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import GradientHeader from "../../components/GradientHeader";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";

const PURPOSES = [
  "Employment",
  "School Requirement",
  "Business Requirement",
  "Government Transaction",
  "Other",
];

const ALLOWED_DOCUMENT_NAMES = [
  "barangay clearance",
  "certificate of indigency",
  "certificate of residency",
  "barangay business permit/clearance",
  "cedula",
];

const STATUS_LABELS = {
  pending: "Pending",
  processing: "Processing",
  ready_to_claim: "Ready to Claim",
  claimed: "Claimed",
  rejected: "Rejected",
};

const STATUS_STEPS = ["pending", "processing", "ready_to_claim", "claimed"];
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const formatDate = (value, includeTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return includeTime ? date.toLocaleString("en-PH") : date.toLocaleDateString("en-PH");
};

const getImageType = (asset) => {
  const mimeType = String(asset?.mimeType || "").toLowerCase();
  const fileName = String(asset?.fileName || asset?.uri || "").toLowerCase().split("?")[0];
  if (mimeType === "image/png") return { extension: "png", contentType: "image/png" };
  if (mimeType === "image/webp") return { extension: "webp", contentType: "image/webp" };
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (!mimeType && fileName.endsWith(".png")) return { extension: "png", contentType: "image/png" };
  if (!mimeType && fileName.endsWith(".webp")) return { extension: "webp", contentType: "image/webp" };
  if (!mimeType && (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg"))) return { extension: "jpg", contentType: "image/jpeg" };
  return null;
};

const Documents = () => {
  const [documentTypes, setDocumentTypes] = useState([]);
  const [selections, setSelections] = useState({});
  const [claimMethod, setClaimMethod] = useState("self");
  const [validId, setValidId] = useState(null);
  const [authorizationLetter, setAuthorizationLetter] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claimTarget, setClaimTarget] = useState(null);
  const [claiming, setClaiming] = useState(false);

  const selectedItems = useMemo(
    () => documentTypes.filter((item) => selections[item.id]),
    [documentTypes, selections]
  );

  const totalFee = useMemo(
    () => selectedItems.reduce(
      (sum, item) => sum + Number(item.fee || 0) * Number(selections[item.id]?.copies || 1),
      0
    ),
    [selectedItems, selections]
  );

  const activeRequests = useMemo(
    () => requests.filter((item) => !["claimed", "rejected"].includes(item.status)),
    [requests]
  );

  const requestHistory = useMemo(
    () => requests.filter((item) => ["claimed", "rejected"].includes(item.status)),
    [requests]
  );

  const loadDocumentTypes = useCallback(async () => {
    const { data, error } = await supabase
      .from("document_types")
      .select("id, name, fee, requirements, instructions")
      .eq("is_active", true)
      .order("name");

    if (error) {
      throw new Error(error.message || "Unable to load available documents.");
    }

    const allowed = (data || []).filter((item) => {
      const name = String(item.name || "").trim().toLowerCase();
      if (name.includes("barangay id")) return false;
      return ALLOWED_DOCUMENT_NAMES.some((allowedName) =>
        name === allowedName ||
        (allowedName === "barangay business permit/clearance" &&
          (name.includes("business permit") || name.includes("business clearance")))
      );
    });

    setDocumentTypes(allowed);
  }, []);

  const loadRequests = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error("Please log in again.");

    const { data, error } = await supabase
      .from("document_requests")
      .select(
        "id, purpose, copies, fee_per_copy, status, claim_method, claim_schedule, admin_note, claimed_at, claimed_by_role, created_at, document_types(name)"
      )
      .eq("resident_id", authData.user.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message || "Unable to load document requests.");
    setRequests(data || []);
  }, []);

  const loadPage = useCallback(async (showRefresh = false) => {
    if (!isSupabaseConfigured) {
      setPageError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setPageError("");

    try {
      await Promise.all([loadDocumentTypes(), loadRequests()]);
    } catch (error) {
      setPageError(error.message || "Unable to load the document request page.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadDocumentTypes, loadRequests]);

  useFocusEffect(
    useCallback(() => {
      loadPage();
    }, [loadPage])
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let channel;
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      channel = supabase
        .channel(`resident-document-requests-${data.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "document_requests",
            filter: `resident_id=eq.${data.user.id}`,
          },
          () => loadRequests().catch(() => undefined)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "document_types" },
          () => loadDocumentTypes().catch(() => undefined)
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadDocumentTypes, loadRequests]);

  const acceptAttachment = (asset, setter) => {
    if (!asset?.uri) return;
    if (!getImageType(asset)) {
      Alert.alert("Unsupported Photo", "Use a JPEG, PNG, or WebP image. HEIC files are not supported for document attachments.");
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_ATTACHMENT_BYTES) {
      Alert.alert("File Too Large", "Each attachment must be 5 MB or smaller.");
      return;
    }
    setter(asset);
  };

  const takeAttachmentPhoto = async (setter) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow camera access.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
    });
    if (!result.canceled) acceptAttachment(result.assets[0], setter);
  };

  const chooseAttachmentPhoto = async (setter) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow access to your gallery.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
    });

    if (!result.canceled) acceptAttachment(result.assets[0], setter);
  };

  const pickAttachment = (setter) => {
    Alert.alert("Add Attachment", "Keep the complete document visible and readable.", [
      { text: "Take Photo", onPress: () => takeAttachmentPhoto(setter) },
      { text: "Choose from Gallery", onPress: () => chooseAttachmentPhoto(setter) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const confirmClaim = async () => {
    if (!claimTarget || claiming) return;
    setClaiming(true);

    try {
      const { error } = await supabase.rpc("confirm_document_claim", {
        request_id_input: claimTarget.id,
      });

      if (error) throw error;

      setClaimTarget(null);
      Alert.alert("Claim Confirmed", "This request is now recorded as claimed.");
      try {
        await loadRequests();
      } catch (refreshError) {
        setPageError(refreshError.message || "Claim recorded, but the list could not refresh.");
      }
    } catch (error) {
      console.log("Claim confirmation error:", error);
      Alert.alert("Unable to Confirm", error.message || "Please try again.");
    } finally {
      setClaiming(false);
    }
  };

  const uploadAttachment = async ({ asset, type, userId, batchId }) => {
    if (!asset) return null;

    const imageType = getImageType(asset);
    if (!imageType) throw new Error("Use a JPEG, PNG, or WebP attachment.");
    const storagePath = `${userId}/batches/${batchId}/${type}.${imageType.extension}`;
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error(`Unable to read the ${type === "valid_id" ? "valid ID" : "authorization letter"}.`);
    const fileData = await response.arrayBuffer();
    if (fileData.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("Each attachment must be 5 MB or smaller.");

    const { error: uploadError } = await supabase.storage
      .from("request-attachments")
      .upload(storagePath, fileData, {
        contentType: imageType.contentType,
        upsert: false,
      });

    if (uploadError) throw uploadError;
    return storagePath;
  };

  const toggleDocument = (document) => {
    setSelections((current) => {
      const next = { ...current };
      if (next[document.id]) {
        delete next[document.id];
      } else {
        next[document.id] = {
          copies: 1,
          purpose: PURPOSES[0],
          otherPurpose: "",
        };
      }
      return next;
    });
  };

  const updateSelection = (documentId, changes) => {
    setSelections((current) => ({
      ...current,
      [documentId]: {
        ...current[documentId],
        ...changes,
      },
    }));
  };

  const validateAndConfirm = () => {
    if (!selectedItems.length) {
      Alert.alert("Choose Documents", "Select at least one document to request.");
      return;
    }

    const incomplete = selectedItems.find((document) => {
      const config = selections[document.id];
      return config.purpose === "Other" && !config.otherPurpose.trim();
    });

    if (incomplete) {
      Alert.alert("Specific Purpose Required", `Enter the exact purpose for ${incomplete.name}.`);
      return;
    }

    if (claimMethod === "representative" && (!validId || !authorizationLetter)) {
      Alert.alert(
        "Attachments Required",
        "Attach the representative's valid ID and authorization letter when another person will claim the documents."
      );
      return;
    }

    const summary = selectedItems
      .map((document) => {
        const config = selections[document.id];
        return `${document.name} — ${config.copies} cop${config.copies === 1 ? "y" : "ies"}`;
      })
      .join("\n");

    Alert.alert(
      "Review Document Requests",
      `${summary}\n\nPayment upon pickup: ₱${totalFee.toFixed(2)}\nClaimed by: ${claimMethod === "self" ? "Resident" : "Authorized representative"}`,
      [
        { text: "Review", style: "cancel" },
        { text: "Submit All", onPress: submitRequests },
      ]
    );
  };

  const submitRequests = async () => {
    if (!isSupabaseConfigured || submitting) return;
    setSubmitting(true);
    const uploadedPaths = [];

    try {
      const { data: authData, error: userError } = await supabase.auth.getUser();
      if (userError || !authData.user) throw new Error("Please log in again.");

      const requestRows = selectedItems.map((document) => {
        const config = selections[document.id];
        const finalPurpose = config.purpose === "Other"
          ? config.otherPurpose.trim()
          : config.purpose;

        return {
          document_type_id: document.id,
          purpose: finalPurpose,
          copies: config.copies,
        };
      });

      let validIdPath = null;
      let authorizationLetterPath = null;
      if (claimMethod === "representative") {
        const batchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
        validIdPath = await uploadAttachment({ asset: validId, type: "valid_id", userId: authData.user.id, batchId });
        uploadedPaths.push(validIdPath);
        authorizationLetterPath = await uploadAttachment({ asset: authorizationLetter, type: "authorization_letter", userId: authData.user.id, batchId });
        uploadedPaths.push(authorizationLetterPath);
      }

      const { error: requestError } = await supabase.rpc("create_document_request_batch", {
        requests_input: requestRows,
        claim_method_input: claimMethod,
        valid_id_path_input: validIdPath,
        authorization_letter_path_input: authorizationLetterPath,
      });

      if (requestError) throw requestError;
      uploadedPaths.length = 0;

      Alert.alert(
        "Requests Submitted",
        `${requestRows.length} document request${requestRows.length === 1 ? "" : "s"} submitted successfully. Track each document separately below.`
      );
      setSelections({});
      setClaimMethod("self");
      setValidId(null);
      setAuthorizationLetter(null);
      try {
        await loadRequests();
      } catch (refreshError) {
        setPageError(refreshError.message || "Requests submitted, but the list could not refresh.");
      }
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from("request-attachments").remove(uploadedPaths);
      }
      console.log(error);
      const missingFunction = error.message?.includes("create_document_request_batch");
      Alert.alert(
        "Submission Failed",
        missingFunction
          ? "Run fix_document_request_batch.sql in Supabase, then try again."
          : error.message || "No requests were created. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2e7d32" />
      </View>
    );
  }

  return (
    <ImageBackground
      source={require("../../assets/images/background-bg.jpg")}
      style={styles.bg}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safe}>
        <GradientHeader title="Request Document" />
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPage(true)} colors={["#2e7d32"]} tintColor="#2e7d32" />}
        >
          {!isSupabaseConfigured && (
            <View style={styles.setupBox}>
              <Text style={styles.setupTitle}>Supabase setup required</Text>
              <Text style={styles.guideText}>Add your project URL and publishable key to the .env file.</Text>
            </View>
          )}

          {!!pageError && (
            <View style={styles.errorBox}>
              <Ionicons name="cloud-offline-outline" size={22} color="#a43b32" />
              <View style={styles.flex}>
                <Text style={styles.errorTitle}>Unable to refresh document services</Text>
                <Text style={styles.errorText}>{pageError}</Text>
              </View>
              <TouchableOpacity style={styles.errorRetry} onPress={() => loadPage(true)} disabled={refreshing}>
                <Text style={styles.errorRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>1. Choose one or more documents</Text>
            <Text style={styles.guideText}>Select everything you need. Each document will have its own copies, purpose, payment, and tracking status.</Text>

            <View style={styles.buttonGrid}>
              {documentTypes.map((item) => {
                const active = Boolean(selections[item.id]);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.documentButton, active && styles.documentButtonActive]}
                    onPress={() => toggleDocument(item)}
                  >
                    <View style={[styles.selectCheck, active && styles.selectCheckActive]}>
                      {active && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={[styles.documentName, active && styles.whiteText]}>{item.name}</Text>
                    <Text style={[styles.documentFee, active && styles.whiteText]}>₱{Number(item.fee).toFixed(2)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {documentTypes.length === 0 && !pageError && isSupabaseConfigured && (
              <View style={styles.emptyDocuments}>
                <Ionicons name="documents-outline" size={27} color="#748076" />
                <Text style={styles.emptyDocumentsTitle}>No documents available</Text>
                <Text style={styles.guideText}>Ask the barangay administrator to activate the supported document types.</Text>
              </View>
            )}

            <View style={styles.noteBox}>
              <Ionicons name="id-card-outline" size={21} color="#6d4c00" />
              <View style={styles.flex}>
                <Text style={styles.noteTitle}>Claiming requirement</Text>
                <Text style={styles.guideText}>A valid ID must be presented when claiming. The address should match the resident profile registered in SmartBRGY.</Text>
              </View>
            </View>

            {selectedItems.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>2. Set copies and purpose per document</Text>
                <Text style={styles.guideText}>You may request different quantities and purposes for each selected document.</Text>

                {selectedItems.map((document, index) => {
                  const config = selections[document.id];
                  return (
                    <View key={document.id} style={styles.selectedDocumentCard}>
                      <View style={styles.selectedDocumentHeader}>
                        <View style={styles.selectedDocumentNumber}><Text style={styles.selectedDocumentNumberText}>{index + 1}</Text></View>
                        <View style={styles.flex}>
                          <Text style={styles.selectedDocumentName}>{document.name}</Text>
                          <Text style={styles.selectedDocumentRate}>₱{Number(document.fee).toFixed(2)} per copy</Text>
                        </View>
                        <TouchableOpacity style={styles.removeDocumentButton} onPress={() => toggleDocument(document)}>
                          <Ionicons name="close" size={18} color="#9b3939" />
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.fieldLabel}>Number of copies</Text>
                      <View style={styles.documentControls}>
                        <View style={styles.stepperCompact}>
                          <TouchableOpacity style={styles.stepButtonCompact} onPress={() => updateSelection(document.id, { copies: Math.max(1, config.copies - 1) })}>
                            <Text style={styles.stepTextCompact}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.copyCountCompact}>{config.copies}</Text>
                          <TouchableOpacity style={styles.stepButtonCompact} onPress={() => updateSelection(document.id, { copies: Math.min(20, config.copies + 1) })}>
                            <Text style={styles.stepTextCompact}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.documentSubtotal}>Subtotal: ₱{(Number(document.fee) * config.copies).toFixed(2)}</Text>
                      </View>

                      <Text style={styles.fieldLabel}>Specific purpose</Text>
                      <View style={styles.chipRow}>
                        {PURPOSES.map((purposeOption) => (
                          <TouchableOpacity
                            key={purposeOption}
                            style={[styles.chip, config.purpose === purposeOption && styles.chipActive]}
                            onPress={() => updateSelection(document.id, { purpose: purposeOption, otherPurpose: purposeOption === "Other" ? config.otherPurpose : "" })}
                          >
                            <Text style={[styles.chipText, config.purpose === purposeOption && styles.whiteText]}>{purposeOption}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {config.purpose === "Other" && (
                        <TextInput
                          style={styles.input}
                          placeholder="State the exact purpose for this document"
                          placeholderTextColor="#888"
                          value={config.otherPurpose}
                          onChangeText={(value) => updateSelection(document.id, { otherPurpose: value })}
                          maxLength={200}
                        />
                      )}
                    </View>
                  );
                })}
              </>
            )}

            <View style={styles.paymentNotice}>
              <View style={styles.paymentIcon}>
                <Ionicons name="wallet-outline" size={22} color="#8a5a00" />
              </View>
              <View style={styles.paymentNoticeContent}>
                <Text style={styles.paymentTitle}>Payment upon pickup</Text>
                <Text style={styles.paymentAmount}>Combined amount to prepare: ₱{totalFee.toFixed(2)}</Text>
                <Text style={styles.paymentText}>Pay at the Barangay Tubod office when your document is ready and physically released to you.</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>3. Who will claim the documents?</Text>
            <View style={styles.claimMethodRow}>
              <TouchableOpacity style={[styles.claimMethodCard, claimMethod === "self" && styles.claimMethodActive]} onPress={() => { setClaimMethod("self"); setValidId(null); setAuthorizationLetter(null); }}>
                <Ionicons name="person-outline" size={25} color={claimMethod === "self" ? "#fff" : "#2e7d32"} />
                <Text style={[styles.claimMethodTitle, claimMethod === "self" && styles.whiteText]}>I will claim</Text>
                <Text style={[styles.claimMethodText, claimMethod === "self" && styles.claimMethodTextActive]}>Bring your original valid ID.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.claimMethodCard, claimMethod === "representative" && styles.claimMethodActive]} onPress={() => setClaimMethod("representative")}>
                <Ionicons name="people-outline" size={25} color={claimMethod === "representative" ? "#fff" : "#2e7d32"} />
                <Text style={[styles.claimMethodTitle, claimMethod === "representative" && styles.whiteText]}>Other person</Text>
                <Text style={[styles.claimMethodText, claimMethod === "representative" && styles.claimMethodTextActive]}>Upload representative documents.</Text>
              </TouchableOpacity>
            </View>

            {claimMethod === "representative" && (
              <View style={styles.representativeBox}>
                <Text style={styles.representativeTitle}>Required for authorized representative</Text>
                <Text style={styles.guideText}>Attach the representative&apos;s valid ID and the authorization letter signed by the resident.</Text>
                <AttachmentButton label="Representative's Valid ID *" asset={validId} onPress={() => pickAttachment(setValidId)} onRemove={() => setValidId(null)} />
                <AttachmentButton label="Authorization Letter *" asset={authorizationLetter} onPress={() => pickAttachment(setAuthorizationLetter)} onRemove={() => setAuthorizationLetter(null)} />
                <View style={styles.pickupReminder}>
                  <Ionicons name="alert-circle-outline" size={19} color="#8a5a00" />
                  <Text style={styles.pickupReminderText}>Please bring the same valid ID and original authorization letter upon pickup.</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.disabled]}
              onPress={validateAndConfirm}
              disabled={submitting || !isSupabaseConfigured || !selectedItems.length}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.submitText}>Review {selectedItems.length} Request{selectedItems.length === 1 ? "" : "s"}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <View style={styles.historyHeading}>
              <View>
                <Text style={styles.historyTitle}>Active Requests</Text>
                <Text style={styles.guideText}>Only pending and ongoing requests appear here.</Text>
              </View>
              <TouchableOpacity style={styles.reloadButton} onPress={() => loadPage(true)} disabled={refreshing}>
                {refreshing ? <ActivityIndicator size="small" color="#2e7d32" /> : <Ionicons name="refresh" size={19} color="#2e7d32" />}
              </TouchableOpacity>
            </View>
            {activeRequests.length === 0 ? (
              <View style={styles.emptyActiveBox}>
                <Ionicons name="checkmark-done-outline" size={26} color="#6f7d71" />
                <Text style={styles.emptyActiveTitle}>No active requests</Text>
                <Text style={styles.guideText}>Select documents above when you need a new request.</Text>
              </View>
            ) : (
              activeRequests.map((item) => (
                <View key={item.id} style={styles.requestCard}>
                  <View style={styles.requestHeader}>
                    <Text style={styles.requestTitle}>{item.document_types?.name}</Text>
                    <Text style={[
                      styles.status,
                      item.status === "ready_to_claim" && styles.readyStatus,
                      item.status === "claimed" && styles.claimedStatus,
                      item.status === "rejected" && styles.rejectedStatus,
                    ]}>
                      {STATUS_LABELS[item.status] || item.status}
                    </Text>
                  </View>

                  <RequestProgress status={item.status} />

                  <View style={styles.requestInfoGrid}>
                    <RequestInfo label="Purpose" value={item.purpose} />
                    <RequestInfo label="Copies" value={item.copies} />
                    <RequestInfo label="Payment upon pickup" value={`₱${(Number(item.fee_per_copy) * item.copies).toFixed(2)}`} highlight />
                    <RequestInfo label="Requested" value={formatDate(item.created_at)} />
                  </View>

                  {item.claim_schedule && (
                    <View style={styles.claimScheduleBox}>
                      <Ionicons name="calendar-outline" size={18} color="#1b6b20" />
                      <View style={styles.flex}>
                        <Text style={styles.claimScheduleLabel}>Claim schedule</Text>
                        <Text style={styles.claimScheduleValue}>{formatDate(item.claim_schedule, true)}</Text>
                      </View>
                    </View>
                  )}

                  {item.admin_note && (
                    <View style={styles.adminNoteBox}>
                      <Text style={styles.adminNoteTitle}>Barangay note</Text>
                      <Text style={styles.guideText}>{item.admin_note}</Text>
                    </View>
                  )}

                  {item.status === "ready_to_claim" && (
                    <>
                      <View style={styles.readyNotice}>
                        <Ionicons name="information-circle-outline" size={19} color="#1b6b20" />
                        <Text style={styles.readyNoticeText}>Only tap Claimed after the barangay has physically handed the document to you.</Text>
                      </View>
                      <TouchableOpacity style={styles.claimButton} onPress={() => setClaimTarget(item)}>
                        <Ionicons name="checkmark-circle-outline" size={21} color="#fff" />
                        <Text style={styles.claimButtonText}>I HAVE CLAIMED THIS DOCUMENT</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {item.status === "claimed" && (
                    <View style={styles.claimedBox}>
                      <Ionicons name="checkmark-done-circle" size={20} color="#1b6b20" />
                      <View style={styles.flex}>
                        <Text style={styles.claimedTitle}>Document claimed</Text>
                        <Text style={styles.claimedDetail}>
                          {item.claimed_at ? formatDate(item.claimed_at, true) : "Claim completed"}
                          {item.claimed_by_role ? ` · Confirmed by ${item.claimed_by_role}` : ""}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>

          {requestHistory.length > 0 && (
            <View style={styles.card}>
              <View style={styles.completedHeading}>
                <View style={styles.completedIcon}>
                  <Ionicons name="archive-outline" size={20} color="#68756a" />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.completedTitle}>Request History</Text>
                  <Text style={styles.completedSubtitle}>Claimed and closed requests are kept here.</Text>
                </View>
              </View>

              {requestHistory.map((item) => (
                <View key={item.id} style={styles.historyRow}>
                  <View style={[styles.historyStatusIcon, item.status === "rejected" && styles.historyRejectedIcon]}>
                    <Ionicons
                      name={item.status === "claimed" ? "checkmark-done" : "close"}
                      size={18}
                      color={item.status === "claimed" ? "#657467" : "#9a5555"}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.historyDocument}>{item.document_types?.name}</Text>
                    <Text style={styles.historyMeta}>
                      {item.copies} cop{item.copies === 1 ? "y" : "ies"} · {item.purpose} · ₱{(Number(item.fee_per_copy) * item.copies).toFixed(2)}
                    </Text>
                    <Text style={styles.historyDate}>
                      {item.status === "claimed" && item.claimed_at
                        ? `Claimed ${formatDate(item.claimed_at)}`
                        : `Requested ${formatDate(item.created_at)}`}
                    </Text>
                  </View>
                  <Text style={[styles.historyBadge, item.status === "rejected" && styles.historyRejectedBadge]}>
                    {STATUS_LABELS[item.status]}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>

        <Modal
          visible={Boolean(claimTarget)}
          transparent
          animationType="fade"
          onRequestClose={() => !claiming && setClaimTarget(null)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => !claiming && setClaimTarget(null)} />
            <View style={styles.confirmModal}>
              <ScrollView style={styles.confirmScroll} contentContainerStyle={styles.confirmScrollContent} showsVerticalScrollIndicator nestedScrollEnabled>
              <View style={styles.confirmIcon}>
                <Ionicons name="document-text-outline" size={34} color="#2e7d32" />
              </View>
              <Text style={styles.confirmTitle}>Confirm document claim</Text>
              <Text style={styles.confirmText}>Have you already received this document from the Barangay Tubod office?</Text>

              {claimTarget && (
                <View style={styles.confirmPreview}>
                  <Text style={styles.confirmDocument}>{claimTarget.document_types?.name}</Text>
                  <Text style={styles.confirmDetail}>{claimTarget.copies} cop{claimTarget.copies === 1 ? "y" : "ies"} · ₱{(Number(claimTarget.fee_per_copy) * claimTarget.copies).toFixed(2)}</Text>
                </View>
              )}

              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={19} color="#9a6100" />
                <Text style={styles.warningText}>Do not confirm if you have not yet received the physical document.</Text>
              </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setClaimTarget(null)} disabled={claiming}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmButton, claiming && styles.disabled]} onPress={confirmClaim} disabled={claiming}>
                  {claiming ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmButtonText}>Yes, I claimed it</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
};

const AttachmentButton = ({ label, asset, onPress, onRemove }) => asset ? (
  <View style={styles.attachmentSelected}>
    <Image source={{ uri: asset.uri }} style={styles.attachmentPreview} resizeMode="contain" />
    <View style={styles.attachmentSelectedCopy}>
      <Text style={styles.attachmentAttached}>✓ {label} attached</Text>
      <Text style={styles.attachmentHint}>Check that the complete document is readable.</Text>
      <View style={styles.attachmentActions}>
        <TouchableOpacity style={styles.attachmentChange} onPress={onPress}><Text style={styles.attachmentChangeText}>Change</Text></TouchableOpacity>
        <TouchableOpacity style={styles.attachmentRemove} onPress={onRemove}><Text style={styles.attachmentRemoveText}>Remove</Text></TouchableOpacity>
      </View>
    </View>
  </View>
) : (
  <TouchableOpacity style={styles.attachmentButton} onPress={onPress}>
    <Ionicons name="camera-outline" size={22} color="#2e7d32" />
    <Text style={styles.attachmentText}>{label}</Text>
  </TouchableOpacity>
);

const RequestInfo = ({ label, value, highlight }) => (
  <View style={[styles.requestInfo, highlight && styles.requestInfoHighlight]}>
    <Text style={styles.requestInfoLabel}>{label}</Text>
    <Text style={[styles.requestInfoValue, highlight && styles.requestInfoValueHighlight]}>{value === null || value === undefined || value === "" ? "—" : String(value)}</Text>
  </View>
);

const RequestProgress = ({ status }) => {
  if (status === "rejected") {
    return (
      <View style={styles.rejectedProgress}>
        <Ionicons name="close-circle-outline" size={18} color="#a33232" />
        <Text style={styles.rejectedProgressText}>This request was not approved. Check the barangay note or contact the office.</Text>
      </View>
    );
  }

  const currentIndex = STATUS_STEPS.indexOf(status);

  if (currentIndex < 0) {
    return (
      <View style={styles.unknownProgress}>
        <Ionicons name="information-circle-outline" size={18} color="#665313" />
        <Text style={styles.unknownProgressText}>Current status: {STATUS_LABELS[status] || String(status || "Unknown")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.progressWrap}>
      {STATUS_STEPS.map((step, index) => {
        const complete = currentIndex >= index;
        const isLast = index === STATUS_STEPS.length - 1;
        return (
          <React.Fragment key={step}>
            <View style={styles.progressStep}>
              <View style={[styles.progressCircle, complete && styles.progressCircleComplete]}>
                {complete ? (
                  <Ionicons name="checkmark" size={13} color="#fff" />
                ) : (
                  <Text style={styles.progressNumber}>{index + 1}</Text>
                )}
              </View>
              <Text style={[styles.progressLabel, complete && styles.progressLabelComplete]}>{STATUS_LABELS[step]}</Text>
            </View>
            {!isLast && <View style={[styles.progressLine, currentIndex > index && styles.progressLineComplete]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
};

export default Documents;

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  keyboard: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff8e8" },
  container: { padding: 16, paddingBottom: 105 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, elevation: 5, marginBottom: 16 },
  setupBox: { backgroundColor: "#fff3cd", borderRadius: 12, padding: 14, marginBottom: 14 },
  setupTitle: { fontWeight: "800", color: "#7a5200", marginBottom: 4 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, marginBottom: 14, borderRadius: 12, backgroundColor: "#fff3f2", borderWidth: 1, borderColor: "#efcfcb" },
  errorTitle: { color: "#8d3029", fontSize: 11, fontWeight: "900" },
  errorText: { color: "#8a5b57", marginTop: 2, fontSize: 9, lineHeight: 13 },
  errorRetry: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: "#2e7d32" },
  errorRetryText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#222", marginTop: 14, marginBottom: 7 },
  guideText: { color: "#666", fontSize: 12, lineHeight: 18 },
  buttonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  documentButton: { position: "relative", flexGrow: 1, flexBasis: "47%", maxWidth: "100%", minWidth: 135, backgroundColor: "#f2f5f2", borderColor: "#cbd7cc", borderWidth: 1, borderRadius: 12, padding: 12 },
  documentButtonActive: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  selectCheck: { position: "absolute", right: 8, top: 8, width: 21, height: 21, borderRadius: 11, borderWidth: 1, borderColor: "#aab8ac", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  selectCheckActive: { backgroundColor: "#f9a825", borderColor: "#f9a825" },
  documentName: { color: "#1d341f", fontWeight: "700", minHeight: 35 },
  documentFee: { color: "#2e7d32", fontWeight: "800", marginTop: 6 },
  emptyDocuments: { alignItems: "center", padding: 20, marginTop: 12, borderRadius: 12, backgroundColor: "#f7f9f7", borderWidth: 1, borderStyle: "dashed", borderColor: "#d7dfd8" },
  emptyDocumentsTitle: { color: "#566358", marginTop: 7, marginBottom: 3, fontWeight: "900" },
  whiteText: { color: "#fff" },
  noteBox: { flexDirection: "row", gap: 10, backgroundColor: "#fff8e8", borderLeftWidth: 4, borderLeftColor: "#f9a825", borderRadius: 8, padding: 12, marginTop: 12 },
  noteTitle: { color: "#6d4c00", fontWeight: "800", marginBottom: 3 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 8 },
  chip: { borderWidth: 1, borderColor: "#2e7d32", paddingVertical: 8, paddingHorizontal: 11, borderRadius: 18 },
  chipActive: { backgroundColor: "#2e7d32" },
  chipText: { color: "#2e7d32", fontSize: 12, fontWeight: "700" },
  input: { backgroundColor: "#f0f0f0", padding: 12, borderRadius: 10, color: "#000", marginBottom: 10 },
  selectedDocumentCard: { backgroundColor: "#f8faf8", borderWidth: 1, borderColor: "#dce5dd", borderRadius: 14, padding: 13, marginTop: 12 },
  selectedDocumentHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  selectedDocumentNumber: { width: 29, height: 29, borderRadius: 9, backgroundColor: "#2e7d32", alignItems: "center", justifyContent: "center" },
  selectedDocumentNumberText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  selectedDocumentName: { color: "#253b28", fontWeight: "900", fontSize: 13 },
  selectedDocumentRate: { color: "#718073", fontSize: 10, marginTop: 2 },
  removeDocumentButton: { width: 33, height: 33, borderRadius: 9, backgroundColor: "#fff0f0", alignItems: "center", justifyContent: "center" },
  fieldLabel: { color: "#3d4e3f", fontSize: 10, fontWeight: "900", marginBottom: 7, marginTop: 3 },
  documentControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 13 },
  stepperCompact: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#d6dfd7", borderRadius: 10, overflow: "hidden" },
  stepButtonCompact: { width: 36, height: 36, backgroundColor: "#eaf5ec", alignItems: "center", justifyContent: "center" },
  stepTextCompact: { color: "#2e7d32", fontSize: 19, fontWeight: "900" },
  copyCountCompact: { width: 42, textAlign: "center", color: "#263d28", fontSize: 15, fontWeight: "900" },
  documentSubtotal: { color: "#2e7d32", fontSize: 11, fontWeight: "900" },
  paymentNotice: { flexDirection: "row", gap: 11, backgroundColor: "#fff8e8", borderWidth: 1, borderColor: "#f2d38c", borderRadius: 12, padding: 13, marginTop: 8, marginBottom: 4 },
  paymentIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: "#ffecbd", alignItems: "center", justifyContent: "center" },
  paymentNoticeContent: { flex: 1 },
  paymentTitle: { color: "#6d4c00", fontWeight: "900", fontSize: 13 },
  paymentAmount: { color: "#8a5a00", fontWeight: "800", fontSize: 12, marginTop: 3 },
  paymentText: { color: "#786640", fontSize: 11, lineHeight: 16, marginTop: 4 },
  claimMethodRow: { flexDirection: "row", gap: 9 },
  claimMethodCard: { flex: 1, minHeight: 120, borderWidth: 1, borderColor: "#b9cbbb", backgroundColor: "#f7faf7", borderRadius: 13, padding: 12, alignItems: "center", justifyContent: "center" },
  claimMethodActive: { backgroundColor: "#2e7d32", borderColor: "#2e7d32" },
  claimMethodTitle: { color: "#2e7d32", fontSize: 12, fontWeight: "900", marginTop: 7 },
  claimMethodText: { color: "#758177", fontSize: 9, lineHeight: 13, textAlign: "center", marginTop: 4 },
  claimMethodTextActive: { color: "#dcecdf" },
  representativeBox: { backgroundColor: "#f8faf8", borderWidth: 1, borderColor: "#dce5dd", borderRadius: 13, padding: 13, marginTop: 11 },
  representativeTitle: { color: "#2f4632", fontSize: 12, fontWeight: "900", marginBottom: 4 },
  pickupReminder: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#fff8e8", borderRadius: 9, padding: 10, marginTop: 3 },
  pickupReminderText: { flex: 1, color: "#7b622d", fontSize: 10, lineHeight: 15 },
  attachmentButton: { minHeight: 62, borderWidth: 1, borderStyle: "dashed", borderColor: "#2e7d32", borderRadius: 10, marginBottom: 10, padding: 12, gap: 9, flexDirection: "row", alignItems: "center" },
  attachmentSelected: { minHeight: 108, flexDirection: "row", alignItems: "center", padding: 9, marginBottom: 10, borderRadius: 11, backgroundColor: "#eef7ef", borderWidth: 1, borderColor: "#bcd8c0" },
  attachmentPreview: { width: 112, height: 76, borderRadius: 7, marginRight: 10, backgroundColor: "#fff" },
  attachmentSelectedCopy: { flex: 1, minWidth: 0 }, attachmentAttached: { color: "#246b2c", fontSize: 10, fontWeight: "900" }, attachmentHint: { color: "#6e7c70", marginTop: 3, fontSize: 8, lineHeight: 12 },
  attachmentActions: { flexDirection: "row", gap: 7, marginTop: 7 }, attachmentChange: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#2e7d32" }, attachmentChangeText: { color: "#fff", fontSize: 8, fontWeight: "900" }, attachmentRemove: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#f7dddd" }, attachmentRemoveText: { color: "#923939", fontSize: 8, fontWeight: "900" },
  attachmentText: { color: "#2e7d32", fontWeight: "700", flex: 1 },
  submitBtn: { minHeight: 51, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#2e7d32", padding: 14, borderRadius: 12, marginTop: 14 },
  disabled: { opacity: 0.5 },
  submitText: { color: "#fff", textAlign: "center", fontWeight: "800" },
  historyHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 },
  historyTitle: { fontSize: 17, fontWeight: "900", color: "#222" },
  reloadButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#edf6ee", alignItems: "center", justifyContent: "center" },
  emptyActiveBox: { alignItems: "center", backgroundColor: "#f7f9f7", borderWidth: 1, borderStyle: "dashed", borderColor: "#d7dfd8", borderRadius: 12, padding: 22, marginTop: 12 },
  emptyActiveTitle: { color: "#566358", fontSize: 12, fontWeight: "900", marginTop: 6, marginBottom: 2 },
  requestCard: { borderWidth: 1, borderColor: "#e2e9e3", backgroundColor: "#fff", borderRadius: 14, padding: 14, marginTop: 12 },
  requestHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  requestTitle: { flex: 1, fontWeight: "800", color: "#222" },
  status: { backgroundColor: "#f4e3ad", color: "#725500", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, fontSize: 11, fontWeight: "800" },
  readyStatus: { backgroundColor: "#d7f2d9", color: "#1b6b20" },
  claimedStatus: { backgroundColor: "#dff2e3", color: "#176022" },
  rejectedStatus: { backgroundColor: "#fae1e1", color: "#962f2f" },
  progressWrap: { flexDirection: "row", alignItems: "flex-start", marginVertical: 17 },
  progressStep: { width: 58, alignItems: "center" },
  progressCircle: { width: 25, height: 25, borderRadius: 13, backgroundColor: "#e0e5e0", alignItems: "center", justifyContent: "center" },
  progressCircleComplete: { backgroundColor: "#2e7d32" },
  progressNumber: { color: "#7a857b", fontSize: 10, fontWeight: "800" },
  progressLabel: { color: "#8a938b", fontSize: 8, fontWeight: "700", textAlign: "center", marginTop: 5 },
  progressLabelComplete: { color: "#2e7d32" },
  progressLine: { flex: 1, height: 3, backgroundColor: "#e0e5e0", marginTop: 11 },
  progressLineComplete: { backgroundColor: "#2e7d32" },
  rejectedProgress: { flexDirection: "row", gap: 8, backgroundColor: "#fff0f0", borderRadius: 10, padding: 11, marginVertical: 13 },
  rejectedProgressText: { flex: 1, color: "#8c3c3c", fontSize: 10, lineHeight: 15 },
  unknownProgress: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, marginVertical: 13, borderRadius: 10, backgroundColor: "#fff7df" },
  unknownProgressText: { flex: 1, color: "#665313", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  requestInfoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  requestInfo: { width: "48%", backgroundColor: "#f6f8f6", borderRadius: 10, padding: 10 },
  requestInfoHighlight: { backgroundColor: "#fff8e8", borderWidth: 1, borderColor: "#f2d38c" },
  requestInfoLabel: { color: "#7a837b", fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  requestInfoValue: { color: "#2f3e31", fontSize: 11, fontWeight: "800", marginTop: 4 },
  requestInfoValueHighlight: { color: "#8a5a00" },
  claimScheduleBox: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#eef8ef", borderRadius: 10, padding: 11, marginTop: 10 },
  claimScheduleLabel: { color: "#376b3c", fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  claimScheduleValue: { color: "#1b6b20", fontSize: 11, fontWeight: "800", marginTop: 2 },
  adminNoteBox: { backgroundColor: "#f5f5f5", borderLeftWidth: 3, borderLeftColor: "#6d786e", borderRadius: 8, padding: 10, marginTop: 10 },
  adminNoteTitle: { color: "#3e4c40", fontSize: 10, fontWeight: "900", marginBottom: 3 },
  readyNotice: { flexDirection: "row", alignItems: "flex-start", gap: 7, backgroundColor: "#eef8ef", borderRadius: 10, padding: 10, marginTop: 11 },
  readyNoticeText: { flex: 1, color: "#376b3c", fontSize: 10, lineHeight: 15 },
  claimButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#2e7d32", borderRadius: 11, paddingVertical: 13, marginTop: 10 },
  claimButtonText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  claimedBox: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "#eef8ef", borderWidth: 1, borderColor: "#cce5cf", borderRadius: 10, padding: 11, marginTop: 11 },
  claimedTitle: { color: "#1b6b20", fontSize: 11, fontWeight: "900" },
  claimedDetail: { color: "#4f7853", fontSize: 9, marginTop: 2 },
  completedHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 7 },
  completedIcon: { width: 39, height: 39, borderRadius: 11, backgroundColor: "#edf0ed", alignItems: "center", justifyContent: "center" },
  completedTitle: { color: "#4e5a50", fontSize: 15, fontWeight: "900" },
  completedSubtitle: { color: "#879088", fontSize: 10, marginTop: 2 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: "#edf0ed", paddingVertical: 12, opacity: 0.68 },
  historyStatusIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#edf1ed", alignItems: "center", justifyContent: "center" },
  historyRejectedIcon: { backgroundColor: "#f7eaea" },
  historyDocument: { color: "#566158", fontSize: 11, fontWeight: "900" },
  historyMeta: { color: "#7e8780", fontSize: 9, lineHeight: 13, marginTop: 3 },
  historyDate: { color: "#929993", fontSize: 8, marginTop: 3 },
  historyBadge: { color: "#5f6c61", backgroundColor: "#e9eeea", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, fontSize: 8, fontWeight: "900" },
  historyRejectedBadge: { color: "#8c4b4b", backgroundColor: "#f5e4e4" },
  flex: { flex: 1, minWidth: 0 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,35,20,0.62)", alignItems: "center", justifyContent: "center", padding: 20 },
  confirmModal: { width: "100%", maxWidth: 390, maxHeight: "88%", backgroundColor: "#fff", borderRadius: 20, padding: 21, elevation: 12, overflow: "hidden" },
  confirmScroll: { flexShrink: 1 }, confirmScrollContent: { paddingBottom: 4 },
  confirmIcon: { width: 66, height: 66, borderRadius: 20, backgroundColor: "#eaf6ec", alignItems: "center", justifyContent: "center", alignSelf: "center" },
  confirmTitle: { color: "#214d27", fontSize: 20, fontWeight: "900", textAlign: "center", marginTop: 14 },
  confirmText: { color: "#657066", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 7 },
  confirmPreview: { backgroundColor: "#f5f8f5", borderRadius: 11, padding: 12, marginTop: 15 },
  confirmDocument: { color: "#273a29", fontSize: 13, fontWeight: "900" },
  confirmDetail: { color: "#707a71", fontSize: 10, marginTop: 4 },
  warningBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#fff7e5", borderRadius: 10, padding: 11, marginTop: 12 },
  warningText: { flex: 1, color: "#7c5b1e", fontSize: 10, lineHeight: 15 },
  modalActions: { flexDirection: "row", gap: 9, marginTop: 17 },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: "#cfd8d0", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  cancelButtonText: { color: "#4f5e51", fontWeight: "800", fontSize: 11 },
  confirmButton: { flex: 1.3, backgroundColor: "#2e7d32", borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  confirmButtonText: { color: "#fff", fontWeight: "900", fontSize: 11 },
});
