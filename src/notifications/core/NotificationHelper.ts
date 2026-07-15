/**
 * ============================================================================
 * LifeOS Notification Helper
 * ============================================================================
 *
 * Shared helper functions used throughout the notification system.
 *
 * This file contains NO Expo Notification logic.
 * It only provides reusable utility functions.
 * ============================================================================
 */
import {
  NOTIFICATION_PREFIX,
  TASK_NOTIFICATION_TYPES,
  TASK_REMINDER,
} from "./NotificationConstants";

class NotificationHelper {
  // ===========================================================================
  // Notification IDs
  // ===========================================================================

  /**
   * Generic Task notification ID.
   */
  getTaskNotificationId(taskId: string): string {
    return `${NOTIFICATION_PREFIX.TASK}_${taskId}`;
  }

  /**
   * Goal reminder notification ID.
   */
  getGoalReminderId(goalId: string): string {
    return `${NOTIFICATION_PREFIX.GOAL}_reminder_${goalId}`;
  }

  /**
   * Goal deadline notification ID.
   */
  getGoalDeadlineId(goalId: string): string {
    return `${NOTIFICATION_PREFIX.GOAL}_deadline_${goalId}`;
  }

  /**
   * Note reminder notification ID.
   */
  getNoteNotificationId(noteDate: string): string {
    return `${NOTIFICATION_PREFIX.NOTE}_${noteDate}`;
  }

  /**
   * AI Review notification ID.
   */
  getAIReviewNotificationId(reviewType: string): string {
    return `${NOTIFICATION_PREFIX.AI}_${reviewType.toLowerCase()}`;
  }

  /**
   * Account notification ID.
   */
  getAccountNotificationId(type: string): string {
    return `${NOTIFICATION_PREFIX.ACCOUNT}_${type}`;
  }

  // ===========================================================================
  // Date Helpers
  // ===========================================================================

  /**
   * Returns today's date (yyyy-MM-dd).
   */
  getToday(): string {
    const now = new Date();

    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")}`;
  }

  /**
   * Returns current Date object.
   */
  now(): Date {
    return new Date();
  }

  /**
   * Returns current timestamp.
   */
  nowInMilliseconds(): number {
    return Date.now();
  }

  /**
   * Combines backend date + time into a JavaScript Date.
   *
   * date : yyyy-MM-dd
   * time : HH:mm:ss
   */
  combineDateAndTime(date: string, time: string): Date {
    const [year, month, day] = date.split("-").map(Number);

    const [hour, minute, second = 0] = time.split(":").map(Number);

    return new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      second,
      0
    );
  }

  /**
   * Returns reminder trigger.
   */
  getReminderTrigger(
    eventDate: Date,
    minutesBefore: number
  ): Date {
    return new Date(
      eventDate.getTime() - minutesBefore * 60 * 1000
    );
  }

  /**
   * Returns overdue trigger.
   */
  getOverdueTrigger(
    eventDate: Date,
    minutesAfter: number
  ): Date {
    return new Date(
      eventDate.getTime() + minutesAfter * 60 * 1000
    );
  }

  /**
   * Returns true if supplied date string is today.
   */
  isToday(date: string): boolean {
    return date === this.getToday();
  }

  /**
   * Returns true if supplied Date is in the future.
   */
  isFuture(date: Date): boolean {
    return date.getTime() > Date.now();
  }

  /**
   * Returns true if supplied Date is in the past.
   */
  isPast(date: Date): boolean {
    return date.getTime() <= Date.now();
  }

  /**
   * Can this notification be scheduled?
   */
  canSchedule(trigger: Date): boolean {
    return this.isFuture(trigger);
  }

  // ===========================================================================
// Task Notification Helpers
// ===========================================================================

/**
 * Returns the remaining minutes until the task starts.
 */
getRemainingMinutes(taskDateTime: Date): number {
  return Math.floor(
    (taskDateTime.getTime() - Date.now()) / (60 * 1000)
  );
}

/**
 * Returns true if reminder should be sent immediately.
 */
shouldSendImmediateReminder(taskDateTime: Date): boolean {
  return (
    this.getRemainingMinutes(taskDateTime) <=
    TASK_REMINDER.IMMEDIATE_THRESHOLD
  );
}

/**
 * Returns the reminder offset (minutes) based on the task start time.
 *
 * >15 mins -> 15 mins before
 * 6-14 mins -> 5 mins before
 * <=5 mins -> Immediate
 */
getReminderOffset(taskDateTime: Date): number {
  const remaining = this.getRemainingMinutes(taskDateTime);

  if (remaining <= TASK_REMINDER.IMMEDIATE_THRESHOLD) {
    return 0;
  }

  if (remaining <= TASK_REMINDER.DEFAULT_BEFORE) {
    return TASK_REMINDER.SHORT_BEFORE;
  }

  return TASK_REMINDER.DEFAULT_BEFORE;
}

/**
 * Returns the correct reminder trigger.
 */
getSmartReminderTrigger(taskDateTime: Date): Date {
  const offset = this.getReminderOffset(taskDateTime);

  if (offset === 0) {
    return new Date(Date.now() + 1000);
  }

  return new Date(
    taskDateTime.getTime() - offset * 60 * 1000
  );
}

/**
 * Returns the task notification type.
 */
getTaskNotificationType(
  type: keyof typeof TASK_NOTIFICATION_TYPES
): string {
  return TASK_NOTIFICATION_TYPES[type];
}

  /**
   * Returns formatted date string.
   */
  formatDate(date: string): string {
    const [year, month, day] = date.split("-");
    return `${month}/${day}/${year}`;
  }

  /**
   * Returns formatted time string.
   */
  formatTime(time: string): string {
    const [hour, minute] = time.split(":");
    const hourNum = parseInt(hour, 10);
    const ampm = hourNum >= 12 ? "PM" : "AM";
    const displayHour = hourNum % 12 || 12;
    return `${displayHour}:${minute} ${ampm}`;
  }

  /**
   * Returns formatted date & time.
   */
  formatDateTime(date: string, time: string): string {
    return `${this.formatDate(date)} ${this.formatTime(time)}`;
  }
}



export default new NotificationHelper();