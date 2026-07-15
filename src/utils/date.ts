// src/utils/date.ts

// -----------------------------------------------------------------------------
// Centralized date helpers.
//
// These used to be duplicated across TaskStore, ProgressStore, and the
// notification helper (Issue 7). Import from here instead of redefining them.
//
// IMPORTANT: everything below operates on LOCAL time, not UTC. Do NOT use
// `date.toISOString()` to derive a "YYYY-MM-DD" string — it first converts to
// UTC, which silently shifts the date for anyone not at UTC+0. For example,
// a user in India (UTC+5:30) at 2026-07-13 00:10 local time has a UTC time of
// 2026-07-12T18:40:00.000Z, so `toISOString().split("T")[0]` incorrectly
// returns "2026-07-12" instead of "2026-07-13". That bug is exactly what
// caused daily/weekly/monthly progress to load the wrong day's tasks around
// midnight (Issue 1).
// -----------------------------------------------------------------------------

// =============================================================================
// Core Formatting Functions
// =============================================================================

/**
 * Formats a Date as "YYYY-MM-DD" using its LOCAL year/month/day components.
 * This ensures dates are always in the format expected by the backend.
 */
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Formats a Date as "HH:mm:ss" using LOCAL time components.
 * This ensures times are always in the format expected by the backend.
 */
export const formatTime = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

/**
 * Formats a Date as "YYYY-MM-DD'T'HH:mm:ss" using LOCAL time components.
 * This ensures datetimes are always in the format expected by the backend.
 */
export const formatDateTime = (date: Date): string => {
  return `${formatDate(date)}T${formatTime(date)}`;
};

/**
 * Parses a date string in "YYYY-MM-DD" format to a Date object.
 * Uses local time to avoid timezone shifts.
 */
export const parseDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Parses a datetime string in "YYYY-MM-DD'T'HH:mm:ss" format to a Date object.
 * Uses local time to avoid timezone shifts.
 */
export const parseDateTime = (dateTimeString: string): Date => {
  const [datePart, timePart] = dateTimeString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds);
};

// =============================================================================
// Date Range Functions (Always return "YYYY-MM-DD" format)
// =============================================================================

/**
 * Returns today's date as a "YYYY-MM-DD" string in local time. Used to detect
 * calendar-day boundaries for local caches.
 */
export const getTodayDateString = (): string => formatDate(new Date());

/**
 * Today's range: { start, end } both equal to today (local).
 * Used for fetching today's tasks.
 */
export const getTodayRange = (): { start: string; end: string } => {
  const date = formatDate(new Date());
  return { start: date, end: date };
};

/**
 * Current week's range, Monday -> Sunday (local).
 * Used for fetching weekly tasks.
 */
export const getWeekRange = (): { start: string; end: string } => {
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate Monday (start of week)
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(today);
  start.setDate(today.getDate() + diff);

  // Calculate Sunday (end of week)
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { start: formatDate(start), end: formatDate(end) };
};

/**
 * Current month's range, 1st -> last day of month (local).
 * Used for fetching monthly tasks.
 */
export const getMonthRange = (): { start: string; end: string } => {
  const today = new Date();

  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  return { start: formatDate(start), end: formatDate(end) };
};

// =============================================================================
// Date Validation Functions
// =============================================================================

/**
 * Check if a string is a valid date in "YYYY-MM-DD" format.
 * This ensures dates sent to the backend match the expected format.
 */
export const isValidDateString = (dateString: string): boolean => {
  // Check format pattern
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  // Check if it's a valid date (not 2026-13-45)
  const date = parseDate(dateString);
  if (isNaN(date.getTime())) return false;
  
  // Verify the parsed date matches the input string (prevents 2026-02-30)
  const formatted = formatDate(date);
  return formatted === dateString;
};

/**
 * Check if a string is a valid time in "HH:mm:ss" format.
 * This ensures times sent to the backend match the expected format.
 */
