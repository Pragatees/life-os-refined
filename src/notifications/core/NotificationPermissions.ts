/**
 * ============================================================================
 * LifeOS Notification Permissions
 * ============================================================================
 *
 * Handles notification permission management.
 *
 * Responsibilities
 * ----------------
 * ✓ Check notification permission status
 * ✓ Request notification permission
 * ✓ Determine if notifications are allowed
 * ✓ Open notification settings
 *
 * No scheduling logic belongs here.
 * ============================================================================
 */

import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";

import NotificationLogger from "./NotificationLogger";

import { NotificationPermissionStatus } from "./NotificationTypes";
import { LOGGER_TAG } from "./NotificationConstants";

class NotificationPermissions {
  /**
   * ===========================================================================
   * Get Current Permission Status
   * ===========================================================================
   */
  async getStatus(): Promise<NotificationPermissionStatus> {
    try {
      const settings = await Notifications.getPermissionsAsync();

      if (settings.granted) {
        return NotificationPermissionStatus.GRANTED;
      }

      if (settings.canAskAgain) {
        return NotificationPermissionStatus.UNDETERMINED;
      }

      return NotificationPermissionStatus.DENIED;
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.PERMISSION,
        "Failed to retrieve notification permission status.",
        error
      );

      return NotificationPermissionStatus.DENIED;
    }
  }

  /**
   * ===========================================================================
   * Check Whether Notifications Are Allowed
   * ===========================================================================
   */
  async isGranted(): Promise<boolean> {
    const status = await this.getStatus();

    return status === NotificationPermissionStatus.GRANTED;
  }

  /**
   * ===========================================================================
   * Request Notification Permission
   * ===========================================================================
   */
  async requestPermission(): Promise<boolean> {
    try {
      const status = await this.getStatus();

      if (status === NotificationPermissionStatus.GRANTED) {
        NotificationLogger.permissionGranted();
        return true;
      }

      const response = await Notifications.requestPermissionsAsync();

      if (response.granted) {
        NotificationLogger.permissionGranted();
      } else {
        NotificationLogger.permissionDenied();
      }

      return response.granted;
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.PERMISSION,
        "Failed to request notification permission.",
        error
      );

      return false;
    }
  }

  /**
   * ===========================================================================
   * Ensure Permission Exists
   * ===========================================================================
   *
   * Used during application startup.
   */
  async ensurePermission(): Promise<boolean> {
    if (await this.isGranted()) {
      return true;
    }

    return this.requestPermission();
  }

  /**
   * ===========================================================================
   * Check if Permission Is Permanently Denied
   * ===========================================================================
   */
  async isPermanentlyDenied(): Promise<boolean> {
    try {
      const settings = await Notifications.getPermissionsAsync();

      return !settings.granted && !settings.canAskAgain;
    } catch {
      return false;
    }
  }

  /**
   * ===========================================================================
   * Open Device Notification Settings
   * ===========================================================================
   */
  async openSettings(): Promise<void> {
    try {
      await Linking.openSettings();

      NotificationLogger.info(
        LOGGER_TAG.PERMISSION,
        "Opened system notification settings."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.PERMISSION,
        "Failed to open notification settings.",
        error
      );
    }
  }
}

export default new NotificationPermissions();