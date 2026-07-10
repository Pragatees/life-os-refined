// src/types/note.ts

/**
 * Daily Note model returned by the backend.
 */
export interface Note {
  id: string;
  content: string;
  noteDate: string;      // yyyy-MM-dd
  createdAt: string;     // ISO date-time
  updatedAt: string;     // ISO date-time
}

/**
 * Request body for creating a note.
 */
export interface CreateNoteRequest {
  content: string;
  noteDate: string;      // yyyy-MM-dd
}

/**
 * Request body for updating a note.
 */
export interface UpdateNoteRequest {
  content: string;
}

/**
 * Standard backend error response.
 */
export interface ErrorResponse {
  message: string;
}