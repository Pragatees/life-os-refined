// src/services/notificationHistory.ts
// Requirement 7: append-only history log of everything that happens to a
// task notification (scheduled, delivered, opened, completed from
// notification, snoozed, dismissed, missed). Stored as a single capped
// JSON array so reads are cheap; writes are append + trim.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { notificationLogger as log } from "./notificationLogger";
import { NotificationHistoryEntry, NotificationHistoryStatus } from "./notificationTypes";

const KEY_HISTORY = "notif_history_log";
// Keep the log bounded — this is a rolling window of recent activity, not
// a permanent audit trail. Raise this if you need a longer history.
const MAX_HISTORY_ENTRIES = 500;

const generateHistoryId = (): string =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const logNotificationEvent = async (
  taskId: string,
  taskName: string,
  type: string,
  status: NotificationHistoryStatus,
  meta?: Record<string, unknown>
): Promise<void> => {
  try {
    const entry: NotificationHistoryEntry = {
      id: generateHistoryId(),
      taskId,
      taskName,
      type,
      status,
      timestamp: new Date().toISOString(),
      meta,
    };

    const raw = await AsyncStorage.getItem(KEY_HISTORY);
    const list: NotificationHistoryEntry[] = raw ? JSON.parse(raw) : [];
    list.push(entry);

    const trimmed =
      list.length > MAX_HISTORY_ENTRIES ? list.slice(list.length - MAX_HISTORY_ENTRIES) : list;

    await AsyncStorage.setItem(KEY_HISTORY, JSON.stringify(trimmed));
  } catch (error) {
    // History logging is best-effort — never let it break scheduling.
    log.warn(`Failed to log notification history (${taskId}/${type}/${status})`, error);
  }
};

export const getNotificationHistory = async (
  taskId?: string
): Promise<NotificationHistoryEntry[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY_HISTORY);
    const list: NotificationHistoryEntry[] = raw ? JSON.parse(raw) : [];
    return taskId ? list.filter((e) => e.taskId === taskId) : list;
  } catch (error) {
    log.warn("Failed to read notification history", error);
    return [];
  }
};

export const clearNotificationHistory = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(KEY_HISTORY);
  } catch {
    // Non-critical.
  }
};