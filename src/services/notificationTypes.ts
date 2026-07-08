// src/services/notificationTypes.ts
// Shared types for the Smart Reminder System. Nothing in here has side
// effects — safe to import from anywhere without circular-dependency risk.

import { Task } from "../types/task";

// ─── Reminder offsets (requirement 3 & 4) ─────────────────────────────────────

export interface ReminderOffset {
  /** Stable identifier used as the ledger notification "type", e.g. "1d", "2h". */
  id: string;
  /** Minutes before the task's date/time this should fire. 0 = at deadline. */
  minutesBefore: number;
  /** Human-readable label, e.g. "1 day before". */
  label: string;
}

/**
 * Sensible defaults matching the spec: 1 day / 2h / 1h / 30m / 15m / at
 * deadline. Used whenever a task doesn't specify its own `reminderOffsets`.
 *
 * NOTE: the "deadline" offset here is separate from (and in addition to)
 * the existing `scheduleTaskDeadline` notification. If you don't want a
 * duplicate notification firing at the exact deadline moment, either drop
 * "deadline" from the offsets you attach to a task, or rely on just this
 * offset and stop calling scheduleTaskDeadline for tasks that use custom
 * offsets — both existing behaviors are left untouched either way.
 */
export const DEFAULT_REMINDER_OFFSETS: ReminderOffset[] = [
  { id: "1d", minutesBefore: 1440, label: "1 day before" },
  { id: "2h", minutesBefore: 120, label: "2 hours before" },
  { id: "1h", minutesBefore: 60, label: "1 hour before" },
  { id: "30m", minutesBefore: 30, label: "30 minutes before" },
  { id: "15m", minutesBefore: 15, label: "15 minutes before" },
  { id: "deadline", minutesBefore: 0, label: "At deadline" },
];

// ─── Recurrence (requirement 5) ───────────────────────────────────────────────

export type RecurrenceFrequency = "none" | "daily" | "weekly" | "monthly" | "custom";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** Only used when frequency === "custom". Minutes between occurrences. */
  customIntervalMinutes?: number;
}

// ─── Quiet hours (requirement 6) ──────────────────────────────────────────────

export interface QuietHoursPrefs {
  enabled: boolean;
  startHour: number; // 0-23
  startMinute: number; // 0-59
  endHour: number; // 0-23
  endMinute: number; // 0-59
}

export const DEFAULT_QUIET_HOURS: QuietHoursPrefs = {
  enabled: false,
  startHour: 22,
  startMinute: 0,
  endHour: 7,
  endMinute: 0,
};

// ─── Notification history (requirement 7) ─────────────────────────────────────

export type NotificationHistoryStatus =
  | "scheduled"
  | "delivered"
  | "opened"
  | "completed_from_notification"
  | "snoozed"
  | "dismissed"
  | "missed";

export interface NotificationHistoryEntry {
  id: string;
  taskId: string;
  taskName: string;
  /** e.g. "reminder_1h", "deadline", "overdue_15", "recurring", "missed_recovery" */
  type: string;
  status: NotificationHistoryStatus;
  timestamp: string; // ISO
  meta?: Record<string, unknown>;
}

// ─── Task augmentation ────────────────────────────────────────────────────────
// Additive-only fields. Existing Task objects that don't have these still
// work everywhere — every consumer treats them as optional and falls back
// to existing default behavior.

export interface TaskReminderConfig {
  reminderOffsets?: ReminderOffset[];
  recurrence?: RecurrenceRule;
}

export type SmartTask = Task & Partial<TaskReminderConfig>;