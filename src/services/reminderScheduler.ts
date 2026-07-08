// src/services/reminderScheduler.ts
//
// This module owns:
//  - The per-task notification ledger (scheduled/sent/pending/missed) —
//    lifted verbatim from the original notificationService.ts so behavior
//    is 100% unchanged (requirement: keep the existing ledger system).
//  - Multi-reminder scheduling per task (requirement 3 & 4).
//  - Recurring task notifications (requirement 5).
//  - Quiet hours support (requirement 6).
//  - Smart missed-task recovery (requirement 8).
//  - A task "fingerprint" helper used by notificationService's optimized
//    rescheduler (requirement 9).

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { notificationLogger as log } from "./notificationLogger";
import { parseTaskDateTime, isTaskExpired, OVERDUE_OFFSETS_MINUTES } from "./notificationUtils";
import { CATEGORY_TASK_ACTIONABLE, CATEGORY_MISSED_RECOVERY } from "./notificationCategories";
import { logNotificationEvent } from "./notificationHistory";
import {
  DEFAULT_REMINDER_OFFSETS,
  DEFAULT_QUIET_HOURS,
  QuietHoursPrefs,
  ReminderOffset,
  SmartTask,
} from "./notificationTypes";

// ─── Platform guard (shared) ───────────────────────────────────────────────────

export const isNativePlatform = (): boolean => {
  if (Platform.OS === "web") return false;
  if (!Device.isDevice) return false;
  return true;
};

// ─── Per-task notification ledger (unchanged from original) ──────────────────
// See original file's header comment for the full explanation of the four
// states. Behavior here is identical — only the location moved so the new
// scheduling code (multi-reminder / recurring / recovery) can share it.

type TaskNotifStatus = "scheduled" | "sent" | "pending" | "missed";
interface TaskNotifState {
  status: TaskNotifStatus;
  fireAt: string;
  expoId?: string;
}

const notifStateKey = (taskId: string, type: string) => `notif_state_${taskId}_${type}`;

export const getNotifState = async (
  taskId: string,
  type: string
): Promise<TaskNotifState | null> => {
  try {
    const raw = await AsyncStorage.getItem(notifStateKey(taskId, type));
    return raw ? (JSON.parse(raw) as TaskNotifState) : null;
  } catch {
    return null;
  }
};

const setNotifState = async (
  taskId: string,
  type: string,
  state: TaskNotifState
): Promise<void> => {
  try {
    await AsyncStorage.setItem(notifStateKey(taskId, type), JSON.stringify(state));
  } catch (error) {
    log.warn(`Failed to persist notif state (${taskId}/${type})`, error);
  }
};

const clearNotifState = async (taskId: string, type: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(notifStateKey(taskId, type));
  } catch {
    // Non-critical.
  }
};

/** True for every notification "type" this scheduler recognizes as task-owned. */
export const isKnownTaskNotifType = (type: string): boolean =>
  type === "deadline" ||
  type === "recurring" ||
  type === "missed_recovery" ||
  type.startsWith("reminder") ||
  type.startsWith("overdue_");

/**
 * Same single source of truth for scheduling ANY per-task notification
 * instance as the original file. Unchanged logic: decides create / skip /
 * remember based on the ledger, and never re-sends something already
 * "sent" or "missed" for the same fireAt.
 */
