import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Platform,
  StatusBar,
  ActivityIndicator,
  Animated,
  Dimensions,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import Sidebar from "../(tabs)/sidebar";

// ─── Theme Tokens (Claymorphism — same language as the rest of the app) ────
// Dark = near-black with warm amber/orange accent.
// Bright = white / soft grey, same warm accent for consistency.
// No blue, purple, violet, or pink anywhere in the palette.
const DARK = {
  bgGradient: ["#0A0A0B", "#141210", "#1C1712"] as const,
  blobPrimary: "#FF8A3D",
  blobSecondary: "#FFB25E",
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"] as const,
  accentDim: "#E86A1F",
  danger: "#FF6B5B",
  textPrimary: "#F5F5F4",
  textSecondary: "#9B9B9F",
  border: "#28282C",
  shadowDark: "#000000",
  statusBar: "light-content" as const,
};

const BRIGHT = {
  bgGradient: ["#FAFAFA", "#F4F4F5", "#EFEFF1"] as const,
  blobPrimary: "#FF8A3D",
  blobSecondary: "#FFB25E",
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceAlt: "#EDEDEF",
  accent: "#FF7A2F",
  accentGradient: ["#FF8A3D", "#FF6B1F"] as const,
  accentDim: "#E86A1F",
  danger: "#EF5A4C",
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  shadowDark: "#B9B9C0",
  statusBar: "dark-content" as const,
};

type ThemeColorScheme = typeof DARK | typeof BRIGHT;

type Theme = "bright" | "dark";

const getSidebarWidth = () => Math.min(300, Dimensions.get("window").width * 0.8);

// ─── Profile Page ─────────────────────────────────────────────────────────────
export default function Profile() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [themeLoaded, setThemeLoaded] = useState(false);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getSidebarWidth());

  const translateX = useRef(new Animated.Value(-getSidebarWidth())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;
  const avatarScale = useRef(new Animated.Value(0.85)).current;

  // ── Keep sidebar width in sync with orientation / window changes ──────────
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", () => {
      const w = getSidebarWidth();
      setSidebarWidth(w);
      if (!sidebarOpen) translateX.setValue(-w);
    });
    return () => sub.remove();
  }, [sidebarOpen]);

  // ── Load theme + profile data from storage ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.multiGet(["theme", "fullName", "username", "email"]).then((pairs) => {
      if (cancelled) return;
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? ""]));
      if (map.theme === "bright" || map.theme === "dark") setTheme(map.theme as Theme);
      setFullName(map.fullName);
      setUsername(map.username);
      setEmail(map.email);
      setThemeLoaded(true);
      setProfileLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (themeLoaded && profileLoaded) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 380, useNativeDriver: true }),
        Animated.spring(avatarScale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }),
      ]).start();
    }
  }, [themeLoaded, profileLoaded, fadeAnim, slideAnim, avatarScale]);

  // ── Drive the slide animation purely from sidebarOpen ──────────────────────
  useEffect(() => {
    if (sidebarOpen) {
      setSidebarMounted(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -sidebarWidth, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setSidebarMounted(false);
      });
    }
  }, [sidebarOpen, sidebarWidth]);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // ── Sign out: clear session data and send the user back to login ──────────
  const performSignOut = useCallback(async () => {
    try {
      setSigningOut(true);
      await AsyncStorage.multiRemove(["authToken", "fullName", "username", "email"]);
      router.replace("/(auth)/login" as any);
    } catch (e) {
      Alert.alert("Sign out failed", "Please try again.");
    } finally {
      setSigningOut(false);
    }
  }, []);

  const handleSignOutPress = useCallback(() => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: performSignOut },
      ],
      { cancelable: true }
    );
  }, [performSignOut]);

  const C = theme === "bright" ? BRIGHT : DARK;

  if (!themeLoaded || !profileLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK.bg, alignItems: "center", justifyContent: "center" }}>
        <View style={[styles.loadingClay, { backgroundColor: DARK.surface, shadowColor: DARK.shadowDark }]}>
          <ActivityIndicator color={DARK.accent} size="large" />
        </View>
      </View>
    );
  }

  const initials = fullName
    ? fullName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("")
    : "?";

  return (
    <LinearGradient
      colors={C.bgGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      <StatusBar barStyle={C.statusBar} backgroundColor={C.bgGradient[0]} />

      {/* Decorative glow blobs */}
      <View
        style={[
          styles.blob,
          styles.blobOne,
          { backgroundColor: C.blobPrimary, opacity: theme === "bright" ? 0.06 : 0.1 },
        ]}
      />
      <View
        style={[
          styles.blob,
          styles.blobTwo,
          { backgroundColor: C.blobSecondary, opacity: theme === "bright" ? 0.05 : 0.07 },
        ]}
      />

      <View
        style={[
          styles.safeArea,
          { paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 10 : 50 },
        ]}
      >
        {/* ── Header ── */}
        <View
          style={[
            styles.headerCard,
            { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
          ]}
        >
          <TouchableOpacity
            onPress={openSidebar}
            activeOpacity={0.75}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.iconBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
          >
            <Feather name="menu" size={19} color={C.textPrimary} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Profile</Text>

          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.75}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.iconBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
          >
            <Feather name="chevron-left" size={19} color={C.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* ── Content ── */}
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.avatarWrap}>
            <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
              <LinearGradient
                colors={C.accentGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.avatar, { shadowColor: C.shadowDark }]}
              >
                <Text style={styles.avatarText}>{initials}</Text>
              </LinearGradient>
            </Animated.View>
            {!!fullName && <Text style={[styles.avatarName, { color: C.textPrimary }]}>{fullName}</Text>}
            {!!username && <Text style={[styles.avatarHandle, { color: C.textSecondary }]}>@{username}</Text>}
          </View>

          {/* Claymorphism info card */}
          <View
            style={[
              styles.card,
              { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
            ]}
          >
            <ProfileField icon="user" label="Full Name" value={fullName || "Not set"} color={C} />
            <View style={[styles.divider, { backgroundColor: C.border }]} />

            <ProfileField icon="at-sign" label="Username" value={username ? `@${username}` : "Not set"} color={C} />
            <View style={[styles.divider, { backgroundColor: C.border }]} />

            <ProfileField icon="mail" label="Email" value={email || "Not set"} color={C} />
          </View>

          <TouchableOpacity
            style={styles.signOutOuter}
            activeOpacity={0.85}
            onPress={handleSignOutPress}
            disabled={signingOut}
          >
            <View
              style={[
                styles.signOutBtn,
                { backgroundColor: C.danger + "16", borderColor: C.danger + "40", opacity: signingOut ? 0.7 : 1 },
              ]}
            >
              {signingOut ? (
                <ActivityIndicator color={C.danger} />
              ) : (
                <>
                  <Feather name="log-out" size={16} color={C.danger} />
                  <Text style={[styles.signOutBtnText, { color: C.danger }]}>Sign Out</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ── Sidebar overlay ── */}
      {sidebarMounted && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={closeSidebar}>
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
            />
          </TouchableWithoutFeedback>

          <Animated.View
            style={[
              styles.sidebarPanel,
              {
                width: sidebarWidth,
                backgroundColor: C.surface,
                borderRightColor: C.border,
                transform: [{ translateX }],
                zIndex: 1000,
              },
            ]}
          >
            <Sidebar
              isOpen={sidebarOpen}
              onClose={closeSidebar}
              currentTheme={theme}
              onThemeChange={setTheme}
            />
          </Animated.View>
        </View>
      )}
    </LinearGradient>
  );
}

