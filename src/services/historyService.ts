import AsyncStorage from "@react-native-async-storage/async-storage";
import { Task } from "../types/task";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api";

export class HistoryServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "HistoryServiceError";
  }
}

/**
 * Fetch task history between two dates.
 *
 * Example:
 * start = "2026-07-01"
 * end   = "2026-07-31"
 */
export async function getTaskHistory(
  startDate: string,
  endDate: string
): Promise<Task[]> {
  const token = await AsyncStorage.getItem("token");

  if (!token) {
    throw new HistoryServiceError(
      "Authentication token not found. Please login again."
    );
  }

  const url =
    `${API_URL}/tasks/range?` +
    `start=${encodeURIComponent(startDate)}` +
    `&end=${encodeURIComponent(endDate)}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new HistoryServiceError(
      "Unable to connect to the server. Please check your internet connection."
    );
  }

  if (response.status === 401) {
    throw new HistoryServiceError(
      "Your session has expired. Please login again.",
      401
    );
  }

  if (response.status === 403) {
    throw new HistoryServiceError(
      "You are not authorized to access this resource.",
      403
    );
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const error = await response.json();
      if (error?.message) {
        errorMessage = error.message;
      }
    } catch {
      // Ignore JSON parsing errors
    }

    throw new HistoryServiceError(errorMessage, response.status);
  }

  const tasks: Task[] = await response.json();

  return tasks;
}