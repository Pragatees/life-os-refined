// src/types/goal.ts

import { Priority } from "./task";

/**
 * Goal returned by the backend.
 */
export interface Goal {
  /** Unique goal identifier */
  id: string;

  /** Goal title */
  goalName: string;

  /** Goal description */
  description: string;

  /** Target completion date (yyyy-MM-dd) */
  targetDate: string;

  /** Completion status */
  completed: boolean;

  /** Goal priority */
  priority: Priority;
}

/**
 * Payload for creating a goal.
 */
export interface CreateGoalRequest {
  goalName: string;
  description: string;
  targetDate: string;
  priority: Priority;
}

/**
 * Payload for updating a goal.
 */
export interface UpdateGoalRequest {
  goalName: string;
  description: string;
  targetDate: string;
  priority: Priority;
}