/**
 * User & Profile Domain Types
 */

export type UserRole = 'student' | 'scribe' | 'admin';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface User {
  id: string;
  email: string;
  phone?: string;
  role: UserRole;
  verification_status: VerificationStatus;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone?: string;
  city?: string;
  state?: string;
  pincode?: string;
  disability_type?: string;
  disability_percentage?: number;
  education_level?: string;
  languages_known?: string[];
  id_proof_url?: string;
  disability_cert_url?: string;
  profile_photo_url?: string;
  bio?: string;
  rating?: number;
  completed_exams_count?: number;
  verification_status?: VerificationStatus;
  rejection_reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthSession {
  user: User;
  profile?: UserProfile | null;
  token?: string;
}
