// src/services/notificationService.ts
// Install: npx expo install expo-notifications expo-device

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
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

export { getTodayDateString };

// ─── Fixed daily times ───────────────────────────────────────────────────────
const MORNING_HOUR = 6;   // was 8 — moved earlier per new requirement
const MORNING_MINUTE = 0;
const EVENING_HOUR = 19; // 7 PM
const EVENING_MINUTE = 0;
const SUMMARY_HOUR = 21; // 9 PM
const SUMMARY_MINUTE = 0;
const MIDNIGHT_HOUR = 0;   // 12:01 AM new-day reset
const MIDNIGHT_MINUTE = 1;

const MAX_TASK_NOTIFICATIONS = 50;

// ─── Storage keys ─────────────────────────────────────────────────────────────
const KEY_MORNING = "notif_morning";
const KEY_EVENING = "notif_evening";
const KEY_SUMMARY = "notif_summary";
const KEY_MIDNIGHT_RESET = "notif_midnight_reset";
const KEY_ACTIVE_TASK_IDS = "notif_active_task_ids";
// Same key the Settings screen writes to — single source of truth for the
// user's in-app on/off preference (separate from OS-level permission).
const KEY_NOTIFICATIONS_ENABLED = "notificationsEnabled";
const engagementKey = (hour: number) => `notif_engagement_${hour}`;

// ─── User preference gate ──────────────────────────────────────────────────────
/**
 * Reads the user's in-app notification preference. Defaults to true when the
 * key has never been set, so existing users keep getting notifications until
 * they explicitly turn the Settings toggle off.
 */
export const areNotificationsEnabled = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(KEY_NOTIFICATIONS_ENABLED);
    return v !== "false";
  } catch {
    return true;
  }
};

// ─── Per-task notification ledger ──────────────────────────────────────────────
/**
 * Tracks the delivery state of every individual task notification (reminder,
 * deadline, each overdue offset) so toggling notifications off/on — or
 * adding a task while they're off — never causes a duplicate or a
 * late/incorrect resend. This is the fix for that exact bug:
 *
 *  - "scheduled": currently armed with the OS, fireAt is in the future.
 *  - "sent":      delivered already (by the listener below, or inferred
 *                 because its fireAt time has passed while it was actively
 *                 scheduled) — never recreated again for this fireAt.
 *  - "pending":   we know it SHOULD fire at fireAt, but notifications are
 *                 currently off, so nothing is armed with the OS yet.
 *  - "missed":    its fireAt passed while it was only "pending" (off) or
 *                 brand new — the window is gone, so we deliberately do NOT
 *                 send it late. Prevents the "turn on -> instant blast of
 *                 everything that would've fired while off" problem.
 */
type TaskNotifStatus = "scheduled" | "sent" | "pending" | "missed";
interface TaskNotifState {
  status: TaskNotifStatus;
  fireAt: string; // ISO string — lets us detect the task's time being edited
  expoId?: string;
}

const TASK_NOTIF_TYPES: string[] = [
  "reminder",
  "deadline",
  ...OVERDUE_OFFSETS_MINUTES.map((m) => `overdue_${m}`),
];
const TASK_NOTIF_TYPE_SET = new Set(TASK_NOTIF_TYPES);

const notifStateKey = (taskId: string, type: string) => `notif_state_${taskId}_${type}`;

const getNotifState = async (taskId: string, type: string): Promise<TaskNotifState | null> => {
  try {
    const raw = await AsyncStorage.getItem(notifStateKey(taskId, type));
    return raw ? (JSON.parse(raw) as TaskNotifState) : null;
  } catch {
    return null;
  }
};

