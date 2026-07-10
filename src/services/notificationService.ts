// src/services/notificationService.ts
// Install: npx expo install expo-notifications expo-device
//
// Smart Reminder System — this file is the orchestrator. Every function
// that existed before is still here with the same name, same signature,
// same behavior. New functionality (multi-reminders, recurrence, quiet
// hours, history, action buttons, missed recovery, optimized rescheduling)
// lives in the sibling modules and is wired in here:
//
//   notificationTypes.ts             shared types (ReminderOffset, RecurrenceRule, ...)
//   notificationActions.ts           action button identifiers
//   notificationCategories.ts        registers action buttons with the OS
//   notificationHistory.ts           append-only history log
//   reminderScheduler.ts             ledger + multi-reminder/recurring/quiet-hours/recovery
//   notificationResponseHandler.ts   handles Mark Complete / Snooze / Open App taps
//
// ─────────────────────────────────────────────────────────────────────────────
// CHANGELOG (this revision)
// ─────────────────────────────────────────────────────────────────────────────
// 1. Morning notification moved from 6:00 AM -> 7:00 AM.
// 2. The single-tier reminder path (scheduleTaskReminder + calculateReminderTime)
//    is REPLACED, for tasks without custom reminderOffsets, by a new engine
//    (buildReminderPlan + scheduleTaskReminderSuite) implementing the full
//    15-min / 5-min / deadline / +15 / +30 / +60 rule set, including the
//    "already overdue at creation" catch-up + skip-superseded-tiers logic.
//    scheduleTaskReminder / scheduleTaskDeadline / scheduleOverdueReminder
//    are left completely untouched and are still called for tasks that DO
//    use custom reminderOffsets (scheduleSmartTaskReminders path), and
//    remain exported for any external caller relying on the old behavior.
// 3. Nothing in reminderScheduler.ts / notificationUtils.ts / notificationTypes.ts
//    needed to change — isKnownTaskNotifType already matches "reminder*" and
//    "overdue_*" by prefix, so the new reminder_15 / reminder_5 types are
//    recognized by the delivery listener with zero changes there.
// 4. ADDED: Two new daily reminder notifications:
//    - 8:00 PM: "Add your intention memories to Notes"
//    - 9:00 PM: "Check your daily progress and review with your AI companion"
// ─────────────────────────────────────────────────────────────────────────────

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Task } from "../types/task";
import { notificationLogger as log } from "./notificationLogger";
import {
  getTodayDateString,
  parseTaskDateTime,
  isTaskExpired,
  calculateReminderTime,
  getPendingTasks,
  getDailyCounts,
  OVERDUE_OFFSETS_MINUTES,
  ENGAGEMENT_HOURS,
} from "./notificationUtils";

import { SmartTask } from "./notificationTypes";
import { registerNotificationCategories } from "./notificationCategories";
import { logNotificationEvent, getNotificationHistory, clearNotificationHistory } from "./notificationHistory";
import {
  registerNotificationResponseListener,
  setTaskActionHandlers,
  TaskActionHandlers,
} from "./notificationResponseHandler";
import {
  isNativePlatform,
  syncTaskNotification,
  getNotifState,
  cancelTaskNotificationType,
  isKnownTaskNotifType,
  scheduleSmartTaskReminders,
  scheduleRecurringTask,
  scheduleMissedRecovery,
  computeTaskFingerprint,
  getStoredFingerprint,
  setStoredFingerprint,
  clearStoredFingerprint,
  getQuietHoursPrefs,
  setQuietHoursPrefs,
} from "./reminderScheduler";

export { getTodayDateString };
// Re-exported so consumers can import everything from one place if they prefer.
export {
  getQuietHoursPrefs,
  setQuietHoursPrefs,
  setTaskActionHandlers,
  getNotificationHistory,
  clearNotificationHistory,
  scheduleSmartTaskReminders,
  scheduleRecurringTask,
  scheduleMissedRecovery,
};
export type { TaskActionHandlers };

// ─── Fixed daily times ───────────────────────────────────────────────────────
const MORNING_HOUR = 7;   // 7:00 AM (was 6:00 AM)
const MORNING_MINUTE = 0;
const EVENING_HOUR = 19; // 7 PM
const EVENING_MINUTE = 0;
const SUMMARY_HOUR = 21; // 9 PM
const SUMMARY_MINUTE = 0;
const MIDNIGHT_HOUR = 0;   // 12:01 AM new-day reset
const MIDNIGHT_MINUTE = 1;

// ─── New daily reminder times ────────────────────────────────────────────────
const INTENTION_MEMORIES_HOUR = 20; // 8:00 PM
const INTENTION_MEMORIES_MINUTE = 0;
const AI_REVIEW_HOUR = 21; // 9:00 PM
const AI_REVIEW_MINUTE = 0;

