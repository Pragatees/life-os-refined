interface Goal {
  id: string;
  goalName: string;
  description: string;
  targetDate: string;
  completed: boolean;
  priority: "HIGH" | "MEDIUM" | "LOW";
}