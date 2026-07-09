// MonthView.tsx

import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  type ViewStyle,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";

import {
  CalendarData,
  MonthlyProgress,
  Task,
} from "../../types/task";

interface MonthViewProps {
  progress: MonthlyProgress;
  calendarData: CalendarData;
  groupedTasks: Record<string, Task[]>;
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
  empty: "#D4D4D8",
};

export default function MonthView({
  progress,
  calendarData,
  groupedTasks,
  theme = "dark",
}: MonthViewProps) {
  const C = theme === "dark" ? DARK : BRIGHT;

  /**
   * Empty Month
   */
  const isEmpty = progress.totalTasks === 0;

  /**
   * Progress Width
   */
  const progressWidth = useMemo(() => {
    return `${progress.averagePercentage}%`;
  }, [progress.averagePercentage]);

  /**
   * Calendar Entries
   */
  const calendarEntries = useMemo(() => {
    return Object.entries(calendarData).sort(
      ([a], [b]) => a.localeCompare(b)
    );
  }, [calendarData]);

  /**
   * Calendar Color
   */
  const getCalendarColor = (percentage: number) => {
    if (percentage >= 80) return C.success;
    if (percentage >= 50) return C.warning;
    if (percentage > 0) return C.danger;
    return C.empty;
  };

  /**
   * Render Calendar Item
   */
  const renderCalendarDay = ({ item }: { item: [string, number] }) => {
    const [date, percentage] = item;
    const taskCount = groupedTasks[date]?.length ?? 0;

    return (
      <View
        style={[
          styles.dayCard,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
          },
        ]}
      >
        <View style={styles.dayHeader}>
          <View>
            <Text
              style={[
                styles.dayDate,
                {
                  color: C.text,
                },
              ]}
            >
              {date}
            </Text>

            <Text
              style={[
                styles.dayTasks,
                {
                  color: C.secondary,
                },
              ]}
            >
              {taskCount} Task{taskCount !== 1 ? "s" : ""}
            </Text>
          </View>

          <Ionicons
            name="calendar"
            size={26}
            color={getCalendarColor(percentage)}
          />
        </View>

        <View style={styles.progressBackground}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${percentage}%`,
                backgroundColor: getCalendarColor(percentage),
              },
            ]}
          />
        </View>

        <Text
          style={[
            styles.percent,
            {
              color: getCalendarColor(percentage),
            },
          ]}
        >
          {percentage}%
        </Text>
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
      {/* Monthly Summary */}
      <View
        style={[
          styles.summaryCard,
          {
            backgroundColor: C.surface,
            borderColor: C.border,
          },
        ]}
      >
        <Text
          style={[
            styles.title,
            {
              color: C.text,
            },
          ]}
        >
          Monthly Review
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.value, { color: C.text }]}>
              {progress.totalTasks}
            </Text>

            <Text style={[styles.label, { color: C.secondary }]}>
              Total
            </Text>
          </View>

          <View style={styles.stat}>
            <Text style={[styles.value, { color: C.success }]}>
              {progress.completedTasks}
            </Text>

            <Text style={[styles.label, { color: C.secondary }]}>
              Completed
            </Text>
          </View>

          <View style={styles.stat}>
            <Text style={[styles.value, { color: C.danger }]}>
              {progress.pendingTasks}
            </Text>

            <Text style={[styles.label, { color: C.secondary }]}>
              Pending
            </Text>
          </View>
        </View>

       <View style={styles.progressBackground}>
                 <View
                   style={[
                     styles.progressFill,
                     {
                       // progressWidth may be a string (eg. "50%") which can cause
                       // a TypeScript type error for ViewStyle.width. Cast to any
                       // to satisfy the typechecker.
                       width: progressWidth as any,
                       backgroundColor: C.accent,
                     },
                   ]}
                 />
               </View>

        <Text
          style={[
            styles.average,
            {
              color: C.text,
            },
          ]}
        >
          Average Progress : {progress.averagePercentage}%
        </Text>
      </View>

      {/* Empty Month */}
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color={C.secondary} />

          <Text
            style={[
              styles.emptyTitle,
              {
                color: C.text,
              },
            ]}
          >
            No Monthly Data
          </Text>

          <Text
            style={[
              styles.emptySubtitle,
              {
                color: C.secondary,
              },
            ]}
          >
            There are no completed or pending tasks for this month.
          </Text>
        </View>
      ) : (
        <FlatList
          data={calendarEntries as [string, number][]}
          keyExtractor={(item) => item[0]}
          renderItem={renderCalendarDay}
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
    backgroundColor: "#2E2E32",
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

  dayCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },

  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  dayDate: {
    fontSize: 16,
    fontWeight: "700",
  },

  dayTasks: {
    marginTop: 4,
    fontSize: 12,
  },

  percent: {
    marginTop: 10,
    alignSelf: "flex-end",
    fontWeight: "700",
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
});