const MAX_TASK_NOTIFICATIONS = 50;

// ─── Storage keys ─────────────────────────────────────────────────────────────
const KEY_MORNING = "notif_morning";
const KEY_EVENING = "notif_evening";
const KEY_SUMMARY = "notif_summary";
const KEY_MIDNIGHT_RESET = "notif_midnight_reset";
const KEY_ACTIVE_TASK_IDS = "notif_active_task_ids";
const KEY_INTENTION_MEMORIES = "notif_intention_memories";
const KEY_AI_REVIEW = "notif_ai_review";
// Same key the Settings screen writes to — single source of truth for the
// user's in-app on/off preference (separate from OS-level permission).
const KEY_NOTIFICATIONS_ENABLED = "notificationsEnabled";
const engagementKey = (hour: number) => `notif_engagement_${hour}`;

// ─── User preference gate ──────────────────────────────────────────────────────
export const areNotificationsEnabled = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(KEY_NOTIFICATIONS_ENABLED);
    return v !== "false";
  } catch {
    return true;
  }
};

// Every per-task notification "type" this file itself can create. Used only
// as a last-resort fallback if the AsyncStorage key scan in
// cancelAllTaskNotifications fails outright — the primary cleanup path
// scans storage dynamically and needs no update when new types are added.
const TASK_NOTIF_TYPES: string[] = [
  "reminder",     // legacy single-tier type, still produced by scheduleTaskReminder()
  "reminder_15",
  "reminder_5",
  "deadline",
  ...OVERDUE_OFFSETS_MINUTES.map((m) => `overdue_${m}`),
];

/**
 * Marks a per-task notification "sent" the instant the OS actually delivers
 * it. Recognizes every notification type the smart scheduler can produce
 * (custom reminder offsets, recurring, missed-recovery, the new tiered
 * reminder_15 / reminder_5 types) via isKnownTaskNotifType, which matches
 * "reminder*" and "overdue_*" by prefix — so no change was needed there for
 * the new types introduced in this revision.
 */
export const registerTaskNotificationDeliveryListener = (): (() => void) => {
  if (!isNativePlatform()) return () => {};
  const subscription = Notifications.addNotificationReceivedListener(async (notification) => {
    const data = notification.request.content.data as
      | { taskId?: string; type?: string; minutes?: number }
      | undefined;
    if (!data?.taskId || !data?.type) return;

    const resolvedType = data.type === "overdue" ? `overdue_${data.minutes}` : data.type;
    if (!isKnownTaskNotifType(resolvedType)) return;

    const prev = await getNotifState(data.taskId, resolvedType);
    await AsyncStorage.setItem(
      `notif_state_${data.taskId}_${resolvedType}`,
      JSON.stringify({ status: "sent", fireAt: prev?.fireAt ?? new Date().toISOString() })
    );
    await logNotificationEvent(
      data.taskId,
      notification.request.content.body?.match(/"([^"]+)"/)?.[1] ?? "",
      resolvedType,
      "delivered"
    );
  });
  return () => subscription.remove();
};

// Platform guard is imported from reminderScheduler as `isNativePlatform`
// (kept as a single implementation so every module agrees on what "native"
// means). Aliased locally to `isNative` to minimize the diff against the
// original file.
const isNative = isNativePlatform;

// ─── 1. Handler + permissions ─────────────────────────────────────────────────

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

export type PermissionResult = "granted" | "already_granted" | "denied";

export const requestNotificationPermissions = async (): Promise<PermissionResult> => {
  if (!isNative()) return "denied";

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
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === "granted") {
      log.info("Permission already granted");
      return "already_granted";
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status === "granted") {
      log.info("Permission granted by user");
      return "granted";
    }

    log.warn("Permission denied by user");
    return "denied";
  } catch (error) {
    log.error("Permission request failed", error);
    return "denied";
  }
};

export const getPermissionsStatus = async (): Promise<boolean> => {
  if (!isNative()) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
};

/** Call ONCE at module level in _layout.tsx (outside any component). */
export const initializeNotifications = async (): Promise<PermissionResult> => {
  initializeNotificationHandler();
  return requestNotificationPermissions();
};

/**
 * NEW convenience entry point that wires up everything the Smart Reminder
 * System needs in one call: permission handler + request, action-button
 * categories, and both listeners (delivery ledger + action responses).
 * Fully additive — initializeNotifications() above is untouched and still
 * works exactly as before for anyone not ready to adopt the new features.
 *
 * Usage in _layout.tsx:
 *   useEffect(() => {
 *     let cleanup: (() => void) | undefined;
 *     initializeSmartReminderSystem({
 *       onMarkComplete: (taskId) => useTaskStore.getState().completeTask(taskId),
 *       onSnooze: (taskId, minutes) => log.info(`snoozed ${taskId} by ${minutes}m`),
 *       onMoveToTomorrow: (taskId) => useTaskStore.getState().moveToTomorrow(taskId),
 *       onOpenApp: (taskId) => router.push(`/task/${taskId}`),
 *     }).then((unsubscribe) => { cleanup = unsubscribe; });
 *     return () => cleanup?.();
 *   }, []);
 */
