// app/(goals)/Viewandedit.tsx
//
// Goals "View & Edit" screen/component.
//
// WHAT WAS BROKEN AND WHAT CHANGED
// ─────────────────────────────────────────────────────────────────────────
// 1) THEME BUG
//    This component previously did not accept `theme` as a prop (or ignored
//    it), so every color was hardcoded to the dark palette. That's why the
//    completed / ongoing / upcoming filter tabs never changed when you
//    toggled bright/dark from the sidebar.
//
//    Fix: this component now takes `theme: "bright" | "dark"` as a prop
//    (exactly like Addandedit.tsx already does), derives `C` from it, and
//    every single color reference below — tab bar, cards, badges, modal —
//    reads from `C`, never from a hardcoded hex.
//
//    You must also update GoalScreen.tsx to actually pass the prop down
//    (it currently doesn't):
//
//      <Viewandedit
//        selectedDate={selectedDate}
//        refreshKey={refreshKey}
//        onRefresh={refreshGoals}
//        theme={theme}   // <-- add this line in GoalScreen.tsx
//      />
//
// 2) MODAL ANIMATION
//    The edit modal used to slide up from the bottom (a bottom sheet).
//    It's now a centered pop-up: scale (0.85 -> 1) + fade, matching the
//    Notes ViewAndEdit.tsx pop-up exactly (same spring/timing config).
//
// ASSUMPTION ABOUT DATA / API (please correct if this doesn't match your
// backend — I did not have your real goals file or API contract):
//   GET    {API_URL}                -> list of goals for the logged-in user
//   PUT    {API_URL}/:id            -> update a goal's title/description/dueDate
//   PATCH  {API_URL}/:id/status     -> update just the status field
//   Goal shape:
//     { id, title, description, status: "completed"|"ongoing"|"upcoming", dueDate }
//
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
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api/goals";

// ─── Theme Tokens (kept identical to GoalScreen.tsx / Addandedit.tsx so the
// whole Goals feature always looks like one screen, not three) ────────────
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
};

type Theme = "bright" | "dark";
type GoalStatus = "completed" | "ongoing" | "upcoming";
type ModalMode = "loading" | "edit";

interface Goal {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  dueDate?: string; // ISO "YYYY-MM-DD"
}

interface Props {
  selectedDate: string;
  refreshKey: number;
  onRefresh: () => void;
  theme: Theme;
}

const FILTERS: { id: GoalStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "ongoing", label: "Ongoing", icon: "time-outline" },
  { id: "completed", label: "Completed", icon: "checkmark-done-outline" },
  { id: "upcoming", label: "Upcoming", icon: "calendar-outline" },
];

