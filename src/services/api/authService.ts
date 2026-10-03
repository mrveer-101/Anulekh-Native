/**
 * Authentication & Session API Service
 */
/**
 * Typed wrappers around the Axum backend's `/api/auth/*` endpoints, built on
 * `apiClient` (services/api/client.ts), so every method resolves to
 * `{ data, error }` and never throws.
 *
 * Unlike `supabase.auth` in core/supabase.ts, these methods do NOT store a
 * session in AsyncStorage — callers must persist the returned user themselves.
 * At the time of writing the screens (login, register, settings) call
 * `supabase.auth` / `fetch` directly and this service is only re-exported from
 * services/api/index.ts.
 */

import { apiClient, ApiResponse } from './client';
import { User, UserProfile } from '../../types';

/**
 * Body returned by successful sign-in / sign-up calls.
 * `user` is the account row; `profile` is optional and is not sent by the
 * current backend's signin/signup handlers.
 */
export interface AuthSuccessResponse {
  user: User;
  profile?: UserProfile;
}

/**
 * Authentication API. Each method POSTs a JSON body to one auth endpoint.
 * A missing password is sent as an empty string.
 */
export const authService = {
  /**
   * Sign in with email or phone number and password
   */
  async login(identifier: string, password?: string): Promise<ApiResponse<AuthSuccessResponse>> {
    return apiClient<AuthSuccessResponse>('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ identifier, password: password || '' }),
    });
  },

  /**
   * Register a new account
   */
  async signup(email: string, password?: string): Promise<ApiResponse<AuthSuccessResponse>> {
    return apiClient<AuthSuccessResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password: password || '' }),
    });
  },

  /**
   * Send OTP to email / phone for registration or verification
   */
  async sendOtp(email: string, phone: string): Promise<ApiResponse<{ message: string }>> {
    return apiClient<{ message: string }>('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email, phone }),
    });
  },

  /**
   * Verify 6-digit OTP
   */
  async verifyOtp(
    email: string,
    phone: string,
    otp: string,
    password?: string,
    role?: string
  ): Promise<ApiResponse<AuthSuccessResponse>> {
    // NOTE: the Axum router (Anulekh-Axum/src/main.rs) exposes
    // `/api/auth/verify-otp-signup` (expects full_name, email_otp, mobile_otp),
    // not `/api/auth/verify-otp`, so this call would currently fail.
    // app/auth/register.tsx calls the real endpoint with fetch instead.
    return apiClient<AuthSuccessResponse>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, phone, otp, password: password || '', role }),
    });
  },

  /**
   * Delete account (Mandatory for Apple App Store Review Guideline 5.1.1)
   */
  async deleteAccount(userId: string): Promise<ApiResponse<{ success: boolean }>> {
    // Backend removes the user's chat_messages, notifications, scribe_applications,
    // exam_requests (as student or scribe), profiles row and users row.
    // It does not clear the local AsyncStorage session — call supabase.auth.signOut() too.
    return apiClient<{ success: boolean }>('/api/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },
};
