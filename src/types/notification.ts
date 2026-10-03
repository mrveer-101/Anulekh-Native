/**
 * Notification Domain Types
 */

/**
 * Shared TypeScript shape for in-app notifications (re-exported from `types/index.ts`).
 *
 * Mirrors a row of the backend `notifications` table, which the Rust/Axum
 * backend creates when e.g. a scribe applies to or accepts an exam request.
 * Note: screens currently query the table directly through the `supabase`
 * shim and filter on an `is_read` column, so this interface's `read` field
 * may not match the live column name.
 */

/**
 * A single notification shown in a user's notification list.
 *
 * - `id`         numeric primary key.
 * - `user_id`    id of the user who receives the notification.
 * - `title`      short heading shown in bold.
 * - `message`    body text.
 * - `type`       optional free-form category tag.
 * - `read`       whether the user has already seen it.
 * - `created_at` ISO timestamp string.
 * - `action_url` optional in-app route to open when the notification is tapped.
 */
export interface NotificationItem {
  id: number;
  user_id: string;
  title: string;
  message: string;
  type?: string;
  read: boolean;
  created_at: string;
  action_url?: string;
}
