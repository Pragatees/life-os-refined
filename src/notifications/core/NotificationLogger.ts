/**
 * ============================================================================
 * LifeOS Notification Logger
 * ============================================================================
 *
 * Centralized logger for the notification system.
 *
 * Responsibilities
 * ----------------
 * ✓ Info logs
 * ✓ Warning logs
 * ✓ Error logs
 * ✓ Debug logs
 * ✓ Notification lifecycle logs
 * ✓ Synchronization logs
 * ✓ Smart reminder logs
 *
 * Every notification service should use this logger instead of console.log().
 * ============================================================================
 */

import { LOGGER_TAG } from "./NotificationConstants";

class NotificationLogger {
  /**
   * Enable logs only during development.
   */
  private readonly enabled = __DEV__;

  // ===========================================================================
  // Internal Logger
  // ===========================================================================

  private log(
    level: "log" | "warn" | "error" | "debug",
    tag: string,
    message: string,
    data?: unknown
  ): void {
    if (!this.enabled) return;

    const formatted = `[${tag}] ${message}`;

    switch (level) {
      case "log":
        data !== undefined
          ? console.log(formatted, data)
          : console.log(formatted);
        break;

      case "warn":
        data !== undefined
          ? console.warn(formatted, data)
          : console.warn(formatted);
        break;

      case "error":
        data !== undefined
          ? console.error(formatted, data)
          : console.error(formatted);
        break;

      case "debug":
        data !== undefined
          ? console.debug(formatted, data)
          : console.debug(formatted);
        break;
    }
  }

  // ===========================================================================
  // Info
  // ===========================================================================

  info(tag: string, message: string, data?: unknown): void {
    this.log("log", tag, message, data);
  }

  // ===========================================================================
  // Warning
  // ===========================================================================

  warn(tag: string, message: string, data?: unknown): void {
    this.log("warn", tag, message, data);
  }

  // ===========================================================================
  // Error
  // ===========================================================================

  error(tag: string, message: string, error?: unknown): void {
    this.log("error", tag, message, error);
  }

  // ===========================================================================
  // Debug
  // ===========================================================================

  debug(tag: string, message: string, data?: unknown): void {
    this.log("debug", tag, message, data);
  }

  // ===========================================================================
  // Notification Lifecycle
  // ===========================================================================

  notificationScheduled(
    id: string,
    title: string,
    trigger: Date
  ): void {
    this.info(
      LOGGER_TAG.SCHEDULER,
      `Scheduled notification "${id}"`,
      {
        title,
        trigger,
      }
    );
  }

  notificationCancelled(id: string): void {
    this.info(
      LOGGER_TAG.SCHEDULER,
      `Cancelled notification "${id}"`
    );
  }

  notificationRescheduled(
    taskName: string,
    type: string
  ): void {
    this.info(
      LOGGER_TAG.SCHEDULER,
      `${type} notification rescheduled for "${taskName}".`
    );
  }

  duplicatePrevented(
    taskId: string,
    type: string
  ): void {
    this.warn(
      LOGGER_TAG.SCHEDULER,
      `Duplicate ${type} notification prevented for task "${taskId}".`
    );
  }

  notificationClicked(data: unknown): void {
    this.info(
      LOGGER_TAG.RESPONSE,
      "Notification clicked",
      data
    );
  }

  // ===========================================================================
  // Task Notification Logs
  // ===========================================================================

  taskScheduled(taskName: string): void {
    this.info(
      LOGGER_TAG.TASK,
      `Notifications scheduled for "${taskName}".`
    );
  }

  taskRescheduled(taskName: string): void {
    this.info(
      LOGGER_TAG.TASK,
      `Notifications rescheduled for "${taskName}".`
    );
  }

  taskCancelled(taskId: string): void {
    this.info(
      LOGGER_TAG.TASK,
      `Cancelled notifications for task "${taskId}".`
    );
  }

  taskCompleted(taskId: string): void {
    this.info(
      LOGGER_TAG.TASK,
      `Task completed: ${taskId}`
    );
  }

  taskDeleted(taskId: string): void {
    this.info(
      LOGGER_TAG.TASK,
      `Task deleted: ${taskId}`
    );
  }

  // ===========================================================================
  // Smart Reminder Logs
  // ===========================================================================

  fifteenMinuteReminder(taskName: string): void {
    this.info(
      LOGGER_TAG.TASK,
      `15-minute reminder scheduled for "${taskName}".`
    );
  }

  fiveMinuteReminder(taskName: string): void {
    this.info(
      LOGGER_TAG.TASK,
      `5-minute reminder scheduled for "${taskName}".`
    );
  }

  immediateReminder(taskName: string): void {
    this.info(
      LOGGER_TAG.TASK,
      `Immediate reminder scheduled for "${taskName}".`
    );
  }

  dueNotification(taskName: string): void {
    this.info(
      LOGGER_TAG.TASK,
      `Due notification scheduled for "${taskName}".`
    );
  }

  overdueNotification(taskName: string): void {
    this.info(
      LOGGER_TAG.TASK,
      `Overdue notification scheduled for "${taskName}".`
    );
  }

  skippedPastTask(taskName: string): void {
    this.debug(
      LOGGER_TAG.TASK,
      `Skipping past task "${taskName}".`
    );
  }

  skippedCompletedTask(taskName: string): void {
    this.debug(
      LOGGER_TAG.TASK,
      `Skipping completed task "${taskName}".`
    );
  }

  // ===========================================================================
  // Synchronization Logs
  // ===========================================================================

  synchronizationStarted(
    service: string,
    count?: number
  ): void {
    this.info(
      service,
      count !== undefined
        ? `Synchronizing ${count} notification(s).`
        : "Synchronization started."
    );
  }

  synchronizationCompleted(service: string): void {
    this.info(
      service,
      "Synchronization completed."
    );
  }

  synchronizationFailed(
    service: string,
    error: unknown
  ): void {
    this.error(
      service,
      "Synchronization failed.",
      error
    );
  }

  // ===========================================================================
  // Permission Events
  // ===========================================================================

  permissionGranted(): void {
    this.info(
      LOGGER_TAG.PERMISSION,
      "Notification permission granted."
    );
  }

  permissionDenied(): void {
    this.warn(
      LOGGER_TAG.PERMISSION,
      "Notification permission denied."
    );
  }

  // ===========================================================================
  // Initialization Logs
  // ===========================================================================

  initialized(service: string): void {
    this.info(
      service,
      "Initialized successfully."
    );
  }

  disposed(service: string): void {
    this.info(
      service,
      "Disposed successfully."
    );
  }

  shutdown(service: string): void {
    this.info(
      service,
      "Shutdown completed."
    );
  }

  restarted(service: string): void {
    this.info(
      service,
      "Restart completed."
    );
  }
}

export default new NotificationLogger();