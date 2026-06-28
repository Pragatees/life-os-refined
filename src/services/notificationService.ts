// src/services/notificationService.ts
// Install: npx expo install expo-notifications expo-device

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Task } from "../types/task";

// ─── Constants ────────────────────────────────────────────────────────────────

const MORNING_HOUR = 8;
const MORNING_MINUTE = 0;
const EVENING_HOUR = 19;
const EVENING_MINUTE = 0;
const REMINDER_MINUTES_BEFORE = 15;
const MAX_FUTURE_DAYS = 60;

const STORAGE_KEY_MORNING = "notif_id_morning";
const STORAGE_KEY_EVENING = "notif_id_evening";
const STORAGE_KEY_TASK_PREFIX = "notif_id_task_";
const MAX_TASK_NOTIFICATIONS = 50;

// ─── Platform guard ───────────────────────────────────────────────────────────

/**
 * expo-notifications only works on iOS and Android.
 * All exported functions check this first and return early on web.
 */
const isNativePlatform = (): boolean => {
  if (Platform.OS === "web") {
    console.log("[Notifications] Web platform — notifications not supported.");
    return false;
  }
  if (!Device.isDevice) {
    console.warn("[Notifications] Simulator — notifications not supported.");
    return false;
  }
  return true;
};

// ─── 1. Notification Handler ──────────────────────────────────────────────────

/**
 * Call ONCE at module level in _layout.tsx (outside any component).
 * Safe to call on web — no-ops silently.
 */
export const initializeNotificationHandler = (): void => {
  if (Platform.OS === "web") return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

// ─── 2. Permissions ───────────────────────────────────────────────────────────

export type PermissionResult = "granted" | "already_granted" | "denied";

/**
 * Request notification permissions on app startup.
 *
 * Returns:
 *  - "granted"         → user just granted for the first time → fire welcome notif
 *  - "already_granted" → was already granted on a previous run → do nothing extra
 *  - "denied"          → user said no, web, or simulator → skip all scheduling
 */
export const requestNotificationPermissions =
  async (): Promise<PermissionResult> => {
    if (!isNativePlatform()) return "denied";

    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
  name: "Life-OS",
  importance: Notifications.AndroidImportance.MAX,
  vibrationPattern: [0, 250, 250, 250],
  lightColor: "#208AEF",
  sound: "default",
  enableVibrate: true,
});
        console.log("[Notifications] Android channel set.");
      }

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();

      if (existingStatus === "granted") {
        console.log("[Notifications] Permission was already granted.");
        return "already_granted";
      }

      const { status } = await Notifications.requestPermissionsAsync();

      if (status === "granted") {
        console.log("[Notifications] Permission GRANTED by user.");
        return "granted";
      }

      console.warn("[Notifications] Permission DENIED by user.");
      return "denied";
    } catch (error) {
      console.error("[Notifications] Permission request failed:", error);
      return "denied";
    }
  };

/**
 * Quick runtime check before any scheduling call.
 * Returns false on web, simulator, or if permission not granted.
 */
export const getPermissionsStatus = async (): Promise<boolean> => {
  if (!isNativePlatform()) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
};

// ─── 3. Permission-Granted Welcome Notification ───────────────────────────────

/**
 * Fire an immediate notification to confirm notifications are working.
 * Called ONCE from _layout.tsx when the user grants permission for the first time.
 *
 * Uses a DATE trigger 2 seconds from now — truly instant triggers are not
 * reliable across all Expo/OS versions.
 */
export const firePermissionGrantedNotification = async (): Promise<void> => {
  if (!isNativePlatform()) return;

  try {
    const triggerDate = new Date(Date.now() + 2000);

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔔 Notifications are on!",
        body: "You're all set. We'll remind you about your tasks on time every day.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });

    console.log(
      "[Notifications] Welcome notification scheduled, id:",
      id,
      "fires at:",
      triggerDate.toISOString()
    );
  } catch (error) {
    console.error(
      "[Notifications] Failed to schedule welcome notification:",
      error
    );
  }
};

// ─── 4. Helpers ───────────────────────────────────────────────────────────────

