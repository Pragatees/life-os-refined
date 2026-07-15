import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import NoteNotificationService from "../notifications/note/NoteNotificationService";

const API_URL = "https://life-os-backend-1ozl.onrender.com/api/notes";
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

        set((state) => ({
          notes: {
            ...state.notes,
            [date]: entry,
          },
          noteDates: state.noteDates.includes(date)
            ? state.noteDates
            : [...state.noteDates, date],
        }));

        const note = {
          id: entry.id!,
          content: entry.content,
          noteDate: date,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (isNewNote) {
          await NoteNotificationService.scheduleNote(note);
        } else {
          await NoteNotificationService.rescheduleNote(note);
        }

        return entry;
      },

      clearNote: async (date) => {
        await NoteNotificationService.onNoteDeleted(date);

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
        const notes = get().notes;
        for (const date of Object.keys(notes)) {
          await NoteNotificationService.onNoteDeleted(date);
        }

        set({ notes: {}, noteDates: [] });
      },

      // ==========================================
      // Logout — clears in-memory state AND the
      // persisted "notes-cache-storage" entry in AsyncStorage
      // ==========================================
      onLogout: async () => {
        const notes = get().notes;

        // NoteNotificationService.cancelAll expects full Note objects; convert cached NoteEntry -> Note
        const noteArray = Object.entries(notes).map(([date, entry]) => ({
          id: entry.id,
          content: entry.content,
          noteDate: date,
          createdAt: new Date(entry.cachedAt).toISOString(),
          updatedAt: new Date(entry.cachedAt).toISOString(),
        }));

        await NoteNotificationService.cancelAll(noteArray as any);

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