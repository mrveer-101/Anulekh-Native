/**
 * Chat & Messaging Domain Types
 */
/**
 * Row shapes for the `chat_messages` table, the per-exam-request chat between
 * a student and their scribe. Re-exported through `@/types` (types/index.ts)
 * and used by services/api/chatService.ts.
 */

/**
 * One stored chat message. Each chat room is keyed by `request_id`
 * (`exam_requests.id`); `sender_id` is the author's user id.
 *
 * Media fields come in two overlapping sets: the generic `message_type` /
 * `media_url` / `media_duration`, and the voice-specific `is_voice` /
 * `voice_url` / `voice_duration`. chatService.sendVoiceNote fills both sets
 * with the same values, so readers can rely on either. For voice and image
 * messages `message` holds a placeholder label (or the image caption).
 */
export interface ChatMessage {
  id: number;
  request_id: number;
  sender_id: string;
  message: string;
  created_at: string;
  message_type?: 'text' | 'voice' | 'image';
  media_url?: string;
  media_duration?: number;
  is_voice?: boolean;
  voice_url?: string;
  voice_duration?: number;
}

/**
 * Payload inserted into `chat_messages` by chatService.sendMessage: the same
 * as {@link ChatMessage} minus the server-generated `id` and `created_at`.
 */
export interface SendChatMessageInput {
  request_id: number;
  sender_id: string;
  message: string;
  message_type?: 'text' | 'voice' | 'image';
  media_url?: string;
  media_duration?: number;
  is_voice?: boolean;
  voice_url?: string;
  voice_duration?: number;
}
