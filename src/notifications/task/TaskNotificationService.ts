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

    NotificationLogger.initialized(
      LOGGER_TAG.TASK
    );
  }

  /**
   * ===========================================================================
   * Sync Task Notifications
   * ===========================================================================
   */
  async syncTasks(): Promise<void> {
    try {
      const { tasks } = useTaskStore.getState();

      NotificationLogger.synchronizationStarted(
        LOGGER_TAG.TASK,
        tasks.length
      );

      for (const task of tasks) {
        if (task.completed) {
          await this.cancelTask(task.id);
          continue;
        }

        await this.rescheduleTask(task);
      }

      NotificationLogger.synchronizationCompleted(
        LOGGER_TAG.TASK
      );
    } catch (error) {
      NotificationLogger.synchronizationFailed(
        LOGGER_TAG.TASK,
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Task
   * ===========================================================================
   */
  async scheduleTask(task: Task): Promise<void> {
    try {
      if (task.completed) {
        NotificationLogger.skippedCompletedTask(
          task.taskName
        );
        return;
      }

      const taskDateTime =
        NotificationHelper.combineDateAndTime(
          task.taskDate,
          task.taskTime
        );

      if (!NotificationHelper.canSchedule(taskDateTime)) {
        NotificationLogger.skippedPastTask(
          task.taskName
        );
        return;
      }

      await this.scheduleReminder(task);

      await this.scheduleDueNotification(task);

      await this.scheduleOverdueNotification(task);

      NotificationLogger.taskScheduled(
        task.taskName
      );
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
   * Smart Reminder Logic
   *
   * >15 mins remaining  -> 15 min reminder
   * 6-14 mins remaining -> 5 min reminder
   * <=5 mins remaining  -> Immediate reminder
   */
  private async scheduleReminder(task: Task): Promise<void> {
    try {
      const taskDateTime =
        NotificationHelper.combineDateAndTime(
          task.taskDate,
          task.taskTime
        );

      const remainingMinutes =
        NotificationHelper.getRemainingMinutes(
          taskDateTime
        );

      let trigger: Date;
      let body: string;

      if (
        NotificationHelper.shouldSendImmediateReminder(
          taskDateTime
        )
      ) {
        trigger = new Date(Date.now() + 1000);

        body = `"${task.taskName}" starts soon.`;

        NotificationLogger.immediateReminder(
          task.taskName
        );
      } else if (
        remainingMinutes <=
        TASK_REMINDER.DEFAULT_BEFORE
      ) {
        trigger =
          NotificationHelper.getReminderTrigger(
            taskDateTime,
            TASK_REMINDER.SHORT_BEFORE
          );

        body = `"${task.taskName}" starts in ${TASK_REMINDER.SHORT_BEFORE} minutes.`;

        NotificationLogger.fiveMinuteReminder(
          task.taskName
        );
      } else {
        trigger =
          NotificationHelper.getReminderTrigger(
            taskDateTime,
            TASK_REMINDER.DEFAULT_BEFORE
          );

        body = `"${task.taskName}" starts in ${TASK_REMINDER.DEFAULT_BEFORE} minutes.`;

        NotificationLogger.fifteenMinuteReminder(
          task.taskName
        );
      }

      await NotificationScheduler.schedule({
        id: NotificationHelper.getTaskNotificationId(
          task.id + "_REMINDER"
        ),

        trigger,

        content: {
          title: "⏰ Task Reminder",

          body,

          payload: {
            type: NotificationType.TASK,

            taskId: task.id,

            notificationType:
              TaskNotificationType.REMINDER,
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
  private async scheduleDueNotification(
    task: Task
  ): Promise<void> {
    try {
      const trigger =
        NotificationHelper.combineDateAndTime(
          task.taskDate,
          task.taskTime
        );

      if (!NotificationHelper.canSchedule(trigger)) {
        return;
      }

      await NotificationScheduler.schedule({
        id: NotificationHelper.getTaskNotificationId(
          task.id + "_DUE"
        ),

        trigger,

        content: {
          title: "📌 Task Due",

          body: `"${task.taskName}" is scheduled now.`,

          payload: {
            type: NotificationType.TASK,

            taskId: task.id,

            notificationType:
              TaskNotificationType.DUE,
          },
        },
      });

      NotificationLogger.dueNotification(
        task.taskName
      );
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
  private async scheduleOverdueNotification(
    task: Task
  ): Promise<void> {
    try {
      const taskDateTime =
        NotificationHelper.combineDateAndTime(
          task.taskDate,
          task.taskTime
        );

      const trigger =
        NotificationHelper.getOverdueTrigger(
          taskDateTime,
          TASK_REMINDER.OVERDUE_AFTER
        );

      if (!NotificationHelper.canSchedule(trigger)) {
        return;
      }

      await NotificationScheduler.schedule({
        id: NotificationHelper.getTaskNotificationId(
          task.id + "_OVERDUE"
        ),

        trigger,

        content: {
          title: "⚠️ Task Overdue",

          body: `You haven't completed "${task.taskName}" yet.`,

          payload: {
            type: NotificationType.TASK,

            taskId: task.id,

            notificationType:
              TaskNotificationType.OVERDUE,
          },
        },
      });

      NotificationLogger.overdueNotification(
        task.taskName
      );
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
   * Cancel Task Notifications
   * ===========================================================================
   */
  async cancelTask(taskId: string): Promise<void> {
    try {
      await NotificationScheduler.cancelTaskNotifications(
        taskId
      );

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
    try {
      await this.cancelTask(task.id);

      await this.scheduleTask(task);

      NotificationLogger.taskRescheduled(
        task.taskName
      );
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
   */
  async onTaskCompleted(
    taskId: string
  ): Promise<void> {
    await this.cancelTask(taskId);

    NotificationLogger.taskCompleted(taskId);
  }

  /**
   * ===========================================================================
   * Task Deleted
   * ===========================================================================
   */
  async onTaskDeleted(
    taskId: string
  ): Promise<void> {
    await this.cancelTask(taskId);

    NotificationLogger.taskDeleted(taskId);
  }

  /**
   * ===========================================================================
   * Cancel All Task Notifications
   * ===========================================================================
   */
  async cancelAll(): Promise<void> {
    try {
      const { tasks } =
        useTaskStore.getState();

      await Promise.all(
        tasks.map((task) =>
          this.cancelTask(task.id)
        )
      );

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