const setNotifState = async (taskId: string, type: string, state: TaskNotifState): Promise<void> => {
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

/**
 * Single source of truth for scheduling ANY per-task notification instance.
 * Every caller (reminder/deadline/overdue) just computes "when should this
 * fire" and hands it here — this function decides whether to actually
 * create it, skip it, or remember it for later, based on the ledger above.
 */
const syncTaskNotification = async (
  taskId: string,
  taskName: string,
  type: string,
  fireAt: Date | null,
  buildContent: () => Notifications.NotificationContentInput
): Promise<void> => {
  const prev = await getNotifState(taskId, type);

  // No valid time for this notification anymore (bad date, or condition no
  // longer applies) — cancel and forget it entirely.
  if (!fireAt) {
    if (prev?.expoId) {
      await Notifications.cancelScheduledNotificationAsync(prev.expoId).catch(() => {});
    }
    await clearNotifState(taskId, type);
    return;
  }

  const fireAtISO = fireAt.toISOString();
  const now = new Date();
  // If the task's date/time was edited, this is effectively a brand-new
  // notification instance — old sent/missed history no longer applies.
  const timeChanged = prev?.fireAt !== fireAtISO;

  if (!timeChanged && (prev?.status === "sent" || prev?.status === "missed")) {
    // Already delivered, or already deliberately skipped for this exact
    // fire time — never touch it again.
    return;
  }

  if (fireAt.getTime() <= now.getTime()) {
    // This notification's moment has already passed.
    if (!timeChanged && prev?.status === "scheduled") {
      // It was actively armed with the OS and its time has passed — local
      // notifications fire independently of app state, so treat it as sent
      // rather than recreating it.
      await setNotifState(taskId, type, { status: "sent", fireAt: fireAtISO });
    } else {
      // Either brand new, or it was only "pending" (never armed because
      // notifications were off) and time ran out — the window is gone.
      // Deliberately skip rather than sending a late/duplicate blast.
      if (prev?.expoId) {
        await Notifications.cancelScheduledNotificationAsync(prev.expoId).catch(() => {});
      }
      await setNotifState(taskId, type, { status: "missed", fireAt: fireAtISO });
    }
    return;
  }

  // fireAt is still in the future.
  const enabled = await areNotificationsEnabled();
  if (prev?.expoId) {
    await Notifications.cancelScheduledNotificationAsync(prev.expoId).catch(() => {});
  }

  if (!enabled) {
    // Remember what SHOULD happen once notifications are turned back on,
    // without arming anything with the OS while disabled.
    await setNotifState(taskId, type, { status: "pending", fireAt: fireAtISO });
    return;
  }

  try {
    const expoId = await Notifications.scheduleNotificationAsync({
      content: buildContent(),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
    await setNotifState(taskId, type, { status: "scheduled", fireAt: fireAtISO, expoId });
  } catch (error) {
    log.error(`Failed to schedule ${type} for "${taskName}"`, error);
  }
};

/**
 * Marks a per-task notification "sent" the instant the OS actually delivers
 * it (works whenever the app process is alive — foreground or background).
 * Call ONCE at module level, e.g. alongside registerMidnightResetListener:
 *
 *   useEffect(() => {
 *     const unsubscribe = registerTaskNotificationDeliveryListener();
 *     return unsubscribe;
 *   }, []);
 *
 * Not strictly required for correctness — syncTaskNotification's time-based
 * fallback already infers "sent" once a scheduled fireAt passes — but this
 * makes the ledger accurate immediately instead of on the next reschedule.
 */
export const registerTaskNotificationDeliveryListener = (): (() => void) => {
  if (!isNativePlatform()) return () => {};
  const subscription = Notifications.addNotificationReceivedListener(async (notification) => {
    const data = notification.request.content.data as
      | { taskId?: string; type?: string; minutes?: number }
      | undefined;
    if (!data?.taskId || !data?.type) return;

    const resolvedType = data.type === "overdue" ? `overdue_${data.minutes}` : data.type;
    if (!TASK_NOTIF_TYPE_SET.has(resolvedType)) return;

    const prev = await getNotifState(data.taskId, resolvedType);
    await setNotifState(data.taskId, resolvedType, {
      status: "sent",
      fireAt: prev?.fireAt ?? new Date().toISOString(),
    });
  });
  return () => subscription.remove();
};

// ─── Platform guard ───────────────────────────────────────────────────────────
/**
 * expo-notifications only works on iOS/Android physical or virtual devices.
 * Every exported scheduling function checks this first and no-ops on web or
 * unsupported environments — callers never need their own platform checks.
 */
const isNativePlatform = (): boolean => {
  if (Platform.OS === "web") return false;
  if (!Device.isDevice) return false;
  return true;
};

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

/** Quick runtime check before any scheduling call. */
export const getPermissionsStatus = async (): Promise<boolean> => {
  if (!isNativePlatform()) return false;
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

// ─── 2. Login welcome + permission-granted confirmations ─────────────────────
// Two distinct, immediate, one-off notifications:
//  - fireLoginWelcomeNotification: fired every time a user successfully signs
//    in. Call it from the login screen via
//    useTaskStore.getState().onLoginSuccess(user.fullName).
//  - firePermissionGrantedNotification: fired once, from _layout.tsx, the
//    very first time the OS grants permission — independent of login.

export const fireLoginWelcomeNotification = async (userName?: string): Promise<void> => {
  if (!isNativePlatform()) return;
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
  if (!isNativePlatform()) return;
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
    await Notifications.cancelScheduledNotificationAsync(expoId).catch(() => {
      // Already fired or already cancelled — not worth logging loudly.
    });
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
  // Cancel any previous notification under this key first — this is what
  // guarantees "never create duplicate notifications" across reschedules.
  await cancelNotification(storageKey);
  try {
    const expoId = await Notifications.scheduleNotificationAsync({ content, trigger });
    await AsyncStorage.setItem(storageKey, expoId);
  } catch (error) {
    log.error(`Failed to schedule (${storageKey})`, error);
  }
};

// ─── 4. Morning Motivation — 6:00 AM daily ────────────────────────────────────

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

// ─── 6. Daily Summary — 9:00 PM daily ─────────────────────────────────────────
// Content is a snapshot of today's counts taken at the moment this function
// runs. A local DAILY trigger can't ask "what's the count right now" once
// the app is closed, so this is re-run every time tasks change (added /
// completed / etc.), keeping the snapshot fresh as long as the app is opened
// at some point that day.

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
// Fires a lightweight "new day" local notification at 12:01 AM device time,
// so there's a visible new-day signal even if the app is never opened.
//
// IMPORTANT CAVEAT: the OS can deliver this while the app process is fully
// killed, in which case no JS runs and performMidnightCleanup() below never
// executes. That's fine — the AUTHORITATIVE reset is still
// resetForNewDayIfNeeded() in the task store (task.ts), which is checked on
// every store action and on rehydrate, so correctness never depends on this
// notification actually firing or being seen. This is a best-effort nudge +
// opportunistic tidy-up for when the app happens to be running.

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

/**
 * Best-effort opportunistic cleanup: removes lingering per-task notification
 * storage keys. Safe to call redundantly — rescheduleAllNotifications()
 * already performs the authoritative version of this via KEY_ACTIVE_TASK_IDS
 * diffing, every time it runs.
 */
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

/**
 * OPTIONAL: call ONCE at module level in _layout.tsx, alongside
 * initializeNotifications(), if you want the opportunistic cleanup above to
 * run when the 12:01 AM notification is delivered while the app is running.
 * Not required for correctness (see caveat above) — safe to skip.
 *
 *   useEffect(() => {
 *     const unsubscribe = registerMidnightResetListener();
 *     return unsubscribe;
 *   }, []);
 */
export const registerMidnightResetListener = (): (() => void) => {
  if (!isNativePlatform()) return () => {};
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    if (notification.request.content.data?.type === "midnight_reset") {
      performMidnightCleanup();
    }
  });
  return () => subscription.remove();
};

// ─── 7. Task Reminder — tiered, ledger-backed (no dup/late resends) ──────────

export const scheduleTaskReminder = async (task: Task): Promise<void> => {
  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);

  if (!taskDateTime || isTaskExpired(taskDateTime)) {
    await syncTaskNotification(task.id, task.taskName, "reminder", null, () => ({ title: "", body: "" }));
    if (!taskDateTime) log.warn(`Skipped reminder for "${task.taskName}" — invalid date/time`);
    return;
  }

  const plan = calculateReminderTime(taskDateTime);
  const fireAt = plan.immediate ? new Date(Date.now() + 1000) : plan.fireAt;
  const title = plan.immediate ? "⏰ Your task starts very soon" : "⏰ Upcoming Task";
  const body = plan.immediate
    ? `"${task.taskName}" is about to start.`
    : `"${task.taskName}" starts in ${plan.minutesBefore} minutes.`;

  await syncTaskNotification(task.id, task.taskName, "reminder", fireAt, () => ({
    title,
    body,
    sound: true,
    data: { taskId: task.id, type: "reminder" },
  }));
  log.info(`Reminder synced for "${task.taskName}"`);
};

// ─── 8. Task Deadline — fires exactly at task time, ledger-backed ────────────

export const scheduleTaskDeadline = async (task: Task): Promise<void> => {
  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);
  const fireAt = !taskDateTime || isTaskExpired(taskDateTime) ? null : taskDateTime;

  await syncTaskNotification(task.id, task.taskName, "deadline", fireAt, () => ({
    title: "🚨 Task Time",
    body: `Time to complete: ${task.taskName}`,
    sound: true,
    data: { taskId: task.id, type: "deadline" },
  }));
  log.info(`Deadline synced for "${task.taskName}"`);
};

