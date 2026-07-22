/**
 * ============================================================================
 * LifeOS Goal Notification Service
 * ============================================================================
 *
 * Handles all Goal notification operations.
 *
 * LINKING (already correct in store/goals.ts, nothing to fix there):
 * store/goals.ts calls scheduleGoal() / rescheduleGoal() / onGoalDeleted()
 * directly and IMMEDIATELY after every create/update/delete succeeds — so
 * any field change (deadline, date, time, status, name) already triggers
 * an instant cancel+reschedule for that specific goal, the moment it
 * happens. This mirrors exactly how TaskNotificationService is linked from
 * store/task.ts, and how RoutineNotificationService is linked from
 * store/task.ts's subscription. That real-time path was already correct —
 * this file doesn't need to (and shouldn't) change how store/goals.ts
 * calls it.
 *
 * FIX (this file): syncGoals() previously cancelled + rescheduled EVERY
 * goal on EVERY call, regardless of whether that goal had actually
 * changed. Since store/goals.ts's fetchGoals() calls syncGoals() after
 * every successful fetch (30s cache TTL — so effectively every screen
 * visit), and each reschedule triggers NotificationScheduler.schedule()
 * -> cancelByPayload() -> a full getAllScheduledNotificationsAsync() scan,
 * this meant redundant native round-trips for goals that hadn't changed
 * at all. syncGoals() now diffs against an in-memory snapshot
 * (status + deadline + updatedAt) taken at the end of the previous sync,
 * and only touches the scheduler for goals whose snapshot actually
 * changed — the same "diff instead of blind resync" pattern that avoids
 * this problem in AIReviewNotificationService.
 *
 * syncGoals() also guards against overlapping/re-entrant calls, the same
 * way TaskNotificationService.syncTasks() does — otherwise
 * NotificationBootstrap.synchronize() and any screen-level fetchGoals()
 * firing close together on cold start can race on cancel/reschedule for
 * the same goal notification IDs.
 * ============================================================================
 */

import { Goal, GoalStatus } from "../../store/goals";
import { useGoalStore } from "../../store/goals";
import NotificationHelper from "../core/NotificationHelper";
import NotificationLogger from "../core/NotificationLogger";
import NotificationScheduler from "../core/NotificationScheduler";
import { NotificationType } from "../core/NotificationTypes";
import {
  LOGGER_TAG,
  REMINDER_MINUTES,
} from "../core/NotificationConstants";

/** Statuses that should never have an active reminder/deadline notification. */
const INACTIVE_STATUSES: readonly GoalStatus[] = ["COMPLETED", "CANCELLED"];

class GoalNotificationService {
  private initialized = false;

  /** Guards against overlapping syncGoals() calls racing each other. */
  private syncInFlight: Promise<void> | null = null;

  /**
   * Snapshot of the fields that matter for scheduling, keyed by goal id,
   * taken at the end of the last successful sync. Used to skip goals that
   * haven't actually changed on the next syncGoals() call. Intentionally
   * in-memory only (not persisted) — on a fresh app launch this starts
   * empty, so the first sync after cold start always does a full pass,
   * which is correct since we don't otherwise know what's actually
   * pending on the device yet.
   */
  private lastSyncedSnapshot: Map<string, string> = new Map();

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
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = this.doSyncGoals();

    try {
      await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  /** Builds the diff key for a goal — scheduling only depends on these fields. */
  private snapshotKeyFor(goal: Goal): string {
    return `${goal.status}|${goal.deadline}|${goal.updatedAt}`;
  }

  private async doSyncGoals(): Promise<void> {
    try {
      const { goals } = useGoalStore.getState();

      NotificationLogger.info(
        LOGGER_TAG.GOAL,
        `Syncing ${goals.length} goal notification(s).`
      );

      const currentIds = new Set(goals.map((goal) => goal.id));

      // Any goal present in the previous snapshot but no longer in the
      // current list was deleted (or the list was replaced wholesale) —
      // make sure its notifications are cancelled and its snapshot entry
      // dropped so it doesn't leak forever.
      for (const goalId of this.lastSyncedSnapshot.keys()) {
        if (!currentIds.has(goalId)) {
          await this.cancelGoal(goalId);
          this.lastSyncedSnapshot.delete(goalId);
        }
      }

      let touched = 0;
      let skipped = 0;

      for (const goal of goals) {
        const currentKey = this.snapshotKeyFor(goal);
        const previousKey = this.lastSyncedSnapshot.get(goal.id);

        if (previousKey === currentKey) {
          // Nothing relevant changed since the last sync — skip touching
          // the scheduler entirely for this goal.
          skipped += 1;
          continue;
        }

        if (INACTIVE_STATUSES.includes(goal.status)) {
          await this.cancelGoal(goal.id);
        } else {
          await this.rescheduleGoal(goal);
        }

        this.lastSyncedSnapshot.set(goal.id, currentKey);
        touched += 1;
      }

      NotificationLogger.info(
        LOGGER_TAG.GOAL,
        `Goal notification sync completed. (${touched} updated, ${skipped} unchanged)`
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

      if (INACTIVE_STATUSES.includes(goal.status)) {
        NotificationLogger.debug(
          LOGGER_TAG.GOAL,
          `Skipping ${goal.status.toLowerCase()} goal "${goal.goalName}".`
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

      // Keep the diff snapshot in sync for any caller that schedules a
      // goal directly (e.g. store/goals.ts's createGoal), so a later
      // syncGoals() call correctly recognizes this goal as already
      // up to date and doesn't redundantly reschedule it again.
      this.lastSyncedSnapshot.set(goal.id, this.snapshotKeyFor(goal));

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
   *
   * Called directly (and immediately) by store/goals.ts's updateGoal() on
   * every single update — this is the real-time link that keeps a goal's
   * notifications matching its current deadline/status the moment it
   * changes, independent of the periodic syncGoals() diffing above.
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
   *
   * NOTE: not currently called anywhere in the codebase you've shared —
   * store/goals.ts's updateGoal() routes completion through
   * rescheduleGoal() -> scheduleGoal(), which already correctly skips
   * INACTIVE_STATUSES goals. Kept here (and still correct to call) in case
   * another flow — e.g. a dedicated "mark complete" gesture that doesn't
   * go through the full updateGoal() payload — needs a direct entry point.
   */
  async onGoalCompleted(goalId: string): Promise<void> {
    await this.cancelGoal(goalId);
    this.lastSyncedSnapshot.delete(goalId);

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
    this.lastSyncedSnapshot.delete(goalId);

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

      await Promise.all(goals.map((goal) => this.cancelGoal(goal.id)));

      this.lastSyncedSnapshot.clear();

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