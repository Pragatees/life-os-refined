// app/(task)/AIReviewScreen.tsx
//
// Parent screen. Owns the theme + active tab state and renders the
// day / week / month child screens. Also exports the shared theme
// tokens, types, prompt builder, and Gemini client so the child
// screens (day_review.tsx, week_review.tsx, month_review.tsx) can
// import them and stay perfectly in sync with the parent's theme.
//
// Sidebar + header now mirror the pattern used in app/(dashboard)/index.tsx:
// a menu button opens an animated slide-in Sidebar panel with a
// tap-to-dismiss backdrop, and the header carries the same
// menu / title / theme-toggle layout.
//
// Adjust these import paths to match your actual project structure.
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleGenAI } from "@google/genai";

import { ProgressSummary } from "../../store/progress";
import { getTodayDateString } from "../../services/notificationService";
import { Task } from "../../types/task";

import Sidebar from "../(tabs)/sidebar";

import DayReview from "./day_review";
import WeekReview from "./week_review";
import MonthReview from "./month_review";

// ─────────────────────────────────────────────────────────────────────────
// ⚠️ Do not ship a raw API key in client code. Move this call to your
// backend (life-os-backend) and have the app call your own endpoint with
// the Bearer token you already use elsewhere. Left here as a placeholder
// only so the component compiles standalone.
// ─────────────────────────────────────────────────────────────────────────
const GEMINI_API_KEY = "";
export const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const getToken = (): Promise<string | null> =>
  AsyncStorage.getItem("token");

// ── AsyncStorage keys used to persist generated reviews ─────────────────
export const STORAGE_KEYS = {
  day: "@ai_review:day",
  week: "@ai_review:week",
  month: "@ai_review:month",
} as const;

export interface StoredReview {
  text: string;
  generatedAt: string;
}

// ── Theme tokens (mirrors app/(dashboard)/index.tsx) ───────────────────────
export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  accentSoft: string;
  accentGradient: readonly [string, string];
  success: string;
  warning: string;
  danger: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  shadowDark: string;
}

export const DARK: ThemeColors = {
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
};

export const BRIGHT: ThemeColors = {
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
};

export type Theme = "bright" | "dark";
export type ReviewType = "day" | "week" | "month";

export const colorsForTheme = (theme: Theme): ThemeColors =>
  theme === "bright" ? BRIGHT : DARK;

// ── Shared task helpers ─────────────────────────────────────────────────
export const taskLabel = (t: Task): string =>
  (t as any).title ?? (t as any).name ?? "Untitled task";

export const taskPriority = (t: Task): string =>
  ((t as any).priority ?? "NORMAL").toString().toUpperCase();

// Group tasks by their taskDate -> { total, completed }
export const groupByDate = (tasks: Task[]) => {
  const map: Record<string, { total: number; completed: number }> = {};
  tasks.forEach((t) => {
    const d = (t as any).taskDate ?? "unknown";
    if (!map[d]) map[d] = { total: 0, completed: 0 };
    map[d].total += 1;
    if (t.completed) map[d].completed += 1;
  });
  return map;
};

