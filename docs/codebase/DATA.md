# Data

SQLite — Turso in production, `local.db` in development. Schema: `Anulekh-Axum/schema.sql`; later
columns are added by the migrations in `Anulekh-Axum/src/db.rs` at every start.

## Tables

| Table | Holds | Key columns |
|---|---|---|
| `users` | Login | `id`, `email` (email, phone address or username), `password` ⚠️ plain text |
| `profiles` | One per user | `role`, `verification_status`, `full_name`, `phone`, `languages`, `location`, ID / certificate proofs, `availability_slots`, SOS fields |
| `exam_requests` | Exam scribe requests | `student_id`, `subject`, `exam_date` (text), `exam_venue`, `status`, `scribe_id`, `is_emergency`, `private_scribe_id` |
| `assignment_requests` | Assignment help | `student_id`, `assignment_title`, `deadline`, `status`, `scribe_id` |
| `scribe_applications` | Applications + invites | `request_id`, `scribe_id`, `status`, `type` (`exam`/`assignment`) |
| `chat_messages` | Per-request chat | `request_id`, `sender_id`, `message_type` (`text`/`image`/`pdf`/`audio`), `media_url` |
| `notifications` | In-app alerts | `user_id`, `title`, `message`, `is_read` |
| `scribe_reviews` / `student_reviews` | Ratings after an exam | `request_id`, ratings, `remark` |
| `scribe_achievements`, `certificates` | Badges, verifiable certificates | `scribe_id`, … |
| `support_tickets` | Help requests (admin panel) | `user_id`, `issue_type`, `status` |

## Status lifecycles

```
exam_requests        pending ──accept──▶ matched ──▶ completed        (≤ 24 h & unmatched → is_emergency='yes')
scribe_applications  invited / pending ──▶ accepted | rejected
verification         unverified ──submit──▶ pending ──admin──▶ approved
```
