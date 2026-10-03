/**
 * User Profile API Service
 */

/**
 * Thin typed wrapper around the backend's generic `/api/query` endpoint for the `profiles` table.
 * Each call posts a JSON query descriptor ({ table, action, filters, data, single }) which the
 * Rust/Axum server translates into SQL, and resolves to an `ApiResponse` ({ data, error }) rather
 * than throwing. Re-exported from `services/api/index.ts`, but no screen imports it today — screens
 * read/write `profiles` through the `supabase` shim (core/supabase) directly.
 */
import { apiClient, ApiResponse } from './client';
import { UserProfile } from '../../types';

/**
 * Profile operations keyed by the auth user id. NOTE: these filter on a `user_id` column, but the
 * backend schema (Anulekh-Axum/schema.sql) keys `profiles` by `id` (= users.id) and has no
 * `user_id` column — every screen uses `.eq('id', userId)` instead — so this service is
 * currently unused and would not match rows as written.
 * Methods use `this`, so call them as `profileService.getProfile(...)` rather than destructuring.
 */
export const profileService = {
  /**
   * Fetch profile for a specific user ID
   */
  async getProfile(userId: string): Promise<ApiResponse<UserProfile>> {
    // `single: true` asks the backend for one row object instead of an array.
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
    // The backend wraps rows as { data: ... }; unwrap so callers get the profile itself (or null).
    return { data: res.data?.data || null, error: null };
  },

  /**
   * Upsert / update profile details
   */
  /*
   * @param userId Auth user id whose profile row is written.
   * @param data   Columns to set; on insert, `user_id` is added automatically.
   * @returns The written profile row, or an error string. Note this is read-then-write, not an
   *          atomic upsert, so two concurrent first-time saves could both take the insert branch.
   */
  async updateProfile(userId: string, data: Partial<UserProfile>): Promise<ApiResponse<UserProfile>> {
    // Check if profile exists first
    const existing = await this.getProfile(userId);

    // Row exists: update only the supplied columns, matched by user_id.
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
      // No row yet (first profile save): insert a new one linked to this user.
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