// Group tasks into week buckets relative to the 1st of the month
export const groupByWeekOfMonth = (tasks: Task[]) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const buckets: Record<string, { total: number; completed: number }> = {};

  tasks.forEach((t) => {
    const dateStr = (t as any).taskDate;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const diffDays = Math.floor(
      (d.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const weekIndex = Math.max(1, Math.floor(diffDays / 7) + 1);
    const key = `Week ${weekIndex}`;
    if (!buckets[key]) buckets[key] = { total: 0, completed: 0 };
    buckets[key].total += 1;
    if (t.completed) buckets[key].completed += 1;
  });

  return buckets;
};

export const pendingHighPriority = (tasks: Task[]) =>
  tasks
    .filter((t) => !t.completed && taskPriority(t) === "HIGH")
    .map((t) => taskLabel(t));

// ── Prompt builder ─────────────────────────────────────────────────────
const SYSTEM_RULES = `
You are the Life-OS AI Review coach: a personal productivity coach.
Analyze, evaluate, encourage, and guide — never simply summarize data.

Rules you must always follow:
- Never hallucinate, invent tasks, or invent goals.
- Never exaggerate or fabricate statistics.
- Never give medical or financial advice.
- Only use the data provided in the JSON payload below. Do not assume data you were not given.
- Tone: professional, friendly, supportive, motivational, honest. Never rude, insulting, or overly critical.
- Always end with positive encouragement and one small, achievable goal.

Respond in this exact structure, using plain text with numbered section headers (no markdown asterisks):
1. Overall Productivity Score
2. Review Summary
3. Strengths
4. Weaknesses
5. Patterns Identified
6. Suggestions
7. Focus For Next Period
8. Motivational Message

Keep it concise — a few sentences per section.
`.trim();

export function buildPrompt(
  type: ReviewType,
  username: string,
  progress: ProgressSummary,
  tasks: Task[],
  extra: { note?: string; byDate?: Record<string, any>; byWeek?: Record<string, any> }
) {
  const payload: Record<string, any> = {
    reviewType: type,
    user: username || "there",
    currentDate: getTodayDateString(),
    progressSummary: progress,
    tasks: tasks.map((t) => ({
      title: taskLabel(t),
      completed: t.completed,
      date: (t as any).taskDate,
      priority: taskPriority(t),
    })),
    pendingHighPriorityTasks: pendingHighPriority(tasks),
  };

  if (extra.note !== undefined) payload.todaysNote = extra.note || null;
  if (extra.byDate) payload.dailyBreakdown = extra.byDate;
  if (extra.byWeek) payload.weeklyBreakdown = extra.byWeek;

  return `${SYSTEM_RULES}\n\nHere is the data to analyze (JSON):\n${JSON.stringify(
    payload,
    null,
    2
  )}`;
}

// ── Shared "numbered section" response renderer ─────────────────────────
export function ReviewOutput({ text, C }: { text: string; C: ThemeColors }) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const headerPattern = /^\d+\.\s/;

  return (
    <View>
      {lines.map((line, idx) => {
        const isHeader = headerPattern.test(line.trim());
        return (
          <Text
            key={idx}
            style={[
              isHeader ? sharedStyles.sectionHeader : sharedStyles.sectionBody,
              { color: isHeader ? C.accent : C.textPrimary },
            ]}
          >
            {line.trim()}
          </Text>
        );
      })}
    </View>
  );
}

