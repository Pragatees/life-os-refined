// src/services/notificationLogger.ts
// Centralized, low-noise logging for the notification system.
// Every log line is prefixed consistently so it's easy to filter in Metro/
// device logs. Swap the console calls here for a remote logger later without
// touching any other file.

const TAG = "[Notifications]";

export const notificationLogger = {
  info: (message: string, data?: unknown) => {
    if (data !== undefined) {
      console.log(`${TAG} ${message}`, data);
    } else {
      console.log(`${TAG} ${message}`);
    }
  },
  warn: (message: string, data?: unknown) => {
    if (data !== undefined) {
      console.warn(`${TAG} ${message}`, data);
    } else {
      console.warn(`${TAG} ${message}`);
    }
  },
  error: (message: string, err?: unknown) => {
    if (err !== undefined) {
      console.error(`${TAG} ${message}`, err);
    } else {
      console.error(`${TAG} ${message}`);
    }
  },
};