export const initializeSmartReminderSystem = async (
  handlers: TaskActionHandlers = {}
): Promise<() => void> => {
  await initializeNotifications();
  await registerNotificationCategories();
  setTaskActionHandlers(handlers);

  const unsubDelivery = registerTaskNotificationDeliveryListener();
  const unsubResponse = registerNotificationResponseListener();
  const unsubMidnight = registerMidnightResetListener();

  return () => {
    unsubDelivery();
    unsubResponse();
    unsubMidnight();
  };
};

// ─── 2. Login welcome + permission-granted confirmations ─────────────────────

export const fireLoginWelcomeNotification = async (userName?: string): Promise<void> => {
  if (!isNative()) return;
  if (!(await areNotificationsEnabled())) {
    log.info("Skipped login welcome notification — user has notifications turned off");
    return;
  }
  try {
    const greeting = userName ? `, ${userName}` : "";
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `👋 Welcome back${greeting}!`,
        body: "Let's make today productive. We'll remind you about every task on time.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Date.now() + 2000),
      },
    });
    log.info("Login welcome notification scheduled");
  } catch (error) {
    log.error("Failed to schedule login welcome notification", error);
  }
};

export const firePermissionGrantedNotification = async (): Promise<void> => {
  if (!isNative()) return;
  if (!(await areNotificationsEnabled())) {
    log.info("Skipped permission-granted notification — user has notifications turned off");
    return;
  }
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔔 Notifications are on!",
        body: "You're all set. We'll keep you on track every day.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Date.now() + 2000),
      },
    });
    log.info("Permission-granted notification scheduled");
  } catch (error) {
    log.error("Failed to schedule permission-granted notification", error);
  }
};

// ─── 3. Low-level schedule/cancel helpers ─────────────────────────────────────

const cancelNotification = async (storageKey: string): Promise<void> => {
  try {
    const expoId = await AsyncStorage.getItem(storageKey);
    if (!expoId) return;
    await Notifications.cancelScheduledNotificationAsync(expoId).catch(() => {});
    await AsyncStorage.removeItem(storageKey);
  } catch (error) {
    log.warn(`Failed to cancel notification (${storageKey})`, error);
  }
};

const scheduleAndStore = async (
  storageKey: string,
  content: Notifications.NotificationContentInput,
  trigger: Notifications.SchedulableNotificationTriggerInput
): Promise<void> => {
  await cancelNotification(storageKey);
  try {
    const expoId = await Notifications.scheduleNotificationAsync({ content, trigger });
    await AsyncStorage.setItem(storageKey, expoId);
  } catch (error) {
    log.error(`Failed to schedule (${storageKey})`, error);
  }
};

// ─── 4. Morning Motivation — 7:00 AM daily ────────────────────────────────────

export const scheduleMorningNotification = async (): Promise<void> => {
  await scheduleAndStore(
    KEY_MORNING,
    { title: "🌞 Good Morning", body: "Let's make today productive!", sound: true },
    { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: MORNING_HOUR, minute: MORNING_MINUTE }
  );
  log.info("Morning notification scheduled");
};

// ─── 5. Evening Review — 7:00 PM daily ────────────────────────────────────────

export const scheduleEveningReview = async (): Promise<void> => {
  await scheduleAndStore(
    KEY_EVENING,
    { title: "🌙 Evening Review", body: "Take a moment to review today's progress.", sound: true },
    { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: EVENING_HOUR, minute: EVENING_MINUTE }
  );
  log.info("Evening notification scheduled");
};

// ─── 5.5 Intention Memories — 8:00 PM daily ──────────────────────────────────

export const scheduleIntentionMemories = async (): Promise<void> => {
  await scheduleAndStore(
    KEY_INTENTION_MEMORIES,
    { 
      title: "📝 Intention Memories", 
      body: "Add your intention memories to Notes",
      sound: true,
      data: { type: "intention_memories" }
    },
    { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: INTENTION_MEMORIES_HOUR, minute: INTENTION_MEMORIES_MINUTE }
  );
  log.info("Intention memories notification scheduled for 8:00 PM");
};

// ─── 5.6 AI Review — 9:00 PM daily ───────────────────────────────────────────

