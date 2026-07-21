/**
 * ============================================================================
 * LifeOS Notification Bootstrap
 * ============================================================================
 *
 * Initializes and synchronizes the complete notification system.
 *
 * FIX 1 (critical): RoutineNotificationService was never imported,
 * initialized, or synced here. Morning Motivation, the 5 Engagement
 * Reminders, Evening Planning, and Daily Summary were never scheduled
 * unless some other screen called syncRoutines()/refresh() directly.
 * Bootstrap now owns its full lifecycle, same as every other service.
 *
 * FIX 2: synchronize() now guards against re-entrant/concurrent calls.
 * _layout.tsx's mount effect calls synchronize() once, but various store
 * actions (fetchTasks, onLoginSuccess, etc.) can also trigger individual
 * service syncs close together on a cold start — this prevents overlapping
 * full-system syncs from racing each other.
 * ============================================================================
 */

import NotificationManager from "./core/NotificationManager";
import NotificationResponseService from "./core/NotificationResponseService";

import TaskNotificationService from "./task/TaskNotificationService";
import GoalNotificationService from "./goal/GoalNotificationService";
import NoteNotificationService from "./note/NoteNotificationService";
import AIReviewNotificationService from "./ai/AIReviewNotificationService";
import AccountNotificationService from "./account/AccountNotificationService";
import RoutineNotificationService from "./RoutineNotificationService";

import NotificationLogger from "./core/NotificationLogger";
import { LOGGER_TAG } from "./core/NotificationConstants";

class NotificationBootstrap {
  private initialized = false;

  /** Guards against overlapping synchronize() calls racing each other. */
  private syncInFlight: Promise<void> | null = null;

  /**
   * ===========================================================================
   * Initialize Notification System
   * ===========================================================================
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const granted = await NotificationManager.initialize();

      if (!granted) {
        NotificationLogger.warn(
          LOGGER_TAG.MANAGER,
          "Notification permission not granted."
        );
        return;
      }

      // Initialize response listener
      NotificationResponseService.initialize();

      // Initialize all notification services
      await TaskNotificationService.initialize();
      await GoalNotificationService.initialize();
      await NoteNotificationService.initialize();
      await AIReviewNotificationService.initialize();
      await AccountNotificationService.initialize();
      await RoutineNotificationService.initialize();

      this.initialized = true;

      NotificationLogger.info(
        LOGGER_TAG.MANAGER,
        "Notification Bootstrap initialized."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.MANAGER,
        "Failed to initialize Notification Bootstrap.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Synchronize Notifications
   * ===========================================================================
   */
  async synchronize(): Promise<void> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = this.doSynchronize();

    try {
      await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async doSynchronize(): Promise<void> {
    try {
      NotificationLogger.info(
        LOGGER_TAG.MANAGER,
        "Synchronizing notification services..."
      );

      // Task Notifications
      await TaskNotificationService.syncTasks();

      // Goal Notifications
      await GoalNotificationService.syncGoals();

      // Note Notifications
      await NoteNotificationService.syncNotes();

      // AI Review Notifications
      await AIReviewNotificationService.sync();

      // Routine Notifications (Morning Motivation, Engagement Reminders,
      // Evening Planning, Daily Summary) — previously never wired in.
      await RoutineNotificationService.syncRoutines();

      // Handle notification that launched the app
      await NotificationResponseService.handleInitialNotification();

      NotificationLogger.info(
        LOGGER_TAG.MANAGER,
        "Notification synchronization completed."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.MANAGER,
        "Failed to synchronize notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Restart Notification System
   * ===========================================================================
   */
  async restart(): Promise<void> {
    try {
      this.shutdown();

      await this.initialize();
      await this.synchronize();

      NotificationLogger.info(
        LOGGER_TAG.MANAGER,
        "Notification Bootstrap restarted."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.MANAGER,
        "Failed to restart Notification Bootstrap.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Shutdown Notification System
   * ===========================================================================
   */
  shutdown(): void {
    try {
      NotificationResponseService.dispose();

      this.initialized = false;

      NotificationLogger.info(
        LOGGER_TAG.MANAGER,
        "Notification Bootstrap shutdown completed."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.MANAGER,
        "Failed to shutdown Notification Bootstrap.",
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
    this.shutdown();
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

export default new NotificationBootstrap();