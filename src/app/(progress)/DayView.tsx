// DayView.tsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { Task } from "../../types/task";
import { useProgressStore } from "../../store/progress";
import { getTodayDateString, formatDate } from "../../utils/date";

interface DayViewProps {
  date: string;
  theme?: "dark" | "bright";
}

type ThemeColors = {
  background: string;
  surface: string;
  border: string;
  text: string;
  secondary: string;
  accent: string;
  high: string;
  medium: string;
  low: string;
  success: string;
};

const DARK: ThemeColors = {
  background: "#0A0A0B",
  surface: "#18181B",
  border: "#28282C",
  text: "#F5F5F4",
  secondary: "#9B9B9F",
  accent: "#FF8A3D",
  high: "#FF5B5B",
  medium: "#FFC24B",
  low: "#3DD68C",
  success: "#22C55E",
};

const BRIGHT: ThemeColors = {
  background: "#F4F4F5",
  surface: "#FFFFFF",
  border: "#E6E6E9",
  text: "#1C1C1E",
  secondary: "#7A7A80",
  accent: "#FF7A2F",
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#10B981",
  success: "#16A34A",
};

export default function DayView({
  date,
  theme = "dark",
}: DayViewProps) {
  const C = theme === "dark" ? DARK : BRIGHT;

  // Get today's date in the correct format using our utility
  const today = getTodayDateString();
  const isToday = date === today;

  // ── Today's data comes straight from the progress store ───────────────────
  const {
    dailyTasks,
    dailyProgress,
    dailyLoading,
    dailyError,
    fetchDailyProgress,
    refreshRange,
  } = useProgressStore();

  // ── Non-today dates are fetched on demand into local state ────────────────
  // The progress store's daily/weekly/monthly caches only ever hold data for
  // today/this-week/this-month, so viewing an arbitrary past or future date
  // needs its own fetch. refreshRange() hits the same /tasks/range endpoint
  // but only writes into the store's daily/weekly/monthly slots when the
  // range matches one of those exactly — for a single arbitrary date it
  // just returns the tasks, which we keep here locally.
  const [rangeTasks, setRangeTasks] = useState<Task[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Guards against a stale response overwriting state if `date` changes
  // again before the previous fetch resolves.
  const requestIdRef = useRef(0);

  const loadRangeForDate = (targetDate: string) => {
    const requestId = ++requestIdRef.current;
    setRangeLoading(true);
    setRangeError(null);

    refreshRange(targetDate, targetDate)
      .then((tasks) => {
        if (requestIdRef.current !== requestId) return; // stale response
        setRangeTasks(tasks);
        setRangeLoading(false);
      })
      .catch((err) => {
        if (requestIdRef.current !== requestId) return; // stale response
        setRangeError(
          err instanceof Error ? err.message : "Unable to load tasks for this day."
        );
        setRangeLoading(false);
      });
  };

  useEffect(() => {
    if (isToday) {
      // Today is handled by the shared daily progress slice; make sure it's
      // populated/fresh.
      fetchDailyProgress();
      return;
    }

    loadRangeForDate(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, isToday]);

  // ── Unified view of tasks/loading/error for the selected date ─────────────
  const dayTasks = isToday ? dailyTasks : rangeTasks;
  const loading = isToday ? dailyLoading : rangeLoading;
  const error = isToday ? dailyError : rangeError;

  // Sort tasks by time
  const sortedTasks = useMemo(() => {
    return [...dayTasks].sort((a, b) => {
      return a.taskTime.localeCompare(b.taskTime);
    });
  }, [dayTasks]);

  // Calculate progress for the selected day
  const dayProgressData = useMemo(() => {
    // If selected date is today, use the store's progress summary
    if (isToday) {
      return {
        total: dailyProgress.totalTasks,
        completed: dailyProgress.completedTasks,
        pending: dailyProgress.pendingTasks,
        overdue: dailyProgress.overdueTasks,
        completionRate: dailyProgress.completionRate,
      };
    }

    // For other dates, calculate from the fetched range tasks
    const total = dayTasks.length;
    const completed = dayTasks.filter((task) => task.completed).length;
    const pending = total - completed;

    // Check overdue tasks for this specific date
    const overdue = dayTasks.filter(
      (task) => !task.completed && task.taskDate < today
    ).length;

    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

    return {
      total,
      completed,
      pending,
      overdue,
      completionRate: percentage,
    };
  }, [dayTasks, dailyProgress, isToday, today]);

  const isEmpty = sortedTasks.length === 0;

  const handleRetry = () => {
    if (isToday) {
      fetchDailyProgress(true);
    } else {
      loadRangeForDate(date);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "HIGH":
        return C.high;
      case "MEDIUM":
        return C.medium;
      case "LOW":
        return C.low;
      default:
        return C.secondary;
    }
  };

  const formatDisplayDate = (dateString: string) => {
    // Parse date in local time to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const renderTask = (item: Task) => {
    return (
      <View
        key={item.id.toString()}
        style={[
          styles.taskCard,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
          },
        ]}
      >
        <View style={styles.taskHeader}>
          <View style={styles.taskLeft}>
            <Ionicons
              name={item.completed ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={item.completed ? C.success : C.secondary}
            />

            <View style={styles.taskContent}>
              <Text
                style={[
                  styles.taskTitle,
                  {
                    color: C.text,
                    textDecorationLine: item.completed ? "line-through" : "none",
                  },
                ]}
              >
                {item.taskName}
              </Text>

              {item.description ? (
                <Text
                  style={[
                    styles.taskDescription,
                    {
                      color: C.secondary,
                    },
                  ]}
                >
                  {item.description}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.taskRight}>
            <Text
              style={[
                styles.time,
                {
                  color: C.text,
                },
              ]}
            >
              {item.taskTime}
            </Text>

            <View
              style={[
                styles.priorityBadge,
                {
                  backgroundColor: getPriorityColor(item.priority),
                },
              ]}
            >
              <Text style={styles.priorityText}>{item.priority}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Loading state
  if (loading) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: C.background,
          },
        ]}
      >
        <View
          style={[
            styles.progressCard,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
            },
          ]}
        >
          <Text style={[styles.date, { color: C.text }]}>
            {formatDisplayDate(date)}
          </Text>
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: C.secondary }]}>
              Loading tasks...
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Error state with retry
  if (error) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: C.background,
          },
        ]}
      >
        <View
          style={[
            styles.progressCard,
            {
              backgroundColor: C.surface,
              borderColor: C.border,
            },
          ]}
        >
          <Text style={[styles.date, { color: C.text }]}>
            {formatDisplayDate(date)}
          </Text>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={C.high} />
            <Text style={[styles.errorText, { color: C.high }]}>
              {error}
            </Text>
            <TouchableOpacity
              style={[
                styles.retryButton,
                {
                  backgroundColor: C.accent,
                },
              ]}
              onPress={handleRetry}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Main view
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: C.background,
        },
      ]}
    >
      <View
        style={[
          styles.progressCard,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
          },
        ]}
      >
        <Text
          style={[
            styles.date,
            {
              color: C.text,
            },
          ]}
        >
          {formatDisplayDate(date)}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: C.text }]}>
              {dayProgressData.total}
            </Text>
            <Text style={[styles.statLabel, { color: C.secondary }]}>
              Total
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: C.success }]}>
              {dayProgressData.completed}
            </Text>
            <Text style={[styles.statLabel, { color: C.secondary }]}>
              Completed
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: C.high }]}>
              {dayProgressData.pending}
            </Text>
            <Text style={[styles.statLabel, { color: C.secondary }]}>
              Pending
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: C.accent }]}>
              {dayProgressData.overdue || 0}
            </Text>
            <Text style={[styles.statLabel, { color: C.secondary }]}>
              Overdue
            </Text>
          </View>
        </View>

        <View style={[styles.progressBackground, { backgroundColor: C.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${dayProgressData.completionRate}%`,
                backgroundColor: C.accent,
              },
            ]}
          />
        </View>

        <Text
          style={[
            styles.percentage,
            {
              color: C.text,
            },
          ]}
        >
          {dayProgressData.completionRate}% Completed
        </Text>
      </View>

      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={60} color={C.secondary} />
          <Text
            style={[
              styles.emptyTitle,
              {
                color: C.text,
              },
            ]}
          >
            No Tasks
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              {
                color: C.secondary,
              },
            ]}
          >
            No tasks were scheduled for this day.
          </Text>
        </View>
      ) : (
        // Rendered with a plain map (not FlatList) because DayView already
        // lives inside HistoryScreen's outer ScrollView. Nesting a
        // VirtualizedList-backed FlatList inside a same-orientation
        // ScrollView breaks windowing and triggers an RN warning — since a
        // single day's task list is short, virtualization isn't needed here.
        <View style={styles.taskList}>
          {sortedTasks.map((item) => renderTask(item))}
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

  progressCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
  },

  date: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 18,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  statItem: {
    alignItems: "center",
    flex: 1,
  },

  statValue: {
    fontSize: 22,
    fontWeight: "700",
  },

  statLabel: {
    marginTop: 4,
    fontSize: 12,
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

  percentage: {
    textAlign: "right",
    fontWeight: "600",
  },

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

  taskList: {
    paddingBottom: 80,
  },

  taskCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },

  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  taskLeft: {
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
  },

  taskContent: {
    marginLeft: 10,
    flex: 1,
  },

  taskRight: {
    alignItems: "flex-end",
    marginLeft: 12,
  },

  taskTitle: {
    fontSize: 15,
    fontWeight: "600",
  },

  taskDescription: {
    marginTop: 4,
    fontSize: 12,
  },

  time: {
    fontSize: 13,
    marginBottom: 6,
  },

  priorityBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  priorityText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
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