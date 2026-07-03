// src/services/notificationUtils.ts
// Pure helper functions — deliberately no expo-notifications import here, so
// this file stays trivially unit-testable in isolation from the SDK.

import { Task } from "../types/task";

export const MAX_FUTURE_DAYS = 60;

/** Today's date as "yyyy-MM-dd" in local time. */
export const getTodayDateString = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Combines a task's date + time strings into a single Date, or null if
 * either field is missing/malformed. Accepts "H:mm", "HH:mm", or "HH:mm:ss".
 */
export const parseTaskDateTime = (
  taskDate: string | undefined | null,
  taskTime: string | undefined | null
): Date | null => {
  if (!taskDate || !taskTime) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) return null;

  const timeOnlyHHMM = taskTime.split(":").slice(0, 2).join(":");
  const normalizedTime = timeOnlyHHMM.padStart(5, "0");
  if (!/^\d{2}:\d{2}$/.test(normalizedTime)) return null;

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
  if (date > maxFuture) return null;

  return date;
};

/** True once `taskDateTime` has already passed relative to `now`. */
export const isTaskExpired = (taskDateTime: Date, now: Date = new Date()): boolean =>
  taskDateTime.getTime() <= now.getTime();

export interface ReminderPlan {
  /** Absolute time the reminder notification should fire. */
  fireAt: Date;
  /** How many minutes before the task this reminder represents (0 = immediate). */
  minutesBefore: number;
  /** True if this is the "starts very soon" immediate-fire case. */
  immediate: boolean;
}

/**
 * Tiered reminder rule from the spec:
 *   > 60 min away   → remind 30 min before
 *   30–60 min away  → remind 15 min before
 *   10–30 min away  → remind 5 min before
 *   < 5 min away    → fire immediately, never skip
 *
 * NOTE / assumption: the spec leaves the 5–10 minute range unspecified. To
 * avoid a silent gap, this function extends the "5 min before" tier down to
 * the 5-minute boundary, so every distance from now to the task has a
 * defined behavior with no dead zone.
 */
export const calculateReminderTime = (
  taskDateTime: Date,
  now: Date = new Date()
): ReminderPlan => {
  const minutesUntil = (taskDateTime.getTime() - now.getTime()) / 60000;

  if (minutesUntil < 5) {
    return { fireAt: now, minutesBefore: 0, immediate: true };
  }
  if (minutesUntil <= 30) {
    return { fireAt: new Date(taskDateTime.getTime() - 5 * 60000), minutesBefore: 5, immediate: false };
  }
  if (minutesUntil <= 60) {
    return { fireAt: new Date(taskDateTime.getTime() - 15 * 60000), minutesBefore: 15, immediate: false };
  }
  return { fireAt: new Date(taskDateTime.getTime() - 30 * 60000), minutesBefore: 30, immediate: false };
};

/** A task is only in scope for reminder/deadline/overdue notifications if it's today and incomplete. */
export const shouldScheduleReminder = (task: Task, today: string = getTodayDateString()): boolean =>
  !task.completed && task.taskDate === today;

/** Filters a task list down to today's incomplete tasks (drives reminders + daily summary). */
export const getPendingTasks = (tasks: Task[], today: string = getTodayDateString()): Task[] =>
  tasks.filter((t) => shouldScheduleReminder(t, today));

/** Offsets (in minutes after the deadline) at which overdue reminders fire. */
export const OVERDUE_OFFSETS_MINUTES = [15, 30, 60] as const;

/**
 * Hours (24h, local device time) at which the "still pending" engagement
 * reminder fires. Spaced 3 hours apart — 9 AM, 12 PM, 3 PM, 6 PM — deliberately
 * excluding 6 (morning notification) and 21 (daily summary) so it never
 * collides with either of those. Consumed by scheduleEngagementNotifications()
 * in notificationService.ts.
 */
export const ENGAGEMENT_HOURS = [9, 12, 15, 18] as const;

export interface DailyCounts {
  total: number;
  completed: number;
  pending: number;
  completionPercent: number;
}

/** Total / completed / pending / completion% for today's tasks — feeds the Daily Summary. */
export const getDailyCounts = (tasks: Task[], today: string = getTodayDateString()): DailyCounts => {
  const todays = tasks.filter((t) => t.taskDate === today);
  const total = todays.length;
  const completed = todays.filter((t) => t.completed).length;
  const pending = total - completed;
  const completionPercent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, pending, completionPercent };
};