/**
 * ============================================================================
 * LifeOS Goal Notification Service
 * ============================================================================
 *
 * Handles all Goal notification operations.
 *
 * REDESIGN: previously scheduled two one-time notifications per goal (a
 * fixed reminder N minutes before the deadline, and a single deadline-day
 * notification). Replaced with a single DAILY status-aware reminder whose
 * content is recomputed every day based on where "today" sits relative to
 * the goal's start date and deadline:
 *
 *   - Goal hasn't started yet          -> nothing sent
 *   - Today is the start date          -> "Goal Started"
 *   - Between start and day-before-due -> "Still in progress"
 *   - The day before the deadline      -> "Deadline tomorrow"
 *   - The deadline day itself          -> "Deadline today"
 *   - Past the deadline, still active  -> "Overdue" (repeats daily until
 *                                          the goal is completed/cancelled)
 *
 * Plus three one-off EVENT notifications:
 *   - Completed before the deadline    -> congratulate
 *   - Completed exactly on the deadline -> congratulate
 *   - Completed after the deadline     -> encourage (motivate for next time)
 *   - Goal deleted                     -> encourage user not to give up /
 *                                          focus on the next goal
 *
 * CRITICAL FIX: cancelGoal() previously called
 * NotificationScheduler.cancelMany([`${goalId}_reminder`, `${goalId}_deadline`]),
 * but cancelMany() forwards those strings straight to
 * Notifications.cancelScheduledNotificationAsync(), which requires Expo's
 * own auto-generated identifier — NOT our custom logical id. Since
 * NotificationScheduler.schedule() never passes `identifier: notification.id`
 * to scheduleNotificationAsync(), Expo always assigns its own random UUID,
 * so those cancel calls were matching nothing and silently doing nothing.
 * Every previous version of this file had this bug. Fixed by switching to
 * NotificationScheduler.cancelByPayload(), which first looks up the real
 * Expo identifier from the pending list before cancelling — the same
 * correct pattern TaskNotificationService.cancelTaskNotifications() already
 * used.
 *
 * LINKING (unchanged, still correct): store/goals.ts calls scheduleGoal() /
 * rescheduleGoal() / onGoalDeleted() directly and immediately after every
 * create/update/delete succeeds.
 *
 * DIFFING: syncGoals() still skips goals that haven't changed since the
 * last sync, BUT the diff key now also incorporates "today's date" for
 * active goals — because the daily reminder's correct content depends on
 * the calendar day, not just the goal's own fields. Once a goal is
 * COMPLETED/CANCELLED its key stops changing daily (nothing left to
 * reschedule), so sync cost returns to near-zero for finished goals.
 * ============================================================================
 */

import { Goal, GoalStatus } from "../../store/goals";
import { useGoalStore } from "../../store/goals";
import NotificationHelper from "../core/NotificationHelper";
import NotificationLogger from "../core/NotificationLogger";
import NotificationScheduler from "../core/NotificationScheduler";
import { NotificationType } from "../core/NotificationTypes";
import { LOGGER_TAG } from "../core/NotificationConstants";

/** Statuses that should never have an active daily reminder. */
const INACTIVE_STATUSES: readonly GoalStatus[] = ["COMPLETED", "CANCELLED"];

/** How far out a one-off "event" notification (completed/deleted) fires. */
const EVENT_NOTIFICATION_DELAY_MS = 5000;

class GoalNotificationService {
  private initialized = false;

  /** Guards against overlapping syncGoals() calls racing each other. */
  private syncInFlight: Promise<void> | null = null;

  /**
   * Diff snapshot keyed by goal id — see file header. Intentionally
   * in-memory only; starts empty on cold start, so the first sync after
   * launch always does a full pass (correct, since we don't otherwise know
   * what's actually pending on the device yet).
   */
  private lastSyncedSnapshot: Map<string, string> = new Map();

  /**
   * Tracks each goal's last-known status so scheduleGoal() can detect the
   * exact moment a goal transitions INTO "COMPLETED" and fire the
   * congratulate/encourage message exactly once — not every time
   * scheduleGoal() happens to run against an already-completed goal.
   */
  private lastKnownStatus: Map<string, GoalStatus> = new Map();

  private readonly DAILY_HOUR = 9;
  private readonly DAILY_MINUTE = 0;

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

