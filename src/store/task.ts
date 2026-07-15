// src/store/task.ts
// Install:
//   npm install zustand @react-native-async-storage/async-storage

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Task, Priority } from "../types/task";
import TaskNotificationService from "../notifications/task/TaskNotificationService";
import { useProgressStore } from "./progress";
import { getTodayDateString } from "../utils/date";

export type { Priority };
export type { Task };

// Backend-owned recurrence enum (Master Task Architecture). Kept here as the
// single shared source so AddTask/EditTask both import the same type. If
// your `Task` interface in "../types/task" doesn't yet include a
// `repeatType: RepeatType` field, add it there too — the backend returns it
// on every task.
export type RepeatType = "NEVER" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api";

// ─── Store Types ──────────────────────────────────────────────────────────────

interface TaskState {
  tasks: Task[];
  lastFetchedAt: number | null;
  loading: boolean;
  error: string | null;
  // Tracks which calendar day the current `tasks` snapshot belongs to.
  // Used to give local storage a "fresh start" every new day (Point 5).
  storedDay: string | null;

  fetchTasks: (force?: boolean) => Promise<void>;
  invalidate: () => void;
  markComplete: (taskId: string) => Promise<{ ok: boolean; error?: string }>;
  updateTask: (
    taskId: string,
    payload: Omit<Task, "id" | "completed">
  ) => Promise<{ ok: boolean; error?: string }>;
  addTask: (
    payload: Omit<Task, "id" | "completed">
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteTask: (taskId: string) => Promise<{ ok: boolean; error?: string }>;
  onLoginSuccess: (userName?: string) => Promise<void>;
  onLogout: () => Promise<void>;
  resetForNewDayIfNeeded: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CACHE_TTL = 30_000; // 30 seconds

const sortByPriority = (list: Task[]): Task[] => {
  const order: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return [...list].sort((a, b) => order[a.priority] - order[b.priority]);
};

const getToken = (): Promise<string | null> => AsyncStorage.getItem("token");

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      lastFetchedAt: null,
      loading: false,
      error: null,
      storedDay: null,

      // ── resetForNewDayIfNeeded (Point 5) ───────────────────────────────────
      // If the locally stored snapshot belongs to a previous calendar day,
      // wipe it so the day starts fresh. The next fetchTasks() call repopulates
      // from the server as normal — this only guards the *local cache*.
      //
      // Recurring tasks are generated entirely by the backend's Master Task
      // Architecture (a scheduled job on the server), so this just refreshes
      // the local task list — it does not generate anything itself.
      resetForNewDayIfNeeded: () => {
        const today = getTodayDateString();
        const { storedDay } = get();

        if (storedDay !== today) {
          console.log(
            `[TaskStore] New day detected (was "${storedDay}", now "${today}") — clearing local task cache.`
          );
          set({
            tasks: [],
            lastFetchedAt: null,
            storedDay: today,
          });

          get().fetchTasks(true);
        }
      },

      // ── fetchTasks ─────────────────────────────────────────────────────────
      fetchTasks: async (force = false) => {
        // Day boundary check happens before anything else, every call.
        get().resetForNewDayIfNeeded();

        const { loading, lastFetchedAt } = get();

        // Prevent concurrent fetches
        if (loading) return;

        // Use cached data if still fresh
        const now = Date.now();
        if (
          !force &&
          lastFetchedAt !== null &&
          now - lastFetchedAt < CACHE_TTL
        )
          return;

        set({ loading: true, error: null });

        try {
          const token = await getToken();
          const res = await fetch(`${API_URL}/tasks/today`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            const data = await res.json();
            const tasks = sortByPriority(Array.isArray(data) ? data : []);

            set({
              tasks,
              lastFetchedAt: Date.now(),
              loading: false,
              error: null,
              storedDay: getTodayDateString(),
            });

            await TaskNotificationService.syncTasks();
          } else {
            console.error("[TaskStore] Server error:", res.status);
            set({ loading: false, error: `Server error ${res.status}` });
          }
        } catch (err) {
          console.error("[TaskStore] Network error:", err);
          set({
            loading: false,
            error: "Connection error. Unable to reach the server.",
          });
        }
      },

      // ── invalidate ─────────────────────────────────────────────────────────
      invalidate: () => {
        set({ lastFetchedAt: null });
        get().fetchTasks(true);
      },

      // ── markComplete ───────────────────────────────────────────────────────
      // NOTE: no manual progress-store call here anymore. Successfully
      // completing a task updates `lastFetchedAt` (via fetchTasks(true)
      // below), which the subscription at the bottom of this file picks up
      // and uses to re-fetch progress from the database automatically.
      markComplete: async (taskId) => {
        get().resetForNewDayIfNeeded();

        // Optimistic update
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId ? { ...t, completed: true } : t
          ),
        }));

        try {
          const token = await getToken();
          const res = await fetch(`${API_URL}/tasks/${taskId}/complete`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            // Recurring tasks (if any) are generated by the backend's
            // scheduler as part of the Master Task Architecture — completing
            // a task here never creates the next occurrence on the frontend.
            // Just refresh so the updated task list reflects server state.
            // This also updates lastFetchedAt, which triggers the progress
            // sync subscription below.
            await get().fetchTasks(true);

            await TaskNotificationService.onTaskCompleted(taskId);

            return { ok: true };
          } else {
            // Roll back optimistic update
            get().fetchTasks(true);
            return { ok: false, error: `Server error ${res.status}` };
          }
        } catch {
          get().fetchTasks(true);
          return { ok: false, error: "Connection error." };
        }
      },

      // ── updateTask ─────────────────────────────────────────────────────────
      updateTask: async (taskId, payload) => {
        get().resetForNewDayIfNeeded();

        try {
          const token = await getToken();
          const res = await fetch(`${API_URL}/tasks/${taskId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            // The backend already keeps recurrence information in sync for
            // future occurrences as part of the Master Task Architecture —
            // no local recurrence bookkeeping is needed here.
            await get().fetchTasks(true);

            const updatedTask = get().tasks.find((t) => t.id === taskId);
            if (updatedTask) {
              await TaskNotificationService.rescheduleTask(updatedTask);
            }

            return { ok: true };
          } else {
            const err = await res.json().catch(() => null);
            return {
              ok: false,
              error: err?.message ?? `Server error ${res.status}`,
            };
          }
        } catch {
          return { ok: false, error: "Connection error." };
        }
      },

      // ── addTask ─────────────────────────────────────────────────────────────
      // Creates a task on the server, then refetches.
      //
      // Recurrence (repeatType) is included in the payload by the caller
      // (AddTaskComponent); the backend's Master Task Architecture is fully
      // responsible for creating the master task and scheduling all future
      // occurrences. This function does not need to know anything about it.
      addTask: async (payload) => {
        get().resetForNewDayIfNeeded();

        try {
          const token = await getToken();
          const res = await fetch(`${API_URL}/tasks`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          if (res.ok) {
            await get().fetchTasks(true);

            const createdTask = get().tasks.find(
              (t) =>
                t.taskName === payload.taskName &&
                t.taskDate === payload.taskDate &&
                t.taskTime === payload.taskTime
            );
            if (createdTask) {
              await TaskNotificationService.scheduleTask(createdTask);
            }

            return { ok: true };
          } else {
            const err = await res.json().catch(() => null);
            return {
              ok: false,
              error: err?.message ?? `Server error ${res.status}`,
            };
          }
        } catch {
          return { ok: false, error: "Connection error." };
        }
      },

      // ── deleteTask ─────────────────────────────────────────────────────────
      // Deletes a task from the server, then refetches.
      deleteTask: async (taskId) => {
        get().resetForNewDayIfNeeded();

        try {
          const token = await getToken();
          const res = await fetch(`${API_URL}/tasks/${taskId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (res.ok) {
            // Cancel notification for the deleted task
            await TaskNotificationService.cancelTask(taskId);

            await get().fetchTasks(true);

            return { ok: true };
          } else {
            const err = await res.json().catch(() => null);
            return {
              ok: false,
              error: err?.message ?? `Server error ${res.status}`,
            };
          }
        } catch {
          return { ok: false, error: "Connection error." };
        }
      },

      // ── onLoginSuccess (Point 1) ────────────────────────────────────────────
      // Call this from your login screen / auth success handler:
      //   await useTaskStore.getState().onLoginSuccess(user.name);
      onLoginSuccess: async (userName) => {
        get().resetForNewDayIfNeeded();
        // Any recurring tasks due while the user was away are generated by
        // the backend scheduler automatically — simply pull fresh tasks so
        // the UI is up to date immediately rather than waiting for the next
        // screen mount. The progress sync subscription below picks up the
        // resulting lastFetchedAt change and refreshes progress too.
        await get().fetchTasks(true);

        await TaskNotificationService.syncTasks();
      },

      // ── onLogout ─────────────────────────────────────────────────────────────
      // Call this from your logout button / settings screen, e.g.:
      //   await useTaskStore.getState().onLogout();
      //   navigation.replace("Login");
      //
      // Clears the auth token and resets in-memory + persisted task state so
      // the next login starts completely clean.
      onLogout: async () => {
        await TaskNotificationService.cancelAll();

        try {
          await AsyncStorage.removeItem("token");
        } catch (e) {
          console.warn("[TaskStore] Failed to remove token on logout:", e);
        }

        set({
          tasks: [],
          lastFetchedAt: null,
          loading: false,
          error: null,
          storedDay: null,
        });

        // Logout clears/wipes progress rather than re-fetching it, so this
        // is called explicitly instead of relying on the subscription
        // below (which only fires on a *populated* lastFetchedAt).
        await useProgressStore.getState().onLogout();
      },
    }),
    {
      name: "task-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist data — not transient UI state
      partialize: (state) => ({
        tasks: state.tasks,
        lastFetchedAt: state.lastFetchedAt,
        storedDay: state.storedDay,
      }),
      // Runs once, right after the persisted state is loaded from disk.
      // Enforces the "fresh start every new day" rule (Point 5) even before
      // any fetch happens, e.g. on cold app start.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const today = getTodayDateString();
        if (state.storedDay !== today) {
          console.log(
            `[TaskStore] Rehydrated with stale day "${state.storedDay}" — resetting to "${today}".`
          );
          state.tasks = [];
          state.lastFetchedAt = null;
          state.storedDay = today;
        }
      },
    }
  )
);

