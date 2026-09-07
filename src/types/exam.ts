/**
 * Exam Request & Scheduling Domain Types
 */

export type ExamStatus = 'open' | 'applied' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export interface ScribeProfileSnippet {
  full_name: string;
  phone: string;
  education_level: string;
  occupation?: string;
  avatar_url?: string;
}

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
  status: string;
  created_at: string;
  subject?: string;
  exam_date?: string;
  exam_venue?: string;
  applicationCount?: number;
  scribe_id?: string;
  is_emergency?: string | boolean;
  private_scribe_id?: string;
  city?: string;
  state?: string;
  special_instructions?: string;
  scribeProfile?: ScribeProfileSnippet;
}

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
