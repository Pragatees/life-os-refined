/**
 * ============================================================================
 * LifeOS Routine Notification Service
 * ============================================================================
 *
 * Schedules the four fixed daily routine notifications:
 *
 *   1. Morning Motivation   - 07:00 AM, one message
 *   2. Engagement Reminder  - 09:00 / 11:00 / 13:00 / 15:00 / 17:00
 *   3. Evening Planning     - 06:00 PM
 *   4. Daily Summary        - 09:45 PM
 *
 * Task data is read ONLY from `useTaskStore.getState().tasks` (never
 * fetched or mutated here). This service never touches task scheduling,
 * cancellation, or completion — that stays owned entirely by
 * TaskNotificationService.
 * ============================================================================
 */

import { Task } from ".././types/task";
import { useTaskStore } from ".././store/task";

import NotificationHelper from "./core/NotificationHelper";
import NotificationLogger from "./core/NotificationLogger";
import NotificationScheduler from "./core/NotificationScheduler";

import {
  NotificationType,
  RoutineNotificationType,
} from "./core/NotificationTypes";

import {
  LOGGER_TAG,
  ROUTINE_SCHEDULE,
} from "./core/NotificationConstants";

// -----------------------------------------------------------------------------
// Message Pools
// -----------------------------------------------------------------------------
// One is picked at random each time a routine notification is (re)scheduled,
// so the user doesn't see the exact same wording every single day.
// -----------------------------------------------------------------------------

const MORNING_MOTIVATION_MESSAGES: readonly string[] = [
  "Good morning! Let's make today productive.",
  "Small steps every day lead to big success.",
  "Today is another opportunity to grow.",
];

const ENGAGEMENT_NO_TASKS_MESSAGES: readonly string[] = [
  "You don't have any tasks today. Add one and get started.",
];

const ENGAGEMENT_PENDING_MESSAGES: readonly string[] = [
  "You still have tasks waiting. Keep going!",
];

const ENGAGEMENT_COMPLETED_MESSAGES: readonly string[] = [
  "Excellent work! You've completed all today's tasks.",
];

const EVENING_PLANNING_MESSAGES: readonly string[] = [
  "Plan tomorrow today.",
  "Prepare tomorrow's priorities.",
  "Review your day and set tomorrow's goals.",
];

const DASHBOARD_SCREEN = "Dashboard";

class RoutineNotificationService {
  private static instance: RoutineNotificationService;
  private initialized = false;

  /**
   * ===========================================================================
   * Private Constructor (Singleton Pattern)
   * ===========================================================================
   */
  private constructor() {}

  /**
   * ===========================================================================
   * Get Instance
   * ===========================================================================
   */
  static getInstance(): RoutineNotificationService {
    if (!RoutineNotificationService.instance) {
      RoutineNotificationService.instance =
        new RoutineNotificationService();
    }
    return RoutineNotificationService.instance;
  }

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

