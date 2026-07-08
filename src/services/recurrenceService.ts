// src/services/recurrenceService.ts
//
// Frontend-only recurring task engine.
//
// IMPORTANT: This file never touches the backend schema. It:
//   1. Stores recurrence rules locally (AsyncStorage).
//   2. Calculates the next occurrence date for daily/weekly/monthly/custom rules.
//   3. Creates new occurrences using the EXISTING Create Task API
//      (POST /api/tasks) — exactly the same endpoint AddTaskComponent uses.
//
// The backend only ever sees normal tasks. It has no idea recurrence exists.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Priority } from "../types/task";
import { RecurrenceRule, RecurrenceType } from "../types/recurrence";
import { getTodayDateString } from "./notificationService";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api";

const RECURRENCE_RULES_KEY = "recurring_rules_v1";
const TASK_RULE_INDEX_KEY = "recurring_task_index_v1";

// ─── Low-level storage ──────────────────────────────────────────────────────

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    console.warn(`[Recurrence] Failed to read "${key}":`, e);
    return fallback;
  }
}

async function writeJSON<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[Recurrence] Failed to write "${key}":`, e);
  }
}

// ─── Rule CRUD (loadRecurringRules / saveRecurringRule / removeRecurringRule) ─

export async function loadRecurringRules(): Promise<Record<string, RecurrenceRule>> {
  return readJSON<Record<string, RecurrenceRule>>(RECURRENCE_RULES_KEY, {});
}

async function saveAllRecurringRules(rules: Record<string, RecurrenceRule>): Promise<void> {
  await writeJSON(RECURRENCE_RULES_KEY, rules);
}

export async function saveRecurringRule(rule: RecurrenceRule): Promise<void> {
  const rules = await loadRecurringRules();
  rules[rule.ruleId] = rule;
  await saveAllRecurringRules(rules);
}

export async function removeRecurringRule(ruleId: string): Promise<void> {
  const rules = await loadRecurringRules();
  delete rules[ruleId];
  await saveAllRecurringRules(rules);

  // Clean up any task -> rule index entries pointing at the removed rule
  // so nothing tries to keep generating from it.
  const index = await loadTaskRuleIndex();
  const nextIndex: Record<string, string> = {};
  for (const [taskId, rid] of Object.entries(index)) {
    if (rid !== ruleId) nextIndex[taskId] = rid;
  }
  await saveTaskRuleIndex(nextIndex);
}

// ─── Task <-> Rule index ────────────────────────────────────────────────────
// Lets us go from "this task id" -> "which recurrence lineage does it belong
// to", needed on complete / edit / delete.

async function loadTaskRuleIndex(): Promise<Record<string, string>> {
  return readJSON<Record<string, string>>(TASK_RULE_INDEX_KEY, {});
}

async function saveTaskRuleIndex(index: Record<string, string>): Promise<void> {
  await writeJSON(TASK_RULE_INDEX_KEY, index);
}

export async function linkTaskToRule(taskId: string, ruleId: string): Promise<void> {
  const index = await loadTaskRuleIndex();
  index[taskId] = ruleId;
  await saveTaskRuleIndex(index);
}

export async function getRuleIdForTask(taskId: string): Promise<string | null> {
  const index = await loadTaskRuleIndex();
  return index[taskId] ?? null;
}

export async function stopRecurrenceForTask(taskId: string): Promise<void> {
  const ruleId = await getRuleIdForTask(taskId);
  if (ruleId) {
    await removeRecurringRule(ruleId);
  }
}

// ─── Creating a new rule (called right after AddTaskComponent creates the
//     first occurrence via the normal Create Task API) ─────────────────────

const generateRuleId = (): string =>
  `rule_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export interface CreateRuleParams {
  taskId: string; // id of the task that was just created normally
  type: RecurrenceType;
  intervalDays?: number;
  anchorDate: string; // YYYY-MM-DD, the date of that first task
  taskName: string;
  description: string;
  taskTime: string;
  priority: Priority;
}

export async function createRecurringRule(params: CreateRuleParams): Promise<void> {
  if (params.type === "NONE") return;

  const rule: RecurrenceRule = {
    ruleId: generateRuleId(),
    type: params.type,
    intervalDays: params.intervalDays,
    anchorDay: parseDateStr(params.anchorDate).d,
    taskName: params.taskName,
    description: params.description,
    taskTime: params.taskTime,
    priority: params.priority,
    active: true,
    lastOccurrenceDate: params.anchorDate,
    lastGeneratedTaskId: params.taskId,
    createdAt: new Date().toISOString(),
  };

  await saveRecurringRule(rule);
  await linkTaskToRule(params.taskId, rule.ruleId);
}

