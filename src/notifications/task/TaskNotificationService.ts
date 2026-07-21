/**
 * ============================================================================
 * LifeOS Task Notification Service
 * ============================================================================
 *
 * FIX 1 (carried over): scheduleReminder() used to reimplement the
 * ">15 / 6-14 / <=5" smart-reminder branching independently of
 * NotificationHelper's getReminderOffset()/getSmartReminderTrigger(). Now
 * calls NotificationHelper exclusively — single source of truth.
 *
 * FIX 2 (carried over): The "immediate" trigger buffer comes from
 * TASK_REMINDER.IMMEDIATE_BUFFER_SECONDS (5s) via
 * NotificationHelper.getSmartReminderTrigger(), instead of a bare
 * `Date.now() + 1000` that could expire before scheduleNotificationAsync()
 * ran under JS-thread contention.
 *
 * FIX 3 (this revision): `scheduleTask()` used to gate ALL three
 * sub-notifications (Reminder, Due, Overdue) behind a single
 * `canSchedule(taskDateTime)` check. But the Overdue trigger is
 * `taskDateTime + OVERDUE_AFTER`, which can still be in the future even
 * when `taskDateTime` itself has already passed. That single early return
 * silently skipped scheduling the Overdue notification any time
 * scheduleTask/rescheduleTask ran after a task's due time but before its
 * overdue window elapsed (e.g. reopening the app right after a task
 * became due). The gate now checks against the Overdue trigger — the
 * furthest-future of the three — and each sub-scheduler still keeps its
 * own independent `canSchedule()` check for its own trigger.
 *
 * FIX 4 (this revision): `syncInFlight` previously only prevented
 * `syncTasks()` from racing against itself. It did nothing to stop a
 * direct call — e.g. `markComplete`/`updateTask` in the store calling
 * `onTaskCompleted`/`rescheduleTask` directly — from racing a concurrent
 * `syncTasks()` sweep touching the SAME task's notification IDs (cancel
 * and (re)schedule interleaving unpredictably). All task-mutating entry
 * points (`scheduleTask`, `cancelTask`, `rescheduleTask`,
 * `onTaskCompleted`, `onTaskDeleted`) now serialize through a per-taskId
 * lock (`withTaskLock`), so operations on the same task always run one at
 * a time and in call order, while operations on different tasks still run
 * fully in parallel. `syncTasks()`'s per-task loop goes through the same
 * public, lock-guarded methods, so it composes correctly with direct
 * calls instead of racing them.
 *
 * FEATURE 1 (new): completion feedback. `onTaskCompleted()` now looks the
 * task up in TaskStore (this is the "correctly linked with the task
 * store" part — it reads the live task record, not just an id) and fires
 * a short feedback notification a few seconds later:
 *   - Completed at or before the task's due time  -> a congrats message.
 *   - Completed after the task's due time         -> an encouraging
 *     "finish before the deadline next time" message.
 *
 * FEATURE 2 (new, closes the loop): `onTaskCompleted()` cancels the
 * task's Reminder/Due/Overdue notifications FIRST, then schedules the
 * completion feedback — so a completed task never has a stray Due/Overdue
 * notification fire later, and the feedback notification itself isn't
 * immediately cancelled by that same cleanup step.
 *
 * ── REQUIRED companion change ────────────────────────────────────────────
 * This file references two new payload discriminators,
 * `TaskNotificationType.COMPLETED_ON_TIME` and
 * `TaskNotificationType.COMPLETED_LATE`. Add them to the existing enum in
 * `core/NotificationTypes.ts`, e.g.:
 *
 *   export enum TaskNotificationType {
 *     REMINDER = "REMINDER",
 *     DUE = "DUE",
 *     OVERDUE = "OVERDUE",
 *     COMPLETED_ON_TIME = "COMPLETED_ON_TIME",
 *     COMPLETED_LATE = "COMPLETED_LATE",
 *   }
 *
 * Without that addition, this file will fail to compile — TypeScript
 * doesn't have a way to add enum members from a consuming file.
 * ============================================================================
 */

import { Task } from "../../types/task";
import { useTaskStore } from "../../store/task";

