import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api/goals";

// ─── Theme Tokens (same palette as Dashboard — keep in sync) ──────────────
// NOTE: ideally these live in one shared file imported everywhere.
const DARK = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  accentSoft: "#3A2617",
  accentGradient: ["#FF8A3D", "#FFB25E"] as const,
  success: "#3DD68C",
  warning: "#FFC24B",
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
  accentGradient: ["#FF8A3D", "#FF6B1F"] as const,
  success: "#22B573",
  warning: "#F0A93B",
  danger: "#EF5A4C",
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  shadowDark: "#B9B9C0",
  shadowLight: "#FFFFFF",
};

type Theme = "bright" | "dark";
type GoalStatus = "CREATED" | "STARTED" | "IN_PROGRESS" | "COMPLETED";

interface Props {
  selectedDate: string; // ISO format: YYYY-MM-DD — this is the backend / storage format
  onDateChange: (date: string) => void;
  onRefresh: () => void;
  theme?: Theme;
}

const STATUS_OPTIONS: {
  id: GoalStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: "CREATED", label: "Created", icon: "add-circle-outline" },
  { id: "STARTED", label: "Started", icon: "play-outline" },
  { id: "IN_PROGRESS", label: "In Progress", icon: "sync-outline" },
  { id: "COMPLETED", label: "Completed", icon: "checkmark-done-outline" },
];

// ─── Date helpers ───────────────────────────────────────────────────────────
// Internal / backend format is always ISO: YYYY-MM-DD
// Display format for the user is: DD/MM/YYYY

