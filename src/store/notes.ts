import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import NoteNotificationService from "../notifications/note/NoteNotificationService";

const API_URL = `${process.env.EXPO_PUBLIC_API_URL}/api/notes`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface NoteEntry {
  id: string | null;
  content: string;
  cachedAt: number;
}

interface NotesState {
  notes: Record<string, NoteEntry>;
  noteDates: string[];
  isFresh: (date: string) => boolean;
  hasNote: (date: string) => boolean;
  setLocalContent: (date: string, content: string) => void;
  getAllNoteDates: (token: string | null) => Promise<string[]>;
  getNote: (date: string, token: string | null) => Promise<NoteEntry>;
  saveNote: (date: string, content: string, token: string | null) => Promise<NoteEntry>;
  clearNote: (date: string) => Promise<void>;
  clearAll: () => Promise<void>;
  onLogout: () => Promise<void>;
}

function isEntryFresh(entry?: NoteEntry): entry is NoteEntry {
  if (!entry) return false;
  return Date.now() - entry.cachedAt < CACHE_TTL_MS;
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: {},
      noteDates: [],

      isFresh: (date) => isEntryFresh(get().notes[date]),

      hasNote: (date) => get().noteDates.includes(date),

      setLocalContent: (date, content) => {
        set((state) => {
          const existing = state.notes[date];
          return {
            notes: {
              ...state.notes,
              [date]: {
                id: existing?.id ?? null,
                content,
                cachedAt: existing?.cachedAt ?? Date.now(),
              },
            },
          };
        });
      },

      getAllNoteDates: async (token) => {
        try {
          const response = await axios.get(`${API_URL}/dates`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          set({ noteDates: response.data });
          return response.data;
        } catch (error) {
          console.log(error);
          return [];
        }
      },

      getNote: async (date, token) => {
        const cached = get().notes[date];
        if (isEntryFresh(cached)) {
          return cached;
        }

        try {
          const response = await axios.get(`${API_URL}/date`, {
            params: { date },
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          const entry: NoteEntry = {
            id: response.data.id,
            content: response.data.content,
            cachedAt: Date.now(),
          };

          set((state) => ({
            notes: {
              ...state.notes,
              [date]: entry,
            },
          }));

          return entry;
        } catch (error: any) {
          if (error.response?.status === 404) {
            const entry: NoteEntry = {
              id: null,
              content: "",
              cachedAt: Date.now(),
            };

            set((state) => ({
              notes: {
                ...state.notes,
                [date]: entry,
              },
            }));

            return entry;
          }
          throw error;
        }
      },

      saveNote: async (date, content, token) => {
        const existing = get().notes[date];
        const config = {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        };

        const isNewNote = !existing?.id;

        let entry: NoteEntry;

        // ── The actual network save. If this throws, we genuinely failed
        // to save and should propagate the error to the caller. ──
        if (existing?.id) {
          const response = await axios.put(
            `${API_URL}/${existing.id}`,
            { content },
            config
          );

          entry = {
            id: existing.id,
            content: response.data.content ?? content,
            cachedAt: Date.now(),
          };
        } else {
          const response = await axios.post(
            API_URL,
            { content, noteDate: date },
            config
          );

          entry = {
            id: response.data.id,
            content,
            cachedAt: Date.now(),
          };
        }

        // ── Save succeeded on the server at this point. Commit it to
        // local state immediately so the UI reflects the save regardless
        // of what happens with local notifications below. ──
        set((state) => ({
          notes: {
            ...state.notes,
            [date]: entry,
          },
          noteDates: state.noteDates.includes(date)
            ? state.noteDates
            : [...state.noteDates, date],
        }));

        // ── NoteNotificationService only manages ONE daily 9:30 PM
        // "write today's journal" reminder, whose title/body just reflects
        // whether today's note exists. This is local-device housekeeping,
        // not part of "did the save succeed" — so it's wrapped in its own
        // try/catch, guarded with a typeof check, so it can never be
        // mistaken for a failed save. This is the correct pattern —
        // store/goals.ts and store/task.ts have been updated to match it. ──
        try {
          if (isNewNote) {
            if (typeof NoteNotificationService?.onNoteCreated === "function") {
              await NoteNotificationService.onNoteCreated();
            } else {
              console.log(
                "[NotesStore] NoteNotificationService.onNoteCreated is not a function — skipping.",
                NoteNotificationService
              );
            }
          } else {
            if (typeof NoteNotificationService?.onNoteUpdated === "function") {
              await NoteNotificationService.onNoteUpdated();
            } else {
              console.log(
                "[NotesStore] NoteNotificationService.onNoteUpdated is not a function — skipping.",
                NoteNotificationService
              );
            }
          }
        } catch (notificationError) {
          console.log(
            "[NotesStore] Note saved successfully, but refreshing today's reminder failed:",
            notificationError
          );
        }

        return entry;
      },

      clearNote: async (date) => {
        try {
          if (typeof NoteNotificationService?.onNoteDeleted === "function") {
            await NoteNotificationService.onNoteDeleted();
          } else {
            console.log(
              "[NotesStore] NoteNotificationService.onNoteDeleted is not a function — skipping.",
              NoteNotificationService
            );
          }
        } catch (notificationError) {
          console.log(
            "[NotesStore] Failed to cancel notification for deleted note:",
            notificationError
          );
        }

        set((state) => {
          const notes = { ...state.notes };
          delete notes[date];
          return {
            notes,
            noteDates: state.noteDates.filter((d) => d !== date),
          };
        });
      },

      clearAll: async () => {
        try {
          if (typeof NoteNotificationService?.onNoteDeleted === "function") {
            await NoteNotificationService.onNoteDeleted();
          } else {
            console.log(
              "[NotesStore] NoteNotificationService.onNoteDeleted is not a function — skipping.",
              NoteNotificationService
            );
          }
        } catch (notificationError) {
          console.log(
            "[NotesStore] Failed to refresh reminder during clearAll:",
            notificationError
          );
        }

        set({ notes: {}, noteDates: [] });
      },

      // ==========================================
      // Logout — clears in-memory state AND the
      // persisted "notes-cache-storage" entry in AsyncStorage
      // ==========================================
      onLogout: async () => {
        try {
          if (typeof NoteNotificationService?.cancelTodayReminder === "function") {
            await NoteNotificationService.cancelTodayReminder();
          } else {
            console.log(
              "[NotesStore] NoteNotificationService.cancelTodayReminder is not a function — skipping.",
              NoteNotificationService
            );
          }
        } catch (notificationError) {
          console.log(
            "[NotesStore] Failed to cancel today's reminder on logout:",
            notificationError
          );
        }

        try {
          await AsyncStorage.removeItem("notes-cache-storage");
        } catch (error) {
          console.error(
            "[NotesStore] Error clearing notes storage on logout:",
            error
          );
        }

        set({
          notes: {},
          noteDates: [],
        });
      },
    }),
    {
      name: "notes-cache-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        notes: state.notes,
        noteDates: state.noteDates,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const fresh: Record<string, NoteEntry> = {};
        for (const [date, entry] of Object.entries(state.notes)) {
          if (isEntryFresh(entry)) {
            fresh[date] = entry;
          }
        }
        state.notes = fresh;
      },
    }
  )
);