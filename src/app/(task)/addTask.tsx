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
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api";

// ─── Theme Tokens ─────────────────────────────────────────────────────────────
const DARK = {
  bg: "#0F172A",
  surface: "#1E293B",
  surfaceAlt: "#263348",
  accent: "#6366F1",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  border: "#334155",
  priorityHigh: "#EF4444",
  priorityMed: "#F59E0B",
  priorityLow: "#10B981",
};

const BRIGHT = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  accent: "#6366F1",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  border: "#E2E8F0",
  priorityHigh: "#EF4444",
  priorityMed: "#F59E0B",
  priorityLow: "#10B981",
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
  colorKey: "priorityHigh" | "priorityMed" | "priorityLow";
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: "HIGH",   label: "High",   colorKey: "priorityHigh", icon: "flame-outline" },
  { value: "MEDIUM", label: "Medium", colorKey: "priorityMed",  icon: "alert-circle-outline" },
  { value: "LOW",    label: "Low",    colorKey: "priorityLow",  icon: "leaf-outline" },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AddTaskComponent({ onTaskAdded, theme = "dark" }: AddTaskProps) {
  const C = theme === "bright" ? BRIGHT : DARK;

  const [taskName, setTaskName]         = useState("");
  const [description, setDescription]   = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [priority, setPriority]         = useState<Priority>("MEDIUM");
  const [pickerMode, setPickerMode]     = useState<PickerMode>(null);
  const [loading, setLoading]           = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 340, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 340, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type === "dismissed") { setPickerMode(null); return; }
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

  const fmtDate   = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const fmtTime   = (t: Date) => t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
  const fmtDateDB = (d: Date) => d.toISOString().split("T")[0];
  const fmtTimeDB = (t: Date) => `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}`;

  const handleAddTask = async () => {
    if (!taskName.trim()) {
      Alert.alert("Missing Task Name", "Please enter a task name.");
      return;
    }
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");
      if (!token) { Alert.alert("Session Expired", "Please login again."); return; }

      const response = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          taskName: taskName.trim(),
          description: description.trim(),
          taskDate: fmtDateDB(selectedDate),
          taskTime: fmtTimeDB(selectedTime),
          priority,
        }),
      });

      if (response.ok) {
        Alert.alert("Task Added", "Your task has been added successfully.");
        setTaskName("");
        setDescription("");
        setSelectedDate(new Date());
        setSelectedTime(new Date());
        setPriority("MEDIUM");
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
      style={[{ flex: 1, backgroundColor: C.bg }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
      >
        {/* Section title */}
        <Text style={{ fontSize: 13, fontWeight: "700", color: C.textSecondary, letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>
          New Task
        </Text>

        {/* Task Name */}
        <Text style={[lbl.text, { color: C.textSecondary }]}>Task Name</Text>
        <TextInput
          style={[inp.base, { backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }]}
          placeholder="What do you want to accomplish?"
          placeholderTextColor={C.textSecondary}
          value={taskName}
          onChangeText={(t) => setTaskName(t.slice(0, 100))}
          maxLength={100}
          returnKeyType="next"
          selectionColor={C.accent}
        />
        <Text style={{ fontSize: 10, color: C.textSecondary, textAlign: "right", marginTop: -8, marginBottom: 14, opacity: 0.5 }}>
          {taskName.length}/100
        </Text>

        {/* Description */}
        <Text style={[lbl.text, { color: C.textSecondary }]}>
          Description{" "}
          <Text style={{ opacity: 0.45, fontWeight: "400", textTransform: "none", letterSpacing: 0 }}>optional</Text>
        </Text>
        <TextInput
          style={[inp.base, inp.area, { backgroundColor: C.surface, borderColor: C.border, color: C.textPrimary }]}
          placeholder="Add additional details..."
          placeholderTextColor={C.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          selectionColor={C.accent}
        />

        {/* Schedule */}
        <Text style={[lbl.text, { color: C.textSecondary }]}>Schedule</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          <TouchableOpacity
            onPress={() => setPickerMode("date")}
            activeOpacity={0.75}
            style={[pick.btn, { backgroundColor: C.surface, borderColor: C.border, flex: 1 }]}
          >
            <Ionicons name="calendar-outline" size={14} color={C.accent} />
            <View>
              <Text style={[pick.label, { color: C.textSecondary }]}>Date</Text>
              <Text style={[pick.value, { color: C.textPrimary }]}>{fmtDate(selectedDate)}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPickerMode("time")}
            activeOpacity={0.75}
            style={[pick.btn, { backgroundColor: C.surface, borderColor: C.border, flex: 1 }]}
          >
            <Ionicons name="time-outline" size={14} color={C.accent} />
            <View>
              <Text style={[pick.label, { color: C.textSecondary }]}>Time</Text>
              <Text style={[pick.value, { color: C.textPrimary }]}>{fmtTime(selectedTime)}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Priority */}
        <Text style={[lbl.text, { color: C.textSecondary }]}>Priority</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
          {PRIORITIES.map((p) => {
            const color = C[p.colorKey];
            const active = priority === p.value;
            return (
              <TouchableOpacity
                key={p.value}
                onPress={() => setPriority(p.value)}
                activeOpacity={0.8}
                style={[
                  prio.chip,
                  { borderColor: active ? color : C.border, backgroundColor: active ? color + "18" : C.surface, flex: 1 },
                ]}
              >
                <Ionicons name={p.icon} size={13} color={active ? color : C.textSecondary} />
                <Text style={{ fontSize: 12, color: active ? color : C.textSecondary, fontWeight: active ? "700" : "500" }}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[sub.btn, { backgroundColor: C.accent }, loading && { opacity: 0.6 }]}
          onPress={handleAddTask}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
              <Text style={sub.text}>Add Task</Text>
            </>
          )}
        </TouchableOpacity>
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

const lbl = StyleSheet.create({
  text: { fontSize: 10, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 7 },
});
const inp = StyleSheet.create({
  base: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, marginBottom: 14 },
  area: { minHeight: 72, textAlignVertical: "top" },
});
const pick = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11 },
  label: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 1 },
  value: { fontSize: 13, fontWeight: "600" },
});
const prio = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
});
const sub = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 14, borderRadius: 13 },
  text: { color: "#FFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
});