import NotificationHelper from "../core/NotificationHelper";
import NotificationLogger from "../core/NotificationLogger";
import NotificationScheduler from "../core/NotificationScheduler";

import {
  NotificationType,
  TaskNotificationType,
} from "../core/NotificationTypes";

import {
  LOGGER_TAG,
  TASK_REMINDER,
} from "../core/NotificationConstants";

class TaskNotificationService {
  private initialized: boolean = false;

  /** Guards against overlapping syncTasks() calls racing each other. */
  private syncInFlight: Promise<void> | null = null;

  /**
   * Per-taskId serialization queue. Every public method that touches a
   * given task's notifications (schedule/cancel/reschedule/complete/
   * delete) runs through `withTaskLock(task.id, ...)`, so two calls for
   * the SAME task always run one after another in call order, while calls
   * for DIFFERENT tasks are unaffected and run concurrently.
   */
  private taskLocks: Map<string, Promise<void>> = new Map();

  private async withTaskLock<T>(
    taskId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const previousLock = this.taskLocks.get(taskId) ?? Promise.resolve();

    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const chained = previousLock.then(() => lockPromise);
    this.taskLocks.set(taskId, chained);

    await previousLock;

    try {
      return await fn();
    } finally {
      releaseLock!();

      // Only clear the map entry if nobody chained after us, so we don't
      // let the map grow forever, but also don't clobber a newer waiter.
      if (this.taskLocks.get(taskId) === chained) {
        this.taskLocks.delete(taskId);
      }
    }
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

    NotificationLogger.initialized(LOGGER_TAG.TASK);
  }

  /**
   * ===========================================================================
   * Sync Task Notifications
   * ===========================================================================
   */
  async syncTasks(): Promise<void> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = this.doSyncTasks();