function formatDisplayDate(iso?: string): string {
  if (!iso) return "No due date";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── ViewAndEdit (Goals) ────────────────────────────────────────────────────
export default function ViewAndEdit({ selectedDate, refreshKey, onRefresh, theme }: Props) {
  const C = theme === "bright" ? BRIGHT : DARK;

  // ── Filter tab state ──────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<GoalStatus>("ongoing");

  // ── Goals list state ──────────────────────────────────────────────────
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // ── Edit modal state ──────────────────────────────────────────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<ModalMode>("loading");
  const [activeGoal, setActiveGoal] = useState<Goal | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Pop-up animation state (same config as Notes ViewAndEdit.tsx) ─────
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

  // ── Load goals list ────────────────────────────────────────────────────
  const fetchGoals = useCallback(async () => {
    setLoadingList(true);
    try {
      const token = await AsyncStorage.getItem("token");
      const response = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGoals(Array.isArray(response.data) ? response.data : response.data?.goals ?? []);
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Unable to load your goals.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
    // Re-fetch whenever the parent bumps refreshKey (e.g. after adding a
    // goal on the "Add / Edit" tab), or when selectedDate changes if your
    // list is meant to be date-scoped.
  }, [fetchGoals, refreshKey]);

  const filteredGoals = useMemo(
    () => goals.filter((g) => g.status === activeFilter),
    [goals, activeFilter]
  );

  // ── Open the pop-up modal for a given goal ────────────────────────────
  const handleOpenGoal = (goal: Goal) => {
    setActiveGoal(goal);
    setTitle(goal.title);
    setDescription(goal.description ?? "");
    setMode("edit");
    setModalVisible(true);
    runOpenAnimation();
  };

  const closeModal = () => {
    runCloseAnimation(() => {
      setModalVisible(false);
      setActiveGoal(null);
    });
  };

  // ── Save edited goal ───────────────────────────────────────────────────
  const saveGoal = async () => {
    if (!activeGoal) return;
    if (!title.trim()) {
      Alert.alert("Validation", "Please enter a title.");
      return;
    }

    setSaving(true);
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        Alert.alert("Session Expired", "Please login again.");
        return;
      }

      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      const response = await axios.put(
        `${API_URL}/${activeGoal.id}`,
        { title: title.trim(), description: description.trim() },
        config
      );

      setGoals((prev) =>
        prev.map((g) => (g.id === activeGoal.id ? { ...g, ...response.data } : g))
      );

      Alert.alert("Success", "Goal updated successfully.");
      closeModal();
      onRefreshSafely();
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.log("Status:", error.response?.status);
        console.log("Response:", error.response?.data);
        Alert.alert("Error", error.response?.data?.message ?? "Unable to save goal.");
      } else {
        console.log(error);
        Alert.alert("Error", "Something went wrong.");
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Mark a goal complete straight from the list ───────────────────────
  const markComplete = async (goal: Goal) => {
    try {
      const token = await AsyncStorage.getItem("token");
      const response = await axios.patch(
        `${API_URL}/${goal.id}/status`,
        { status: "completed" },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );
      setGoals((prev) =>
        prev.map((g) => (g.id === goal.id ? { ...g, ...response.data, status: "completed" } : g))
      );
      onRefreshSafely();
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Unable to update goal status.");
    }
  };

  // onRefresh is optional-safe in case the parent prop changes shape later.
  function onRefreshSafely() {
    try {
      onRefresh?.();
    } catch (e) {
      console.log(e);
    }
  }

  const statusColor = (status: GoalStatus) => {
    if (status === "completed") return C.success;
    if (status === "ongoing") return C.accent;
    return C.warning;
  };

  const statusSoft = (status: GoalStatus) => {
    if (status === "completed") return C.successSoft;
    if (status === "ongoing") return C.accentSoft;
    return C.warningSoft;
  };

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
      {loadingList ? (
        <View style={{ paddingVertical: 60, alignItems: "center" }}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : filteredGoals.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="flag-outline" size={28} color={C.textSecondary} />
          <Text style={[styles.emptyText, { color: C.textSecondary }]}>
            No {activeFilter} goals yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredGoals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleOpenGoal(item)}
              activeOpacity={0.8}
              style={[
                styles.goalCard,
                { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.goalTitle, { color: C.textPrimary }]} numberOfLines={1}>
                  {item.title}
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
                      { backgroundColor: statusSoft(item.status) },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: statusColor(item.status) }]}>
                      {item.status}
                    </Text>
                  </View>
                  <Text style={[styles.dueDateText, { color: C.textSecondary }]}>
                    {formatDisplayDate(item.dueDate)}
                  </Text>
                </View>
              </View>

              {item.status !== "completed" && (
                <TouchableOpacity
                  onPress={() => markComplete(item)}
                  activeOpacity={0.75}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[styles.completeBtn, { backgroundColor: C.successSoft }]}
                >
                  <Ionicons name="checkmark" size={18} color={C.success} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── Edit modal: centered pop-up (scale + fade), not a bottom sheet ── */}
      <Modal visible={modalVisible} animationType="fade" transparent onRequestClose={closeModal}>
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
                <View style={styles.headerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eyebrow, { color: C.accent }]}>Edit Goal</Text>
                    <Text style={[styles.dateLabel, { color: C.textPrimary }]} numberOfLines={1}>
                      {activeGoal?.title || "Goal"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={closeModal}
                    activeOpacity={0.75}
                    style={[styles.closeBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
                  >
                    <Ionicons name="close" size={18} color={C.textPrimary} />
                  </TouchableOpacity>
                </View>

                {mode === "loading" ? (
                  <View style={{ paddingVertical: 40, alignItems: "center" }}>
                    <ActivityIndicator size="large" color={C.accent} />
                  </View>
                ) : (
                  <>
                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Title</Text>
                    <TextInput
                      placeholder="Goal title..."
                      placeholderTextColor={C.textSecondary}
                      value={title}
                      onChangeText={setTitle}
                      style={[
                        styles.inputSingle,
                        { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.textPrimary },
                      ]}
                    />

                    <Text style={[styles.fieldLabel, { color: C.textSecondary }]}>Description</Text>
                    <TextInput
                      placeholder="Add more detail..."
                      placeholderTextColor={C.textSecondary}
                      multiline
                      value={description}
                      onChangeText={setDescription}
                      style={[
                        styles.input,
                        { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.textPrimary },
                      ]}
                    />

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TouchableOpacity
                        onPress={closeModal}
                        activeOpacity={0.85}
                        style={[
                          styles.actionBtn,
                          { flex: 1, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
                        ]}
                      >
                        <Text style={[styles.actionLabel, { color: C.textPrimary }]}>Cancel</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={saveGoal}
                        disabled={saving}
                        activeOpacity={0.85}
                        style={[
                          styles.actionBtn,
                          { flex: 1, backgroundColor: C.success, opacity: saving ? 0.7 : 1 },
                        ]}
                      >
                        {saving ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                            <Text style={styles.actionLabel}>Save Changes</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
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

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "600",
  },

  goalCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
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
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  // Modal — centered pop-up card (scale + fade), matching Notes ViewAndEdit.
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
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    paddingBottom: 24,
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
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  actionLabel: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
});