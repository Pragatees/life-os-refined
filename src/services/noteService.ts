import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  Note,
  CreateNoteRequest,
  UpdateNoteRequest,
} from "@/types/note";

const BASE_URL = "https://YOUR_BACKEND_URL/api/notes";
// Example:
// const BASE_URL = "https://life-os-backend.onrender.com/api/notes";

async function getAuthHeaders() {
  const token = await AsyncStorage.getItem("accessToken");

  if (!token) {
    throw new Error("Authentication token not found");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export const noteService = {
  /**
   * Get note by selected date
   */
  async getNoteByDate(date: string): Promise<Note | null> {
    try {
      const headers = await getAuthHeaders();

      const response = await axios.get(`${BASE_URL}/date`, {
        params: { date },
        headers,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }

      throw error;
    }
  },

  /**
   * Create new note
   */
  async createNote(
    data: CreateNoteRequest
  ): Promise<Note> {

    const headers = await getAuthHeaders();

    const response = await axios.post(
      BASE_URL,
      data,
      {
        headers,
      }
    );

    return response.data;
  },

  /**
   * Update existing note
   */
  async updateNote(
    noteId: string,
    data: UpdateNoteRequest
  ): Promise<Note> {

    const headers = await getAuthHeaders();

    const response = await axios.put(
      `${BASE_URL}/${noteId}`,
      data,
      {
        headers,
      }
    );

    return response.data;
  },

  /**
   * Delete note
   */
  async deleteNote(
    noteId: string
  ): Promise<void> {

    const headers = await getAuthHeaders();

    await axios.delete(
      `${BASE_URL}/${noteId}`,
      {
        headers,
      }
    );
  },
};