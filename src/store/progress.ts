// src/store/progress.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Task } from "../types/task";
import { getTodayDateString } from "../services/notificationService";

// -----------------------------------------------------------------------------
// API
// -----------------------------------------------------------------------------

const API_URL = "https://life-os-backend-1ozl.onrender.com/api";

const CACHE_TTL = 30_000; // 30 Seconds

const getToken = (): Promise<string | null> =>
  AsyncStorage.getItem("token");

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ProgressSummary {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  completionRate: number;
}

interface ProgressState {
  // ---------------------------------------------------------------------------
  // Task Collections
  // ---------------------------------------------------------------------------

  dailyTasks: Task[];
  weeklyTasks: Task[];
  monthlyTasks: Task[];

  // ---------------------------------------------------------------------------
  // Summaries
  // ---------------------------------------------------------------------------

  dailyProgress: ProgressSummary;
  weeklyProgress: ProgressSummary;
  monthlyProgress: ProgressSummary;

  // ---------------------------------------------------------------------------
  // Store State
  // ---------------------------------------------------------------------------

  loading: boolean;
  error: string | null;

  lastFetchedAt: number | null;
  storedDay: string | null;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  fetchDailyProgress: (force?: boolean) => Promise<void>;

  fetchWeeklyProgress: (force?: boolean) => Promise<void>;

  fetchMonthlyProgress: (force?: boolean) => Promise<void>;

  fetchAllProgress: (force?: boolean) => Promise<void>;

  // Called once by the parent screen (e.g. ProgressScreen) on mount.
  // If the store already has cached data for today, this resolves
  // immediately without hitting the network. DayView/WeekView/MonthView
  // should never call fetch*Progress on mount themselves — only this.
  initializeProgress: () => Promise<void>;

  invalidate: () => void;

  resetForNewDayIfNeeded: () => void;

  onLogout: () => Promise<void>;
}

// -----------------------------------------------------------------------------
// Empty Summary
// -----------------------------------------------------------------------------

const EMPTY_PROGRESS: ProgressSummary = {
  totalTasks: 0,
  completedTasks: 0,
  pendingTasks: 0,
  overdueTasks: 0,
  completionRate: 0,
};

// -----------------------------------------------------------------------------
// Date Helpers
// -----------------------------------------------------------------------------

const formatDate = (date: Date): string =>
  date.toISOString().split("T")[0];

// -----------------------------------------------------------------------------
// Daily
// -----------------------------------------------------------------------------

const getTodayRange = () => {
  const today = new Date();
  const date = formatDate(today);

  return {
    start: date,
    end: date,
  };
};

// -----------------------------------------------------------------------------
// Weekly
// Monday -> Sunday
// -----------------------------------------------------------------------------

const getWeekRange = () => {
  const today = new Date();

  const day = today.getDay();

  const diff = day === 0 ? -6 : 1 - day;

  const start = new Date(today);

  start.setDate(today.getDate() + diff);

  const end = new Date(start);

  end.setDate(start.getDate() + 6);

  return {
    start: formatDate(start),
    end: formatDate(end),
  };
};

// -----------------------------------------------------------------------------
// Monthly
// -----------------------------------------------------------------------------

const getMonthRange = () => {
  const today = new Date();

  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    1
  );

  const end = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  );

  return {
    start: formatDate(start),
    end: formatDate(end),
  };
};

// -----------------------------------------------------------------------------
// Progress Calculator
// -----------------------------------------------------------------------------

const calculateProgress = (tasks: Task[]): ProgressSummary => {
  const totalTasks = tasks.length;

  const completedTasks = tasks.filter(
    (task) => task.completed
  ).length;

  const pendingTasks = totalTasks - completedTasks;

  const today = getTodayDateString();

  const overdueTasks = tasks.filter(
    (task) =>
      !task.completed &&
      task.taskDate < today
  ).length;

  const completionRate =
    totalTasks === 0
      ? 0
      : Math.round((completedTasks / totalTasks) * 100);

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    completionRate,
  };
};

// -----------------------------------------------------------------------------
// Internal Helper
// -----------------------------------------------------------------------------

