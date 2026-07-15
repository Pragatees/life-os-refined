// WeekView.tsx

import React, { useMemo } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { useProgressStore } from "../../store/progress";
import { getTodayDateString, formatDate, formatDateDisplay } from "../../utils/date";

// ─── Theme Tokens ───────────────────────────────────────────────
type ThemeTokens = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentGradient: readonly [string, string];
  priorityHigh: string;
  priorityMed: string;
  priorityLow: string;
  shadowDark: string;
};

const DARK: ThemeTokens = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  border: "#28282C",
  textPrimary: "#F5F5F4",
  textSecondary: "#9B9B9F",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"],
  priorityHigh: "#FF6B5B",
  priorityMed: "#FFC24B",
  priorityLow: "#3DD68C",
  shadowDark: "#000000",
};

const BRIGHT: ThemeTokens = {
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceAlt: "#EDEDEF",
  border: "#E6E6E9",
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  accent: "#FF7A2F",
  accentGradient: ["#FF8A3D", "#FF6B1F"],
  priorityHigh: "#EF5A4C",
  priorityMed: "#F0A93B",
  priorityLow: "#22B573",
  shadowDark: "#B9B9C0",
};

export interface WeekViewProps {
  theme?: "dark" | "bright";
}

export default function WeekView({ theme = "dark" }: WeekViewProps) {
  const C = theme === "bright" ? BRIGHT : DARK;

  // ── Progress Store ──────────────────────────────────────────────
  // Get weekly-specific state from the store
  const {
    weeklyTasks,
    weeklyProgress,
    weeklyLoading: loading,
    weeklyError: error,
    fetchWeeklyProgress,
  } = useProgressStore();

  // Get today's date in the correct format
  const today = getTodayDateString();

  // ── Daily Breakdown (computed from weeklyTasks) ──────────────
  const dailyBreakdown = useMemo(() => {
    const groups: Record<string, { total: number; completed: number; overdue: number }> = {};

    weeklyTasks.forEach((task) => {
      if (!groups[task.taskDate]) {
        groups[task.taskDate] = { total: 0, completed: 0, overdue: 0 };
      }
      groups[task.taskDate].total += 1;
      if (task.completed) {
        groups[task.taskDate].completed += 1;
      }
      // Check if task is overdue (not completed and date is in the past)
      if (!task.completed && task.taskDate < today) {
        groups[task.taskDate].overdue += 1;
      }
    });

    return Object.entries(groups).map(([date, { total, completed, overdue }]) => ({
      date,
      total,
      completed,
      overdue,
      percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
    }));
  }, [weeklyTasks, today]);

  // ── Sorted days ──────────────────────────────────────────────
  const sortedDays = useMemo(() => {
    return [...dailyBreakdown].sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyBreakdown]);

  // ── Average daily percentage ────────────────────────────────
  const averagePercentage = useMemo(() => {
    if (dailyBreakdown.length === 0) return 0;
    const sum = dailyBreakdown.reduce((acc, day) => acc + day.percentage, 0);
    return Math.round(sum / dailyBreakdown.length);
  }, [dailyBreakdown]);

  // ── Best & Worst Day ─────────────────────────────────────────
  // Rules:
  // 1. Only days that actually had tasks scheduled are eligible — an empty
  //    day isn't a "best" or "worst" day, it's just a non-event.
  // 2. Best day = highest completion %. If multiple days tie (e.g. Monday
  //    3/3 and Tuesday 3/3 are both 100%), the most recent of the tied days
  //    wins, since that's the freshest evidence of good performance.
  // 3. Worst day = lowest completion %. Ties go to the earliest of the tied
  //    days.
  // 4. If there's no day that's genuinely distinct from the best day (only
  //    one day has data, or every day is tied at the same percentage),
  //    there is no meaningful "worst" day — it's left as null and the UI
  //    renders nothing for it, rather than duplicating the best day or
  //    picking an arbitrary one.
  const { bestDay, worstDay } = useMemo(() => {
    const daysWithTasks = dailyBreakdown.filter((day) => day.total > 0);

    if (daysWithTasks.length === 0) {
      return { bestDay: null, worstDay: null };
    }

    const maxPercentage = Math.max(...daysWithTasks.map((d) => d.percentage));
    const minPercentage = Math.min(...daysWithTasks.map((d) => d.percentage));

    const bestCandidates = daysWithTasks.filter((d) => d.percentage === maxPercentage);
    const best = bestCandidates.reduce((latest, day) =>
      day.date > latest.date ? day : latest
    );

    const worstCandidates = daysWithTasks.filter((d) => d.percentage === minPercentage);
    const worst = worstCandidates.reduce((earliest, day) =>
      day.date < earliest.date ? day : earliest
    );

    // No distinct worst day: either only one day of data, or every day tied
    // at the same percentage (so "worst" would just be a duplicate of "best").
    if (daysWithTasks.length < 2 || best.date === worst.date) {
      return { bestDay: best, worstDay: null };
    }

    return { bestDay: best, worstDay: worst };
  }, [dailyBreakdown]);

  const isEmpty = weeklyTasks.length === 0;

  // ── Helpers ──────────────────────────────────────────────────
  const getStatusColor = (percentage: number) => {
    if (percentage >= 80) return C.priorityLow;
    if (percentage >= 50) return C.priorityMed;
    return C.priorityHigh;
  };

  const formatDisplayDate = (dateString: string) => {
    // Parse date in local time to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  // ── Render Day ──────────────────────────────────────────────
  const renderDay = ({ item }: { item: { date: string; total: number; completed: number; overdue: number; percentage: number } }) => {
    const color = getStatusColor(item.percentage);
    const clampedPct = Math.max(0, Math.min(100, item.percentage));

    let icon = "close-circle";
    let iconColor = C.priorityHigh;
    
    if (item.percentage === 100) {
      icon = "trophy";
      iconColor = C.priorityLow;
    } else if (item.percentage >= 80) {
      icon = "checkmark-circle";
      iconColor = C.priorityLow;
    } else if (item.percentage >= 50) {
      icon = "time";
      iconColor = C.priorityMed;
    }

    const isToday = item.date === today;

    return (
      <View
        style={[
          styles.dayCard,
          {
            backgroundColor: C.surface,
            borderColor: isToday ? C.accent : C.border,
            borderWidth: isToday ? 2 : 1,
            shadowColor: C.shadowDark,
          },
        ]}
      >
        <View style={styles.dayHeader}>
          <View style={styles.dayHeaderLeft}>
            <View style={[styles.dayIconWrap, { backgroundColor: C.surfaceAlt }]}>
              <Ionicons name={icon as any} size={18} color={iconColor} />
            </View>
            <View>
              <Text style={[styles.dayDate, { color: C.textPrimary }]}>
                {formatDisplayDate(item.date)}
                {isToday && (
                  <Text style={[styles.todayBadge, { color: C.accent }]}> • Today</Text>
                )}
              </Text>
              <Text style={[styles.dayStats, { color: C.textSecondary }]}>
                {item.completed}/{item.total} Completed
                {item.overdue > 0 && (
                  <Text style={[styles.overdueText, { color: C.priorityHigh }]}>
                    {' '}• {item.overdue} Overdue
                  </Text>
                )}
              </Text>
            </View>
          </View>

          <Text style={[styles.percent, { color }]}>{item.percentage}%</Text>
        </View>

        <View style={[styles.progressBackground, { backgroundColor: C.surfaceAlt }]}>
          <View
            style={[styles.progressFill, { width: `${clampedPct}%`, backgroundColor: color }]}
          />
        </View>
      </View>
    );
  };

  // ── Loading ──────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: C.bg }]}>
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
              shadowColor: C.shadowDark,
            },
          ]}
        >
          <Text style={[styles.eyebrow, { color: C.accent }]}>SUMMARY</Text>
          <Text style={[styles.title, { color: C.textPrimary }]}>Weekly Review</Text>
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: C.textSecondary }]}>
              Loading weekly data...
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: C.bg }]}>
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
              shadowColor: C.shadowDark,
            },
          ]}
        >
          <Text style={[styles.eyebrow, { color: C.accent }]}>SUMMARY</Text>
          <Text style={[styles.title, { color: C.textPrimary }]}>Weekly Review</Text>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={C.priorityHigh} />
            <Text style={[styles.errorText, { color: C.priorityHigh }]}>
              {error}
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: C.accent }]}
              onPress={() => fetchWeeklyProgress(true)}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Main Render ─────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      {/* ── Weekly Summary Card ── */}
      <View
        style={[
          styles.summaryCard,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
            shadowColor: C.shadowDark,
          },
        ]}
      >
        <Text style={[styles.eyebrow, { color: C.accent }]}>SUMMARY</Text>
        <Text style={[styles.title, { color: C.textPrimary }]}>Weekly Review</Text>

        <View style={styles.statsRow}>
          <View style={[styles.statClay, { backgroundColor: C.surfaceAlt }]}>
            <Text style={[styles.value, { color: C.textPrimary }]}>
              {weeklyProgress.totalTasks}
            </Text>
            <Text style={[styles.label, { color: C.textSecondary }]}>Total</Text>
          </View>

          <View style={[styles.statClay, { backgroundColor: C.surfaceAlt }]}>
            <Text style={[styles.value, { color: C.priorityLow }]}>
              {weeklyProgress.completedTasks}
            </Text>
            <Text style={[styles.label, { color: C.textSecondary }]}>Completed</Text>
          </View>

          <View style={[styles.statClay, { backgroundColor: C.surfaceAlt }]}>
            <Text style={[styles.value, { color: C.priorityHigh }]}>
              {weeklyProgress.pendingTasks}
            </Text>
            <Text style={[styles.label, { color: C.textSecondary }]}>Pending</Text>
          </View>

          <View style={[styles.statClay, { backgroundColor: C.surfaceAlt }]}>
            <Text style={[styles.value, { color: C.accent }]}>
              {weeklyProgress.overdueTasks || 0}
            </Text>
            <Text style={[styles.label, { color: C.textSecondary }]}>Overdue</Text>
          </View>
        </View>

        <View style={[styles.progressBackground, { backgroundColor: C.surfaceAlt }]}>
          <LinearGradient
            colors={C.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${averagePercentage}%` }]}
          />
        </View>

        <Text style={[styles.average, { color: C.textPrimary }]}>
          Average Progress: {averagePercentage}%
        </Text>
      </View>

      {/* ── Best / Worst Day ──
          Worst Day only renders when there's a day genuinely distinct from
          the best day. If every day is tied (or there's only one day of
          data), worstDay is null and nothing is rendered for it — no
          duplicate card, no arbitrary pick. */}
      {!isEmpty && bestDay && (
        <View style={styles.insightRow}>
          <View
            style={[
              styles.insightCard,
              {
                backgroundColor: C.surface,
                borderColor: C.border,
                shadowColor: C.shadowDark,
              },
            ]}
          >
            <View style={[styles.insightIconWrap, { backgroundColor: C.surfaceAlt }]}>
              <Ionicons name="arrow-up-circle" size={18} color={C.priorityLow} />
            </View>
            <Text style={[styles.insightTitle, { color: C.textSecondary }]}>
              Best Day
            </Text>
            <Text style={[styles.insightValue, { color: C.priorityLow }]}>
              {formatDisplayDate(bestDay.date)}
            </Text>
            <Text style={[styles.insightSub, { color: C.textSecondary }]}>
              {bestDay.percentage}% • {bestDay.completed}/{bestDay.total}
            </Text>
          </View>

          {worstDay && (
            <View
              style={[
                styles.insightCard,
                {
                  backgroundColor: C.surface,
                  borderColor: C.border,
                  shadowColor: C.shadowDark,
                },
              ]}
            >
              <View style={[styles.insightIconWrap, { backgroundColor: C.surfaceAlt }]}>
                <Ionicons name="arrow-down-circle" size={18} color={C.priorityHigh} />
              </View>
              <Text style={[styles.insightTitle, { color: C.textSecondary }]}>
                Worst Day
              </Text>
              <Text style={[styles.insightValue, { color: C.priorityHigh }]}>
                {formatDisplayDate(worstDay.date)}
              </Text>
              <Text style={[styles.insightSub, { color: C.textSecondary }]}>
                {worstDay.percentage}% • {worstDay.completed}/{worstDay.total}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Empty State ── */}
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <View
            style={[
              styles.emptyIconClay,
              {
                backgroundColor: C.surface,
                shadowColor: C.shadowDark,
              },
            ]}
          >
            <Ionicons name="calendar-clear-outline" size={48} color={C.textSecondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>
            No Weekly Data
          </Text>
          <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>
            There are no tasks available for this week.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedDays}
          keyExtractor={(item) => item.date}
          renderItem={renderDay}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 6,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  statClay: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 16,
  },
  value: {
    fontSize: 20,
    fontWeight: "800",
  },
  label: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "500",
  },
  progressBackground: {
    height: 10,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
    borderRadius: 20,
  },
  average: {
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
  },
  insightRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  insightCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 4,
  },
  insightIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  insightTitle: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  insightValue: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "800",
  },
  insightSub: {
    marginTop: 4,
    fontSize: 12,
  },
  dayCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dayHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dayIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dayDate: {
    fontSize: 15,
    fontWeight: "700",
  },
  todayBadge: {
    fontSize: 13,
    fontWeight: "600",
  },
  dayStats: {
    marginTop: 2,
    fontSize: 12,
  },
  overdueText: {
    fontWeight: "600",
  },
  percent: {
    fontSize: 15,
    fontWeight: "800",
  },
  listContent: {
    paddingBottom: 80,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  emptyIconClay: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  emptySubtitle: {
    marginTop: 10,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 22,
  },
  loadingContainer: {
    padding: 20,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
  },
  errorContainer: {
    padding: 20,
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    marginTop: 10,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: "#FFF",
    fontWeight: "600",
  },
});