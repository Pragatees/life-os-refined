/**
 * ============================================================================
 * LifeOS Notification Constants
 * ============================================================================
 *
 * Shared constants used throughout the notification system.
 *
 * This file should NEVER contain business logic.
 * ============================================================================
 */

import {
  AIReviewType,
  NotificationPriority,
  NotificationType,
} from "./NotificationTypes";

// -----------------------------------------------------------------------------
// Notification Channels
// -----------------------------------------------------------------------------

export const NOTIFICATION_CHANNELS = {
  TASK: {
    id: "task-channel",
    name: "Task Reminders",
    description: "Task reminders and overdue notifications",
  },

  GOAL: {
    id: "goal-channel",
    name: "Goal Reminders",
    description: "Goal reminders and deadline notifications",
  },

  NOTE: {
    id: "note-channel",
    name: "Note Reminders",
    description: "Note reminder notifications",
  },

  AI_REVIEW: {
    id: "ai-review-channel",
    name: "AI Reviews",
    description: "Daily, weekly and monthly AI productivity reviews",
  },

  ACCOUNT: {
    id: "account-channel",
    name: "Account",
    description: "Account related notifications",
  },

  SYSTEM: {
    id: "system-channel",
    name: "System",
    description: "Application notifications",
  },
} as const;

// -----------------------------------------------------------------------------
// Notification ID Prefixes
// -----------------------------------------------------------------------------

export const NOTIFICATION_PREFIX = {
  TASK: "task",
  GOAL: "goal",
  NOTE: "note",
  AI: "ai",
  ACCOUNT: "account",
  SYSTEM: "system",
} as const;

// -----------------------------------------------------------------------------
// Task Reminder Rules (minutes)
// -----------------------------------------------------------------------------

export const TASK_REMINDER = {
  /**
   * Standard reminder.
   * If task is created more than 15 minutes before its start time.
   */
  DEFAULT_BEFORE: 15,

  /**
   * If task is created between 6 and 14 minutes before due time.
   */
  SHORT_BEFORE: 5,

  /**
   * If remaining time is <= 5 minutes,
   * send reminder immediately.
   */
  IMMEDIATE_THRESHOLD: 5,

  /**
   * Overdue reminder after task time.
   */
  OVERDUE_AFTER: 15,
} as const;

// -----------------------------------------------------------------------------
// Reminder Offsets (minutes)
// -----------------------------------------------------------------------------

export const REMINDER_MINUTES = {
  TASK_BEFORE: TASK_REMINDER.DEFAULT_BEFORE,

  GOAL_BEFORE: 60 * 24, // 1 day

  NOTE_BEFORE: 15,

  OVERDUE: TASK_REMINDER.OVERDUE_AFTER,
} as const;

// -----------------------------------------------------------------------------
// Daily Notification Schedule
// -----------------------------------------------------------------------------

export const DAILY_SCHEDULE = {
  MORNING_SUMMARY: {
    hour: 6,
    minute: 0,
  },

  EVENING_SUMMARY: {
    hour: 20,
    minute: 0,
  },

  DAILY_AI_REVIEW: {
    hour: 21,
    minute: 0,
  },
} as const;

// -----------------------------------------------------------------------------
// AI Review Types
// -----------------------------------------------------------------------------

export const AI_REVIEW_TYPES: readonly AIReviewType[] = [
  AIReviewType.DAILY,
  AIReviewType.WEEKLY,
  AIReviewType.MONTHLY,
];

// -----------------------------------------------------------------------------
// Default Notification Settings
// -----------------------------------------------------------------------------

export const DEFAULT_NOTIFICATION = {
  priority: NotificationPriority.NORMAL,
  sound: true,
  vibrate: true,
} as const;

// -----------------------------------------------------------------------------
// Supported Notification Types
// -----------------------------------------------------------------------------

export const SUPPORTED_NOTIFICATION_TYPES: readonly NotificationType[] = [
  NotificationType.TASK,
  NotificationType.GOAL,
  NotificationType.NOTE,
  NotificationType.AI_REVIEW,
  NotificationType.ACCOUNT,
  NotificationType.SYSTEM,
];

// -----------------------------------------------------------------------------
// Notification Types (Task)
// -----------------------------------------------------------------------------

export const TASK_NOTIFICATION_TYPES = {
  REMINDER: "reminder",
  DUE: "due",
  OVERDUE: "overdue",
} as const;

// -----------------------------------------------------------------------------
// Default Notification Titles
// -----------------------------------------------------------------------------

export const NOTIFICATION_TITLES = {
  TASK: "Task Reminder",

  GOAL: "Goal Reminder",

  NOTE: "Note Reminder",

  AI_REVIEW: "AI Review",

  ACCOUNT: "Account",

  SYSTEM: "LifeOS",
} as const;

// -----------------------------------------------------------------------------
// Storage Keys
// -----------------------------------------------------------------------------

export const NOTIFICATION_STORAGE_KEYS = {
  INITIALIZED: "notification_initialized",

  PERMISSION_STATUS: "notification_permission_status",
} as const;

// -----------------------------------------------------------------------------
// Logger Tags
// -----------------------------------------------------------------------------

export const LOGGER_TAG = {
  MANAGER: "NotificationManager",

  PERMISSION: "NotificationPermissions",

  SCHEDULER: "NotificationScheduler",

  RESPONSE: "NotificationResponseService",

  TASK: "TaskNotificationService",

  GOAL: "GoalNotificationService",

  NOTE: "NoteNotificationService",

  AI: "AIReviewNotificationService",

  ACCOUNT: "AccountNotificationService",
} as const;