/**
 * ============================================================================
 * LifeOS Note Notification Service
 * ============================================================================
 *
 * Daily Journal Reminder Service
 *
 * Schedules ONE reminder every day at 9:30 PM.
 * The notification message depends on whether today's journal exists.
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

/**
 * ===========================================================================
 * USAGE EXAMPLES
 * ===========================================================================
 *
 * // In NotificationBootstrap:
 * await NoteNotificationService.initialize();
 * await NoteNotificationService.syncNotes();
 *
 * // After creating/updating/deleting a note:
 * await NoteNotificationService.onNoteCreated();
 * await NoteNotificationService.onNoteUpdated();
 * await NoteNotificationService.onNoteDeleted();
 *
 * ===========================================================================
 * RUNTIME FLOW
 * ===========================================================================
 *
 * App Starts
 *      │
 *      ▼
 * NotificationBootstrap
 *      │
 *      ▼
 * NoteNotificationService.syncNotes()
 *      │
 *      ▼
 * Schedule ONE notification for today (9:30 PM)
 *      │
 *      ▼
 * User creates / edits / deletes today's journal
 *      │
 *      ▼
 * refreshTodayReminder()
 *      │
 *      ▼
 * Cancel previous reminder
 *      │
 *      ▼
 * Schedule new reminder
 *
 * ===========================================================================
 * NOTIFICATION MESSAGES
 * ===========================================================================
 *
 * If today's journal DOES NOT exist:
 * Title: 📝 Daily Journal Reminder
 * Body: Don't forget to write today's journal before your day ends.
 *
 * If today's journal ALREADY exists:
 * Title: 📝 Journal Completed
 * Body: Great work! You've already written today's journal.
 *
 * ===========================================================================
 * RESULT
 * ===========================================================================
 *
 * ✔ Only ONE journal reminder exists.
 * ✔ Duplicate reminders are prevented.
 * ✔ Reminder content updates whenever today's note changes.
 * ✔ Works with NotificationBootstrap.
 * ✔ Integrates with the existing NotificationScheduler.
 * ✔ Singleton pattern prevents multiple instances.
 *
 * ===========================================================================
 */