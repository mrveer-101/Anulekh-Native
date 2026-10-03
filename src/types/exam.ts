/**
 * Exam Request & Scheduling Domain Types
 */

/**
 * Shapes for rows of the backend `exam_requests` table (one row per exam a
 * visually-impaired student needs a scribe for) and the payload used to create one.
 * Re-exported through `types/index.ts`; consumed by `services/api/examService.ts`.
 * Many screens declare their own local copy of these interfaces instead of importing them.
 */

/**
 * Intended lifecycle states of an exam request.
 * Note: the screens actually read/write values such as 'pending', 'matched' and
 * 'completed' on `exam_requests.status`, which is why `ExamRequest.status` is a plain `string`.
 */
export type ExamStatus = 'open' | 'applied' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

/** Subset of a scribe's `profiles` row, for showing the assigned scribe alongside a request. */
export interface ScribeProfileSnippet {
  full_name: string;
  phone: string;
  education_level: string;
  occupation?: string;
  avatar_url?: string;
}

/** One row of the `exam_requests` table as returned by the backend (snake_case = column names). */
export interface ExamRequest {
  id: number;
  student_name: string;
  dob?: string;
  education_grade?: string;
  phone?: string;
  emergency_phone?: string | null;
  exam_type: string;
  exam_language: string;
  id_proof?: string;
  // Free-form string in practice (see the ExamStatus note above).
  status: string;
  created_at: string;
  subject?: string;
  exam_date?: string;
  exam_venue?: string;
  // Optional UI extra, not an `exam_requests` column (no current code populates it).
  applicationCount?: number;
  // User id of the assigned scribe once the request is matched.
  scribe_id?: string;
  // SOS / urgent flag; the screens compare it against the string 'yes'.
  is_emergency?: string | boolean;
  // Set when the student invites one specific scribe; other scribes' Explore feed hides such requests.
  private_scribe_id?: string;
  city?: string;
  state?: string;
  special_instructions?: string;
  // Optional joined scribe details, not an `exam_requests` column (no current code populates it).
  scribeProfile?: ScribeProfileSnippet;
}

/**
 * Payload for inserting a new `exam_requests` row (see examService.createRequest).
 * Unlike ExamRequest, `phone`, `exam_date` and `exam_venue` are required here.
 */
export interface CreateExamRequestInput {
  student_name: string;
  dob?: string;
  education_grade?: string;
  phone: string;
  emergency_phone?: string | null;
  exam_type: string;
  exam_sub_topic?: string | null;
  exam_language: string;
  subject?: string;
  exam_date: string;
  exam_venue: string;
  id_proof?: string;
  is_emergency?: boolean | string;
  private_scribe_id?: string;
}
