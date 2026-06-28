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
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

// ── Import the shared store ──────────────────────────────────────────────────
import { useTaskStore, Task, Priority } from "../../store/task";

// ─── Theme Tokens ─────────────────────────────────────────────────────────────
const DARK = {
  bg: "#0F172A", surface: "#1E293B", surfaceAlt: "#263348",
  accent: "#6366F1", success: "#10B981", warning: "#F59E0B", danger: "#EF4444",
  textPrimary: "#F8FAFC", textSecondary: "#94A3B8", border: "#334155",
};
const BRIGHT = {
  bg: "#F8FAFC", surface: "#FFFFFF", surfaceAlt: "#F1F5F9",
  accent: "#6366F1", success: "#10B981", warning: "#F59E0B", danger: "#EF4444",
  textPrimary: "#0F172A", textSecondary: "#64748B", border: "#E2E8F0",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type PickerMode = "date" | "time" | null;
type ThemeType  = "bright" | "dark";

export interface EditTaskProps {
  onTaskChanged?: () => void;
  theme?: ThemeType;
}

const PRIORITY_CONFIG: Record<Priority, { label: string; colorKey: "danger" | "warning" | "success" }> = {
  HIGH:   { label: "High",   colorKey: "danger" },
  MEDIUM: { label: "Medium", colorKey: "warning" },
  LOW:    { label: "Low",    colorKey: "success" },
};
const PRIORITY_OPTIONS: Priority[] = ["HIGH", "MEDIUM", "LOW"];

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
function Toast({ message, visible, C }: { message: string; visible: boolean; C: typeof DARK }) {
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
        { backgroundColor: C.surface, borderColor: C.border },
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Text style={[ts.text, { color: C.textPrimary }]}>{message}</Text>
    </Animated.View>
  );
}
const ts = StyleSheet.create({
  wrap: { position: "absolute", bottom: 20, left: 18, right: 18, borderWidth: 1, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", zIndex: 99, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  text: { fontSize: 13, fontWeight: "600", textAlign: "center" },
});

// ─── Action Dropdown ──────────────────────────────────────────────────────────
function ActionDropdown({ visible, onClose, onComplete, C }: { visible: boolean; onClose: () => void; onComplete: () => void; C: typeof DARK }) {
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
      <Animated.View style={[dd.panel, { backgroundColor: C.surface, borderColor: C.border }, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity style={dd.item} activeOpacity={0.75} onPress={() => { onClose(); onComplete(); }}>
          <View style={[dd.iconWrap, { backgroundColor: C.success + "18", borderColor: C.success + "33" }]}>
            <Ionicons name="checkmark-circle-outline" size={15} color={C.success} />
          </View>
          <Text style={[dd.itemText, { color: C.success }]}>Mark as Complete</Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}
const dd = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  panel:    { position: "absolute", top: 40, right: 0, zIndex: 20, borderWidth: 1, borderRadius: 12, overflow: "hidden", minWidth: 180, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 10 },
  item:     { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, paddingVertical: 12 },
  iconWrap: { width: 26, height: 26, borderRadius: 7, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  itemText: { fontSize: 13, fontWeight: "700" },
});

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, index, onEdit, onMarkComplete, C }: { task: Task; index: number; onEdit: (t: Task) => void; onMarkComplete: (t: Task) => void; C: typeof DARK }) {
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
    <Animated.View style={[tc.wrap, { backgroundColor: C.surface, borderColor: C.border }, task.completed && { opacity: 0.48 }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {task.completed && (
        <View style={[tc.doneBanner, { backgroundColor: C.success + "12", borderColor: C.success + "30" }]}>
          <Ionicons name="checkmark-circle" size={11} color={C.success} />
          <Text style={[tc.doneText, { color: C.success }]}>Completed</Text>
        </View>
      )}
      <View style={tc.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[tc.name, { color: C.textPrimary }, task.completed && { textDecorationLine: "line-through", color: C.textSecondary }]} numberOfLines={2}>
            {task.taskName}
          </Text>
          {!!task.description && (
            <Text style={[tc.desc, { color: C.textSecondary }, task.completed && { textDecorationLine: "line-through" }]} numberOfLines={2}>
              {task.description}
            </Text>
          )}
        </View>
        {!task.completed && (
          <View style={{ position: "relative" }}>
            <TouchableOpacity style={[tc.menuBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]} activeOpacity={0.7} onPress={() => setDropdownOpen((v) => !v)}>
              <Ionicons name="ellipsis-vertical" size={15} color={C.textSecondary} />
            </TouchableOpacity>
            <ActionDropdown visible={dropdownOpen} onClose={() => setDropdownOpen(false)} onComplete={() => onMarkComplete(task)} C={C} />
          </View>
        )}
      </View>
      <View style={tc.metaRow}>
        <View style={[tc.priorityBadge, { backgroundColor: priorityColor + "18", borderColor: priorityColor + "40" }]}>
          <View style={[tc.priorityDot, { backgroundColor: priorityColor }]} />
          <Text style={[tc.priorityText, { color: priorityColor }]}>{PRIORITY_CONFIG[task.priority].label}</Text>
        </View>
        <Text style={[tc.meta, { color: C.textSecondary }]}><Ionicons name="time-outline" size={11} /> {fmtTimeDisplay(task.taskTime)}</Text>
        <Text style={[tc.meta, { color: C.textSecondary }]}><Ionicons name="calendar-outline" size={11} /> {fmtDateDisplay(task.taskDate)}</Text>
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
  wrap:          { borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 10 },
  doneBanner:    { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 8 },
  doneText:      { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  topRow:        { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 9 },
  name:          { fontSize: 14, fontWeight: "700", marginBottom: 3, letterSpacing: -0.1 },
  desc:          { fontSize: 12, lineHeight: 17 },
  menuBtn:       { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  metaRow:       { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 9 },
  priorityBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  priorityDot:   { width: 5, height: 5, borderRadius: 3 },
  priorityText:  { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  meta:          { fontSize: 11, fontWeight: "500" },
  editBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderTopWidth: 1, paddingTop: 9 },
  editText:      { fontSize: 12, fontWeight: "600" },
});

// ─── Edit Sheet ───────────────────────────────────────────────────────────────
function EditSheet({ visible, task, onClose, onSave, saving, C }: { visible: boolean; task: Task | null; onClose: () => void; onSave: (id: string, u: Omit<Task, "id" | "completed">) => void; saving: boolean; C: typeof DARK }) {
  const [taskName,    setTaskName]    = useState("");
  const [description, setDescription] = useState("");
  const [taskDate,    setTaskDate]    = useState(new Date());
  const [taskTime,    setTaskTime]    = useState(new Date());
  const [priority,    setPriority]    = useState<Priority>("MEDIUM");
  const [pickerMode,  setPickerMode]  = useState<PickerMode>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (task) {
      setTaskName(task.taskName);
      setDescription(task.description ?? "");
      const d = new Date(task.taskDate);
      setTaskDate(isNaN(d.getTime()) ? new Date() : d);
      setTaskTime(parseTimeToDate(task.taskTime));
      setPriority(task.priority);
      setPickerMode(null);
    }
  }, [task]);

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: visible ? 0 : 300, useNativeDriver: true, speed: 18, bounciness: 2 }).start();
  }, [visible, slideAnim]);

  if (!visible || !task) return null;

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === "dismissed") { setPickerMode(null); return; }
    if (!selected) return;
    if (pickerMode === "date") setTaskDate(selected); else setTaskTime(selected);
    setPickerMode(null);
  };

  const handleSave = () => {
    if (!taskName.trim()) { Alert.alert("Missing Name", "Please enter a task name."); return; }
    onSave(task.id, { taskName: taskName.trim(), description: description.trim(), taskDate: fmtDateDB(taskDate), taskTime: fmtTimeDB(taskTime), priority });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <TouchableOpacity style={{ ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.5)" } as any} activeOpacity={1} onPress={() => !saving && onClose()} />
        <Animated.View style={[sh.sheet, { backgroundColor: C.bg, borderColor: C.border }, { transform: [{ translateY: slideAnim }] }]}>
          <View style={sh.handle} />
          <View style={sh.header}>
            <Text style={[sh.title, { color: C.textPrimary }]}>Edit Task</Text>
            <TouchableOpacity onPress={onClose} disabled={saving} style={[sh.closeBtn, { backgroundColor: C.surfaceAlt }]}>
              <Ionicons name="close" size={16} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[sh.label, { color: C.textSecondary }]}>Task Name</Text>
            <TextInput style={[sh.input, { backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }]} value={taskName} onChangeText={(t) => setTaskName(t.slice(0, 100))} placeholder="Task name" placeholderTextColor={C.textSecondary} maxLength={100} selectionColor={C.accent} />
            <Text style={[sh.label, { color: C.textSecondary }]}>Description <Text style={{ opacity: 0.45, fontWeight: "400", textTransform: "none" }}>optional</Text></Text>
            <TextInput style={[sh.input, sh.textArea, { backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }]} value={description} onChangeText={setDescription} placeholder="Add details..." placeholderTextColor={C.textSecondary} multiline numberOfLines={3} textAlignVertical="top" selectionColor={C.accent} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[sh.label, { color: C.textSecondary }]}>Date</Text>
                <TouchableOpacity style={[sh.pickerBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => setPickerMode("date")}>
                  <Ionicons name="calendar-outline" size={14} color={C.accent} />
                  <Text style={[sh.pickerText, { color: C.textPrimary }]} numberOfLines={1}>{fmtDateDisplay(fmtDateDB(taskDate))}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[sh.label, { color: C.textSecondary }]}>Time</Text>
                <TouchableOpacity style={[sh.pickerBtn, { backgroundColor: C.surface, borderColor: C.border }]} onPress={() => setPickerMode("time")}>
                  <Ionicons name="time-outline" size={14} color={C.accent} />
                  <Text style={[sh.pickerText, { color: C.textPrimary }]}>{fmtTimeDisplay(fmtTimeDB(taskTime))}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={[sh.label, { color: C.textSecondary }]}>Priority</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {PRIORITY_OPTIONS.map((p) => {
                const color  = C[PRIORITY_CONFIG[p].colorKey];
                const active = priority === p;
                return (
                  <TouchableOpacity key={p} onPress={() => setPriority(p)} activeOpacity={0.8} style={[sh.chip, { borderColor: active ? color : C.border, backgroundColor: active ? color + "18" : C.surfaceAlt, flex: 1 }]}>
                    <View style={[sh.chipDot, { backgroundColor: color }]} />
                    <Text style={{ fontSize: 12, color: active ? color : C.textSecondary, fontWeight: active ? "700" : "500" }}>{PRIORITY_CONFIG[p].label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <TouchableOpacity style={[sh.saveBtn, { backgroundColor: C.accent }, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            {saving
              ? <ActivityIndicator color="#FFF" size="small" />
              : (<><Ionicons name="checkmark-circle-outline" size={15} color="#FFF" /><Text style={sh.saveBtnText}>Save Changes</Text></>)
            }
          </TouchableOpacity>
        </Animated.View>
        {pickerMode !== null && (
          <DateTimePicker value={pickerMode === "date" ? taskDate : taskTime} mode={pickerMode} display={pickerMode === "date" ? (Platform.OS === "ios" ? "inline" : "calendar") : (Platform.OS === "ios" ? "spinner" : "clock")} is24Hour={false} onChange={onPickerChange} />
        )}
      </View>
    </Modal>
  );
}
const sh = StyleSheet.create({
  sheet:      { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: Platform.OS === "ios" ? 34 : 20, maxHeight: "88%" },
  handle:     { width: 34, height: 4, borderRadius: 2, backgroundColor: "#334155", alignSelf: "center", marginBottom: 14 },
  header:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title:      { fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  closeBtn:   { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  label:      { fontSize: 10, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 6 },
  input:      { borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, marginBottom: 14 },
  textArea:   { minHeight: 70 },
  pickerBtn:  { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 11, marginBottom: 14 },
  pickerText: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  chip:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
  chipDot:    { width: 5, height: 5, borderRadius: 3 },
  saveBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 13, marginTop: 4 },
  saveBtnText:{ color: "#FFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
});

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EditTaskComponent({ onTaskChanged, theme = "dark" }: EditTaskProps) {
  const C = theme === "bright" ? BRIGHT : DARK;

  // ── Read from the shared store ────────────────────────────────────────────
  const tasks       = useTaskStore((s: any) => s.tasks);
  const loading     = useTaskStore((s: any) => s.loading);
  const fetchTasks  = useTaskStore((s: any) => s.fetchTasks);
  const invalidate  = useTaskStore((s: any) => s.invalidate);
  const markComplete = useTaskStore((s: any) => s.markComplete);
  const updateTask  = useTaskStore((s: any) => s.updateTask);

  const [refreshing,  setRefreshing]  = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editVisible, setEditVisible] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [toastMsg,    setToastMsg]    = useState("");
  const [toastVisible,setToastVisible]= useState(false);

  // Fetch once on mount — store's cache guard prevents duplicate calls
  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: C.accent + "18", borderWidth: 1, borderColor: C.accent + "33", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="create-outline" size={15} color={C.accent} />
        </View>
        <View>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.textPrimary, letterSpacing: -0.2 }}>Manage Tasks</Text>
          <Text style={{ fontSize: 11, color: C.textSecondary }}>Edit or complete today's tasks</Text>
        </View>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TaskCard task={item} index={index} onEdit={openEdit} onMarkComplete={handleMarkComplete} C={C} />
        )}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 36, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} colors={[C.accent]} />}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <Ionicons name="checkmark-done-circle-outline" size={26} color={C.accent} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: C.textPrimary, marginBottom: 4 }}>No tasks today.</Text>
            <Text style={{ fontSize: 12, color: C.textSecondary }}>Plan something meaningful.</Text>
          </View>
        }
      />

      <EditSheet visible={editVisible} task={editingTask} onClose={closeEdit} onSave={saveEdit} saving={saving} C={C} />
      <Toast message={toastMsg} visible={toastVisible} C={C} />
    </View>
  );
}