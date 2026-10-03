/**
 * Chat & Messages API Service
 */

/**
 * Thin typed wrapper around the backend's generic `/api/query` endpoint for
 * the `chat_messages` table (one chat room per exam request, keyed by
 * `request_id`). Re-exported from `services/api/index.ts`.
 *
 * Every method returns an `ApiResponse` (`{ data, error }`) and never
 * throws: network / HTTP failures come back as a human-readable `error`
 * string produced by `apiClient`.
 */

import { apiClient, ApiResponse } from './client';
import { ChatMessage, SendChatMessageInput } from '../../types';

/**
 * Chat API for exam-request chat rooms (at the time of writing no screen
 * imports it directly; chat screens query `chat_messages` via the
 * `supabase` shim instead).
 * Methods: `getMessages`, `sendMessage`, `sendVoiceNote`, `sendImageMessage`.
 * The voice / image helpers call `this.sendMessage`, so they must be invoked
 * as `chatService.sendVoiceNote(...)` (not detached from the object).
 */
export const chatService = {
  /**
   * Fetch messages for a specific exam request chat room
   */
  async getMessages(requestId: number): Promise<ApiResponse<ChatMessage[]>> {
    // Generic query descriptor understood by the backend: all rows of
    // `chat_messages` for this request, oldest first (chat display order).
    const query = {
      table: 'chat_messages',
      action: 'select',
      filters: [{ column: 'request_id', operator: 'eq', value: requestId }],
      sortField: 'created_at',
      sortAscending: true,
    };
    const res = await apiClient<{ data: ChatMessage[] }>('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    // The backend wraps rows in `{ data: [...] }`; unwrap and default to [].
    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data || [], error: null };
  },

  /**
   * Send a chat message
   */
  async sendMessage(input: SendChatMessageInput): Promise<ApiResponse<ChatMessage>> {
    // Insert one row into `chat_messages`; the backend returns the stored row.
    const query = {
      table: 'chat_messages',
      action: 'insert',
      data: input,
    };
    const res = await apiClient<{ data: ChatMessage }>('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data || null, error: null };
  },

  /**
   * Send a voice note message
   */
  async sendVoiceNote(
    requestId: number,
    senderId: string,
    mediaUrl: string,
    durationSecs: number = 0
  ): Promise<ApiResponse<ChatMessage>> {
    // Both the newer `media_*` columns and the legacy `is_voice` /
    // `voice_url` / `voice_duration` columns are filled, for compatibility
    // with code that reads either set. `message` is a placeholder text label.
    return this.sendMessage({
      request_id: requestId,
      sender_id: senderId,
      message: '🎤 Voice Note',
      message_type: 'voice',
      media_url: mediaUrl,
      media_duration: durationSecs,
      is_voice: true,
      voice_url: mediaUrl,
      voice_duration: durationSecs,
    });
  },

  /**
   * Send an image message
   */
  async sendImageMessage(
    requestId: number,
    senderId: string,
    imageUrl: string,
    caption?: string
  ): Promise<ApiResponse<ChatMessage>> {
    // `imageUrl` must already be an uploaded file URL; the caption doubles as
    // the message text, falling back to a generic "Photo" label.
    return this.sendMessage({
      request_id: requestId,
      sender_id: senderId,
      message: caption || '📷 Photo',
      message_type: 'image',
      media_url: imageUrl,
    });
  },
};