// ── Shared small stat box subcomponent ──────────────────────────────────
export function StatBox({
  label,
  value,
  C,
  color,
}: {
  label: string;
  value: number;
  C: ThemeColors;
  color?: string;
}) {
  return (
    <View style={[sharedStyles.statBox, { backgroundColor: C.surfaceAlt }]}>
      <Text style={[sharedStyles.statValue, { color: color ?? C.textPrimary }]}>
        {value}
      </Text>
      <Text style={[sharedStyles.statLabel, { color: C.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

// ── Sidebar sizing helper (mirrors app/(dashboard)/index.tsx) ───────────
const getSidebarWidth = () => Math.min(300, Dimensions.get("window").width * 0.8);

// ── Main Parent Component ───────────────────────────────────────────────
export default function AIReviewScreen() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [activeTab, setActiveTab] = useState<ReviewType>("day");

  // ── Sidebar state (same shape as the dashboard) ──────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getSidebarWidth());

  const translateX = useRef(new Animated.Value(-getSidebarWidth())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const C = colorsForTheme(theme);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "bright" : "dark"));
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // ── Keep sidebar width in sync with orientation / window changes ──────
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", () => {
      const w = getSidebarWidth();
      setSidebarWidth(w);
      if (!sidebarOpen) translateX.setValue(-w);
    });
    return () => subscription.remove();
  }, [sidebarOpen]);

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

  const TABS: { id: ReviewType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: "day", label: "Day", icon: "today-outline" },
    { id: "week", label: "Week", icon: "calendar-outline" },
    { id: "month", label: "Month", icon: "stats-chart-outline" },
  ];

  return (
    <View style={[sharedStyles.root, { backgroundColor: C.bg }]}>
      {/* ── Header with centered content ── */}
      <View style={sharedStyles.headerContainer}>
        <View style={sharedStyles.headerRow}>
          <TouchableOpacity
            onPress={openSidebar}
            activeOpacity={0.75}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[
              sharedStyles.iconBtn,
              { backgroundColor: C.surfaceAlt, borderColor: C.border },
            ]}
          >
            <Ionicons name="menu-outline" size={18} color={C.accent} />
          </TouchableOpacity>

          <View style={sharedStyles.headerCenter}>
            <Text style={[sharedStyles.title, { color: C.accent }]}>
              AI Review
            </Text>
            <Text style={[sharedStyles.subtitle, { color: C.textSecondary }]}>
              Your personal productivity coach
            </Text>
          </View>

          <TouchableOpacity
            onPress={toggleTheme}
            style={[
              sharedStyles.themeToggle,
              { backgroundColor: C.surface, borderColor: C.border },
            ]}
          >
            <Ionicons
              name={theme === "dark" ? "moon-outline" : "sunny-outline"}
              size={16}
              color={C.accent}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Segmented Tabs ── */}
      <View
        style={[
          sharedStyles.segment,
          { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
        ]}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={sharedStyles.segmentItem}
              activeOpacity={0.8}
              onPress={() => setActiveTab(tab.id)}
            >
              {active ? (
                <LinearGradient
                  colors={C.accentGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={sharedStyles.segmentActive}
                >
                  <Ionicons name={tab.icon} size={15} color="#FFFFFF" />
                  <Text style={sharedStyles.segmentTextActive}>{tab.label}</Text>
                </LinearGradient>
              ) : (
                <View style={sharedStyles.segmentInactive}>
                  <Ionicons name={tab.icon} size={15} color={C.textSecondary} />
                  <Text style={[sharedStyles.segmentText, { color: C.textSecondary }]}>
                    {tab.label}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Active child screen (theme is passed down so it always stays in sync) ── */}
      {activeTab === "day" && <DayReview theme={theme} />}
      {activeTab === "week" && <WeekReview theme={theme} />}
      {activeTab === "month" && <MonthReview theme={theme} />}

      {/* ── Sidebar overlay (mirrors app/(dashboard)/index.tsx) ── */}
      {sidebarMounted && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Backdrop */}
          <TouchableWithoutFeedback onPress={closeSidebar}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                sharedStyles.backdrop,
                { opacity: backdropOpacity },
              ]}
            />
          </TouchableWithoutFeedback>

          {/* Sidebar Panel */}
          <Animated.View
            style={[
              sharedStyles.sidebarPanel,
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
    </View>
  );
}

// ── Shared Styles ────────────────────────────────────────────────────────
export const sharedStyles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  scrollContent: { paddingBottom: 40 },

  headerContainer: {
    marginBottom: 16,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },

  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  title: { 
    fontSize: 22, 
    fontWeight: "800", 
    letterSpacing: -0.4,
    textAlign: "center",
  },
  subtitle: { 
    fontSize: 12, 
    marginTop: 2,
    textAlign: "center",
  },

  themeToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  segment: {
    flexDirection: "row",
    borderRadius: 20,
    borderWidth: 1,
    padding: 6,
    gap: 6,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 14,
  },
  segmentItem: { flex: 1 },
  segmentActive: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
  },
  segmentInactive: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
  },
  segmentText: { fontSize: 12, fontWeight: "600" },
  segmentTextActive: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },

  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
  },

  cardLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 12,
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  statBox: {
    flexBasis: "47%",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  statValue: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 11, marginTop: 2 },

  progressBarTrack: {
    height: 8,
    borderRadius: 6,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    borderRadius: 6,
  },
  completionText: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
  },

  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  noteText: { fontSize: 12, flex: 1, lineHeight: 17 },

  generateBtnWrap: { marginTop: 16, borderRadius: 18, overflow: "hidden" },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
  },
  generateBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

  errorText: { fontSize: 12, marginTop: 10, textAlign: "center" },

  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  resultHeaderText: { fontSize: 14, fontWeight: "700" },

  sectionHeader: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
    marginBottom: 2,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 2,
  },

  savedAtText: {
    fontSize: 10,
    marginTop: 8,
    fontStyle: "italic",
  },

  // ── Sidebar-related styles (mirrors app/(dashboard)/index.tsx) ────────
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