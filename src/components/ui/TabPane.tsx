/**
 * TabPane — UI primitive for the portal consoles' tab bodies.
 *
 * Used by the student and scribe consoles (app/console/student/index.tsx, app/console/scribe/index.tsx)
 * and their desktop counterparts (ConsoleStudentPC, ConsoleScribePC), which wrap each tab's view in a
 * <TabPane active={currentTab === '...'}>. Tab views (StudentHomeView, StudentPlanView, ScribeHomeView,
 * ScribeExploreView, ScribeCommitmentsView, ...) call `useTabActive()` to know whether they are on screen.
 * Loads no data itself; it only controls mounting/visibility and exposes the "active" flag via context.
 */
import React, { createContext, useContext, useState } from 'react';
import { View } from 'react-native';

/**
 * Keep-alive container for a portal tab.
 *
 * A tab's screen is created the first time it is opened and then kept: switching away only hides it
 * (`display: 'none'`), so coming back is instant and keeps scroll position, expanded cards and data.
 * Screens read `useTabActive()` to refresh only while visible and to pause looping animations.
 */

/**
 * Context carrying whether the enclosing TabPane is the visible tab.
 * Defaults to `true` so components rendered outside any TabPane behave as always-active.
 */
const TabActiveContext = createContext(true);

/** True while the surrounding tab is the visible one (always true outside a TabPane). */
export const useTabActive = () => useContext(TabActiveContext);

/**
 * Wraps one tab's content and keeps it alive after its first visit.
 *
 * @param props.active   Whether this tab is currently selected. The first time it becomes true the
 *                       children are mounted; afterwards they stay mounted and are hidden with
 *                       `display: 'none'` whenever `active` is false.
 * @param props.children The tab's screen content.
 * @returns `null` until the tab has been visited, otherwise a flex-1 View providing TabActiveContext.
 */
export function TabPane({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Mount lazily: nothing is created until the tab is opened for the first time.
  const [visited, setVisited] = useState(active);
  if (active && !visited) setVisited(true);
  if (!visited) return null;

  // Hide (rather than unmount) inactive tabs so their state survives tab switches.
  return (
    <TabActiveContext.Provider value={active}>
      <View style={[{ flex: 1 }, !active && { display: 'none' }]}>{children}</View>
    </TabActiveContext.Provider>
  );
}
