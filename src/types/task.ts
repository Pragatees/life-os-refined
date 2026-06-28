// src/types/task.ts
// ─── Shared Task Types ────────────────────────────────────────────────────────
// Single source of truth for the Task interface.
// Import this in both the Zustand store and notificationService.

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface Task {
  id: string;
  taskName: string;
  description: string;
  taskDate: string; // format: "yyyy-MM-dd"
  taskTime: string; // format: "HH:mm"
  priority: Priority;
  completed: boolean;
}