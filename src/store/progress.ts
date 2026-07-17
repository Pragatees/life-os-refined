// src/store/progress.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Task } from "../types/task";
import {
  getTodayDateString,
  getTodayRange,
  getWeekRange,
  getMonthRange,
  isValidDateString,
} from "../utils/date";

// -----------------------------------------------------------------------------
// API Configuration
// -----------------------------------------------------------------------------

const API_URL = `${process.env.EXPO_PUBLIC_API_URL}/api`;
const CACHE_TTL = 30_000; // 30 seconds
const REQUEST_TIMEOUT = 15_000; // 15 seconds

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
  // Task Collections
  dailyTasks: Task[];
  weeklyTasks: Task[];
  monthlyTasks: Task[];

  // Summaries
  dailyProgress: ProgressSummary;
  weeklyProgress: ProgressSummary;
  monthlyProgress: ProgressSummary;

  // Loading States
  dailyLoading: boolean;
  weeklyLoading: boolean;
  monthlyLoading: boolean;

  // Error States
  dailyError: string | null;
  weeklyError: string | null;
  monthlyError: string | null;

  // Cache Timestamps
  dailyLastFetchedAt: number | null;
  weeklyLastFetchedAt: number | null;
  monthlyLastFetchedAt: number | null;

  storedDay: string | null;
  loading: boolean;

  // Actions
  fetchDailyProgress: (force?: boolean) => Promise<void>;
  fetchWeeklyProgress: (force?: boolean) => Promise<void>;
  fetchMonthlyProgress: (force?: boolean) => Promise<void>;
  fetchAllProgress: (force?: boolean) => Promise<void>;
  initializeProgress: () => Promise<void>;
  onLogin: () => Promise<void>;
  invalidate: () => Promise<void>;
  invalidateDaily: () => Promise<void>;
  invalidateWeekly: () => Promise<void>;
  invalidateMonthly: () => Promise<void>;
  resetForNewDayIfNeeded: () => void;
  onLogout: () => Promise<void>;
  clearCache: () => void;
  // Force refresh specific date range
  refreshRange: (start: string, end: string) => Promise<Task[]>;
}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const EMPTY_PROGRESS: ProgressSummary = {
  totalTasks: 0,
  completedTasks: 0,
  pendingTasks: 0,
  overdueTasks: 0,
  completionRate: 0,
};

// -----------------------------------------------------------------------------
// Progress Calculator
// -----------------------------------------------------------------------------

const calculateProgress = (tasks: Task[]): ProgressSummary => {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => task.completed).length;
  const pendingTasks = totalTasks - completedTasks;

  const today = getTodayDateString();

  // taskDate should be in yyyy-MM-dd format
  const overdueTasks = tasks.filter(
    (task) => !task.completed && task.taskDate && task.taskDate < today
  ).length;

  const completionRate =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  return {
    totalTasks,
    completedTasks,
    pendingTasks,
    overdueTasks,
    completionRate,
  };
};

// -----------------------------------------------------------------------------
// Internal Helper - Fetch Range Tasks
// -----------------------------------------------------------------------------

