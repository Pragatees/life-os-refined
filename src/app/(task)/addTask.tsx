import React, { useState, useRef, useEffect } from "react";
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
  ViewStyle,
  TextStyle,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { RecurrenceType } from "../../types/recurrence";
import { createRecurringRule } from "../../services/recurrenceService";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api";

// ─── Theme Tokens (Claymorphism) ───────────────────────────────────────────
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
  shadowDark: "#B9B9C0",
};

type Priority = "HIGH" | "MEDIUM" | "LOW";
type PickerMode = "date" | "time" | null;

export interface AddTaskProps {
  onTaskAdded?: () => void;
  theme?: "bright" | "dark";
}

const PRIORITIES: {
  value: Priority;
  label: string;
  colorKey: keyof Pick<ThemeTokens, "priorityHigh" | "priorityMed" | "priorityLow">;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: "HIGH", label: "High", colorKey: "priorityHigh", icon: "flame-outline" },
  { value: "MEDIUM", label: "Medium", colorKey: "priorityMed", icon: "alert-circle-outline" },
  { value: "LOW", label: "Low", colorKey: "priorityLow", icon: "leaf-outline" },
];

const REPEAT_OPTIONS: { value: RecurrenceType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "NONE", label: "Never", icon: "close-circle-outline" },
  { value: "DAILY", label: "Daily", icon: "sunny-outline" },
  { value: "WEEKLY", label: "Weekly", icon: "calendar-outline" },
  { value: "MONTHLY", label: "Monthly", icon: "calendar-number-outline" },
  { value: "CUSTOM", label: "Every X Days", icon: "repeat-outline" },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AddTaskComponent({ onTaskAdded, theme = "dark" }: AddTaskProps) {
  const C: ThemeTokens = theme === "bright" ? BRIGHT : DARK;

  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [loading, setLoading] = useState(false);

  // ── Recurrence (frontend-only — never sent to the backend) ────────────────
  const [repeatType, setRepeatType] = useState<RecurrenceType>("NONE");
  const [everyXDays, setEveryXDays] = useState("3");

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 360, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === "dismissed") {
      setPickerMode(null);
      return;
    }
    if (!selected) return;
    if (pickerMode === "date") {
      setSelectedDate(selected);
      if (Platform.OS === "android") setTimeout(() => setPickerMode("time"), 150);
      else setPickerMode(null);
    } else {
      setSelectedTime(selected);
      setPickerMode(null);
    }
  };

  const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const fmtTime = (t: Date) =>
    t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
  const fmtDateDB = (d: Date) => d.toISOString().split("T")[0];
  const fmtTimeDB = (t: Date) => `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}`;

  const resetForm = () => {
    setTaskName("");
    setDescription("");
    setSelectedDate(new Date());
    setSelectedTime(new Date());
    setPriority("MEDIUM");
    setRepeatType("NONE");
    setEveryXDays("3");
  };

  const handleAddTask = async () => {
    if (!taskName.trim()) {
      Alert.alert("Missing Task Name", "Please enter a task name.");
      return;
    }

    if (repeatType === "CUSTOM") {
      const parsed = parseInt(everyXDays, 10);
      if (!parsed || parsed < 1) {
        Alert.alert("Invalid Interval", "Enter how many days between repeats (1 or more).");
        return;
      }
    }

    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        Alert.alert("Session Expired", "Please login again.");
        return;
      }

      const trimmedName = taskName.trim();
      const trimmedDescription = description.trim();
      const taskDate = fmtDateDB(selectedDate);
      const taskTime = fmtTimeDB(selectedTime);

      // Existing Create Task API call — unchanged. Recurrence is never sent here.
      const response = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          taskName: trimmedName,
          description: trimmedDescription,
          taskDate,
          taskTime,
          priority,
        }),
      });

      if (response.ok) {
        // If the user picked a repeat option, save the recurrence rule locally
        // and link it to the newly created task so future occurrences can be
        // generated automatically (on complete / app start / midnight reset).
        if (repeatType !== "NONE") {
          const created = await response.json().catch(() => null);
          const newTaskId: string | undefined = created?.id;

          if (newTaskId) {
            try {
              await createRecurringRule({
                taskId: newTaskId,
                type: repeatType,
                intervalDays: repeatType === "CUSTOM" ? parseInt(everyXDays, 10) : undefined,
                anchorDate: taskDate,
                taskName: trimmedName,
                description: trimmedDescription,
                taskTime,
                priority,
              });
            } catch (e) {
              console.warn("[AddTask] Failed to save recurrence rule locally:", e);
            }
          } else {
            console.warn(
              "[AddTask] Task created but no id was returned — recurrence rule was not saved."
            );
          }
        }

        Alert.alert("Task Added", "Your task has been added successfully.");
        resetForm();
        onTaskAdded?.();
      } else {
        const err = await response.json().catch(() => null);
        Alert.alert("Failed", err?.message ?? `Server error ${response.status}`);
      }
    } catch {
      Alert.alert("Connection Error", "Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View
      style={[
        styles.flex,
        { backgroundColor: C.bg, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        {/* Section title */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconWrap, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
            <Ionicons name="sparkles-outline" size={15} color={C.accent} />
          </View>
          <View>
            <Text style={[styles.sectionTitle, { color: C.textPrimary }]}>New Task</Text>
            <Text style={[styles.sectionSubtitle, { color: C.textSecondary }]}>Plan something meaningful</Text>
          </View>
        </View>

        {/* Form Card */}
        <View style={[cardStyles.card, { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark }]}>
          {/* Task Name */}
          <Text style={[lbl.text, { color: C.textSecondary }]}>Task Name</Text>
          <TextInput
            style={[inp.base, { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.textPrimary }]}
            placeholder="What do you want to accomplish?"
            placeholderTextColor={C.textSecondary}
            value={taskName}
            onChangeText={(t) => setTaskName(t.slice(0, 100))}
            maxLength={100}
            returnKeyType="next"
            selectionColor={C.accent}
            cursorColor={C.accent}
          />
          <Text style={[styles.charCount, { color: C.textSecondary }]}>{taskName.length}/100</Text>

          {/* Description */}
          <Text style={[lbl.text, { color: C.textSecondary }]}>
            Description <Text style={styles.optionalLabel}>optional</Text>
          </Text>
          <TextInput
            style={[inp.base, inp.area, { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.textPrimary }]}
            placeholder="Add additional details..."
            placeholderTextColor={C.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            selectionColor={C.accent}
            cursorColor={C.accent}
          />

          {/* Schedule */}
          <Text style={[lbl.text, { color: C.textSecondary }]}>Schedule</Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setPickerMode("date")}
              activeOpacity={0.75}
              style={[pick.btn, styles.rowItemSpacer, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
            >
              <View style={[pick.iconWrap, { backgroundColor: C.accent + "20" }]}>
                <Ionicons name="calendar-outline" size={14} color={C.accent} />
              </View>
              <View>
                <Text style={[pick.label, { color: C.textSecondary }]}>Date</Text>
                <Text style={[pick.value, { color: C.textPrimary }]}>{fmtDate(selectedDate)}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPickerMode("time")}
              activeOpacity={0.75}
              style={[pick.btn, { backgroundColor: C.surfaceAlt, borderColor: C.border, flex: 1 }]}
            >
              <View style={[pick.iconWrap, { backgroundColor: C.accent + "20" }]}>
                <Ionicons name="time-outline" size={14} color={C.accent} />
              </View>
              <View>
                <Text style={[pick.label, { color: C.textSecondary }]}>Time</Text>
                <Text style={[pick.value, { color: C.textPrimary }]}>{fmtTime(selectedTime)}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Priority */}
          <Text style={[lbl.text, { color: C.textSecondary }]}>Priority</Text>
          <View style={[styles.row, styles.priorityRow]}>
            {PRIORITIES.map((p, idx) => {
              const color = C[p.colorKey];
              const active = priority === p.value;
              return (
                <TouchableOpacity
                  key={p.value}
                  onPress={() => setPriority(p.value)}
                  activeOpacity={0.8}
                  style={[
                    prio.chip,
                    idx !== PRIORITIES.length - 1 && styles.rowItemSpacer,
                    {
                      borderColor: active ? color : C.border,
                      backgroundColor: active ? `${color}18` : C.surfaceAlt,
                      flex: 1,
                    },
                  ]}
                >
                  <Ionicons
                    name={p.icon}
                    size={13}
                    color={active ? color : C.textSecondary}
                    style={styles.iconSpacer}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      color: active ? color : C.textSecondary,
                      fontWeight: active ? "700" : "500",
                    }}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Repeat (frontend-only recurrence — never sent to the backend) */}
          <Text style={[lbl.text, { color: C.textSecondary }]}>Repeat</Text>
          <View style={repeatStyles.wrap}>
            {REPEAT_OPTIONS.map((opt) => {
              const active = repeatType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setRepeatType(opt.value)}
                  activeOpacity={0.8}
                  style={[
                    repeatStyles.chip,
                    {
                      borderColor: active ? C.accent : C.border,
                      backgroundColor: active ? `${C.accent}18` : C.surfaceAlt,
                    },
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={13}
                    color={active ? C.accent : C.textSecondary}
                    style={styles.iconSpacer}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      color: active ? C.accent : C.textSecondary,
                      fontWeight: active ? "700" : "500",
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {repeatType === "CUSTOM" && (
            <View style={[repeatStyles.intervalRow, { borderColor: C.border, backgroundColor: C.surfaceAlt }]}>
              <Text style={{ color: C.textSecondary, fontSize: 13, marginRight: 10 }}>Every</Text>
              <TextInput
                style={[
                  repeatStyles.intervalInput,
                  { borderColor: C.border, color: C.textPrimary, backgroundColor: C.surface },
                ]}
                value={everyXDays}
                onChangeText={(t) => setEveryXDays(t.replace(/[^0-9]/g, "").slice(0, 3))}
                keyboardType="number-pad"
                maxLength={3}
                selectionColor={C.accent}
                cursorColor={C.accent}
              />
              <Text style={{ color: C.textSecondary, fontSize: 13, marginLeft: 10 }}>Days</Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            onPress={handleAddTask}
            disabled={loading}
            activeOpacity={0.85}
            style={loading ? styles.btnDisabled : undefined}
          >
            <LinearGradient
              colors={C.accentGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={sub.btn}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" style={styles.iconSpacer} />
                  <Text style={sub.text}>Add Task</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {pickerMode !== null && (
        <DateTimePicker
          value={pickerMode === "date" ? selectedDate : selectedTime}
          mode={pickerMode}
          display={
            pickerMode === "date"
              ? Platform.OS === "ios" ? "inline" : "calendar"
              : Platform.OS === "ios" ? "spinner" : "clock"
          }
          minimumDate={pickerMode === "date" ? new Date() : undefined}
          is24Hour={false}
          onChange={onPickerChange}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { padding: 18, paddingBottom: 120 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 10 },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  charCount: {
    fontSize: 10,
    textAlign: "right",
    marginTop: -8,
    marginBottom: 14,
    opacity: 0.5,
  },
  optionalLabel: {
    opacity: 0.45,
    fontWeight: "400",
    textTransform: "none",
    letterSpacing: 0,
  },
  row: { flexDirection: "row", marginBottom: 14 },
  rowItemSpacer: { marginRight: 8, flex: 1 },
  priorityRow: { marginBottom: 24 },
  iconSpacer: { marginRight: 7 },
  btnDisabled: { opacity: 0.6 },
});

const cardStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 26,
    padding: 18,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 6,
  } as ViewStyle,
});

const lbl = StyleSheet.create({
  text: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 7,
  } as TextStyle,
});

const inp = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    marginBottom: 14,
  } as TextStyle,
  area: { minHeight: 72, textAlignVertical: "top" } as TextStyle,
});

const pick = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
  } as ViewStyle,
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  } as ViewStyle,
  label: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 1,
  } as TextStyle,
  value: { fontSize: 13, fontWeight: "600" } as TextStyle,
});

const prio = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 11,
  } as ViewStyle,
});

const repeatStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
    gap: 8,
  } as ViewStyle,
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
  } as ViewStyle,
  intervalRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  } as ViewStyle,
  intervalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 14,
    minWidth: 56,
    textAlign: "center",
  } as TextStyle,
});

const sub = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: 18,
  } as ViewStyle,
  text: { color: "#FFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.3 } as TextStyle,
});