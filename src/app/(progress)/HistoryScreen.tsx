// HistoryScreen.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import DayView from "../(progress)/DayView";
import WeekView from "../(progress)/WeekView";
import MonthView from "../(progress)/MonthView";
import Sidebar from "../(tabs)/sidebar";

import { useTaskHistory } from "../../hooks/useTaskHistory";

type TabType = "DAY" | "WEEK" | "MONTH";
type Theme = "dark" | "bright";

interface HistoryScreenProps {
  theme?: Theme;
  onThemeChange?: (theme: Theme) => void;
}

// ─── Theme Tokens (Claymorphism — matches Dashboard) ──────────────────────
type ThemeTokens = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  accentGradient: readonly [string, string];
  danger: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  shadowDark: string;
  shadowLight: string;
};

const DARK: ThemeTokens = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"] as const,
  danger: "#FF6B5B",
  textPrimary: "#F5F5F4",
  textSecondary: "#9B9B9F",
  border: "#28282C",
  shadowDark: "#000000",
  shadowLight: "#2C2C30",
};

const BRIGHT: ThemeTokens = {
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceAlt: "#EDEDEF",
  accent: "#FF7A2F",
  accentGradient: ["#FF8A3D", "#FF6B1F"] as const,
  danger: "#EF5A4C",
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  shadowDark: "#B9B9C0",
  shadowLight: "#FFFFFF",
};

const TABS: { id: TabType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "DAY", label: "Day", icon: "today-outline" },
  { id: "WEEK", label: "Week", icon: "calendar-outline" },
  { id: "MONTH", label: "Month", icon: "grid-outline" },
];

const getSidebarWidth = () => Math.min(300, Dimensions.get("window").width * 0.8);

