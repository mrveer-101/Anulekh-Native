# 5. Data model

The database is SQLite (Turso in production, `local.db` for development). The schema lives in
`Anulekh-Axum/schema.sql`; columns added later are applied by the additive migrations in
`Anulekh-Axum/src/db.rs` on every backend start.

## Tables

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id`, `email` (unique), `password` | Login identity. `email` may be a real email, a phone-based address (`91XXXXXXXXXX@anulekh.app`) or a plain test username. ⚠️ passwords are stored in plain text (see known issues). |
| `profiles` | `id` (= users.id), `full_name`, `phone`, `role` (`student`/`scribe`), `verification_status` (`unverified` → `pending` → `approved`), `languages` (JSON array), `location`, `aadhar_number`, `aadhar_image_proof`, `disability_type`, `disability_certificate`, `education_level`, `certification_proof`, `availability_slots` (comma list), `first_time`, `urgent_calls`, `is_sos_registered`, `sos_status`, `sos_dispatch_count`, `last_sos_dispatched_at` | One row per user. Document fields may contain base64 data URIs or R2 URLs. |
| `exam_requests` | `id`, `student_id`, `subject`, `exam_type`, `exam_date` (`YYYY-MM-DD \| time` text), `exam_venue`, `exam_language`, `status` (`pending`/`matched`/`completed`/`cancelled`), `scribe_id`, `is_emergency` (`yes`/`no`), `private_scribe_id`, `is_prebooking`, `admit_card_proof`, `created_at` | A student's request for an exam scribe. |
| `assignment_requests` | `id`, `student_id`, `subject`, `assignment_title`, `description`, `deadline`, `academic_level`, `page_count`, `status`, `scribe_id`, `attachments` | A request for a written-assignment helper. |
| `scribe_applications` | `id`, `request_id`, `scribe_id`, `scribe_name`, `status` (`pending`/`accepted`/`rejected`/`invited`), `type` (`exam`/`assignment`) | Applications by scribes and private invitations from students. |
| `chat_messages` | `id`, `request_id`, `sender_id`, `message`, `message_type` (`text`/`image`/`pdf`/`audio`), `media_url`, `media_duration` | Request-scoped chat. |
| `notifications` | `id`, `user_id`, `title`, `message`, `is_read` | In-app notifications (applications, matches, SOS, cancellations). |
| `scribe_reviews` | `request_id` (unique), `student_id`, `scribe_id`, `rating_punctuality`, `rating_communication`, `rating_speed`, `rating_behavior`, `rating_overall`, `remark` | Student → scribe rating after an exam. |
| `student_reviews` | `request_id` (unique), `student_id`, `scribe_id`, `rating_overall`, `remark` | Scribe → student rating; used to prioritise students in scribe rankings. |
| `scribe_achievements` | `scribe_id`, `badge_key`, `badge_title`, `badge_icon`, `unlocked_at` | Earned badges. |
| `certificates` | `scribe_id`, `certificate_hash` (unique), `title`, `total_jobs`, `total_hours` | Verifiable volunteer certificates (`/api/certificates/view/:scribe_id`). |
| `support_tickets` | `user_id`, `email`, `phone`, `issue_type`, `description`, `reference_image`, `status` | Help requests; managed in the admin panel. |

## Status lifecycles

```
exam_requests.status:      pending ──(student accepts an application)──▶ matched ──▶ completed
                              │  └─(≤ 24 h before exam, unmatched)──▶ is_emergency = 'yes' (SOS)
                              └──▶ cancelled / deleted
scribe_applications.status: invited (student invited scribe) ─┐
                            pending (scribe applied) ─────────┼──▶ accepted | rejected
profiles.verification_status: unverified ──(profile submitted)──▶ pending ──(admin)──▶ approved
```

## Who reads / writes what (app side)

| Screen | Reads | Writes |
|---|---|---|
| Student Home | profiles, exam_requests, assignment_requests | profiles (auto-approve, see known issues), notifications (SOS) |
| Student Requests | profiles, exam_requests, assignment_requests, scribe_applications | exam_requests (SOS, status, delete), scribe_applications, notifications, scribe_reviews |
| Scribe Home / Search | profiles, exam_requests, assignment_requests, scribe_applications, student_reviews, scribe_reviews | scribe_applications, exam_requests (accept invite), notifications, profiles (SOS switch) |
| Scribe Applied | scribe_applications, exam_requests, assignment_requests, reviews | scribe_applications (withdraw), student_reviews |
| Account | profiles | profiles; `/api/auth/delete-account` |
