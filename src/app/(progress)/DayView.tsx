// DayView.tsx

import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { Task } from "../../types/task";
import { useProgressStore } from "../../store/progress";

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

  // NOTE: DayView no longer fetches data itself.
  // Fetching is owned exclusively by ProgressScreen via
  // useProgressStore.getState().initializeProgress().
  // This component only reads from the store.
  const {
    dailyTasks,
    dailyProgress,
    loading,
    error,
    fetchDailyProgress, // still exposed for manual retry, not auto-called
  } = useProgressStore();

  const dayTasks = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    if (date === today) {
      return dailyTasks;
    }
    return dailyTasks.filter((task) => task.taskDate === date);
  }, [dailyTasks, date]);

  const sortedTasks = useMemo(() => {
    return [...dayTasks].sort((a, b) => {
      return a.taskTime.localeCompare(b.taskTime);
    });
  }, [dayTasks]);

  const dayProgressData = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    if (date === today) {
      return {
        total: dailyProgress.totalTasks,
        completed: dailyProgress.completedTasks,
        pending: dailyProgress.pendingTasks,
        completionRate: dailyProgress.completionRate,
      };
    }
    const total = dayTasks.length;
    const completed = dayTasks.filter((task) => task.completed).length;
    const pending = total - completed;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return {
      total,
      completed,
      pending,
      completionRate: percentage,
    };
  }, [dayTasks, dailyProgress, date]);

  const isEmpty = sortedTasks.length === 0;

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

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    return dateObj.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  const renderTask = ({ item }: { item: Task }) => {
    return (
      <View
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
            {formatDate(date)}
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
            {formatDate(date)}
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
              onPress={() => fetchDailyProgress(true)}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

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
          {formatDate(date)}
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
        </View>

        <View style={styles.progressBackground}>
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
        <FlatList
          data={sortedTasks}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderTask}
          contentContainerStyle={{
            paddingBottom: 80,
          }}
          showsVerticalScrollIndicator={false}
        />
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
    backgroundColor: "#2E2E32",
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