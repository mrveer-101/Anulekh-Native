/**
 * User Profile API Service
 */

import { apiClient, ApiResponse } from './client';
import { UserProfile } from '../../types';

export const profileService = {
  /**
   * Fetch profile for a specific user ID
   */
  async getProfile(userId: string): Promise<ApiResponse<UserProfile>> {
    const query = {
      table: 'profiles',
      action: 'select',
      filters: [{ column: 'user_id', operator: 'eq', value: userId }],
      single: true,
    };
    const res = await apiClient<{ data: UserProfile }>('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data || null, error: null };
  },

  /**
   * Upsert / update profile details
   */
  async updateProfile(userId: string, data: Partial<UserProfile>): Promise<ApiResponse<UserProfile>> {
    // Check if profile exists first
    const existing = await this.getProfile(userId);

    if (existing.data) {
      const updateQuery = {
        table: 'profiles',
        action: 'update',
        filters: [{ column: 'user_id', operator: 'eq', value: userId }],
        data,
      };
      const res = await apiClient<{ data: UserProfile }>('/api/query', {
        method: 'POST',
        body: JSON.stringify(updateQuery),
      });
      if (res.error) return { data: null, error: res.error };
      return { data: res.data?.data || null, error: null };
    } else {
      const insertQuery = {
        table: 'profiles',
        action: 'insert',
        data: {
          ...data,
          user_id: userId,
        },
      };
      const res = await apiClient<{ data: UserProfile }>('/api/query', {
        method: 'POST',
        body: JSON.stringify(insertQuery),
      });
      if (res.error) return { data: null, error: res.error };
      return { data: res.data?.data || null, error: null };
    }
  },
};