export const scheduleAIReview = async (): Promise<void> => {
  await scheduleAndStore(
    KEY_AI_REVIEW,
    { 
      title: "🤖 AI Companion Review", 
      body: "Check your daily progress and review with your AI companion",
      sound: true,
      data: { type: "ai_review" }
    },
    { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: AI_REVIEW_HOUR, minute: AI_REVIEW_MINUTE }
  );
  log.info("AI review notification scheduled for 9:00 PM");
};

// ─── 6. Daily Summary — 9:00 PM daily ─────────────────────────────────────────

export const scheduleDailySummary = async (tasks: Task[]): Promise<void> => {
  const { total, completed, completionPercent } = getDailyCounts(tasks);
  const body =
    total === 0
      ? "No tasks logged today."
      : `You completed ${completed} of ${total} tasks today (${completionPercent}%).`;

  await scheduleAndStore(
    KEY_SUMMARY,
    { title: "🎉 Daily Summary", body, sound: true },
    { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: SUMMARY_HOUR, minute: SUMMARY_MINUTE }
  );
  log.info("Daily summary notification scheduled");
};

// ─── 6.5 Midnight Reset — 12:01 AM daily ──────────────────────────────────────

export const scheduleMidnightReset = async (): Promise<void> => {
  await scheduleAndStore(
    KEY_MIDNIGHT_RESET,
    {
      title: "📅 New Day",
      body: "Your task list has reset for today.",
      sound: false,
      data: { type: "midnight_reset" },
    },
    { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: MIDNIGHT_HOUR, minute: MIDNIGHT_MINUTE }
  );
  log.info("Midnight reset notification scheduled");
};

export const performMidnightCleanup = async (): Promise<void> => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const staleTaskKeys = allKeys.filter((k) => k.startsWith("notif_task_"));
    if (staleTaskKeys.length > 0) {
      await AsyncStorage.multiRemove(staleTaskKeys);
      log.info(`Midnight cleanup removed ${staleTaskKeys.length} stale per-task key(s)`);
    }
  } catch (error) {
    log.error("Midnight cleanup failed", error);
  }
};

export const registerMidnightResetListener = (): (() => void) => {
  if (!isNative()) return () => {};
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    if (notification.request.content.data?.type === "midnight_reset") {
      performMidnightCleanup();
    }
  });
  return () => subscription.remove();
};

// ─── 6.6 Reminder Plan Engine (NEW) ────────────────────────────────────────────
//
// Implements the exact Case 1-6 rule set:
//   - 15-min-before and 5-min-before reminders when both are still ahead of "now"
//   - if the 15-min window already passed but the 5-min one hasn't: immediate
//     "starts soon" reminder now, 5-min reminder still scheduled for later
//   - if both windows already passed (task starts in <=5 min): a single
//     immediate reminder, no separate 5-min reminder
//   - deadline notification always scheduled unless the task time itself has
//     already passed
//   - once the task time HAS passed: no reminders, no deadline notification;
//     for the +15/+30/+60 overdue tiers, any tier whose absolute time has
//     already elapsed is either (a) the most-recently-elapsed tier, which
//     fires immediately as a catch-up, or (b) an earlier elapsed tier, which
//     is skipped/marked missed because it's superseded by (a); any tier still
//     in the future is scheduled normally. If the task is overdue by less
//     than the smallest tier (15 min), the smallest tier is force-fired
//     immediately as a generic "already overdue" catch-up (Case 4) instead of
//     waiting for the wall-clock 15-minute mark.
//
// "Immediate" always means "fire a real OS notification a fraction of a
// second from now" (not a past fireAt) — syncTaskNotification only marks the
// ledger for a past fireAt, it never calls scheduleNotificationAsync for one.
// That matches the pattern already used by fireLoginWelcomeNotification.

type ReminderStepAction = "schedule" | "immediate" | "skip";

interface ReminderStep {
  type: string;
  action: ReminderStepAction;
  fireAt: Date | null;
  title: string;
  body: string;
}

const IMMEDIATE_DELAY_MS = 500;

const overdueTierTitle = (offsetMinutes: number): string => {
  if (offsetMinutes === 15) return "⚠️ Task Pending";
  if (offsetMinutes === 30) return "⚠️ Still Pending";
  if (offsetMinutes === 60) return "🚨 Task Missed";
  return "⚠️ Task Overdue";
};

const overdueTierBody = (taskName: string, offsetMinutes: number): string => {
  if (offsetMinutes === 15) return `"${taskName}" is now 15 minutes overdue.`;
  if (offsetMinutes === 30) return `"${taskName}" is still pending after 30 minutes.`;
  if (offsetMinutes === 60) return `"${taskName}" has been overdue for 1 hour.`;
  return `"${taskName}" is now ${offsetMinutes} minutes overdue.`;
};

const step = (
  type: string,
  action: ReminderStepAction,
  fireAt: Date | null,
  title: string,
  body: string
): ReminderStep => ({ type, action, fireAt, title, body });