const parseTaskDateTime = (
  taskDate: string | undefined | null,
  taskTime: string | undefined | null
): Date | null => {
  if (!taskDate || !taskTime) {
    console.warn("[Notifications] parseTaskDateTime: missing taskDate or taskTime", {
      taskDate,
      taskTime,
    });
    return null;
  }

  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) {
      console.warn("[Notifications] taskDate format invalid:", taskDate);
      return null;
    }

    // Accept "H:mm" (single-digit hour) by padding to "HH:mm"
    const normalizedTime = taskTime.padStart(5, "0");
    if (!/^\d{2}:\d{2}$/.test(normalizedTime)) {
      console.warn("[Notifications] taskTime format invalid:", taskTime);
      return null;
    }

    const [year, month, day] = taskDate.split("-").map(Number);
    const [hour, minute] = normalizedTime.split(":").map(Number);

    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (hour < 0 || hour > 23) return null;
    if (minute < 0 || minute > 59) return null;

    const date = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (isNaN(date.getTime())) return null;

    const maxFuture = new Date();
    maxFuture.setDate(maxFuture.getDate() + MAX_FUTURE_DAYS);
    if (date > maxFuture) {
      console.warn("[Notifications] Task date too far in the future, skipping:", date);
      return null;
    }

    return date;
  } catch (err) {
    console.error("[Notifications] parseTaskDateTime threw:", err);
    return null;
  }
};

const cancelStoredNotification = async (storageKey: string): Promise<void> => {
  try {
    const expoId = await AsyncStorage.getItem(storageKey);
    if (!expoId) return;
    await Notifications.cancelScheduledNotificationAsync(expoId);
    await AsyncStorage.removeItem(storageKey);
    console.log("[Notifications] Cancelled notification for key:", storageKey);
  } catch (error) {
    console.warn(
      `[Notifications] Failed to cancel notification (${storageKey}):`,
      error
    );
  }
};

const scheduleAndStore = async (
  storageKey: string,
  content: Notifications.NotificationContentInput,
  trigger: Notifications.SchedulableNotificationTriggerInput
): Promise<void> => {
  await cancelStoredNotification(storageKey);

  try {
    const expoId = await Notifications.scheduleNotificationAsync({
      content,
      trigger,
    });
    await AsyncStorage.setItem(storageKey, expoId);
    console.log(
      `[Notifications] Scheduled (${storageKey}) → expo id: ${expoId}`
    );
  } catch (error) {
    console.error(
      `[Notifications] Failed to schedule (${storageKey}):`,
      error
    );
  }
};

// ─── 5. Daily Notifications ───────────────────────────────────────────────────

const scheduleMorningNotification = async (taskCount: number): Promise<void> =>
  scheduleAndStore(
    STORAGE_KEY_MORNING,
    {
      title: "🌅 Good Morning!",
      body:
        taskCount > 0
          ? `You have ${taskCount} task${taskCount > 1 ? "s" : ""} planned for today. Let's get started!`
          : "No tasks today — enjoy your free day! 🎉",
      sound: true,
    },
    {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: MORNING_HOUR,
      minute: MORNING_MINUTE,
    }
  );

const scheduleEveningNotification = async (
  incompleteCount: number
): Promise<void> =>
  scheduleAndStore(
    STORAGE_KEY_EVENING,
    {
      title: "🌙 Evening Check-in",
      body:
        incompleteCount > 0
          ? `You still have ${incompleteCount} incomplete task${incompleteCount > 1 ? "s" : ""}. Let's wrap up the day!`
          : "Great job! All tasks completed today. 🎉",
      sound: true,
    },
    {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: EVENING_HOUR,
      minute: EVENING_MINUTE,
    }
  );

export const scheduleDailyNotifications = async (tasks: Task[]): Promise<void> => {
  const incompleteCount = tasks.filter((t) => !t.completed).length;
  console.log(
    `[Notifications] Scheduling daily: ${tasks.length} total, ${incompleteCount} incomplete`
  );
  await Promise.all([
    scheduleMorningNotification(tasks.length),
    scheduleEveningNotification(incompleteCount),
  ]);
};

// ─── 6. Per-Task Notifications ────────────────────────────────────────────────

