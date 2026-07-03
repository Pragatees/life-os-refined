// src/types/task.ts
// ─── Shared Task Types ────────────────────────────────────────────────────────
// Single source of truth for the Task interface. Import this everywhere.

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface Task {
  id: string;
  taskName: string;
  description: string;
  taskDate: string; // format: "yyyy-MM-dd"
  taskTime: string; // format: "HH:mm" — the task's scheduled time
  priority: Priority;
  completed: boolean;
}