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
 * ✓ Check / request the Android 12+ exact-alarm permission
 *
 * FIX: This file previously only requested POST_NOTIFICATIONS. On Android
 * 12+ (API 31+), scheduleNotificationAsync's DATE trigger is backed by
 * AlarmManager.setExactAndAllowWhileIdle, which requires the
 * SCHEDULE_EXACT_ALARM manifest permission — and on Android 13+ the user
 * must explicitly grant "Alarms & reminders" in system settings. Without
 * it, triggers are silently downgraded to inexact alarms that Doze/App
 * Standby can delay by minutes to hours, or drop entirely. There is no
 * runtime permission dialog for this — the OS requires sending the user to
 * a dedicated settings screen, which this file now does.
 *
 * No scheduling logic belongs here.
 * ============================================================================
 */

import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

import NotificationLogger from "./NotificationLogger";

import { NotificationPermissionStatus } from "./NotificationTypes";
import { LOGGER_TAG } from "./NotificationConstants";

// Android 12 = API 31. SCHEDULE_EXACT_ALARM / exact-alarm settings screen
// requirement applies from this version onward.
const ANDROID_EXACT_ALARM_MIN_SDK = 31;

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

  // ===========================================================================
  // Exact Alarm Permission (Android 12+ / API 31+)
  // ===========================================================================

  /**
   * True if this device/OS version even needs the exact-alarm permission.
   * iOS and pre-Android-12 devices don't — this always resolves true there
   * so callers can treat "needsExactAlarmPermission() === false" as "nothing
   * to do".
   */
  needsExactAlarmPermission(): boolean {
    if (Platform.OS !== "android") return false;
    return Number(Platform.Version) >= ANDROID_EXACT_ALARM_MIN_SDK;
  }

  /**
   * There is no public Expo/React-Native API to directly query
   * AlarmManager.canScheduleExactAlarms() as of this writing. We treat
   * "have we already sent the user to the settings screen and did they
   * come back" as the practical signal, and let the caller decide whether
   * to re-prompt. If you add a small native module exposing
   * canScheduleExactAlarms(), wire it in here.
   */
  async openExactAlarmSettings(): Promise<void> {
    if (!this.needsExactAlarmPermission()) {
      return;
    }

    try {
      // React Native's Android Linking module supports firing raw intents.
      // ACTION_REQUEST_SCHEDULE_EXACT_ALARM opens the "Alarms & reminders"
      // toggle for this app directly.
      await (Linking as any).sendIntent?.(
        "android.settings.REQUEST_SCHEDULE_EXACT_ALARM"
      );

      NotificationLogger.info(
        LOGGER_TAG.PERMISSION,
        "Opened exact-alarm settings screen."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.PERMISSION,
        "Failed to open exact-alarm settings — falling back to general app settings.",
        error
      );

      // Fallback: general app settings at least gets the user close.
      await this.openSettings();
    }
  }

  /**
   * Call once during onboarding / the permission-priming screen — NOT
   * silently inside NotificationManager.initialize(), since this jumps the
   * user to a system settings screen and needs explanatory copy first
   * ("Life OS needs exact alarm access so task reminders fire on time").
   */
  async ensureExactAlarmPermission(): Promise<void> {
    if (!this.needsExactAlarmPermission()) {
      return;
    }

    await this.openExactAlarmSettings();
  }
}

export default new NotificationPermissions();