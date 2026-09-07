/**
 * Scribe Application API Service
 */

import { apiClient, ApiResponse } from './client';
import { ScribeApplication } from '../../types';

export const applicationService = {
  /**
   * Fetch all applications submitted for a specific exam request
   */
  async getApplicationsForRequest(requestId: number): Promise<ApiResponse<ScribeApplication[]>> {
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
