import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  SafeAreaView,
  StatusBar,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import Addandedit from "./Addandedit";
import Viewandedit from "./Viewandedit";
import Sidebar from "../(tabs)/sidebar";

// ─── Theme Tokens (same palette as Dashboard — keep in sync) ──────────────
// NOTE: Ideally move this DARK/BRIGHT object into a shared file (e.g.
// `theme/tokens.ts`) and import it in both Dashboard and GoalScreen so the
// two never drift apart. Duplicated here so this file works standalone.
const DARK = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  accentSoft: "#3A2617",
  accentGradient: ["#FF8A3D", "#FFB25E"] as const,
  success: "#3DD68C",
  warning: "#FFC24B",
  danger: "#FF6B5B",
  textPrimary: "#F5F5F4",
  textSecondary: "#9B9B9F",
  border: "#28282C",
  shadowDark: "#000000",
  shadowLight: "#2C2C30",
};

const BRIGHT = {
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceAlt: "#EDEDEF",
  accent: "#FF7A2F",
  accentSoft: "#FFE4CE",
  accentGradient: ["#FF8A3D", "#FF6B1F"] as const,
  success: "#22B573",
  warning: "#F0A93B",
  danger: "#EF5A4C",
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  shadowDark: "#B9B9C0",
  shadowLight: "#FFFFFF",
};

type Theme = "bright" | "dark";
type GoalTab = "add" | "view";

const TABS: {
  id: GoalTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "add", label: "Add / Edit", icon: "create-outline", activeIcon: "create" },
  { id: "view", label: "Progress", icon: "list-outline", activeIcon: "list" },
];

const getSidebarWidth = () => Math.min(300, Dimensions.get("window").width * 0.8);

export default function GoalScreen() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [themeLoaded, setThemeLoaded] = useState(false);

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<GoalTab>("add");

  // ── Sidebar state ─────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getSidebarWidth());

  // ── Sidebar slide + backdrop animation values ─────────────────────────────
  const translateX = useRef(new Animated.Value(-getSidebarWidth())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // ── Header entrance animation ──────────────────────────────────────────────
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-8)).current;

  // ── Keep sidebar width in sync with orientation / window changes ──────────
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", () => {
      const w = getSidebarWidth();
      setSidebarWidth(w);
      if (!sidebarOpen) translateX.setValue(-w);
    });
    return () => subscription.remove();
  }, [sidebarOpen]);

  // ── Load persisted theme (same key Dashboard writes to) ──────────────────
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const stored = await AsyncStorage.getItem("theme");
        if (stored === "bright" || stored === "dark") {
          setTheme(stored);
        }
      } catch (error) {
        console.error("Error loading theme:", error);
      } finally {
        setThemeLoaded(true);
      }
    };
    loadTheme();
  }, []);

  useEffect(() => {
    if (themeLoaded) {
      Animated.parallel([
        Animated.timing(headerFade, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 380, useNativeDriver: true }),
      ]).start();
    }
  }, [themeLoaded, headerFade, headerSlide]);

  // ── Drive the slide animation purely from sidebarOpen ─────────────────────
  useEffect(() => {
    if (sidebarOpen) {
      setSidebarMounted(true);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 280,
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
        if (finished) setSidebarMounted(false);
      });
    }
  }, [sidebarOpen, sidebarWidth]);

  // ── Toggle & persist theme ────────────────────────────────────────────────
  const toggleTheme = useCallback(async (value: boolean) => {
    const next: Theme = value ? "dark" : "bright";
    setTheme(next);
    try {
      await AsyncStorage.setItem("theme", next);
    } catch (error) {
      console.error("Error saving theme:", error);
    }
  }, []);

  const refreshGoals = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleDateChange = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const C = theme === "bright" ? BRIGHT : DARK;

  if (!themeLoaded) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: DARK.bg }]}>
        <View
          style={[
            styles.loadingClay,
            { backgroundColor: DARK.surface, shadowColor: DARK.shadowDark },
          ]}
        >
          <ActivityIndicator size="large" color={DARK.accent} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.bg }]}>
      <StatusBar
        barStyle={theme === "bright" ? "dark-content" : "light-content"}
        backgroundColor={C.bg}
      />

      {/* ── Header (3-column: menu | title | theme) ── */}
      <Animated.View
        style={[
          styles.headerCard,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
            shadowColor: C.shadowDark,
            opacity: headerFade,
            transform: [{ translateY: headerSlide }],
          },
        ]}
      >
        <TouchableOpacity
          onPress={openSidebar}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.iconBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
        >
          <Ionicons name="menu-outline" size={20} color={C.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.eyebrow, { color: C.accent }]}>
            {activeTab === "add" ? "Set your target" : "Track your progress"}
          </Text>
          <Text style={[styles.appName, { color: C.textPrimary }]}>Goals</Text>
          <Text style={[styles.date, { color: C.textSecondary }]}>
            {new Date(selectedDate).toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => toggleTheme(theme === "bright")}
          activeOpacity={0.75}
          style={[styles.themeBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
        >
          <Ionicons
            name={theme === "dark" ? "sunny-outline" : "moon-outline"}
            size={17}
            color={C.accent}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Content ── */}
      <View style={styles.content}>
        {activeTab === "add" && (
          <Addandedit
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            onRefresh={refreshGoals}
            theme={theme}
          />
        )}
        {activeTab === "view" && (
          <Viewandedit
            selectedDate={selectedDate}
            refreshKey={refreshKey}
            onRefresh={refreshGoals}
            theme={theme}
          />
        )}
      </View>

      {/* ── Floating Bottom Tab Bar ── */}
      <View style={styles.tabBarWrap} pointerEvents="box-none">
        <View
          style={[
            styles.tabBar,
            { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
          ]}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={styles.tabItem}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.8}
              >
                {active ? (
                  <LinearGradient
                    colors={C.accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.tabIconWrapActive}
                  >
                    <Ionicons name={tab.activeIcon} size={18} color="#FFFFFF" />
                  </LinearGradient>
                ) : (
                  <View style={[styles.tabIconWrap, { backgroundColor: C.surfaceAlt }]}>
                    <Ionicons name={tab.icon} size={18} color={C.textSecondary} />
                  </View>
                )}
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      color: active ? C.accent : C.textSecondary,
                      fontWeight: active ? "700" : "500",
                    },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Sidebar overlay ── */}
      {sidebarMounted && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Backdrop */}
          <TouchableWithoutFeedback onPress={closeSidebar}>
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
            />
          </TouchableWithoutFeedback>

          {/* Sidebar Panel */}
          <Animated.View
            style={[
              styles.sidebarPanel,
              {
                width: sidebarWidth,
                backgroundColor: C.surface,
                borderRightColor: C.border,
                transform: [{ translateX }],
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
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

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
  marginTop: 48,
  marginBottom: 8,
  paddingHorizontal: 16,
  paddingVertical: 14,
  borderRadius: 24,
  borderWidth: 1,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.18,
  shadowRadius: 20,
  elevation: 16,
},

  headerCenter: {
    alignItems: "center",
    flex: 1,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 2,
  },

  appName: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
  },

  date: {
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
  },

  tabBarWrap: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 26 : 14,
    paddingTop: 6,
  },

  tabBar: {
    flexDirection: "row",
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 10,
  },

  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },

  tabIconWrap: {
    width: 42,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  tabIconWrapActive: {
    width: 42,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.2,
  },

  backdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },

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
    zIndex: 1000,
  },
});