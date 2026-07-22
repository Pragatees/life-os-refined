// app/(task)/month_review.tsx
//
// Child screen for the "Month" review tab. Theme is passed down from the
// parent (AIReviewScreen.tsx) as a prop, so switching theme there is
// always instantly reflected here — there is no local theme state.
//
// Review results ARE persisted to AsyncStorage (STORAGE_KEYS.month), one
// per calendar month. Once a review is generated for the current month,
// the button is disabled and stays disabled until the month rolls over —
// the stored review is then detected as stale and cleared automatically.
//
// On logout, call clearAllReviewData() (see note at the bottom of this
// file) so no previous user's review persists into the next session.
//
// `userId` is optional but recommended: pass the current logged-in
// user's id (or null/"guest" when signed out) from the parent. Whenever
// this value changes (logout, or login as a different user), this
// screen resets its in-memory state so no stale result from the
// previous user can flash on screen before the effects re-run.
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
  groupByWeekOfMonth,
  ReviewOutput,
  StatBox,
  sharedStyles,
  STORAGE_KEYS,
  StoredReview,
} from "./ai_review";

interface MonthReviewProps {
  theme: Theme;
  /** Current user's id. Pass null/"guest" when signed out. Optional. */
  userId?: string | null;
}

const NINE_PM = 21 * 60; // 21:00 in minutes

