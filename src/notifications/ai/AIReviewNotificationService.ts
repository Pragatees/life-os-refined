/**
 * ============================================================================
 * LifeOS AI Review Notification Service
 * ============================================================================
 *
 * Handles Daily, Weekly and Monthly AI Review notifications.
 * ============================================================================
 */

import NotificationLogger from "../core/NotificationLogger";
import NotificationScheduler from "../core/NotificationScheduler";

import { AIReviewType, NotificationType } from "../core/NotificationTypes";

import { LOGGER_TAG, DAILY_SCHEDULE } from "../core/NotificationConstants";

class AIReviewNotificationService {
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
   * Resynchronize AI Review Notifications
   * ===========================================================================
   */
  async resync(): Promise<void> {
    try {
      await this.cancelAll();

      await this.scheduleDailyReview();

      await this.scheduleWeeklyReview();

      await this.scheduleMonthlyReview();

      NotificationLogger.info(
        LOGGER_TAG.AI,
        "AI Review notifications resynchronized."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.AI,
        "Failed to resynchronize AI Review notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Daily Review (One-time at 9:15 PM)
   * ===========================================================================
   */
  private async scheduleDailyReview(): Promise<void> {
    try {
      const trigger = new Date();

      trigger.setHours(21, 15, 0, 0); // 9:15 PM

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

      NotificationLogger.debug(LOGGER_TAG.AI, "Daily AI Review scheduled for 9:15 PM.");
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
   * Schedule Weekly Review (One-time at 9:15 PM on Sunday)
   * ===========================================================================
   */
  private async scheduleWeeklyReview(): Promise<void> {
    try {
      const trigger = new Date();

      trigger.setHours(21, 15, 0, 0); // 9:15 PM

      // Get days until Sunday (0 = Sunday, 1 = Monday, etc.)
      const daysUntilSunday = (7 - trigger.getDay()) % 7;

      // If today is Sunday and it's before 9:15 PM, schedule for today
      // Otherwise, schedule for next Sunday
      if (trigger.getDay() === 0 && trigger <= new Date()) {
        trigger.setDate(trigger.getDate() + 7);
      } else if (trigger.getDay() !== 0) {
        trigger.setDate(trigger.getDate() + daysUntilSunday);
      }

      // Check if the scheduled time has already passed
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

      NotificationLogger.debug(LOGGER_TAG.AI, "Weekly AI Review scheduled for Sunday at 9:15 PM.");
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
   * Schedule Monthly Review (One-time at 9:15 PM on last day of month)
   * ===========================================================================
   */
  private async scheduleMonthlyReview(): Promise<void> {
    try {
      const trigger = new Date();

      // Set to the last day of the current month
      trigger.setMonth(trigger.getMonth() + 1, 0);
      
      trigger.setHours(21, 15, 0, 0); // 9:15 PM

      // If the date has already passed, schedule for next month's last day
      if (trigger <= new Date()) {
        trigger.setMonth(trigger.getMonth() + 1);
        trigger.setDate(0); // Last day of next month
        trigger.setHours(21, 15, 0, 0);
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

      NotificationLogger.debug(LOGGER_TAG.AI, "Monthly AI Review scheduled for last day of month at 9:15 PM.");
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