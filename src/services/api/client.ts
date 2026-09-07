/**
 * Unified HTTP API Client for Anulekh Backend
 */

import { Platform } from 'react-native';

export const API_BASE_URL = (
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  (window?.location?.hostname === 'localhost' || window?.location?.hostname === '127.0.0.1')
)
  ? 'http://localhost:3000'
  : (process.env.EXPO_PUBLIC_API_URL || 'https://anulekh-axum.onrender.com');

export interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
}

export function formatApiError(err: any, fallback = 'An unexpected error occurred'): string {
  const msg = err?.message ? String(err.message) : (typeof err === 'string' ? err : '');
  if (/network request failed/i.test(msg) || /failed to fetch/i.test(msg) || /load failed/i.test(msg)) {
    return 'Not connected to server. Please check your internet connection or try again later.';
  }
  return msg || fallback;
}

export async function apiClient<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      const errorMsg = typeof body === 'object' && body?.error
        ? body.error
        : (typeof body === 'string' && body ? body : `Request failed with status ${res.status}`);
      return { data: null, error: formatApiError(errorMsg) };
    }

    return { data: body as T, error: null };
  } catch (err: any) {
    return { data: null, error: formatApiError(err) };
  }
}
