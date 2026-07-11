// src/store/task.ts
// Install:
//   npm install zustand @react-native-async-storage/async-storage
//   npx expo install expo-notifications expo-device

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useEffect } from "react";

import { Task, Priority } from "../types/task";
import {
  rescheduleAllNotifications,
  cancelAllTaskNotifications as cancelTaskNotifications,
  cancelAllNotifications,
  getPermissionsStatus,
  getTodayDateString,
  fireLoginWelcomeNotification,
} from "../services/notificationService";

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

/**
 * Guard wrapper: only call rescheduleAllNotifications if the OS has granted
 * notification permissions. This prevents silent failures on denied/simulator.
 */
const safeScheduleNotifications = async (tasks: Task[]): Promise<void> => {
  const permitted = await getPermissionsStatus();
  if (!permitted) {
    console.log(
      "[TaskStore] Notification permission not granted — skipping scheduling."
    );
    return;
  }

  console.log(
    "[TaskStore] Passing tasks to notification scheduler:",
    tasks.map((t) => ({
      id: t.id,
      taskName: t.taskName,
      taskDate: t.taskDate,
      taskTime: t.taskTime,
      completed: t.completed,
      priority: t.priority,
    }))
  );

  rescheduleAllNotifications(tasks).catch((e) =>
    console.error("[TaskStore] Notification scheduling failed:", e)
  );
};

useEffect(() => {
  const clearOldStorage = async () => {
    await AsyncStorage.removeItem("task-storage");
    console.log("Old task storage cleared");
  };

  clearOldStorage();
}, []);

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

            await safeScheduleNotifications(tasks);
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
      markComplete: async (taskId) => {
        get().resetForNewDayIfNeeded();

        // Optimistic update
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId ? { ...t, completed: true } : t
          ),
        }));

        // Cancel this task's reminder immediately
        cancelTaskNotifications(taskId).catch((e) =>
          console.warn("[TaskStore] Failed to cancel notifications:", e)
        );

        try {
          const token = await getToken();
          const res = await fetch(`${API_URL}/tasks/${taskId}/complete`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            set({ lastFetchedAt: Date.now() });

            // Re-evaluate daily / evening / engagement notifications with the
            // updated completion state.
            await safeScheduleNotifications(get().tasks);

            // Recurring tasks (if any) are generated by the backend's
            // scheduler as part of the Master Task Architecture — completing
            // a task here never creates the next occurrence on the frontend.
            // Just refresh so the updated task list reflects server state.
            await get().fetchTasks(true);

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
      // Creates a task on the server, then refetches — which re-runs the
      // full notification logic (today-check, 30-min lead check, 15-min-before
      // reminder) described in Point 3 for the newly stored task.
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
        try {
          await fireLoginWelcomeNotification(userName);
        } catch (e) {
          console.warn("[TaskStore] Login welcome notification failed:", e);
        }
        // Any recurring tasks due while the user was away are generated by
        // the backend scheduler automatically — simply pull fresh tasks so
        // reminders are scheduled immediately rather than waiting for the
        // next screen mount.
        await get().fetchTasks(true);
      },

      // ── onLogout ─────────────────────────────────────────────────────────────
      // Call this from your logout button / settings screen, e.g.:
      //   await useTaskStore.getState().onLogout();
      //   navigation.replace("Login");
      //
      // This is the fix for "notifications still arrive after logout": it
      // cancels every OS-armed notification (recurring + per-task) AND wipes
      // the entire notif_* ledger via cancelAllNotifications(), then clears
      // the auth token and resets in-memory + persisted task state so the
      // next login starts completely clean.
      onLogout: async () => {
        try {
          await cancelAllNotifications();
        } catch (e) {
          console.warn(
            "[TaskStore] Failed to cancel notifications on logout:",
            e
          );
        }

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