import { useCallback, useEffect, useMemo, useState } from "react";

import { getTaskHistory } from "../services/historyService";

import {
  buildCalendarData,
  calculateDailyProgress,
  calculateMonthlyProgress,
  calculateWeeklyProgress,
  getTasksForDate,
  groupTasksByDate,
} from "../utils/historyUtils";

import { Task } from "../types/task";

interface UseTaskHistoryReturn {
  tasks: Task[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;

  fetchHistory: (start: string, end: string) => Promise<void>;
  refresh: () => Promise<void>;

  groupedTasks: Record<string, Task[]>;
  calendarData: Record<string, number>;

  getDailyTasks: (date: string) => Task[];
  getDailyProgress: (date: string) => ReturnType<typeof calculateDailyProgress>;

  getWeeklyProgress: () => ReturnType<typeof calculateWeeklyProgress>;

  getMonthlyProgress: () => ReturnType<typeof calculateMonthlyProgress>;
}

export function useTaskHistory(): UseTaskHistoryReturn {

  const [tasks, setTasks] = useState<Task[]>([]);

  const [loading, setLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [currentStart, setCurrentStart] = useState("");

  const [currentEnd, setCurrentEnd] = useState("");

  const fetchHistory = useCallback(
    async (start: string, end: string) => {

      try {

        setLoading(true);

        setError(null);

        const response = await getTaskHistory(start, end);

        setTasks(response);

        setCurrentStart(start);

        setCurrentEnd(end);

      } catch (err: any) {

        setError(err.message ?? "Something went wrong.");

      } finally {

        setLoading(false);

      }

    },
    []
  );

  const refresh = useCallback(async () => {

    if (!currentStart || !currentEnd) return;

    try {

      setRefreshing(true);

      setError(null);

      const response = await getTaskHistory(
        currentStart,
        currentEnd
      );

      setTasks(response);

    } catch (err: any) {

      setError(err.message ?? "Something went wrong.");

    } finally {

      setRefreshing(false);

    }

  }, [currentStart, currentEnd]);

  const groupedTasks = useMemo(() => {

    return groupTasksByDate(tasks);

  }, [tasks]);

  const calendarData = useMemo(() => {

    return buildCalendarData(tasks);

  }, [tasks]);

  const getDailyTasks = useCallback(

    (date: string) => {

      return getTasksForDate(tasks, date);

    },

    [tasks]

  );

  const getDailyProgress = useCallback(

    (date: string) => {

      const dayTasks =
        getTasksForDate(tasks, date);

      return calculateDailyProgress(dayTasks);

    },

    [tasks]

  );

  const getWeeklyProgress = useCallback(() => {

    return calculateWeeklyProgress(tasks);

  }, [tasks]);

  const getMonthlyProgress = useCallback(() => {

    return calculateMonthlyProgress(tasks);

  }, [tasks]);

  return {

    tasks,

    loading,

    refreshing,

    error,

    fetchHistory,

    refresh,

    groupedTasks,

    calendarData,

    getDailyTasks,

    getDailyProgress,

    getWeeklyProgress,

    getMonthlyProgress,

  };

}