export const syncTaskNotification = async (
  taskId: string,
  taskName: string,
  type: string,
  fireAt: Date | null,
  buildContent: () => Notifications.NotificationContentInput,
  areNotificationsEnabledFn: () => Promise<boolean>
): Promise<void> => {
  const prev = await getNotifState(taskId, type);

  if (!fireAt) {
    if (prev?.expoId) {
      await Notifications.cancelScheduledNotificationAsync(prev.expoId).catch(() => {});
    }
    await clearNotifState(taskId, type);
    return;
  }

  const fireAtISO = fireAt.toISOString();
  const now = new Date();
  const timeChanged = prev?.fireAt !== fireAtISO;

  if (!timeChanged && (prev?.status === "sent" || prev?.status === "missed")) {
    return;
  }

  if (fireAt.getTime() <= now.getTime()) {
    if (!timeChanged && prev?.status === "scheduled") {
      await setNotifState(taskId, type, { status: "sent", fireAt: fireAtISO });
      await logNotificationEvent(taskId, taskName, type, "delivered");
    } else {
      if (prev?.expoId) {
        await Notifications.cancelScheduledNotificationAsync(prev.expoId).catch(() => {});
      }
      await setNotifState(taskId, type, { status: "missed", fireAt: fireAtISO });
      await logNotificationEvent(taskId, taskName, type, "missed");
    }
    return;
  }

  const enabled = await areNotificationsEnabledFn();
  if (prev?.expoId) {
    await Notifications.cancelScheduledNotificationAsync(prev.expoId).catch(() => {});
  }

  if (!enabled) {
    await setNotifState(taskId, type, { status: "pending", fireAt: fireAtISO });
    return;
  }

  try {
    const expoId = await Notifications.scheduleNotificationAsync({
      content: buildContent(),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    await setNotifState(taskId, type, { status: "scheduled", fireAt: fireAtISO, expoId });
    await logNotificationEvent(taskId, taskName, type, "scheduled", { fireAt: fireAtISO });
  } catch (error) {
    log.error(`Failed to schedule ${type} for "${taskName}"`, error);
  }
};

/** Cancels the OS notification + clears the ledger entry for one (taskId, type). */
export const cancelTaskNotificationType = async (taskId: string, type: string): Promise<void> => {
  const state = await getNotifState(taskId, type);
  if (state?.expoId) {
    await Notifications.cancelScheduledNotificationAsync(state.expoId).catch(() => {});
  }
  await clearNotifState(taskId, type);
};

// ─── Quiet hours (requirement 6) ───────────────────────────────────────────────

const KEY_QUIET_HOURS = "notif_quiet_hours_prefs";

export const getQuietHoursPrefs = async (): Promise<QuietHoursPrefs> => {
  try {
    const raw = await AsyncStorage.getItem(KEY_QUIET_HOURS);
    return raw ? { ...DEFAULT_QUIET_HOURS, ...JSON.parse(raw) } : DEFAULT_QUIET_HOURS;
  } catch {
    return DEFAULT_QUIET_HOURS;
  }
};

export const setQuietHoursPrefs = async (prefs: QuietHoursPrefs): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEY_QUIET_HOURS, JSON.stringify(prefs));
  } catch (error) {
    log.warn("Failed to persist quiet hours preference", error);
  }
};

/**
 * If `date` falls inside the user's quiet-hours window, pushes it forward
 * to the window's end time (same day, or next day if the window wraps past
 * midnight). Otherwise returns `date` unchanged. Never moves a date
 * *earlier* — only ever postpones, per the requirement.
 */
export const adjustForQuietHours = async (date: Date): Promise<Date> => {
  const prefs = await getQuietHoursPrefs();
  if (!prefs.enabled) return date;

  const minutesOfDay = date.getHours() * 60 + date.getMinutes();
  const start = prefs.startHour * 60 + prefs.startMinute;
  const end = prefs.endHour * 60 + prefs.endMinute;

  const inWindow = start <= end ? minutesOfDay >= start && minutesOfDay < end : minutesOfDay >= start || minutesOfDay < end;

  if (!inWindow) return date;

  const adjusted = new Date(date);
  adjusted.setHours(prefs.endHour, prefs.endMinute, 0, 0);
  // Overnight window (e.g. 22:00 -> 07:00): if the original time was in the
  // "before midnight" half, the end time is the *next* calendar day.
  if (start > end && minutesOfDay >= start) {
    adjusted.setDate(adjusted.getDate() + 1);
  }
  return adjusted;
};

// ─── Multi-reminder scheduling (requirement 3 & 4) ─────────────────────────────

