/**
 * Scribe Application API Service
 */

/**
 * Typed helpers for the `scribe_applications` table (a scribe "applying" to help with
 * a student's exam request) plus the `exam_requests` update that assigns a scribe.
 *
 * Every method POSTs a generic query object ({ table, action, filters, data, ... })
 * to the Rust/Axum backend's `/api/query` endpoint via `apiClient`, and returns an
 * `ApiResponse` ({ data, error }) instead of throwing.
 *
 * Re-exported by `services/api/index.ts`; not currently imported by any screen
 * (screens use the `supabase` shim in core/supabase.ts for the same tables).
 */

import { apiClient, ApiResponse } from './client';
import { ScribeApplication } from '../../types';

/** Namespace object of `scribe_applications` operations (fetch, submit, accept, reject). */
export const applicationService = {
  /**
   * Fetch all applications submitted for a specific exam request
   */
  async getApplicationsForRequest(requestId: number): Promise<ApiResponse<ScribeApplication[]>> {
    // SELECT * FROM scribe_applications WHERE request_id = requestId ORDER BY created_at DESC (newest first).
    const query = {
      table: 'scribe_applications',
      action: 'select',
      filters: [{ column: 'request_id', operator: 'eq', value: requestId }],
      sortField: 'created_at',
      sortAscending: false,
    };
    const res = await apiClient<{ data: ScribeApplication[] }>('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    // The backend wraps rows as { data: [...] }; unwrap it and default to an empty list.
    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data || [], error: null };
  },

  /**
   * Submit an application for an exam request as a scribe
   */
  async submitApplication(
    requestId: number,
    scribeId: string,
    scribeName: string
  ): Promise<ApiResponse<ScribeApplication>> {
    // Inserts a new row; every application starts in the 'pending' state until the student decides.
    const query = {
      table: 'scribe_applications',
      action: 'insert',
      data: {
        request_id: requestId,
        scribe_id: scribeId,
        scribe_name: scribeName,
        status: 'pending',
      },
    };
    const res = await apiClient<{ data: ScribeApplication }>('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data || null, error: null };
  },

  /**
   * Accept an application (assigning the scribe to the exam)
   */
  /**
   * Two sequential writes, not a transaction: if step 2 fails the application is
   * already marked 'accepted' but the request is not yet assigned. Other pending
   * applications for the same request are left untouched.
   *
   * @param requestId     `exam_requests.id` being filled.
   * @param applicationId `scribe_applications.id` being accepted.
   * @param scribeId      user id of the scribe, written to `exam_requests.scribe_id`.
   */
  async acceptApplication(requestId: number, applicationId: number, scribeId: string): Promise<ApiResponse<void>> {
    // 1. Mark application as accepted
    const appQuery = {
      table: 'scribe_applications',
      action: 'update',
      filters: [{ column: 'id', operator: 'eq', value: applicationId }],
      data: { status: 'accepted' },
    };
    const appRes = await apiClient('/api/query', {
      method: 'POST',
      body: JSON.stringify(appQuery),
    });
    if (appRes.error) return { data: null, error: appRes.error };

    // 2. Update exam request with assigned scribe_id and status 'assigned'
    const examQuery = {
      table: 'exam_requests',
      action: 'update',
      filters: [{ column: 'id', operator: 'eq', value: requestId }],
      data: {
        status: 'assigned',
        scribe_id: scribeId,
      },
    };
    const examRes = await apiClient('/api/query', {
      method: 'POST',
      body: JSON.stringify(examQuery),
    });
    if (examRes.error) return { data: null, error: examRes.error };

    return { data: undefined, error: null };
  },

  /**
   * Reject an application
   */
  async rejectApplication(applicationId: number): Promise<ApiResponse<void>> {
    // Only flips the application's status; the exam request itself is not changed.
    const query = {
      table: 'scribe_applications',
      action: 'update',
      filters: [{ column: 'id', operator: 'eq', value: applicationId }],
      data: { status: 'rejected' },
    };
    const res = await apiClient('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    if (res.error) return { data: null, error: res.error };
    return { data: undefined, error: null };
  },
};
