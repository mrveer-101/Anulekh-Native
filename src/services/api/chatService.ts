/**
 * Chat & Messages API Service
 */

import { apiClient, ApiResponse } from './client';
import { ChatMessage, SendChatMessageInput } from '../../types';

export const chatService = {
  /**
   * Fetch messages for a specific exam request chat room
   */
  async getMessages(requestId: number): Promise<ApiResponse<ChatMessage[]>> {
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

    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data || [], error: null };
  },

  /**
   * Send a chat message
   */
  async sendMessage(input: SendChatMessageInput): Promise<ApiResponse<ChatMessage>> {
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
};
