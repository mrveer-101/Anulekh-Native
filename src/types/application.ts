/**
 * Scribe Application & Assignment Domain Types
 */
/**
 * Shapes of rows from the `scribe_applications` table (a scribe volunteering
 * for a student's exam request) and the `assignment_requests` table (a
 * student's request for help with an assignment rather than an exam).
 * Re-exported through `@/types` (types/index.ts) and consumed mainly by
 * services/api/applicationService.ts.
 */

/**
 * Lifecycle of a scribe's application to an exam request:
 * `pending` (submitted), `accepted` (the student picked this scribe),
 * `rejected` (the student declined it) or `withdrawn`.
 */
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

/**
 * Subset of the applying scribe's `profiles` row, shown to the student so they
 * can judge the applicant. Yes/no flags such as `first_time` are stored as
 * the strings 'yes' / 'no' rather than booleans.
 */
export interface ScribeApplicantProfile {
  full_name: string;
  phone: string;
  education_level: string;
  languages?: string[];
  location?: string;
  occupation?: string;
  first_time?: string;
  verification_status?: string;
}

/**
 * One row of `scribe_applications`. `request_id` points at `exam_requests.id`
 * and `scribe_id` at the scribe's user id. `status` is widened to `string`
 * because the backend may return values outside {@link ApplicationStatus}.
 * `rating`, `achievements` and `profile` are optional client-side enrichment
 * fields (computed from other tables), not columns of the table itself.
 */
export interface ScribeApplication {
  id: number;
  request_id: number;
  scribe_id: string;
  scribe_name: string;
  status: ApplicationStatus | string;
  created_at: string;
  rating?: number;
  achievements?: string[];
  profile?: ScribeApplicantProfile;
}

/**
 * One row of `assignment_requests`, linking a student and a scribe for an
 * assignment. `exam_request` is untyped (`any`) and is an optional related
 * request record a caller may attach. Currently not imported anywhere.
 */
export interface AssignmentRequest {
  id: number;
  request_id: number;
  student_id: string;
  scribe_id: string;
  status: string;
  created_at: string;
  exam_request?: any;
}