function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export default function MonthReview({ theme, userId = null }: MonthReviewProps) {
  const C = colorsForTheme(theme);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [isReviewEnabled, setIsReviewEnabled] = useState(false);
  const [hasReviewedThisMonth, setHasReviewedThisMonth] = useState(false);

  // Tracks the previous userId so we can detect a login/logout switch
  // and wipe in-memory state before it can flash stale content.
  const previousUserIdRef = useRef<string | null | undefined>(userId);

  const { monthlyTasks, monthlyProgress, initializeProgress } = useProgressStore();

  // Load progress once (store handles caching internally)
  useEffect(() => {
    initializeProgress();
  }, [initializeProgress]);

  // Reset local state whenever the signed-in user changes.
  useEffect(() => {
    if (previousUserIdRef.current !== userId) {
      previousUserIdRef.current = userId;
      setLoading(false);
      setError(null);
      setResult(null);
      setSavedAt(null);
      setUsername("");
      setIsReviewEnabled(false);
      setHasReviewedThisMonth(false);
    }
  }, [userId]);

  // Check time constraints and review status for month
  useEffect(() => {
    let cancelled = false;

    const checkReviewStatus = async () => {
      try {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinutes;

        const currentDay = now.getDate();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Get last day of current month
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
        const lastDay = lastDayOfMonth.getDate();

        // Month review is available from the 25th at 9 PM through the
        // end of the month, and also on the 1st (to catch up on the
        // previous month's review).
        const isLastWeekOfMonth = currentDay >= 25;
        const isLastDayOfMonth = currentDay === lastDay;
        const isFirstDayOfMonth = currentDay === 1;

        const isReviewPeriod =
          (isLastWeekOfMonth && currentTimeInMinutes >= NINE_PM) ||
          isLastDayOfMonth ||
          isFirstDayOfMonth;

        const currentMonthKey = getMonthKey(now);

        const raw = await AsyncStorage.getItem(STORAGE_KEYS.month);
        if (cancelled) return;

        if (raw) {
          const stored: StoredReview = JSON.parse(raw);
          const storedMonthKey = getMonthKey(new Date(stored.generatedAt));

          const isThisMonth = storedMonthKey === currentMonthKey;

          if (isThisMonth) {
            setHasReviewedThisMonth(true);
            setResult(stored.text);
            setSavedAt(stored.generatedAt);
            setIsReviewEnabled(isReviewPeriod);
          } else {
            // Review is from a previous month — stale, remove it
            await AsyncStorage.removeItem(STORAGE_KEYS.month);
            if (cancelled) return;
            setResult(null);
            setSavedAt(null);
            setHasReviewedThisMonth(false);
            setIsReviewEnabled(isReviewPeriod);
          }
        } else {
          setHasReviewedThisMonth(false);
          setIsReviewEnabled(isReviewPeriod);
        }
      } catch (e) {
        console.error("[MonthReview] Failed to check review status:", e);
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
        console.error("[MonthReview] Failed to load profile:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const monthlyByWeek = useMemo(() => groupByWeekOfMonth(monthlyTasks), [monthlyTasks]);

  const handleGenerateReview = useCallback(async () => {
    if (!isReviewEnabled || hasReviewedThisMonth) {
      setError("Month review is not available at this time.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const prompt = buildPrompt("month", username, monthlyProgress, monthlyTasks, {
        byWeek: monthlyByWeek,
      });

      // Fetches the Groq API key from the backend and makes the chat
      // completion call in one step — the key never touches this file
      // or gets stored anywhere on the client.
      const text = await generateWithGroq(prompt);
      const generatedAt = new Date().toISOString();

      setResult(text);
      setSavedAt(generatedAt);
      setHasReviewedThisMonth(true);

      // Persist the generated review to local storage
      const toStore: StoredReview = { text, generatedAt };
      await AsyncStorage.setItem(STORAGE_KEYS.month, JSON.stringify(toStore));
    } catch (e: any) {
      console.error("[MonthReview] Groq error:", e);
      setError(e?.message || "Something went wrong generating your review.");
    } finally {
      setLoading(false);
    }
  }, [username, monthlyProgress, monthlyTasks, monthlyByWeek, isReviewEnabled, hasReviewedThisMonth]);

  // Get button status message
  const getButtonStatus = useCallback(() => {
    if (hasReviewedThisMonth) {
      return "Review already generated for this month";
    }

    const now = new Date();
    const currentDay = now.getDate();
    const currentHour = now.getHours();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const lastDay = lastDayOfMonth.getDate();

    if (currentDay >= 25 && currentDay <= lastDay) {
      if (currentHour < 21 && currentDay < lastDay) {
        return `Available tonight at 9 PM (${21 - currentHour}h remaining)`;
      }
      return "Generate Month Review";
    } else if (currentDay === 1) {
      return "Generate Month Review (Previous Month)";
    } else {
      const daysUntil25 = 25 - currentDay;
      return `Available from 25th at 9 PM (${daysUntil25}d remaining)`;
    }
  }, [hasReviewedThisMonth]);

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
        <Text style={[sharedStyles.cardLabel, { color: C.textSecondary }]}>This Month</Text>

        <View style={sharedStyles.statsGrid}>
          <StatBox label="Total" value={monthlyProgress.totalTasks} C={C} />
          <StatBox label="Completed" value={monthlyProgress.completedTasks} C={C} color={C.success} />
          <StatBox label="Pending" value={monthlyProgress.pendingTasks} C={C} color={C.warning} />
          <StatBox label="Overdue" value={monthlyProgress.overdueTasks} C={C} color={C.danger} />
        </View>

        <View style={[sharedStyles.progressBarTrack, { backgroundColor: C.surfaceAlt }]}>
          <View
            style={[
              sharedStyles.progressBarFill,
              {
                width: `${monthlyProgress.completionRate}%`,
                backgroundColor: C.accent,
              },
            ]}
          />
        </View>
        <Text style={[sharedStyles.completionText, { color: C.textPrimary }]}>
          {monthlyProgress.completionRate}% completion
        </Text>
      </View>

      {/* ── Generate Button ── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleGenerateReview}
        disabled={loading || !isReviewEnabled || hasReviewedThisMonth}
        style={sharedStyles.generateBtnWrap}
      >
        <LinearGradient
          colors={
            !isReviewEnabled || hasReviewedThisMonth
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
                name={hasReviewedThisMonth ? "checkmark-circle-outline" : "sparkles-outline"}
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
              Your Month Review
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
// Make sure AIReviewScreen.tsx exports all three keys plus a shared clear
// helper so day/week/month reviews all clear together on logout:
//
//   export const STORAGE_KEYS = {
//     day: "@ai_review:day",
//     week: "@ai_review:week",
//     month: "@ai_review:month",
//   };
//
//   export async function clearAllReviewData() {
//     try {
//       await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
//     } catch (e) {
//       console.error("[AIReviewScreen] Failed to clear stored reviews on logout:", e);
//     }
//   }
//
// Then in your logout handler:
//
//   import { clearAllReviewData } from "./app/(task)/AIReviewScreen";
//
//   export async function logout() {
//     await clearAllReviewData();
//     // ... clear tokens, reset auth store, navigate to login, etc.
//   }
//
// And render this screen with the current user id so it self-resets on
// user switch even if it stays mounted across the logout transition:
//
//   <MonthReview theme={theme} userId={currentUser?.id ?? null} />