    NotificationLogger.initialized(LOGGER_TAG.ROUTINE);
  }

  /**
   * ===========================================================================
   * Synchronize
   * ===========================================================================
   *
   * Called by NotificationBootstrap.synchronize().
   * Cancels and reschedules all four routine notifications for their next
   * occurrence.
   */
  async syncRoutines(): Promise<void> {
    try {
      NotificationLogger.synchronizationStarted(
        LOGGER_TAG.ROUTINE,
        4
      );

      await this.scheduleMorningMotivation();
      await this.scheduleEngagementReminders();
      await this.scheduleEveningPlanning();
      await this.scheduleDailySummary();

      NotificationLogger.synchronizationCompleted(
        LOGGER_TAG.ROUTINE
      );
    } catch (error) {
      NotificationLogger.synchronizationFailed(
        LOGGER_TAG.ROUTINE,
        error
      );
    }
  }

  /**
   * ===========================================================================
   * 1. Morning Motivation - 07:00 AM
   * ===========================================================================
   */
  private async scheduleMorningMotivation(): Promise<void> {
    try {
      const { hour, minute } = ROUTINE_SCHEDULE.MORNING_MOTIVATION;
      const trigger = NotificationHelper.getNextOccurrence(hour, minute);

      if (!NotificationHelper.canSchedule(trigger)) {
        NotificationLogger.debug(
          LOGGER_TAG.ROUTINE,
          "Skipped scheduling Morning Motivation (trigger in the past)."
        );
        return;
      }

      await NotificationScheduler.schedule({
        id: NotificationHelper.getRoutineNotificationId(
          RoutineNotificationType.MORNING_MOTIVATION
        ),

        trigger,

        content: {
          title: "☀️ Morning Motivation",

          body: this.pickRandom(MORNING_MOTIVATION_MESSAGES),

          payload: {
            type: NotificationType.ROUTINE,
            routineType: RoutineNotificationType.MORNING_MOTIVATION,
            screen: DASHBOARD_SCREEN,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        `Morning Motivation scheduled for ${trigger.toLocaleString()}`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to schedule Morning Motivation.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * 2. Engagement Reminder - 09:00 / 11:00 / 13:00 / 15:00 / 17:00
   * ===========================================================================
   */
  private async scheduleEngagementReminders(): Promise<void> {
    const slots: Array<{
      hour: number;
      minute: number;
      routineType: RoutineNotificationType;
    }> = [
      {
        ...ROUTINE_SCHEDULE.ENGAGEMENT_REMINDERS[0],
        routineType: RoutineNotificationType.ENGAGEMENT_09,
      },
      {
        ...ROUTINE_SCHEDULE.ENGAGEMENT_REMINDERS[1],
        routineType: RoutineNotificationType.ENGAGEMENT_11,
      },
      {
        ...ROUTINE_SCHEDULE.ENGAGEMENT_REMINDERS[2],
        routineType: RoutineNotificationType.ENGAGEMENT_13,
      },
      {
        ...ROUTINE_SCHEDULE.ENGAGEMENT_REMINDERS[3],
        routineType: RoutineNotificationType.ENGAGEMENT_15,
      },
      {
        ...ROUTINE_SCHEDULE.ENGAGEMENT_REMINDERS[4],
        routineType: RoutineNotificationType.ENGAGEMENT_17,
      },
    ];

    for (const slot of slots) {
      await this.scheduleEngagementReminder(slot);
    }
  }

  private async scheduleEngagementReminder(slot: {
    hour: number;
    minute: number;
    routineType: RoutineNotificationType;
  }): Promise<void> {
    try {
      const trigger = NotificationHelper.getNextOccurrence(
        slot.hour,
        slot.minute
      );

      if (!NotificationHelper.canSchedule(trigger)) {
        NotificationLogger.debug(
          LOGGER_TAG.ROUTINE,
          `Skipped scheduling Engagement Reminder ${slot.routineType} (trigger in the past).`
        );
        return;
      }

      const { title, body } = this.buildEngagementContent();

      await NotificationScheduler.schedule({
        id: NotificationHelper.getRoutineNotificationId(
          slot.routineType
        ),

        trigger,

        content: {
          title,

          body,

          payload: {
            type: NotificationType.ROUTINE,
            routineType: slot.routineType,
            screen: DASHBOARD_SCREEN,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        `Engagement Reminder (${slot.routineType}) scheduled for ${trigger.toLocaleString()}`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        `Failed to schedule Engagement Reminder (${slot.routineType}).`,
        error
      );
    }
  }

  /**
   * Builds the Engagement Reminder title/body based on today's tasks.
   *
   * Case A: no tasks           -> encourage creating the first task
   * Case B: pending tasks      -> encourage completing tasks
   * Case C: all tasks complete -> congratulate the user
   */
  private buildEngagementContent(): {
    title: string;
    body: string;
  } {
    const { tasks } = useTaskStore.getState();

    if (tasks.length === 0) {
      return {
        title: "👋 Let's get started",
        body: this.pickRandom(ENGAGEMENT_NO_TASKS_MESSAGES),
      };
    }

    const allCompleted = tasks.every((task: Task) => task.completed);

    if (allCompleted) {
      return {
        title: "🎉 All done!",
        body: this.pickRandom(ENGAGEMENT_COMPLETED_MESSAGES),
      };
    }

    return {
      title: "📋 Keep going",
      body: this.pickRandom(ENGAGEMENT_PENDING_MESSAGES),
    };
  }

  /**
   * ===========================================================================
   * 3. Evening Planning - 06:00 PM
   * ===========================================================================
   */
  private async scheduleEveningPlanning(): Promise<void> {
    try {
      const { hour, minute } = ROUTINE_SCHEDULE.EVENING_PLANNING;
      const trigger = NotificationHelper.getNextOccurrence(hour, minute);

      if (!NotificationHelper.canSchedule(trigger)) {
        NotificationLogger.debug(
          LOGGER_TAG.ROUTINE,
          "Skipped scheduling Evening Planning (trigger in the past)."
        );
        return;
      }

      await NotificationScheduler.schedule({
        id: NotificationHelper.getRoutineNotificationId(
          RoutineNotificationType.EVENING_PLANNING
        ),

        trigger,

        content: {
          title: "🌆 Evening Planning",

          body: this.pickRandom(EVENING_PLANNING_MESSAGES),

          payload: {
            type: NotificationType.ROUTINE,
            routineType: RoutineNotificationType.EVENING_PLANNING,
            screen: DASHBOARD_SCREEN,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        `Evening Planning scheduled for ${trigger.toLocaleString()}`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to schedule Evening Planning.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * 4. Daily Summary - 09:45 PM
   * ===========================================================================
   */
  private async scheduleDailySummary(): Promise<void> {
    try {
      const { hour, minute } = ROUTINE_SCHEDULE.DAILY_SUMMARY;
      const trigger = NotificationHelper.getNextOccurrence(hour, minute);

      if (!NotificationHelper.canSchedule(trigger)) {
        NotificationLogger.debug(
          LOGGER_TAG.ROUTINE,
          "Skipped scheduling Daily Summary (trigger in the past)."
        );
        return;
      }

      const body = this.buildDailySummaryBody();

      await NotificationScheduler.schedule({
        id: NotificationHelper.getRoutineNotificationId(
          RoutineNotificationType.DAILY_SUMMARY
        ),

        trigger,

        content: {
          title: "📊 Daily Summary",

          body,

          payload: {
            type: NotificationType.ROUTINE,
            routineType: RoutineNotificationType.DAILY_SUMMARY,
            screen: DASHBOARD_SCREEN,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        `Daily Summary scheduled for ${trigger.toLocaleString()}`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to schedule Daily Summary.",
        error
      );
    }
  }

  private buildDailySummaryBody(): string {
    const { tasks } = useTaskStore.getState();

    if (tasks.length === 0) {
      return "No tasks were created today. Tomorrow is another opportunity.";
    }

    const completed = tasks.filter(
      (task: Task) => task.completed
    ).length;

    const total = tasks.length;
    const pending = total - completed;

    return `Completed: ${completed}/${total}\nPending: ${pending}`;
  }

  /**
   * ===========================================================================
   * Cancel All Routine Notifications
   * ===========================================================================
   */
  async cancelAll(): Promise<void> {
    try {
      const routineTypes = Object.values(RoutineNotificationType);

      await Promise.all(
        routineTypes.map((routineType) =>
          NotificationScheduler.cancelByPayload({
            type: NotificationType.ROUTINE,
            routineType,
          })
        )
      );

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        "Cancelled all routine notifications."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to cancel all routine notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Refresh
   * ===========================================================================
   *
   * Cancels all routine notifications and reschedules them for their next
   * occurrence. Call this after anything that could change engagement /
   * summary content ahead of schedule (e.g. bulk task import), or on a
   * pull-to-refresh action.
   */
  async refresh(): Promise<void> {
    try {
      await this.cancelAll();
      await this.syncRoutines();

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        "Routine notifications refreshed."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to refresh routine notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Dispose
   * ===========================================================================
   *
   * Called by NotificationBootstrap.shutdown().
   */
  async dispose(): Promise<void> {
    try {
      await this.cancelAll();

      this.initialized = false;

      NotificationLogger.disposed(LOGGER_TAG.ROUTINE);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to dispose Routine Notification Service.",
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

  /**
   * ===========================================================================
   * Reset Service (For Testing)
   * ===========================================================================
   */
  reset(): void {
    this.initialized = false;
  }

  /**
   * ===========================================================================
   * Pick Random Message
   * ===========================================================================
   */
  private pickRandom(messages: readonly string[]): string {
    const index = Math.floor(Math.random() * messages.length);
    return messages[index];
  }
}

// Export singleton instance
export default RoutineNotificationService.getInstance();