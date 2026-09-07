/**
 * Exam Request API Service
 */

import { apiClient, ApiResponse } from './client';
import { ExamRequest, CreateExamRequestInput } from '../../types';

export const examService = {
  /**
   * Fetch all exam requests created by a student
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