const buildReminderContent = (
  task: SmartTask,
  offset: ReminderOffset
): Notifications.NotificationContentInput => ({
  title: offset.minutesBefore === 0 ? "⏰ Task Time" : "⏰ Upcoming Task",
  body:
    offset.minutesBefore === 0
      ? `"${task.taskName}" starts now.`
      : `"${task.taskName}" — ${offset.label}.`,
  sound: true,
  categoryIdentifier: CATEGORY_TASK_ACTIONABLE,
  data: { taskId: task.id, type: `reminder_${offset.id}` },
});

/**
 * Schedules one notification per reminder offset attached to the task
 * (falling back to DEFAULT_REMINDER_OFFSETS if the task has none). Each
 * offset gets its own ledger entry (`reminder_<offsetId>`), so they're
 * independently tracked, independently cancellable, and independently
 * immune to duplication — same guarantee the single-reminder path had.
 *
 * This is additive: the original `scheduleTaskReminder` (single reminder)
 * is untouched and still works for any task that doesn't opt into custom
 * offsets.
 */
export const scheduleSmartTaskReminders = async (
  task: SmartTask,
  areNotificationsEnabledFn: () => Promise<boolean>
): Promise<void> => {
  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);
  const offsets = task.reminderOffsets && task.reminderOffsets.length > 0 ? task.reminderOffsets : DEFAULT_REMINDER_OFFSETS;

  await Promise.all(
    offsets.map(async (offset) => {
      const type = `reminder_${offset.id}`;
      let fireAt: Date | null = null;
      if (taskDateTime && !isTaskExpired(taskDateTime)) {
        fireAt = new Date(taskDateTime.getTime() - offset.minutesBefore * 60000);
        if (fireAt.getTime() <= Date.now()) fireAt = null; // this specific offset has already passed
        else fireAt = await adjustForQuietHours(fireAt);
      }
      await syncTaskNotification(
        task.id,
        task.taskName,
        type,
        fireAt,
        () => buildReminderContent(task, offset),
        areNotificationsEnabledFn
      );
    })
  );
  log.info(`Smart reminders synced for "${task.taskName}" (${offsets.length} offset(s))`);
};

// ─── Recurring tasks (requirement 5) ───────────────────────────────────────────

/**
 * Computes the next occurrence strictly after `after`, starting from
 * `baseDate` and stepping by the recurrence's frequency. Bounded loop
 * guards against pathological inputs (e.g. a 0-minute custom interval).
 */
export const computeNextOccurrence = (
  baseDate: Date,
  recurrence: SmartTask["recurrence"],
  after: Date = new Date()
): Date | null => {
  if (!recurrence || recurrence.frequency === "none") return null;

  const next = new Date(baseDate);
  const advance = () => {
    switch (recurrence.frequency) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
      case "custom":
        next.setMinutes(next.getMinutes() + Math.max(recurrence.customIntervalMinutes ?? 1440, 1));
        break;
    }
  };

  let guard = 0;
  while (next.getTime() <= after.getTime() && guard < 1000) {
    advance();
    guard += 1;
  }
  return next;
};

/**
 * Arms the *next* occurrence of a recurring task. Deliberately does not try
 * to pre-schedule every future occurrence with a native repeating trigger
 * (custom/monthly intervals don't map cleanly onto Expo's DAILY/WEEKLY
 * triggers) — instead it re-computes and re-arms the single next
 * occurrence every time this is called.
 *
 * CAVEAT (same pattern as the existing midnight-reset / daily-summary
 * comments in this codebase): once the currently-armed occurrence fires,
 * the *following* occurrence only gets armed the next time
 * rescheduleAllNotifications() runs (task edited, app opened, etc). If the
 * app is opened at least once between occurrences — which is the same
 * assumption the existing daily summary already relies on — this stays
 * accurate indefinitely.
 */
