/**
 * ============================================================================
 * LifeOS Goal Notification Service
 * ============================================================================
 *
 * Handles all Goal notification operations.
 * ============================================================================
 */

import { Goal } from "../../store/goals";
import { useGoalStore } from "../../store/goals";
import NotificationHelper from "../core/NotificationHelper";
import NotificationLogger from "../core/NotificationLogger";
import NotificationScheduler from "../core/NotificationScheduler";
import { NotificationType } from "../core/NotificationTypes";
import {
  LOGGER_TAG,
  REMINDER_MINUTES,
} from "../core/NotificationConstants";

class GoalNotificationService {
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
      LOGGER_TAG.GOAL,
      "Goal Notification Service initialized."
    );
  }

  /**
   * ===========================================================================
   * Sync Goal Notifications
   * ===========================================================================
   */
  async syncGoals(): Promise<void> {
    try {
      const { goals } = useGoalStore.getState();

      NotificationLogger.info(
        LOGGER_TAG.GOAL,
        `Syncing ${goals.length} goal notification(s).`
      );

      for (const goal of goals) {
        if (goal.status === "COMPLETED") {
          await this.cancelGoal(goal.id);
          continue;
        }

        await this.rescheduleGoal(goal);
      }

      NotificationLogger.info(
        LOGGER_TAG.GOAL,
        "Goal notification sync completed."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.GOAL,
        "Failed to sync goal notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Goal
   * ===========================================================================
   */
  async scheduleGoal(goal: Goal): Promise<void> {
    try {
      NotificationLogger.debug(
        LOGGER_TAG.GOAL,
        `Preparing notifications for "${goal.goalName}".`
      );

      if (goal.status === "COMPLETED") {
        NotificationLogger.debug(
          LOGGER_TAG.GOAL,
          `Skipping completed goal "${goal.goalName}".`
        );
        return;
      }

      const deadline = new Date(goal.deadline);
      deadline.setHours(9, 0, 0, 0);

      if (!NotificationHelper.canSchedule(deadline)) {
        NotificationLogger.debug(
          LOGGER_TAG.GOAL,
          `Skipping past goal "${goal.goalName}".`
        );
        return;
      }

      await this.scheduleReminder(goal);
      await this.scheduleDeadlineNotification(goal);

      NotificationLogger.info(
        LOGGER_TAG.GOAL,
        `Notifications scheduled for "${goal.goalName}".`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.GOAL,
        "Failed to schedule goal.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Reminder Notification
   * ===========================================================================
   */
  private async scheduleReminder(goal: Goal): Promise<void> {
    try {
      const deadline = new Date(goal.deadline);
      deadline.setHours(9, 0, 0, 0);

      const trigger = NotificationHelper.getReminderTrigger(
        deadline,
        REMINDER_MINUTES.GOAL_BEFORE
      );

      if (!NotificationHelper.canSchedule(trigger)) {
        return;
      }

      await NotificationScheduler.schedule({
        id: `${goal.id}_reminder`,
        trigger,
        content: {
          title: "🎯 Goal Reminder",
          body: `Your goal "${goal.goalName}" is approaching.`,
          payload: {
            type: NotificationType.GOAL,
            goalId: goal.id,
          },
        },
      });

      NotificationLogger.debug(
        LOGGER_TAG.GOAL,
        `Reminder scheduled for "${goal.goalName}".`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.GOAL,
        "Failed to schedule goal reminder.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Deadline Notification
   * ===========================================================================
   */
  private async scheduleDeadlineNotification(goal: Goal): Promise<void> {
    try {
      const trigger = new Date(goal.deadline);
      trigger.setHours(9, 0, 0, 0);

      if (!NotificationHelper.canSchedule(trigger)) {
        return;
      }

      await NotificationScheduler.schedule({
        id: `${goal.id}_deadline`,
        trigger,
        content: {
          title: "🏁 Goal Deadline",
          body: `Today is the deadline for "${goal.goalName}".`,
          payload: {
            type: NotificationType.GOAL,
            goalId: goal.id,
          },
        },
      });

      NotificationLogger.debug(
        LOGGER_TAG.GOAL,
        `Deadline notification scheduled for "${goal.goalName}".`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.GOAL,
        "Failed to schedule deadline notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Cancel Goal Notifications
   * ===========================================================================
   */
  async cancelGoal(goalId: string): Promise<void> {
    try {
      await NotificationScheduler.cancelMany([
        `${goalId}_reminder`,
        `${goalId}_deadline`,
      ]);

      NotificationLogger.info(
        LOGGER_TAG.GOAL,
        `Cancelled notifications for goal "${goalId}".`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.GOAL,
        "Failed to cancel goal notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Reschedule Goal Notifications
   * ===========================================================================
   */
  async rescheduleGoal(goal: Goal): Promise<void> {
    try {
      await this.cancelGoal(goal.id);
      await this.scheduleGoal(goal);

      NotificationLogger.info(
        LOGGER_TAG.GOAL,
        `Rescheduled notifications for "${goal.goalName}".`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.GOAL,
        "Failed to reschedule goal notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Goal Completed
   * ===========================================================================
   */
  async onGoalCompleted(goalId: string): Promise<void> {
    await this.cancelGoal(goalId);

    NotificationLogger.info(
      LOGGER_TAG.GOAL,
      `Goal completed: ${goalId}`
    );
  }

  /**
   * ===========================================================================
   * Goal Deleted
   * ===========================================================================
   */
  async onGoalDeleted(goalId: string): Promise<void> {
    await this.cancelGoal(goalId);

    NotificationLogger.info(
      LOGGER_TAG.GOAL,
      `Goal deleted: ${goalId}`
    );
  }

  /**
   * ===========================================================================
   * Cancel All Goal Notifications
   * ===========================================================================
   */
  async cancelAll(): Promise<void> {
    try {
      const { goals } = useGoalStore.getState();

      await Promise.all(
        goals.map((goal) => this.cancelGoal(goal.id))
      );

      NotificationLogger.info(
        LOGGER_TAG.GOAL,
        "Cancelled all goal notifications."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.GOAL,
        "Failed to cancel all goal notifications.",
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

export default new GoalNotificationService();