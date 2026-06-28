// Settings/index.tsx (or wherever your Settings screen lives)
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TouchableWithoutFeedback,
  Platform, StatusBar, ActivityIndicator, Animated, Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Sidebar from "../(tabs)/sidebar";

import ChangeUsernameModal from "./Setting/change_username";
import ChangeFullNameModal from "./Setting/change_fullname";
import ChangeEmailModal from "./Setting/change_email";
import ChangePasswordModal from "./Setting/change_password";
import DeleteAccountModal from "./Setting/Delete_account";

const DARK = {
  bg: "#0F172A", surface: "#1E293B", accent: "#6366F1", danger: "#EF4444",
  textPrimary: "#F8FAFC", textSecondary: "#94A3B8", border: "#334155",
};
const BRIGHT = {
  bg: "#F8FAFC", surface: "#FFFFFF", accent: "#6366F1", danger: "#DC2626",
  textPrimary: "#0F172A", textSecondary: "#64748B", border: "#E2E8F0",
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

  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth]     = useState(getSidebarWidth());
  const translateX     = useRef(new Animated.Value(-getSidebarWidth())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", () => {
      const w = getSidebarWidth();
      setSidebarWidth(w);
      if (!sidebarOpen) translateX.setValue(-w);
    });
    return () => sub.remove();
  }, [sidebarOpen]);

  const loadData = useCallback(() => {
    AsyncStorage.multiGet(["theme", "fullName", "username", "email"]).then((pairs) => {
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? ""]));
      if (map.theme === "bright" || map.theme === "dark") setTheme(map.theme as Theme);
      setFullName(map.fullName);
      setUsername(map.username);
      setEmail(map.email);
      setThemeLoaded(true);
      setDataLoaded(true);
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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
      ]).start(({ finished }) => { if (finished) setSidebarMounted(false); });
    }
  }, [sidebarOpen, sidebarWidth]);

  const openSidebar  = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const handleModalClose = useCallback(() => {
    setActiveModal(null);
    loadData(); // refresh displayed values after any edit
  }, [loadData]);

  const C = theme === "bright" ? BRIGHT : DARK;

  if (!themeLoaded || !dataLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: C.bg, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 50 }]}>
      <StatusBar barStyle={theme === "bright" ? "dark-content" : "light-content"} backgroundColor={C.bg} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={openSidebar} activeOpacity={0.75} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="menu-outline" size={24} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Account Settings</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.75} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back-outline" size={22} color={C.textPrimary} />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Your details */}
        <Text style={[styles.sectionLabel, { color: C.textSecondary }]}>YOUR DETAILS</Text>
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <InfoRow icon="person-outline" label="Full Name" value={fullName || "Not set"} color={C} />
          <Divider color={C.border} />
          <InfoRow icon="at-outline" label="Username" value={username ? `@${username}` : "Not set"} color={C} />
          <Divider color={C.border} />
          <InfoRow icon="mail-outline" label="Email" value={email || "Not set"} color={C} />
          <Divider color={C.border} />
          <InfoRow icon="lock-closed-outline" label="Password" value="••••••••" color={C} />
        </View>

        {/* Edit account */}
        <Text style={[styles.sectionLabel, { color: C.textSecondary, marginTop: 28 }]}>EDIT ACCOUNT</Text>
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <SettingsRow icon="at-outline"          label="Change Username"  color={C} onPress={() => setActiveModal("username")}  />
          <Divider color={C.border} />
          <SettingsRow icon="person-outline"      label="Change Full Name" color={C} onPress={() => setActiveModal("fullname")}  />
          <Divider color={C.border} />
          <SettingsRow icon="mail-outline"        label="Change Email"     color={C} onPress={() => setActiveModal("email")}     />
          <Divider color={C.border} />
          <SettingsRow icon="lock-closed-outline" label="Change Password"  color={C} onPress={() => setActiveModal("password")} />
        </View>

        {/* Danger zone */}
        <Text style={[styles.sectionLabel, { color: C.danger, marginTop: 28 }]}>DANGER ZONE</Text>
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.danger + "40" }]}>
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
          <Animated.View style={[styles.sidebarPanel, { width: sidebarWidth, backgroundColor: C.surface, borderRightColor: C.border, transform: [{ translateX }], zIndex: 1000 }]}>
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
      <View style={[styles.iconWrap, { backgroundColor: color.accent + "20" }]}>
        <Ionicons name={icon} size={18} color={color.accent} />
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
      <View style={[styles.iconWrap, { backgroundColor: tint + "20" }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={[styles.settingsLabel, { color: danger ? color.danger : color.textPrimary, flex: 1 }]}>{label}</Text>
      <Ionicons name="chevron-forward-outline" size={18} color={color.textSecondary} />
    </TouchableOpacity>
  );
}

function Divider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24 },
  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginBottom: 10 },
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  infoLabel: { fontSize: 12, marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: "600" },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15 },
  settingsLabel: { fontSize: 15, fontWeight: "600" },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  divider: { height: 1 },
  backdrop: { backgroundColor: "rgba(0,0,0,0.5)" },
  sidebarPanel: { position: "absolute", top: 0, bottom: 0, left: 0, borderRightWidth: 1, shadowColor: "#000", shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 16 },
});