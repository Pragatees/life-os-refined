// app/(task)/week_review.tsx
//
// Child screen for the "Week" review tab. Theme is passed down from the
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
  groupByDate,
  ReviewOutput,
  StatBox,
  sharedStyles,
  STORAGE_KEYS,
  StoredReview,
} from "./ai_review";

interface WeekReviewProps {
  theme: Theme;
}

export default function WeekReview({ theme }: WeekReviewProps) {
  const C = colorsForTheme(theme);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [isReviewEnabled, setIsReviewEnabled] = useState(false);
  const [hasReviewedThisWeek, setHasReviewedThisWeek] = useState(false);

  const {
    weeklyTasks,
    weeklyProgress,
    initializeProgress,
  } = useProgressStore();

  // Load progress once (store handles caching internally)
  useEffect(() => {
    initializeProgress();
  }, [initializeProgress]);

  // Check time constraints and review status for week
  useEffect(() => {
    const checkReviewStatus = async () => {
      try {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinutes;

        // Get current day of week (0 = Sunday, 6 = Saturday)
        const currentDay = now.getDay();
        
        // Sunday is 0, Monday is 1, ..., Saturday is 6
        // Week review should be available from Saturday 9 PM to Sunday 11:59 PM
        const isSaturday = currentDay === 6;
        const isSunday = currentDay === 0;
        
        // Saturday 9 PM = 21:00 = 1260 minutes
        // Sunday 11:59 PM = 23:59 = 1439 minutes
        const SATURDAY_NINE_PM = 21 * 60; // 1260
        const SUNDAY_ELEVEN_PM = 23 * 60 + 59; // 1439

        // Check if it's Saturday after 9 PM or Sunday
        const isReviewPeriod = (isSaturday && currentTimeInMinutes >= SATURDAY_NINE_PM) || 
                             (isSunday && currentTimeInMinutes <= SUNDAY_ELEVEN_PM);

        // Get current week start date (Monday)
        const getWeekStart = (date: Date) => {
          const d = new Date(date);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
          d.setDate(diff);
          d.setHours(0, 0, 0, 0);
          return d;
        };

        const weekStart = getWeekStart(now);
        const weekStartStr = weekStart.toISOString().split('T')[0];

        // Check if there's a stored review
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.week);
        if (raw) {
          const stored: StoredReview = JSON.parse(raw);
          const storedDate = new Date(stored.generatedAt);
          const storedWeekStart = getWeekStart(storedDate);
          const storedWeekStartStr = storedWeekStart.toISOString().split('T')[0];

          // Check if review was generated for this week
          const isThisWeek = storedWeekStartStr === weekStartStr;

          if (isThisWeek) {
            // Review exists for this week
            setHasReviewedThisWeek(true);
            setResult(stored.text);
            setSavedAt(stored.generatedAt);
            
            // Enable only if during review period
            setIsReviewEnabled(isReviewPeriod);
          } else {
            // Review is from a previous week, should be deleted
            await AsyncStorage.removeItem(STORAGE_KEYS.week);
            setResult(null);
            setSavedAt(null);
            setHasReviewedThisWeek(false);
            setIsReviewEnabled(isReviewPeriod);
          }
        } else {
          // No stored review
          setHasReviewedThisWeek(false);
          setIsReviewEnabled(isReviewPeriod);
        }
      } catch (e) {
        console.error("[WeekReview] Failed to check review status:", e);
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
        console.error("[WeekReview] Failed to load profile:", e);
      }
    })();
  }, []);

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

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const text = result.text ?? "No response received.";
      const generatedAt = new Date().toISOString();

      setResult(text);
      setSavedAt(generatedAt);
      setHasReviewedThisWeek(true);

      // Persist the generated review to local storage
      const toStore: StoredReview = { text, generatedAt };
      await AsyncStorage.setItem(STORAGE_KEYS.week, JSON.stringify(toStore));
    } catch (e: any) {
      console.error("[WeekReview] Gemini error:", e);
      setError(e?.message || "Something went wrong generating your review.");
    } finally {
      setLoading(false);
    }
  }, [username, weeklyProgress, weeklyTasks, weeklyByDate, isReviewEnabled, hasReviewedThisWeek]);

  // Get button status message
  const getButtonStatus = () => {
    if (hasReviewedThisWeek) {
      return "Review already generated for this week";
    }
    
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    
    if (currentDay === 6) { // Saturday
      if (currentHour < 21) {
        return `Available tonight at 9 PM (${21 - currentHour}h remaining)`;
      }
      return "Generate Week Review";
    } else if (currentDay === 0) { // Sunday
      return "Generate Week Review";
    } else {
      // Monday to Friday
      const daysUntilSaturday = 6 - currentDay;
      return `Available Saturday at 9 PM (${daysUntilSaturday}d remaining)`;
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
          colors={(!isReviewEnabled || hasReviewedThisWeek) ? [C.textSecondary, C.textSecondary] : C.accentGradient}
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