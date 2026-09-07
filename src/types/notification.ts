/**
 * Notification Domain Types
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
