import React, { useRef, useState } from "react";
import {
  Animated,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GRADIENT } from "../constants/theme";

const SLIDES = [
  {
    id: "informed",
    eyebrow: "BARANGAY UPDATES",
    title: "Stay informed",
    description: "Receive clear announcements, emergency alerts, schedules, and community updates from Barangay Tubod.",
    image: require("../assets/images/onboard1.png"),
    icon: "megaphone-outline",
    accent: "#1976d2",
    tint: "#eaf4ff",
  },
  {
    id: "services",
    eyebrow: "RESIDENT SERVICES",
    title: "Request with ease",
    description: "Request barangay documents, submit incident reports, and monitor every update from one secure place.",
    image: require("../assets/images/onboard2.png"),
    icon: "document-text-outline",
    accent: "#2e7d32",
    tint: "#eaf6ec",
  },
  {
    id: "connected",
    eyebrow: "HELP DESK & NOTICES",
    title: "Stay connected",
    description: "Talk with the Barangay Help Desk and receive important notices, claim updates, and meeting schedules.",
    image: require("../assets/images/onboard3.png"),
    icon: "notifications-outline",
    accent: "#d28a00",
    tint: "#fff5db",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const isLast = page === SLIDES.length - 1;
  const compact = height < 720;

  const finishOnboarding = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await AsyncStorage.setItem("hasOnboarded", "true");
      router.replace("/(tabs)");
    } finally {
      setFinishing(false);
    }
  };

  const goTo = (index) => {
    const next = Math.max(0, Math.min(index, SLIDES.length - 1));
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  };

  const continueFlow = () => {
    if (isLast) finishOnboarding();
    else goTo(page + 1);
  };

  return (
    <ImageBackground source={require("../assets/images/background-bg.jpg")} style={styles.bg} resizeMode="cover">
      <View style={styles.wash} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.topBar}>
          <View style={styles.brand}>
            <Image source={require("../assets/images/logo.png")} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={styles.brandName}>SmartBRGY</Text>
              <Text style={styles.brandPlace}>BARANGAY TUBOD</Text>
            </View>
          </View>
          {!isLast && (
            <TouchableOpacity style={styles.skipButton} activeOpacity={0.7} onPress={finishOnboarding} disabled={finishing}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
          onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
        >
          {SLIDES.map((slide, index) => {
            const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
            const opacity = scrollX.interpolate({ inputRange, outputRange: [0.25, 1, 0.25], extrapolate: "clamp" });
            const translateY = scrollX.interpolate({ inputRange, outputRange: [22, 0, 22], extrapolate: "clamp" });
            const scale = scrollX.interpolate({ inputRange, outputRange: [0.9, 1, 0.9], extrapolate: "clamp" });

            return (
              <View key={slide.id} style={[styles.slide, { width, paddingHorizontal: Math.max(18, width * 0.055) }]}>
                <Animated.View style={[styles.contentCard, compact && styles.contentCardCompact, { opacity, transform: [{ translateY }] }]}>
                  <View style={[styles.imagePanel, compact && styles.imagePanelCompact]}>
                    <View style={[styles.iconBadge, { backgroundColor: slide.tint }]}>
                      <Ionicons name={slide.icon} size={21} color={slide.accent} />
                    </View>
                    <Animated.Image
                      source={slide.image}
                      resizeMode="contain"
                      style={[styles.image, compact && styles.imageCompact, { transform: [{ scale }] }]}
                    />
                  </View>

                  <View style={styles.copy}>
                    <Text style={[styles.eyebrow, { color: slide.accent }]}>{slide.eyebrow}</Text>
                    <Text style={styles.title}>{slide.title}</Text>
                    <Text style={styles.description}>{slide.description}</Text>
                  </View>
                </Animated.View>
              </View>
            );
          })}
        </Animated.ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.progressRow}>
            {SLIDES.map((slide, index) => (
              <TouchableOpacity key={slide.id} onPress={() => goTo(index)} activeOpacity={0.7} hitSlop={8}>
                <View style={[styles.dotTrack, page === index && styles.dotTrackActive]}>
                  {page === index && <LinearGradient colors={["#2e7d32", "#f9a825"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.dotFill} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.actions}>
            {page > 0 ? (
              <TouchableOpacity style={styles.backButton} onPress={() => goTo(page - 1)} activeOpacity={0.75}>
                <Ionicons name="arrow-back" size={19} color="#2e7d32" />
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
            ) : <View style={styles.backPlaceholder} />}

            <TouchableOpacity style={styles.continueTouch} onPress={continueFlow} activeOpacity={0.86} disabled={finishing}>
              <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.continueButton}>
                <Text style={styles.continueText}>{finishing ? "OPENING..." : isLast ? "GET STARTED" : "NEXT"}</Text>
                <Ionicons name={isLast ? "checkmark-circle-outline" : "arrow-forward"} size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  wash: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(247,250,247,0.68)" },
  safe: { flex: 1 },
  topBar: { minHeight: 66, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 4 },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  logo: { width: 42, height: 42 },
  brandName: { color: "#185b25", fontSize: 16, fontWeight: "900" },
  brandPlace: { color: "#778077", marginTop: 1, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  skipButton: { minWidth: 58, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: "#dce6dd" },
  skipText: { color: "#4d5d50", fontSize: 11, fontWeight: "800" },
  slide: { flex: 1, justifyContent: "center", paddingVertical: 10 },
  contentCard: { width: "100%", maxWidth: 520, alignSelf: "center", overflow: "hidden", borderRadius: 28, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "#dce7dd", elevation: 8, shadowColor: "#183b20", shadowOpacity: 0.14, shadowOffset: { width: 0, height: 7 }, shadowRadius: 17 },
  contentCardCompact: { borderRadius: 23 },
  imagePanel: { minHeight: 275, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingTop: 18, backgroundColor: "#f4f8f4" },
  imagePanelCompact: { minHeight: 205, paddingTop: 10 },
  iconBadge: { position: "absolute", top: 16, left: 16, zIndex: 2, width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13 },
  image: { width: "93%", height: 250 },
  imageCompact: { height: 190 },
  copy: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 25 },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: "#183b20", marginTop: 7, fontSize: 27, fontWeight: "900", textAlign: "center" },
  description: { maxWidth: 390, color: "#59645b", marginTop: 10, fontSize: 13, lineHeight: 20, textAlign: "center" },
  footer: { paddingHorizontal: 20, paddingTop: 13, backgroundColor: "rgba(249,251,249,0.94)", borderTopWidth: 1, borderTopColor: "rgba(217,228,219,0.9)" },
  progressRow: { height: 19, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  dotTrack: { width: 9, height: 7, overflow: "hidden", borderRadius: 5, backgroundColor: "#cbd4cc" },
  dotTrackActive: { width: 31 },
  dotFill: { flex: 1 },
  actions: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  backButton: { width: 92, height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 13, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d9e3da" },
  backPlaceholder: { width: 92 },
  backText: { color: "#2e7d32", fontSize: 11, fontWeight: "900" },
  continueTouch: { flex: 1, maxWidth: 270 },
  continueButton: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, elevation: 4, shadowColor: "#244b29", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 },
  continueText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
});