// src/services/notificationCategories.ts
// Requirement 1 & 2 groundwork: registers the interactive action buttons
// (Mark Complete / Snooze 5 / Snooze 10 / Snooze 30 / Open App) as Expo
// notification "categories". A notification opts into buttons by setting
// `categoryIdentifier` in its content to one of the exported constants.
//
// NOTE (platform limits, not a bug): iOS shows at most 4 actions per
// category and Android puts extras behind a "..." overflow. All 5 actions
// are still registered — nothing crashes — but on iOS the 5th action may
// not be visible in the notification banner itself (it still works from
// the lock-screen long-press / notification center expanded view).

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { NOTIFICATION_ACTIONS } from "./notificationActions";

export const CATEGORY_TASK_ACTIONABLE = "task_actionable";
export const CATEGORY_MISSED_RECOVERY = "missed_recovery";

export const registerNotificationCategories = async (): Promise<void> => {
  if (Platform.OS === "web") return;

  await Notifications.setNotificationCategoryAsync(CATEGORY_TASK_ACTIONABLE, [
    {
      identifier: NOTIFICATION_ACTIONS.MARK_COMPLETE,
      buttonTitle: "✅ Mark Complete",
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.SNOOZE_5,
      buttonTitle: "Snooze 5m",
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.SNOOZE_10,
      buttonTitle: "Snooze 10m",
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.SNOOZE_30,
      buttonTitle: "Snooze 30m",
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.OPEN_APP,
      buttonTitle: "Open App",
      options: { opensAppToForeground: true },
    },
  ]);

  // Requirement 8: missed-task recovery gets its own, smaller action set.
  await Notifications.setNotificationCategoryAsync(CATEGORY_MISSED_RECOVERY, [
    {
      identifier: NOTIFICATION_ACTIONS.MOVE_TO_TOMORROW,
      buttonTitle: "📅 Move to Tomorrow",
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.MARK_COMPLETE,
      buttonTitle: "✅ Mark Complete",
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTIONS.OPEN_APP,
      buttonTitle: "Open App",
      options: { opensAppToForeground: true },
    },
  ]);
};