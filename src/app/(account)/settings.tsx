// Settings/index.tsx (or wherever your Settings screen lives)
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TouchableWithoutFeedback,
  Platform, StatusBar, ActivityIndicator, Animated, Dimensions, Switch, Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Sidebar from "../(tabs)/sidebar";

import ChangeUsernameModal from "./Setting/change_username";
import ChangeFullNameModal from "./Setting/change_fullname";
import ChangeEmailModal from "./Setting/change_email";
import ChangePasswordModal from "./Setting/change_password";
import DeleteAccountModal from "./Setting/Delete_account";

// ─── Theme Tokens (Claymorphism — same language as the rest of the app) ────
// Dark = near-black with warm amber/orange accent.
// Bright = white / soft grey, same warm accent for consistency.
// No blue, purple, violet, or pink anywhere in the palette.
const DARK = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  danger: "#FF6B5B",
  textPrimary: "#F5F5F4",
  textSecondary: "#9B9B9F",
  border: "#28282C",
  shadowDark: "#000000",
};
const BRIGHT = {
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceAlt: "#EDEDEF",
  accent: "#FF7A2F",
  danger: "#EF5A4C",
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  shadowDark: "#B9B9C0",
};

type Theme = "bright" | "dark";
type ModalType = "username" | "fullname" | "email" | "password" | "delete" | null;

const getSidebarWidth = () => Math.min(300, Dimensions.get("window").width * 0.8);

