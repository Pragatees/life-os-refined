/**
 * ============================================================================
 * LifeOS Account Notification Service
 * ============================================================================
 *
 * Handles account-related notifications.
 *
 * FIX: These were all scheduled with `trigger: new Date(Date.now() + 1000)`
 * (1 second out) via NotificationScheduler.schedule(), which internally
 * awaits cancelByPayload() (a full pending-list scan) before the native
 * call. Same race as TaskNotificationService's old "immediate reminder" —
 * on a loaded release-build JS thread, the 1-second trigger could expire
 * before scheduleNotificationAsync() actually ran, silently dropping the
 * notification. Buffer widened to 5 seconds, matching
 * TASK_REMINDER.IMMEDIATE_BUFFER_SECONDS, for consistency across the app.
 * ============================================================================
 */

import NotificationLogger from "../core/NotificationLogger";
import NotificationScheduler from "../core/NotificationScheduler";

import { NotificationType } from "../core/NotificationTypes";

import { LOGGER_TAG, TASK_REMINDER } from "../core/NotificationConstants";

const IMMEDIATE_TRIGGER_MS =
  TASK_REMINDER.IMMEDIATE_BUFFER_SECONDS * 1000;

class AccountNotificationService {
  private initialized = false;

  /**
   * ===========================================================================
   * Initialize
   * ===========================================================================
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    NotificationLogger.info(
      LOGGER_TAG.ACCOUNT,
      "Account Notification Service initialized."
    );
  }

  /**
   * ===========================================================================
   * Password Changed Notification
   * ===========================================================================
   */
  async schedulePasswordChanged(): Promise<void> {
    try {
      await NotificationScheduler.schedule({
        id: "account_password_changed",
        trigger: new Date(Date.now() + IMMEDIATE_TRIGGER_MS),
        content: {
          title: "🔒 Password Updated",
          body: "Your account password has been changed successfully.",
          payload: {
            type: NotificationType.ACCOUNT,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ACCOUNT,
        "Password changed notification scheduled."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ACCOUNT,
        "Failed to schedule password changed notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Email Changed Notification
   * ===========================================================================
   */
  async scheduleEmailChanged(newEmail: string): Promise<void> {
    try {
      await NotificationScheduler.schedule({
        id: "account_email_changed",
        trigger: new Date(Date.now() + IMMEDIATE_TRIGGER_MS),
        content: {
          title: "📧 Email Updated",
          body: `Your email has been changed to ${newEmail}.`,
          payload: {
            type: NotificationType.ACCOUNT,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ACCOUNT,
        "Email changed notification scheduled."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ACCOUNT,
        "Failed to schedule email changed notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Profile Updated Notification
   * ===========================================================================
   */
  async scheduleProfileUpdated(): Promise<void> {
    try {
      await NotificationScheduler.schedule({
        id: "account_profile_updated",
        trigger: new Date(Date.now() + IMMEDIATE_TRIGGER_MS),
        content: {
          title: "👤 Profile Updated",
          body: "Your profile has been updated successfully.",
          payload: {
            type: NotificationType.ACCOUNT,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ACCOUNT,
        "Profile updated notification scheduled."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ACCOUNT,
        "Failed to schedule profile updated notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Account Deleted Notification
   * ===========================================================================
   */
  async scheduleAccountDeleted(): Promise<void> {
    try {
      await NotificationScheduler.schedule({
        id: "account_deleted",
        trigger: new Date(Date.now() + IMMEDIATE_TRIGGER_MS),
        content: {
          title: "🗑️ Account Deleted",
          body: "Your account has been deleted successfully.",
          payload: {
            type: NotificationType.ACCOUNT,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ACCOUNT,
        "Account deleted notification scheduled."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ACCOUNT,
        "Failed to schedule account deleted notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Cancel All Account Notifications
   * ===========================================================================
   */
  async cancelAll(): Promise<void> {
    try {
      await NotificationScheduler.cancelMany([
        "account_password_changed",
        "account_email_changed",
        "account_profile_updated",
        "account_deleted",
      ]);

      NotificationLogger.info(
        LOGGER_TAG.ACCOUNT,
        "Cancelled all account notifications."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ACCOUNT,
        "Failed to cancel account notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Resynchronize Account Notifications
   * ===========================================================================
   */
  async resync(): Promise<void> {
    try {
      await this.cancelAll();

      NotificationLogger.info(
        LOGGER_TAG.ACCOUNT,
        "Account notification service synchronized."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ACCOUNT,
        "Failed to synchronize account notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Is Initialized
   * ===========================================================================
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

export default new AccountNotificationService();