export const scheduleRecurringTask = async (
  task: SmartTask,
  areNotificationsEnabledFn: () => Promise<boolean>
): Promise<void> => {
  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);
  const recurrence = task.recurrence;

  if (!recurrence || recurrence.frequency === "none" || !taskDateTime) {
    await syncTaskNotification(
      task.id,
      task.taskName,
      "recurring",
      null,
      () => ({ title: "", body: "" }),
      areNotificationsEnabledFn
    );
    return;
  }

  const nextFireAt = computeNextOccurrence(taskDateTime, recurrence);
  const adjusted = nextFireAt ? await adjustForQuietHours(nextFireAt) : null;

  await syncTaskNotification(
    task.id,
    task.taskName,
    "recurring",
    adjusted,
    () => ({
      title: "🔁 Recurring Task",
      body: `"${task.taskName}" is due again.`,
      sound: true,
      categoryIdentifier: CATEGORY_TASK_ACTIONABLE,
      data: { taskId: task.id, type: "recurring" },
    }),
    areNotificationsEnabledFn
  );
  log.info(`Recurring notification synced for "${task.taskName}" (${recurrence.frequency})`);
};

// ─── Smart missed-task recovery (requirement 8) ───────────────────────────────

/** Minutes after the last overdue reminder before asking "move to tomorrow?". */
const RECOVERY_DELAY_MINUTES = 15;

/**
 * If a task is still incomplete after every overdue reminder has had its
 * chance to fire, this schedules one more notification asking whether to
 * move it to tomorrow. Fires (max overdue offset + RECOVERY_DELAY_MINUTES)
 * after the deadline. Uses the same ledger, so it's exempt from the same
 * duplicate/late-resend problems as everything else.
 *
 * Only fires for tasks the caller still considers "pending" — same
 * precondition rescheduleAllNotifications() already applies to overdue
 * reminders, so completed tasks never receive this.
 */
export const scheduleMissedRecovery = async (
  task: SmartTask,
  areNotificationsEnabledFn: () => Promise<boolean>
): Promise<void> => {
  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);
  const maxOverdueOffset = OVERDUE_OFFSETS_MINUTES.length > 0 ? Math.max(...OVERDUE_OFFSETS_MINUTES) : 0;

  let fireAt: Date | null = null;
  if (taskDateTime && isTaskExpired(taskDateTime)) {
    fireAt = new Date(taskDateTime.getTime() + (maxOverdueOffset + RECOVERY_DELAY_MINUTES) * 60000);
    fireAt = await adjustForQuietHours(fireAt);
  }

  await syncTaskNotification(
    task.id,
    task.taskName,
    "missed_recovery",
    fireAt,
    () => ({
      title: "❓ Still pending",
      body: `"${task.taskName}" is overdue. Move it to tomorrow?`,
      sound: true,
      categoryIdentifier: CATEGORY_MISSED_RECOVERY,
      data: { taskId: task.id, type: "missed_recovery" },
    }),
    areNotificationsEnabledFn
  );
};

// ─── Task fingerprinting (requirement 9) ──────────────────────────────────────
// Cheap way to detect "did anything relevant about this task change since
// the last reschedule" so rescheduleAllNotifications() can skip tasks that
// didn't change instead of re-running the full per-task pipeline for every
// task on every call.

const fingerprintKey = (taskId: string) => `notif_task_fp_${taskId}`;

export const computeTaskFingerprint = (task: SmartTask): string =>
  JSON.stringify({
    taskDate: task.taskDate,
    taskTime: task.taskTime,
    taskName: task.taskName,
    reminderOffsets: task.reminderOffsets ?? null,
    recurrence: task.recurrence ?? null,
  });

export const getStoredFingerprint = async (taskId: string): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(fingerprintKey(taskId));
  } catch {
    return null;
  }
};

export const setStoredFingerprint = async (taskId: string, fingerprint: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(fingerprintKey(taskId), fingerprint);
  } catch (error) {
    log.warn(`Failed to store fingerprint for task ${taskId}`, error);
  }
};

export const clearStoredFingerprint = async (taskId: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(fingerprintKey(taskId));
  } catch {
    // Non-critical.
  }
};