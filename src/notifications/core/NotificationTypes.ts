/**
 * ============================================================================
 * LifeOS Notification Types
 * ============================================================================
 *
 * Shared notification models used throughout the notification system.
 * This file contains ONLY enums, interfaces and shared models.
 * No business logic belongs here.
 *
 * No bug found in this file — included unchanged for completeness.
 * ============================================================================
 */

export enum NotificationType {
  TASK = "TASK",
  GOAL = "GOAL",
  NOTE = "NOTE",
  AI_REVIEW = "AI_REVIEW",
  ACCOUNT = "ACCOUNT",
  ROUTINE = "ROUTINE",
  SYSTEM = "SYSTEM",
}

export enum TaskNotificationType {
  REMINDER = "REMINDER",
  DUE = "DUE",
  OVERDUE = "OVERDUE",
}

export enum AIReviewType {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
}

export enum RoutineNotificationType {
  MORNING_MOTIVATION = "MORNING_MOTIVATION",

  ENGAGEMENT_09 = "ENGAGEMENT_09",
  ENGAGEMENT_11 = "ENGAGEMENT_11",
  ENGAGEMENT_13 = "ENGAGEMENT_13",
  ENGAGEMENT_15 = "ENGAGEMENT_15",
  ENGAGEMENT_17 = "ENGAGEMENT_17",

  EVENING_PLANNING = "EVENING_PLANNING",

  DAILY_SUMMARY = "DAILY_SUMMARY",
}

export enum NotificationPriority {
  LOW = "LOW",
  NORMAL = "NORMAL",
  HIGH = "HIGH",
}

export enum NotificationPermissionStatus {
  GRANTED = "GRANTED",
  DENIED = "DENIED",
  UNDETERMINED = "UNDETERMINED",
}

export interface NotificationPayload
  extends Record<string, unknown> {
  type: NotificationType;
  taskId?: string;
  notificationType?: TaskNotificationType;
  goalId?: string;
  noteDate?: string;
  reviewType?: AIReviewType;
  routineType?: RoutineNotificationType;
  screen?: string;
}

export interface NotificationContent {
  title: string;
  body: string;
  payload: NotificationPayload;
  priority?: NotificationPriority;
  sound?: boolean;
  vibrate?: boolean;
}

export interface NotificationSchedule {
  id: string;
  content: NotificationContent;
  trigger: Date;
}

export interface NotificationResponse {
  identifier?: string;
  payload: NotificationPayload;
}

export interface NotificationChannel {
  id: string;
  name: string;
  description: string;
}

export interface NotificationAction {
  id: string;
  title: string;
  destructive?: boolean;
}

export interface PendingNotification {
  identifier: string;
  payload: NotificationPayload;
  trigger: Date;
}