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
 * ✓ Register notification listeners
 * ✓ Clear badge count
 * ✓ Cleanup listeners
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

  private notificationResponseSubscription?:
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
    }
  }

  /**
   * ===========================================================================
   * Register Listeners
   * ===========================================================================
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

    this.notificationResponseSubscription =
      Notifications.addNotificationResponseReceivedListener(
        (response) => {
          NotificationLogger.notificationClicked(
            response.notification.request.content.data
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
    this.notificationResponseSubscription?.remove();

    this.notificationReceivedSubscription = undefined;
    this.notificationResponseSubscription = undefined;

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