const fetchRangeTasks = async (start: string, end: string): Promise<Task[]> => {
  // Validate date formats before sending
  if (!isValidDateString(start)) {
    throw new Error(`Invalid start date format: ${start}. Expected yyyy-MM-dd`);
  }
  if (!isValidDateString(end)) {
    throw new Error(`Invalid end date format: ${end}. Expected yyyy-MM-dd`);
  }

  const token = await AsyncStorage.getItem("token");

  if (!token) {
    throw new Error("No authentication token found");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const url = `${API_URL}/tasks/range?start=${start}&end=${end}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("Authentication failed. Please log in again.");
      }
      if (res.status === 404) {
        throw new Error("Tasks endpoint not found");
      }
      throw new Error(`Server Error ${res.status}`);
    }

    const data = await res.json();
    const tasks = Array.isArray(data) ? data : [];

    // Validate task dates
    tasks.forEach((task: Task) => {
      if (task.taskDate && !isValidDateString(task.taskDate)) {
        console.warn(`[ProgressStore] Invalid task date format: ${task.taskDate}`);
      }
    });

    return tasks;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  }
};

// -----------------------------------------------------------------------------
// Helper - Check if cache is fresh
// -----------------------------------------------------------------------------

const isFresh = (lastFetchedAt: number | null): boolean =>
  lastFetchedAt !== null && Date.now() - lastFetchedAt < CACHE_TTL;

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      // -----------------------------------------------------------------------
      // Initial State
      // -----------------------------------------------------------------------

      dailyTasks: [],
      weeklyTasks: [],
      monthlyTasks: [],

      dailyProgress: EMPTY_PROGRESS,
      weeklyProgress: EMPTY_PROGRESS,
      monthlyProgress: EMPTY_PROGRESS,

      dailyLoading: false,
      weeklyLoading: false,
      monthlyLoading: false,

      dailyError: null,
      weeklyError: null,
      monthlyError: null,

      dailyLastFetchedAt: null,
      weeklyLastFetchedAt: null,
      monthlyLastFetchedAt: null,

      storedDay: null,
      loading: false,

      // -----------------------------------------------------------------------
      // 1. fetchDailyProgress
      // -----------------------------------------------------------------------

      fetchDailyProgress: async (force = false) => {
        const { dailyLoading, dailyLastFetchedAt } = get();

        if (dailyLoading) {
          return;
        }

        if (!force && isFresh(dailyLastFetchedAt)) {
          return;
        }

        set({ dailyLoading: true, dailyError: null });

        try {
          const range = getTodayRange();
          const tasks = await fetchRangeTasks(range.start, range.end);

          set({
            dailyTasks: tasks,
            dailyProgress: calculateProgress(tasks),
            dailyLoading: false,
            dailyError: null,
            dailyLastFetchedAt: Date.now(),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unable to load daily progress.";
          console.error("[ProgressStore] Daily Progress Error:", error);

          set({
            dailyLoading: false,
            dailyError: errorMessage,
          });
        }
      },

      // -----------------------------------------------------------------------
      // 2. fetchWeeklyProgress
      // -----------------------------------------------------------------------

      fetchWeeklyProgress: async (force = false) => {
        const { weeklyLoading, weeklyLastFetchedAt } = get();

        if (weeklyLoading) {
          return;
        }

        if (!force && isFresh(weeklyLastFetchedAt)) {
          return;
        }

        set({ weeklyLoading: true, weeklyError: null });

        try {
          const range = getWeekRange();
          const tasks = await fetchRangeTasks(range.start, range.end);

          set({
            weeklyTasks: tasks,
            weeklyProgress: calculateProgress(tasks),
            weeklyLoading: false,
            weeklyError: null,
            weeklyLastFetchedAt: Date.now(),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unable to load weekly progress.";
          console.error("[ProgressStore] Weekly Progress Error:", error);

          set({
            weeklyLoading: false,
            weeklyError: errorMessage,
          });
        }
      },

      // -----------------------------------------------------------------------
      // 3. fetchMonthlyProgress
      // -----------------------------------------------------------------------

      fetchMonthlyProgress: async (force = false) => {
        const { monthlyLoading, monthlyLastFetchedAt } = get();

        if (monthlyLoading) {
          return;
        }

        if (!force && isFresh(monthlyLastFetchedAt)) {
          return;
        }

        set({ monthlyLoading: true, monthlyError: null });

        try {
          const range = getMonthRange();
          const tasks = await fetchRangeTasks(range.start, range.end);

          set({
            monthlyTasks: tasks,
            monthlyProgress: calculateProgress(tasks),
            monthlyLoading: false,
            monthlyError: null,
            monthlyLastFetchedAt: Date.now(),
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unable to load monthly progress.";
          console.error("[ProgressStore] Monthly Progress Error:", error);

          set({
            monthlyLoading: false,
            monthlyError: errorMessage,
          });
        }
      },

      // -----------------------------------------------------------------------
      // 4. fetchAllProgress
      // -----------------------------------------------------------------------

      fetchAllProgress: async (force = false) => {
        // Check for new day before anything else
        get().resetForNewDayIfNeeded();

        if (get().loading) {
          return;
        }

        set({ loading: true });

        try {
          const results = await Promise.allSettled([
            get().fetchDailyProgress(force),
            get().fetchWeeklyProgress(force),
            get().fetchMonthlyProgress(force),
          ]);

          const names = ["Daily", "Weekly", "Monthly"];
          results.forEach((result, index) => {
            if (result.status === "rejected") {
              console.error(`[ProgressStore] ${names[index]} fetch failed:`, result.reason);
            }
          });
        } catch (error) {
          console.error("[ProgressStore] Fetch all progress failed:", error);
        } finally {
          set({ loading: false });
        }
      },

      // -----------------------------------------------------------------------
      // 5. initializeProgress
      // -----------------------------------------------------------------------

      initializeProgress: async () => {
        try {
          get().resetForNewDayIfNeeded();

          const {
            dailyLastFetchedAt,
            weeklyLastFetchedAt,
            monthlyLastFetchedAt,
          } = get();

          const allFresh =
            isFresh(dailyLastFetchedAt) &&
            isFresh(weeklyLastFetchedAt) &&
            isFresh(monthlyLastFetchedAt);

          if (allFresh) {
            return;
          }

          await get().fetchAllProgress(false);
        } catch (error) {
          console.error("[ProgressStore] Failed to initialize progress:", error);
          // Don't throw - let components handle errors via per-range error flags
        }
      },

      // -----------------------------------------------------------------------
      // 6. onLogin
      // -----------------------------------------------------------------------

      onLogin: async () => {
        set({
          dailyTasks: [],
          weeklyTasks: [],
          monthlyTasks: [],

          dailyProgress: EMPTY_PROGRESS,
          weeklyProgress: EMPTY_PROGRESS,
          monthlyProgress: EMPTY_PROGRESS,

          dailyError: null,
          weeklyError: null,
          monthlyError: null,

          dailyLastFetchedAt: null,
          weeklyLastFetchedAt: null,
          monthlyLastFetchedAt: null,

          storedDay: getTodayDateString(),
          loading: false,
        });

        await get().fetchAllProgress(true);
      },

      // -----------------------------------------------------------------------
      // 7. invalidate - Invalidate ALL cache
      //
      // This is the single entry point that useTaskStore calls (via a
      // subscription, see task.ts) whenever tasks change on the backend.
      // It clears local progress state and forces a fresh fetch of
      // daily/weekly/monthly data from the database.
      // -----------------------------------------------------------------------

      invalidate: async () => {
        // Clear all cached data immediately
        set({
          dailyTasks: [],
          weeklyTasks: [],
          monthlyTasks: [],

          dailyProgress: EMPTY_PROGRESS,
          weeklyProgress: EMPTY_PROGRESS,
          monthlyProgress: EMPTY_PROGRESS,

          dailyLastFetchedAt: null,
          weeklyLastFetchedAt: null,
          monthlyLastFetchedAt: null,

          // Reset errors on invalidation
          dailyError: null,
          weeklyError: null,
          monthlyError: null,
        });

        // Force refresh all progress
        await get().fetchAllProgress(true);
      },

      // -----------------------------------------------------------------------
      // 8. invalidateDaily - Invalidate ONLY daily cache
      // -----------------------------------------------------------------------

      invalidateDaily: async () => {
        set({
          dailyTasks: [],
          dailyProgress: EMPTY_PROGRESS,
          dailyLastFetchedAt: null,
          dailyError: null,
        });

        await get().fetchDailyProgress(true);
      },

      // -----------------------------------------------------------------------
      // 9. invalidateWeekly - Invalidate ONLY weekly cache
      // -----------------------------------------------------------------------

      invalidateWeekly: async () => {
        set({
          weeklyTasks: [],
          weeklyProgress: EMPTY_PROGRESS,
          weeklyLastFetchedAt: null,
          weeklyError: null,
        });

        await get().fetchWeeklyProgress(true);
      },

      // -----------------------------------------------------------------------
      // 10. invalidateMonthly - Invalidate ONLY monthly cache
      // -----------------------------------------------------------------------

      invalidateMonthly: async () => {
        set({
          monthlyTasks: [],
          monthlyProgress: EMPTY_PROGRESS,
          monthlyLastFetchedAt: null,
          monthlyError: null,
        });

        await get().fetchMonthlyProgress(true);
      },

      // -----------------------------------------------------------------------
      // 11. refreshRange - Fetch a specific date range and update cache
      // -----------------------------------------------------------------------

      refreshRange: async (start: string, end: string): Promise<Task[]> => {
        try {
          const tasks = await fetchRangeTasks(start, end);

          // Check which range this falls into and update accordingly
          const today = getTodayDateString();
          const weekRange = getWeekRange();
          const monthRange = getMonthRange();

          // If it's today's range, update daily
          if (start === today && end === today) {
            set({
              dailyTasks: tasks,
              dailyProgress: calculateProgress(tasks),
              dailyLastFetchedAt: Date.now(),
              dailyError: null,
            });
          }

          // If it's within the week range, update weekly
          if (start === weekRange.start && end === weekRange.end) {
            set({
              weeklyTasks: tasks,
              weeklyProgress: calculateProgress(tasks),
              weeklyLastFetchedAt: Date.now(),
              weeklyError: null,
            });
          }

          // If it's within the month range, update monthly
          if (start === monthRange.start && end === monthRange.end) {
            set({
              monthlyTasks: tasks,
              monthlyProgress: calculateProgress(tasks),
              monthlyLastFetchedAt: Date.now(),
              monthlyError: null,
            });
          }

          return tasks;
        } catch (error) {
          console.error("[ProgressStore] Refresh range failed:", error);
          throw error;
        }
      },

      // -----------------------------------------------------------------------
      // 12. clearCache - Clear ALL cache without refetching
      // -----------------------------------------------------------------------

      clearCache: () => {
        set({
          dailyTasks: [],
          weeklyTasks: [],
          monthlyTasks: [],

          dailyProgress: EMPTY_PROGRESS,
          weeklyProgress: EMPTY_PROGRESS,
          monthlyProgress: EMPTY_PROGRESS,

          dailyLastFetchedAt: null,
          weeklyLastFetchedAt: null,
          monthlyLastFetchedAt: null,

          dailyError: null,
          weeklyError: null,
          monthlyError: null,
        });
      },

      // -----------------------------------------------------------------------
      // 13. resetForNewDayIfNeeded
      // -----------------------------------------------------------------------

      resetForNewDayIfNeeded: () => {
        const today = getTodayDateString();
        const { storedDay } = get();

        if (storedDay !== today) {
          set({
            dailyTasks: [],
            weeklyTasks: [],
            monthlyTasks: [],

            dailyProgress: EMPTY_PROGRESS,
            weeklyProgress: EMPTY_PROGRESS,
            monthlyProgress: EMPTY_PROGRESS,

            dailyLastFetchedAt: null,
            weeklyLastFetchedAt: null,
            monthlyLastFetchedAt: null,

            storedDay: today,
          });
        }
      },

      // -----------------------------------------------------------------------
      // 14. onLogout
      // -----------------------------------------------------------------------

      onLogout: async () => {
        try {
          await AsyncStorage.removeItem("progress-storage");
        } catch (error) {
          console.error(
            "[ProgressStore] Error clearing progress storage on logout:",
            error
          );
        }

        set({
          dailyTasks: [],
          weeklyTasks: [],
          monthlyTasks: [],

          dailyProgress: EMPTY_PROGRESS,
          weeklyProgress: EMPTY_PROGRESS,
          monthlyProgress: EMPTY_PROGRESS,

          dailyLoading: false,
          weeklyLoading: false,
          monthlyLoading: false,

          dailyError: null,
          weeklyError: null,
          monthlyError: null,

          dailyLastFetchedAt: null,
          weeklyLastFetchedAt: null,
          monthlyLastFetchedAt: null,

          storedDay: null,
          loading: false,
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

        dailyLastFetchedAt: state.dailyLastFetchedAt,
        weeklyLastFetchedAt: state.weeklyLastFetchedAt,
        monthlyLastFetchedAt: state.monthlyLastFetchedAt,

        storedDay: state.storedDay,
      }),

      onRehydrateStorage: () => (state) => {
        if (!state) return;

        const today = getTodayDateString();

        if (state.storedDay !== today) {
          state.dailyTasks = [];
          state.weeklyTasks = [];
          state.monthlyTasks = [];

          state.dailyProgress = EMPTY_PROGRESS;
          state.weeklyProgress = EMPTY_PROGRESS;
          state.monthlyProgress = EMPTY_PROGRESS;

          state.dailyLastFetchedAt = null;
          state.weeklyLastFetchedAt = null;
          state.monthlyLastFetchedAt = null;

          state.storedDay = today;
        }
      },
    }
  )
);