const scheduleOneTaskNotifications = async (task: Task): Promise<void> => {
  if (task.completed) return;

  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);
  if (!taskDateTime) {
    console.warn(
      `[Notifications] Skipping task ${task.id} ("${task.taskName}") — invalid date/time.`
    );
    return;
  }

  const now = new Date();
  const reminderTime = new Date(
    taskDateTime.getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000
  );

  if (reminderTime > now) {
    await scheduleAndStore(
      `${STORAGE_KEY_TASK_PREFIX}${task.id}_reminder`,
      {
        title: "⏰ Task Starting Soon",
        body: `"${task.taskName}" starts in ${REMINDER_MINUTES_BEFORE} minutes!`,
        sound: true,
        data: { taskId: task.id, type: "reminder" },
      },
      {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderTime,
      }
    );
  } else {
    console.log(
      `[Notifications] Reminder time already passed for task ${task.id}:`,
      reminderTime
    );
  }

  if (taskDateTime > now) {
    await scheduleAndStore(
      `${STORAGE_KEY_TASK_PREFIX}${task.id}_overdue`,
      {
        title: "🚨 Task Time!",
        body: `"${task.taskName}" is starting now. Don't forget!`,
        sound: true,
        data: { taskId: task.id, type: "overdue" },
      },
      {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: taskDateTime,
      }
    );
  } else {
    console.log(
      `[Notifications] Task time already passed for task ${task.id}:`,
      taskDateTime
    );
  }
};

export const scheduleTaskNotifications = async (tasks: Task[]): Promise<void> => {
  const incompleteTasks = tasks
    .filter((t) => !t.completed)
    .slice(0, MAX_TASK_NOTIFICATIONS);

  console.log(
    `[Notifications] Scheduling per-task notifications for ${incompleteTasks.length} tasks.`
  );

  for (const task of incompleteTasks) {
    await scheduleOneTaskNotifications(task);
  }
};

// ─── 7. Cancel Notifications ──────────────────────────────────────────────────

export const cancelTaskNotifications = async (taskId: string): Promise<void> => {
  if (!isNativePlatform()) return;
  await Promise.all([
    cancelStoredNotification(`${STORAGE_KEY_TASK_PREFIX}${taskId}_reminder`),
    cancelStoredNotification(`${STORAGE_KEY_TASK_PREFIX}${taskId}_overdue`),
  ]);
};

export const cancelAllNotifications = async (): Promise<void> => {
  if (!isNativePlatform()) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const allKeys = await AsyncStorage.getAllKeys();
    const notifKeys = allKeys.filter(
      (k) =>
        k === STORAGE_KEY_MORNING ||
        k === STORAGE_KEY_EVENING ||
        k.startsWith(STORAGE_KEY_TASK_PREFIX)
    );
    if (notifKeys.length > 0) {
      await AsyncStorage.multiRemove(notifKeys);
    }
    console.log("[Notifications] All notifications cancelled and keys cleared.");
  } catch (error) {
    console.error("[Notifications] Failed to cancel all notifications:", error);
  }
};

// ─── 8. Master Scheduler ──────────────────────────────────────────────────────

export const scheduleAllNotifications = async (tasks: Task[]): Promise<void> => {
  if (!isNativePlatform()) return;

  try {
    console.log(
      "[Notifications] Master scheduler running for",
      tasks.length,
      "tasks."
    );

    const existing = await Notifications.getAllScheduledNotificationsAsync();
    console.log(
      "[Notifications] Currently scheduled count BEFORE:",
      existing.length
    );

    await Promise.all([
      scheduleDailyNotifications(tasks),
      scheduleTaskNotifications(tasks),
    ]);

    const after = await Notifications.getAllScheduledNotificationsAsync();
    console.log(
      "[Notifications] Currently scheduled count AFTER:",
      after.length,
      after.map((n) => ({ id: n.identifier, title: n.content.title }))
    );
  } catch (error) {
    console.error("[Notifications] Master scheduler failed:", error);
  }
};

// ─── 9. Initialization ────────────────────────────────────────────────────────

export const initializeNotifications =
  async (): Promise<PermissionResult> => {
    initializeNotificationHandler();
    const result = await requestNotificationPermissions();
    return result;
  };