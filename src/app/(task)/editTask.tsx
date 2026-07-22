// components/EditTask.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  FlatList,
  RefreshControl,
  Modal,
  ViewStyle,
  TextStyle,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Import the shared store ──────────────────────────────────────────────────
// RepeatType is now a shared type (see store/task.ts / types/task.ts) so both
// AddTask and EditTask stay in sync with the backend's Master Task enum:
// NEVER | DAILY | WEEKLY | MONTHLY | YEARLY.
import { useTaskStore, Task, Priority, RepeatType } from "../../store/task";

// ─── Theme Tokens (Claymorphism — matches AddTask) ─────────────────────────
type ThemeTokens = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  accentGradient: readonly [string, string];
  textPrimary: string;
  textSecondary: string;
  border: string;
  priorityHigh: string;
  priorityMed: string;
  priorityLow: string;
  success: string;
  warning: string;
  danger: string;
  shadowDark: string;
};

const DARK: ThemeTokens = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  accentGradient: ["#FF8A3D", "#FFB25E"],
  textPrimary: "#F5F5F4",
  textSecondary: "#9B9B9F",
  border: "#28282C",
  priorityHigh: "#FF6B5B",
  priorityMed: "#FFC24B",
  priorityLow: "#3DD68C",
  success: "#3DD68C",
  warning: "#FFC24B",
  danger: "#FF6B5B",
  shadowDark: "#000000",
};

