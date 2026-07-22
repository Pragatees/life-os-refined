/**
 * ============================================================================
 * LifeOS Routine Notification Service
 * ============================================================================
 *
 * Schedules the four fixed daily routine notifications:
 *
 *   1. Morning Motivation   - 07:00 AM, one message
 *   2. Engagement Reminder  - 09:00 / 11:00 / 13:00 / 15:00 / 17:00
 *   3. Evening Planning     - 06:00 PM
 *   4. Daily Summary        - 09:45 PM
 *
 * FIX 1 (critical, fixed in NotificationBootstrap.ts, not here): this
 * service was never initialized or synced by NotificationBootstrap, so
 * none of its four notifications were ever scheduled unless some other
 * screen happened to call syncRoutines()/refresh() directly. Bootstrap now
 * owns this.
 *
 * FIX 2: added a syncInFlight guard, consistent with the other services.
 *
 * FIX 3 (revised): buildEngagementContent()/buildDailySummaryBody() used
 * to read useTaskStore.getState().tasks at schedule time and bake the
 * result into the notification body for a trigger up to 24h in the
 * future. Two problems with that:
 *
 *   a) It ignored useProgressStore entirely, so the notification body had
 *      nothing to do with the app's actual "Daily Progress" numbers shown
 *      on screen.
 *
 *   b) Refreshing was previously wired as: task changes -> call
 *      useProgressStore.getState().invalidate() -> call
 *      RoutineNotificationService.scheduleRefresh(). But invalidate() does
 *      an ASYNC network refetch. scheduleRefresh() would run (or be
 *      called) before that refetch resolved, so the rescheduled
 *      notification would bake in stale numbers — hence the
 *      "delay / doesn't update" symptom.
 *
 * FIX 3 (revised) now reads content ONLY from `useProgressStore.getState()
 * .dailyProgress`, and — critically — this service SUBSCRIBES directly to
 * dailyProgress changes via `subscribeToDailyProgress()` (see
 * store/progress.ts). That means:
 *
 *   - Whatever causes dailyProgress to change (invalidate(), a direct
 *     fetchDailyProgress(), onLogin(), resetForNewDayIfNeeded(),
 *     refreshRange() touching today, etc.) automatically triggers
 *     scheduleRefresh() AFTER the real numbers have landed, not before.
 *   - task.ts no longer needs to explicitly call
 *     RoutineNotificationService.scheduleRefresh() at all. It's fine if it
 *     still does (scheduleRefresh() is idempotent/guarded), but it's no
 *     longer required — the subscription below is the source of truth.
 *
 * scheduleRefresh() cancels and reschedules ONLY the task-dependent
 * notifications (Engagement Reminders + Daily Summary), leaving Morning
 * Motivation and Evening Planning triggers untouched since they don't
 * depend on task/progress state.
 *
 * FIX 4: Morning Motivation now combines a random built-in motivational
 * quote with a short, personalized line derived from *yesterday's* Daily
 * Summary (completed/pending counts), read back from AsyncStorage. Each
 * time the Daily Summary is (re)built, a snapshot of that day's counts
 * (from useProgressStore's dailyProgress) is persisted; the next Morning
 * Motivation reads it to nudge the user to beat yesterday's numbers. If no
 * snapshot exists yet (fresh install / first day), it falls back to just
 * the quote.
 *
 * FIX 5 (this revision): buildEngagementContent() previously only knew
 * three states (no tasks / "still pending, generic message" / all done),
 * and none of the copy referenced the actual numbers. It now derives FOUR
 * distinct states directly from dailyProgress, each with its own intent:
 *
 *   1. totalTasks === 0
 *        -> no tasks were ever created for today. Copy nudges the user to
 *           create tasks and make the day productive.
 *   2. totalTasks > 0 && completedTasks === 0
 *        -> tasks exist but nothing has been started. Copy nudges the
 *           user to knock out the first one, and names how many are
 *           waiting.
 *   3. 0 < completedTasks < totalTasks
 *        -> real, in-progress state. Copy reports completed/pending
 *           counts and encourages finishing up.
 *   4. completedTasks >= totalTasks (>= instead of === defensively, in
 *      case pendingTasks/completedTasks drift from a task being deleted
 *      after completion, etc.)
 *        -> everything is done. Copy congratulates AND explicitly
 *           suggests adding another task, rather than just praising
 *           completion and going quiet.
 *
 * Counts are injected into the copy via a tiny {token} template
 * substitution (formatTemplate()) so the message pools stay easy to
 * extend/localize without hand-writing string concatenation per state.
 * pendingTasks is clamped defensively (never negative, never inconsistent
 * with totalTasks - completedTasks) so a stale/partial store update can
 * never produce a nonsensical notification body.
 *
 * Task/progress data is read ONLY from `useProgressStore.getState()
 * .dailyProgress` (never fetched or mutated here). This service never
 * touches task scheduling, cancellation, or completion — that stays owned
 * entirely by TaskNotificationService.
 *
 * COPY REVISION (this pass): message pools and body templates only —
 * richer, more varied, more visual notification copy. No scheduling,
 * subscription, debounce, guard, or state-derivation logic was touched.
 * ============================================================================
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  useProgressStore,
  subscribeToDailyProgress,
  ProgressSummary,
} from ".././store/progress";

import NotificationHelper from "./core/NotificationHelper";
import NotificationLogger from "./core/NotificationLogger";
import NotificationScheduler from "./core/NotificationScheduler";

import {
  NotificationType,
  RoutineNotificationType,
} from "./core/NotificationTypes";

import {
  LOGGER_TAG,
  ROUTINE_SCHEDULE,
} from "./core/NotificationConstants";

// -----------------------------------------------------------------------------
// Message Pools
// -----------------------------------------------------------------------------

const MORNING_MOTIVATION_MESSAGES: readonly string[] = [
  "🌅 Rise and shine! A brand new day, zero mistakes in it yet.",
  "☕ Good morning! Let's turn today's to-do list into a done list.",
  "🚀 Small steps, repeated daily, launch big results. Let's go!",
  "🌱 Today is fresh soil — plant something worth growing.",
  "💪 Discipline beats motivation. Show up anyway, champion.",
  "✨ You don't have to be great to start, but you have to start to be great.",
  "🎯 Focus on progress, not perfection. One task at a time.",
  "🔥 Every task you finish today is a promise kept to yourself.",
  "🧭 The secret of getting ahead is simply getting started.",
  "🏔️ One task at a time — that's how mountains get climbed.",
  "🌤️ Make today so awesome that yesterday gets jealous.",
  "⚡ New day, new energy, same goal: get things done.",
  "📈 Consistency compounds. Show up today and let it add up.",
  "🌻 Bloom where you're planted — starting with your first task today.",
];

// State 1: no tasks exist yet today at all.
const ENGAGEMENT_NO_TASKS_MESSAGES: readonly string[] = [
  "📝 Your list is looking a little empty. Add a task or two and give today some direction!",
  "🗒️ Nothing planned yet — a blank page is just an invitation. What will you tackle today?",
  "✨ Today's canvas is wide open. Sketch out a task and let's get moving!",
  "🌤️ No tasks yet, no problem — a fresh list means a fresh start. Add one now!",
];

// State 2: tasks exist, but zero have been completed yet.
const ENGAGEMENT_ZERO_PROGRESS_TEMPLATES: readonly string[] = [
  "🚦 {total} task{totalPlural} on deck and ready to go — let's knock out the first one!",
  "⏳ Nothing completed yet today. {total} task{totalPlural} waiting — you've got this!",
  "🎬 Ready when you are — {total} task{totalPlural} on today's list. Time to make your move!",
  "🔋 Fully charged and {total} task{totalPlural} to go. Let's get that first win!",
];

// State 3: some completed, some still pending.
const ENGAGEMENT_PARTIAL_PROGRESS_TEMPLATES: readonly string[] = [
  "🚴 You're at {completed}/{total} — {pending} left. Keep the momentum going!",
  "📊 Nice progress: {completed} of {total} done, {pending} task{pendingPlural} to go.",
  "🔥 Making real headway — {pending} task{pendingPlural} still remaining today. Push through!",
  "🏁 Halfway (or better!) through your list — {completed}/{total} complete. Finish strong!",
];

// State 4: everything scheduled for today is complete.
const ENGAGEMENT_COMPLETED_TEMPLATES: readonly string[] = [
  "🎉 All {total} task{totalPlural} complete! Add another and keep the streak alive.",
  "🏆 You crushed all {total} task{totalPlural} today. Why stop now — add a bonus task?",
  "💯 100% done for today! Give yourself one more win and make it a great day.",
  "🌟 Clean sweep — {total}/{total} finished! Ride the momentum with one more task.",
];

const EVENING_PLANNING_MESSAGES: readonly string[] = [
  "🌆 Golden hour, great time to plan tomorrow. What's priority #1?",
  "🗓️ Prepare tomorrow's priorities tonight — future you will thank you.",
  "🌙 Take five minutes to review today and set tomorrow's goals.",
  "🧠 A little planning tonight saves a lot of scrambling tomorrow morning.",
  "🕯️ Wind down and map out tomorrow — clarity tonight, momentum tomorrow.",
];

const DASHBOARD_SCREEN = "Dashboard";

// AsyncStorage key used to remember the last completed day's task counts,
// so the next Morning Motivation notification can reference them.
const LAST_SUMMARY_STORAGE_KEY = "routineNotifications:lastDailySummary";

// How long to wait after a dailyProgress change before actually
// re-scheduling notifications. Guards against bursts of rapid-fire
// updates (e.g. checking off several tasks in a row, or a
// fetchAllProgress() cycle) causing repeated cancel+reschedule churn.
const PROGRESS_CHANGE_DEBOUNCE_MS = 800;

interface DailySummarySnapshot {
  date: string; // Date.toDateString() of the day this snapshot belongs to
  completed: number;
  total: number;
}

interface EngagementCounts {
  total: number;
  completed: number;
  pending: number;
}

class RoutineNotificationService {
  private static instance: RoutineNotificationService;
  private initialized = false;

  /** Guards against overlapping syncRoutines() calls racing each other. */
  private syncInFlight: Promise<void> | null = null;

  /** Guards against overlapping scheduleRefresh() calls racing each other. */
  private refreshInFlight: Promise<void> | null = null;

  /** Unsubscribe handle for the dailyProgress subscription. */
  private unsubscribeProgress: (() => void) | null = null;

  /** Debounce timer for progress-driven refreshes. */
  private progressChangeDebounceTimer: ReturnType<typeof setTimeout> | null =
    null;

  private constructor() {}

  static getInstance(): RoutineNotificationService {
    if (!RoutineNotificationService.instance) {
      RoutineNotificationService.instance =
        new RoutineNotificationService();
    }
    return RoutineNotificationService.instance;
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
    this.subscribeToProgressChanges();

    NotificationLogger.initialized(LOGGER_TAG.ROUTINE);
  }

  /**
   * ===========================================================================
   * Progress Store Subscription
   * ===========================================================================
   *
   * The single source of truth for "should task-dependent notifications be
   * refreshed?". Fires whenever dailyProgress actually changes (new object
   * reference from calculateProgress()), which only happens on a genuine
   * data change — not on loading/error flag toggles.
   */
  private subscribeToProgressChanges(): void {
    if (this.unsubscribeProgress) {
      return;
    }

    this.unsubscribeProgress = subscribeToDailyProgress(() => {
      this.queueScheduleRefresh();
    });
  }

  private queueScheduleRefresh(): void {
    if (this.progressChangeDebounceTimer) {
      clearTimeout(this.progressChangeDebounceTimer);
    }

    this.progressChangeDebounceTimer = setTimeout(() => {
      this.progressChangeDebounceTimer = null;
      this.scheduleRefresh().catch((error) => {
        NotificationLogger.error(
          LOGGER_TAG.ROUTINE,
          "Progress-driven scheduleRefresh() failed.",
          error
        );
      });
    }, PROGRESS_CHANGE_DEBOUNCE_MS);
  }

  /**
   * ===========================================================================
   * Synchronize
   * ===========================================================================
   *
   * Called by NotificationBootstrap.synchronize(). Schedules all four
   * routine notification categories for the day.
   */
  async syncRoutines(): Promise<void> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = this.doSyncRoutines();

    try {
      await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async doSyncRoutines(): Promise<void> {
    try {
      NotificationLogger.synchronizationStarted(LOGGER_TAG.ROUTINE, 4);

      await this.scheduleMorningMotivation();
      await this.scheduleEngagementReminders();
      await this.scheduleEveningPlanning();
      await this.scheduleDailySummary();

      NotificationLogger.synchronizationCompleted(LOGGER_TAG.ROUTINE);
    } catch (error) {
      NotificationLogger.synchronizationFailed(LOGGER_TAG.ROUTINE, error);
    }
  }

  /**
   * ===========================================================================
   * Schedule Refresh (task-dependent notifications only)
   * ===========================================================================
   *
   * Re-derives content from the current dailyProgress and re-schedules
   * ONLY the Engagement Reminders and the Daily Summary — the two
   * categories whose body depends on progress data. Morning Motivation and
   * Evening Planning triggers/content are left completely alone.
   *
   * You normally don't need to call this manually anymore — it's called
   * automatically whenever dailyProgress changes (see
   * subscribeToProgressChanges() above). It remains public/safe to call
   * directly (e.g. from a manual "refresh now" debug action) since it's
   * guarded against overlapping calls.
   */
  async scheduleRefresh(): Promise<void> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.doScheduleRefresh();

    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async doScheduleRefresh(): Promise<void> {
    // If a full sync is already running, let it finish first — it will
    // produce up-to-date content anyway, so re-running on top of it would
    // just be redundant work racing the same notification ids.
    if (this.syncInFlight) {
      await this.syncInFlight;
    }

    try {
      await this.cancelEngagementReminders();
      await this.cancelDailySummary();

      await this.scheduleEngagementReminders();
      await this.scheduleDailySummary();

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        "Task-dependent routine notifications (Engagement Reminders, Daily Summary) refreshed after progress change."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to refresh task-dependent routine notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * 1. Morning Motivation - 07:00 AM
   * ===========================================================================
   */
  private async scheduleMorningMotivation(): Promise<void> {
    try {
      const { hour, minute } = ROUTINE_SCHEDULE.MORNING_MOTIVATION;
      const trigger = NotificationHelper.getNextOccurrence(hour, minute);

      if (!NotificationHelper.canSchedule(trigger)) {
        NotificationLogger.debug(
          LOGGER_TAG.ROUTINE,
          "Skipped scheduling Morning Motivation (trigger in the past)."
        );
        return;
      }

      const body = await this.buildMorningMotivationBody();

      await NotificationScheduler.schedule({
        id: NotificationHelper.getRoutineNotificationId(
          RoutineNotificationType.MORNING_MOTIVATION
        ),

        trigger,

        content: {
          title: "☀️ Morning Motivation",

          body,

          payload: {
            type: NotificationType.ROUTINE,
            routineType: RoutineNotificationType.MORNING_MOTIVATION,
            screen: DASHBOARD_SCREEN,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        `Morning Motivation scheduled for ${trigger.toLocaleString()}`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to schedule Morning Motivation.",
        error
      );
    }
  }

  /**
   * Builds the Morning Motivation body: a random built-in quote, plus (if
   * available) a short line referencing yesterday's completed/pending
   * counts to nudge the user toward beating that number today.
   */
  private async buildMorningMotivationBody(): Promise<string> {
    const quote = this.pickRandom(MORNING_MOTIVATION_MESSAGES);
    const yesterday = await this.getYesterdaySummary();

    if (!yesterday || yesterday.total === 0) {
      return quote;
    }

    const { completed, total } = yesterday;
    const pending = Math.max(0, total - completed);

    if (pending === 0) {
      return `${quote}\n🏅 Yesterday you completed all ${total} task${
        total === 1 ? "" : "s"
      } — keep that streak alive today!`;
    }

    return `${quote}\n📈 Yesterday: ${completed}/${total} done. Let's beat that today!`;
  }

  /**
   * ===========================================================================
   * 2. Engagement Reminder - 09:00 / 11:00 / 13:00 / 15:00 / 17:00
   * ===========================================================================
   */
  private async scheduleEngagementReminders(): Promise<void> {
    const slots: Array<{
      hour: number;
      minute: number;
      routineType: RoutineNotificationType;
    }> = [
      {
        ...ROUTINE_SCHEDULE.ENGAGEMENT_REMINDERS[0],
        routineType: RoutineNotificationType.ENGAGEMENT_09,
      },
      {
        ...ROUTINE_SCHEDULE.ENGAGEMENT_REMINDERS[1],
        routineType: RoutineNotificationType.ENGAGEMENT_11,
      },
      {
        ...ROUTINE_SCHEDULE.ENGAGEMENT_REMINDERS[2],
        routineType: RoutineNotificationType.ENGAGEMENT_13,
      },
      {
        ...ROUTINE_SCHEDULE.ENGAGEMENT_REMINDERS[3],
        routineType: RoutineNotificationType.ENGAGEMENT_15,
      },
      {
        ...ROUTINE_SCHEDULE.ENGAGEMENT_REMINDERS[4],
        routineType: RoutineNotificationType.ENGAGEMENT_17,
      },
    ];

    for (const slot of slots) {
      await this.scheduleEngagementReminder(slot);
    }
  }

  private async scheduleEngagementReminder(slot: {
    hour: number;
    minute: number;
    routineType: RoutineNotificationType;
  }): Promise<void> {
    try {
      const trigger = NotificationHelper.getNextOccurrence(
        slot.hour,
        slot.minute
      );

      if (!NotificationHelper.canSchedule(trigger)) {
        NotificationLogger.debug(
          LOGGER_TAG.ROUTINE,
          `Skipped scheduling Engagement Reminder ${slot.routineType} (trigger in the past).`
        );
        return;
      }

      const { title, body } = this.buildEngagementContent();

      await NotificationScheduler.schedule({
        id: NotificationHelper.getRoutineNotificationId(slot.routineType),

        trigger,

        content: {
          title,

          body,

          payload: {
            type: NotificationType.ROUTINE,
            routineType: slot.routineType,
            screen: DASHBOARD_SCREEN,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        `Engagement Reminder (${slot.routineType}) scheduled for ${trigger.toLocaleString()}`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        `Failed to schedule Engagement Reminder (${slot.routineType}).`,
        error
      );
    }
  }

  /**
   * Derives Engagement Reminder title/body purely from useProgressStore's
   * dailyProgress — the same numbers the Daily Progress UI shows. Four
   * distinct states are covered:
   *
   *   1. No tasks exist today            -> nudge to create tasks.
   *   2. Tasks exist, zero completed      -> nudge to start.
   *   3. Some completed, some pending     -> report progress, keep going.
   *   4. All tasks completed              -> celebrate + suggest more.
   */
  private buildEngagementContent(): { title: string; body: string } {
    const { totalTasks, completedTasks, pendingTasks }: ProgressSummary =
      useProgressStore.getState().dailyProgress;

    const counts = this.normalizeCounts(
      totalTasks,
      completedTasks,
      pendingTasks
    );

    if (counts.total === 0) {
      return {
        title: "👋 Let's get started",
        body: this.pickRandom(ENGAGEMENT_NO_TASKS_MESSAGES),
      };
    }

    if (counts.completed === 0) {
      return {
        title: "⏳ Time to begin",
        body: this.formatTemplate(
          this.pickRandom(ENGAGEMENT_ZERO_PROGRESS_TEMPLATES),
          counts
        ),
      };
    }

    // Defensive >= rather than ===: if a task was deleted after being
    // marked complete (or the store briefly disagrees on pending vs.
    // total - completed), treat "completed reached/exceeded total" as the
    // completed state rather than falling through incorrectly.
    if (counts.completed >= counts.total) {
      return {
        title: "🎉 All done!",
        body: this.formatTemplate(
          this.pickRandom(ENGAGEMENT_COMPLETED_TEMPLATES),
          counts
        ),
      };
    }

    return {
      title: "📋 Keep going",
      body: this.formatTemplate(
        this.pickRandom(ENGAGEMENT_PARTIAL_PROGRESS_TEMPLATES),
        counts
      ),
    };
  }

  /**
   * Clamps and reconciles the raw progress-store counts so a stale or
   * partially-updated dailyProgress object can never produce a
   * nonsensical notification body (negative counts, pending that doesn't
   * match total - completed, etc.).
   */
  private normalizeCounts(
    totalTasksRaw: number,
    completedTasksRaw: number,
    pendingTasksRaw: number
  ): EngagementCounts {
    const total = Math.max(0, totalTasksRaw || 0);
    const completed = Math.min(
      total,
      Math.max(0, completedTasksRaw || 0)
    );
    const derivedPending = Math.max(0, total - completed);

    // Prefer the store's own pendingTasks when it agrees with the derived
    // value; otherwise trust the derived value, since total/completed are
    // the two numbers actually driving which state we're in.
    const pending =
      typeof pendingTasksRaw === "number" && pendingTasksRaw === derivedPending
        ? pendingTasksRaw
        : derivedPending;

    return { total, completed, pending };
  }

  /**
   * Tiny {token} substitution used by the engagement message templates.
   * Keeps count-aware copy out of hand-rolled string concatenation and
   * easy to extend/localize.
   */
  private formatTemplate(template: string, counts: EngagementCounts): string {
    const { total, completed, pending } = counts;

    return template
      .replace(/{total}/g, String(total))
      .replace(/{completed}/g, String(completed))
      .replace(/{pending}/g, String(pending))
      .replace(/{totalPlural}/g, total === 1 ? "" : "s")
      .replace(/{pendingPlural}/g, pending === 1 ? "" : "s");
  }

  /**
   * Cancels only the five Engagement Reminder notifications, without
   * touching Morning Motivation, Evening Planning, or Daily Summary.
   */
  private async cancelEngagementReminders(): Promise<void> {
    const engagementTypes = [
      RoutineNotificationType.ENGAGEMENT_09,
      RoutineNotificationType.ENGAGEMENT_11,
      RoutineNotificationType.ENGAGEMENT_13,
      RoutineNotificationType.ENGAGEMENT_15,
      RoutineNotificationType.ENGAGEMENT_17,
    ];

    await Promise.all(
      engagementTypes.map((routineType) =>
        NotificationScheduler.cancelByPayload({
          type: NotificationType.ROUTINE,
          routineType,
        })
      )
    );
  }

  /**
   * ===========================================================================
   * 3. Evening Planning - 06:00 PM
   * ===========================================================================
   */
  private async scheduleEveningPlanning(): Promise<void> {
    try {
      const { hour, minute } = ROUTINE_SCHEDULE.EVENING_PLANNING;
      const trigger = NotificationHelper.getNextOccurrence(hour, minute);

      if (!NotificationHelper.canSchedule(trigger)) {
        NotificationLogger.debug(
          LOGGER_TAG.ROUTINE,
          "Skipped scheduling Evening Planning (trigger in the past)."
        );
        return;
      }

      await NotificationScheduler.schedule({
        id: NotificationHelper.getRoutineNotificationId(
          RoutineNotificationType.EVENING_PLANNING
        ),

        trigger,

        content: {
          title: "🌆 Evening Planning",

          body: this.pickRandom(EVENING_PLANNING_MESSAGES),

          payload: {
            type: NotificationType.ROUTINE,
            routineType: RoutineNotificationType.EVENING_PLANNING,
            screen: DASHBOARD_SCREEN,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        `Evening Planning scheduled for ${trigger.toLocaleString()}`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to schedule Evening Planning.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * 4. Daily Summary - 09:45 PM
   * ===========================================================================
   */
  private async scheduleDailySummary(): Promise<void> {
    try {
      const { hour, minute } = ROUTINE_SCHEDULE.DAILY_SUMMARY;
      const trigger = NotificationHelper.getNextOccurrence(hour, minute);

      if (!NotificationHelper.canSchedule(trigger)) {
        NotificationLogger.debug(
          LOGGER_TAG.ROUTINE,
          "Skipped scheduling Daily Summary (trigger in the past)."
        );
        return;
      }

      const body = await this.buildDailySummaryBody();

      await NotificationScheduler.schedule({
        id: NotificationHelper.getRoutineNotificationId(
          RoutineNotificationType.DAILY_SUMMARY
        ),

        trigger,

        content: {
          title: "📊 Daily Summary",

          body,

          payload: {
            type: NotificationType.ROUTINE,
            routineType: RoutineNotificationType.DAILY_SUMMARY,
            screen: DASHBOARD_SCREEN,
          },
        },
      });

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        `Daily Summary scheduled for ${trigger.toLocaleString()}`
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to schedule Daily Summary.",
        error
      );
    }
  }

  /**
   * Cancels only the Daily Summary notification.
   */
  private async cancelDailySummary(): Promise<void> {
    await NotificationScheduler.cancelByPayload({
      type: NotificationType.ROUTINE,
      routineType: RoutineNotificationType.DAILY_SUMMARY,
    });
  }

  /**
   * Builds the Daily Summary body purely from useProgressStore's
   * dailyProgress, and persists a snapshot of it for tomorrow's Morning
   * Motivation to reference.
   */
  private async buildDailySummaryBody(): Promise<string> {
    const { totalTasks, completedTasks, pendingTasks }: ProgressSummary =
      useProgressStore.getState().dailyProgress;

    const counts = this.normalizeCounts(
      totalTasks,
      completedTasks,
      pendingTasks
    );

    if (counts.total === 0) {
      return "🌙 No tasks were created today. Tomorrow is a fresh page — let's plan and get things done.";
    }

    // Persist today's counts so tomorrow's Morning Motivation can reference
    // them. This is intentionally awaited, but its own failure must never
    // block the Daily Summary notification itself.
    await this.saveDailySummarySnapshot(counts.completed, counts.total);

    if (counts.completed >= counts.total) {
      return `🎉 Perfect day! ${counts.completed}/${counts.total} completed.\n✅ Pending: ${counts.pending}\nRest up — tomorrow's another chance to shine.`;
    }

    if (counts.completed === 0) {
      return `📊 Today's wrap-up:\n✅ Completed: ${counts.completed}/${counts.total}\n⏳ Pending: ${counts.pending}\nTomorrow's a clean slate — let's start strong.`;
    }

    return `📊 Today's wrap-up:\n✅ Completed: ${counts.completed}/${counts.total}\n⏳ Pending: ${counts.pending}\nSolid effort — carry that momentum into tomorrow!`;
  }

  /**
   * Reads back yesterday's persisted task counts, if any. Returns null if
   * no snapshot exists yet, or if the stored snapshot is from today (i.e.
   * we haven't crossed into a new day since it was saved, so there is no
   * "yesterday" to report).
   */
  private async getYesterdaySummary(): Promise<{
    completed: number;
    total: number;
  } | null> {
    try {
      const raw = await AsyncStorage.getItem(LAST_SUMMARY_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as DailySummarySnapshot;

      if (
        typeof parsed?.date !== "string" ||
        typeof parsed?.completed !== "number" ||
        typeof parsed?.total !== "number"
      ) {
        // Malformed/corrupted snapshot — treat as absent rather than
        // throwing and losing Morning Motivation entirely.
        return null;
      }

      const today = new Date().toDateString();

      if (parsed.date === today) {
        // Snapshot is from today (e.g. saved earlier the same day) — there
        // is no separate "yesterday" to report yet.
        return null;
      }

      return { completed: parsed.completed, total: parsed.total };
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to read last daily summary snapshot.",
        error
      );
      return null;
    }
  }

  private async saveDailySummarySnapshot(
    completed: number,
    total: number
  ): Promise<void> {
    try {
      const snapshot: DailySummarySnapshot = {
        date: new Date().toDateString(),
        completed,
        total,
      };

      await AsyncStorage.setItem(
        LAST_SUMMARY_STORAGE_KEY,
        JSON.stringify(snapshot)
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to save daily summary snapshot.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Cancel All Routine Notifications
   * ===========================================================================
   */
  async cancelAll(): Promise<void> {
    try {
      const routineTypes = Object.values(RoutineNotificationType);

      await Promise.all(
        routineTypes.map((routineType) =>
          NotificationScheduler.cancelByPayload({
            type: NotificationType.ROUTINE,
            routineType,
          })
        )
      );

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        "Cancelled all routine notifications."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to cancel all routine notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Refresh (full — all four categories)
   * ===========================================================================
   *
   * Use this for a full manual refresh (e.g. a "reset notifications" debug
   * action, or after the daily rollover). For routine progress-change
   * updates, prefer the lighter-weight `scheduleRefresh()` above — which
   * now runs automatically whenever dailyProgress changes.
   */
  async refresh(): Promise<void> {
    try {
      await this.cancelAll();
      await this.syncRoutines();

      NotificationLogger.info(
        LOGGER_TAG.ROUTINE,
        "Routine notifications refreshed."
      );
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to refresh routine notifications.",
        error
      );
    }
  }

  /**
   * ===========================================================================
   * Dispose
   * ===========================================================================
   */
  async dispose(): Promise<void> {
    try {
      await this.cancelAll();

      if (this.progressChangeDebounceTimer) {
        clearTimeout(this.progressChangeDebounceTimer);
        this.progressChangeDebounceTimer = null;
      }

      if (this.unsubscribeProgress) {
        this.unsubscribeProgress();
        this.unsubscribeProgress = null;
      }

      this.initialized = false;

      NotificationLogger.disposed(LOGGER_TAG.ROUTINE);
    } catch (error) {
      NotificationLogger.error(
        LOGGER_TAG.ROUTINE,
        "Failed to dispose Routine Notification Service.",
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

  /**
   * ===========================================================================
   * Reset Service (For Testing)
   * ===========================================================================
   */
  reset(): void {
    if (this.progressChangeDebounceTimer) {
      clearTimeout(this.progressChangeDebounceTimer);
      this.progressChangeDebounceTimer = null;
    }

    if (this.unsubscribeProgress) {
      this.unsubscribeProgress();
      this.unsubscribeProgress = null;
    }

    this.initialized = false;
  }

  private pickRandom(messages: readonly string[]): string {
    const index = Math.floor(Math.random() * messages.length);
    return messages[index];
  }
}

export default RoutineNotificationService.getInstance();