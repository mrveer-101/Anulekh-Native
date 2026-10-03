/**
 * Unified Domain Type Exports
 */

/**
 * Barrel file: import domain types from `../types` (e.g. `import { UserProfile } from '../../types'`)
 * instead of reaching into the individual modules. Each module mirrors the shape of rows returned by
 * the Rust/Axum backend's tables, so field names stay snake_case to match the database columns.
 */
// User, UserProfile, UserRole, VerificationStatus (`profiles` table, auth roles).
export * from './user';
// ExamRequest, ExamStatus, ScribeProfileSnippet (`exam_requests` table).
export * from './exam';
// ScribeApplication, ApplicationStatus, assignment payloads (`scribe_applications` table).
export * from './application';
// ChatMessage and SendChatMessageInput (`chat_messages` table), including voice/image message fields.
export * from './chat';
// NotificationItem (`notifications` table).
export * from './notification';
