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

export type RepeatType = "NEVER" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

const API_URL = `${process.env.EXPO_PUBLIC_API_URL}/api`;

// ─── Store Types ──────────────────────────────────────────────────────────────

interface TaskState {
  tasks: Task[];
  lastFetchedAt: number | null;
  loading: boolean;
  error: string | null;
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

/**
 * FIX: runs a TaskNotificationService call in its own isolated try/catch,
 * completely separate from whatever save/network try/catch triggered it.
 *
 * Previously, addTask/updateTask/markComplete called
 * TaskNotificationService.scheduleTask/rescheduleTask/onTaskCompleted
 * INSIDE the same try block as the API request. If the notification call
 * threw — e.g. scheduleNotificationAsync failing due to a missing
 * exact-alarm permission or a cancelByPayload timing race in a release
 * build — execution jumped to the outer catch, which returned
 * `{ ok: false, error: "Connection error." }` for a task that had ALREADY
 * been saved successfully on the server. This made local notification
 * failures look identical to failed saves, which is very likely part of
 * why task mutations "sometimes work, sometimes don't" in production.
 */
const runNotificationSideEffect = async (
  label: string,
  fn: () => Promise<void>
): Promise<void> => {
  try {
    await fn();
  } catch (notificationError) {
    console.log(
      `[TaskStore] Task saved successfully, but ${label} failed:`,
      notificationError
    );
  }
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      lastFetchedAt: null,
      loading: false,
      error: null,
      storedDay: null,

      // ── resetForNewDayIfNeeded ──────────────────────────────────────────
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
        get().resetForNewDayIfNeeded();

        const { loading, lastFetchedAt } = get();

        if (loading) return;

        const now = Date.now();
        if (
          !force &&
          lastFetchedAt !== null &&
          now - lastFetchedAt < CACHE_TTL
        )
          return;

        set({ loading: true, error: null });

        let tasks: Task[];

        try {
          const token = await getToken();
          const res = await fetch(`${API_URL}/tasks/today`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) {
            console.error("[TaskStore] Server error:", res.status);
            set({ loading: false, error: `Server error ${res.status}` });
            return;
          }

          const data = await res.json();
          tasks = sortByPriority(Array.isArray(data) ? data : []);

          set({
            tasks,
            lastFetchedAt: Date.now(),
            loading: false,
            error: null,
            storedDay: getTodayDateString(),
          });
        } catch (err) {
          console.error("[TaskStore] Network error:", err);
          set({
            loading: false,
            error: "Connection error. Unable to reach the server.",
          });
          return;
        }

        // Fetch succeeded and is committed to state — notification sync
        // failures below must never be reported as a fetch failure.
        await runNotificationSideEffect("syncing task notifications", () =>
          TaskNotificationService.syncTasks()
        );
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

        try {
          const token = await getToken();
          const res = await fetch(`${API_URL}/tasks/${taskId}/complete`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) {
            // Roll back optimistic update
            get().fetchTasks(true);
            return { ok: false, error: `Server error ${res.status}` };
          }

          // Server confirmed completion — refresh so the task list reflects
          // server state. This also updates lastFetchedAt, which triggers
          // the progress sync subscription below.
          await get().fetchTasks(true);
        } catch {
          get().fetchTasks(true);
          return { ok: false, error: "Connection error." };
        }

        // Save is confirmed at this point — a notification failure below
        // must never be reported as a "mark complete" failure.
        await runNotificationSideEffect("cancelling task notifications", () =>
          TaskNotificationService.onTaskCompleted(taskId)
        );

        return { ok: true };
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

          if (!res.ok) {
            const err = await res.json().catch(() => null);
            return {
              ok: false,
              error: err?.message ?? `Server error ${res.status}`,
            };
          }

          await get().fetchTasks(true);
        } catch {
          return { ok: false, error: "Connection error." };
        }

        // Update is confirmed and committed — reschedule notifications as a
        // side effect, isolated from the save's own error reporting.
        const updatedTask = get().tasks.find((t) => t.id === taskId);
        if (updatedTask) {
          await runNotificationSideEffect("rescheduling task notifications", () =>
            TaskNotificationService.rescheduleTask(updatedTask)
          );
        }

        return { ok: true };
      },

      // ── addTask ─────────────────────────────────────────────────────────────
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

          if (!res.ok) {
            const err = await res.json().catch(() => null);
            return {
              ok: false,
              error: err?.message ?? `Server error ${res.status}`,
            };
          }

          await get().fetchTasks(true);
        } catch {
          return { ok: false, error: "Connection error." };
        }

        // Task is already created and committed to state at this point —
        // scheduling its notification is a side effect, isolated below.
        const createdTask = get().tasks.find(
          (t) =>
            t.taskName === payload.taskName &&
            t.taskDate === payload.taskDate &&
            t.taskTime === payload.taskTime
        );
        if (createdTask) {
          await runNotificationSideEffect("scheduling task notifications", () =>
            TaskNotificationService.scheduleTask(createdTask)
          );
        }

        return { ok: true };
      },

      // ── deleteTask ─────────────────────────────────────────────────────────
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

          if (!res.ok) {
            const err = await res.json().catch(() => null);
            return {
              ok: false,
              error: err?.message ?? `Server error ${res.status}`,
            };
          }

          await get().fetchTasks(true);
        } catch {
          return { ok: false, error: "Connection error." };
        }

        // Delete is confirmed server-side — cancel local notifications as a
        // side effect, isolated from the delete's own error reporting.
        await runNotificationSideEffect("cancelling task notifications", () =>
          TaskNotificationService.cancelTask(taskId)
        );

        return { ok: true };
      },

      // ── onLoginSuccess ────────────────────────────────────────────────────
      onLoginSuccess: async (userName) => {
        get().resetForNewDayIfNeeded();
        await get().fetchTasks(true);
        // fetchTasks(true) already triggers TaskNotificationService.syncTasks()
        // internally (see fetchTasks above) — no need to call it again here.
      },

      // ── onLogout ─────────────────────────────────────────────────────────────
      onLogout: async () => {
        await runNotificationSideEffect(
          "cancelling task notifications on logout",
          () => TaskNotificationService.cancelAll()
        );

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

        await useProgressStore.getState().onLogout();
      },
    }),
    {
      name: "task-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        tasks: state.tasks,
        lastFetchedAt: state.lastFetchedAt,
        storedDay: state.storedDay,
      }),
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
// Unchanged — no bug found here. Every successful mutation ends by calling
// fetchTasks(true), which sets a new lastFetchedAt on success; this
// subscription invalidates ProgressStore whenever that happens, so progress
// always re-syncs after any task change without every call site needing to
// remember to do it manually.
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