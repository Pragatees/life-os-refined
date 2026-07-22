/**
 * ============================================================================
 * LifeOS Task Notification Service
 * ============================================================================
 *
 * FIX 1 (carried over): scheduleReminder() delegates smart-reminder
 * branching entirely to NotificationHelper.getReminderOffset()/
 * getSmartReminderTrigger() — single source of truth.
 *
 * FIX 2 (carried over): The "immediate" trigger buffer comes from
 * TASK_REMINDER.IMMEDIATE_BUFFER_SECONDS (5s) via
 * NotificationHelper.getSmartReminderTrigger(), instead of a bare
 * `Date.now() + 1000` that could expire before scheduleNotificationAsync()
 * ran under JS-thread contention.
 *
 * FIX 3 (carried over): `scheduleTask()` gates all three sub-notifications
 * (Reminder, Due, Overdue) against the Overdue trigger — the furthest-future
 * of the three — instead of gating everything on `taskDateTime` alone, which
 * incorrectly skipped the Overdue notification for tasks whose due time had
 * passed but whose overdue window was still ahead. Each sub-scheduler still
 * independently checks its own trigger.
 *
 * FIX 4 (carried over): All task-mutating entry points (`scheduleTask`,
 * `cancelTask`, `rescheduleTask`, `onTaskCompleted`, `onTaskDeleted`)
 * serialize through a per-taskId lock (`withTaskLock`), so operations on the
 * SAME task always run one at a time in call order, while operations on
 * DIFFERENT tasks run fully in parallel. `syncTasks()`'s per-task loop goes
 * through these same lock-guarded methods.
 *
 * FIX 5 (this revision — stops the duplicate/perpetual-reminder bug):
 * `doSyncTasks()` used to unconditionally cancel + reschedule EVERY
 * incomplete task's notifications on EVERY sync pass. `syncTasks()` runs
 * after every `fetchTasks(true)` call in the store — i.e. after literally
 * ANY task anywhere is added, edited, completed, or deleted. That meant a
 * task whose data had NOT changed at all still got its Reminder/Due/Overdue
 * notifications cancelled and recreated from scratch every single time some
 * *other* task changed. For a "smart" Reminder computed as "isImmediate"
 * (task due within a few minutes), the trigger time is `now + buffer`
 * recomputed at schedule time — so each unrelated sync pass pushed that
 * reminder's actual fire time further into the future, and if syncs kept
 * happening, the reminder could be cancelled just before it fired and
 * replaced with a new later one indefinitely, so the user never actually
 * got notified. The logs showed exactly this: the same task's Reminder
 * notification getting a new random identifier and a new (later) trigger
 * three times in under two minutes, none of which had anything to do with
 * that task changing.
 *
 * The fix: a per-task signature cache (`lastSyncedSignature`) capturing only
 * the fields that actually affect scheduling (`completed`, `taskDate`,
 * `taskTime`, `priority`, `repeatType`). `doSyncTasks()` now skips any task
 * whose signature is unchanged since the last sync — it is left alone,
 * notifications untouched. Every direct mutation path (`scheduleTask`,
 * `onTaskCompleted`, `onTaskDeleted`, `cancelTask`) keeps this cache in sync
 * too, so an immediately-following `syncTasks()` pass (triggered by the same
 * store update) sees a matching signature and does nothing redundant.
 *
 * FIX 6 (this revision — delete safety net): if a task disappears from the
 * store between sync passes — whether via `deleteTask`'s normal
 * `cancelTask()` call, or via ANY other code path that removes a task
 * without explicitly notifying this service (e.g. a UI-level delete
 * implementation that talks to the API directly and forgets to call into
 * notifications) — `doSyncTasks()` now diffs the tracked task ids against
 * the current store snapshot and force-cancels notifications for any id
 * that vanished. This does not replace calling `cancelTask`/`onTaskDeleted`
 * from the actual delete path (see note in EditTask.tsx), but it guarantees
 * that stale notifications for deleted tasks cannot survive past the next
 * sync even if a caller forgets to clean up after itself.
 *
 * FEATURE 1 (carried over): completion feedback. `onTaskCompleted()` looks
 * the task up in TaskStore and fires a short feedback notification a few
 * seconds later — a congrats message if completed on/before the due time,
 * or an encouraging nudge if completed late.
 *
 * FEATURE 2 (carried over): `onTaskCompleted()` cancels the task's
 * Reminder/Due/Overdue notifications FIRST, then schedules the completion
 * feedback — so a completed task never has a stray Due/Overdue notification
 * fire later, and the feedback notification isn't immediately cancelled by
 * that same cleanup step.
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
 *
 * ── REQUIRED companion change for the delete bug ─────────────────────────
 * components/EditTask.tsx currently deletes tasks via a LOCAL
 * `deleteTaskRequest()` helper that calls the API directly and never calls
 * into this service at all — it bypasses `useTaskStore.deleteTask`, which is
 * the action that actually calls `TaskNotificationService.cancelTask`. Swap
 * `handleDelete` in EditTask.tsx to call the store's `deleteTask(task.id)`
 * action instead of the local `deleteTaskRequest()` helper. FIX 6 above adds
 * a safety net so stale notifications get cleaned up on the next sync
 * either way, but the store action is the correct, immediate fix.
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

const COMPLETED_ON_TIME = "COMPLETED_ON_TIME" as TaskNotificationType;
const COMPLETED_LATE = "COMPLETED_LATE" as TaskNotificationType;

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

  /**
   * FIX 5: signature of the last-synced schedule-relevant fields for each
   * task, keyed by taskId. Used by doSyncTasks() to skip tasks that
   * haven't actually changed, so an unrelated task mutation elsewhere in
   * the app can no longer cancel/reschedule THIS task's notifications.
   */
  private lastSyncedSignature: Map<string, string> = new Map();

  private computeTaskSignature(task: Task): string {
    return [
      task.completed ? "1" : "0",
      task.taskDate,
      task.taskTime,
      task.priority,
      task.repeatType ?? "NEVER",
    ].join("|");
  }

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

      const currentIds = new Set<string>();

      for (const task of tasks) {
        currentIds.add(task.id);

        const signature = this.computeTaskSignature(task);
        const previousSignature = this.lastSyncedSignature.get(task.id);

        if (previousSignature === signature) {
          // Nothing that affects this task's notifications changed since
          // the last sync (completion state, date, time, priority, or
          // repeat type) — leave its notifications exactly as they are.
          //
          // Without this check, syncTasks() re-cancelled and
          // re-scheduled EVERY incomplete task's notifications on EVERY
          // sync pass, and a sync pass runs after literally any task
          // anywhere is added/edited/completed/deleted. A Reminder
          // notification computed as "isImmediate" recomputes its trigger
          // as `now + buffer` at schedule time, so it kept getting pushed
          // further into the future by unrelated mutations — potentially
          // forever, meaning it could be cancelled moments before firing
          // and never actually reach the user.
          continue;
        }

        if (task.completed) {
          await this.cancelTask(task.id);
        } else {
          await this.rescheduleTask(task);
        }

        this.lastSyncedSignature.set(task.id, signature);
      }

      // FIX 6: safety net for deletions. If a task we were previously
      // tracking has disappeared from the store entirely, make sure its
      // notifications are actually cancelled — even if whatever deleted it
      // forgot to call cancelTask()/onTaskDeleted() itself.
      for (const trackedId of Array.from(this.lastSyncedSignature.keys())) {
        if (!currentIds.has(trackedId)) {
          await this.cancelTask(trackedId);
          this.lastSyncedSignature.delete(trackedId);
        }
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
        this.lastSyncedSignature.set(task.id, this.computeTaskSignature(task));
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
      // on taskDateTime alone incorrectly skipped the Overdue notification
      // for tasks whose due time had passed but whose overdue window was
      // still ahead.
      if (!NotificationHelper.canSchedule(overdueTrigger)) {
        NotificationLogger.skippedPastTask(task.taskName);
        this.lastSyncedSignature.set(task.id, this.computeTaskSignature(task));
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

      // FIX 5: record what we just scheduled against, so an immediately
      // following syncTasks() pass (e.g. triggered by the same store
      // update that led here) sees a matching signature and skips this
      // task instead of redundantly cancelling and rescheduling it.
      this.lastSyncedSignature.set(task.id, this.computeTaskSignature(task));
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
              ? TaskNotificationType.COMPLETED_ON_TIME
              : TaskNotificationType.COMPLETED_LATE,
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

      // Any call to cancelTask() means we no longer want to remember a
      // "last synced" schedule for this task — the caller above (sync
      // loop, onTaskCompleted, onTaskDeleted, etc.) is responsible for
      // re-adding an entry afterward if the task still exists in some
      // other state (e.g. now marked completed).
      this.lastSyncedSignature.delete(taskId);

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

        // Record the completed signature so a following syncTasks() pass
        // (also triggered by this same completion, via fetchTasks(true))
        // recognizes nothing further changed and doesn't redundantly
        // cancel this task's (already-cancelled) notifications again.
        this.lastSyncedSignature.set(taskId, this.computeTaskSignature(task));
      } else {
        this.lastSyncedSignature.delete(taskId);
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
    this.lastSyncedSignature.delete(taskId);

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

      // Store is about to be cleared on logout — nothing left to track.
      this.lastSyncedSignature.clear();

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