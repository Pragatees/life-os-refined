// app/(task)/month_review.tsx
//
// Child screen for the "Month" review tab. Theme is passed down from the
// parent (AIReviewScreen.tsx) as a prop, so switching theme there is
// always instantly reflected here — there is no local theme state.
//
// Adjust these import paths to match your actual project structure.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useProgressStore } from "../../store/progress";

import {
  Theme,
  colorsForTheme,
  ai,
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
}

export default function MonthReview({ theme }: MonthReviewProps) {
  const C = colorsForTheme(theme);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [isReviewEnabled, setIsReviewEnabled] = useState(false);
  const [hasReviewedThisMonth, setHasReviewedThisMonth] = useState(false);

  const {
    monthlyTasks,
    monthlyProgress,
    initializeProgress,
  } = useProgressStore();

  // Load progress once (store handles caching internally)
  useEffect(() => {
    initializeProgress();
  }, [initializeProgress]);

  // Check time constraints and review status for month
  useEffect(() => {
    const checkReviewStatus = async () => {
      try {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinutes;

        // Get current date info
        const currentDay = now.getDate();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // Get last day of current month
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
        const lastDay = lastDayOfMonth.getDate();

        // Get last day of previous month
        const lastDayOfPreviousMonth = new Date(currentYear, currentMonth, 0);
        const lastDayPrevMonth = lastDayOfPreviousMonth.getDate();

        // Month review should be available from 25th 9 PM to last day of month 11:59 PM
        // and also on 1st to check previous month's review
        const isLastWeekOfMonth = currentDay >= 25;
        const isLastDayOfMonth = currentDay === lastDay;
        const isFirstDayOfMonth = currentDay === 1;
        
        // 9 PM = 21:00 = 1260 minutes
        // 11:59 PM = 23:59 = 1439 minutes
        const NINE_PM = 21 * 60; // 1260

        // Check if it's review period
        const isReviewPeriod = 
          (isLastWeekOfMonth && currentTimeInMinutes >= NINE_PM) || 
          isLastDayOfMonth ||
          isFirstDayOfMonth;

        // Get month-year key for the current month
        const getMonthKey = (date: Date) => {
          const year = date.getFullYear();
          const month = date.getMonth();
          return `${year}-${String(month + 1).padStart(2, '0')}`;
        };

        const currentMonthKey = getMonthKey(now);

        // Check if there's a stored review
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.month);
        if (raw) {
          const stored: StoredReview = JSON.parse(raw);
          const storedDate = new Date(stored.generatedAt);
          const storedMonthKey = getMonthKey(storedDate);

          // Check if review was generated for this month
          const isThisMonth = storedMonthKey === currentMonthKey;

          if (isThisMonth) {
            // Review exists for this month
            setHasReviewedThisMonth(true);
            setResult(stored.text);
            setSavedAt(stored.generatedAt);
            
            // Enable only if during review period
            setIsReviewEnabled(isReviewPeriod);
          } else {
            // Review is from a previous month, should be deleted
            await AsyncStorage.removeItem(STORAGE_KEYS.month);
            setResult(null);
            setSavedAt(null);
            setHasReviewedThisMonth(false);
            setIsReviewEnabled(isReviewPeriod);
          }
        } else {
          // No stored review
          setHasReviewedThisMonth(false);
          setIsReviewEnabled(isReviewPeriod);
        }
      } catch (e) {
        console.error("[MonthReview] Failed to check review status:", e);
        setIsReviewEnabled(false);
      }
    };

    checkReviewStatus();

    // Set up interval to check time every minute
    const interval = setInterval(checkReviewStatus, 60000);

    return () => clearInterval(interval);
  }, []);

  // Load username for the prompt payload
  useEffect(() => {
    (async () => {
      try {
        const name = await AsyncStorage.getItem("fullName");
        const uname = await AsyncStorage.getItem("username");
        setUsername((name || uname || "").trim());
      } catch (e) {
        console.error("[MonthReview] Failed to load profile:", e);
      }
    })();
  }, []);

  const monthlyByWeek = useMemo(
    () => groupByWeekOfMonth(monthlyTasks),
    [monthlyTasks]
  );

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

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const text = result.text ?? "No response received.";
      const generatedAt = new Date().toISOString();

      setResult(text);
      setSavedAt(generatedAt);
      setHasReviewedThisMonth(true);

      // Persist the generated review to local storage
      const toStore: StoredReview = { text, generatedAt };
      await AsyncStorage.setItem(STORAGE_KEYS.month, JSON.stringify(toStore));
    } catch (e: any) {
      console.error("[MonthReview] Gemini error:", e);
      setError(e?.message || "Something went wrong generating your review.");
    } finally {
      setLoading(false);
    }
  }, [username, monthlyProgress, monthlyTasks, monthlyByWeek, isReviewEnabled, hasReviewedThisMonth]);

  // Get button status message
  const getButtonStatus = () => {
    if (hasReviewedThisMonth) {
      return "Review already generated for this month";
    }
    
    const now = new Date();
    const currentDay = now.getDate();
    const currentHour = now.getHours();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Get last day of current month
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const lastDay = lastDayOfMonth.getDate();

    // Get first day of next month
    const firstDayOfNextMonth = new Date(currentYear, currentMonth + 1, 1);
    const isFirstDayNextMonth = currentDay === 1 && now.getMonth() === firstDayOfNextMonth.getMonth();

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
  };

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
          colors={(!isReviewEnabled || hasReviewedThisMonth) ? [C.textSecondary, C.textSecondary] : C.accentGradient}
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
              <Text style={sharedStyles.generateBtnText}>
                {getButtonStatus()}
              </Text>
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