/**
 * Pure planning function — given the task's absolute due time and "now",
 * returns the full set of reminder/deadline/overdue steps to sync. No I/O,
 * fully unit-testable in isolation, mirroring the style of
 * notificationUtils.ts's calculateReminderTime.
 */
export const buildReminderPlan = (
  taskName: string,
  taskDateTime: Date,
  now: Date = new Date()
): ReminderStep[] => {
  const steps: ReminderStep[] = [];
  const minutesUntil = (taskDateTime.getTime() - now.getTime()) / 60000;
  const overdueTiers = [...OVERDUE_OFFSETS_MINUTES]; // e.g. [15, 30, 60], ascending

  if (minutesUntil > 0) {
    // ── Task hasn't started yet ────────────────────────────────────────────
    const fire15 = new Date(taskDateTime.getTime() - 15 * 60000);
    const fire5 = new Date(taskDateTime.getTime() - 5 * 60000);

    if (minutesUntil > 15) {
      steps.push(
        step("reminder_15", "schedule", fire15, "⏰ Upcoming Task", `Your task "${taskName}" starts in 15 minutes.`)
      );
      steps.push(
        step("reminder_5", "schedule", fire5, "🚨 Almost Time", `Only 5 minutes left for "${taskName}".`)
      );
    } else if (minutesUntil > 5) {
      // 15-min window already elapsed — catch up immediately, 5-min reminder still ahead of us.
      steps.push(
        step(
          "reminder_15",
          "immediate",
          new Date(now.getTime() + IMMEDIATE_DELAY_MS),
          "⏰ Upcoming Task",
          `Your task "${taskName}" starts soon.`
        )
      );
      steps.push(
        step("reminder_5", "schedule", fire5, "🚨 Almost Time", `Only 5 minutes left for "${taskName}".`)
      );
    } else {
      // Both windows elapsed (<=5 min out) — single immediate reminder only.
      steps.push(
        step(
          "reminder_15",
          "immediate",
          new Date(now.getTime() + IMMEDIATE_DELAY_MS),
          "⏰ Upcoming Task",
          `Your task "${taskName}" starts soon.`
        )
      );
      steps.push(step("reminder_5", "skip", null, "", ""));
    }

    // Deadline notification: task hasn't started, always in the future here.
    steps.push(
      step("deadline", "schedule", taskDateTime, "🚀 Task Started", `It's time to complete "${taskName}".`)
    );

    // Overdue tiers are all still ahead of us whenever the task itself hasn't started.
    overdueTiers.forEach((offset) => {
      steps.push(
        step(
          `overdue_${offset}`,
          "schedule",
          new Date(taskDateTime.getTime() + offset * 60000),
          overdueTierTitle(offset),
          overdueTierBody(taskName, offset)
        )
      );
    });
  } else {
    // ── Task time has already passed ───────────────────────────────────────
    const overdueByMinutes = -minutesUntil;

    // Pre-task reminders no longer apply.
    steps.push(step("reminder_15", "skip", null, "", ""));
    steps.push(step("reminder_5", "skip", null, "", ""));
    // Deadline already passed — never (re)schedule it.
    steps.push(step("deadline", "skip", null, "", ""));

    const expiredTiers = overdueTiers.filter((t) => t <= overdueByMinutes);
    const forcedCatchUp = expiredTiers.length === 0;
    // If no tier has technically elapsed yet but the task is overdue at all
    // (Case 4), force-fire the smallest tier immediately rather than
    // waiting for its literal wall-clock time. Otherwise fire the
    // most-recently-elapsed tier (Case 5 / Case 6).
    const immediateTier = forcedCatchUp ? overdueTiers[0] : Math.max(...expiredTiers);

    overdueTiers.forEach((offset) => {
      const type = `overdue_${offset}`;

      if (offset === immediateTier) {
        const [title, body] = forcedCatchUp
          ? ["⚠️ Task Overdue", `"${taskName}" is already overdue.`]
          : [overdueTierTitle(offset), overdueTierBody(taskName, offset)];
        steps.push(step(type, "immediate", new Date(now.getTime() + IMMEDIATE_DELAY_MS), title, body));
      } else if (offset < immediateTier) {
        // Superseded by the immediate tier above — never fire it, ledger marks it missed.
        steps.push(step(type, "skip", null, "", ""));
      } else {
        // Still ahead of us — schedule normally at its real absolute time.
        steps.push(
          step(
            type,
            "schedule",
            new Date(taskDateTime.getTime() + offset * 60000),
            overdueTierTitle(offset),
            overdueTierBody(taskName, offset)
          )
        );
      }
    });
  }

  return steps;
};

