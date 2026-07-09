// src/types/task.ts
// ─────────────────────────────────────────────────────────────
// Shared Task Types
// Single source of truth for all Task-related models.
// Import these interfaces throughout the application.
// ─────────────────────────────────────────────────────────────

/**
 * Available task priority levels.
 */
export type Priority = "HIGH" | "MEDIUM" | "LOW";

/**
 * Task object returned from the backend.
 */
export interface Task {
  /** Unique task identifier */
  id: string;

  /** Task title */
  taskName: string;

  /** Optional task description */
  description: string;

  /** Scheduled date (ISO: yyyy-MM-dd) */
  taskDate: string;

  /** Scheduled time (HH:mm:ss from backend) */
  taskTime: string;

  /** Task priority */
  priority: Priority;

  /** Completion status */
  completed: boolean;
}

/**
 * Daily progress summary.
 */
export interface DailyProgress {
  completed: number;
  pending: number;
  total: number;
  percentage: number;
}

/**
 * Progress information for a single day.
 */
export interface DayProgress {
  date: string;
  completed: number;
  pending: number;
  total: number;
  percentage: number;
}

/**
 * Weekly analytics.
 */
export interface WeeklyProgress {
  completedTasks: number;
  pendingTasks: number;
  totalTasks: number;
  averagePercentage: number;
  bestDay: DayProgress | null;
  worstDay: DayProgress | null;
  dailyProgress: DayProgress[];
}

/**
 * Monthly analytics.
 */
export interface MonthlyProgress {
  completedTasks: number;
  pendingTasks: number;
  totalTasks: number;
  averagePercentage: number;
  dailyProgress: DayProgress[];
}

/**
 * Calendar heatmap/progress data.
 * Example:
 * {
 *   "2026-07-01": 100,
 *   "2026-07-02": 75,
 *   "2026-07-03": 40
 * }
 */
export interface CalendarData {
  [date: string]: number;
}