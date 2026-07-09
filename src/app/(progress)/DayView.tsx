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

import { DailyProgress, Task } from "../../types/task";

interface DayViewProps {
  date: string;
  tasks: Task[];
  progress: DailyProgress;
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
  tasks,
  progress,
  theme = "dark",
}: DayViewProps) {
  const C = theme === "dark" ? DARK : BRIGHT;

  /**
   * Sort tasks by time.
   *
   * Example:
   * 06:00
   * 09:30
   * 14:00
   * 18:30
   */
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      return a.taskTime.localeCompare(b.taskTime);
    });
  }, [tasks]);

  /**
   * Progress Width
   */
  const progressWidth = useMemo(() => {
    return `${progress.percentage}%`;
  }, [progress]);

  /**
   * Empty Day
   */
  const isEmpty = sortedTasks.length === 0;

  /**
   * Priority Color
   */
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

  /**
   * Render Single Task
   */
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

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: C.background,
        },
      ]}
    >
      {/* Progress Card */}
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
          {date}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: C.text }]}>
              {progress.total}
            </Text>

            <Text style={[styles.statLabel, { color: C.secondary }]}>
              Total
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: C.success }]}>
              {progress.completed}
            </Text>

            <Text style={[styles.statLabel, { color: C.secondary }]}>
              Completed
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: C.high }]}>
              {progress.pending}
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
                // cast to any to satisfy TypeScript DimensionValue typing for percentage strings
                width: (`${progress.percentage}%`) as any,
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
          {progress.percentage}% Completed
        </Text>
      </View>

      {/* Empty State */}
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
          keyExtractor={(item) => item.id}
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
});