// ─── 9. Overdue Reminder — +15 / +30 / +60 min after deadline, ledger-backed ─

export const scheduleOverdueReminder = async (task: Task): Promise<void> => {
  const taskDateTime = parseTaskDateTime(task.taskDate, task.taskTime);

  await Promise.all(
    OVERDUE_OFFSETS_MINUTES.map((minutes) => {
      const type = `overdue_${minutes}`;
      const fireAt = taskDateTime ? new Date(taskDateTime.getTime() + minutes * 60000) : null;
      return syncTaskNotification(task.id, task.taskName, type, fireAt, () => ({
        title: "⚠️ Task Still Pending",
        body: `Don't forget to finish "${task.taskName}".`,
        sound: true,
        data: { taskId: task.id, type: "overdue", minutes },
      }));
    })
  );
  log.info(`Overdue reminders synced for "${task.taskName}"`);
};

// ─── 9.5 Engagement Reminder — every 3 hrs, 9 AM–6 PM, only if tasks pending ──
// Fixed local DAILY triggers at ENGAGEMENT_HOURS (9, 12, 15, 18) — 3-hour
// spacing that sits between the 6 AM morning notification and the 9 PM
// summary without ever colliding with either. Like scheduleDailySummary,
// content is a snapshot taken whenever this runs (task added/edited/
// completed/deleted, or day start) rather than computed at fire time — so
// it's re-run on every task change to stay accurate. If there are no
// pending tasks, every engagement slot for today is cancelled outright
// instead of firing an empty/stale reminder.

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
// Cancels the OS-armed notification (if any) AND clears the ledger entry for
// every type, since the task itself is gone — nothing left to remember.