// ─── Reusable field row ───────────────────────────────────────────────────────
function ProfileField({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  color: ThemeColorScheme;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={[styles.fieldIconWrap, { backgroundColor: color.accent + "1E", borderColor: color.accent + "33" }]}>
        <Feather name={icon} size={16} color={color.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.fieldLabel, { color: color.textSecondary }]}>{label}</Text>
        <Text style={[styles.fieldValue, { color: color.textPrimary }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  safeArea: { flex: 1 },

  loadingClay: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },

  blob: {
    position: "absolute",
    borderRadius: 999,
  },
  blobOne: {
    width: 240,
    height: 240,
    top: -60,
    left: -70,
  },
  blobTwo: {
    width: 200,
    height: 200,
    bottom: -50,
    right: -70,
  },

  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "800", letterSpacing: -0.3 },

  content: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },

  avatarWrap: { alignItems: "center", marginBottom: 24 },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    elevation: 8,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
  },
  avatarText: { fontSize: 30, fontWeight: "800", color: "#1A120B" },
  avatarName: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  avatarHandle: { fontSize: 12, marginTop: 2 },

  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 24,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 6,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 15,
  },
  fieldIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: { fontSize: 10, marginBottom: 3, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  fieldValue: { fontSize: 14, fontWeight: "700" },
  divider: { height: 1 },

  signOutOuter: {
    borderRadius: 18,
    overflow: "hidden",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 18,
    borderWidth: 1,
  },
  signOutBtnText: { fontSize: 14, fontWeight: "800" },

  backdrop: { backgroundColor: "rgba(0,0,0,0.55)" },
  sidebarPanel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: 1,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
});