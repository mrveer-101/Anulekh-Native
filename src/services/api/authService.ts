/**
 * Authentication & Session API Service
 */

import { apiClient, ApiResponse } from './client';
import { User, UserProfile } from '../../types';

export interface AuthSuccessResponse {
  user: User;
  profile?: UserProfile;
}

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
    return apiClient<AuthSuccessResponse>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, phone, otp, password: password || '', role }),
    });
  },

  /**
   * Delete account (Mandatory for Apple App Store Review Guideline 5.1.1)
   */
  async deleteAccount(userId: string): Promise<ApiResponse<{ success: boolean }>> {
    return apiClient<{ success: boolean }>('/api/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },
};
