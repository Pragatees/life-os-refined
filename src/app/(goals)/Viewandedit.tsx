// app/(goals)/Viewandedit.tsx
//
// Goals "View & Edit" screen/component.
// Now using Zustand store for state management

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  RefreshControl,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useGoalStore, Goal, GoalStatus } from "@/store/goals";

// ─── Theme Tokens ────────────────────────────────────────────────────────────
const DARK = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  accentSoft: "#3A2617",
  success: "#3DD68C",
  successSoft: "#123321",
  warning: "#FFC24B",
  warningSoft: "#3A2E12",
  danger: "#FF6B5B",
  textPrimary: "#F5F5F4",
  textSecondary: "#9B9B9F",
  border: "#28282C",
  shadowDark: "#000000",
  shadowLight: "#2C2C30",
};

const BRIGHT = {
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceAlt: "#EDEDEF",
  accent: "#FF7A2F",
  accentSoft: "#FFE4CE",
  success: "#22B573",
  successSoft: "#E3F7EC",
  warning: "#F0A93B",
  warningSoft: "#FFF3DD",
  danger: "#EF5A4C",
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  shadowDark: "#B9B9C0",
  shadowLight: "#FFFFFF",
};

type Theme = "bright" | "dark";
type ModalMode = "loading" | "edit";

// Map your GoalStatus to display status
const mapStatusToDisplay = (status: GoalStatus): "completed" | "ongoing" | "upcoming" => {
  if (status === "COMPLETED") return "completed";
  if (status === "STARTED" || status === "IN_PROGRESS") return "ongoing";
  return "upcoming";
};

interface Props {
  selectedDate: string;
  refreshKey: number;
  onRefresh: () => void;
  theme: Theme;
}

const FILTERS: { id: "completed" | "ongoing" | "upcoming"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "ongoing", label: "Ongoing", icon: "time-outline" },
  { id: "completed", label: "Completed", icon: "checkmark-done-outline" },
  { id: "upcoming", label: "Upcoming", icon: "calendar-outline" },
];

