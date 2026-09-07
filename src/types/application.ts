/**
 * Scribe Application & Assignment Domain Types
 */

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

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

export interface AssignmentRequest {
  id: number;
  request_id: number;
  student_id: string;
  scribe_id: string;
  status: string;
  created_at: string;
  exam_request?: any;
}