/**
 * Runs buildReminderPlan() for a task and syncs every step through the
 * existing ledger-backed syncTaskNotification — same dedup guarantees,
 * same "scheduled/sent/pending/missed" states as everything else in the
 * app. This is the new default-path replacement for the old
 * scheduleTaskReminder + scheduleTaskDeadline + scheduleOverdueReminder
 * trio. Those three functions are untouched below and remain available
 * for the custom-reminderOffsets path and any external caller.
 */
export const scheduleTaskReminderSuite = async (task: Task): Promise<void> => {
  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);

  if (!taskDateTime) {
    await Promise.all(
      ["reminder_15", "reminder_5", "deadline", ...OVERDUE_OFFSETS_MINUTES.map((m) => `overdue_${m}`)].map((type) =>
        syncTaskNotification(task.id, task.taskName, type, null, () => ({ title: "", body: "" }), areNotificationsEnabled)
      )
    );
    log.warn(`Skipped reminder suite for "${task.taskName}" — invalid date/time`);
    return;
  }

  const now = new Date();
  const plan = buildReminderPlan(task.taskName, taskDateTime, now);
  const minutesUntil = (taskDateTime.getTime() - now.getTime()) / 60000;

  log.info(
    minutesUntil >= 0
      ? `[Reminder] "${task.taskName}" — remaining ${Math.round(minutesUntil)}m`
      : `[Reminder] "${task.taskName}" — overdue ${Math.round(-minutesUntil)}m`
  );

  await Promise.all(
    plan.map((s) => {
      if (s.action === "skip") {
        log.info(`  skip ${s.type}`);
        return syncTaskNotification(
          task.id,
          task.taskName,
          s.type,
          null,
          () => ({ title: "", body: "" }),
          areNotificationsEnabled
        );
      }
      log.info(`  ${s.action} ${s.type}${s.fireAt ? ` @ ${s.fireAt.toISOString()}` : ""}`);
      return syncTaskNotification(
        task.id,
        task.taskName,
        s.type,
        s.fireAt,
        () => ({
          title: s.title,
          body: s.body,
          sound: true,
          data: { taskId: task.id, type: s.type },
        }),
        areNotificationsEnabled
      );
    })
  );
};

// ─── 7. Task Reminder — original single-offset path (unchanged) ─────────────
// Kept exactly as before for full backward compatibility. Only reachable
// from rescheduleAllNotifications now via the custom-reminderOffsets branch
// is scheduleSmartTaskReminders instead — this function is no longer called
// by the master scheduler for the default path (scheduleTaskReminderSuite
// replaces it there) but remains exported and fully functional for any
// external caller still relying on the old single-tier behavior.

export const scheduleTaskReminder = async (task: Task): Promise<void> => {
  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);

  if (!taskDateTime || isTaskExpired(taskDateTime)) {
    await syncTaskNotification(
      task.id,
      task.taskName,
      "reminder",
      null,
      () => ({ title: "", body: "" }),
      areNotificationsEnabled
    );
    if (!taskDateTime) log.warn(`Skipped reminder for "${task.taskName}" — invalid date/time`);
    return;
  }

  const plan = calculateReminderTime(taskDateTime);
  const fireAt = plan.immediate ? new Date(Date.now() + 1000) : plan.fireAt;
  const title = plan.immediate ? "⏰ Your task starts very soon" : "⏰ Upcoming Task";
  const body = plan.immediate
    ? `"${task.taskName}" is about to start.`
    : `"${task.taskName}" starts in ${plan.minutesBefore} minutes.`;

  await syncTaskNotification(
    task.id,
    task.taskName,
    "reminder",
    fireAt,
    () => ({
      title,
      body,
      sound: true,
      data: { taskId: task.id, type: "reminder" },
    }),
    areNotificationsEnabled
  );
  log.info(`Reminder synced for "${task.taskName}"`);
};

// ─── 8. Task Deadline — fires exactly at task time, ledger-backed ────────────
// Unchanged. Still used for the custom-reminderOffsets path in the master
// scheduler; scheduleTaskReminderSuite handles the deadline notification
// itself for everyone else.

export const scheduleTaskDeadline = async (task: Task): Promise<void> => {
  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);
  const fireAt = !taskDateTime || isTaskExpired(taskDateTime) ? null : taskDateTime;

  await syncTaskNotification(
    task.id,
    task.taskName,
    "deadline",
    fireAt,
    () => ({
      title: "🚀 Task Started",
      body: `It's time to complete "${task.taskName}".`,
      sound: true,
      data: { taskId: task.id, type: "deadline" },
    }),
    areNotificationsEnabled
  );
  log.info(`Deadline synced for "${task.taskName}"`);
};

