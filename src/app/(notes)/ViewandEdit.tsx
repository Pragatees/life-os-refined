// app/(notes)/ViewandEdit.tsx
//
// Self-contained "View & Edit" screen/component:
//  - Renders a month calendar (like Addandview.tsx's date navigator, but as
//    a full grid instead of prev/next arrows).
//  - Tapping any date pops up a modal for that day:
//      • If a note exists            -> shows it, with an "Edit" button.
//      • If no note exists yet       -> tells the user, with a text box to
//                                        add one straight away.
//  - Saving reuses the exact same storage logic as Addandview.tsx:
//      • GET  {API_URL}/date?date=YYYY-MM-DD   to load a day's note
//      • POST {API_URL}                        to create a new note
//      • PUT  {API_URL}/:id                    to update an existing note
//  - "Has a note" dots on the calendar now come from the shared Zustand
//    store (notes.ts) via getAllNoteDates(), instead of being lazily
//    filled in only for days the user has opened. This means every day
//    with a saved note is highlighted as soon as the calendar mounts.
//
// Drop this in as app/(notes)/ViewandEdit.tsx. It only needs `theme` from
// the parent screen — it manages its own selected date and modal state.
//
// NOTE: adjust the import path below to wherever your notes.ts store lives.
import { useNotesStore } from "../../store/notes";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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

const API_URL = "https://life-os-backend-1ozl.onrender.com/api/notes";

// ─── Theme Tokens (same palette as NotesScreen / Dashboard) ───────────────
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
type ModalMode = "loading" | "view" | "edit";

interface Props {
  theme: Theme;
}

// ─── Date helpers ───────────────────────────────────────────────────────────
function toISO(y: number, m: number, d: number): string {
  const month = String(m + 1).padStart(2, "0");
  const day = String(d).padStart(2, "0");
  return `${y}-${month}-${day}`;
}