export const isValidTimeString = (timeString: string): boolean => {
  const regex = /^\d{2}:\d{2}:\d{2}$/;
  if (!regex.test(timeString)) return false;
  
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  return hours >= 0 && hours <= 23 && 
         minutes >= 0 && minutes <= 59 && 
         seconds >= 0 && seconds <= 59;
};

/**
 * Check if a string is a valid datetime in "YYYY-MM-DD'T'HH:mm:ss" format.
 */
export const isValidDateTimeString = (dateTimeString: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  if (!regex.test(dateTimeString)) return false;
  
  const [datePart, timePart] = dateTimeString.split('T');
  return isValidDateString(datePart) && isValidTimeString(timePart);
};

// =============================================================================
// Date Comparison Functions
// =============================================================================

/**
 * Compare two date strings in "YYYY-MM-DD" format.
 * @returns -1 if date1 < date2, 0 if equal, 1 if date1 > date2
 */
export const compareDates = (date1: string, date2: string): number => {
  if (date1 < date2) return -1;
  if (date1 > date2) return 1;
  return 0;
};

/**
 * Check if a date string is today.
 */
export const isToday = (dateString: string): boolean => {
  const today = getTodayDateString();
  return dateString === today;
};

/**
 * Check if a date string is in the past (before today).
 */
export const isPastDate = (dateString: string): boolean => {
  const today = getTodayDateString();
  return dateString < today;
};

/**
 * Check if a date string is in the future (after today).
 */
export const isFutureDate = (dateString: string): boolean => {
  const today = getTodayDateString();
  return dateString > today;
};

/**
 * Check if a date string is today or in the future.
 */
export const isTodayOrFuture = (dateString: string): boolean => {
  const today = getTodayDateString();
  return dateString >= today;
};

/**
 * Check if a date string is today or in the past.
 */
export const isTodayOrPast = (dateString: string): boolean => {
  const today = getTodayDateString();
  return dateString <= today;
};

// =============================================================================
// Date Manipulation Functions
// =============================================================================

/**
 * Add days to a date string.
 * @param dateString - Date in "YYYY-MM-DD" format
 * @param days - Number of days to add (can be negative)
 * @returns New date in "YYYY-MM-DD" format
 */
export const addDays = (dateString: string, days: number): string => {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + days);
  return formatDate(date);
};

/**
 * Add months to a date string.
 * @param dateString - Date in "YYYY-MM-DD" format
 * @param months - Number of months to add (can be negative)
 * @returns New date in "YYYY-MM-DD" format
 */
export const addMonths = (dateString: string, months: number): string => {
  const date = parseDate(dateString);
  date.setMonth(date.getMonth() + months);
  return formatDate(date);
};

/**
 * Add years to a date string.
 * @param dateString - Date in "YYYY-MM-DD" format
 * @param years - Number of years to add (can be negative)
 * @returns New date in "YYYY-MM-DD" format
 */
export const addYears = (dateString: string, years: number): string => {
  const date = parseDate(dateString);
  date.setFullYear(date.getFullYear() + years);
  return formatDate(date);
};

/**
 * Get the difference in days between two dates.
 * @param date1 - Date in "YYYY-MM-DD" format
 * @param date2 - Date in "YYYY-MM-DD" format
 * @returns Number of days difference (positive if date2 > date1)
 */