export const cancelAllTaskNotifications = async (taskId: string): Promise<void> => {
  await Promise.all(
    TASK_NOTIF_TYPES.map(async (type) => {
      const state = await getNotifState(taskId, type);
      if (state?.expoId) {
        await Notifications.cancelScheduledNotificationAsync(state.expoId).catch(() => {});
      }
      await clearNotifState(taskId, type);
    })
  );
};

// ─── 11. Master scheduler ──────────────────────────────────────────────────────
/**
 * Call any time tasks are added / edited / deleted / completed, and once on
 * app start after tasks are (re)loaded. Now also (re)arms the midnight-reset
 * trigger and the engagement reminders alongside morning/evening/summary and
 * all per-task notifications.
 */
export const rescheduleAllNotifications = async (tasks: Task[]): Promise<void> => {
  if (!isNativePlatform()) return;

  try {
    const pending = getPendingTasks(tasks).slice(0, MAX_TASK_NOTIFICATIONS);
    const newIds = pending.map((t) => t.id);

    const storedIdsRaw = await AsyncStorage.getItem(KEY_ACTIVE_TASK_IDS);
    const oldIds: string[] = storedIdsRaw ? JSON.parse(storedIdsRaw) : [];
    const removedIds = oldIds.filter((id) => !newIds.includes(id));

    if (removedIds.length > 0) {
      await Promise.all(removedIds.map(cancelAllTaskNotifications));
      log.info(`Cancelled stale notifications for ${removedIds.length} task(s)`);
    }

    const enabled = await areNotificationsEnabled();

    // Recurring daily notifications only make sense while enabled. While
    // disabled, disableNotifications() has already cancelled any that
    // existed, so there's nothing to (re)create here.
    const recurring = enabled
      ? [
          scheduleMorningNotification(),
          scheduleEveningReview(),
          scheduleDailySummary(tasks),
          scheduleMidnightReset(),
          scheduleEngagementNotifications(tasks),
        ]
      : [];

    // Per-task notifications always run — syncTaskNotification (inside each
    // of these) checks the enabled flag itself and records "pending" state
    // for tasks created/edited while notifications are off, without ever
    // recreating something already marked "sent" or "missed".
    await Promise.all([
      ...recurring,
      ...pending.map(async (task) => {
        await scheduleTaskReminder(task);
        await scheduleTaskDeadline(task);
        await scheduleOverdueReminder(task);
      }),
    ]);

    await AsyncStorage.setItem(KEY_ACTIVE_TASK_IDS, JSON.stringify(newIds));
    log.info(`Rescheduled notifications after task update (${pending.length} pending today, enabled=${enabled})`);
  } catch (error) {
    log.error("Master scheduler failed", error);
  }
};

