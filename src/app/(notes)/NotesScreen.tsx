// app/(notes)/NotesScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

import AddAndView from "./Addandview";
import ViewAndEdit from "./ViewandEdit";
import Sidebar from "../(tabs)/sidebar";

const AddAndViewTyped = AddAndView as React.ComponentType<{
  theme: Theme;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
}>;

const ViewAndEditTyped = ViewAndEdit as React.ComponentType<{
  theme: Theme;
  selectedDate: string;
  refreshKey: number;
  onRefresh: () => void;
}>;

// ─── Theme Tokens (same palette as Dashboard — claymorphism) ──────────────
// Keeping these in sync with app/(dashboard)/index.tsx so the whole app
// feels like one product. If you already have a shared theme file
// (e.g. constants/theme.ts), delete this block and import from there
// instead of duplicating it.
const DARK = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  accentSoft: "#3A2617",
  success: "#3DD68C",
  warning: "#FFC24B",
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
  accentSoft: "#FFE4CE",
  success: "#22B573",
  warning: "#F0A93B",
  danger: "#EF5A4C",
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  shadowDark: "#B9B9C0",
};


type Theme = "bright" | "dark";
type NotesTab = "add" | "view";

const getSidebarWidth = () => Math.min(300, Dimensions.get("window").width * 0.8);

// ─── Helpers ────────────────────────────────────────────────────────────────
// Local-time "YYYY-MM-DD" (avoids the UTC midnight-rollover bug that
// new Date().toISOString() has).
function getTodayLocalISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHeaderDate(iso: string): string {
  // iso is "YYYY-MM-DD" -> build a local Date safely (no TZ shift)
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ─── NotesScreen ────────────────────────────────────────────────────────────
export default function NotesScreen(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>("dark");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalISO());
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<NotesTab>("add");

  // ── Sidebar state ──────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getSidebarWidth());

  // ── Sidebar slide + backdrop animation values ─────────────────────────
  const translateX = useRef(new Animated.Value(-getSidebarWidth())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // ── Header entrance animation (same feel as Dashboard) ────────────────
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-8)).current;

  // ── Keep sidebar width in sync with orientation / window changes ──────
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", () => {
      const w = getSidebarWidth();
      setSidebarWidth(w);
      if (!sidebarOpen) translateX.setValue(-w);
    });
    return () => subscription.remove();
  }, [sidebarOpen]);

  // ── Load persisted theme on mount ──────────────────────────────────────
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

  // ── Drive the slide animation purely from sidebarOpen ─────────────────
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

  // ── Toggle & persist theme (same AsyncStorage key as Dashboard,
  //    so switching it here stays in sync app-wide) ──────────────────────
  const toggleTheme = useCallback(async () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "bright" : "dark";
      AsyncStorage.setItem("theme", next).catch((error) => {
        console.error("Error saving theme:", error);
      });
      return next;
    });
  }, []);

  // Sidebar hands back either a specific theme value or a state updater,
  // so this wraps it to guarantee persistence — fixes the Dashboard-style
  // bug where onThemeChange={setTheme} would update state but skip storage.
  const handleThemeChange = useCallback(
    (value: React.SetStateAction<Theme>) => {
      const next: Theme = typeof value === "function" ? value(theme) : value;
      setTheme(next);
      AsyncStorage.setItem("theme", next).catch((error) => {
        console.error("Error saving theme:", error);
      });
    },
    [theme]
  );

  const refreshNotes = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // After adding/editing a note, jump the user over to the View tab so
  // they immediately see the result of what they just saved.
  const refreshNotesAndSwitchToView = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
    setActiveTab("view");
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
        <View style={[styles.loadingClay, { backgroundColor: DARK.surface, shadowColor: DARK.shadowDark }]}>
          <ActivityIndicator size="large" color={DARK.accent} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.root,
        { backgroundColor: C.bg, paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0 },
      ]}
    >
      <StatusBar
        barStyle={theme === "bright" ? "dark-content" : "light-content"}
        backgroundColor={C.bg}
      />

      {/* ── Header (same centered layout as Dashboard: fixed-width
            elements on both sides so the middle stays truly centered) ── */}
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
          <Text style={[styles.eyebrow, { color: C.accent }]}>Notes</Text>
          <Text style={[styles.appName, { color: C.textPrimary }]}>My Notes</Text>
          <Text style={[styles.date, { color: C.textSecondary }]}>
            {formatHeaderDate(selectedDate)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={toggleTheme}
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

      {/* ── Tab Bar: switches between "Add / Edit" and "View" ── */}
      <View style={[styles.tabBar, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab("add")}
          style={[
            styles.tabBtn,
            activeTab === "add" && { backgroundColor: C.accentSoft },
          ]}
        >
          <Ionicons
            name="create-outline"
            size={16}
            color={activeTab === "add" ? C.accent : C.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === "add" ? C.accent : C.textSecondary },
            ]}
          >
            Add / Edit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab("view")}
          style={[
            styles.tabBtn,
            activeTab === "view" && { backgroundColor: C.accentSoft },
          ]}
        >
          <Ionicons
            name="list-outline"
            size={16}
            color={activeTab === "view" ? C.accent : C.textSecondary}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: activeTab === "view" ? C.accent : C.textSecondary },
            ]}
          >
            View Notes
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Content: only the active tab is rendered ── */}
      <View style={styles.content}>
        {activeTab === "add" ? (
          <AddAndViewTyped
            theme={theme}
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            onRefresh={refreshNotesAndSwitchToView}
          />
        ) : (
          <ViewAndEditTyped
            theme={theme}
            selectedDate={selectedDate}
            refreshKey={refreshKey}
            onRefresh={refreshNotes}
          />
        )}
      </View>

      {/* ── Sidebar overlay ── */}
      {sidebarMounted && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Backdrop */}
          <TouchableWithoutFeedback onPress={closeSidebar}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.backdrop,
                { opacity: backdropOpacity },
              ]}
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
              onThemeChange={handleThemeChange}
            />
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles (mirrors Dashboard's headerCard/iconBtn/themeBtn/content) ─────
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
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 6,
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

  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    padding: 4,
    borderRadius: 18,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },

  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
  },

  tabLabel: {
    fontSize: 13,
    fontWeight: "700",
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
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