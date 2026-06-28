// src/store/task.ts
// Install:
//   npm install zustand @react-native-async-storage/async-storage
//   npx expo install expo-notifications expo-device

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Task, Priority } from "../types/task";
import {
  scheduleAllNotifications,
  cancelTaskNotifications,
  getPermissionsStatus,
} from "../services/notificationService";

export type { Priority };
export type { Task };

const API_URL = "https://life-os-backend-1ozl.onrender.com/api";

// ─── Store Types ──────────────────────────────────────────────────────────────

interface TaskState {
  tasks: Task[];
  lastFetchedAt: number | null;
  loading: boolean;
  error: string | null;

  fetchTasks: (force?: boolean) => Promise<void>;
  invalidate: () => void;
  markComplete: (taskId: string) => Promise<{ ok: boolean; error?: string }>;
  updateTask: (
    taskId: string,
    payload: Omit<Task, "id" | "completed">
  ) => Promise<{ ok: boolean; error?: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CACHE_TTL = 30_000; // 30 seconds

const sortByPriority = (list: Task[]): Task[] => {
  const order: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return [...list].sort((a, b) => order[a.priority] - order[b.priority]);
};

const getToken = (): Promise<string | null> => AsyncStorage.getItem("token");

/**
 * Guard wrapper: only call scheduleAllNotifications if the OS has granted
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

  // Debug: log what shape of data we're passing to the scheduler
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

  scheduleAllNotifications(tasks).catch((e) =>
    console.error("[TaskStore] Notification scheduling failed:", e)
  );
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: [],
      lastFetchedAt: null,
      loading: false,
      error: null,

      // ── fetchTasks ─────────────────────────────────────────────────────────
      fetchTasks: async (force = false) => {
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
            });

            // ✅ Permission-guarded scheduling
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
        // Optimistic update
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId ? { ...t, completed: true } : t
          ),
        }));

        // Cancel this task's notifications immediately
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

            // Re-schedule evening notification with updated incomplete count
            await safeScheduleNotifications(get().tasks);

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
            // fetchTasks calls safeScheduleNotifications internally
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
    }),
    {
      name: "task-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist data — not transient UI state
      partialize: (state) => ({
        tasks: state.tasks,
        lastFetchedAt: state.lastFetchedAt,
      }),
    }
  )
);