/** Keep a rule's template in sync when the user edits a recurring task. */
export async function updateRecurringRuleForTask(
  taskId: string,
  updates: Partial<Pick<RecurrenceRule, "taskName" | "description" | "taskTime" | "priority">>
): Promise<void> {
  const ruleId = await getRuleIdForTask(taskId);
  if (!ruleId) return;

  const rules = await loadRecurringRules();
  const rule = rules[ruleId];
  if (!rule) return;

  rules[ruleId] = { ...rule, ...updates };
  await saveAllRecurringRules(rules);
}

// ─── Date math (calculateNextOccurrence) ────────────────────────────────────

function parseDateStr(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number /* 1-12 */): number {
  return new Date(year, month, 0).getDate();
}

function addDays(dateStr: string, days: number): string {
  const { y, m, d } = parseDateStr(dateStr);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/**
 * Adds one calendar month to `dateStr`, always targeting `anchorDay`.
 * Clamps to the last valid day of the target month when the anchor day
 * doesn't exist there (e.g. 31 Jan -> 28/29 Feb -> back to 31 Mar, not 28 Mar).
 */
function addOneMonthClamped(dateStr: string, anchorDay: number): string {
  const { y, m } = parseDateStr(dateStr);
  const totalMonthIndex = (m - 1) + 1; // zero-based month + 1 month
  const newYear = y + Math.floor(totalMonthIndex / 12);
  const newMonth = (totalMonthIndex % 12) + 1;
  const maxDay = daysInMonth(newYear, newMonth);
  const day = Math.min(anchorDay, maxDay);
  return toDateStr(newYear, newMonth, day);
}

export function calculateNextOccurrence(rule: RecurrenceRule, fromDateStr: string): string {
  switch (rule.type) {
    case "DAILY":
      return addDays(fromDateStr, 1);
    case "WEEKLY":
      return addDays(fromDateStr, 7);
    case "CUSTOM":
      return addDays(fromDateStr, Math.max(1, rule.intervalDays ?? 1));
    case "MONTHLY":
      return addOneMonthClamped(fromDateStr, rule.anchorDay);
    case "NONE":
    default:
      return fromDateStr;
  }
}

// ─── Generating an occurrence via the existing Create Task API ─────────────

export async function generateRecurringTask(
  rule: RecurrenceRule,
  occurrenceDate: string
): Promise<boolean> {
  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) return false;

    const res = await fetch(`${API_URL}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        taskName: rule.taskName,
        description: rule.description,
        taskDate: occurrenceDate,
        taskTime: rule.taskTime,
        priority: rule.priority,
      }),
    });

    if (!res.ok) {
      console.warn(`[Recurrence] Failed to create occurrence for rule ${rule.ruleId}: ${res.status}`);
      return false;
    }

    const created = await res.json().catch(() => null);
    const newTaskId: string | undefined = created?.id;

    await saveRecurringRule({
      ...rule,
      lastOccurrenceDate: occurrenceDate,
      lastGeneratedTaskId: newTaskId ?? rule.lastGeneratedTaskId,
    });

    if (newTaskId) {
      await linkTaskToRule(newTaskId, rule.ruleId);
    }

    return true;
  } catch (e) {
    console.warn("[Recurrence] generateRecurringTask error:", e);
    return false;
  }
}

/**
 * Immediately generate the next occurrence for the rule a given task belongs
 * to. Used when the user completes a recurring task — we don't wait for
 * midnight, we generate right away.
 */
export async function generateNextOccurrenceForTask(taskId: string): Promise<boolean> {
  const ruleId = await getRuleIdForTask(taskId);
  if (!ruleId) return false;

  const rules = await loadRecurringRules();
  const rule = rules[ruleId];
  if (!rule || !rule.active) return false;

  const nextDate = calculateNextOccurrence(rule, rule.lastOccurrenceDate);
  return generateRecurringTask(rule, nextDate);
}

// ─── Batch processing (processRecurringTasks) ───────────────────────────────
// Called on app startup and on the midnight reset. Only ever touches
// recurrence rules — never iterates the full task list.

export async function processRecurringTasks(): Promise<{ generated: number }> {
  const today = getTodayDateString();
  const rules = await loadRecurringRules();
  let generated = 0;

  for (const rule of Object.values(rules)) {
    if (!rule.active) continue;

    // Walk forward from the last known occurrence, but only remember the
    // LATEST due date <= today. This is what prevents flooding the list
    // with every missed day if the app wasn't opened for a while — per
    // spec: "Generate today's occurrence only, not hundreds of missed tasks."
    let candidateDate: string | null = null;
    let cursor = rule.lastOccurrenceDate;
    let guard = 0; // safety cap, recurrence rules shouldn't need more than a year of steps

    while (guard < 400) {
      const next = calculateNextOccurrence(rule, cursor);
      if (next > today) break;
      candidateDate = next;
      cursor = next;
      guard++;
    }

    if (candidateDate) {
      const ok = await generateRecurringTask(rule, candidateDate);
      if (ok) generated++;
    }
  }

  return { generated };
}