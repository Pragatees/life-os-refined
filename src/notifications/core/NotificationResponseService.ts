/**
 * ============================================================================
 * LifeOS Notification Response Service
 * ============================================================================
 *
 * Handles notification tap events and redirects the user
 * to the appropriate screen.
 * ============================================================================
 */

import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import NotificationLogger from "./NotificationLogger";
import {
  NotificationPayload,
  NotificationType,
} from "./NotificationTypes";
import { LOGGER_TAG } from "./NotificationConstants";

class NotificationResponseService {
  private initialized = false;

  private subscription: Notifications.EventSubscription | null = null;

  /**
   * ===========================================================================
   * Initialize
   * ===========================================================================
   */
  initialize(): void {
    if (this.initialized) return;

    this.subscription =
      Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const payload =
            response.notification.request.content
              .data as NotificationPayload;

          this.handle(payload);
        }
      );

    this.initialized = true;

    NotificationLogger.info(
      LOGGER_TAG.RESPONSE,
      "Notification Response Service initialized."
    );
  }

  /**
   * ===========================================================================
   * Handle Notification
   * ===========================================================================
   */
  private handle(payload: NotificationPayload): void {
    try {
      NotificationLogger.notificationClicked(payload);

      switch (payload.type) {
        case NotificationType.TASK:
          router.push("/dashboard");
          break;

        case NotificationType.GOAL:
          router.push("/GoalScreen");
          break;

        case NotificationType.NOTE:
          router.push("/NotesScreen");
          break;

        case NotificationType.AI_REVIEW:
          router.push("/ai_review");
          break;

        case NotificationType.ACCOUNT:
          router.push("/profile");
          break;

        case NotificationType.SYSTEM:
          router.push("/");
          break;

        default:
          NotificationLogger.warn(
            LOGGER_TAG.RESPONSE,
            "Unknown notification type.",
            payload
          );
      }
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.RESPONSE,
        "Failed to handle notification response.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Handle Initial Notification
   * ===========================================================================
   */
  async handleInitialNotification(): Promise<void> {
    try {
      const response =
        await Notifications.getLastNotificationResponseAsync();

      if (!response) return;

      const payload =
        response.notification.request.content
          .data as NotificationPayload;

      this.handle(payload);

      NotificationLogger.info(
        LOGGER_TAG.RESPONSE,
        "Handled initial notification."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.RESPONSE,
        "Failed to handle initial notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Dispose
   * ===========================================================================
   */
  dispose(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }

    this.initialized = false;

    NotificationLogger.info(
      LOGGER_TAG.RESPONSE,
      "Notification Response Service disposed."
    );
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

export default new NotificationResponseService();