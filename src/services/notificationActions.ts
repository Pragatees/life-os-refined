// src/services/notificationActions.ts
// Requirement 1: action-button identifiers, kept as a standalone module so
// categories and the response handler both import the same constants
// instead of re-typing string literals.

export const NOTIFICATION_ACTIONS = {
  MARK_COMPLETE: "MARK_COMPLETE",
  SNOOZE_5: "SNOOZE_5",
  SNOOZE_10: "SNOOZE_10",
  SNOOZE_30: "SNOOZE_30",
  OPEN_APP: "OPEN_APP",
  MOVE_TO_TOMORROW: "MOVE_TO_TOMORROW",
} as const;

export type NotificationActionId =
  (typeof NOTIFICATION_ACTIONS)[keyof typeof NOTIFICATION_ACTIONS];

/** Minutes to snooze for, keyed by action id. Only snooze actions appear here. */
export const SNOOZE_MINUTES_BY_ACTION: Partial<Record<NotificationActionId, number>> = {
  [NOTIFICATION_ACTIONS.SNOOZE_5]: 5,
  [NOTIFICATION_ACTIONS.SNOOZE_10]: 10,
  [NOTIFICATION_ACTIONS.SNOOZE_30]: 30,
};

export const isSnoozeAction = (actionId: string): boolean =>
  actionId in SNOOZE_MINUTES_BY_ACTION;