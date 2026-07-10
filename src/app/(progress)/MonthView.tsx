// MonthView.tsx

import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { useProgressStore } from "../../store/progress";

interface MonthViewProps {
  theme?: "dark" | "bright";
}

type ThemeColors = {
  background: string;
  surface: string;
  border: string;
  text: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  empty: string;
};

const DARK: ThemeColors = {
  background: "#0A0A0B",
  surface: "#18181B",
  border: "#28282C",
  text: "#F5F5F4",
  secondary: "#9B9B9F",
  accent: "#FF8A3D",
  success: "#22C55E",
  warning: "#FACC15",
  danger: "#EF4444",
  empty: "#3A3A3F",
};

const BRIGHT: ThemeColors = {
  background: "#F4F4F5",
  surface: "#FFFFFF",
  border: "#E6E6E9",
  text: "#1C1C1E",
  secondary: "#7A7A80",
  accent: "#FF7A2F",
  success: "#16A34A",
  warning: "#F59E0B",
  danger: "#DC2626",
  empty: "#E4E4E7",
};

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

// Zero-padded local date string, e.g. "2026-07-10" — built from local
// Y/M/D components (not toISOString) so it never shifts a day due to UTC.
const toDateKey = (year: number, month: number, day: number) => {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

export default function MonthView({
  theme = "dark",
}: MonthViewProps) {
  const C = theme === "dark" ? DARK : BRIGHT;

  // Get data from progress store.
  // NOTE: MonthView no longer fetches data itself. Fetching is owned
  // exclusively by the parent ProgressScreen via
  // useProgressStore.getState().initializeProgress(). This component
  // only reads from the store.
  const {
    monthlyTasks,
    monthlyProgress,
    loading,
    error,
    fetchMonthlyProgress, // still exposed for manual retry, not auto-called
  } = useProgressStore();

  /**
   * Map each date (that has tasks) to its completion stats.
   */
  const dayStatsMap = useMemo(() => {
    const map: Record<
      string,
      { total: number; completed: number; percentage: number }
    > = {};

    monthlyTasks.forEach((task) => {
      const date = task.taskDate;
      if (!map[date]) {
        map[date] = { total: 0, completed: 0, percentage: 0 };
      }
      map[date].total += 1;
      if (task.completed) {
        map[date].completed += 1;
      }
    });

    Object.keys(map).forEach((date) => {
      const entry = map[date];
      entry.percentage =
        entry.total === 0 ? 0 : Math.round((entry.completed / entry.total) * 100);
    });

    return map;
  }, [monthlyTasks]);

  /**
   * Build the calendar grid for the current month: leading/trailing
   * blanks so the first day lines up under the correct weekday
   * (Monday-first, matching the store's week range logic), plus one
   * cell per day of the month.
   */
  const { calendarCells, monthLabel, todayKey } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Convert JS getDay() (Sun=0..Sat=6) to Monday-first offset (Mon=0..Sun=6)
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;

    type Cell =
      | { type: "blank"; key: string }
      | {
          type: "day";
          key: string;
          day: number;
          total: number;
          completed: number;
          percentage: number;
          hasTasks: boolean;
        };

    const cells: Cell[] = [];

    for (let i = 0; i < leadingBlanks; i++) {
      cells.push({ type: "blank", key: `lead-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = toDateKey(year, month, day);
      const stats = dayStatsMap[dateKey];

      cells.push({
        type: "day",
        key: dateKey,
        day,
        total: stats?.total ?? 0,
        completed: stats?.completed ?? 0,
        percentage: stats?.percentage ?? 0,
        hasTasks: !!stats,
      });
    }

    // Pad the end so the grid is a clean multiple of 7.
    while (cells.length % 7 !== 0) {
      cells.push({ type: "blank", key: `trail-${cells.length}` });
    }

    const label = firstOfMonth.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    return {
      calendarCells: cells,
      monthLabel: label,
      todayKey: toDateKey(year, month, now.getDate()),
    };
  }, [dayStatsMap]);

  const isEmpty = monthlyTasks.length === 0;

  /**
   * Calendar cell color based on completion percentage.
   */
  const getCellColor = (hasTasks: boolean, percentage: number) => {
    if (!hasTasks) return C.empty;
    if (percentage >= 80) return C.success;
    if (percentage >= 50) return C.warning;
    return C.danger;
  };

  // Show loading state
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: C.surface, borderColor: C.border },
          ]}
        >
          <Text style={[styles.title, { color: C.text }]}>Monthly Review</Text>
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: C.secondary }]}>
              Loading monthly data...
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: C.surface, borderColor: C.border },
          ]}
        >
          <Text style={[styles.title, { color: C.text }]}>Monthly Review</Text>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={C.danger} />
            <Text style={[styles.errorText, { color: C.danger }]}>{error}</Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: C.accent }]}
              onPress={() => fetchMonthlyProgress(true)}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Monthly Summary */}
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: C.surface, borderColor: C.border },
        ]}
      >
        <Text style={[styles.title, { color: C.text }]}>{monthLabel}</Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.value, { color: C.text }]}>
              {monthlyProgress.totalTasks}
            </Text>
            <Text style={[styles.label, { color: C.secondary }]}>Total</Text>
          </View>

          <View style={styles.stat}>
            <Text style={[styles.value, { color: C.success }]}>
              {monthlyProgress.completedTasks}
            </Text>
            <Text style={[styles.label, { color: C.secondary }]}>Completed</Text>
          </View>

          <View style={styles.stat}>
            <Text style={[styles.value, { color: C.danger }]}>
              {monthlyProgress.pendingTasks}
            </Text>
            <Text style={[styles.label, { color: C.secondary }]}>Pending</Text>
          </View>
        </View>

        <View style={[styles.progressBackground, { backgroundColor: C.empty }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${monthlyProgress.completionRate}%`,
                backgroundColor: C.accent,
              },
            ]}
          />
        </View>

        <Text style={[styles.average, { color: C.text }]}>
          Average Progress : {monthlyProgress.completionRate ?? 0}%
        </Text>
      </View>

      {/* Empty Month */}
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color={C.secondary} />
          <Text style={[styles.emptyTitle, { color: C.text }]}>
            No Monthly Data
          </Text>
          <Text style={[styles.emptySubtitle, { color: C.secondary }]}>
            There are no completed or pending tasks for this month.
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.calendarCard,
            { backgroundColor: C.surface, borderColor: C.border },
          ]}
        >
          {/* Weekday header row */}
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <View key={`wd-${i}`} style={styles.weekdayCell}>
                <Text style={[styles.weekdayLabel, { color: C.secondary }]}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.grid}>
            {calendarCells.map((cell) => {
              if (cell.type === "blank") {
                return <View key={cell.key} style={styles.dayCellWrap} />;
              }

              const color = getCellColor(cell.hasTasks, cell.percentage);
              const isToday = cell.key === todayKey;

              return (
                <View key={cell.key} style={styles.dayCellWrap}>
                  <View
                    style={[
                      styles.dayCell,
                      {
                        backgroundColor: cell.hasTasks ? color : "transparent",
                        borderColor: isToday ? C.accent : color,
                        borderWidth: isToday ? 2 : cell.hasTasks ? 0 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        {
                          color: cell.hasTasks ? "#FFFFFF" : C.secondary,
                          fontWeight: isToday ? "800" : "600",
                        },
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: C.success }]} />
              <Text style={[styles.legendLabel, { color: C.secondary }]}>
                80%+
              </Text>
            </View>

            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: C.warning }]} />
              <Text style={[styles.legendLabel, { color: C.secondary }]}>
                50–79%
              </Text>
            </View>

            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: C.danger }]} />
              <Text style={[styles.legendLabel, { color: C.secondary }]}>
                &lt;50%
              </Text>
            </View>

            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: "transparent", borderWidth: 1, borderColor: C.empty },
                ]}
              />
              <Text style={[styles.legendLabel, { color: C.secondary }]}>
                No tasks
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },

  summaryCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 18,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  stat: {
    flex: 1,
    alignItems: "center",
  },

  value: {
    fontSize: 22,
    fontWeight: "700",
  },

  label: {
    marginTop: 4,
    fontSize: 12,
  },

  progressBackground: {
    height: 10,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 12,
  },

  progressFill: {
    height: "100%",
    borderRadius: 20,
  },

  average: {
    textAlign: "right",
    fontWeight: "600",
  },

  // ── Calendar Grid ──────────────────────────────────────────────

  calendarCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
  },

  weekdayRow: {
    flexDirection: "row",
    marginBottom: 8,
  },

  weekdayCell: {
    width: "14.2857%",
    alignItems: "center",
  },

  weekdayLabel: {
    fontSize: 11,
    fontWeight: "700",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  dayCellWrap: {
    width: "14.2857%",
    aspectRatio: 1,
    padding: 3,
  },

  dayCell: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  dayNumber: {
    fontSize: 13,
  },

  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 14,
    gap: 14,
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  legendLabel: {
    fontSize: 11,
    fontWeight: "600",
  },

  // ── Empty / Loading / Error ────────────────────────────────────

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },

  emptyTitle: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: "700",
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