// app/(task)/AIReviewScreen.tsx

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  ActivityIndicator,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ProgressSummary } from "../../store/progress";
import { getTodayDateString } from "../../utils/date";
import { Task } from "../../types/task";

import Sidebar from "../(tabs)/sidebar";

import DayReview from "./day_review";
import WeekReview from "./week_review";
import MonthReview from "./month_review";

// ─────────────────────────────────────────────────────────────────────────
// Groq API key is never bundled with the client. It's fetched from the
// backend right before it's needed (i.e. when the user triggers a review
// generation) and used to make a single call to Groq's chat completions
// endpoint. Nothing is cached in memory or storage.
// ─────────────────────────────────────────────────────────────────────────
const GROQ_KEY_ENDPOINT = `${process.env.EXPO_PUBLIC_API_URL}/api/gemini/key`;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export const getToken = (): Promise<string | null> =>
  AsyncStorage.getItem("token");

/**
 * Fetches the Groq API key from the backend. Call this only when a review
 * is actually about to be generated — not on mount, and not stored globally.
 */
async function getGroqApiKey(): Promise<string> {
  const token = await getToken();

  const response = await fetch(GROQ_KEY_ENDPOINT, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Groq API key (status ${response.status})`);
  }

  // Same shape as the previous Gemini endpoint — plain text body.
  const apiKey = (await response.text()).trim();

  if (!apiKey) {
    throw new Error("Received an empty Groq API key from the backend.");
  }

  return apiKey;
}

/**
 * Fetches a fresh Groq key from the backend and immediately uses it to
 * generate a chat completion for the given prompt. The key never leaves
 * this function's scope.
 */
export async function generateWithGroq(prompt: string): Promise<string> {
  const apiKey = await getGroqApiKey();

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Groq API error (${res.status}): ${errBody || res.statusText}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "No response received.";
}

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

/**
 * Deletes every persisted AI review (day/week/month) from AsyncStorage.
 * Call this once from your logout handler (e.g. in Sidebar.tsx or your
 * auth store) so a previous user's generated reviews never leak into the
 * next signed-in session on the same device.
 *
 *   import { clearAllReviewData } from "./AIReviewScreen"; // or "./ai_review"
 *
 *   async function logout() {
 *     await clearAllReviewData();
 *     // ... clear token, reset auth state, navigate to login, etc.
 *   }
 */
export async function clearAllReviewData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  } catch (e) {
    console.error("[AIReviewScreen] Failed to clear stored reviews on logout:", e);
  }
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
// NOTE: Only the wording/richness of these instructions was changed here.
// The output contract (8 numbered sections, plain text, no markdown
// asterisks) is UNCHANGED so ReviewOutput's parser keeps working exactly
// as before.
const SYSTEM_RULES = `
You are the Life-OS AI Review Coach — an experienced personal productivity
coach who has reviewed thousands of task logs. You are perceptive, specific,
and warm. You notice patterns a busy person would miss in their own data,
and you explain *why* something matters, not just *what* happened.

Write like a coach who actually read the data, not like a template filling
in blanks. Reference concrete details from the JSON payload (task names,
counts, dates, priorities) wherever they strengthen a point — vague,
generic filler ("you did some tasks") is not acceptable when specific
numbers or task titles are available in the payload.

Hard rules you must always follow:
- Never hallucinate, invent tasks, goals, or numbers that are not present in the JSON payload.
- Never exaggerate, round misleadingly, or fabricate statistics.
- Never give medical, financial, or legal advice.
- Only use the data provided in the JSON payload below. If something isn't in the data, say so plainly instead of guessing.
- If the payload is sparse or empty for a section, say that honestly and briefly rather than padding with generic advice.
- Tone: professional, friendly, supportive, motivational, honest — like a good coach, not a cheerleader and not a critic. Never rude, dismissive, or overly harsh.
- Always end with genuine, specific encouragement and exactly one small, concrete, achievable goal the person can act on immediately.

Writing quality bar for every section:
- Be specific, not generic. Cite an actual task name, count, or date from the payload when it supports the point.
- Vary sentence length — avoid a wall of same-shaped sentences.
- No filler openers like "In this section..." or "Based on the data provided...". Get straight to the substance.
- No markdown symbols anywhere (no asterisks, no bullets like "-" or "•", no bold/italics). Plain sentences only.
- Each section should feel complete on its own — a person should be able to read just section 3 and understand their strengths without needing the others.

Respond in exactly this structure, using plain text with numbered section
headers (no markdown asterisks), and nothing before section 1 or after
section 8:
1. Overall Productivity Score
2. Review Summary
3. Strengths
4. Weaknesses
5. Patterns Identified
6. Suggestions
7. Focus For Next Period
8. Motivational Message

Length guidance per section (keep it tight, not padded):
1. One line: a score out of 100 plus a one-sentence justification tied to the data.
2. Two to three sentences summarizing what actually happened this period.
3. Two to three sentences, naming specific completed tasks or habits where possible.
4. Two to three sentences, naming specific missed or pending high-priority tasks where the data supports it — framed constructively, never as a personal failing.
5. One to two sentences on a real recurring pattern visible in the data (e.g. a particular day, task type, or priority level trending a certain way). If no clear pattern exists in the data, say so.
6. Two to three concrete, actionable suggestions directly tied to the weaknesses or patterns above — not generic productivity tips.
7. One to two sentences naming a clear, narrow focus area for the next period.
8. Two to three sentences of genuine encouragement, closing with exactly one small, specific, achievable goal.
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

// ── Tab order — must match the TABS array below, used to translate a
//    swipe's scroll offset into a tab id and vice-versa. ─────────────────
const TAB_ORDER: ReviewType[] = ["day", "week", "month"];

// The horizontal padding applied to `root`/`styles.root`. The swipeable
// content area temporarily cancels this (via negative margin) so each
// page can be exactly one screen-width wide for correct paging math, then
// re-applies the same padding inside each page.
const ROOT_HORIZONTAL_PADDING = 16;

// ── Main Parent Component ───────────────────────────────────────────────
export default function AIReviewScreen() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [activeTab, setActiveTab] = useState<ReviewType>("day");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [themeLoaded, setThemeLoaded] = useState(false);

  // ── Header entrance animation ──────────────────────────────────────────
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-8)).current;

  // ── Sidebar state (same shape as the dashboard) ──────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMounted, setSidebarMounted] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(getSidebarWidth());

  const translateX = useRef(new Animated.Value(-getSidebarWidth())).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // ── Swipeable tab content state ───────────────────────────────────────
  const [screenWidth, setScreenWidth] = useState(Dimensions.get("window").width);
  // Which review screens have ever been shown — once a tab is visited it
  // stays mounted so swiping back to it doesn't remount / re-fetch, but we
  // avoid mounting all three (and firing all their data loads) up front.
  const [visitedTabs, setVisitedTabs] = useState<Set<ReviewType>>(
    () => new Set<ReviewType>(["day"])
  );
  const contentScrollRef = useRef<ScrollView>(null);

  const C = colorsForTheme(theme);

  // ── Load user data ──────────────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        const pairs = await AsyncStorage.multiGet(["theme", "fullName", "username"]);
        const map = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? ""]));
        if (map.theme === "bright" || map.theme === "dark") {
          setTheme(map.theme as Theme);
        }
        setFullName(map.fullName);
        setUsername(map.username);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setThemeLoaded(true);
      }
    };
    loadData();
  }, []);

  // ── Header entrance animation ──────────────────────────────────────────
  useEffect(() => {
    if (themeLoaded) {
      Animated.parallel([
        Animated.timing(headerFade, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(headerSlide, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [themeLoaded, headerFade, headerSlide]);

  const toggleTheme = useCallback(async (value: boolean) => {
    const next: Theme = value ? "dark" : "bright";
    setTheme(next);
    try {
      await AsyncStorage.setItem("theme", next);
    } catch (error) {
      console.error("Error saving theme:", error);
    }
  }, []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // ── Keep sidebar width + screen width in sync with orientation changes ─
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      const w = getSidebarWidth();
      setSidebarWidth(w);
      if (!sidebarOpen) translateX.setValue(-w);
      setScreenWidth(window.width);
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

  // ── Keep the swipeable content area aligned to the active tab whenever
  //    the screen width changes (e.g. device rotation). ───────────────────
  useEffect(() => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx < 0) return;
    contentScrollRef.current?.scrollTo({ x: idx * screenWidth, animated: false });
    // Only re-run when the width itself changes — activeTab changes are
    // already handled by handleTabPress / handleContentScrollEnd below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenWidth]);

  const markVisited = useCallback((tab: ReviewType) => {
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, []);

  // Tapping a tab button: scroll the paging view to that page and mark it
  // visited so it (re)mounts if this is the first time it's shown.
  const handleTabPress = useCallback(
    (tab: ReviewType) => {
      const idx = TAB_ORDER.indexOf(tab);
      if (idx < 0) return;
      markVisited(tab);
      setActiveTab(tab);
      contentScrollRef.current?.scrollTo({ x: idx * screenWidth, animated: true });
    },
    [markVisited, screenWidth]
  );

  // Swiping the content: figure out which page we landed on and sync the
  // active tab + segmented control to match.
  const handleContentScrollSettled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (screenWidth <= 0) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
      const tab = TAB_ORDER[idx];
      if (!tab) return;
      markVisited(tab);
      setActiveTab((current) => (current === tab ? current : tab));
    },
    [screenWidth, markVisited]
  );

  const TABS: { id: ReviewType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: "day", label: "Day", icon: "today-outline" },
    { id: "week", label: "Week", icon: "calendar-outline" },
    { id: "month", label: "Month", icon: "stats-chart-outline" },
  ];

  const displayName = (fullName || username || "").trim();

  // Identity key passed down to the review screens so they can detect a
  // logout -> different-login transition and reset their in-memory state.
  // Uses username (falling back to fullName) since that's already loaded
  // here; swap this for a real user id if your auth system exposes one.
  const reviewUserId = (username || fullName || "").trim() || null;

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
    <View
      style={[
        styles.root,
        {
          backgroundColor: C.bg,
          paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
        },
      ]}
    >
      <StatusBar
        barStyle={theme === "bright" ? "dark-content" : "light-content"}
        backgroundColor={C.bg}
      />

      {/* ── Enhanced Header with Card Design ── */}
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
        {/* Left: Menu Button */}
        <TouchableOpacity
          onPress={openSidebar}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.iconBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
        >
          <Ionicons name="menu-outline" size={20} color={C.textPrimary} />
        </TouchableOpacity>

        {/* Center: Content */}
        <View style={styles.headerCenter}>
          <Text style={[styles.eyebrow, { color: C.accent }]}>
            {displayName ? `Hi, ${displayName.split(" ")[0]}` : "Welcome back"}
          </Text>
          <Text style={[styles.title, { color: C.textPrimary }]}>
            AI Review
          </Text>
          <Text style={[styles.date, { color: C.textSecondary }]}>
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </Text>
        </View>

        {/* Right: Theme Toggle */}
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

      {/* ── Segmented Tabs ── */}
      <View
        style={[
          sharedStyles.segment,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
            shadowColor: C.shadowDark,
          },
        ]}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={sharedStyles.segmentItem}
              activeOpacity={0.8}
              onPress={() => handleTabPress(tab.id)}
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

      {/* ── Swipeable content (day / week / month) — also reachable via the
           segmented tabs above. Pages beyond the ones already visited are
           rendered as empty spacers so paging math stays correct without
           mounting (and data-loading) screens the user hasn't opened yet. ── */}
      <ScrollView
        ref={contentScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleContentScrollSettled}
        onScrollEndDrag={handleContentScrollSettled}
        style={[
          styles.contentScroll,
          { width: screenWidth, marginHorizontal: -ROOT_HORIZONTAL_PADDING },
        ]}
      >
        <View style={[styles.contentPage, { width: screenWidth }]}>
          {visitedTabs.has("day") && <DayReview theme={theme} userId={reviewUserId} />}
        </View>
        <View style={[styles.contentPage, { width: screenWidth }]}>
          {visitedTabs.has("week") && <WeekReview theme={theme} userId={reviewUserId} />}
        </View>
        <View style={[styles.contentPage, { width: screenWidth }]}>
          {visitedTabs.has("month") && <MonthReview theme={theme} userId={reviewUserId} />}
        </View>
      </ScrollView>

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

// ── Enhanced Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: ROOT_HORIZONTAL_PADDING,
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
    marginHorizontal: 0,
    marginTop: 6,
    marginBottom: 16,
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

  contentScroll: {
    flex: 1,
  },

  contentPage: {
    flex: 1,
    paddingHorizontal: ROOT_HORIZONTAL_PADDING,
  },
});

// ── Shared Styles (updated for consistency) ──────────────────────────────
export const sharedStyles = StyleSheet.create({
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

  scrollContent: { paddingBottom: 40 },

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
});