export default function Settings() {
  const [theme, setTheme]             = useState<Theme>("dark");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [fullName, setFullName]       = useState("");
  const [username, setUsername]       = useState("");
  const [email, setEmail]             = useState("");
  const [dataLoaded, setDataLoaded]   = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // ── Notification preference (app-level flag, separate from OS permission) ──
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notifBusy, setNotifBusy] = useState(false);

  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth]     = useState(getSidebarWidth());
  const translateX     = useRef(new Animated.Value(-getSidebarWidth())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", () => {
      const w = getSidebarWidth();
      setSidebarWidth(w);
      if (!sidebarOpen) translateX.setValue(-w);
    });
    return () => sub.remove();
  }, [sidebarOpen]);

  const loadData = useCallback(() => {
    AsyncStorage.multiGet([
      "theme",
      "fullName",
      "username",
      "email",
      "notificationsEnabled",
    ]).then((pairs) => {
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? ""]));
      if (map.theme === "bright" || map.theme === "dark") setTheme(map.theme as Theme);
      setFullName(map.fullName);
      setUsername(map.username);
      setEmail(map.email);
      // Default to enabled if the key has never been set.
      setNotificationsEnabled(map.notificationsEnabled !== "false");
      setThemeLoaded(true);
      setDataLoaded(true);
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (themeLoaded && dataLoaded) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 380, useNativeDriver: true }),
      ]).start();
    }
  }, [themeLoaded, dataLoaded, fadeAnim, slideAnim]);

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
      ]).start(({ finished }) => { if (finished) setSidebarMounted(false); });
    }
  }, [sidebarOpen, sidebarWidth]);

  const openSidebar  = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const handleModalClose = useCallback(() => {
    setActiveModal(null);
    loadData(); // refresh displayed values after any edit
  }, [loadData]);

  // ── Notification toggle handler ──────────────────────────────────────────
  // Turning OFF is always instant (pure app-level flag).
  // Turning ON checks the OS permission first:
  //   - already granted  -> flip on immediately
  //   - not yet asked    -> show native prompt
  //   - previously denied-> can't re-prompt natively, send user to OS Settings
  const handleNotificationToggle = useCallback(async (value: boolean) => {
    if (notifBusy) return;
    setNotifBusy(true);
    try {
      if (value) {
        const { status } = await Notifications.getPermissionsAsync();
        let granted = status === "granted";

        if (!granted && status !== "denied") {
          const { status: newStatus } = await Notifications.requestPermissionsAsync();
          granted = newStatus === "granted";
        }

        if (!granted) {
          // OS-level permission is blocked; only the Settings app can fix that.
          Linking.openSettings();
          setNotifBusy(false);
          return;
        }
      }

      setNotificationsEnabled(value);
      await AsyncStorage.setItem("notificationsEnabled", String(value));
    } catch (e) {
      console.error("[Settings] Failed to update notification preference:", e);
    } finally {
      setNotifBusy(false);
    }
  }, [notifBusy]);

  const C = theme === "bright" ? BRIGHT : DARK;

  if (!themeLoaded || !dataLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK.bg, alignItems: "center", justifyContent: "center" }}>
        <View style={[styles.loadingClay, { backgroundColor: DARK.surface, shadowColor: DARK.shadowDark }]}>
          <ActivityIndicator color={DARK.accent} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: C.bg, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 50 },
      ]}
    >
      <StatusBar barStyle={theme === "bright" ? "dark-content" : "light-content"} backgroundColor={C.bg} />

      {/* Header */}
      <Animated.View
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
          <Ionicons name="menu-outline" size={19} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Account Settings</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.iconBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
        >
          <Ionicons name="chevron-back-outline" size={19} color={C.textPrimary} />
        </TouchableOpacity>
      </Animated.View>

      <Animated.ScrollView
        style={[styles.scroll, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Your details */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconWrap, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
            <Ionicons name="id-card-outline" size={13} color={C.accent} />
          </View>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>YOUR DETAILS</Text>
        </View>
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark }]}>
          <InfoRow icon="person-outline" label="Full Name" value={fullName || "Not set"} color={C} />
          <Divider color={C.border} />
          <InfoRow icon="at-outline" label="Username" value={username ? `@${username}` : "Not set"} color={C} />
          <Divider color={C.border} />
          <InfoRow icon="mail-outline" label="Email" value={email || "Not set"} color={C} />
          <Divider color={C.border} />
          <InfoRow icon="lock-closed-outline" label="Password" value="••••••••" color={C} />
        </View>

        {/* Preferences */}
        <View style={[styles.sectionHeader, styles.sectionHeaderSpaced]}>
          <View style={[styles.sectionIconWrap, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
            <Ionicons name="notifications-outline" size={13} color={C.accent} />
          </View>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>PREFERENCES</Text>
        </View>
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark }]}>
          <View style={styles.settingsRow}>
            <View style={[styles.iconWrap, { backgroundColor: C.accent + "1E", borderColor: C.accent + "33" }]}>
              <Ionicons name="notifications-outline" size={17} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingsLabel, { color: C.textPrimary }]}>Notifications</Text>
              <Text style={[styles.infoLabel, { color: C.textSecondary, textTransform: "none", marginTop: 2, marginBottom: 0 }]}>
                {notificationsEnabled ? "Enabled" : "Turned off"}
              </Text>
            </View>
            {notifBusy ? (
              <ActivityIndicator color={C.accent} size="small" />
            ) : (
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationToggle}
                trackColor={{ false: C.surfaceAlt, true: C.accent + "80" }}
                thumbColor={notificationsEnabled ? C.accent : C.textSecondary}
              />
            )}
          </View>
        </View>

        {/* Edit account */}
        <View style={[styles.sectionHeader, styles.sectionHeaderSpaced]}>
          <View style={[styles.sectionIconWrap, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
            <Ionicons name="create-outline" size={13} color={C.accent} />
          </View>
          <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>EDIT ACCOUNT</Text>
        </View>
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark }]}>
          <SettingsRow icon="at-outline"          label="Change Username"  color={C} onPress={() => setActiveModal("username")}  />
          <Divider color={C.border} />
          <SettingsRow icon="person-outline"      label="Change Full Name" color={C} onPress={() => setActiveModal("fullname")}  />
          <Divider color={C.border} />
          <SettingsRow icon="mail-outline"        label="Change Email"     color={C} onPress={() => setActiveModal("email")}     />
          <Divider color={C.border} />
          <SettingsRow icon="lock-closed-outline" label="Change Password"  color={C} onPress={() => setActiveModal("password")} />
        </View>

        {/* Danger zone */}
        <View style={[styles.sectionHeader, styles.sectionHeaderSpaced]}>
          <View style={[styles.sectionIconWrap, { backgroundColor: C.danger + "18", borderColor: C.danger + "35" }]}>
            <Ionicons name="warning-outline" size={13} color={C.danger} />
          </View>
          <Text style={[styles.sectionLabel, { color: C.danger }]}>DANGER ZONE</Text>
        </View>
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.danger + "35", shadowColor: C.shadowDark }]}>
          <SettingsRow icon="trash-outline" label="Delete Account" color={C} danger onPress={() => setActiveModal("delete")} />
        </View>

        <View style={{ height: 40 }} />
      </Animated.ScrollView>

      {/* ── All modals ── */}
      <ChangeUsernameModal  visible={activeModal === "username"}  onClose={handleModalClose} theme={theme} />
      <ChangeFullNameModal  visible={activeModal === "fullname"}  onClose={handleModalClose} theme={theme} />
      <ChangeEmailModal     visible={activeModal === "email"}     onClose={handleModalClose} theme={theme} />
      <ChangePasswordModal  visible={activeModal === "password"}  onClose={handleModalClose} theme={theme} />
      <DeleteAccountModal   visible={activeModal === "delete"}    onClose={handleModalClose} theme={theme} />

      {/* Sidebar */}
      {sidebarMounted && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={closeSidebar}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
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
            <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} currentTheme={theme} onThemeChange={setTheme} />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

function InfoRow({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: typeof DARK }) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.iconWrap, { backgroundColor: color.accent + "1E", borderColor: color.accent + "33" }]}>
        <Ionicons name={icon} size={17} color={color.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: color.textSecondary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: color.textPrimary }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function SettingsRow({ icon, label, color, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: typeof DARK; onPress: () => void; danger?: boolean }) {
  const tint = danger ? color.danger : color.accent;
  return (
    <TouchableOpacity style={styles.settingsRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconWrap, { backgroundColor: tint + "1E", borderColor: tint + "33" }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={[styles.settingsLabel, { color: danger ? color.danger : color.textPrimary, flex: 1 }]}>{label}</Text>
      <View style={[styles.chevronWrap, { backgroundColor: color.surfaceAlt }]}>
        <Ionicons name="chevron-forward-outline" size={14} color={color.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },

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
  headerTitle: { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 22 },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionHeaderSpaced: { marginTop: 26 },
  sectionIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },

  card: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 5,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  infoLabel: { fontSize: 10, marginBottom: 3, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  infoValue: { fontSize: 14, fontWeight: "700" },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15 },
  settingsLabel: { fontSize: 14, fontWeight: "600" },
  iconWrap: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chevronWrap: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  divider: { height: 1 },
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