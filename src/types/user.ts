/**
 * User & Profile Domain Types
 */

/**
 * Shared TypeScript shapes for accounts and profiles (re-exported from
 * `types/index.ts`). Used by `services/api/authService.ts` and
 * `services/api/profileService.ts`, which talk to the Rust/Axum backend.
 * A `User` is the login account; a `UserProfile` holds the personal,
 * accessibility and verification details for that account.
 */

/**
 * Which side of the platform an account belongs to:
 * `student` (visually-impaired exam taker), `scribe` (volunteer writer)
 * or `admin` (reviews documents and verifies users).
 */
export type UserRole = 'student' | 'scribe' | 'admin';

/**
 * Document-verification lifecycle of an account:
 * `unverified` (nothing uploaded) -> `pending` (awaiting admin review)
 * -> `verified` or `rejected` (see `UserProfile.rejection_reason`).
 */
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

/**
 * Core login account record, as returned by the
 * auth endpoints. Profile details live separately in `UserProfile`.
 */
export interface User {
  id: string;
  email: string;
  phone?: string;
  role: UserRole;
  verification_status: VerificationStatus;
  created_at?: string;
  updated_at?: string;
}

/**
 * Extended profile linked to a `User` via `user_id`. Most fields are
 * optional because they are filled in progressively during onboarding.
 * Student-only fields: `disability_type`, `disability_percentage`,
 * `disability_cert_url`. Scribe-facing fields: `rating`,
 * `completed_exams_count`, `bio`. Document URLs (`id_proof_url`,
 * `disability_cert_url`, `profile_photo_url`) point at uploaded files
 * that admins review before setting `verification_status`.
 */
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

/**
 * Logged-in session bundle: the account, its profile (null/absent if not
 * created yet) and the optional bearer token issued by the backend.
 */
export interface AuthSession {
  user: User;
  profile?: UserProfile | null;
  token?: string;
}
