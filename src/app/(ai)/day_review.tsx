// app/(task)/day_review.tsx
//
// Child screen for the "Day" review tab. Theme is passed down from the
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
import { useNotesStore } from "../../store/notes";
import { getTodayDateString } from "../../services/notificationService";

import {
  Theme,
  colorsForTheme,
  ai,
  getToken,
  buildPrompt,
  groupByDate,
  ReviewOutput,
  StatBox,
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
    initializeProgress,
  } = useProgressStore();

  const { getNote } = useNotesStore();

  // Load progress once (store handles caching internally)
  useEffect(() => {
    initializeProgress();
  }, [initializeProgress]);

  // Check time constraints and review status
  useEffect(() => {
    const checkReviewStatus = async () => {
      try {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinutes;

        // 9 PM = 21:00 = 1260 minutes
        // 1 PM = 13:00 = 780 minutes (next day)
        const NINE_PM = 21 * 60; // 1260
        const ONE_PM = 13 * 60; // 780

        // Check if current time is after 9 PM
        const isAfter9PM = currentTimeInMinutes >= NINE_PM;

        // Check if there's a stored review
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.day);
        if (raw) {
          const stored: StoredReview = JSON.parse(raw);
          const storedDate = new Date(stored.generatedAt);
          const todayStr = getTodayDateString();
          const storedDateStr = storedDate.toISOString().split('T')[0];

          // Check if review was generated today
          const isToday = storedDateStr === todayStr;

          // Check if it's past 1 PM (when we should delete yesterday's review)
          const isPast1PM = currentTimeInMinutes >= ONE_PM;

          if (isToday) {
            // Review exists for today
            setHasReviewedToday(true);
            setResult(stored.text);
            setSavedAt(stored.generatedAt);
            
            // Enable only if after 9 PM (allow viewing, but not regenerating)
            setIsReviewEnabled(isAfter9PM);
          } else if (!isToday && isPast1PM) {
            // Yesterday's review should be deleted after 1 PM
            await AsyncStorage.removeItem(STORAGE_KEYS.day);
            setResult(null);
            setSavedAt(null);
            setHasReviewedToday(false);
            setIsReviewEnabled(isAfter9PM);
          } else {
            // Before 1 PM, keep yesterday's review visible but disable generation
            setResult(stored.text);
            setSavedAt(stored.generatedAt);
            setHasReviewedToday(false);
            setIsReviewEnabled(false);
          }
        } else {
          // No stored review
          setHasReviewedToday(false);
          setIsReviewEnabled(isAfter9PM);
        }
      } catch (e) {
        console.error("[DayReview] Failed to check review status:", e);
        setIsReviewEnabled(false);
      }
    };

    checkReviewStatus();

    // Set up interval to check time every minute
    const interval = setInterval(checkReviewStatus, 60000);

    return () => clearInterval(interval);
  }, []);

  // Load username + today's note
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

      // Persist the generated review to local storage
      const toStore: StoredReview = { text, generatedAt };
      await AsyncStorage.setItem(STORAGE_KEYS.day, JSON.stringify(toStore));
    } catch (e: any) {
      console.error("[DayReview] Gemini error:", e);
      setError(e?.message || "Something went wrong generating your review.");
    } finally {
      setLoading(false);
    }
  }, [username, dailyProgress, dailyTasks, todaysNote, dailyByDate, isReviewEnabled, hasReviewedToday]);

  // Get button status message
  const getButtonStatus = () => {
    const now = new Date();
    const currentHour = now.getHours();
    
    if (hasReviewedToday) {
      return "Review already generated for today";
    }
    
    if (currentHour < 21) {
      return `Available after 9 PM (${21 - currentHour}h remaining)`;
    }
    
    return "Generate Review";
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
        <Text style={[sharedStyles.cardLabel, { color: C.textSecondary }]}>Today</Text>

        <View style={sharedStyles.statsGrid}>
          <StatBox label="Total" value={dailyProgress.totalTasks} C={C} />
          <StatBox label="Completed" value={dailyProgress.completedTasks} C={C} color={C.success} />
          <StatBox label="Pending" value={dailyProgress.pendingTasks} C={C} color={C.warning} />
          <StatBox label="Overdue" value={dailyProgress.overdueTasks} C={C} color={C.danger} />
        </View>

        <View style={[sharedStyles.progressBarTrack, { backgroundColor: C.surfaceAlt }]}>
          <View
            style={[
              sharedStyles.progressBarFill,
              {
                width: `${dailyProgress.completionRate}%`,
                backgroundColor: C.accent,
              },
            ]}
          />
        </View>
        <Text style={[sharedStyles.completionText, { color: C.textPrimary }]}>
          {dailyProgress.completionRate}% completion
        </Text>

        <View style={[sharedStyles.noteBox, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
          <Ionicons name="document-text-outline" size={14} color={C.accent} />
          <Text style={[sharedStyles.noteText, { color: C.textSecondary }]} numberOfLines={2}>
            {todaysNote ? todaysNote : "No note written for today yet."}
          </Text>
        </View>
      </View>

      {/* ── Generate Button ── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleGenerateReview}
        disabled={loading || !isReviewEnabled || hasReviewedToday}
        style={sharedStyles.generateBtnWrap}
      >
        <LinearGradient
          colors={(!isReviewEnabled || hasReviewedToday) ? [C.textSecondary, C.textSecondary] : C.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={sharedStyles.generateBtn}
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
              <Text style={sharedStyles.generateBtnText}>
                {loading ? "Generating..." : getButtonStatus()}
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
              Your Review
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