const isoToDate = (iso: string): Date => {
  const parsed = new Date(iso);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

const dateToIso = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isoToDisplay = (iso: string): string => {
  if (!iso) return "Select date";
  const date = isoToDate(iso);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export default function Addandedit({
  selectedDate,
  onDateChange,
  onRefresh,
  theme = "dark",
}: Props) {
  const C = theme === "bright" ? BRIGHT : DARK;

  const [goalName, setGoalName] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState(selectedDate);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<GoalStatus>("CREATED");

  const [showGoalDatePicker, setShowGoalDatePicker] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

  const handleGoalDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setShowGoalDatePicker(false);
    if (event.type === "dismissed" || !date) return;
    onDateChange(dateToIso(date));
  };

  const handleDeadlineChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setShowDeadlinePicker(false);
    if (event.type === "dismissed" || !date) return;
    setDeadline(dateToIso(date));
  };

  const saveGoal = async () => {
    if (!goalName.trim()) {
      Alert.alert("Validation", "Enter goal name");
      return;
    }

    if (!description.trim()) {
      Alert.alert("Validation", "Enter description");
      return;
    }

    try {
      setSaving(true);

      const token = await AsyncStorage.getItem("token");

      if (!token) {
        Alert.alert("Session Expired", "Please login again.");
        return;
      }

      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      if (goalId) {
        const response = await axios.put(
          `${API_URL}/${goalId}`,
          {
            goalName,
            description,
            deadline,
            status,
          },
          { headers }
        );

        console.log(response.data);
        Alert.alert("Success", "Goal Updated");
      } else {
        const response = await axios.post(
          API_URL,
          {
            goalName,
            description,
            goalDate: selectedDate,
            deadline,
            status,
          },
          { headers }
        );

        console.log(response.data);
        setGoalId(response.data.id);
        Alert.alert("Success", "Goal Created");
      }

      onRefresh();

      // Reset form after successful save
      setGoalName("");
      setDescription("");
      setDeadline(selectedDate);
      setGoalId(null);
      setStatus("CREATED");
    } catch (error: any) {
      console.log(error);

      if (axios.isAxiosError(error)) {
        Alert.alert("Error", error.response?.data?.message || "Unable to save goal.");
      } else {
        Alert.alert("Error", "Something went wrong.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
        ]}
      >
        <Text style={[styles.title, { color: C.textPrimary }]}>
          {goalId ? "Edit Goal" : "Add Goal"}
        </Text>

        {/* Goal Name */}
        <Text style={[styles.label, { color: C.textSecondary }]}>Goal Name</Text>
        <TextInput
          placeholder="e.g. Read 12 books this year"
          placeholderTextColor={C.textSecondary}
          value={goalName}
          onChangeText={setGoalName}
          style={[
            styles.input,
            { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.textPrimary },
          ]}
        />

        {/* Description */}
        <Text style={[styles.label, { color: C.textSecondary }]}>Description</Text>
        <TextInput
          placeholder="A short description of this goal"
          placeholderTextColor={C.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          style={[
            styles.input,
            styles.textArea,
            { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.textPrimary },
          ]}
        />

        {/* Goal Date */}
        <Text style={[styles.label, { color: C.textSecondary }]}>Goal Date</Text>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setShowGoalDatePicker(true)}
          style={[
            styles.dateField,
            { backgroundColor: C.surfaceAlt, borderColor: C.border },
          ]}
        >
          <Ionicons name="calendar-outline" size={18} color={C.accent} />
          <Text style={[styles.dateText, { color: C.textPrimary }]}>
            {isoToDisplay(selectedDate)}
          </Text>
        </TouchableOpacity>

        {/* Deadline */}
        <Text style={[styles.label, { color: C.textSecondary }]}>Deadline</Text>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setShowDeadlinePicker(true)}
          style={[
            styles.dateField,
            { backgroundColor: C.surfaceAlt, borderColor: C.border },
          ]}
        >
          <Ionicons name="flag-outline" size={18} color={C.accent} />
          <Text style={[styles.dateText, { color: C.textPrimary }]}>
            {isoToDisplay(deadline)}
          </Text>
        </TouchableOpacity>

        {/* Status — segmented pill selector */}
        <Text style={[styles.label, { color: C.textSecondary }]}>Status</Text>
        <View style={styles.statusWrap}>
          {STATUS_OPTIONS.map((option) => {
            const active = status === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                activeOpacity={0.8}
                onPress={() => setStatus(option.id)}
                style={styles.statusPillTouchable}
              >
                {active ? (
                  <LinearGradient
                    colors={C.accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.statusPill}
                  >
                    <Ionicons name={option.icon} size={14} color="#FFFFFF" />
                    <Text style={[styles.statusPillText, { color: "#FFFFFF" }]}>
                      {option.label}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
                    ]}
                  >
                    <Ionicons name={option.icon} size={14} color={C.textSecondary} />
                    <Text style={[styles.statusPillText, { color: C.textSecondary }]}>
                      {option.label}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Save button */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={saveGoal}
          disabled={saving}
          style={styles.saveBtnTouchable}
        >
          <LinearGradient
            colors={C.accentGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>
                {goalId ? "Update Goal" : "Save Goal"}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Date pickers ── */}
      {Platform.OS === "android" && showGoalDatePicker && (
        <DateTimePicker
          value={isoToDate(selectedDate)}
          mode="date"
          display="default"
          onChange={handleGoalDateChange}
        />
      )}
      {Platform.OS === "android" && showDeadlinePicker && (
        <DateTimePicker
          value={isoToDate(deadline)}
          mode="date"
          display="default"
          onChange={handleDeadlineChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal
          transparent
          animationType="fade"
          visible={showGoalDatePicker}
          onRequestClose={() => setShowGoalDatePicker(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalSheet, { backgroundColor: C.surface, borderColor: C.border }]}>
              <DateTimePicker
                value={isoToDate(selectedDate)}
                mode="date"
                display="spinner"
                onChange={handleGoalDateChange}
                textColor={C.textPrimary}
              />
              <TouchableOpacity
                onPress={() => setShowGoalDatePicker(false)}
                style={[styles.modalDoneBtn, { backgroundColor: C.accent }]}
              >
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === "ios" && (
        <Modal
          transparent
          animationType="fade"
          visible={showDeadlinePicker}
          onRequestClose={() => setShowDeadlinePicker(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalSheet, { backgroundColor: C.surface, borderColor: C.border }]}>
              <DateTimePicker
                value={isoToDate(deadline)}
                mode="date"
                display="spinner"
                onChange={handleDeadlineChange}
                textColor={C.textPrimary}
              />
              <TouchableOpacity
                onPress={() => setShowDeadlinePicker(false)}
                style={[styles.modalDoneBtn, { backgroundColor: C.accent }]}
              >
                <Text style={styles.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },

  container: {
    paddingBottom: 24,
  },

  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 5,
  },

  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 16,
  },

  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 10,
  },

  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },

  textArea: {
    height: 100,
    textAlignVertical: "top",
  },

  dateField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  dateText: {
    fontSize: 14,
    fontWeight: "600",
  },

  statusWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },

  statusPillTouchable: {
    borderRadius: 20,
  },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },

  statusPillText: {
    fontSize: 12,
    fontWeight: "700",
  },

  saveBtnTouchable: {
    marginTop: 20,
    borderRadius: 16,
  },

  saveBtn: {
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  saveBtnDisabled: {
    opacity: 0.7,
  },

  saveBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },

  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 8,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },

  modalDoneBtn: {
    marginTop: 8,
    marginHorizontal: 8,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },

  modalDoneText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
});