const BRIGHT: ThemeTokens = {
  bg: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceAlt: "#EDEDEF",
  accent: "#FF7A2F",
  accentGradient: ["#FF8A3D", "#FF6B1F"],
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  priorityHigh: "#EF5A4C",
  priorityMed: "#F0A93B",
  priorityLow: "#22B573",
  success: "#22B573",
  warning: "#F0A93B",
  danger: "#EF5A4C",
  shadowDark: "#B9B9C0",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type PickerMode = "date" | "time" | null;
type ThemeType  = "bright" | "dark";

export interface EditTaskProps {
  onTaskChanged?: () => void;
  theme?: ThemeType;
}

const PRIORITY_CONFIG: Record<Priority, { label: string; icon: keyof typeof Ionicons.glyphMap; colorKey: "priorityHigh" | "priorityMed" | "priorityLow" }> = {
  HIGH:   { label: "High",   icon: "flame-outline",        colorKey: "priorityHigh" },
  MEDIUM: { label: "Medium", icon: "alert-circle-outline", colorKey: "priorityMed" },
  LOW:    { label: "Low",    icon: "leaf-outline",         colorKey: "priorityLow" },
};
const PRIORITY_OPTIONS: Priority[] = ["HIGH", "MEDIUM", "LOW"];

// Backend-owned recurrence options (Master Task Architecture). The frontend
// only collects the choice and forwards it — no local recurrence generation.
const REPEAT_CONFIG: Record<RepeatType, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  NEVER:   { label: "Never",   icon: "close-circle-outline" },
  DAILY:   { label: "Daily",   icon: "sunny-outline" },
  WEEKLY:  { label: "Weekly",  icon: "calendar-outline" },
  MONTHLY: { label: "Monthly", icon: "calendar-number-outline" },
  YEARLY:  { label: "Yearly",  icon: "repeat-outline" },
};
const REPEAT_OPTIONS: RepeatType[] = ["NEVER", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

// ─── API config ─────────────────────────────────────────────────────────────
// TODO: point this at the same host your store/task.ts uses for fetchTasks /
// markComplete / updateTask, so this component doesn't drift from the rest
// of the app's API layer.
const API_BASE_URL = `${process.env.EXPO_PUBLIC_API_URL}/api/tasks`;
// TODO: match whichever key your auth flow already uses to persist the JWT.

type ApiResult = { ok: boolean; error?: string };

// Local delete implementation for:
//   DELETE /{taskId}  ->  ResponseEntity<MessageResponse>
// This lives here (rather than in the store) because `deleteTask` isn't on
// the store yet. If/when it's added to store/task.ts, this function can be
// removed and swapped back for `useTaskStore((s) => s.deleteTask)`.
async function deleteTaskRequest(taskId: string): Promise<ApiResult> {
  try {
    const accessToken = await AsyncStorage.getItem("token");

    const response = await fetch(`${API_BASE_URL}/${taskId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

    if (!response.ok) {
      let message = `Delete failed (status ${response.status})`;
      try {
        const body = await response.json();
        if (body?.message) message = body.message;
      } catch {
        // Response wasn't JSON — fall back to the generic message above.
      }
      return { ok: false, error: message };
    }

    // Backend returns MessageResponse on success (e.g. { message: "Task deleted successfully" }).
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error while deleting task." };
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtTimeDisplay(s: string): string {
  const [h, m] = s.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return s;
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
}
function fmtDateDisplay(s: string): string {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDateDB(d: Date): string { return d.toISOString().split("T")[0]; }
function fmtTimeDB(d: Date): string {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
function parseTimeToDate(s: string): Date {
  const [h, m] = s.split(":").map(Number);
  const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); return d;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, visible, C }: { message: string; visible: boolean; C: ThemeTokens }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      const t = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim,  { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 16, duration: 200, useNativeDriver: true }),
        ]).start();
      }, 2400);
      return () => clearTimeout(t);
    }
  }, [visible, message, fadeAnim, slideAnim]);

  if (!visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        ts.wrap,
        { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Text style={[ts.text, { color: C.textPrimary }]}>{message}</Text>
    </Animated.View>
  );
}
const ts = StyleSheet.create({
  wrap: {
    position: "absolute", bottom: 20, left: 18, right: 18, borderWidth: 1, borderRadius: 18,
    paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", zIndex: 99,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6,
  } as ViewStyle,
  text: { fontSize: 13, fontWeight: "600", textAlign: "center" } as TextStyle,
});

// ─── Action Dropdown ──────────────────────────────────────────────────────────
// Supports two actions: "Mark as Complete" (hidden once the task is
// already completed) and "Delete Task" (always available). Both close the
// dropdown first, then hand off to the parent's handler.
function ActionDropdown({
  visible,
  onClose,
  onComplete,
  onDelete,
  showComplete,
  C,
}: {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
  onDelete: () => void;
  showComplete: boolean;
  C: ThemeTokens;
}) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 3 }),
      ]).start();
    } else { fadeAnim.setValue(0); scaleAnim.setValue(0.92); }
  }, [visible, fadeAnim, scaleAnim]);

  if (!visible) return null;
  return (
    <>
      <TouchableOpacity style={dd.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[dd.panel, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark }, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        {showComplete && (
          <TouchableOpacity style={dd.item} activeOpacity={0.75} onPress={() => { onClose(); onComplete(); }}>
            <View style={[dd.iconWrap, { backgroundColor: `${C.success}18`, borderColor: `${C.success}33` }]}>
              <Ionicons name="checkmark-circle-outline" size={15} color={C.success} />
            </View>
            <Text style={[dd.itemText, { color: C.success }]}>Mark as Complete</Text>
          </TouchableOpacity>
        )}
        {showComplete && <View style={[dd.divider, { backgroundColor: C.border }]} />}
        <TouchableOpacity style={dd.item} activeOpacity={0.75} onPress={() => { onClose(); onDelete(); }}>
          <View style={[dd.iconWrap, { backgroundColor: `${C.danger}18`, borderColor: `${C.danger}33` }]}>
            <Ionicons name="trash-outline" size={15} color={C.danger} />
          </View>
          <Text style={[dd.itemText, { color: C.danger }]}>Delete Task</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}
const dd = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 } as ViewStyle,
  panel: {
    position: "absolute", top: 40, right: 0, zIndex: 20, borderWidth: 1, borderRadius: 16, overflow: "hidden",
    minWidth: 180, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 18, elevation: 10,
  } as ViewStyle,
  item: { flexDirection: "row", alignItems: "center", paddingHorizontal: 13, paddingVertical: 12 } as ViewStyle,
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 4 } as ViewStyle,
  iconWrap: { width: 26, height: 26, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 10 } as ViewStyle,
  itemText: { fontSize: 13, fontWeight: "700" } as TextStyle,
});

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({
  task,
  index,
  onEdit,
  onMarkComplete,
  onDelete,
  C,
}: {
  task: Task;
  index: number;
  onEdit: (t: Task) => void;
  onMarkComplete: (t: Task) => void;
  onDelete: (t: Task) => void;
  C: ThemeTokens;
}) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  const indexRef  = useRef(index);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, delay: Math.min(indexRef.current * 55, 280), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: Math.min(indexRef.current * 55, 280), useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const priorityColor = C[PRIORITY_CONFIG[task.priority].colorKey];

  return (
    <Animated.View style={[tc.wrap, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark }, task.completed && styles.faded, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {task.completed && (
        <View style={[tc.doneBanner, { backgroundColor: `${C.success}12`, borderColor: `${C.success}30` }]}>
          <Ionicons name="checkmark-circle" size={11} color={C.success} />
          <Text style={[tc.doneText, { color: C.success }]}>Completed</Text>
        </View>
      )}
      <View style={tc.topRow}>
        <View style={styles.flex1}>
          <Text style={[tc.name, { color: C.textPrimary }, task.completed && { textDecorationLine: "line-through" as const, color: C.textSecondary }]} numberOfLines={2}>
            {task.taskName}
          </Text>
          {!!task.description && (
            <Text style={[tc.desc, { color: C.textSecondary }, task.completed && styles.strikethrough]} numberOfLines={2}>
              {task.description}
            </Text>
          )}
        </View>
        {/* Three-dot menu is always visible now, so completed tasks can
            still be deleted. The "Mark as Complete" option inside the
            dropdown is hidden once the task is already completed. */}
        <View style={styles.relative}>
          <TouchableOpacity style={[tc.menuBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]} activeOpacity={0.7} onPress={() => setDropdownOpen((v) => !v)}>
            <Ionicons name="ellipsis-vertical" size={15} color={C.textSecondary} />
          </TouchableOpacity>
          <ActionDropdown
            visible={dropdownOpen}
            onClose={() => setDropdownOpen(false)}
            onComplete={() => onMarkComplete(task)}
            onDelete={() => onDelete(task)}
            showComplete={!task.completed}
            C={C}
          />
        </View>
      </View>
      <View style={tc.metaRow}>
        <View style={[tc.priorityBadge, { backgroundColor: `${priorityColor}18`, borderColor: `${priorityColor}40` }]}>
          <Ionicons name={PRIORITY_CONFIG[task.priority].icon} size={11} color={priorityColor} style={{ marginRight: 4 }} />
          <Text style={[tc.priorityText, { color: priorityColor }]}>{PRIORITY_CONFIG[task.priority].label}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={11} color={C.textSecondary} />
          <Text style={[tc.meta, { color: C.textSecondary }]}> {fmtTimeDisplay(task.taskTime)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={11} color={C.textSecondary} />
          <Text style={[tc.meta, { color: C.textSecondary }]}> {fmtDateDisplay(task.taskDate)}</Text>
        </View>
        {!!task.repeatType && task.repeatType !== "NEVER" && (
          <View style={styles.metaItem}>
            <Ionicons name={REPEAT_CONFIG[task.repeatType].icon} size={11} color={C.textSecondary} />
            <Text style={[tc.meta, { color: C.textSecondary }]}> {REPEAT_CONFIG[task.repeatType].label}</Text>
          </View>
        )}
      </View>
      {!task.completed && (
        <TouchableOpacity style={[tc.editBtn, { borderTopColor: C.border }]} onPress={() => onEdit(task)} activeOpacity={0.75}>
          <Ionicons name="pencil-outline" size={13} color={C.accent} />
          <Text style={[tc.editText, { color: C.accent }]}>Edit</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}
const tc = StyleSheet.create({
  wrap:          { borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 12, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 3 } as ViewStyle,
  doneBanner:    { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 8 } as ViewStyle,
  doneText:      { fontSize: 10, fontWeight: "700", letterSpacing: 0.3, marginLeft: 4 } as TextStyle,
  topRow:        { flexDirection: "row", alignItems: "flex-start", marginBottom: 9 } as ViewStyle,
  name:          { fontSize: 14, fontWeight: "700", marginBottom: 3, letterSpacing: -0.1, marginRight: 8 } as TextStyle,
  desc:          { fontSize: 12, lineHeight: 17, marginRight: 8 } as TextStyle,
  menuBtn:       { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" } as ViewStyle,
  metaRow:       { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 9 } as ViewStyle,
  priorityBadge: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginRight: 6, marginBottom: 4 } as ViewStyle,
  priorityText:  { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 } as TextStyle,
  meta:          { fontSize: 11, fontWeight: "500" } as TextStyle,
  editBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", borderTopWidth: 1, paddingTop: 9 } as ViewStyle,
  editText:      { fontSize: 12, fontWeight: "600", marginLeft: 5 } as TextStyle,
});

// ─── Edit Sheet ───────────────────────────────────────────────────────────────
function EditSheet({ visible, task, onClose, onSave, saving, C }: { visible: boolean; task: Task | null; onClose: () => void; onSave: (id: string, u: Omit<Task, "id" | "completed">) => void; saving: boolean; C: ThemeTokens }) {
  const [taskName,    setTaskName]    = useState("");
  const [description, setDescription] = useState("");
  const [taskDate,    setTaskDate]    = useState(new Date());
  const [taskTime,    setTaskTime]    = useState(new Date());
  const [priority,    setPriority]    = useState<Priority>("MEDIUM");
  // Recurrence is fully backend-owned (Master Task Architecture). This state
  // only reflects the user's choice — it is sent as-is to the backend, which
  // creates/updates the master task and schedules all future occurrences.
  const [repeatType,  setRepeatType]  = useState<RepeatType>("NEVER");
  const [pickerMode,  setPickerMode]  = useState<PickerMode>(null);
  // Pop-up animation (replaces the old bottom-sheet slide): fades in and
  // scales up from a slightly-shrunk state, with a light spring bounce.
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (task) {
      setTaskName(task.taskName);
      setDescription(task.description ?? "");
      const d = new Date(task.taskDate);
      setTaskDate(isNaN(d.getTime()) ? new Date() : d);
      setTaskTime(parseTimeToDate(task.taskTime));
      setPriority(task.priority);
      setRepeatType(task.repeatType ?? "NEVER");
      setPickerMode(null);
    }
  }, [task]);

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.85);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.85, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, fadeAnim, scaleAnim]);

  if (!visible || !task) return null;

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === "dismissed") { setPickerMode(null); return; }
    if (!selected) return;
    if (pickerMode === "date") setTaskDate(selected); else setTaskTime(selected);
    setPickerMode(null);
  };

  const handleSave = () => {
    if (!taskName.trim()) { Alert.alert("Missing Name", "Please enter a task name."); return; }
    onSave(task.id, {
      taskName: taskName.trim(),
      description: description.trim(),
      taskDate: fmtDateDB(taskDate),
      taskTime: fmtTimeDB(taskTime),
      priority,
      repeatType,
      recurrenceActive: task.recurrenceActive ?? false,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}>
          <TouchableOpacity style={sh.backdrop} activeOpacity={1} onPress={() => !saving && onClose()} />
        </Animated.View>
        <Animated.View
          style={[
            sh.sheet,
            { backgroundColor: C.bg, borderColor: C.border, shadowColor: C.shadowDark },
            { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <View style={sh.header}>
            <Text style={[sh.title, { color: C.textPrimary }]}>Edit Task</Text>
            <TouchableOpacity onPress={onClose} disabled={saving} style={[sh.closeBtn, { backgroundColor: C.surfaceAlt }]}>
              <Ionicons name="close" size={16} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[sh.label, { color: C.textSecondary }]}>Task Name</Text>
            <TextInput
              style={[sh.input, { backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }]}
              value={taskName}
              onChangeText={(t) => setTaskName(t.slice(0, 100))}
              placeholder="Task name"
              placeholderTextColor={C.textSecondary}
              maxLength={100}
              selectionColor={C.accent}
              cursorColor={C.accent}
            />
            <Text style={[sh.label, { color: C.textSecondary }]}>
              Description <Text style={styles.optionalLabel}>optional</Text>
            </Text>
            <TextInput
              style={[sh.input, sh.textArea, { backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Add details..."
              placeholderTextColor={C.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              selectionColor={C.accent}
              cursorColor={C.accent}
            />
            <View style={styles.row}>
              <View style={styles.flex1}>
                <Text style={[sh.label, { color: C.textSecondary }]}>Date</Text>
                <TouchableOpacity style={[sh.pickerBtn, styles.rowItemSpacer, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => setPickerMode("date")}>
                  <Ionicons name="calendar-outline" size={14} color={C.accent} style={styles.iconSpacer} />
                  <Text style={[sh.pickerText, { color: C.textPrimary }]} numberOfLines={1}>{fmtDateDisplay(fmtDateDB(taskDate))}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.flex1}>
                <Text style={[sh.label, { color: C.textSecondary }]}>Time</Text>
                <TouchableOpacity style={[sh.pickerBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => setPickerMode("time")}>
                  <Ionicons name="time-outline" size={14} color={C.accent} style={styles.iconSpacer} />
                  <Text style={[sh.pickerText, { color: C.textPrimary }]}>{fmtTimeDisplay(fmtTimeDB(taskTime))}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={[sh.label, { color: C.textSecondary }]}>Priority</Text>
            <View style={[styles.row, styles.priorityRow]}>
              {PRIORITY_OPTIONS.map((p, idx) => {
                const color  = C[PRIORITY_CONFIG[p].colorKey];
                const active = priority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPriority(p)}
                    activeOpacity={0.8}
                    style={[
                      sh.chip,
                      idx !== PRIORITY_OPTIONS.length - 1 && styles.rowItemSpacer,
                      { borderColor: active ? color : C.border, backgroundColor: active ? `${color}18` : C.surfaceAlt, flex: 1 },
                    ]}
                  >
                    <Ionicons name={PRIORITY_CONFIG[p].icon} size={13} color={active ? color : C.textSecondary} style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 12, color: active ? color : C.textSecondary, fontWeight: active ? "700" : "500" }}>{PRIORITY_CONFIG[p].label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Repeat — same chip design as AddTask. Value is forwarded to
                the backend as-is; the backend's Master Task Architecture owns
                all recurrence generation, including updating future
                occurrences when this changes. */}
            <Text style={[sh.label, { color: C.textSecondary }]}>Repeat</Text>
            <View style={sh.repeatWrap}>
              {REPEAT_OPTIONS.map((opt) => {
                const active = repeatType === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setRepeatType(opt)}
                    activeOpacity={0.8}
                    style={[
                      sh.repeatChip,
                      { borderColor: active ? C.accent : C.border, backgroundColor: active ? `${C.accent}18` : C.surfaceAlt },
                    ]}
                  >
                    <Ionicons name={REPEAT_CONFIG[opt].icon} size={13} color={active ? C.accent : C.textSecondary} style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 12, color: active ? C.accent : C.textSecondary, fontWeight: active ? "700" : "500" }}>{REPEAT_CONFIG[opt].label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.85} style={saving ? styles.btnDisabled : undefined}>
            <LinearGradient colors={C.accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sh.saveBtn}>
              {saving
                ? <ActivityIndicator color="#FFF" size="small" />
                : (<><Ionicons name="checkmark-circle-outline" size={15} color="#FFF" style={styles.iconSpacer} /><Text style={sh.saveBtnText}>Save Changes</Text></>)
              }
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
        {pickerMode !== null && (
          <DateTimePicker
            value={pickerMode === "date" ? taskDate : taskTime}
            mode={pickerMode}
            display={pickerMode === "date" ? (Platform.OS === "ios" ? "inline" : "calendar") : (Platform.OS === "ios" ? "spinner" : "clock")}
            is24Hour={false}
            onChange={onPickerChange}
          />
        )}
      </View>
    </Modal>
  );
}
const sh = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)" } as ViewStyle,
  sheet:      {
    width: "90%",
    alignSelf: "center",
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    maxHeight: "80%",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 14,
  } as ViewStyle,
  header:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 } as ViewStyle,
  title:      { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 } as TextStyle,
  closeBtn:   { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" } as ViewStyle,
  label:      { fontSize: 10, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 6 } as TextStyle,
  input:      { borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, marginBottom: 14 } as TextStyle,
  textArea:   { minHeight: 70 } as TextStyle,
  pickerBtn:  { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 11, marginBottom: 14 } as ViewStyle,
  pickerText: { fontSize: 12, fontWeight: "600", flexShrink: 1 } as TextStyle,
  chip:       { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 14, paddingVertical: 10 } as ViewStyle,
  repeatWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 } as ViewStyle,
  repeatChip: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 } as ViewStyle,
  saveBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 15, borderRadius: 18, marginTop: 4 } as ViewStyle,
  saveBtnText:{ color: "#FFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.3, marginLeft: 6 } as TextStyle,
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EditTaskComponent({ onTaskChanged, theme = "dark" }: EditTaskProps) {
  const C: ThemeTokens = theme === "bright" ? BRIGHT : DARK;

  // ── Read from the shared store ────────────────────────────────────────────
  const tasks         = useTaskStore((s: any) => s.tasks);
  const loading       = useTaskStore((s: any) => s.loading);
  const fetchTasks    = useTaskStore((s: any) => s.fetchTasks);
  const markComplete  = useTaskStore((s: any) => s.markComplete);
  const updateTask    = useTaskStore((s: any) => s.updateTask);
  // NOTE: `deleteTask` is NOT on the store yet, so it's implemented locally
  // above as `deleteTaskRequest` (calls DELETE /{taskId}). Once the store
  // grows a proper `deleteTask` action, swap `handleDelete` below back to
  // `useTaskStore((s) => s.deleteTask)` and drop the local helper.

  const [refreshing,   setRefreshing]   = useState(false);
  const [editingTask,  setEditingTask]  = useState<Task | null>(null);
  const [editVisible,  setEditVisible]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [toastMsg,     setToastMsg]     = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  // FIX: this used to be `useEffect(() => { fetchTasks(); }, [fetchTasks]);`
  // which fires on every mount of this component. Since React Navigation
  // typically unmounts/remounts screens on blur/focus, that meant every time
  // the user simply navigated back to this tab, it would hit the network
  // again once the 30s CACHE_TTL in the store had elapsed — causing a
  // visible "reload" even though nothing had actually changed.
  //
  // The task store is a single shared (and persisted) Zustand store — every
  // mutation (addTask / updateTask / deleteTask / markComplete) already calls
  // fetchTasks(true) internally and writes into the SAME `tasks` array this
  // component reads via the selector above. That means this screen already
  // re-renders automatically the instant a real change happens anywhere in
  // the app — it does not need to trigger its own fetch on every mount.
  //
  // So: only fetch here if we don't have anything to show yet (first app
  // load / cold store). Manual pull-to-refresh below still force-fetches.
  useEffect(() => {
    if (tasks.length === 0) {
      fetchTasks();
    }
  }, [fetchTasks, tasks.length]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg); setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2600);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks(true);   // force bypass cache
    setRefreshing(false);
  }, [fetchTasks]);

  const handleMarkComplete = useCallback((task: Task) => {
    Alert.alert(
      "Mark as Complete",
      `Are you sure you want to complete "${task.taskName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Complete", style: "default",
          onPress: async () => {
            const result = await markComplete(task.id);
            if (result.ok) {
              showToast("✅ Task marked as complete!");
              onTaskChanged?.();
            } else {
              Alert.alert("Failed", result.error ?? "Unknown error");
            }
          },
        },
      ]
    );
  }, [markComplete, showToast, onTaskChanged]);

  const handleDelete = useCallback((task: Task) => {
    Alert.alert(
      "Delete Task",
      `Are you sure you want to delete "${task.taskName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            setDeletingId(task.id);
            const result = await deleteTaskRequest(task.id);
            setDeletingId(null);

            if (result.ok) {
              // If the deleted task was mid-edit, close the sheet too
              if (editingTask?.id === task.id) {
                setEditVisible(false);
                setEditingTask(null);
              }
              // Store has no `deleteTask` action to mutate local state, so
              // force a refetch to bring the list in sync with the server.
              await fetchTasks(true);
              showToast("🗑️ Task deleted.");
              onTaskChanged?.();
            } else {
              Alert.alert("Delete Failed", result.error ?? "Unknown error");
            }
          },
        },
      ]
    );
  }, [fetchTasks, showToast, onTaskChanged, editingTask]);

  const openEdit  = useCallback((task: Task) => { setEditingTask(task); setEditVisible(true); }, []);
  const closeEdit = useCallback(() => { if (saving) return; setEditVisible(false); setEditingTask(null); }, [saving]);

  const saveEdit = useCallback(async (id: string, updated: Omit<Task, "id" | "completed">) => {
    setSaving(true);
    const result = await updateTask(id, updated);
    setSaving(false);

    if (result.ok) {
      setEditVisible(false);
      setEditingTask(null);
      showToast("Task updated.");
      onTaskChanged?.();
    } else {
      Alert.alert("Update Failed", result.error ?? "Unknown error");
    }
  }, [updateTask, showToast, onTaskChanged]);

  if (loading && tasks.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={[styles.headerIconWrap, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
          <Ionicons name="create-outline" size={15} color={C.accent} />
        </View>
        <View>
          <Text style={[styles.headerTitle, { color: C.textPrimary }]}>Manage Tasks</Text>
          <Text style={[styles.headerSubtitle, { color: C.textSecondary }]}>Edit, complete, or delete today's tasks</Text>
        </View>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item: Task) => item.id}
        renderItem={({ item, index }) => (
          <View>
            <TaskCard task={item} index={index} onEdit={openEdit} onMarkComplete={handleMarkComplete} onDelete={handleDelete} C={C} />
            {deletingId === item.id && (
              <View style={styles.deletingOverlay} pointerEvents="none">
                <ActivityIndicator color={C.danger} size="small" />
              </View>
            )}
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} colors={[C.accent]} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="checkmark-done-circle-outline" size={26} color={C.accent} style={styles.emptyIcon} />
            <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>No tasks today.</Text>
            <Text style={[styles.emptySubtitle, { color: C.textSecondary }]}>Plan something meaningful.</Text>
          </View>
        }
      />

      <EditSheet visible={editVisible} task={editingTask} onClose={closeEdit} onSave={saveEdit} saving={saving} C={C} />
      <Toast message={toastMsg} visible={toastVisible} C={C} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 } as ViewStyle,
  center: { flex: 1, alignItems: "center", justifyContent: "center" } as ViewStyle,
  flex1: { flex: 1 } as ViewStyle,
  relative: { position: "relative" } as ViewStyle,
  faded: { opacity: 0.48 } as ViewStyle,
  strikethrough: { textDecorationLine: "line-through" } as TextStyle,
  optionalLabel: { opacity: 0.45, fontWeight: "400", textTransform: "none" } as TextStyle,
  row: { flexDirection: "row" } as ViewStyle,
  rowItemSpacer: { marginRight: 8 } as ViewStyle,
  priorityRow: { marginBottom: 16 } as ViewStyle,
  iconSpacer: { marginRight: 6 } as TextStyle,
  btnDisabled: { opacity: 0.6 } as ViewStyle,
  metaItem: { flexDirection: "row", alignItems: "center", marginRight: 6, marginBottom: 4 } as ViewStyle,
  modalRoot: { flex: 1, justifyContent: "center", alignItems: "center" } as ViewStyle,
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10, gap: 10 } as ViewStyle,
  headerIconWrap: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" } as ViewStyle,
  headerTitle: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2 } as TextStyle,
  headerSubtitle: { fontSize: 11, marginTop: 1 } as TextStyle,
  listContent: { paddingHorizontal: 18, paddingBottom: 36, flexGrow: 1 } as ViewStyle,
  emptyWrap: { alignItems: "center", paddingVertical: 48 } as ViewStyle,
  emptyIcon: { marginBottom: 12 } as TextStyle,
  emptyTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 } as TextStyle,
  emptySubtitle: { fontSize: 12 } as TextStyle,
  deletingOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 20,
  } as ViewStyle,
});