const fetchRangeTasks = async (
  start: string,
  end: string
): Promise<Task[]> => {
  const token = await getToken();

  const res = await fetch(
    `${API_URL}/tasks/range?start=${start}&end=${end}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Server Error ${res.status}`);
  }

  const data = await res.json();

  return Array.isArray(data) ? data : [];
};

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      // -----------------------------------------------------------------------
      // Task Data
      // -----------------------------------------------------------------------

      dailyTasks: [],
      weeklyTasks: [],
      monthlyTasks: [],

      // -----------------------------------------------------------------------
      // Progress
      // -----------------------------------------------------------------------

      dailyProgress: EMPTY_PROGRESS,
      weeklyProgress: EMPTY_PROGRESS,
      monthlyProgress: EMPTY_PROGRESS,

      // -----------------------------------------------------------------------
      // State
      // -----------------------------------------------------------------------

      loading: false,
      error: null,

      lastFetchedAt: null,
      storedDay: null,

      // -----------------------------------------------------------------------
      // Daily Progress
      // -----------------------------------------------------------------------

      fetchDailyProgress: async (force = false) => {
        get().resetForNewDayIfNeeded();

        const { loading, lastFetchedAt } = get();

        if (loading) return;

        const now = Date.now();

        if (
          !force &&
          lastFetchedAt !== null &&
          now - lastFetchedAt < CACHE_TTL
        ) {
          return;
        }

        set({
          loading: true,
          error: null,
        });

        try {
          const range = getTodayRange();

          const tasks = await fetchRangeTasks(
            range.start,
            range.end
          );

          set({
            dailyTasks: tasks,
            dailyProgress: calculateProgress(tasks),
            loading: false,
            error: null,
            lastFetchedAt: Date.now(),
            storedDay: getTodayDateString(),
          });
        } catch (err) {
          console.error("[ProgressStore] Daily Progress:", err);

          set({
            loading: false,
            error: "Unable to load daily progress.",
          });
        }
      },

      // -----------------------------------------------------------------------
      // Weekly Progress
      // -----------------------------------------------------------------------

      fetchWeeklyProgress: async (force = false) => {
        get().resetForNewDayIfNeeded();

        const { loading, lastFetchedAt } = get();

        if (loading) return;

        const now = Date.now();

        if (
          !force &&
          lastFetchedAt !== null &&
          now - lastFetchedAt < CACHE_TTL
        ) {
          return;
        }

        set({
          loading: true,
          error: null,
        });

        try {
          const range = getWeekRange();

          const tasks = await fetchRangeTasks(
            range.start,
            range.end
          );

          set({
            weeklyTasks: tasks,
            weeklyProgress: calculateProgress(tasks),
            loading: false,
            error: null,
          });
        } catch (err) {
          console.error("[ProgressStore] Weekly Progress:", err);

          set({
            loading: false,
            error: "Unable to load weekly progress.",
          });
        }
      },

      // -----------------------------------------------------------------------
      // Monthly Progress
      // -----------------------------------------------------------------------

      fetchMonthlyProgress: async (force = false) => {
        get().resetForNewDayIfNeeded();

        const { loading, lastFetchedAt } = get();

        if (loading) return;

        const now = Date.now();

        if (
          !force &&
          lastFetchedAt !== null &&
          now - lastFetchedAt < CACHE_TTL
        ) {
          return;
        }

        set({
          loading: true,
          error: null,
        });

        try {
          const range = getMonthRange();

          const tasks = await fetchRangeTasks(
            range.start,
            range.end
          );

          set({
            monthlyTasks: tasks,
            monthlyProgress: calculateProgress(tasks),
            loading: false,
            error: null,
          });
        } catch (err) {
          console.error("[ProgressStore] Monthly Progress:", err);

          set({
            loading: false,
            error: "Unable to load monthly progress.",
          });
        }
      },

      // -----------------------------------------------------------------------
      // Fetch Everything
      // -----------------------------------------------------------------------

      fetchAllProgress: async (force = false) => {
        get().resetForNewDayIfNeeded();

        const { loading, lastFetchedAt } = get();

        if (loading) return;

        const now = Date.now();

        if (
          !force &&
          lastFetchedAt !== null &&
          now - lastFetchedAt < CACHE_TTL
        ) {
          return;
        }

        set({
          loading: true,
          error: null,
        });

        try {
          const dailyRange = getTodayRange();
          const weeklyRange = getWeekRange();
          const monthlyRange = getMonthRange();

          const [
            dailyTasks,
            weeklyTasks,
            monthlyTasks,
          ] = await Promise.all([
            fetchRangeTasks(
              dailyRange.start,
              dailyRange.end
            ),
            fetchRangeTasks(
              weeklyRange.start,
              weeklyRange.end
            ),
            fetchRangeTasks(
              monthlyRange.start,
              monthlyRange.end
            ),
          ]);

          set({
            dailyTasks,
            weeklyTasks,
            monthlyTasks,

            dailyProgress: calculateProgress(dailyTasks),
            weeklyProgress: calculateProgress(weeklyTasks),
            monthlyProgress: calculateProgress(monthlyTasks),

            loading: false,
            error: null,

            lastFetchedAt: Date.now(),
            storedDay: getTodayDateString(),
          });
        } catch (err) {
          console.error(
            "[ProgressStore] Fetch All Progress:",
            err
          );

          set({
            loading: false,
            error: "Unable to load progress.",
          });
        }
      },

      // -----------------------------------------------------------------------
      // Initialize Progress
      //
      // This is the ONLY entry point screens should call on mount.
      // - If the store already has fresh cached data (persisted via
      //   AsyncStorage and rehydrated), it resolves immediately with
      //   no network call.
      // - If there's no cache yet (first app open, logout->login,
      //   or a new calendar day wiped it), it fetches once.
      //
      // DayView / WeekView / MonthView must NOT call fetch*Progress
      // themselves — only the parent ProgressScreen calls this, once.
      // -----------------------------------------------------------------------

      initializeProgress: async () => {
        get().resetForNewDayIfNeeded();

        const { dailyTasks, weeklyTasks, monthlyTasks, lastFetchedAt, loading } =
          get();

        if (loading) return;

        const hasCache =
          dailyTasks.length > 0 ||
          weeklyTasks.length > 0 ||
          monthlyTasks.length > 0;

        if (hasCache && lastFetchedAt !== null) {
          // Cache exists for today already — nothing to do.
          return;
        }

        await get().fetchAllProgress();
      },

      // -----------------------------------------------------------------------
      // Invalidate Cache
      // -----------------------------------------------------------------------

      invalidate: () => {
        set({
          lastFetchedAt: null,
        });

        get().fetchAllProgress(true);
      },

      // -----------------------------------------------------------------------
      // Reset Progress For New Day
      // -----------------------------------------------------------------------

      resetForNewDayIfNeeded: () => {
        const today = getTodayDateString();

        const { storedDay } = get();

        if (storedDay !== today) {
          console.log(
            `[ProgressStore] New day detected (was "${storedDay}", now "${today}")`
          );

          set({
            dailyTasks: [],
            weeklyTasks: [],
            monthlyTasks: [],

            dailyProgress: EMPTY_PROGRESS,
            weeklyProgress: EMPTY_PROGRESS,
            monthlyProgress: EMPTY_PROGRESS,

            lastFetchedAt: null,
            storedDay: today,
          });
        }
      },

      // -----------------------------------------------------------------------
      // Logout
      // -----------------------------------------------------------------------

      onLogout: async () => {
        set({
          dailyTasks: [],
          weeklyTasks: [],
          monthlyTasks: [],

          dailyProgress: EMPTY_PROGRESS,
          weeklyProgress: EMPTY_PROGRESS,
          monthlyProgress: EMPTY_PROGRESS,

          loading: false,
          error: null,

          lastFetchedAt: null,
          storedDay: null,
        });
      },
    }),
    {
      name: "progress-storage",

      storage: createJSONStorage(() => AsyncStorage),

      partialize: (state) => ({
        dailyTasks: state.dailyTasks,
        weeklyTasks: state.weeklyTasks,
        monthlyTasks: state.monthlyTasks,

        dailyProgress: state.dailyProgress,
        weeklyProgress: state.weeklyProgress,
        monthlyProgress: state.monthlyProgress,

        lastFetchedAt: state.lastFetchedAt,
        storedDay: state.storedDay,
      }),

      onRehydrateStorage: () => (state) => {
        if (!state) return;

        const today = getTodayDateString();

        if (state.storedDay !== today) {
          console.log(
            `[ProgressStore] Rehydrated stale cache (${state.storedDay}) -> ${today}`
          );

          state.dailyTasks = [];
          state.weeklyTasks = [];
          state.monthlyTasks = [];

          state.dailyProgress = EMPTY_PROGRESS;
          state.weeklyProgress = EMPTY_PROGRESS;
          state.monthlyProgress = EMPTY_PROGRESS;

          state.lastFetchedAt = null;
          state.storedDay = today;
        }
      },
    }
  )
);