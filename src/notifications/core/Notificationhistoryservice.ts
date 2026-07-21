/**
 * ============================================================================
 * LifeOS Notification History Service
 * ============================================================================
 *
 * Persists a lightweight history of every notification LifeOS schedules, so
 * an "Upcoming" / "Missed" screen can be built. This is necessary because
 * expo-notifications has NO API for "notifications that fired in the past"
 * — getAllScheduledNotificationsAsync() only ever returns notifications
 * still pending in the future; once a trigger passes, Expo simply forgets
 * it. This file is the only source of truth for anything already past its
 * trigger time.
 *
 * WIRING REQUIRED — three one-line hooks need to be added to existing files
 * so entries actually get recorded/updated (see the chat message for exact
 * placement):
 *   1. NotificationScheduler.schedule()          -> recordScheduled()
 *   2. NotificationManager's "received" listener  -> markDelivered()
 *   3. NotificationResponseService.handle()        -> markOpened()
 *
 * Without step 1, getMissed() will always return an empty list — nothing
 * will ever have a "scheduled" baseline entry to later flip to "missed".
 * ============================================================================
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import NotificationLogger from "./NotificationLogger";
import NotificationScheduler from "./NotificationScheduler";
import { NotificationPayload, NotificationSchedule } from "./NotificationTypes";
import { LOGGER_TAG } from "./NotificationConstants";

const HISTORY_STORAGE_KEY = "notification_history_log";
const MAX_HISTORY_ENTRIES = 300;

// Don't flip something to "missed" the instant its trigger passes — give
// the OS a short window to actually deliver it first (release-build alarm
// delivery can lag by a few seconds even when healthy).
const MISSED_GRACE_PERIOD_MS = 60 * 1000;

const HISTORY_RETENTION_DAYS = 30;

export type NotificationHistoryStatus =
  | "scheduled"
  | "delivered"
  | "opened"
  | "missed"
  | "cancelled";

export interface NotificationHistoryEntry {
  /** Logical id from NotificationSchedule.id (stable, app-assigned). */
  id: string;
  /** Expo-generated identifier, once scheduling succeeds. */
  identifier?: string;
  title: string;
  body: string;
  /** ISO date string. */
  trigger: string;
  payload: NotificationPayload;
  status: NotificationHistoryStatus;
  scheduledAt: string;
  updatedAt: string;
}

class NotificationHistoryService {
  // ===========================================================================
  // Storage
  // ===========================================================================

