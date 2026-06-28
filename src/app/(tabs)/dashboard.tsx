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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

import AddTask from "../(task)/addTask";
import ProgressTask from "../(task)/progressTask";
import EditTask from "../(task)/editTask";
import Sidebar from "../(tabs)/sidebar";

// ─── Theme Tokens ─────────────────────────────────────────────────────────────
const DARK = {
  bg: "#0F172A",
  surface: "#1E293B",
  accent: "#6366F1",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  border: "#334155",
};

const BRIGHT = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  accent: "#6366F1",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  border: "#E2E8F0",
};

type Theme = "bright" | "dark";
type Tab = "tasks" | "add" | "progress";

const TABS: {
  id: Tab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "tasks",    label: "Tasks",    icon: "list-outline",        activeIcon: "list" },
  { id: "add",      label: "Add",      icon: "add-circle-outline",  activeIcon: "add-circle" },
  { id: "progress", label: "Progress", icon: "stats-chart-outline", activeIcon: "stats-chart" },
];

const getSidebarWidth = () => Math.min(300, Dimensions.get("window").width * 0.8);

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [theme, setTheme]               = useState<Theme>("dark");
  const [themeLoaded, setThemeLoaded]   = useState(false);
  const [activeTab, setActiveTab]       = useState<Tab>("tasks");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getSidebarWidth());
  const [fullName, setFullName]         = useState("");
  const [username, setUsername]         = useState("");

  // ── Sidebar slide + backdrop animation values ─────────────────────────────
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

  // ── Load data from storage on mount ───────────────────────────────────────
  useEffect(() => {
    AsyncStorage.multiGet(["theme", "fullName", "username"]).then((pairs) => {
      const map = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? ""]));
      if (map.theme === "bright" || map.theme === "dark") setTheme(map.theme as Theme);
      setFullName(map.fullName);
      setUsername(map.username);
      setThemeLoaded(true);
    });
  }, []);

  // ── Drive the slide animation purely from sidebarOpen ─────────────────────
  useEffect(() => {
    if (sidebarOpen) {
      setSidebarMounted(true);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -sidebarWidth,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        // IMPORTANT: only unmount if this close animation actually completed.
        // If it was interrupted by a fast reopen, `finished` is false and we
        // must NOT unmount the panel that's now animating back open.
        if (finished) setSidebarMounted(false);
      });
    }
  }, [sidebarOpen, sidebarWidth]);

  // ── Toggle & persist theme ────────────────────────────────────────────────
  const toggleTheme = useCallback(async (value: boolean) => {
    const next: Theme = value ? "dark" : "bright";
    setTheme(next);
    await AsyncStorage.setItem("theme", next);
  }, []);

  const handleTaskChanged = useCallback(() => setRefreshTrigger((n) => n + 1), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const C = theme === "bright" ? BRIGHT : DARK;

  if (!themeLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: C.bg, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 50 }]}>
      <StatusBar
        barStyle={theme === "bright" ? "dark-content" : "light-content"}
        backgroundColor={C.bg}
      />

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          onPress={openSidebar}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu-outline" size={24} color={C.textPrimary} />
        </TouchableOpacity>

        <View style={{ alignItems: "center" }}>
          <Text style={[styles.appName, { color: C.textPrimary }]}>Life OS</Text>
          <Text style={[styles.date, { color: C.textSecondary }]}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => toggleTheme(theme === "bright")}
          activeOpacity={0.75}
          style={[styles.themeBtn, { backgroundColor: C.surface, borderColor: C.border }]}
        >
          <Ionicons
            name={theme === "dark" ? "sunny-outline" : "moon-outline"}
            size={18}
            color={C.accent}
          />
        </TouchableOpacity>
      </View>

      {/* ── Content ── */}
      <View style={styles.content}>
        {activeTab === "tasks"    && <EditTask theme={theme} onTaskChanged={handleTaskChanged} />}
        {activeTab === "add"      && <AddTask     theme={theme} onTaskAdded={handleTaskChanged} />}
        {activeTab === "progress" && <ProgressTask key={refreshTrigger} theme={theme} />}
      </View>

      {/* ── Tab Bar ── */}
      <View style={[styles.tabBar, { backgroundColor: C.surface, borderTopColor: C.border }]}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.75}
            >
              <View style={[styles.tabIconWrap, active && { backgroundColor: C.accent + "20" }]}>
                <Ionicons
                  name={active ? tab.activeIcon : tab.icon}
                  size={20}
                  color={active ? C.accent : C.textSecondary}
                />
              </View>
              <Text style={[styles.tabLabel, { color: active ? C.accent : C.textSecondary, fontWeight: active ? "700" : "500" }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Sidebar overlay (mounted only while open or animating closed) ── */}
      {sidebarMounted && (
        <View
          style={[StyleSheet.absoluteFill, { zIndex: 999 }]}
          pointerEvents="box-none"
        >
          {/* Backdrop — tapping it closes the sidebar, never the content behind it */}
          <TouchableWithoutFeedback onPress={closeSidebar}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.backdrop,
                { opacity: backdropOpacity },
              ]}
            />
          </TouchableWithoutFeedback>

          {/* Sliding panel — always anchored to the left edge, never full-screen */}
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
  appName: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3, textAlign: "center" },
  date:    { fontSize: 11, marginTop: 2, textAlign: "center" },

  themeBtn: {
    width: 36, height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  content: { flex: 1 },

  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingBottom: Platform.OS === "ios" ? 24 : 8,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tabItem:     { flex: 1, alignItems: "center", gap: 3 },
  tabIconWrap: { width: 40, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tabLabel:    { fontSize: 10, letterSpacing: 0.2 },

  backdrop: {
    backgroundColor: "rgba(0,0,0,0.5)",
  },
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