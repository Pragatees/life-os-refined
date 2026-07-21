/**
 * ============================================================================
 * LifeOS Note Notification Service
 * ============================================================================
 *
 * Daily Journal Reminder Service
 *
 * Schedules ONE reminder every day at 9:30 PM.
 * The notification message depends on whether today's journal exists.
 *
 * NO FUNCTIONAL BUG FOUND in this file — it was already correctly guarded
 * (typeof checks + try/catch) in the store layer that calls it. Added only
 * a syncNotes() in-flight guard for consistency with the other services,
 * since NotificationBootstrap and note-save flows could in theory overlap
 * on a slow cold start.
 * ============================================================================
 */

import { useNotesStore } from "../../store/notes";
import NotificationScheduler from "../core/NotificationScheduler";
import NotificationLogger from "../core/NotificationLogger";
import NotificationHelper from "../core/NotificationHelper";
import { NotificationType } from "../core/NotificationTypes";
import { LOGGER_TAG } from "../core/NotificationConstants";

class NoteNotificationService {
  private static instance: NoteNotificationService;
  private initialized = false;

  private readonly HOUR = 21;
  private readonly MINUTE = 30;

  /** Guards against overlapping syncNotes() calls racing each other. */
  private syncInFlight: Promise<void> | null = null;

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
  static getInstance(): NoteNotificationService {
    if (!NoteNotificationService.instance) {
      NoteNotificationService.instance = new NoteNotificationService();
    }
    return NoteNotificationService.instance;
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
    NotificationLogger.info(
      LOGGER_TAG.NOTE,
      "Note Notification Service initialized."
    );
  }

  /**
   * ===========================================================================
   * Synchronize
   * ===========================================================================
   *
   * Called by NotificationBootstrap.
   */
  async syncNotes(): Promise<void> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = this.doSyncNotes();

    try {
      await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async doSyncNotes(): Promise<void> {
    try {
      await this.scheduleTodayReminder();
      NotificationLogger.info(
        LOGGER_TAG.NOTE,
        "Daily journal reminder synchronized."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.NOTE,
        "Failed to synchronize daily journal reminder.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Schedule Today's Reminder
   * ===========================================================================
   */
  private async scheduleTodayReminder(): Promise<void> {
    const today = NotificationHelper.getToday();
    const trigger = new Date();

    trigger.setHours(this.HOUR, this.MINUTE, 0, 0);

    // If today's reminder time already passed, schedule tomorrow
    if (!NotificationHelper.canSchedule(trigger)) {
      trigger.setDate(trigger.getDate() + 1);
    }

    const hasNote = this.hasTodayNote(today);
    const title = hasNote
      ? "📝 Journal Completed"
      : "📝 Daily Journal Reminder";
    const body = hasNote
      ? "Great work! You've already written today's journal."
      : "Don't forget to write today's journal before your day ends.";

    await NotificationScheduler.schedule({
      id: NotificationHelper.getNoteNotificationId(today),
      trigger,
      content: {
        title,
        body,
        payload: {
          type: NotificationType.NOTE,
          noteDate: today,
        },
      },
    });

    NotificationLogger.info(
      LOGGER_TAG.NOTE,
      `Journal reminder scheduled for ${trigger.toLocaleString()}`
    );
  }

  /**
   * ===========================================================================
   * Does today's note exist?
   * ===========================================================================
   */
  private hasTodayNote(today: string): boolean {
    const { notes } = useNotesStore.getState();
    const note = notes[today];

    return !!(note && note.id && note.content && note.content.trim().length > 0);
  }

  /**
   * ===========================================================================
   * Note Created
   * ===========================================================================
   */
  async onNoteCreated(): Promise<void> {
    await this.refreshTodayReminder();
  }

  /**
   * ===========================================================================
   * Note Updated
   * ===========================================================================
   */
  async onNoteUpdated(): Promise<void> {
    await this.refreshTodayReminder();
  }

  /**
   * ===========================================================================
   * Note Deleted
   * ===========================================================================
   */
  async onNoteDeleted(): Promise<void> {
    await this.refreshTodayReminder();
  }

  /**
   * ===========================================================================
   * Refresh Today's Reminder
   * ===========================================================================
   */
  private async refreshTodayReminder(): Promise<void> {
    try {
      const today = NotificationHelper.getToday();

      await NotificationScheduler.cancelByPayload({
        type: NotificationType.NOTE,
        noteDate: today,
      });

      await this.scheduleTodayReminder();

      NotificationLogger.info(
        LOGGER_TAG.NOTE,
        "Today's journal reminder refreshed."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.NOTE,
        "Failed to refresh today's reminder.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Cancel Today's Reminder
   * ===========================================================================
   */
  async cancelTodayReminder(): Promise<void> {
    const today = NotificationHelper.getToday();

    await NotificationScheduler.cancelByPayload({
      type: NotificationType.NOTE,
      noteDate: today,
    });

    NotificationLogger.info(
      LOGGER_TAG.NOTE,
      "Today's journal reminder cancelled."
    );
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
}

// Export singleton instance
export default NoteNotificationService.getInstance();