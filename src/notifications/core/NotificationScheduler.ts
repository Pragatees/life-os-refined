/**
 * ============================================================================
 * LifeOS Notification Scheduler
 * ============================================================================
 *
 * Handles scheduling and cancellation of notifications.
 *
 * This is the ONLY file that directly communicates with Expo Notifications.
 *
 * FIX: schedule() awaited cancelByPayload() — which itself scans the full
 * pending-notification list via getAllScheduledNotificationsAsync() — before
 * calling scheduleNotificationAsync(). For short/near-now triggers (e.g. a
 * task's "immediate" reminder), if that scan+cancel took longer than the
 * time remaining until the trigger, the notification would silently never
 * fire (trigger already in the past by the time it reached the native
 * call), with no error surfaced anywhere. schedule() now re-validates the
 * trigger immediately before the native call and logs a warning if it
 * expired while waiting.
 * ============================================================================
 */

import * as Notifications from "expo-notifications";

// Import dependencies
import NotificationHelper from "./NotificationHelper";
import NotificationLogger from "./NotificationLogger";

import {
  NotificationSchedule,
  NotificationPayload,
  NotificationType,
  TaskNotificationType,
} from "./NotificationTypes";

import { LOGGER_TAG } from "./NotificationConstants";

class NotificationScheduler {
  /**
   * ===========================================================================
   * Schedule Notification
   * ===========================================================================
   */
  async schedule(
    notification: NotificationSchedule
  ): Promise<string | null> {
    try {
      if (!NotificationHelper.canSchedule(notification.trigger)) {
        NotificationLogger.warn(
          LOGGER_TAG.SCHEDULER,
          "Notification trigger is in the past.",
          notification
        );

        return null;
      }

      // Prevent duplicate notification before scheduling.
      // NOTE: this does a full getAllScheduledNotificationsAsync() scan —
      // see the re-validation below for why that matters.
      await this.cancelByPayload(notification.content.payload);

      // FIX: re-validate immediately before the native call. The scan +
      // cancel above is an unbounded-latency await; for short/near-now
      // triggers the deadline may have already passed while we were
      // waiting on it.
      if (!NotificationHelper.canSchedule(notification.trigger)) {
        NotificationLogger.warn(
          LOGGER_TAG.SCHEDULER,
          "Trigger expired while cancelling duplicate notifications — skipping schedule.",
          notification
        );
        return null;
      }

      const identifier =
        await Notifications.scheduleNotificationAsync({
          content: {
            title: notification.content.title,
            body: notification.content.body,
            sound: notification.content.sound ?? true,
            data: notification.content.payload,
          },

          trigger: {
            type:
              Notifications.SchedulableTriggerInputTypes.DATE,
            date: notification.trigger,
          },
        });

      NotificationLogger.notificationScheduled(
        identifier,
        notification.content.title,
        notification.trigger
      );

      return identifier;
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to schedule notification.",
        error
      );

      return null;
    }
  }

  /**
   * ===========================================================================
   * Cancel Notification (Expo Identifier)
   * ===========================================================================
   */
  async cancel(identifier: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(
        identifier
      );

      NotificationLogger.notificationCancelled(identifier);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to cancel notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Cancel By Payload
   * ===========================================================================
   *
   * Finds pending notifications having the same payload and
   * cancels them using Expo's generated identifier.
   */
  async cancelByPayload(
    payload: NotificationPayload
  ): Promise<void> {
    try {
      const pending = await this.getPending();

      const matches = pending.filter((notification) =>
        this.isSamePayload(
          notification.content.data as NotificationPayload,
          payload
        )
      );

      if (matches.length === 0) {
        return;
      }

      // Cancel matches in parallel instead of sequentially — reduces the
      // total latency of this call, which directly reduces the window in
      // which a near-now trigger (see schedule() fix above) can expire
      // while we wait.
      await Promise.all(
        matches.map((notification) =>
          Notifications.cancelScheduledNotificationAsync(
            notification.identifier
          )
        )
      );

      for (const notification of matches) {
        NotificationLogger.notificationCancelled(notification.identifier);
      }

      if (
        payload.type === NotificationType.TASK &&
        payload.taskId
      ) {
        NotificationLogger.duplicatePrevented(
          payload.taskId,
          payload.notificationType ??
            TaskNotificationType.REMINDER
        );
      }
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to cancel notification by payload.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Cancel All Notifications For A Task
   * ===========================================================================
   */
  async cancelTaskNotifications(
    taskId: string
  ): Promise<void> {
    await Promise.all([
      this.cancelByPayload({
        type: NotificationType.TASK,
        taskId,
        notificationType: TaskNotificationType.REMINDER,
      }),
      this.cancelByPayload({
        type: NotificationType.TASK,
        taskId,
        notificationType: TaskNotificationType.DUE,
      }),
      this.cancelByPayload({
        type: NotificationType.TASK,
        taskId,
        notificationType: TaskNotificationType.OVERDUE,
      }),
    ]);

    NotificationLogger.taskCancelled(taskId);
  }

  /**
   * ===========================================================================
   * Cancel Multiple Notifications
   * ===========================================================================
   */
  async cancelMany(
    identifiers: string[]
  ): Promise<void> {
    await Promise.all(
      identifiers.map((id) => this.cancel(id))
    );
  }

  /**
   * ===========================================================================
   * Cancel All Notifications
   * ===========================================================================
   */
  async cancelAll(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();

      NotificationLogger.info(
        LOGGER_TAG.SCHEDULER,
        "Cancelled all scheduled notifications."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to cancel all notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Get Pending Notifications
   * ===========================================================================
   */
  async getPending(): Promise<
    Notifications.NotificationRequest[]
  > {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to retrieve pending notifications.",
        error
      );

      return [];
    }
  }

  /**
   * ===========================================================================
   * Notification Exists
   * ===========================================================================
   */
  async exists(
    payload: NotificationPayload
  ): Promise<boolean> {
    const pending = await this.getPending();

    return pending.some((notification) =>
      this.isSamePayload(
        notification.content.data as NotificationPayload,
        payload
      )
    );
  }

  /**
   * ===========================================================================
   * Reschedule Notification
   * ===========================================================================
   */
  async reschedule(
    notification: NotificationSchedule
  ): Promise<string | null> {
    await this.cancelByPayload(
      notification.content.payload
    );

    NotificationLogger.notificationRescheduled(
      notification.content.title,
      notification.content.payload.notificationType ??
        "UNKNOWN"
    );

    return this.schedule(notification);
  }

  /**
   * ===========================================================================
   * Compare Notification Payloads
   * ===========================================================================
   */
  private isSamePayload(
    first: NotificationPayload,
    second: NotificationPayload
  ): boolean {
    return (
      first.type === second.type &&
      first.taskId === second.taskId &&
      first.goalId === second.goalId &&
      first.noteDate === second.noteDate &&
      first.reviewType === second.reviewType &&
      first.routineType === second.routineType &&
      first.notificationType === second.notificationType
    );
  }

  /**
   * ===========================================================================
   * Cancel Notifications By Type
   * ===========================================================================
   */
  async cancelByType(
    type: NotificationType
  ): Promise<void> {
    try {
      const pending = await this.getPending();

      const matches = pending.filter((notification) => {
        const payload =
          notification.content.data as NotificationPayload;
        return payload.type === type;
      });

      await Promise.all(
        matches.map((notification) =>
          Notifications.cancelScheduledNotificationAsync(
            notification.identifier
          )
        )
      );

      for (const notification of matches) {
        NotificationLogger.notificationCancelled(notification.identifier);
      }

      NotificationLogger.info(
        LOGGER_TAG.SCHEDULER,
        `Cancelled all ${type} notifications.`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        `Failed to cancel ${type} notifications.`,
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Debug Pending Notifications
   * ===========================================================================
   */
  async debugPending(): Promise<void> {
    try {
      const pending = await this.getPending();

      NotificationLogger.debug(
        LOGGER_TAG.SCHEDULER,
        `Pending notifications (${pending.length})`
      );

      pending.forEach((notification) => {
        NotificationLogger.debug(
          LOGGER_TAG.SCHEDULER,
          notification.identifier,
          {
            title: notification.content.title,
            body: notification.content.body,
            payload: notification.content
              .data as NotificationPayload,
            trigger: notification.trigger,
          }
        );
      });
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to debug pending notifications.",
        error
      );
    }
  }
}

// Export as singleton instance
export default new NotificationScheduler();