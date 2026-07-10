// app/(notes)/Addandview.tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useNotesStore } from "../../store/notes";

// ─── Theme Tokens ───────────────────────────────────────────────────────────
// Same palette as NotesScreen / Dashboard. If you pull these into a shared
// constants/theme.ts later, swap this block for an import instead.
const DARK = {
  bg: "#0A0A0B",
  surface: "#18181B",
  surfaceAlt: "#212124",
  accent: "#FF8A3D",
  accentSoft: "#3A2617",
  success: "#3DD68C",
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
  danger: "#EF5A4C",
  textPrimary: "#1C1C1E",
  textSecondary: "#7A7A80",
  border: "#E6E6E9",
  shadowDark: "#B9B9C0",
};

type Theme = "bright" | "dark";

interface Props {
  theme: Theme;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onRefresh: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
// Shift a "YYYY-MM-DD" string by N days, staying in local time
// (no UTC drift, unlike using .toISOString() on a shifted Date).
function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AddAndView({
  theme,
  selectedDate,
  onDateChange,
  onRefresh,
}: Props) {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Zustand store: handles the 24h AsyncStorage cache so we don't
  // hit the API every time this screen mounts / the date changes.
  const getNote = useNotesStore((s) => s.getNote);
  const saveNoteToStore = useNotesStore((s) => s.saveNote);
  const setLocalContent = useNotesStore((s) => s.setLocalContent);

  const C = theme === "bright" ? BRIGHT : DARK;

  useEffect(() => {
    loadNote();
  }, [selectedDate]);

  const loadNote = async () => {
    setLoading(true);

    try {
      const token = await AsyncStorage.getItem("token");

      // Returns the cached entry if it's < 24h old, otherwise fetches
      // from the API once and caches the result.
      const entry = await getNote(selectedDate, token);

      setNoteId(entry.id);
      setContent(entry.content);
    } catch (error: any) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  // Keep the local cache in sync as the user types, so if they navigate
  // away and back within 24h (without saving) their draft is still there
  // and no extra API call is made.
  const handleContentChange = (text: string) => {
    setContent(text);
    setLocalContent(selectedDate, text);
  };

  const saveNote = async () => {
    if (!content.trim()) {
      Alert.alert("Validation", "Please enter a note.");
      return;
    }

    setSaving(true);

    try {
      const token = await AsyncStorage.getItem("token");

      if (!token) {
        Alert.alert("Session Expired", "Please login again.");
        return;
      }

      const entry = await saveNoteToStore(selectedDate, content.trim(), token);

      setNoteId(entry.id);
      setContent(entry.content);

      Alert.alert("Success", "Note saved successfully.");

      onRefresh();
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.log("Status:", error.response?.status);
        console.log("Response:", error.response?.data);

        Alert.alert("Error", error.response?.data?.message ?? "Unable to save note.");
      } else {
        console.log(error);

        Alert.alert("Error", "Something went wrong.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View
      style={{
        backgroundColor: C.surface,
        borderColor: C.border,
        borderWidth: 1,
        borderRadius: 22,
        padding: 16,
        marginBottom: 14,
        shadowColor: C.shadowDark,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
        elevation: 4,
      }}
    >
      {/* ── Date navigator ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <TouchableOpacity
          onPress={() => onDateChange(shiftDate(selectedDate, -1))}
          activeOpacity={0.75}
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: C.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={16} color={C.textPrimary} />
        </TouchableOpacity>

        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.5, color: C.accent, textTransform: "uppercase" }}>
            Editing
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.textPrimary, marginTop: 2 }}>
            {formatShortDate(selectedDate)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => onDateChange(shiftDate(selectedDate, 1))}
          activeOpacity={0.75}
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.border,
            backgroundColor: C.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-forward" size={16} color={C.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ── Note input / loading state ── */}
      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : (
        <>
          <TextInput
            placeholder="Write your note..."
            placeholderTextColor={C.textSecondary}
            multiline
            value={content}
            onChangeText={handleContentChange}
            style={{
              backgroundColor: C.surfaceAlt,
              borderColor: C.border,
              borderWidth: 1,
              borderRadius: 14,
              minHeight: 180,
              padding: 14,
              fontSize: 14,
              lineHeight: 20,
              color: C.textPrimary,
              textAlignVertical: "top",
              marginBottom: 16,
            }}
          />

          <TouchableOpacity
            onPress={saveNote}
            disabled={saving}
            activeOpacity={0.85}
            style={{
              backgroundColor: C.accent,
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons
                  name={noteId ? "checkmark-circle-outline" : "add-circle-outline"}
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                  {noteId ? "Update Note" : "Save Note"}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}