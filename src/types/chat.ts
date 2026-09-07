/**
 * Chat & Messaging Domain Types
 */

export interface ChatMessage {
  id: number;
  request_id: number;
  sender_id: string;
  message: string;
  created_at: string;
  is_voice?: boolean;
  voice_url?: string;
  voice_duration?: number;
}

export interface SendChatMessageInput {
  request_id: number;
  sender_id: string;
  message: string;
}