  /**
   * Builds the diff key for a goal. For active goals this includes today's
   * date, so the key naturally changes once a day and forces a reschedule
   * pass — necessary because the daily reminder's correct wording depends
   * on the calendar day, not just the goal's own fields. For
   * completed/cancelled goals the date is left out, so their key stays
   * stable and they get skipped on every subsequent sync.
   */
  private snapshotKeyFor(goal: Goal): string {
    const dayBucket = INACTIVE_STATUSES.includes(goal.status)
      ? "static"
      : NotificationHelper.getToday();

    return `${goal.status}|${goal.deadline}|${goal.updatedAt}|${dayBucket}`;
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
      // make sure its notifications are cancelled and its bookkeeping
      // entries dropped so they don't leak forever.
      for (const goalId of this.lastSyncedSnapshot.keys()) {
        if (!currentIds.has(goalId)) {
          await this.cancelGoal(goalId);
          this.lastSyncedSnapshot.delete(goalId);
          this.lastKnownStatus.delete(goalId);
        }
      }

      let touched = 0;
      let skipped = 0;

      for (const goal of goals) {
        const currentKey = this.snapshotKeyFor(goal);
        const previousKey = this.lastSyncedSnapshot.get(goal.id);

        if (previousKey === currentKey) {
          // Nothing relevant changed since the last sync (and, for active
          // goals, it's still the same calendar day) — skip touching the
          // scheduler entirely for this goal.
          skipped += 1;
          continue;
        }

        await this.scheduleGoal(goal);
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
   *
   * Single entry point for both "just changed" (create/update, called
   * directly by store/goals.ts) and "periodic sync" (called from
   * syncGoals() above) flows. Handles three cases:
   *   1. Status just transitioned to COMPLETED -> fire the completion
   *      event message exactly once, cancel the daily reminder.
   *   2. Status is COMPLETED/CANCELLED (already was)  -> make sure nothing
   *      is left scheduled, no event message (already fired, or was never
   *      active to begin with).
   *   3. Active -> (re)schedule today's/the-next-occurrence's daily
   *      reminder with status-aware content.
   */
  async scheduleGoal(goal: Goal): Promise<void> {
    try {
      NotificationLogger.debug(
        LOGGER_TAG.GOAL,
        `Preparing notifications for "${goal.goalName}".`
      );

      const previousStatus = this.lastKnownStatus.get(goal.id);
      this.lastKnownStatus.set(goal.id, goal.status);

      const justCompleted =
        goal.status === "COMPLETED" && previousStatus !== "COMPLETED";

      if (justCompleted) {
        await this.handleGoalCompleted(goal);
        this.lastSyncedSnapshot.set(goal.id, this.snapshotKeyFor(goal));
        return;
      }

      if (INACTIVE_STATUSES.includes(goal.status)) {
        await this.cancelGoal(goal.id);
        this.lastSyncedSnapshot.set(goal.id, this.snapshotKeyFor(goal));
        return;
      }

      await this.scheduleDailyReminder(goal);
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
   * Date Helpers
   * ===========================================================================
   */
  private toDateOnly(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Computes the daily reminder's title/body for the given reference day
   * (the calendar day the notification will actually FIRE on — not
   * necessarily "right now"). Returns null if the goal hasn't started as
   * of that day yet, meaning nothing should be scheduled.
   */
  private computeDailyContent(
    goal: Goal,
    referenceDate: Date
  ): { title: string; body: string } | null {
    const refDay = this.toDateOnly(referenceDate);
    const startDay = this.toDateOnly(new Date(goal.goalDate));
    const deadlineDay = this.toDateOnly(new Date(goal.deadline));

    if (refDay.getTime() < startDay.getTime()) {
      // Goal hasn't started as of the day this would fire on yet.
      return null;
    }

    if (refDay.getTime() === startDay.getTime()) {
      return {
        title: "🚀 Goal Started",
        body: `You started "${goal.goalName}" today. Let's make it happen!`,
      };
    }

    if (refDay.getTime() < deadlineDay.getTime()) {
      const dayBeforeDeadline = new Date(deadlineDay);
      dayBeforeDeadline.setDate(dayBeforeDeadline.getDate() - 1);

      if (refDay.getTime() === dayBeforeDeadline.getTime()) {
        return {
          title: "⏳ Deadline Tomorrow",
          body: `Your goal "${goal.goalName}" is due tomorrow. Almost there!`,
        };
      }

      return {
        title: "📌 Goal In Progress",
        body: `Your goal "${goal.goalName}" is still on. Keep going!`,
      };
    }

    if (refDay.getTime() === deadlineDay.getTime()) {
      return {
        title: "🏁 Deadline Today",
        body: `Today is the deadline for "${goal.goalName}". You can still finish it!`,
      };
    }

    // refDay > deadlineDay
    return {
      title: "⚠️ Goal Overdue",
      body: `Your goal "${goal.goalName}" is overdue. Complete it as soon as you can!`,
    };
  }

  /**
   * ===========================================================================
   * Schedule Daily Reminder
   * ===========================================================================
   *
   * Schedules ONE notification for the next occurrence of DAILY_HOUR:
   * DAILY_MINUTE (today if that time hasn't passed yet, otherwise
   * tomorrow), with content computed for the day it will actually fire on.
   * Callers (scheduleGoal / syncGoals) are responsible for re-invoking
   * this daily so the chain continues — same pattern already used by
   * NoteNotificationService and RoutineNotificationService.
   */
  private async scheduleDailyReminder(goal: Goal): Promise<void> {
    try {
      const trigger = NotificationHelper.getNextOccurrence(
        this.DAILY_HOUR,
        this.DAILY_MINUTE
      );

      const content = this.computeDailyContent(goal, trigger);

      if (!content) {
        NotificationLogger.debug(
          LOGGER_TAG.GOAL,
          `Skipping daily reminder for "${goal.goalName}" — hasn't started yet.`
        );
        return;
      }

      await NotificationScheduler.schedule({
        id: `${goal.id}_daily`,
        trigger,
        content: {
          title: content.title,
          body: content.body,
          payload: {
            type: NotificationType.GOAL,
            goalId: goal.id,
          },
        },
      });

      NotificationLogger.debug(
        LOGGER_TAG.GOAL,
        `Daily reminder scheduled for "${goal.goalName}" (${content.title}).`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.GOAL,
        "Failed to schedule daily goal reminder.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Event Notifications (completion / deletion)
   * ===========================================================================
   */
  private async sendImmediateNotification(
    goalId: string,
    title: string,
    body: string
  ): Promise<void> {
    await NotificationScheduler.schedule({
      id: `${goalId}_event_${Date.now()}`,
      trigger: new Date(Date.now() + EVENT_NOTIFICATION_DELAY_MS),
      content: {
        title,
        body,
        payload: {
          type: NotificationType.GOAL,
          goalId,
        },
      },
    });
  }

  /**
   * Fired exactly once, the moment a goal's status transitions to
   * COMPLETED (detected in scheduleGoal() above). Message depends on
   * whether it was completed ahead of, exactly on, or after its deadline.
   */
  private async handleGoalCompleted(goal: Goal): Promise<void> {
    try {
      // Stop the daily reminder chain — nothing more to remind about.
      await this.cancelGoal(goal.id);

      const today = this.toDateOnly(new Date());
      const deadlineDay = this.toDateOnly(new Date(goal.deadline));

      let title: string;
      let body: string;

      if (today.getTime() < deadlineDay.getTime()) {
        title = "🎉 Congratulations!";
        body = `You completed "${goal.goalName}" ahead of your deadline. Fantastic work!`;
      } else if (today.getTime() === deadlineDay.getTime()) {
        title = "🎉 Right on Time!";
        body = `You completed "${goal.goalName}" exactly on its deadline. Great job!`;
      } else {
        title = "💪 Goal Completed";
        body = `You finished "${goal.goalName}" a little after the deadline — still a real win! Aim to beat the deadline on your next goal.`;
      }

      await this.sendImmediateNotification(goal.id, title, body);

      NotificationLogger.info(
        LOGGER_TAG.GOAL,
        `Goal completed: ${goal.id} (${title}).`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.GOAL,
        "Failed to send goal completion notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Cancel Goal Notifications
   * ===========================================================================
   *
   * FIX: now uses cancelByPayload() instead of the broken cancelMany()
   * call — see file header for why the old version silently did nothing.
   */
  async cancelGoal(goalId: string): Promise<void> {
    try {
      await NotificationScheduler.cancelByPayload({
        type: NotificationType.GOAL,
        goalId,
      });

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
   * every single update — the real-time link that keeps a goal's daily
   * reminder (and completion detection) matching its current
   * deadline/status the moment it changes.
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
   * Goal Completed (direct entry point, goalId only)
   * ===========================================================================
   *
   * Kept for API compatibility / any flow that only has a goalId, not a
   * full Goal object (e.g. a lightweight "mark complete" gesture). It can
   * only cancel the daily reminder — it CANNOT produce the
   * ahead-of/on/after-deadline message, since that requires the goal's
   * deadline and name. If the full Goal object is available at the call
   * site, prefer routing through scheduleGoal()/rescheduleGoal() instead
   * (which store/goals.ts's updateGoal() already does), so the completion
   * message fires correctly.
   */
  async onGoalCompleted(goalId: string): Promise<void> {
    await this.cancelGoal(goalId);
    this.lastSyncedSnapshot.delete(goalId);
    this.lastKnownStatus.set(goalId, "COMPLETED");

    NotificationLogger.info(
      LOGGER_TAG.GOAL,
      `Goal completed: ${goalId}`
    );
  }

  /**
   * ===========================================================================
   * Goal Deleted
   * ===========================================================================
   *
   * Cancels the daily reminder and sends a one-off encouraging message —
   * meant to soften the moment of giving up on a goal and nudge focus
   * toward finishing the next one within its timeframe, rather than
   * deleting that one too.
   */
  async onGoalDeleted(goalId: string): Promise<void> {
    try {
      await this.cancelGoal(goalId);
      this.lastSyncedSnapshot.delete(goalId);
      this.lastKnownStatus.delete(goalId);

      await this.sendImmediateNotification(
        goalId,
        "🌱 Keep Moving Forward",
        "Every goal is a learning step. Let go of this one and focus on finishing your next goal within its timeframe — you've got this!"
      );

      NotificationLogger.info(
        LOGGER_TAG.GOAL,
        `Goal deleted: ${goalId}`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.GOAL,
        "Failed to handle goal deletion.",
        error
      );
    }
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
      this.lastKnownStatus.clear();

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