// ─── 12. Cancel everything (full reset, e.g. logout / delete account) ─────────
// This wipes the per-task ledger too (unlike disableNotifications above),
// so it is NOT used by the Settings toggle anymore — only for a genuine
// full reset where remembering "already sent" no longer matters.

export const cancelAllNotifications = async (): Promise<void> => {
  if (!isNativePlatform()) return;
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

/**
 * Cancels every currently-armed OS notification (recurring + per-task) but,
 * unlike cancelAllNotifications(), preserves the per-task ledger — any entry
 * that was "scheduled" is downgraded to "pending" so it's correctly
 * re-evaluated (and not resent, and not silently lost) once notifications
 * are turned back on. This is what actually fixes the "turn off then on ->
 * duplicate/late notifications" bug.
 */
const disableNotifications = async (): Promise<void> => {
  if (!isNativePlatform()) return;
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
          const state: TaskNotifState = JSON.parse(raw);
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

/**
 * Call this from the Settings screen switch — it's the only place that
 * should write KEY_NOTIFICATIONS_ENABLED.
 *  - Turning OFF: persists the flag, then cancels every armed OS
 *    notification while keeping the per-task ledger intact (see
 *    disableNotifications above). Instant, no OS dialogs.
 *  - Turning ON: persists the flag, then reschedules from `tasks` if you
 *    have the current list handy (e.g. useTaskStore.getState().tasks).
 *    Anything already marked "sent" or correctly "missed" while off is left
 *    alone; only genuinely still-upcoming notifications get (re)armed.
 */
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