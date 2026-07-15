// app/(task)/day_review.tsx
//
// Child screen for the "Day" review tab. Theme is passed down from the
// parent (AIReviewScreen.tsx) as a prop, so switching theme there is
// always instantly reflected here — there is no local theme state.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useProgressStore } from "../../store/progress";
import { useNotesStore } from "../../store/notes";
import { getTodayDateString, formatDate } from "../../utils/date";
import {
  Theme,
  colorsForTheme,
  ai,
  getToken,
  buildPrompt,
  groupByDate,
  ReviewOutput,
  sharedStyles,
  STORAGE_KEYS,
  StoredReview,
} from "./ai_review";

interface DayReviewProps {
  theme: Theme;
}

export default function DayReview({ theme }: DayReviewProps) {
  const C = colorsForTheme(theme);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [todaysNote, setTodaysNote] = useState<string>("");
  const [username, setUsername] = useState("");
  const [isReviewEnabled, setIsReviewEnabled] = useState(false);
  const [hasReviewedToday, setHasReviewedToday] = useState(false);

  const {
    dailyTasks,
    dailyProgress,
    dailyLoading,
    dailyError,
    initializeProgress,
    fetchDailyProgress,
  } = useProgressStore();

  const { getNote } = useNotesStore();

  useEffect(() => {
    initializeProgress();
  }, [initializeProgress]);

  useEffect(() => {
    const checkReviewStatus = async () => {
      try {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinutes;

        const NINE_PM = 21 * 60;
        const ONE_PM = 13 * 60;

        const isAfter9PM = currentTimeInMinutes >= NINE_PM;
        const todayStr = getTodayDateString();

        const raw = await AsyncStorage.getItem(STORAGE_KEYS.day);
        if (raw) {
          const stored: StoredReview = JSON.parse(raw);
          const storedDate = new Date(stored.generatedAt);
          const storedDateStr = formatDate(storedDate);
          const isToday = storedDateStr === todayStr;
          const isPast1PM = currentTimeInMinutes >= ONE_PM;

          if (isToday) {
            setHasReviewedToday(true);
            setResult(stored.text);
            setSavedAt(stored.generatedAt);
            setIsReviewEnabled(isAfter9PM);
          } else if (!isToday && isPast1PM) {
            await AsyncStorage.removeItem(STORAGE_KEYS.day);
            setResult(null);
            setSavedAt(null);
            setHasReviewedToday(false);
            setIsReviewEnabled(isAfter9PM);
          } else {
            setResult(stored.text);
            setSavedAt(stored.generatedAt);
            setHasReviewedToday(false);
            setIsReviewEnabled(false);
          }
        } else {
          setHasReviewedToday(false);
          setIsReviewEnabled(isAfter9PM);
        }
      } catch (e) {
        console.error("[DayReview] Failed to check review status:", e);
        setIsReviewEnabled(false);
      }
    };

    checkReviewStatus();
    const interval = setInterval(checkReviewStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const name = await AsyncStorage.getItem("fullName");
        const uname = await AsyncStorage.getItem("username");
        setUsername((name || uname || "").trim());

        const token = await getToken();
        const today = getTodayDateString();
        const entry = await getNote(today, token);
        setTodaysNote(entry?.content ?? "");
      } catch (e) {
        console.error("[DayReview] Failed to load note/profile:", e);
      }
    })();
  }, [getNote]);

  const dailyByDate = useMemo(() => groupByDate(dailyTasks), [dailyTasks]);

  const handleGenerateReview = useCallback(async () => {
    if (!isReviewEnabled || hasReviewedToday) {
      setError("Review is not available at this time.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const prompt = buildPrompt("day", username, dailyProgress, dailyTasks, {
        note: todaysNote,
        byDate: dailyByDate,
      });

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const text = result.text ?? "No response received.";
      const generatedAt = new Date().toISOString();

      setResult(text);
      setSavedAt(generatedAt);
      setHasReviewedToday(true);

      const toStore: StoredReview = { text, generatedAt };
      await AsyncStorage.setItem(STORAGE_KEYS.day, JSON.stringify(toStore));
    } catch (e: any) {
      console.error("[DayReview] Gemini error:", e);
      setError(e?.message || "Something went wrong generating your review.");
    } finally {
      setLoading(false);
    }
  }, [username, dailyProgress, dailyTasks, todaysNote, dailyByDate, isReviewEnabled, hasReviewedToday]);

  const getButtonStatus = () => {
    const now = new Date();
    const currentHour = now.getHours();

    if (hasReviewedToday) {
      return "Review already generated for today";
    }

    if (currentHour < 21) {
      const hoursRemaining = 21 - currentHour;
      return `Available after 9 PM (${hoursRemaining}h remaining)`;
    }

    return "Generate Review";
  };

  if (dailyLoading) {
    return (
      <ScrollView
        contentContainerStyle={sharedStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            sharedStyles.card,
            { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
          ]}
        >
          <Text style={[sharedStyles.cardLabel, { color: C.textSecondary }]}>Today</Text>
          <View style={localStyles.loadingContainer}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={[localStyles.loadingText, { color: C.textSecondary }]}>
              Loading today's data...
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (dailyError) {
    return (
      <ScrollView
        contentContainerStyle={sharedStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            sharedStyles.card,
            { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
          ]}
        >
          <Text style={[sharedStyles.cardLabel, { color: C.textSecondary }]}>Today</Text>
          <View style={localStyles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={C.danger} />
            <Text style={[localStyles.errorText, { color: C.danger }]}>
              {dailyError}
            </Text>
            <TouchableOpacity
              style={[localStyles.retryButton, { backgroundColor: C.accent }]}
              onPress={() => fetchDailyProgress(true)}
            >
              <Text style={localStyles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={sharedStyles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Stats Card ── */}
      <View
        style={[
          sharedStyles.card,
          { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
        ]}
      >
        <Text style={[sharedStyles.cardLabel, { color: C.textSecondary }]}>Today's Tasks</Text>

        {/* Stats Grid - 2x2 layout (fixed row-by-row instead of wrap+gap
            so it can never overlap regardless of RN version / shared-style bugs) */}
        <View style={localStyles.statsGrid}>
          <View style={localStyles.statsRow}>
            <View style={[localStyles.statBox, { backgroundColor: C.surfaceAlt, marginRight: 6 }]}>
              <Text style={[localStyles.statValue, { color: C.textPrimary }]}>
                {dailyProgress.totalTasks}
              </Text>
              <Text style={[localStyles.statLabel, { color: C.textSecondary }]}>Total</Text>
            </View>

            <View style={[localStyles.statBox, { backgroundColor: C.surfaceAlt, marginLeft: 6 }]}>
              <Text style={[localStyles.statValue, { color: C.success }]}>
                {dailyProgress.completedTasks}
              </Text>
              <Text style={[localStyles.statLabel, { color: C.textSecondary }]}>Completed</Text>
            </View>
          </View>

          <View style={[localStyles.statsRow, { marginTop: 12 }]}>
            <View style={[localStyles.statBox, { backgroundColor: C.surfaceAlt, marginRight: 6 }]}>
              <Text style={[localStyles.statValue, { color: C.warning }]}>
                {dailyProgress.pendingTasks}
              </Text>
              <Text style={[localStyles.statLabel, { color: C.textSecondary }]}>Pending</Text>
            </View>

            <View style={[localStyles.statBox, { backgroundColor: C.surfaceAlt, marginLeft: 6 }]}>
              <Text style={[localStyles.statValue, { color: C.danger }]}>
                {dailyProgress.overdueTasks}
              </Text>
              <Text style={[localStyles.statLabel, { color: C.textSecondary }]}>Overdue</Text>
            </View>
          </View>
        </View>

        {/* Progress Bar — using LOCAL styles instead of sharedStyles.
            sharedStyles.progressBarTrack/completionText were overlapping
            the stat boxes above (likely absolute-positioned or negative
            margin meant for a different card layout in ai_review.ts). */}
        <View style={localStyles.progressSection}>
          <View style={[localStyles.progressBarTrack, { backgroundColor: C.surfaceAlt }]}>
            <View
              style={[
                localStyles.progressBarFill,
                {
                  width: `${dailyProgress.completionRate}%`,
                  backgroundColor: C.accent,
                },
              ]}
            />
          </View>
          <Text style={[localStyles.completionText, { color: C.textPrimary }]}>
            {dailyProgress.completionRate}% completion
          </Text>
        </View>
      </View>

      {/* ── Generate Button Section ── */}
      <View style={localStyles.card}>
        <Text style={[localStyles.title, { color: C.textPrimary }]}>Daily Review</Text>
        <Text style={[localStyles.subtitle, { color: C.textSecondary }]}>
          Get an AI-powered review of your day's tasks and progress.
        </Text>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleGenerateReview}
          disabled={loading || !isReviewEnabled || hasReviewedToday}
          style={localStyles.generateBtnWrap}
        >
          <LinearGradient
            colors={(!isReviewEnabled || hasReviewedToday) ? [C.textSecondary, C.textSecondary] : C.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={localStyles.generateBtn}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name={hasReviewedToday ? "checkmark-circle-outline" : "sparkles-outline"}
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={localStyles.generateBtnText}>
                  {getButtonStatus()}
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {error && <Text style={[localStyles.errorText, { color: C.danger }]}>{error}</Text>}

        {/* ── Today's Note ── */}
        <View style={[localStyles.noteBox, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
          <Ionicons name="document-text-outline" size={14} color={C.accent} />
          <Text style={[localStyles.noteText, { color: C.textSecondary }]} numberOfLines={2}>
            {todaysNote ? todaysNote : "No note written for today yet."}
          </Text>
        </View>
      </View>

      {/* ── AI Response ── */}
      {result && (
        <View
          style={[
            sharedStyles.card,
            { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark, marginTop: 14 },
          ]}
        >
          <View style={localStyles.resultHeader}>
            <Ionicons name="sparkles" size={16} color={C.accent} />
            <Text style={[localStyles.resultHeaderText, { color: C.textPrimary }]}>
              Your Review
            </Text>
          </View>
          <ReviewOutput text={result} C={C} />
          {savedAt && (
            <Text style={[localStyles.savedAtText, { color: C.textSecondary }]}>
              Saved {new Date(savedAt).toLocaleString()}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Local Styles ──────────────────────────────────────────────────────────
const localStyles = StyleSheet.create({
  card: {
    backgroundColor: "transparent",
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  loadingContainer: {
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "500",
  },
  errorContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    fontSize: 16,
    marginTop: 10,
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 14,
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginTop: 16,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },

  // ── Stats grid: explicit rows instead of flexWrap+gap ──
  statsGrid: {
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
  },
  statBox: {
    flex: 1,
    minHeight: 90,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // ── Progress bar: local, self-contained (no dependency on sharedStyles) ──
  progressSection: {
    marginTop: 4,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    width: "100%",
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  completionText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
  },

  generateBtnWrap: {
    borderRadius: 14,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
  },
  generateBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  resultHeaderText: {
    fontSize: 16,
    fontWeight: "700",
  },
  savedAtText: {
    fontSize: 11,
    marginTop: 12,
    fontStyle: "italic",
  },
});