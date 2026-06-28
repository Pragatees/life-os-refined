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
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import Sidebar from "../(tabs)/sidebar";

// ─── Theme Tokens (kept identical to Dashboard for visual consistency) ───────
const DARK = {
  bg: "#0F172A",
  surface: "#1E293B",
  accent: "#6366F1",
  danger: "#EF4444",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  border: "#334155",
};

const BRIGHT = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  accent: "#6366F1",
  danger: "#DC2626",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  border: "#E2E8F0",
};

type Theme = "bright" | "dark";

const getSidebarWidth = () => Math.min(300, Dimensions.get("window").width * 0.8);

// ─── Profile Page ─────────────────────────────────────────────────────────────
export default function Profile() {
  const [theme, setTheme]             = useState<Theme>("dark");
  const [themeLoaded, setThemeLoaded] = useState(false);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth]     = useState(getSidebarWidth());

  const translateX = useRef(new Animated.Value(-getSidebarWidth())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

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

  // ── Drive the slide animation purely from sidebarOpen ──────────────────────
  useEffect(() => {
    if (sidebarOpen) {
      setSidebarMounted(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, { toValue: -sidebarWidth, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(({ finished }) => {
        // Only unmount if this close animation actually completed — prevents
        // the panel from vanishing mid-open if a reopen interrupts a close.
        if (finished) setSidebarMounted(false);
      });
    }
  }, [sidebarOpen, sidebarWidth]);

  const openSidebar  = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // ── Sign out: clear session data and send the user back to login ──────────
  const performSignOut = useCallback(async () => {
    try {
      setSigningOut(true);
      // Clear only session/auth-related keys — adjust this list to match
      // whatever keys your auth flow actually writes.
      await AsyncStorage.multiRemove([
        "authToken",
        "fullName",
        "username",
        "email",
      ]);
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
      <View style={{ flex: 1, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#6366F1" />
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
    <View
      style={[
        styles.root,
        { backgroundColor: C.bg, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 50 },
      ]}
    >
      <StatusBar barStyle={theme === "bright" ? "dark-content" : "light-content"} backgroundColor={C.bg} />

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          onPress={openSidebar}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu-outline" size={24} color={C.textPrimary} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Profile</Text>

        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back-outline" size={22} color={C.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ── Content ── */}
      <View style={styles.content}>
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: C.accent }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <ProfileField
            icon="person-outline"
            label="Full Name"
            value={fullName || "Not set"}
            color={C}
          />
          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <ProfileField
            icon="at-outline"
            label="Username"
            value={username ? `@${username}` : "Not set"}
            color={C}
          />
          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <ProfileField
            icon="mail-outline"
            label="Email"
            value={email || "Not set"}
            color={C}
          />
        </View>

        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: C.danger, opacity: signingOut ? 0.7 : 1 }]}
          activeOpacity={0.8}
          onPress={handleSignOutPress}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={18} color="#fff" />
              <Text style={styles.signOutBtnText}>Sign Out</Text>
            </>
          )}
        </TouchableOpacity>
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
    </View>
  );
}

// ─── Reusable field row ───────────────────────────────────────────────────────
function ProfileField({
  icon,
  label,
  value,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: typeof DARK;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={[styles.fieldIconWrap, { backgroundColor: color.accent + "20" }]}>
        <Ionicons name={icon} size={18} color={color.accent} />
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
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },

  content: { flex: 1, paddingHorizontal: 20, paddingTop: 28 },

  avatarWrap: { alignItems: "center", marginBottom: 24 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 28, fontWeight: "800", color: "#fff" },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
  },
  fieldIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: { fontSize: 12, marginBottom: 2 },
  fieldValue: { fontSize: 15, fontWeight: "600" },
  divider: { height: 1 },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  signOutBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  backdrop: { backgroundColor: "rgba(0,0,0,0.5)" },
  sidebarPanel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 16,
  },
});