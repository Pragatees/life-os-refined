import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import GoalNotificationService from "../notifications/goal/GoalNotificationService";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api";

// ================================
// Goal Types
// ================================

export type GoalStatus =
  | "CREATED"
  | "STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface Goal {
  id: string;
  goalName: string;
  description: string;
  goalDate: string;
  deadline: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalPayload {
  goalName: string;
  description: string;
  goalDate: string;
  deadline: string;
}

export interface UpdateGoalPayload {
  goalName: string;
  description: string;
  deadline: string;
  status: GoalStatus;
}

// ================================
// Store Interface
// ================================

interface GoalState {
  goals: Goal[];
  selectedGoal: Goal | null;

  loading: boolean;
  error: string | null;

  lastFetchedAt: number | null;

  fetchGoals: (force?: boolean) => Promise<void>;

  fetchGoalById: (goalId: string) => Promise<Goal | null>;

  fetchGoalsByDate: (date: string) => Promise<Goal[]>;

  // CRUD Operations
  createGoal: (payload: CreateGoalPayload) => Promise<Goal | null>;
  updateGoal: (goalId: string, payload: UpdateGoalPayload) => Promise<Goal | null>;
  deleteGoal: (goalId: string) => Promise<boolean>;

  // Logout / cleanup
  onLogout: () => Promise<void>;
}

// ================================
// Helpers
// ================================

const CACHE_TTL = 30000;

const getToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem("token");
  } catch (error) {
    console.error("[GoalStore] Error getting token:", error);
    return null;
  }
};

const sortGoals = (goals: Goal[]): Goal[] => {
  return [...goals].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() -
      new Date(a.createdAt).getTime()
  );
};

const handleApiError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
};

// ================================
// Store
// ================================