// ─── 9. Overdue Reminder — +15 / +30 / +60 min after deadline, ledger-backed ─
// Unchanged. Still used for the custom-reminderOffsets path in the master
// scheduler; scheduleTaskReminderSuite handles overdue tiers (with the
// skip-superseded-tier logic) itself for everyone else.

export const scheduleOverdueReminder = async (task: Task): Promise<void> => {
  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);

  await Promise.all(
    OVERDUE_OFFSETS_MINUTES.map((minutes) => {
      const type = `overdue_${minutes}`;
      const fireAt = taskDateTime ? new Date(taskDateTime.getTime() + minutes * 60000) : null;
      return syncTaskNotification(
        task.id,
        task.taskName,
        type,
        fireAt,
        () => ({
          title: overdueTierTitle(minutes),
          body: overdueTierBody(task.taskName, minutes),
          sound: true,
          data: { taskId: task.id, type: "overdue", minutes },
        }),
        areNotificationsEnabled
      );
    })
  );
  log.info(`Overdue reminders synced for "${task.taskName}"`);
};

// ─── 9.5 Engagement Reminder — every 3 hrs, 9 AM–6 PM, only if tasks pending ──

export const scheduleEngagementNotifications = async (tasks: Task[]): Promise<void> => {
  const pending = getPendingTasks(tasks);

  if (pending.length === 0) {
    await Promise.all(ENGAGEMENT_HOURS.map((h: number) => cancelNotification(engagementKey(h))));
    log.info("No pending tasks — engagement reminders cancelled");
    return;
  }

  const body =
    pending.length === 1
      ? `You still have "${pending[0].taskName}" to finish today.`
      : `You still have ${pending.length} tasks to finish today.`;

  await Promise.all(
    ENGAGEMENT_HOURS.map((hour: number) =>
      scheduleAndStore(
        engagementKey(hour),
        { title: "🔔 Still on your list", body, sound: true, data: { type: "engagement" } },
        { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 }
      )
    )
  );
  log.info(`Engagement reminders scheduled at hours [${ENGAGEMENT_HOURS.join(", ")}] (${pending.length} pending)`);
};

// ─── 10. Per-task cancellation ─────────────────────────────────────────────────
// Sweeps every ledger entry for the task (fixed types + dynamic
// reminder_<offsetId> + reminder_15/5 + recurring + missed_recovery) by
// scanning storage keys, instead of a hardcoded list — so nothing new added
// by the smart scheduler is ever left dangling when a task is deleted.

export const cancelAllTaskNotifications = async (taskId: string): Promise<void> => {
  const prefix = `notif_state_${taskId}_`;
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const taskKeys = allKeys.filter((k) => k.startsWith(prefix));
    await Promise.all(
      taskKeys.map(async (key) => {
        const type = key.slice(prefix.length);
        await cancelTaskNotificationType(taskId, type);
      })
    );
    await clearStoredFingerprint(taskId);
  } catch (error) {
    log.warn(`Failed to fully cancel notifications for task ${taskId}`, error);
    // Fall back to the original fixed-type sweep so we still cancel the
    // well-known ones even if the AsyncStorage scan above failed.
    await Promise.all(TASK_NOTIF_TYPES.map((type) => cancelTaskNotificationType(taskId, type)));
  }
};

// ─── 11. Master scheduler ──────────────────────────────────────────────────────
/**
 * Call any time tasks are added / edited / deleted / completed, and once on
 * app start after tasks are (re)loaded.
 *
 * Optimization (requirement 9): each pending task's relevant fields are
 * fingerprinted; if a task's fingerprint hasn't changed since the last run
 * AND the global enabled/disabled flag hasn't changed either, its per-task
 * notifications are left completely untouched instead of being torn down
 * and recreated. This is also what keeps the new "immediate catch-up"
 * notifications in scheduleTaskReminderSuite from re-firing on every call —
 * once a task's fingerprint is stored, unchanged reschedules skip the whole
 * per-task pipeline, so the catch-up notification only ever fires once per
 * actual task change. Removed-task cleanup and the cheap recurring daily
 * notifications (morning/evening/summary/midnight/engagement) still run
 * every call, same as before.
 */
