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
 *
 * FIX: `enabled = __DEV__` used to gate EVERY level, including error().
 * That meant every catch-block failure in the notification system was
 * completely silent in release builds — you had zero visibility into why
 * something failed. info/warn/debug remain dev-only (they're chatty and
 * not worth persisting), but error() now always logs to console AND is
 * persisted to AsyncStorage so it can be inspected on a real device after
 * the fact, even without an attached debugger.
 * ============================================================================
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { LOGGER_TAG, NOTIFICATION_STORAGE_KEYS } from "./NotificationConstants";

const MAX_PERSISTED_ERRORS = 50;

interface PersistedErrorEntry {
  timestamp: string;
  tag: string;
  message: string;
  error?: string;
}

class NotificationLogger {
  /**
   * Gates chatty (info/warn/debug) logs only. Error logs are NEVER gated —
   * see class doc comment above.
   */
  private readonly verboseEnabled = __DEV__;

  // ===========================================================================
  // Internal Logger
  // ===========================================================================

  private log(
    level: "log" | "warn" | "error" | "debug",
    tag: string,
    message: string,
    data?: unknown
  ): void {
    // error is handled by its own always-on path (see error() below);
    // this internal helper only serves the gated verbose levels.
    if (!this.verboseEnabled) return;

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
  // Error (ALWAYS logs, dev or production)
  // ===========================================================================

  error(tag: string, message: string, error?: unknown): void {
    const formatted = `[${tag}] ${message}`;

    // Always print — this is the whole point of the fix. Release builds
    // strip console output from the visible Metro/adb logcat stream far
    // less reliably than people assume, and this at minimum keeps errors
    // visible via `adb logcat` / Play Console ANR & crash reports pipelines
    // that read console.error.
    if (error !== undefined) {
      console.error(formatted, error);
    } else {
      console.error(formatted);
    }

    // Best-effort persistence so the error survives app restarts and can
    // be inspected without a debugger attached (e.g. via a hidden
    // "Debug Log" screen, or exported and emailed to yourself).
    void this.persistError(tag, message, error);
  }

  private async persistError(
    tag: string,
    message: string,
    error?: unknown
  ): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(
        NOTIFICATION_STORAGE_KEYS.ERROR_LOG
      );

      const existing: PersistedErrorEntry[] = raw ? JSON.parse(raw) : [];

      const entry: PersistedErrorEntry = {
        timestamp: new Date().toISOString(),
        tag,
        message,
        error: error instanceof Error ? error.message : this.safeStringify(error),
      };

      const updated = [entry, ...existing].slice(0, MAX_PERSISTED_ERRORS);

      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEYS.ERROR_LOG,
        JSON.stringify(updated)
      );
    } catch {
      // If persistence itself fails, there's nothing more we can safely do
      // here — deliberately not calling this.error() again to avoid
      // infinite recursion.
    }
  }

  private safeStringify(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  /**
   * Reads back the persisted error ring buffer. Useful for a hidden
   * "Debug Log" settings screen so you can see what failed on a real
   * device without adb/logcat access.
   */
  async getPersistedErrors(): Promise<PersistedErrorEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(
        NOTIFICATION_STORAGE_KEYS.ERROR_LOG
      );
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async clearPersistedErrors(): Promise<void> {
    try {
      await AsyncStorage.removeItem(NOTIFICATION_STORAGE_KEYS.ERROR_LOG);
    } catch {
      // ignore
    }
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