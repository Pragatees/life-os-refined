// src/types/recurrence.ts
//
// Purely local (frontend-only) types describing how a task repeats.
// NONE of this is ever sent to the backend — it lives only in AsyncStorage.

import { Priority } from "./task";

export type RecurrenceType = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";

/**
 * A recurrence "rule" represents one recurring lineage (e.g. "Morning Workout,
 * every day"). It is NOT stored on the Task entity — it lives entirely in
 * AsyncStorage and is linked to whichever task is the most recent occurrence
 * via the task -> rule index (see recurrenceService.ts).
 */
export interface RecurrenceRule {
  /** Stable local id for this recurrence lineage. */
  ruleId: string;

  type: RecurrenceType;

  /** Only used when type === "CUSTOM" ("Every X Days"). */
  intervalDays?: number;

  /**
   * Day-of-month the series is anchored to (taken from the first occurrence).
   * Used for MONTHLY so "31 Jan" -> "28 Feb" -> "31 Mar" instead of drifting
   * to "28 Mar".
   */
  anchorDay: number;

  /** Template fields used to create every future occurrence. */
  taskName: string;
  description: string;
  taskTime: string; // "HH:mm"
  priority: Priority;

  /** Whether this rule is still generating future occurrences. */
  active: boolean;

  /** YYYY-MM-DD date of the most recently created (or original) occurrence. */
  lastOccurrenceDate: string;

  /** Backend id of the most recently created occurrence, for reference. */
  lastGeneratedTaskId: string;

  createdAt: string;
}

export interface RecurrenceSelection {
  type: RecurrenceType;
  intervalDays?: number;
}