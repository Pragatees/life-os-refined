/**
 * ============================================================================
 * LifeOS Notification Types
 * ============================================================================
 *
 * Shared notification models used throughout the notification system.
 *
 * This file contains ONLY enums, interfaces and shared models.
 * No business logic belongs here.
 * ============================================================================
 */

export enum NotificationType {
  TASK = "TASK",
  GOAL = "GOAL",
  NOTE = "NOTE",
  AI_REVIEW = "AI_REVIEW",
  ACCOUNT = "ACCOUNT",
  SYSTEM = "SYSTEM",
}

/**
 * ============================================================================
 * Task Notification Type
 * ============================================================================
 *
 * Used to distinguish different notifications for the same task.
 * ============================================================================
 */
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

/**
 * ===========================================================================
 * Notification Payload
 * ===========================================================================
 *
 * Data attached to every notification.
 * Used for navigation when a notification is tapped.
 */
export interface NotificationPayload
  extends Record<string, unknown> {

  /**
   * Main notification category.
   */
  type: NotificationType;

  /**
   * Task notification fields
   */
  taskId?: string;

  notificationType?: TaskNotificationType;

  /**
   * Goal notification fields
   */
  goalId?: string;

  /**
   * Note notification fields
   */
  noteDate?: string;

  /**
   * AI Review fields
   */
  reviewType?: AIReviewType;

  /**
   * Optional navigation screen.
   */
  screen?: string;
}

/**
 * ===========================================================================
 * Notification Content
 * ===========================================================================
 */
export interface NotificationContent {
  title: string;

  body: string;

  payload: NotificationPayload;

  priority?: NotificationPriority;

  sound?: boolean;

  vibrate?: boolean;
}

/**
 * ===========================================================================
 * Notification Schedule
 * ===========================================================================
 */
export interface NotificationSchedule {

  /**
   * Logical notification identifier.
   *
   * NOTE:
   * Expo generates its own notification identifier internally.
   * This ID is used only inside the application.
   */
  id: string;

  /**
   * Notification content.
   */
  content: NotificationContent;

  /**
   * Trigger date.
   */
  trigger: Date;
}

/**
 * ===========================================================================
 * Notification Response
 * ===========================================================================
 */
export interface NotificationResponse {

  /**
   * Expo notification identifier.
   */
  identifier?: string;

  /**
   * Notification payload.
   */
  payload: NotificationPayload;
}

/**
 * ===========================================================================
 * Notification Channel
 * ===========================================================================
 */
export interface NotificationChannel {
  id: string;

  name: string;

  description: string;
}

/**
 * ===========================================================================
 * Notification Action
 * ===========================================================================
 */
export interface NotificationAction {
  id: string;

  title: string;

  /**
   * Future support for destructive actions.
   */
  destructive?: boolean;
}

/**
 * ===========================================================================
 * Pending Notification
 * ===========================================================================
 *
 * Internal model used by NotificationScheduler while comparing
 * scheduled notifications with pending Expo notifications.
 */
export interface PendingNotification {
  identifier: string;

  payload: NotificationPayload;

  trigger: Date;
}