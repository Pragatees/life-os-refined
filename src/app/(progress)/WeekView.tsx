// WeekView.tsx

import React, { useMemo } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { DayProgress, WeeklyProgress } from "../../types/task";

// ─── Theme Tokens (Matches AddTaskComponent) ───────────────────────────────
type ThemeTokens = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentGradient: readonly [string, string];
  priorityHigh: string;  // Using same naming as AddTaskComponent
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
  priorityHigh: "#FF6B5B",   // danger
  priorityMed: "#FFC24B",    // warning
  priorityLow: "#3DD68C",    // success
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
  priorityHigh: "#EF5A4C",   // danger
  priorityMed: "#F0A93B",    // warning
  priorityLow: "#22B573",    // success
  shadowDark: "#B9B9C0",
};

export interface WeekViewProps {
  progress: WeeklyProgress;
  theme?: "dark" | "bright";
}

export default function WeekView({ progress, theme = "dark" }: WeekViewProps) {
  const C = theme === "bright" ? BRIGHT : DARK;

  const isEmpty = progress.totalTasks === 0;

  const progressWidth = useMemo(() => {
    const pct = Math.max(0, Math.min(100, progress.averagePercentage));
    return `${pct}%` as const;
  }, [progress.averagePercentage]);

  const sortedDays = useMemo(() => {
    return [...progress.dailyProgress].sort((a, b) => a.date.localeCompare(b.date));
  }, [progress.dailyProgress]);

  const getStatusColor = (percentage: number) => {
    if (percentage >= 80) return C.priorityLow;   // success
    if (percentage >= 50) return C.priorityMed;   // warning
    return C.priorityHigh;                         // danger
  };

  const renderDay = ({ item }: { item: DayProgress }) => {
    const color = getStatusColor(item.percentage);
    const clampedPct = Math.max(0, Math.min(100, item.percentage));

    const icon =
      item.percentage === 100
        ? "trophy"
        : item.percentage >= 80
        ? "checkmark-circle"
        : item.percentage >= 50
        ? "time"
        : "close-circle";

    return (
      <View
        style={[
          styles.dayCard,
          { 
            backgroundColor: C.surface, 
            borderColor: C.border, 
            shadowColor: C.shadowDark 
          },
        ]}
      >
        <View style={styles.dayHeader}>
          <View style={styles.dayHeaderLeft}>
            <View style={[styles.dayIconWrap, { backgroundColor: C.surfaceAlt }]}>
              <Ionicons name={icon} size={18} color={color} />
            </View>
            <View>
              <Text style={[styles.dayDate, { color: C.textPrimary }]}>
                {item.date}
              </Text>
              <Text style={[styles.dayStats, { color: C.textSecondary }]}>
                {item.completed}/{item.total} Completed
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

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      {/* ── Weekly Summary Card ── */}
      <View
        style={[
          styles.summaryCard,
          { 
            backgroundColor: C.surface, 
            borderColor: C.border, 
            shadowColor: C.shadowDark 
          },
        ]}
      >
        <Text style={[styles.eyebrow, { color: C.accent }]}>SUMMARY</Text>
        <Text style={[styles.title, { color: C.textPrimary }]}>Weekly Review</Text>

        <View style={styles.statsRow}>
          <View style={[styles.statClay, { backgroundColor: C.surfaceAlt }]}>
            <Text style={[styles.value, { color: C.textPrimary }]}>
              {progress.totalTasks}
            </Text>
            <Text style={[styles.label, { color: C.textSecondary }]}>Total</Text>
          </View>

          <View style={[styles.statClay, { backgroundColor: C.surfaceAlt }]}>
            <Text style={[styles.value, { color: C.priorityLow }]}>
              {progress.completedTasks}
            </Text>
            <Text style={[styles.label, { color: C.textSecondary }]}>Completed</Text>
          </View>

          <View style={[styles.statClay, { backgroundColor: C.surfaceAlt }]}>
            <Text style={[styles.value, { color: C.priorityHigh }]}>
              {progress.pendingTasks}
            </Text>
            <Text style={[styles.label, { color: C.textSecondary }]}>Pending</Text>
          </View>
        </View>

        <View style={[styles.progressBackground, { backgroundColor: C.surfaceAlt }]}>
          <LinearGradient
            colors={C.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: progressWidth }]}
          />
        </View>

        <Text style={[styles.average, { color: C.textPrimary }]}>
          Average Progress: {progress.averagePercentage}%
        </Text>
      </View>

      {/* ── Best / Worst Day ── */}
      {!isEmpty && (
        <View style={styles.insightRow}>
          <View
            style={[
              styles.insightCard,
              { 
                backgroundColor: C.surface, 
                borderColor: C.border, 
                shadowColor: C.shadowDark 
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
              {progress.bestDay?.date ?? "-"}
            </Text>
            <Text style={[styles.insightSub, { color: C.textSecondary }]}>
              {progress.bestDay?.percentage ?? 0}%
            </Text>
          </View>

          <View
            style={[
              styles.insightCard,
              { 
                backgroundColor: C.surface, 
                borderColor: C.border, 
                shadowColor: C.shadowDark 
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
              {progress.worstDay?.date ?? "-"}
            </Text>
            <Text style={[styles.insightSub, { color: C.textSecondary }]}>
              {progress.worstDay?.percentage ?? 0}%
            </Text>
          </View>
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
                shadowColor: C.shadowDark 
              }
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

// ─── Styles ─────────────────────────────────────────────────────────────
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

  dayStats: {
    marginTop: 2,
    fontSize: 12,
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
});