const STATUS_OPTIONS: { value: GoalStatus; label: string }[] = [
  { value: "CREATED", label: "Created" },
  { value: "STARTED", label: "Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

function formatDisplayDate(iso?: string): string {
  if (!iso) return "No due date";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return iso;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateForInput(iso?: string): string {
  if (!iso) return "";
  return iso;
}

// ─── ViewAndEdit (Goals) ────────────────────────────────────────────────────
export default function ViewAndEdit({ selectedDate, refreshKey, onRefresh, theme }: Props) {
  const C = theme === "bright" ? BRIGHT : DARK;

  // ── Zustand Store ──────────────────────────────────────────────────────────
  const {
    goals,
    loading,
    error: storeError,
    fetchGoals,
    fetchGoalsByDate,
    updateGoal,
    deleteGoal,
  } = useGoalStore();

  // ── Filter tab state ──────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<"completed" | "ongoing" | "upcoming">("ongoing");

  // ── Local state for UI ──────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // ── Edit modal state ──────────────────────────────────────────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<ModalMode>("loading");
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);
  
  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [status, setStatus] = useState<GoalStatus>("CREATED");
  
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Pop-up animation state ─────────────────────────────────────────────
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const runOpenAnimation = useCallback(() => {
    scaleAnim.setValue(0.85);
    opacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, opacityAnim]);

  const runCloseAnimation = useCallback(
    (onDone: () => void) => {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0.85,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onDone();
      });
    },
    [scaleAnim, opacityAnim]
  );

  // ── Load goals from store ──────────────────────────────────────────────
  const loadGoals = useCallback(async () => {
    try {
      setLocalError(null);
      await fetchGoalsByDate(selectedDate);
    } catch (error) {
      console.error("Error loading goals:", error);
      setLocalError("Unable to load your goals. Please try again.");
    }
  }, [selectedDate, fetchGoalsByDate]);

  // ── Initial load and refresh ───────────────────────────────────────────
  useEffect(() => {
    loadGoals();
  }, [loadGoals, refreshKey, selectedDate]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchGoals(true);
      setLocalError(null);
    } catch (error) {
      console.error("Refresh error:", error);
      setLocalError("Failed to refresh goals.");
    } finally {
      setRefreshing(false);
      onRefresh?.();
    }
  }, [fetchGoals, onRefresh]);

  // ── Filter goals based on status ──────────────────────────────────────
  const filteredGoals = useMemo(() => {
    return goals.filter((g) => {
      const goalDisplayStatus = mapStatusToDisplay(g.status);
      return goalDisplayStatus === activeFilter;
    });
  }, [goals, activeFilter]);

  // ── Open the pop-up modal for a given goal ────────────────────────────
  const handleOpenGoal = (goal: Goal) => {
    setActiveGoal(goal);
    setTitle(goal.goalName);
    setDescription(goal.description || "");
    setDeadline(goal.deadline || "");
    setStatus(goal.status);
    setValidationError(null);
    setMode("edit");
    setModalVisible(true);
    runOpenAnimation();
  };

  const closeModal = () => {
    runCloseAnimation(() => {
      setModalVisible(false);
      setActiveGoal(null);
      setValidationError(null);
    });
  };

  // ── Validate form ──────────────────────────────────────────────────────
  const validateForm = (): boolean => {
    setValidationError(null);

    // Validate Goal Name
    if (!title.trim()) {
      setValidationError("Goal Name cannot be empty.");
      return false;
    }

    // Validate Deadline
    if (!deadline.trim()) {
      setValidationError("Deadline cannot be empty.");
      return false;
    }

    // Validate Deadline is not before Goal Date
    if (activeGoal && deadline && activeGoal.goalDate) {
      const deadlineDate = new Date(deadline);
      const goalDate = new Date(activeGoal.goalDate);
      
      // Reset time to midnight for fair comparison
      deadlineDate.setHours(0, 0, 0, 0);
      goalDate.setHours(0, 0, 0, 0);
      
      if (deadlineDate < goalDate) {
        setValidationError("Deadline must not be before the Goal Date.");
        return false;
      }
    }

    return true;
  };

  // ── Save edited goal using Zustand ────────────────────────────────────
  const saveGoal = async () => {
    if (!activeGoal) return;

    // Validate form
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      // Prepare payload - only send what backend expects
      const payload = {
        goalName: title.trim(),
        description: description.trim(),
        deadline: deadline,
        status: status,
      };

      const result = await updateGoal(activeGoal.id, payload);

      if (result) {
        Alert.alert("Success", "Goal updated successfully.", [
          { 
            text: "OK", 
            onPress: () => {
              closeModal();
              // Refresh the goal list
              loadGoals();
              onRefresh?.();
            }
          }
        ]);
      } else {
        Alert.alert("Error", "Failed to update goal. Please try again.");
      }
    } catch (error: any) {
      console.error("Error saving goal:", error);
      
      // Display backend error message if available
      const errorMessage = error?.response?.data?.message || 
                          error?.message || 
                          "Something went wrong. Please try again.";
      Alert.alert("Error", errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete goal using Zustand ─────────────────────────────────────────
  const handleDeleteGoal = async () => {
    if (!activeGoal) return;
    
    Alert.alert(
      "Delete Goal",
      `Are you sure you want to delete "${activeGoal.goalName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const success = await deleteGoal(activeGoal.id);
              if (success) {
                Alert.alert("Success", "Goal deleted successfully.", [
                  { 
                    text: "OK", 
                    onPress: () => {
                      closeModal();
                      loadGoals();
                      onRefresh?.();
                    }
                  }
                ]);
              } else {
                Alert.alert("Error", "Failed to delete goal.");
              }
            } catch (error: any) {
              console.error("Error deleting goal:", error);
              const errorMessage = error?.response?.data?.message || 
                                  error?.message || 
                                  "Something went wrong.";
              Alert.alert("Error", errorMessage);
            }
          },
        },
      ]
    );
  };

  // ── Mark a goal complete using Zustand ────────────────────────────────
  const markComplete = async (goal: Goal) => {
    try {
      const payload = {
        goalName: goal.goalName,
        description: goal.description || "",
        deadline: goal.deadline || "",
        status: "COMPLETED" as GoalStatus,
      };

      const result = await updateGoal(goal.id, payload);

      if (result) {
        Alert.alert("Success", "Goal marked as completed!");
        loadGoals();
        onRefresh?.();
      } else {
        Alert.alert("Error", "Failed to update goal status.");
      }
    } catch (error: any) {
      console.error("Error marking goal complete:", error);
      const errorMessage = error?.response?.data?.message || 
                          error?.message || 
                          "Something went wrong.";
      Alert.alert("Error", errorMessage);
    }
  };

  // ── Helper functions for styling ──────────────────────────────────────
  const getStatusColor = (status: GoalStatus) => {
    const displayStatus = mapStatusToDisplay(status);
    if (displayStatus === "completed") return C.success;
    if (displayStatus === "ongoing") return C.accent;
    return C.warning;
  };

  const getStatusSoft = (status: GoalStatus) => {
    const displayStatus = mapStatusToDisplay(status);
    if (displayStatus === "completed") return C.successSoft;
    if (displayStatus === "ongoing") return C.accentSoft;
    return C.warningSoft;
  };

  const getStatusLabel = (status: GoalStatus) => {
    return status.charAt(0) + status.slice(1).toLowerCase();
  };

  const getStatusColorForPicker = (statusValue: GoalStatus) => {
    switch(statusValue) {
      case "COMPLETED": return C.success;
      case "CANCELLED": return C.danger;
      case "STARTED":
      case "IN_PROGRESS": return C.accent;
      default: return C.warning;
    }
  };

  // ── Show loading state ─────────────────────────────────────────────────
  const isLoading = loading || (goals.length === 0 && !localError && !storeError);

  // ── Render Status Picker ──────────────────────────────────────────────
  const renderStatusPicker = () => (
    <View style={styles.statusPickerContainer}>
      <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
        Status
      </Text>
      <View style={styles.statusOptions}>
        {STATUS_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            onPress={() => setStatus(option.value)}
            activeOpacity={0.7}
            style={[
              styles.statusOption,
              {
                backgroundColor: status === option.value 
                  ? getStatusColorForPicker(option.value) 
                  : C.surfaceAlt,
                borderColor: status === option.value 
                  ? getStatusColorForPicker(option.value) 
                  : C.border,
                borderWidth: status === option.value ? 2 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.statusOptionText,
                {
                  color: status === option.value 
                    ? "#FFFFFF" 
                    : C.textSecondary,
                },
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      {/* ── Filter tabs ── */}
      <View style={[styles.filterRow, { backgroundColor: C.surface, borderColor: C.border }]}>
        {FILTERS.map((f) => {
          const active = activeFilter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setActiveFilter(f.id)}
              activeOpacity={0.8}
              style={[
                styles.filterTab,
                active && { backgroundColor: C.accent },
                !active && { backgroundColor: C.surfaceAlt },
              ]}
            >
              <Ionicons
                name={f.icon}
                size={15}
                color={active ? "#FFFFFF" : C.textSecondary}
              />
              <Text
                style={[
                  styles.filterLabel,
                  { color: active ? "#FFFFFF" : C.textSecondary },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Goals list ── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={[styles.loadingText, { color: C.textSecondary }]}>
            Loading your goals...
          </Text>
        </View>
      ) : (localError || storeError) && goals.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons 
            name={localError?.includes("login") ? "lock-closed-outline" : "alert-circle-outline"} 
            size={32} 
            color={C.textSecondary} 
          />
          <Text style={[styles.emptyText, { color: C.textSecondary }]}>
            {localError || storeError || "No goals found."}
          </Text>
          <TouchableOpacity
            onPress={handleRefresh}
            style={[styles.retryBtn, { backgroundColor: C.accent }]}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredGoals.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="flag-outline" size={32} color={C.textSecondary} />
          <Text style={[styles.emptyText, { color: C.textSecondary }]}>
            No {activeFilter} goals yet.
          </Text>
          <Text style={[styles.emptySubText, { color: C.textSecondary }]}>
            {goals.length > 0 
              ? `Switch to ${goals.some(g => mapStatusToDisplay(g.status) !== activeFilter) ? 'other' : 'any'} tab to see your goals`
              : 'Create your first goal to get started!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredGoals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[C.accent]}
              tintColor={C.accent}
            />
          }
          renderItem={({ item }) => {
            return (
              <TouchableOpacity
                onPress={() => handleOpenGoal(item)}
                activeOpacity={0.8}
                style={[
                  styles.goalCard,
                  { 
                    backgroundColor: C.surface, 
                    borderColor: C.border, 
                    shadowColor: C.shadowDark,
                  },
                ]}
              >
                <View style={styles.goalContent}>
                  <Text style={[styles.goalTitle, { color: C.textPrimary }]} numberOfLines={1}>
                    {item.goalName}
                  </Text>
                  {!!item.description && (
                    <Text
                      style={[styles.goalDesc, { color: C.textSecondary }]}
                      numberOfLines={2}
                    >
                      {item.description}
                    </Text>
                  )}
                  <View style={styles.goalMetaRow}>
                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: getStatusSoft(item.status) },
                      ]}
                    >
                      <Text style={[styles.statusPillText, { color: getStatusColor(item.status) }]}>
                        {getStatusLabel(item.status)}
                      </Text>
                    </View>
                    <Text style={[styles.dueDateText, { color: C.textSecondary }]}>
                      <Ionicons name="calendar-outline" size={12} color={C.textSecondary} /> 
                      {formatDisplayDate(item.deadline)}
                    </Text>
                  </View>
                </View>

                {item.status !== "COMPLETED" && (
                  <TouchableOpacity
                    onPress={() => markComplete(item)}
                    activeOpacity={0.75}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={[styles.completeBtn, { backgroundColor: C.successSoft }]}
                  >
                    <Ionicons name="checkmark" size={20} color={C.success} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── Edit modal: centered pop-up ── */}
      <Modal 
        visible={modalVisible} 
        transparent 
        animationType="fade" 
        onRequestClose={closeModal}
      >
        <TouchableWithoutFeedback onPress={closeModal}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <Animated.View
                style={[
                  styles.sheet,
                  {
                    backgroundColor: C.surface,
                    borderColor: C.border,
                    opacity: opacityAnim,
                    transform: [{ scale: scaleAnim }],
                  },
                ]}
              >
                <ScrollView 
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.modalScrollContent}
                >
                  <View style={styles.headerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.eyebrow, { color: C.accent }]}>Edit Goal</Text>
                      <Text style={[styles.dateLabel, { color: C.textPrimary }]} numberOfLines={1}>
                        {activeGoal?.goalName || "Goal"}
                      </Text>
                      {activeGoal?.goalDate && (
                        <Text style={[styles.goalDateText, { color: C.textSecondary }]}>
                          Goal Date: {formatDisplayDate(activeGoal.goalDate)}
                        </Text>
                      )}
                    </View>

                    <TouchableOpacity
                      onPress={closeModal}
                      activeOpacity={0.75}
                      style={[
                        styles.closeBtn, 
                        { 
                          backgroundColor: C.surfaceAlt, 
                          borderColor: C.border 
                        }
                      ]}
                    >
                      <Ionicons name="close" size={18} color={C.textPrimary} />
                    </TouchableOpacity>
                  </View>

                  {mode === "loading" ? (
                    <View style={styles.modalLoadingContainer}>
                      <ActivityIndicator size="large" color={C.accent} />
                    </View>
                  ) : (
                    <>
                      {/* Validation Error */}
                      {validationError && (
                        <View style={[styles.validationError, { backgroundColor: C.danger + '20' }]}>
                          <Ionicons name="alert-circle" size={20} color={C.danger} />
                          <Text style={[styles.validationErrorText, { color: C.danger }]}>
                            {validationError}
                          </Text>
                        </View>
                      )}

                      {/* Goal Name */}
                      <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                        Goal Name *
                      </Text>
                      <TextInput
                        placeholder="Enter goal title..."
                        placeholderTextColor={C.textSecondary}
                        value={title}
                        onChangeText={(text) => {
                          setTitle(text);
                          if (validationError) setValidationError(null);
                        }}
                        style={[
                          styles.inputSingle,
                          { 
                            backgroundColor: C.surfaceAlt, 
                            borderColor: validationError && !title.trim() ? C.danger : C.border,
                            color: C.textPrimary,
                          },
                        ]}
                      />

                      {/* Description */}
                      <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                        Description
                      </Text>
                      <TextInput
                        placeholder="Add more detail..."
                        placeholderTextColor={C.textSecondary}
                        multiline
                        value={description}
                        onChangeText={setDescription}
                        style={[
                          styles.input,
                          { 
                            backgroundColor: C.surfaceAlt, 
                            borderColor: C.border, 
                            color: C.textPrimary,
                          },
                        ]}
                      />

                      {/* Deadline */}
                      <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>
                        Deadline *
                      </Text>
                      <TextInput
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={C.textSecondary}
                        value={deadline}
                        onChangeText={(text) => {
                          setDeadline(text);
                          if (validationError) setValidationError(null);
                        }}
                        style={[
                          styles.inputSingle,
                          { 
                            backgroundColor: C.surfaceAlt, 
                            borderColor: validationError && !deadline.trim() ? C.danger : C.border,
                            color: C.textPrimary,
                          },
                        ]}
                      />

                      {/* Status Picker */}
                      {renderStatusPicker()}

                      {/* Action Buttons */}
                      <View style={styles.modalActions}>
                        <TouchableOpacity
                          onPress={handleDeleteGoal}
                          activeOpacity={0.85}
                          style={[
                            styles.actionBtn,
                            { 
                              flex: 0.5, 
                              backgroundColor: C.danger, 
                              opacity: saving ? 0.5 : 1,
                            },
                          ]}
                          disabled={saving}
                        >
                          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                          <Text style={[styles.actionLabel, { color: "#FFFFFF" }]}>
                            Delete
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={closeModal}
                          activeOpacity={0.85}
                          style={[
                            styles.actionBtn,
                            { 
                              flex: 0.5, 
                              backgroundColor: C.surfaceAlt, 
                              borderWidth: 1, 
                              borderColor: C.border,
                            },
                          ]}
                        >
                          <Text style={[styles.actionLabel, { color: C.textPrimary }]}>
                            Cancel
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={saveGoal}
                          disabled={saving}
                          activeOpacity={0.85}
                          style={[
                            styles.actionBtn,
                            { 
                              flex: 1, 
                              backgroundColor: C.success, 
                              opacity: saving ? 0.7 : 1,
                            },
                          ]}
                        >
                          {saving ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                              <Text style={[styles.actionLabel, { color: "#FFFFFF" }]}>
                                Save
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </ScrollView>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: 1,
    padding: 6,
    marginBottom: 14,
    gap: 6,
  },
  filterTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 13,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "700",
  },

  loadingContainer: {
    paddingVertical: 60,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "500",
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  emptySubText: {
    fontSize: 12,
    fontWeight: "400",
    textAlign: "center",
    paddingHorizontal: 30,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },

  goalCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  goalContent: {
    flex: 1,
    paddingRight: 10,
  },
  goalTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 3,
  },
  goalDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  goalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  dueDateText: {
    fontSize: 11,
    fontWeight: "600",
  },
  completeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },

  // Modal styles
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    paddingBottom: 24,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 20,
  },
  modalScrollContent: {
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  dateLabel: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  goalDateText: {
    fontSize: 12,
    marginTop: 4,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 4,
  },
  inputSingle: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    fontSize: 14,
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 100,
    padding: 14,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  modalLoadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionLabel: {
    fontWeight: "700",
    fontSize: 14,
  },
  statusPickerContainer: {
    marginBottom: 16,
  },
  statusOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  statusOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 4,
    marginBottom: 4,
  },
  statusOptionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  validationError: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  validationErrorText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});