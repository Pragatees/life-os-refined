// src/types/task.ts
// ─────────────────────────────────────────────────────────────
// Shared Task Types
// Single source of truth for all Task-related models.
// Mirrors the Spring Boot backend DTOs.
// ─────────────────────────────────────────────────────────────

/**
 * Available task priority levels.
 */
export type Priority = "HIGH" | "MEDIUM" | "LOW";

/**
 * Backend recurrence types.
 * Must match RepeatType.java exactly.
 */
export type RepeatType =
  | "NEVER"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "YEARLY";

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

  /** Scheduled date (yyyy-MM-dd) */
  taskDate: string;

  /** Scheduled time (HH:mm:ss) */
  taskTime: string;

  /** Task priority */
  priority: Priority;

  /** Completion status */
  completed: boolean;

  /**
   * Recurrence type.
   * NEVER means this is a normal task or a generated occurrence.
   */
  repeatType: RepeatType;

  /**
   * Whether recurrence is currently active.
   * Only meaningful for master recurring tasks.
   */
  recurrenceActive: boolean;
}

/**
 * Payload for creating a task.
 */
export interface CreateTaskRequest {
  taskName: string;
  description: string;
  taskDate: string;
  taskTime: string;
  priority: Priority;
  repeatType: RepeatType;
}

/**
 * Payload for updating a task.
 */
export interface UpdateTaskRequest {
  taskName: string;
  description: string;
  taskDate: string;
  taskTime: string;
  priority: Priority;
  repeatType: RepeatType;
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
 */
export interface CalendarData {
  [date: string]: number;
}