function getTodayISO(): string {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// IMPORTANT FIX: a bare "YYYY-MM-DD" string gets parsed by most backends
// (and by `new Date("YYYY-MM-DD")`) as UTC midnight. Once that hits a
// server/timezone that sits behind UTC, it rolls back to the previous
// calendar day — which is why saved notes could show up "one day off".
// Anchoring to local noon before sending guarantees the date can never
// shift, no matter which timezone the backend or device is in.
function toSafeDateTime(iso: string): string {
  return `${iso}T12:00:00`;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// ─── ViewAndEdit ────────────────────────────────────────────────────────────
export default function ViewAndEdit({ theme }: Props) {
  const C = theme === "bright" ? BRIGHT : DARK;
  const todayISO = getTodayISO();

  // ── Store-backed "which dates have notes" data ───────────────────────
  // noteDates comes straight from the Zustand store in notes.ts, populated
  // by calling getAllNoteDates(token) once on mount (and refreshed after
  // every save), so the calendar can highlight every day that has a saved
  // note without needing to have been individually opened first.
  const noteDates = useNotesStore((s) => s.noteDates);
  const fetchNoteDates = useNotesStore((s) => s.getAllNoteDates);

  // ── Calendar grid state ──────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [viewYear, setViewYear] = useState<number>(Number(todayISO.split("-")[0]));
  const [viewMonth, setViewMonth] = useState<number>(Number(todayISO.split("-")[1]) - 1);

  // ── Note modal state (mirrors Addandview.tsx's load/save logic) ─────
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<ModalMode>("loading");
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Pop-up animation state ───────────────────────────────────────────
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

  // ── Load the full list of dates that have notes, from the store ─────
  const refreshNoteDates = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      await fetchNoteDates(token);
    } catch (error) {
      console.log(error);
    }
  }, [fetchNoteDates]);

  useEffect(() => {
    refreshNoteDates();
  }, [refreshNoteDates]);

  const monthLabel = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  }, [viewYear, viewMonth]);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const list: Array<{ day: number; iso: string } | null> = [];
    for (let i = 0; i < startOffset; i++) list.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ day: d, iso: toISO(viewYear, viewMonth, d) });
    }
    while (list.length % 7 !== 0) list.push(null); // pad to full weeks
    return list;
  }, [viewYear, viewMonth]);

  // Fast lookup set so highlighting doesn't do an O(n) .includes() per cell
  // on every render.
  const noteDatesSet = useMemo(() => new Set(noteDates), [noteDates]);

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    const [ty, tm] = todayISO.split("-").map(Number);
    setViewYear(ty);
    setViewMonth(tm - 1);
    setSelectedDate(todayISO);
  };

  // ── Load a note for a given date (same GET call as Addandview.tsx) ──
  const loadNote = useCallback(async (isoDate: string) => {
    setMode("loading");
    setContent("");
    setSavedContent("");
    setNoteId(null);

    try {
      const token = await AsyncStorage.getItem("token");

      const response = await axios.get(`${API_URL}/date`, {
        params: { date: isoDate },
        headers: { Authorization: `Bearer ${token}` },
      });

      setNoteId(response.data.id);
      setContent(response.data.content);
      setSavedContent(response.data.content);
      setMode("view");
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Nothing saved for this day yet -> ask the user to add one.
        setNoteId(null);
        setContent("");
        setSavedContent("");
        setMode("edit");
      } else {
        console.log(error);
        Alert.alert("Error", "Unable to load the note for this day.");
        setMode("edit");
      }
    }
  }, []);

  // Tapping a day on the calendar opens the modal (pop-up animation) and
  // fetches that day's note.
  const handleSelectDate = (iso: string) => {
    setSelectedDate(iso);
    setModalVisible(true);
    runOpenAnimation();
    loadNote(iso);
  };

  const closeModal = () => {
    runCloseAnimation(() => setModalVisible(false));
  };

  // ── Save note: PUT if one already exists for the date, POST if not
  //    (identical branching to Addandview.tsx's saveNote) ─────────────
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

      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      if (noteId) {
        const response = await axios.put(
          `${API_URL}/${noteId}`,
          { content: content.trim() },
          config
        );
        console.log("Updated:", response.data);
      } else {
        // FIX: send a noon-anchored datetime instead of a bare "YYYY-MM-DD"
        // string, so the backend can't parse it as UTC midnight and roll
        // it back to the previous day in a timezone behind UTC.
        const response = await axios.post(
          API_URL,
          { content: content.trim(), noteDate: toSafeDateTime(selectedDate) },
          config
        );
        console.log("Created:", response.data);
        setNoteId(response.data.id);
      }

      Alert.alert("Success", "Note saved successfully.");
      setSavedContent(content.trim());
      setMode("view");

      // Refresh the store's noteDates so the new/updated day lights up on
      // the calendar immediately.
      refreshNoteDates();
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

  const cancelEdit = () => {
    setContent(savedContent);
    setMode("view");
  };

  return (
    <>
      {/* ── Calendar card ── */}
      <View
        style={[
          styles.card,
          { backgroundColor: C.surface, borderColor: C.border, shadowColor: C.shadowDark },
        ]}
      >
        <View style={styles.monthRow}>
          <TouchableOpacity
            onPress={goToPrevMonth}
            activeOpacity={0.75}
            style={[styles.navBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
          >
            <Ionicons name="chevron-back" size={16} color={C.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity onPress={goToToday} activeOpacity={0.7}>
            <Text style={[styles.monthLabel, { color: C.textPrimary }]}>{monthLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={goToNextMonth}
            activeOpacity={0.75}
            style={[styles.navBtn, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}
          >
            <Ionicons name="chevron-forward" size={16} color={C.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAY_LABELS.map((label, i) => (
            <View key={i} style={styles.weekdayCell}>
              <Text style={[styles.weekdayLabel, { color: C.textSecondary }]}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((cell, i) => {
            if (!cell) return <View key={i} style={styles.dayCell} />;

            const isSelected = cell.iso === selectedDate;
            const isToday = cell.iso === todayISO;
            const hasNote = noteDatesSet.has(cell.iso);

            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.75}
                onPress={() => handleSelectDate(cell.iso)}
                style={styles.dayCell}
              >
                <View
                  style={[
                    styles.dayInner,
                    isSelected && { backgroundColor: C.accent },
                    !isSelected && isToday && { borderWidth: 1.5, borderColor: C.accent },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayLabel,
                      { color: isSelected ? "#FFFFFF" : isToday ? C.accent : C.textPrimary },
                    ]}
                  >
                    {cell.day}
                  </Text>
                  {hasNote && (
                    <View
                      style={[styles.dot, { backgroundColor: isSelected ? "#FFFFFF" : C.accent }]}
                    />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.legendRow}>
        <View style={[styles.legendDot, { backgroundColor: C.accent }]} />
        <Text style={[styles.legendText, { color: C.textSecondary }]}>Days with a saved note</Text>
      </View>

      {/* ── Note modal: pops up centered (scale + fade), for the tapped date ── */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
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
                <View style={styles.headerRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eyebrow, { color: C.accent }]}>
                      {mode === "edit" && !noteId ? "New Note" : "Note"}
                    </Text>
                    <Text style={[styles.dateLabel, { color: C.textPrimary }]}>
                      {formatDisplayDate(selectedDate)}
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
                ) : mode === "view" ? (
                  <>
                    <View style={[styles.noteBox, { backgroundColor: C.surfaceAlt }]}>
                      <Text style={{ fontSize: 14, lineHeight: 21, color: C.textPrimary }}>
                        {content}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => setMode("edit")}
                      activeOpacity={0.85}
                      style={[styles.actionBtn, { backgroundColor: C.accent }]}
                    >
                      <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.actionLabel}>Edit Note</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {!noteId && (
                      <View style={[styles.emptyHint, { backgroundColor: C.accentSoft }]}>
                        <Ionicons name="information-circle-outline" size={16} color={C.accent} />
                        <Text style={[styles.emptyHintText, { color: C.accent }]}>
                          No note found for this day yet — add one below.
                        </Text>
                      </View>
                    )}

                    <TextInput
                      placeholder="Write your note..."
                      placeholderTextColor={C.textSecondary}
                      multiline
                      autoFocus
                      value={content}
                      onChangeText={setContent}
                      style={[
                        styles.input,
                        { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.textPrimary },
                      ]}
                    />

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      {noteId && (
                        <TouchableOpacity
                          onPress={cancelEdit}
                          activeOpacity={0.85}
                          style={[
                            styles.actionBtn,
                            { flex: 1, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
                          ]}
                        >
                          <Text style={[styles.actionLabel, { color: C.textPrimary }]}>Cancel</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        onPress={saveNote}
                        disabled={saving}
                        activeOpacity={0.85}
                        style={[
                          styles.actionBtn,
                          { flex: 1, backgroundColor: C.accent, opacity: saving ? 0.7 : 1 },
                        ]}
                      >
                        {saving ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons
                              name={noteId ? "checkmark-circle-outline" : "add-circle-outline"}
                              size={18}
                              color="#FFFFFF"
                            />
                            <Text style={styles.actionLabel}>{noteId ? "Update Note" : "Save Note"}</Text>
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
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 14,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 4,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: "800",
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  weekdayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  weekdayLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%` as unknown as number,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  dayInner: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  dot: {
    position: "absolute",
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Modal — now a centered pop-up card instead of a bottom sheet.
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
  noteBox: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    minHeight: 100,
  },
  emptyHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  emptyHintText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 160,
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