// -----------------------------------------------------------------------------
// Task ↔ Progress Sync
// -----------------------------------------------------------------------------
// Single source of truth for keeping progress.ts in sync with task.ts.
//
// Every successful mutation in this file (markComplete, updateTask, addTask,
// deleteTask, onLoginSuccess, and the automatic day-boundary reset) ends by
// calling fetchTasks(true), which — on success — sets a new `lastFetchedAt`
// timestamp. Rather than remembering to manually call
// `useProgressStore.getState().invalidate()` at the end of every action
// (easy to forget, easy to duplicate), we subscribe once here: any time
// `lastFetchedAt` changes to a non-null value, we know the task list was
// just refreshed from the database, so we tell the progress store to
// invalidate its cache and re-fetch daily/weekly/monthly progress from the
// database as well.
//
// This guarantees: "if something changes in task.ts, it directly affects
// progress" — without relying on every call site remembering to do it.
// -----------------------------------------------------------------------------

useTaskStore.subscribe((state, prevState) => {
  const tasksRefreshed =
    state.lastFetchedAt !== prevState.lastFetchedAt &&
    state.lastFetchedAt !== null;

  if (tasksRefreshed) {
    console.log(
      "[TaskStore] Tasks changed — invalidating progress store to re-sync with database"
    );
    useProgressStore.getState().invalidate();
  }
});