    try {
      await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async doSyncTasks(): Promise<void> {
    try {
      const { tasks } = useTaskStore.getState();

      NotificationLogger.synchronizationStarted(
        LOGGER_TAG.TASK,
        tasks.length
      );

      for (const task of tasks) {
        if (task.completed) {
          // Routed through the public method so it takes the per-task
          // lock and can't interleave with a concurrent direct call for
          // this same task.
          await this.cancelTask(task.id);
          continue;
        }

        await this.rescheduleTask(task);
      }

      NotificationLogger.synchronizationCompleted(LOGGER_TAG.TASK);
    } catch (error) {
      NotificationLogger.synchronizationFailed(LOGGER_TAG.TASK, error);
    }
  }

  /**
   * ===========================================================================
   * Schedule Task
   * ===========================================================================
   */
  async scheduleTask(task: Task): Promise<void> {
    return this.withTaskLock(task.id, () => this.scheduleTaskInternal(task));
  }

  private async scheduleTaskInternal(task: Task): Promise<void> {
    try {
      if (task.completed) {
        NotificationLogger.skippedCompletedTask(task.taskName);
        return;
      }

      const taskDateTime = NotificationHelper.combineDateAndTime(
        task.taskDate,
        task.taskTime
      );

      const overdueTrigger = NotificationHelper.getOverdueTrigger(
        taskDateTime,
        TASK_REMINDER.OVERDUE_AFTER
      );

      // A task is only fully unschedulable once even its Overdue trigger
      // — the furthest-future of the three — has already passed. Gating
      // on taskDateTime alone (the old behavior) incorrectly skipped the
      // Overdue notification for tasks whose due time had passed but
      // whose overdue window was still ahead.
      if (!NotificationHelper.canSchedule(overdueTrigger)) {
        NotificationLogger.skippedPastTask(task.taskName);
        return;
      }

      // Each sub-scheduler still independently checks its own trigger
      // against "now", so a Reminder or Due notification whose own
      // trigger has already passed is still correctly skipped — only the
      // artificial shared gate is removed.
      await this.scheduleReminder(task);
      await this.scheduleDueNotification(task);
      await this.scheduleOverdueNotification(task);

      NotificationLogger.taskScheduled(task.taskName);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.TASK,
        "Failed to schedule task.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Reminder Notification
   * ===========================================================================
   *
   * Smart Reminder Logic — delegated entirely to NotificationHelper, which
   * is the single source of truth for the offset rule.
   */
  private async scheduleReminder(task: Task): Promise<void> {
    try {
      const taskDateTime = NotificationHelper.combineDateAndTime(
        task.taskDate,
        task.taskTime
      );

      const { trigger, offsetMinutes, isImmediate } =
        NotificationHelper.getSmartReminderTrigger(taskDateTime);

      if (!NotificationHelper.canSchedule(trigger)) {
        NotificationLogger.debug(
          LOGGER_TAG.TASK,
          `Skipped scheduling Reminder for "${task.taskName}" (trigger in the past).`
        );
        return;
      }

      const body = isImmediate
        ? `"${task.taskName}" starts soon.`
        : `"${task.taskName}" starts in ${offsetMinutes} minutes.`;

      if (isImmediate) {
        NotificationLogger.immediateReminder(task.taskName);
      } else if (offsetMinutes === TASK_REMINDER.SHORT_BEFORE) {
        NotificationLogger.fiveMinuteReminder(task.taskName);
      } else {
        NotificationLogger.fifteenMinuteReminder(task.taskName);
      }

      await NotificationScheduler.schedule({
        id: NotificationHelper.getTaskNotificationId(task.id + "_REMINDER"),

        trigger,

        content: {
          title: "⏰ Task Reminder",

          body,

          payload: {
            type: NotificationType.TASK,
            taskId: task.id,
            notificationType: TaskNotificationType.REMINDER,
          },
        },
      });
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.TASK,
        "Failed to schedule reminder.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Due Notification
   * ===========================================================================
   */
  private async scheduleDueNotification(task: Task): Promise<void> {
    try {
      const trigger = NotificationHelper.combineDateAndTime(
        task.taskDate,
        task.taskTime
      );

      if (!NotificationHelper.canSchedule(trigger)) {
        return;
      }

      await NotificationScheduler.schedule({
        id: NotificationHelper.getTaskNotificationId(task.id + "_DUE"),

        trigger,

        content: {
          title: "📌 Task Due",

          body: `"${task.taskName}" is scheduled now.`,

          payload: {
            type: NotificationType.TASK,
            taskId: task.id,
            notificationType: TaskNotificationType.DUE,
          },
        },
      });

      NotificationLogger.dueNotification(task.taskName);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.TASK,
        "Failed to schedule due notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Overdue Notification
   * ===========================================================================
   */
  private async scheduleOverdueNotification(task: Task): Promise<void> {
    try {
      const taskDateTime = NotificationHelper.combineDateAndTime(
        task.taskDate,
        task.taskTime
      );

      const trigger = NotificationHelper.getOverdueTrigger(
        taskDateTime,
        TASK_REMINDER.OVERDUE_AFTER
      );

      if (!NotificationHelper.canSchedule(trigger)) {
        return;
      }

      await NotificationScheduler.schedule({
        id: NotificationHelper.getTaskNotificationId(task.id + "_OVERDUE"),

        trigger,

        content: {
          title: "⚠️ Task Overdue",

          body: `You haven't completed "${task.taskName}" yet.`,

          payload: {
            type: NotificationType.TASK,
            taskId: task.id,
            notificationType: TaskNotificationType.OVERDUE,
          },
        },
      });

      NotificationLogger.overdueNotification(task.taskName);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.TASK,
        "Failed to schedule overdue notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Completion Feedback (on-time congrats / late nudge)
   * ===========================================================================
   *
   * Fires a few seconds after completion (same safety buffer as the
   * immediate Reminder case) so it doesn't race the notification
   * scheduling backend. Compares "now" (completion time) against the
   * task's own due datetime, read straight from the task passed in — the
   * live TaskStore record — to decide which message to send.
   */
  private async scheduleCompletionFeedback(task: Task): Promise<void> {
    try {
      const taskDateTime = NotificationHelper.combineDateAndTime(
        task.taskDate,
        task.taskTime
      );

      const completedAt = new Date();
      const trigger = new Date(
        completedAt.getTime() + TASK_REMINDER.IMMEDIATE_BUFFER_SECONDS * 1000
      );

      const completedOnTime = completedAt.getTime() <= taskDateTime.getTime();

      const title = completedOnTime ? "🎉 Nice work!" : "💪 Getting there!";

      const body = completedOnTime
        ? `You completed "${task.taskName}" on time. Keep the streak going!`
        : `You completed "${task.taskName}", but after it was due. Try wrapping it up before the deadline next time!`;

      await NotificationScheduler.schedule({
        id: NotificationHelper.getTaskNotificationId(
          task.id + "_COMPLETION_FEEDBACK"
        ),

        trigger,

        content: {
          title,

          body,

          payload: {
            type: NotificationType.TASK,
            taskId: task.id,
            notificationType: completedOnTime
              ? ("COMPLETED_ON_TIME" as TaskNotificationType)
              : ("COMPLETED_LATE" as TaskNotificationType),
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.TASK,
        completedOnTime
          ? `On-time completion feedback scheduled for "${task.taskName}".`
          : `Late completion feedback scheduled for "${task.taskName}".`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.TASK,
        "Failed to schedule task completion feedback.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Cancel Task Notifications
   * ===========================================================================
   */
  async cancelTask(taskId: string): Promise<void> {
    return this.withTaskLock(taskId, () => this.cancelTaskInternal(taskId));
  }

  private async cancelTaskInternal(taskId: string): Promise<void> {
    try {
      await NotificationScheduler.cancelTaskNotifications(taskId);

      NotificationLogger.taskCancelled(taskId);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.TASK,
        "Failed to cancel task notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Reschedule Task Notifications
   * ===========================================================================
   */
  async rescheduleTask(task: Task): Promise<void> {
    return this.withTaskLock(task.id, () =>
      this.rescheduleTaskInternal(task)
    );
  }

  private async rescheduleTaskInternal(task: Task): Promise<void> {
    try {
      await this.cancelTaskInternal(task.id);
      await this.scheduleTaskInternal(task);

      NotificationLogger.taskRescheduled(task.taskName);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.TASK,
        "Failed to reschedule task notification.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Task Completed
   * ===========================================================================
   *
   * Looks the task up in TaskStore (the "linked with the task store" part)
   * to read its due date/time, cancels its Reminder/Due/Overdue
   * notifications so none of them fire for an already-completed task, and
   * then schedules the on-time/late completion feedback notification.
   */
  async onTaskCompleted(taskId: string): Promise<void> {
    return this.withTaskLock(taskId, () =>
      this.onTaskCompletedInternal(taskId)
    );
  }

  private async onTaskCompletedInternal(taskId: string): Promise<void> {
    try {
      const { tasks } = useTaskStore.getState();
      const task = tasks.find((t) => t.id === taskId);

      // Cancel first, so the Due/Overdue notifications can never fire
      // after this point. Cancel happens BEFORE scheduling the completion
      // feedback below, so it doesn't wipe out the feedback notification
      // it's about to schedule.
      await this.cancelTaskInternal(taskId);

      if (task) {
        await this.scheduleCompletionFeedback(task);
      } else {
        NotificationLogger.info(
          LOGGER_TAG.TASK,
          `Task ${taskId} was not found in TaskStore at completion time — skipped completion feedback.`
        );
      }

      NotificationLogger.taskCompleted(taskId);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.TASK,
        "Failed to process task completion.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Task Deleted
   * ===========================================================================
   */
  async onTaskDeleted(taskId: string): Promise<void> {
    return this.withTaskLock(taskId, () =>
      this.onTaskDeletedInternal(taskId)
    );
  }

  private async onTaskDeletedInternal(taskId: string): Promise<void> {
    await this.cancelTaskInternal(taskId);

    NotificationLogger.taskDeleted(taskId);
  }

  /**
   * ===========================================================================
   * Cancel All Task Notifications
   * ===========================================================================
   */
  async cancelAll(): Promise<void> {
    try {
      const { tasks } = useTaskStore.getState();

      await Promise.all(tasks.map((task) => this.cancelTask(task.id)));

      NotificationLogger.info(
        LOGGER_TAG.TASK,
        "Cancelled all task notifications."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.TASK,
        "Failed to cancel all task notifications.",
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

export default new TaskNotificationService();