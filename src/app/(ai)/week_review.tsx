// app/(task)/week_review.tsx
//
// Child screen for the "Week" review tab. Theme is passed down from the
// parent (AIReviewScreen.tsx) as a prop, so switching theme there is
// always instantly reflected here — there is no local theme state.
//
// `userId` is optional but recommended: pass the current logged-in user's
// id (or null/"guest" when signed out) from the parent. Whenever this
// value changes (i.e. on logout -> login as someone else), this screen
// resets its in-memory state so no stale review is shown before the
// weekly check re-runs. Actual on-disk cleanup on logout should still be
// done once, globally, via `clearAllReviewData()` from ai_review.ts,
// called from your logout handler — see note at the bottom of this file.
//
// Adjust these import paths to match your actual project structure.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useProgressStore } from "../../store/progress";

import {
  Theme,
  colorsForTheme,
  generateWithGroq,
  buildPrompt,
  groupByDate,
  ReviewOutput,
  StatBox,
  sharedStyles,
  STORAGE_KEYS,
  StoredReview,
} from "./ai_review";

interface WeekReviewProps {
  theme: Theme;
  /** Current user's id. Pass null/"guest" when signed out. Optional. */
  userId?: string | null;
}

const SATURDAY_NINE_PM = 21 * 60; // 21:00 in minutes
const SUNDAY_ELEVEN_59_PM = 23 * 60 + 59; // 23:59 in minutes

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as week start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function WeekReview({ theme, userId = null }: WeekReviewProps) {
  const C = colorsForTheme(theme);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [isReviewEnabled, setIsReviewEnabled] = useState(false);
  const [hasReviewedThisWeek, setHasReviewedThisWeek] = useState(false);

  // Tracks the previous userId so we can detect a login/logout switch
  // and wipe in-memory state before it can flash stale content.
  const previousUserIdRef = useRef<string | null | undefined>(userId);

  const { weeklyTasks, weeklyProgress, initializeProgress } = useProgressStore();

  // Load progress once (store handles caching internally)
  useEffect(() => {
    initializeProgress();
  }, [initializeProgress]);

  // Reset local state whenever the signed-in user changes (covers logout,
  // login as a different user, or login after a guest session).
  useEffect(() => {
    if (previousUserIdRef.current !== userId) {
      previousUserIdRef.current = userId;
      setLoading(false);
      setError(null);
      setResult(null);
      setSavedAt(null);
      setUsername("");
      setIsReviewEnabled(false);
      setHasReviewedThisWeek(false);
    }
  }, [userId]);

  // Check time constraints and review status for week
  useEffect(() => {
    let cancelled = false;

    const checkReviewStatus = async () => {
      try {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinutes;

        // Get current day of week (0 = Sunday, 6 = Saturday)
        const currentDay = now.getDay();
        const isSaturday = currentDay === 6;
        const isSunday = currentDay === 0;

        // Week review is available Saturday 9 PM through Sunday 11:59 PM
        const isReviewPeriod =
          (isSaturday && currentTimeInMinutes >= SATURDAY_NINE_PM) ||
          (isSunday && currentTimeInMinutes <= SUNDAY_ELEVEN_59_PM);

        const weekStart = getWeekStart(now);
        const weekStartStr = weekStart.toISOString().split("T")[0];

        const raw = await AsyncStorage.getItem(STORAGE_KEYS.week);

        if (cancelled) return;

        if (raw) {
          const stored: StoredReview = JSON.parse(raw);
          const storedWeekStart = getWeekStart(new Date(stored.generatedAt));
          const storedWeekStartStr = storedWeekStart.toISOString().split("T")[0];

          const isThisWeek = storedWeekStartStr === weekStartStr;

          if (isThisWeek) {
            setHasReviewedThisWeek(true);
            setResult(stored.text);
            setSavedAt(stored.generatedAt);
            setIsReviewEnabled(isReviewPeriod);
          } else {
            // Review is from a previous week — stale, remove it
            await AsyncStorage.removeItem(STORAGE_KEYS.week);
            if (cancelled) return;
            setResult(null);
            setSavedAt(null);
            setHasReviewedThisWeek(false);
            setIsReviewEnabled(isReviewPeriod);
          }
        } else {
          setHasReviewedThisWeek(false);
          setIsReviewEnabled(isReviewPeriod);
        }
      } catch (e) {
        console.error("[WeekReview] Failed to check review status:", e);
        if (!cancelled) setIsReviewEnabled(false);
      }
    };

    checkReviewStatus();

    const interval = setInterval(checkReviewStatus, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId]);

  // Load username for the prompt payload
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const name = await AsyncStorage.getItem("fullName");
        const uname = await AsyncStorage.getItem("username");
        if (!cancelled) setUsername((name || uname || "").trim());
      } catch (e) {
        console.error("[WeekReview] Failed to load profile:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const weeklyByDate = useMemo(() => groupByDate(weeklyTasks), [weeklyTasks]);

  const handleGenerateReview = useCallback(async () => {
    if (!isReviewEnabled || hasReviewedThisWeek) {
      setError("Week review is not available at this time.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const prompt = buildPrompt("week", username, weeklyProgress, weeklyTasks, {
        byDate: weeklyByDate,
      });

      // Fetches the Groq API key from the backend and makes the chat
      // completion call in one step — the key never touches this file
      // or gets stored anywhere on the client.
      const text = await generateWithGroq(prompt);
      const generatedAt = new Date().toISOString();

      setResult(text);
      setSavedAt(generatedAt);
      setHasReviewedThisWeek(true);

      const toStore: StoredReview = { text, generatedAt };
      await AsyncStorage.setItem(STORAGE_KEYS.week, JSON.stringify(toStore));
    } catch (e: any) {
      console.error("[WeekReview] Groq error:", e);
      setError(e?.message || "Something went wrong generating your review.");
    } finally {
      setLoading(false);
    }
  }, [username, weeklyProgress, weeklyTasks, weeklyByDate, isReviewEnabled, hasReviewedThisWeek]);

  const getButtonStatus = useCallback(() => {
    if (hasReviewedThisWeek) {
      return "Review already generated for this week";
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    if (currentDay === 6) {
      // Saturday
      if (currentHour < 21) {
        return `Available tonight at 9 PM (${21 - currentHour}h remaining)`;
      }
      return "Generate Week Review";
    } else if (currentDay === 0) {
      // Sunday
      return "Generate Week Review";
    } else {
      // Monday to Friday
      const daysUntilSaturday = 6 - currentDay;
      return `Available Saturday at 9 PM (${daysUntilSaturday}d remaining)`;
    }
  }, [hasReviewedThisWeek]);

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
        <Text style={[sharedStyles.cardLabel, { color: C.textSecondary }]}>This Week</Text>

        <View style={sharedStyles.statsGrid}>
          <StatBox label="Total" value={weeklyProgress.totalTasks} C={C} />
          <StatBox label="Completed" value={weeklyProgress.completedTasks} C={C} color={C.success} />
          <StatBox label="Pending" value={weeklyProgress.pendingTasks} C={C} color={C.warning} />
          <StatBox label="Overdue" value={weeklyProgress.overdueTasks} C={C} color={C.danger} />
        </View>

        <View style={[sharedStyles.progressBarTrack, { backgroundColor: C.surfaceAlt }]}>
          <View
            style={[
              sharedStyles.progressBarFill,
              {
                width: `${weeklyProgress.completionRate}%`,
                backgroundColor: C.accent,
              },
            ]}
          />
        </View>
        <Text style={[sharedStyles.completionText, { color: C.textPrimary }]}>
          {weeklyProgress.completionRate}% completion
        </Text>
      </View>

      {/* ── Generate Button ── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleGenerateReview}
        disabled={loading || !isReviewEnabled || hasReviewedThisWeek}
        style={sharedStyles.generateBtnWrap}
      >
        <LinearGradient
          colors={
            !isReviewEnabled || hasReviewedThisWeek
              ? [C.textSecondary, C.textSecondary]
              : C.accentGradient
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={sharedStyles.generateBtn}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name={hasReviewedThisWeek ? "checkmark-circle-outline" : "sparkles-outline"}
                size={16}
                color="#FFFFFF"
              />
              <Text style={sharedStyles.generateBtnText}>{getButtonStatus()}</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      {error && <Text style={[sharedStyles.errorText, { color: C.danger }]}>{error}</Text>}

      {/* ── AI Response ── */}
      {result && (
        <View
          style={[
            sharedStyles.card,
            { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark, marginTop: 14 },
          ]}
        >
          <View style={sharedStyles.resultHeader}>
            <Ionicons name="sparkles" size={16} color={C.accent} />
            <Text style={[sharedStyles.resultHeaderText, { color: C.textPrimary }]}>
              Your Week Review
            </Text>
          </View>
          <ReviewOutput text={result} C={C} />
          {savedAt && (
            <Text style={[sharedStyles.savedAtText, { color: C.textSecondary }]}>
              Saved {new Date(savedAt).toLocaleString()}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// LOGOUT CLEANUP (do this once, in your auth/logout logic — not in this file)
// ─────────────────────────────────────────────────────────────────────────
// Add this to ai_review.ts so every review screen (day/week/month) shares
// one source of truth for its storage keys and clears them together:
//
//   export const STORAGE_KEYS = {
//     day: "ai_review_day",
//     week: "ai_review_week",
//     month: "ai_review_month",
//   };
//
//   export async function clearAllReviewData() {
//     try {
//       await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
//     } catch (e) {
//       console.error("[ai_review] Failed to clear stored reviews on logout:", e);
//     }
//   }
//
// Then in your logout handler:
//
//   import { clearAllReviewData } from "./app/(task)/ai_review";
//
//   export async function logout() {
//     await clearAllReviewData();
//     // ... clear tokens, reset auth store, navigate to login, etc.
//   }
//
// And render this screen with the current user id so it self-resets on
// user switch even if it stays mounted across the logout transition:
//
//   <WeekReview theme={theme} userId={currentUser?.id ?? null} />