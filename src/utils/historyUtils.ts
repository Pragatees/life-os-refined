import {
  CalendarData,
  DailyProgress,
  DayProgress,
  MonthlyProgress,
  Task,
  WeeklyProgress,
} from "../types/task";

/**
 * Group tasks by date.
 */
export function groupTasksByDate(
  tasks: Task[]
): Record<string, Task[]> {
  return tasks.reduce<Record<string, Task[]>>((groups, task) => {
    if (!groups[task.taskDate]) {
      groups[task.taskDate] = [];
    }

    groups[task.taskDate].push(task);

    return groups;
  }, {});
}

/**
 * Get tasks for a single date.
 */
export function getTasksForDate(
  tasks: Task[],
  date: string
): Task[] {
  return tasks.filter(task => task.taskDate === date);
}

/**
 * Calculate progress for a single day.
 */
export function calculateDailyProgress(
  tasks: Task[]
): DailyProgress {

  const total = tasks.length;

  const completed = tasks.filter(task => task.completed).length;

  const pending = total - completed;

  const percentage =
    total === 0
      ? 0
      : Math.round((completed / total) * 100);

  return {
    completed,
    pending,
    total,
    percentage,
  };
}

/**
 * Calculate progress for every day.
 */
export function calculateDailyBreakdown(
  tasks: Task[]
): DayProgress[] {

  const grouped = groupTasksByDate(tasks);

  return Object.keys(grouped)
    .sort()
    .map(date => {

      const progress =
        calculateDailyProgress(grouped[date]);

      return {
        date,
        completed: progress.completed,
        pending: progress.pending,
        total: progress.total,
        percentage: progress.percentage,
      };
    });
}

/**
 * Weekly analytics.
 */
export function calculateWeeklyProgress(
  tasks: Task[]
): WeeklyProgress {

  const dailyProgress =
    calculateDailyBreakdown(tasks);

  const totalTasks =
    tasks.length;

  const completedTasks =
    tasks.filter(task => task.completed).length;

  const pendingTasks =
    totalTasks - completedTasks;

  const averagePercentage =
    dailyProgress.length === 0
      ? 0
      : Math.round(
          dailyProgress.reduce(
            (sum, day) => sum + day.percentage,
            0
          ) / dailyProgress.length
        );

  const bestDay =
    dailyProgress.length > 0
      ? dailyProgress.reduce((a, b) =>
          a.percentage > b.percentage ? a : b
        )
      : null;

  const worstDay =
    dailyProgress.length > 0
      ? dailyProgress.reduce((a, b) =>
          a.percentage < b.percentage ? a : b
        )
      : null;

  return {
    completedTasks,
    pendingTasks,
    totalTasks,
    averagePercentage,
    bestDay,
    worstDay,
    dailyProgress,
  };
}

/**
 * Monthly analytics.
 */
export function calculateMonthlyProgress(
  tasks: Task[]
): MonthlyProgress {

  const dailyProgress =
    calculateDailyBreakdown(tasks);

  const totalTasks =
    tasks.length;

  const completedTasks =
    tasks.filter(task => task.completed).length;

  const pendingTasks =
    totalTasks - completedTasks;

  const averagePercentage =
    dailyProgress.length === 0
      ? 0
      : Math.round(
          dailyProgress.reduce(
            (sum, day) => sum + day.percentage,
            0
          ) / dailyProgress.length
        );

  return {
    completedTasks,
    pendingTasks,
    totalTasks,
    averagePercentage,
    dailyProgress,
  };
}

/**
 * Calendar progress.
 */
export function buildCalendarData(
  tasks: Task[]
): CalendarData {

  const grouped =
    groupTasksByDate(tasks);

  const calendar: CalendarData = {};

  Object.keys(grouped).forEach(date => {

    const progress =
      calculateDailyProgress(grouped[date]);

    calendar[date] = progress.percentage;

  });

  return calendar;
}