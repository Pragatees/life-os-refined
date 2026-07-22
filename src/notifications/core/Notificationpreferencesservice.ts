/**
 * ============================================================================
 * LifeOS Notification Preferences Service
 * ============================================================================
 *
 * Lets the user turn individual notification categories ON/OFF (the
 * "open/close" toggle). This is the single source of truth for whether a
 * category is allowed to notify — NotificationScheduler.schedule() checks
 * it before every native scheduleNotificationAsync() call, so no
 * individual domain service (Task/Goal/Note/AI/Account/Routine) needs to
 * know preferences exist. Disabling a category here is enough to silence
 * it everywhere, immediately.
 *
 * NOTE ON THE IMPORT DIRECTION: this file imports NotificationScheduler
 * (to cancel already-pending notifications the instant a category is
 * turned off). NotificationScheduler, in turn, needs to check this file
 * before scheduling. To avoid a circular import between the two,
 * NotificationScheduler loads this file with a dynamic `import()` inside
 * schedule() rather than a static top-level import — see that file's
 * schedule() method.
 * ============================================================================
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import NotificationLogger from "./NotificationLogger";
import NotificationScheduler from "./NotificationScheduler";
import { NotificationType } from "./NotificationTypes";
import { LOGGER_TAG } from "./NotificationConstants";

const PREFERENCES_STORAGE_KEY = "notification_preferences";

export type NotificationPreferencesMap = Record<NotificationType, boolean>;

const DEFAULT_PREFERENCES: NotificationPreferencesMap = {
  [NotificationType.TASK]: true,
  [NotificationType.GOAL]: true,
  [NotificationType.NOTE]: true,
  [NotificationType.AI_REVIEW]: true,
  [NotificationType.ACCOUNT]: true,
  [NotificationType.ROUTINE]: true,
  [NotificationType.SYSTEM]: true,
};

type PreferenceListener = (prefs: NotificationPreferencesMap) => void;

class NotificationPreferencesService {
  private cache: NotificationPreferencesMap | null = null;
  private loadPromise: Promise<NotificationPreferencesMap> | null = null;
  private listeners: Set<PreferenceListener> = new Set();

  // ===========================================================================
  // Load / Persist
  // ===========================================================================

  private async load(): Promise<NotificationPreferencesMap> {
    if (this.cache) {
      return this.cache;
    }

    // Guard against concurrent first-loads (e.g. the settings screen and
    // NotificationScheduler both asking at once on cold start).
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      let result: NotificationPreferencesMap;
      try {
        const raw = await AsyncStorage.getItem(PREFERENCES_STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : {};
        result = { ...DEFAULT_PREFERENCES, ...stored };
        this.cache = result;
      } catch (error) {
        NotificationLogger.error(
          LOGGER_TAG.MANAGER,
          "Failed to load notification preferences — defaulting to all enabled.",
          error
        );
        result = { ...DEFAULT_PREFERENCES };
        this.cache = result;
      }
      return result;
    })();

    const result = await this.loadPromise;
    this.loadPromise = null;
    return result;
  }

  private async persist(prefs: NotificationPreferencesMap): Promise<void> {
    this.cache = prefs;

    try {
      await AsyncStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify(prefs)
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.MANAGER,
        "Failed to persist notification preferences.",
        error
      );
    }

    this.listeners.forEach((listener) => listener(prefs));
  }

  // ===========================================================================
  // Reading
  // ===========================================================================

  /** Returns a copy of all category preferences (for rendering a settings screen). */
  async getAll(): Promise<NotificationPreferencesMap> {
    return { ...(await this.load()) };
  }

  /** Checked by NotificationScheduler.schedule() before every native call. */
  async isEnabled(type: NotificationType): Promise<boolean> {
    const prefs = await this.load();
    return prefs[type] ?? true;
  }

  // ===========================================================================
  // Writing
  // ===========================================================================

  /**
   * Turns a category ON/OFF.
   *
   * Turning OFF immediately cancels every currently-pending notification
   * of that type via NotificationScheduler.cancelByType() — so the toggle
   * actually "closes" existing scheduled notifications right away, not
   * just future ones.
   *
   * Turning ON does NOT retroactively reschedule anything by itself (this
   * service has no knowledge of tasks/goals/etc.) — call the relevant
   * domain service's sync method, or NotificationBootstrap.synchronize(),
   * afterward if you want it to immediately repopulate rather than
   * waiting for the next natural sync.
   */
  async setEnabled(type: NotificationType, enabled: boolean): Promise<void> {
    const prefs = await this.load();

    if (prefs[type] === enabled) {
      // No-op — avoid an unnecessary write + cancelByType scan.
      return;
    }

    const updated = { ...prefs, [type]: enabled };
    await this.persist(updated);

    if (!enabled) {
      await NotificationScheduler.cancelByType(type);
    }

    NotificationLogger.info(
      LOGGER_TAG.MANAGER,
      `Notification category "${type}" turned ${enabled ? "ON" : "OFF"}.`
    );
  }

  async toggle(type: NotificationType): Promise<boolean> {
    const current = await this.isEnabled(type);
    const next = !current;
    await this.setEnabled(type, next);
    return next;
  }

  /** Resets everything back to "all enabled" (e.g. for a "Reset" button). */
  async resetToDefaults(): Promise<void> {
    await this.persist({ ...DEFAULT_PREFERENCES });
  }

  // ===========================================================================
  // Subscription (so a settings screen re-renders on change from elsewhere)
  // ===========================================================================

  subscribe(listener: PreferenceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export default new NotificationPreferencesService();