/**
 * ============================================================================
 * LifeOS AI Review Notification Service
 * ============================================================================
 *
 * Handles Daily, Weekly and Monthly AI Review notifications.
 *
 * FIX 1: scheduleDailyReview()/scheduleWeeklyReview()/scheduleMonthlyReview()
 * used to hardcode `trigger.setHours(21, 15, 0, 0)` directly, while
 * NotificationConstants.DAILY_SCHEDULE.DAILY_AI_REVIEW existed as a separate,
 * unused "source of truth" that had drifted to a different value (21:00).
 * Editing the constant did nothing. All three now read from
 * DAILY_SCHEDULE.DAILY_AI_REVIEW exclusively.
 *
 * FIX 2: added a sync/resync in-flight guard for consistency with the other
 * services (sync() unconditionally cancels + reschedules all three reviews
 * on every app launch — harmless but now safe against re-entrant calls).
 * ============================================================================
 */

import NotificationLogger from "../core/NotificationLogger";
import NotificationScheduler from "../core/NotificationScheduler";

import { AIReviewType, NotificationType } from "../core/NotificationTypes";

import { LOGGER_TAG, DAILY_SCHEDULE } from "../core/NotificationConstants";

class AIReviewNotificationService {
  private initialized = false;

  /** Guards against overlapping sync()/resync() calls racing each other. */
  private syncInFlight: Promise<void> | null = null;

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
      LOGGER_TAG.AI,
      "AI Review Notification Service initialized."
    );
  }

  /**
   * ===========================================================================
   * Sync Notifications
   * ===========================================================================
   */
  async sync(): Promise<void> {
    return this.runSync();
  }

  /**
   * ===========================================================================
   * Resynchronize AI Review Notifications
   * ===========================================================================
   */
  async resync(): Promise<void> {
    return this.runSync();
  }

  private async runSync(): Promise<void> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = this.doSync();

    try {
      await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async doSync(): Promise<void> {
    try {
      await this.cancelAll();

      await this.scheduleDailyReview();
      await this.scheduleWeeklyReview();
      await this.scheduleMonthlyReview();

      NotificationLogger.info(
        LOGGER_TAG.AI,
        "AI Review notifications synchronized."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.AI,
        "Failed to synchronize AI Review notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Daily Review (One-time at DAILY_SCHEDULE.DAILY_AI_REVIEW)
   * ===========================================================================
   */
  private async scheduleDailyReview(): Promise<void> {
    try {
      const { hour, minute } = DAILY_SCHEDULE.DAILY_AI_REVIEW;
      const trigger = new Date();

      trigger.setHours(hour, minute, 0, 0);

      // If the time has already passed today, schedule for tomorrow
      if (trigger <= new Date()) {
        trigger.setDate(trigger.getDate() + 1);
      }

      await NotificationScheduler.schedule({
        id: "ai_daily",
        trigger,
        content: {
          title: "🤖 Daily AI Review",
          body: "See today's productivity insights and recommendations.",
          payload: {
            type: NotificationType.AI_REVIEW,
            reviewType: AIReviewType.DAILY,
          },
        },
      });

      NotificationLogger.debug(
        LOGGER_TAG.AI,
        `Daily AI Review scheduled for ${hour}:${minute
          .toString()
          .padStart(2, "0")}.`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.AI,
        "Failed to schedule Daily AI Review.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Weekly Review (One-time on Sunday at DAILY_SCHEDULE.DAILY_AI_REVIEW)
   * ===========================================================================
   */
  private async scheduleWeeklyReview(): Promise<void> {
    try {
      const { hour, minute } = DAILY_SCHEDULE.DAILY_AI_REVIEW;
      const trigger = new Date();

      trigger.setHours(hour, minute, 0, 0);

      // Get days until Sunday (0 = Sunday, 1 = Monday, etc.)
      const daysUntilSunday = (7 - trigger.getDay()) % 7;

      if (trigger.getDay() === 0 && trigger <= new Date()) {
        trigger.setDate(trigger.getDate() + 7);
      } else if (trigger.getDay() !== 0) {
        trigger.setDate(trigger.getDate() + daysUntilSunday);
      }

      if (trigger <= new Date()) {
        trigger.setDate(trigger.getDate() + 7);
      }

      await NotificationScheduler.schedule({
        id: "ai_weekly",
        trigger,
        content: {
          title: "📊 Weekly AI Review",
          body: "Your weekly productivity report is ready.",
          payload: {
            type: NotificationType.AI_REVIEW,
            reviewType: AIReviewType.WEEKLY,
          },
        },
      });

      NotificationLogger.debug(
        LOGGER_TAG.AI,
        `Weekly AI Review scheduled for Sunday at ${hour}:${minute
          .toString()
          .padStart(2, "0")}.`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.AI,
        "Failed to schedule Weekly AI Review.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Monthly Review (One-time on last day of month at DAILY_SCHEDULE.DAILY_AI_REVIEW)
   * ===========================================================================
   */
  private async scheduleMonthlyReview(): Promise<void> {
    try {
      const { hour, minute } = DAILY_SCHEDULE.DAILY_AI_REVIEW;
      const trigger = new Date();

      // Set to the last day of the current month
      trigger.setMonth(trigger.getMonth() + 1, 0);

      trigger.setHours(hour, minute, 0, 0);

      // If the date has already passed, schedule for next month's last day
      if (trigger <= new Date()) {
        trigger.setMonth(trigger.getMonth() + 1);
        trigger.setDate(0); // Last day of next month
        trigger.setHours(hour, minute, 0, 0);
      }

      await NotificationScheduler.schedule({
        id: "ai_monthly",
        trigger,
        content: {
          title: "📈 Monthly AI Review",
          body: "Your monthly productivity analysis is ready.",
          payload: {
            type: NotificationType.AI_REVIEW,
            reviewType: AIReviewType.MONTHLY,
          },
        },
      });

      NotificationLogger.debug(
        LOGGER_TAG.AI,
        `Monthly AI Review scheduled for last day of month at ${hour}:${minute
          .toString()
          .padStart(2, "0")}.`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.AI,
        "Failed to schedule Monthly AI Review.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Cancel All AI Review Notifications
   * ===========================================================================
   */
  async cancelAll(): Promise<void> {
    try {
      await NotificationScheduler.cancelMany([
        "ai_daily",
        "ai_weekly",
        "ai_monthly",
      ]);

      NotificationLogger.info(
        LOGGER_TAG.AI,
        "Cancelled all AI Review notifications."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.AI,
        "Failed to cancel AI Review notifications.",
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

export default new AIReviewNotificationService();