export default function HistoryScreen({ theme = "dark", onThemeChange }: HistoryScreenProps) {
  // ── Local theme state (seeded from prop, optionally synced upward) ───────
  const [internalTheme, setInternalTheme] = useState<Theme>(theme);
  const [headerAnimationComplete, setHeaderAnimationComplete] = useState(false);

  // ── Header entrance animation ──────────────────────────────────────────────
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    setInternalTheme(theme);
  }, [theme]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start(() => setHeaderAnimationComplete(true));
  }, []);

  const handleThemeChange = useCallback(
    (next: React.SetStateAction<Theme>) => {
      setInternalTheme((prevTheme) => {
        const resolvedTheme = typeof next === "function" ? next(prevTheme) : next;
        onThemeChange?.(resolvedTheme);
        return resolvedTheme;
      });
    },
    [onThemeChange]
  );

  const C = internalTheme === "dark" ? DARK : BRIGHT;

  const [selectedTab, setSelectedTab] = useState<TabType>("DAY");
  const [selectedDate, setSelectedDate] = useState(new Date());

  // ── Sidebar state ─────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getSidebarWidth());

  const translateX = useRef(new Animated.Value(-getSidebarWidth())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", () => {
      const w = getSidebarWidth();
      setSidebarWidth(w);
      if (!sidebarOpen) translateX.setValue(-w);
    });
    return () => subscription.remove();
  }, [sidebarOpen]);

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

  const {
    loading,
    refreshing,
    error,
    fetchHistory,
    refresh,
    groupedTasks,
    calendarData,
    getDailyTasks,
    getDailyProgress,
    getWeeklyProgress,
    getMonthlyProgress,
  } = useTaskHistory();

  const formatDate = (date: Date) => date.toISOString().split("T")[0];

  const getMonthRange = useCallback((date: Date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start: formatDate(firstDay), end: formatDate(lastDay) };
  }, []);

  const loadCurrentMonth = useCallback(async () => {
    const range = getMonthRange(selectedDate);
    await fetchHistory(range.start, range.end);
  }, [selectedDate, fetchHistory, getMonthRange]);

  useEffect(() => {
    loadCurrentMonth();
  }, [loadCurrentMonth]);

  const previousMonth = () =>
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));

  const nextMonth = () =>
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));

  const selectedDateString = useMemo(() => formatDate(selectedDate), [selectedDate]);

  const currentMonth = useMemo(
    () => selectedDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    [selectedDate]
  );

  const onRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const changeTab = (tab: TabType) => setSelectedTab(tab);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: C.bg,
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 50,
        },
      ]}
    >
      <StatusBar
        barStyle={internalTheme === "bright" ? "dark-content" : "light-content"}
        backgroundColor={C.bg}
      />

      {/* ── Header Card (icon / centered text / action group — matches Dashboard) ── */}
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
          <Text style={[styles.eyebrow, { color: C.accent }]}>OVERVIEW</Text>
          <Text style={[styles.title, { color: C.textPrimary }]}>Progress History</Text>
          <Text style={[styles.subtitle, { color: C.textSecondary }]}>{currentMonth}</Text>
        </View>

        <View style={styles.monthNav}>
          <TouchableOpacity
            onPress={previousMonth}
            activeOpacity={0.75}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            style={[styles.navBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
          >
            <Ionicons name="chevron-back" size={16} color={C.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={nextMonth}
            activeOpacity={0.75}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            style={[styles.navBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
          >
            <Ionicons name="chevron-forward" size={16} color={C.textPrimary} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── Pill Tabs ── */}
      <Animated.View
        style={[
          styles.tabBar,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
            shadowColor: C.shadowDark,
            opacity: headerFade,
            transform: [{ translateY: headerSlide }],
          },
        ]}
      >
        {TABS.map((tab) => {
          const active = selectedTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => changeTab(tab.id)}
              activeOpacity={0.8}
              style={styles.tabItem}
            >
              {active ? (
                <LinearGradient
                  colors={C.accentGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.tabPillActive}
                >
                  <Ionicons name={tab.icon} size={15} color="#FFFFFF" />
                  <Text style={styles.tabLabelActive}>{tab.label}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.tabPill, { backgroundColor: C.surfaceAlt }]}>
                  <Ionicons name={tab.icon} size={15} color={C.textSecondary} />
                  <Text style={[styles.tabLabel, { color: C.textSecondary }]}>{tab.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </Animated.View>

      {/* ── Loading ── */}
      {loading && (
        <View style={styles.center}>
          <View
            style={[
              styles.loadingClay,
              { backgroundColor: C.surface, shadowColor: C.shadowDark },
            ]}
          >
            <ActivityIndicator size="large" color={C.accent} />
          </View>
        </View>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <View style={styles.center}>
          <View
            style={[
              styles.errorClay,
              {
                backgroundColor: C.surface,
                borderColor: C.danger,
                shadowColor: C.shadowDark,
              },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={22} color={C.danger} />
            <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
          </View>
        </View>
      )}

      {/* ── Content ── */}
      {!loading && !error && (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {selectedTab === "DAY" && (
            <DayView
              date={selectedDateString}
              tasks={getDailyTasks(selectedDateString)}
              progress={getDailyProgress(selectedDateString)}
              theme={internalTheme}
            />
          )}

          {selectedTab === "WEEK" && (
            <WeekView progress={getWeeklyProgress()} theme={internalTheme} />
          )}

          {selectedTab === "MONTH" && (
            <MonthView
              progress={getMonthlyProgress()}
              calendarData={calendarData}
              groupedTasks={groupedTasks}
              theme={internalTheme}
            />
          )}
        </ScrollView>
      )}

      {/* ── Sidebar overlay ── */}
      {sidebarMounted && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={closeSidebar}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.backdrop,
                { opacity: backdropOpacity },
              ]}
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
              },
            ]}
          >
            <Sidebar
              isOpen={sidebarOpen}
              onClose={closeSidebar}
              currentTheme={internalTheme}
              onThemeChange={handleThemeChange}
            />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
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

  title: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
  },

  subtitle: {
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

  monthNav: {
    flexDirection: "row",
    gap: 8,
  },

  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    borderRadius: 20,
    borderWidth: 1,
    padding: 8,
    gap: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 5,
  },

  tabItem: {
    flex: 1,
  },

  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
  },

  tabPillActive: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
  },

  tabLabel: {
    fontSize: 12,
    fontWeight: "600",
  },

  tabLabelActive: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  center: {
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

  errorClay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 4,
  },

  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
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