export const rescheduleAllNotifications = async (tasks: Task[]): Promise<void> => {
  if (!isNative()) return;

  try {
    const pending = getPendingTasks(tasks).slice(0, MAX_TASK_NOTIFICATIONS) as SmartTask[];
    const newIds = pending.map((t) => t.id);

    const storedIdsRaw = await AsyncStorage.getItem(KEY_ACTIVE_TASK_IDS);
    const oldIds: string[] = storedIdsRaw ? JSON.parse(storedIdsRaw) : [];
    const removedIds = oldIds.filter((id) => !newIds.includes(id));

    if (removedIds.length > 0) {
      await Promise.all(removedIds.map(cancelAllTaskNotifications));
      log.info(`Cancelled stale notifications for ${removedIds.length} task(s)`);
    }

    const enabled = await areNotificationsEnabled();

    const recurringDaily = enabled
      ? [
          scheduleMorningNotification(),
          scheduleEveningReview(),
          scheduleIntentionMemories(), // 8:00 PM - Intention Memories
          scheduleAIReview(), // 9:00 PM - AI Companion Review
          scheduleDailySummary(tasks),
          scheduleMidnightReset(),
          scheduleEngagementNotifications(tasks),
        ]
      : [];

    // If the enabled flag changed since last run, force a full re-arm of
    // every pending task regardless of fingerprint (arming/disarming with
    // the OS has to happen either way).
    const lastEnabledRaw = await AsyncStorage.getItem("notif_last_enabled_flag");
    const enabledFlagChanged = lastEnabledRaw !== null && lastEnabledRaw !== String(enabled);
    await AsyncStorage.setItem("notif_last_enabled_flag", String(enabled));

    const perTaskWork = pending.map(async (task) => {
      const fingerprint = computeTaskFingerprint(task);
      const previousFingerprint = await getStoredFingerprint(task.id);
      const unchanged = !enabledFlagChanged && previousFingerprint === fingerprint;

      if (unchanged) {
        // Nothing about this task or the global toggle changed — skip the
        // entire per-task pipeline. syncTaskNotification's own time-based
        // logic already keeps "sent"/"missed" states correct independent
        // of whether we call it again, so skipping is purely an
        // optimization, never a correctness risk. It's also what stops the
        // immediate catch-up notifications in scheduleTaskReminderSuite
        // from re-firing on every reschedule call.
        return;
      }

      const hasCustomOffsets = !!(task.reminderOffsets && task.reminderOffsets.length > 0);
      await Promise.all([
        hasCustomOffsets
          ? Promise.all([
              scheduleSmartTaskReminders(task, areNotificationsEnabled),
              scheduleTaskDeadline(task),
              scheduleOverdueReminder(task),
            ])
          : scheduleTaskReminderSuite(task),
        scheduleMissedRecovery(task, areNotificationsEnabled),
        task.recurrence ? scheduleRecurringTask(task, areNotificationsEnabled) : Promise.resolve(),
      ]);

      await setStoredFingerprint(task.id, fingerprint);
    });

    await Promise.all([...recurringDaily, ...perTaskWork]);

    await AsyncStorage.setItem(KEY_ACTIVE_TASK_IDS, JSON.stringify(newIds));
    log.info(`Rescheduled notifications after task update (${pending.length} pending today, enabled=${enabled})`);
  } catch (error) {
    log.error("Master scheduler failed", error);
  }
};

// ─── 12. Cancel everything (full reset, e.g. logout / delete account) ─────────

export const cancelAllNotifications = async (): Promise<void> => {
  if (!isNative()) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const allKeys = await AsyncStorage.getAllKeys();
    const notifKeys = allKeys.filter((k) => k.startsWith("notif_"));
    if (notifKeys.length > 0) {
      await AsyncStorage.multiRemove(notifKeys);
    }
    log.info("All notifications cancelled and keys cleared");
  } catch (error) {
    log.error("Failed to cancel all notifications", error);
  }
};

// ─── 13. Preference toggle entry point ─────────────────────────────────────────

const disableNotifications = async (): Promise<void> => {
  if (!isNative()) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const allKeys = await AsyncStorage.getAllKeys();
    const stateKeys = allKeys.filter((k) => k.startsWith("notif_state_"));
    if (stateKeys.length > 0) {
      const pairs = await AsyncStorage.multiGet(stateKeys);
      const updates: [string, string][] = [];
      for (const [key, raw] of pairs) {
        if (!raw) continue;
        try {
          const state: { status: string; fireAt: string } = JSON.parse(raw);
          if (state.status === "scheduled") {
            updates.push([key, JSON.stringify({ status: "pending", fireAt: state.fireAt })]);
          }
        } catch {
          // Skip malformed entries rather than failing the whole batch.
        }
      }
      if (updates.length > 0) {
        await AsyncStorage.multiSet(updates);
      }
    }

    log.info("Notifications disabled — OS schedules cancelled, per-task history preserved");
  } catch (error) {
    log.error("Failed to disable notifications", error);
  }
};

export const setNotificationsPreference = async (
  enabled: boolean,
  tasks?: Task[]
): Promise<void> => {
  await AsyncStorage.setItem(KEY_NOTIFICATIONS_ENABLED, String(enabled));

  if (!enabled) {
    await disableNotifications();
    log.info("Notifications turned OFF by user");
    return;
  }

  log.info("Notifications turned ON by user");
  if (tasks) {
    await rescheduleAllNotifications(tasks);
  }
};