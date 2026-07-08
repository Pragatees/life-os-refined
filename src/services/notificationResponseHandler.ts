// src/services/notificationResponseHandler.ts
// Requirement 2: registers Notifications.addNotificationResponseReceivedListener
// and dispatches based on which action button was tapped.
//
// This module deliberately doesn't know about your task store — it can't,
// without creating a circular import back into your app's state layer.
// Instead it exposes `setTaskActionHandlers`, which you call once (e.g. in
// _layout.tsx) to wire these events into whatever actually mutates tasks.

import * as Notifications from "expo-notifications";
import {
  NOTIFICATION_ACTIONS,
  SNOOZE_MINUTES_BY_ACTION,
  isSnoozeAction,
} from "./notificationActions";
import { logNotificationEvent } from "./notificationHistory";
import { isNativePlatform } from "./reminderScheduler";

export interface TaskActionHandlers {
  /** Called when the user taps "Mark Complete" on any task notification. */
  onMarkComplete?: (taskId: string) => void | Promise<void>;
  /** Called after a snooze notification has been (re)scheduled. */
  onSnooze?: (taskId: string, minutes: number) => void | Promise<void>;
  /** Called when the user taps "Move to Tomorrow" on a missed-recovery notification. */
  onMoveToTomorrow?: (taskId: string) => void | Promise<void>;
  /** Called on "Open App" or a plain tap on the notification body. */
  onOpenApp?: (taskId: string) => void | Promise<void>;
}

let handlers: TaskActionHandlers = {};

/** Call once, e.g. from _layout.tsx, to wire notification actions to your task store. */
export const setTaskActionHandlers = (next: TaskActionHandlers): void => {
  handlers = next;
};

type NotificationData = { taskId?: string; type?: string };

const rescheduleAsSnooze = async (
  original: Notifications.Notification,
  minutes: number
): Promise<void> => {
  const content = original.request.content;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: content.title ?? "⏰ Reminder",
      body: content.body ?? "",
      sound: true,
      categoryIdentifier: content.categoryIdentifier ?? undefined,
      data: content.data,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + minutes * 60000),
    },
  });
};

/**
 * Registers the response listener. Handles:
 *  - MARK_COMPLETE       -> onMarkComplete(taskId)
 *  - SNOOZE_5/10/30      -> reschedules the same content N minutes later, onSnooze(taskId, minutes)
 *  - MOVE_TO_TOMORROW    -> onMoveToTomorrow(taskId)
 *  - OPEN_APP / body tap -> onOpenApp(taskId)
 *  - dismiss (Android)   -> logged as "dismissed"
 * Every branch also writes to notification history (requirement 7).
 */
export const registerNotificationResponseListener = (): (() => void) => {
  if (!isNativePlatform()) return () => {};

  const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
    const actionId = response.actionIdentifier;
    const data = response.notification.request.content.data as NotificationData | undefined;
    const taskId = data?.taskId;
    const type = data?.type ?? "unknown";
    if (!taskId) return;

    const content = response.notification.request.content;
    const taskName = content.body?.match(/"([^"]+)"/)?.[1] ?? content.title ?? "";

    try {
      if (actionId === NOTIFICATION_ACTIONS.MARK_COMPLETE) {
        await logNotificationEvent(taskId, taskName, type, "completed_from_notification");
        await handlers.onMarkComplete?.(taskId);
        return;
      }

      if (isSnoozeAction(actionId)) {
        const minutes = SNOOZE_MINUTES_BY_ACTION[actionId as keyof typeof SNOOZE_MINUTES_BY_ACTION] ?? 5;
        await rescheduleAsSnooze(response.notification, minutes);
        await logNotificationEvent(taskId, taskName, type, "snoozed", { minutes });
        await handlers.onSnooze?.(taskId, minutes);
        return;
      }

      if (actionId === NOTIFICATION_ACTIONS.MOVE_TO_TOMORROW) {
        await logNotificationEvent(taskId, taskName, type, "opened", { action: "move_to_tomorrow" });
        await handlers.onMoveToTomorrow?.(taskId);
        return;
      }

      if (
        actionId === NOTIFICATION_ACTIONS.OPEN_APP ||
        actionId === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        await logNotificationEvent(taskId, taskName, type, "opened");
        await handlers.onOpenApp?.(taskId);
        return;
      }

      // Android-only: fires when the user explicitly swipes/dismisses.
      // iOS doesn't emit a distinct action identifier for this, so it will
      // simply never hit this branch there.
      await logNotificationEvent(taskId, taskName, type, "dismissed");
    } catch (error) {
      // Never let a malformed response crash the listener for future events.
      // eslint-disable-next-line no-console
      console.warn("notificationResponseHandler: failed to process response", error);
    }
  });

  return () => subscription.remove();
};