/**
 * ============================================================================
 * LifeOS Notification Manager
 * ============================================================================
 *
 * Entry point for the notification system.
 *
 * Responsibilities
 * ----------------
 * ✓ Configure Expo Notifications
 * ✓ Request permissions
 * ✓ Create notification channels
 * ✓ Register the FOREGROUND "received" listener (logging only)
 * ✓ Clear badge count
 * ✓ Cleanup listeners
 *
 * FIX: This file used to ALSO register its own
 * addNotificationResponseReceivedListener (tap handler), duplicating the
 * one owned by NotificationResponseService. Both fired on every tap. Tap
 * handling (navigation) now belongs exclusively to NotificationResponseService
 * — this file only logs foreground "received" events.
 *
 * Contains NO business logic.
 * ============================================================================
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import NotificationPermissions from "./NotificationPermissions";
import NotificationLogger from "./NotificationLogger";

import {
  LOGGER_TAG,
  NOTIFICATION_CHANNELS,
} from "./NotificationConstants";

class NotificationManager {
  private initialized = false;

  private notificationReceivedSubscription?:
    Notifications.EventSubscription;

  /**
   * ===========================================================================
   * Initialize
   * ===========================================================================
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      NotificationLogger.info(
        LOGGER_TAG.MANAGER,
        "Initializing notification system..."
      );

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });

      const granted =
        await NotificationPermissions.ensurePermission();

      if (!granted) {
        NotificationLogger.permissionDenied();
        return false;
      }

      NotificationLogger.permissionGranted();

      await this.createChannels();

      this.registerListeners();

      this.initialized = true;

      NotificationLogger.info(
        LOGGER_TAG.MANAGER,
        "Notification system initialized successfully."
      );

      return true;
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.MANAGER,
        "Failed to initialize notification system.",
        error
      );

      return false;
    }
  }

  /**
   * ===========================================================================
   * Android Channels
   * ===========================================================================
   */
  private async createChannels(): Promise<void> {
    if (Platform.OS !== "android") {
      return;
    }

    const channels = Object.values(NOTIFICATION_CHANNELS);

    for (const channel of channels) {
      try {
        await Notifications.setNotificationChannelAsync(
          channel.id,
          {
            name: channel.name,
            description: channel.description,

            importance: Notifications.AndroidImportance.HIGH,

            vibrationPattern: [0, 250, 250, 250],

            enableLights: true,

            enableVibrate: true,

            lockscreenVisibility:
              Notifications.AndroidNotificationVisibility.PUBLIC,
          }
        );

        NotificationLogger.info(
          LOGGER_TAG.MANAGER,
          `Created channel: ${channel.name}`
        );
      } catch (error) {
        // Previously a failure here would abort the whole loop, silently
        // leaving later channels never created. Each channel is now
        // independent so one failure doesn't cascade.
        NotificationLogger.error(
          LOGGER_TAG.MANAGER,
          `Failed to create channel: ${channel.name}`,
          error
        );
      }
    }
  }

  /**
   * ===========================================================================
   * Register Listeners
   * ===========================================================================
   *
   * ONLY the foreground "received" listener lives here (for logging /
   * debugging visibility). Tap/response handling is owned exclusively by
   * NotificationResponseService — do not add a response listener here.
   */
  private registerListeners(): void {
    this.notificationReceivedSubscription =
      Notifications.addNotificationReceivedListener(
        (notification) => {
          NotificationLogger.debug(
            LOGGER_TAG.MANAGER,
            "Notification received.",
            notification
          );
        }
      );
  }

  /**
   * ===========================================================================
   * Clear Badge
   * ===========================================================================
   */
  async clearBadge(): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.MANAGER,
        "Failed to clear badge.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Dispose Listeners
   * ===========================================================================
   */
  dispose(): void {
    this.notificationReceivedSubscription?.remove();
    this.notificationReceivedSubscription = undefined;

    this.initialized = false;

    NotificationLogger.info(
      LOGGER_TAG.MANAGER,
      "Notification listeners disposed."
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

export default new NotificationManager();