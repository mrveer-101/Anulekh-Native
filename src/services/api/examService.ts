/**
 * Exam Request API Service
 */
/**
 * Typed wrapper around the `exam_requests` table, talking to the Rust/Axum backend's generic
 * POST /api/query endpoint through `apiClient` (services/api/client.ts). Each method builds the same
 * `{ table, action, filters, data, sortField, sortAscending, single }` body that the `supabase` shim
 * (core/supabase.ts) sends, then unwraps the backend's `{ data }` envelope into an `ApiResponse`.
 *
 * Exported via the services/api barrel; at the time of writing no screen imports it — screens query
 * `exam_requests` through the `supabase` shim directly. Note that this service uses status 'open'
 * for new/explorable requests, whereas the screens use 'pending'.
 */

import { apiClient, ApiResponse } from './client';
import { ExamRequest, CreateExamRequestInput } from '../../types';

/**
 * Exam-request operations. Every method resolves (never rejects) to `{ data, error }`, with `error`
 * a user-facing string when the request failed.
 */
export const examService = {
  /**
   * Fetch all exam requests created by a student
   */
  /**
   * Reads `exam_requests` rows whose `phone` matches the student's phone, newest first.
   * @param phone Student phone in any format; non-digits are stripped before matching.
   * @returns The rows (empty array if none).
   */
  async getStudentRequests(phone: string): Promise<ApiResponse<ExamRequest[]>> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const query = {
      table: 'exam_requests',
      action: 'select',
      filters: [{ column: 'phone', operator: 'eq', value: cleanPhone }],
      sortField: 'created_at',
      sortAscending: false,
    };
    const res = await apiClient<{ data: ExamRequest[] }>('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data || [], error: null };
  },

  /**
   * Fetch open exam requests for scribes to explore
   */
  /**
   * Reads every `exam_requests` row with status 'open', newest first (for a scribe "explore" list).
   * @returns The rows (empty array if none).
   */
  async getExploreExams(): Promise<ApiResponse<ExamRequest[]>> {
    const query = {
      table: 'exam_requests',
      action: 'select',
      filters: [{ column: 'status', operator: 'eq', value: 'open' }],
      sortField: 'created_at',
      sortAscending: false,
    };
    const res = await apiClient<{ data: ExamRequest[] }>('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data || [], error: null };
  },

  /**
   * Fetch single exam request by ID
   */
  /**
   * Reads one `exam_requests` row by primary key (`single: true`).
   * @param id Exam request id.
   * @returns The row, or `data: null` when it does not exist.
   */
  async getExamById(id: number): Promise<ApiResponse<ExamRequest>> {
    const query = {
      table: 'exam_requests',
      action: 'select',
      filters: [{ column: 'id', operator: 'eq', value: id }],
      single: true,
    };
    const res = await apiClient<{ data: ExamRequest }>('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data || null, error: null };
  },

  /**
   * Create a new exam request
   */
  /**
   * Inserts a new `exam_requests` row from the form input, normalising `phone` to digits only and
   * forcing `status: 'open'`.
   * @param input Fields for the new request (see CreateExamRequestInput in types/exam.ts).
   * @returns What the backend echoes back — the inserted payload itself (it does not include a
   *          server-generated id).
   */
  async createRequest(input: CreateExamRequestInput): Promise<ApiResponse<ExamRequest>> {
    const cleanPhone = input.phone.replace(/[^0-9]/g, '');
    const payload = {
      ...input,
      phone: cleanPhone,
      status: 'open',
    };
    const query = {
      table: 'exam_requests',
      action: 'insert',
      data: payload,
    };
    const res = await apiClient<{ data: ExamRequest }>('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    if (res.error) return { data: null, error: res.error };
    return { data: res.data?.data || null, error: null };
  },

  /**
   * Cancel an exam request
   */
  /**
   * Soft-cancels a request by updating its row to `status: 'cancelled'` (the row is not deleted).
   * @param id Exam request id.
   * @returns `data: undefined` on success.
   */
  async cancelRequest(id: number): Promise<ApiResponse<void>> {
    const query = {
      table: 'exam_requests',
      action: 'update',
      filters: [{ column: 'id', operator: 'eq', value: id }],
      data: { status: 'cancelled' },
    };
    const res = await apiClient('/api/query', {
      method: 'POST',
      body: JSON.stringify(query),
    });

    if (res.error) return { data: null, error: res.error };
    return { data: undefined, error: null };
  },
};