export const useGoalStore = create<GoalState>()(
  persist(
    (set, get) => ({
      goals: [],
      selectedGoal: null,

      loading: false,
      error: null,

      lastFetchedAt: null,

      // ==========================================
      // Fetch All Goals
      // ==========================================
      fetchGoals: async (force = false) => {
        const { loading, lastFetchedAt } = get();

        if (loading) return;

        const now = Date.now();

        if (
          !force &&
          lastFetchedAt &&
          now - lastFetchedAt < CACHE_TTL
        ) {
          return;
        }

        set({
          loading: true,
          error: null,
        });

        try {
          const token = await getToken();

          if (!token) {
            throw new Error("Authentication token not found");
          }

          const response = await fetch(`${API_URL}/goals`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            throw new Error(`Server Error ${response.status}`);
          }

          const data: Goal[] = await response.json();

          set({
            goals: sortGoals(data),
            loading: false,
            error: null,
            lastFetchedAt: Date.now(),
          });

          await GoalNotificationService.syncGoals();
        } catch (error) {
          console.error("[GoalStore] Fetch Goals Error:", error);

          set({
            loading: false,
            error: handleApiError(error),
          });
        }
      },

      // ==========================================
      // Fetch Goal By Id
      // ==========================================
      fetchGoalById: async (
        goalId: string
      ): Promise<Goal | null> => {
        try {
          const token = await getToken();

          if (!token) {
            throw new Error("Authentication token not found");
          }

          const response = await fetch(
            `${API_URL}/goals/${goalId}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!response.ok) {
            throw new Error("Goal not found");
          }

          const goal: Goal = await response.json();

          set({
            selectedGoal: goal,
          });

          return goal;
        } catch (error) {
          console.error("[GoalStore] Fetch Goal Error:", error);

          set({
            error: handleApiError(error),
          });

          return null;
        }
      },

      // ==========================================
      // Fetch Goals By Date
      // ==========================================
      fetchGoalsByDate: async (
        date: string
      ): Promise<Goal[]> => {
        try {
          const token = await getToken();

          if (!token) {
            throw new Error("Authentication token not found");
          }

          const response = await fetch(
            `${API_URL}/goals/date?date=${date}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!response.ok) {
            throw new Error("Failed to fetch goals");
          }

          const goals: Goal[] = await response.json();

          return sortGoals(goals);
        } catch (error) {
          console.error(
            "[GoalStore] Fetch Goals By Date Error:",
            error
          );

          set({
            error: handleApiError(error),
          });

          return [];
        }
      },

      // ==========================================
      // Create Goal
      // ==========================================
      createGoal: async (
        payload: CreateGoalPayload
      ): Promise<Goal | null> => {
        set({ loading: true, error: null });

        try {
          const token = await getToken();

          if (!token) {
            throw new Error("Authentication token not found");
          }

          const response = await fetch(`${API_URL}/goals`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error(`Server Error ${response.status}`);
          }

          const newGoal: Goal = await response.json();

          // Update goals list
          set((state) => ({
            goals: sortGoals([...state.goals, newGoal]),
            loading: false,
            error: null,
          }));

          await GoalNotificationService.scheduleGoal(newGoal);

          return newGoal;
        } catch (error) {
          console.error("[GoalStore] Create Goal Error:", error);

          set({
            loading: false,
            error: handleApiError(error),
          });

          return null;
        }
      },

      // ==========================================
      // Update Goal
      // ==========================================
      updateGoal: async (
        goalId: string,
        payload: UpdateGoalPayload
      ): Promise<Goal | null> => {
        set({ loading: true, error: null });

        try {
          const token = await getToken();

          if (!token) {
            throw new Error("Authentication token not found");
          }

          const response = await fetch(
            `${API_URL}/goals/${goalId}`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
            }
          );

          if (!response.ok) {
            throw new Error(`Server Error ${response.status}`);
          }

          const updatedGoal: Goal = await response.json();

          // Update goals list
          set((state) => ({
            goals: sortGoals(
              state.goals.map((goal) =>
                goal.id === goalId ? updatedGoal : goal
              )
            ),
            selectedGoal:
              state.selectedGoal?.id === goalId
                ? updatedGoal
                : state.selectedGoal,
            loading: false,
            error: null,
          }));

          await GoalNotificationService.rescheduleGoal(updatedGoal);

          return updatedGoal;
        } catch (error) {
          console.error("[GoalStore] Update Goal Error:", error);

          set({
            loading: false,
            error: handleApiError(error),
          });

          return null;
        }
      },

      // ==========================================
      // Delete Goal
      // ==========================================
      deleteGoal: async (goalId: string): Promise<boolean> => {
        set({ loading: true, error: null });

        try {
          const token = await getToken();

          if (!token) {
            throw new Error("Authentication token not found");
          }

          const response = await fetch(
            `${API_URL}/goals/${goalId}`,
            {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (!response.ok) {
            throw new Error(`Server Error ${response.status}`);
          }

          // Remove goal from list
          set((state) => ({
            goals: state.goals.filter((goal) => goal.id !== goalId),
            selectedGoal:
              state.selectedGoal?.id === goalId
                ? null
                : state.selectedGoal,
            loading: false,
            error: null,
          }));

          await GoalNotificationService.onGoalDeleted(goalId);

          return true;
        } catch (error) {
          console.error("[GoalStore] Delete Goal Error:", error);

          set({
            loading: false,
            error: handleApiError(error),
          });

          return false;
        }
      },

      // ==========================================
      // Logout — clears in-memory state AND the
      // persisted "goal-storage" entry in AsyncStorage
      // ==========================================
      onLogout: async () => {
        await GoalNotificationService.cancelAll();

        try {
          await AsyncStorage.removeItem("goal-storage");
        } catch (error) {
          console.error(
            "[GoalStore] Error clearing goal storage on logout:",
            error
          );
        }

        set({
          goals: [],
          selectedGoal: null,
          loading: false,
          error: null,
          lastFetchedAt: null,
        });
      },
    }),
    {
      name: "goal-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        goals: state.goals,
        selectedGoal: state.selectedGoal,
        lastFetchedAt: state.lastFetchedAt,
      }),
    }
  )
);