  private async readAll(): Promise<NotificationHistoryEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to read notification history.",
        error
      );
      return [];
    }
  }

  private async writeAll(entries: NotificationHistoryEntry[]): Promise<void> {
    try {
      await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to persist notification history.",
        error
      );
    }
  }

  private isSamePayload(
    a: NotificationPayload,
    b: NotificationPayload
  ): boolean {
    return (
      a.type === b.type &&
      a.taskId === b.taskId &&
      a.goalId === b.goalId &&
      a.noteDate === b.noteDate &&
      a.reviewType === b.reviewType &&
      a.routineType === b.routineType &&
      a.notificationType === b.notificationType
    );
  }

  // ===========================================================================
  // Recording (call sites: see file header)
  // ===========================================================================

  /**
   * Call after NotificationScheduler successfully schedules a notification.
   */
  async recordScheduled(
    schedule: NotificationSchedule,
    identifier: string
  ): Promise<void> {
    try {
      const entries = await this.readAll();
      const now = new Date().toISOString();

      // Remove any prior entry for the same logical payload (this is a
      // reschedule) so history doesn't accumulate duplicate stale rows for
      // the same task/goal/routine slot.
      const filtered = entries.filter(
        (entry) => !this.isSamePayload(entry.payload, schedule.content.payload)
      );

      const entry: NotificationHistoryEntry = {
        id: schedule.id,
        identifier,
        title: schedule.content.title,
        body: schedule.content.body,
        trigger: schedule.trigger.toISOString(),
        payload: schedule.content.payload,
        status: "scheduled",
        scheduledAt: now,
        updatedAt: now,
      };

      const updated = [entry, ...filtered].slice(0, MAX_HISTORY_ENTRIES);
      await this.writeAll(updated);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to record scheduled notification history.",
        error
      );
    }
  }

  /**
   * Call when a notification is explicitly cancelled (task deleted, goal
   * completed, etc.) so it never gets misreported as "missed" later.
   * Optional — safe to skip wiring this one; worst case a cancelled item
   * briefly shows as missed until the next prune cycle.
   */
  async recordCancelled(payload: NotificationPayload): Promise<void> {
    try {
      const entries = await this.readAll();
      const now = new Date().toISOString();

      const updated = entries.map((entry) =>
        this.isSamePayload(entry.payload, payload) && entry.status === "scheduled"
          ? { ...entry, status: "cancelled" as const, updatedAt: now }
          : entry
      );

      await this.writeAll(updated);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to record cancelled notification history.",
        error
      );
    }
  }

  /** Call from the foreground "received" listener (NotificationManager). */
  async markDelivered(
    payload: NotificationPayload | undefined | null
  ): Promise<void> {
    if (!payload) return;
    await this.updateStatus(payload, "delivered");
  }

  /** Call from NotificationResponseService.handle() (tap listener). */
  async markOpened(
    payload: NotificationPayload | undefined | null
  ): Promise<void> {
    if (!payload) return;
    await this.updateStatus(payload, "opened");
  }

  private async updateStatus(
    payload: NotificationPayload,
    status: NotificationHistoryStatus
  ): Promise<void> {
    try {
      const entries = await this.readAll();
      const now = new Date().toISOString();

      const updated = entries.map((entry) =>
        this.isSamePayload(entry.payload, payload)
          ? { ...entry, status, updatedAt: now }
          : entry
      );

      await this.writeAll(updated);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        `Failed to update notification history status to "${status}".`,
        error
      );
    }
  }

  // ===========================================================================
  // Reading
  // ===========================================================================

  /**
   * Walks history and flips any entry still "scheduled" whose trigger time
   * has passed (plus a small grace period) to "missed". Call this whenever
   * the history screen is opened / focused — it depends on wall-clock time
   * having moved on, so there's no reliable background hook for it.
   */
  async reconcileMissed(): Promise<void> {
    try {
      const entries = await this.readAll();
      const now = Date.now();
      let changed = false;

      const updated = entries.map((entry) => {
        if (entry.status !== "scheduled") return entry;

        const triggerMs = new Date(entry.trigger).getTime();
        if (now - triggerMs > MISSED_GRACE_PERIOD_MS) {
          changed = true;
          return {
            ...entry,
            status: "missed" as const,
            updatedAt: new Date().toISOString(),
          };
        }
        return entry;
      });

      // Prune old resolved entries so this log doesn't grow forever.
      const cutoff = now - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const pruned = updated.filter((entry) => {
        if (entry.status === "scheduled") return true;
        const scheduledMs = new Date(entry.scheduledAt).getTime();
        const keep = scheduledMs >= cutoff;
        if (!keep) changed = true;
        return keep;
      });

      if (changed) {
        await this.writeAll(pruned);
      }
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.SCHEDULER,
        "Failed to reconcile missed notifications.",
        error
      );
    }
  }

  /**
   * Live "upcoming" list — sourced directly from Expo's pending list (the
   * real source of truth for anything not yet fired), not from our own
   * history, so it can never drift from what's actually scheduled
   * on-device.
   */
  async getUpcoming(): Promise<NotificationHistoryEntry[]> {
    const pending = await NotificationScheduler.getPending();

    return pending
      .map((notification) => {
        // Shape of `.trigger` on the resolved NotificationRequest varies
        // slightly by expo-notifications version/platform for DATE
        // triggers — defensively check the common field names.
        const triggerValue =
          (notification.trigger as any)?.date ??
          (notification.trigger as any)?.value ??
          null;

        return {
          id: notification.identifier,
          identifier: notification.identifier,
          title: notification.content.title ?? "",
          body: notification.content.body ?? "",
          trigger: triggerValue
            ? new Date(triggerValue).toISOString()
            : new Date().toISOString(),
          payload: (notification.content.data ?? {}) as NotificationPayload,
          status: "scheduled" as const,
          scheduledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      })
      .sort(
        (a, b) => new Date(a.trigger).getTime() - new Date(b.trigger).getTime()
      );
  }

  /**
   * Persisted "missed" list. Always reconciles first so it reflects the
   * latest wall-clock time.
   */
  async getMissed(): Promise<NotificationHistoryEntry[]> {
    await this.reconcileMissed();

    const entries = await this.readAll();

    return entries
      .filter((entry) => entry.status === "missed")
      .sort(
        (a, b) => new Date(b.trigger).getTime() - new Date(a.trigger).getTime()
      );
  }

  async clearHistory(): Promise<void> {
    await this.writeAll([]);
  }
}

export default new NotificationHistoryService();