/**
 * Legacy route: /console/common/notifications
 *
 * There is no standalone notifications screen any more — notifications are a
 * tab ('notifications', rendered by SharedNotificationsView) inside the student
 * and scribe dashboards. This file exists only so that old deep links,
 * bookmarks or push-notification URLs pointing at this path keep working:
 * it immediately redirects to /console (app/console/index.tsx), which then
 * routes the user to the dashboard for their role. It loads no data.
 */
import { Redirect } from 'expo-router';

/**
 * Route component that renders nothing and redirects to `/console`.
 *
 * @returns An expo-router `<Redirect>` element.
 */
export default function NotificationsRouteRedirect() {
  return <Redirect href="/console" />;
}
