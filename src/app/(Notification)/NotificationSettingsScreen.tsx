// src/app/Notification/NotificationSettingsScreen.tsx
//
// Lets the user turn each notification category on/off. Backed by
// NotificationPreferencesService, which NotificationScheduler.schedule()
// checks before every native call — so toggling a category off here
// silences it everywhere in the app immediately, and cancels anything
// already pending for it.
//
// Route: "/Notification/NotificationSettingsScreen"

import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router, useFocusEffect } from "expo-router";

import NotificationPreferencesService, {
  NotificationPreferencesMap,
} from "../../notifications/core/Notificationpreferencesservice";
import { NotificationType } from "../../notifications/core/NotificationTypes";
import NotificationBootstrap from "../../notifications/NotificationBootstrap";

const CATEGORY_LABELS: Partial<Record<NotificationType, string>> = {
  [NotificationType.TASK]: "Task Reminders",
  [NotificationType.GOAL]: "Goal Reminders",
  [NotificationType.NOTE]: "Daily Journal Reminder",
  [NotificationType.AI_REVIEW]: "AI Reviews",
  [NotificationType.ACCOUNT]: "Account Alerts",
  [NotificationType.ROUTINE]: "Daily Routine",
};

const CATEGORY_DESCRIPTIONS: Partial<Record<NotificationType, string>> = {
  [NotificationType.TASK]: "Reminders, due, and overdue alerts for tasks.",
  [NotificationType.GOAL]: "Approaching and deadline-day reminders for goals.",
  [NotificationType.NOTE]: "One reminder at 9:30 PM to write today's journal.",
  [NotificationType.AI_REVIEW]: "Daily, weekly, and monthly productivity reviews.",
  [NotificationType.ACCOUNT]: "Password, email, and profile change alerts.",
  [NotificationType.ROUTINE]:
    "Morning motivation, engagement reminders, evening planning, daily summary.",
};

// SYSTEM notifications are internal (fallback navigation, etc.) — not
// exposed as a user-facing toggle.
const TOGGLEABLE_TYPES: NotificationType[] = [
  NotificationType.TASK,
  NotificationType.GOAL,
  NotificationType.NOTE,
  NotificationType.AI_REVIEW,
  NotificationType.ROUTINE,
  NotificationType.ACCOUNT,
];

export default function NotificationSettingsScreen() {
  const [prefs, setPrefs] = useState<NotificationPreferencesMap | null>(null);
  const [pendingType, setPendingType] = useState<NotificationType | null>(null);

  const load = useCallback(async () => {
    const all = await NotificationPreferencesService.getAll();
    setPrefs(all);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleToggle = async (type: NotificationType, value: boolean) => {
    // Optimistic UI update
    setPrefs((prev) => (prev ? { ...prev, [type]: value } : prev));
    setPendingType(type);

    try {
      await NotificationPreferencesService.setEnabled(type, value);

      if (value) {
        // Re-enabling doesn't retroactively reschedule anything by
        // itself — trigger a full resync so it repopulates right away
        // instead of waiting for the next natural sync.
        await NotificationBootstrap.synchronize();
      }
    } finally {
      setPendingType(null);
    }
  };

  if (!prefs) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#F97316" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Notification Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.listContainer}>
        {TOGGLEABLE_TYPES.map((type) => (
          <View key={type} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{CATEGORY_LABELS[type]}</Text>
              <Text style={styles.rowSubtitle}>
                {CATEGORY_DESCRIPTIONS[type]}
              </Text>
            </View>

            {pendingType === type ? (
              <ActivityIndicator size="small" color="#F97316" />
            ) : (
              <Switch
                value={prefs[type]}
                onValueChange={(value) => handleToggle(type, value)}
                trackColor={{ false: "#E5E7EB", true: "#FDBA74" }}
                thumbColor={prefs[type] ? "#F97316" : "#F3F4F6"}
              />
            )}
          </View>
        ))}

        <Text style={styles.footnote}>
          Turning a category off cancels its already-scheduled notifications
          immediately. Turning it back on reschedules it right away.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backText: {
    fontSize: 16,
    color: "#F97316",
    fontWeight: "600",
    width: 44,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  rowSubtitle: {
    fontSize: 12,
    color: "#6B7280",
  },
  footnote: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 12,
    paddingHorizontal: 4,
    lineHeight: 18,
  },
});