export const getDaysDifference = (date1: string, date2: string): number => {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Get the difference in months between two dates.
 * @param date1 - Date in "YYYY-MM-DD" format
 * @param date2 - Date in "YYYY-MM-DD" format
 * @returns Number of months difference
 */
export const getMonthsDifference = (date1: string, date2: string): number => {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
};

// =============================================================================
// Display Formatting Functions (UI ONLY - NOT for API calls)
// =============================================================================

/**
 * Format date for display (e.g., "Jan 13, 2026").
 * NOTE: This is for UI display only, NOT for sending to the backend.
 */
export const formatDateDisplay = (dateString: string): string => {
  const date = parseDate(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format date for display with time (e.g., "Jan 13, 2026 at 09:30").
 * NOTE: This is for UI display only, NOT for sending to the backend.
 */
export const formatDateTimeDisplay = (dateTimeString: string): string => {
  const date = parseDateTime(dateTimeString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format date for display in a compact format (e.g., "Jan 13").
 * NOTE: This is for UI display only, NOT for sending to the backend.
 */
export const formatDateCompact = (dateString: string): string => {
  const date = parseDate(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format date for display as a relative time (e.g., "Today", "Yesterday", "3 days ago").
 * NOTE: This is for UI display only, NOT for sending to the backend.
 */
export const formatDateRelative = (dateString: string): string => {
  const today = getTodayDateString();
  const daysDiff = getDaysDifference(dateString, today);
  
  if (daysDiff === 0) return 'Today';
  if (daysDiff === 1) return 'Yesterday';
  if (daysDiff === -1) return 'Tomorrow';
  if (daysDiff > 1 && daysDiff < 7) return `${daysDiff} days ago`;
  if (daysDiff < -1 && daysDiff > -7) return `${Math.abs(daysDiff)} days from now`;
  
  return formatDateDisplay(dateString);
};

// =============================================================================
// Helper Functions for API Integration
// =============================================================================

/**
 * Convert a Date object to a string in "YYYY-MM-DD" format.
 * Use this when sending dates to the backend API.
 */
export const toApiDate = (date: Date): string => formatDate(date);

/**
 * Convert a Date object to a string in "HH:mm:ss" format.
 * Use this when sending times to the backend API.
 */
export const toApiTime = (date: Date): string => formatTime(date);

/**
 * Convert a Date object to a string in "YYYY-MM-DD'T'HH:mm:ss" format.
 * Use this when sending datetimes to the backend API.
 */
export const toApiDateTime = (date: Date): string => formatDateTime(date);

/**
 * Safely convert a date string from the API to a Date object.
 * Handles both "YYYY-MM-DD" and "YYYY-MM-DD'T'HH:mm:ss" formats.
 */
export const fromApiDate = (dateString: string): Date => {
  if (dateString.includes('T')) {
    return parseDateTime(dateString);
  }
  return parseDate(dateString);
};

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a string is a valid date in "YYYY-MM-DD" format.
 */
export const isDateString = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return isValidDateString(value);
};

/**
 * Type guard to check if a string is a valid time in "HH:mm:ss" format.
 */
export const isTimeString = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return isValidTimeString(value);
};

/**
 * Type guard to check if a string is a valid datetime in "YYYY-MM-DD'T'HH:mm:ss" format.
 */
export const isDateTimeString = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  return isValidDateTimeString(value);
};

// =============================================================================
// Constants
// =============================================================================

export const DATE_FORMAT = 'YYYY-MM-DD';
export const TIME_FORMAT = 'HH:mm:ss';
export const DATETIME_FORMAT = "YYYY-MM-DD'T'HH:mm:ss";

// =============================================================================
// Export all functions for backward compatibility
// =============================================================================

export default {
  formatDate,
  formatTime,
  formatDateTime,
  parseDate,
  parseDateTime,
  getTodayDateString,
  getTodayRange,
  getWeekRange,
  getMonthRange,
  isValidDateString,
  isValidTimeString,
  isValidDateTimeString,
  compareDates,
  isToday,
  isPastDate,
  isFutureDate,
  isTodayOrFuture,
  isTodayOrPast,
  addDays,
  addMonths,
  addYears,
  getDaysDifference,
  getMonthsDifference,
  formatDateDisplay,
  formatDateTimeDisplay,
  formatDateCompact,
  formatDateRelative,
  toApiDate,
  toApiTime,
  toApiDateTime,
  fromApiDate,
  isDateString,
  isTimeString,
  isDateTimeString,
  DATE_FORMAT,
  TIME_FORMAT,
  DATETIME_FORMAT,
};