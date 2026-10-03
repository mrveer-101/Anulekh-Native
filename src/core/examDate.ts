/**
 * examDate — pure date helpers for exam scheduling rules (no network, no state).
 *
 * Used by the student views (StudentHomeView, StudentPlanView, StudentRequestsView, StudentHomePCView),
 * the scribe views (ScribeExploreView, ScribeCommitmentsView) and the chat screen
 * (app/console/common/chat.tsx) to decide things like "is this exam today / already over" and whether a
 * scribe may still withdraw (the 24-hour lock in `canScribeWithdraw`).
 * All functions work in the device's local time zone.
 */
// Utilities for interpreting the free-text `exam_date` values stored on exam_requests.
// Exam dates come in two shapes across the app:
//   • Form format:  "24/07/2026 | 12:00 PM"  (DD/MM/YYYY | HH:MM AM/PM)
//   • Seed format:   "2026-07-10 10:00 AM"    (YYYY-MM-DD HH:MM AM/PM)
// These helpers parse whichever is present and return null when nothing usable is found,
// so callers can fail open (never hide/lock based on an unparseable date).

/**
 * Parses an `exam_date` string in either supported format into a local `Date`.
 *
 * @param examDate Raw value from exam_requests.exam_date (may be empty/null).
 * @returns The exam's date at the parsed time (midnight if no "HH:MM AM/PM" part is present),
 *          or null when no DD/MM/YYYY or YYYY-MM-DD date can be found.
 */
export function parseExamDate(examDate?: string | null): Date | null {
  if (!examDate) return null;

  // Extract time (optional)
  let hour = 0;
  let minute = 0;
  let hasTime = false;
  const timeMatch = examDate.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    hasTime = true;
  }

  // Try DD/MM/YYYY (form format)
  const dmy = examDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10);
    const d = new Date(year, month, day, hour, minute);
    return isNaN(d.getTime()) ? null : d;
  }

  // Try YYYY-MM-DD (seed format)
  const ymd = examDate.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10) - 1;
    const day = parseInt(ymd[3], 10);
    const d = new Date(year, month, day, hour, minute);
    return isNaN(d.getTime()) ? null : d;
  }

  // Time-only or nothing recognisable
  void hasTime;
  return null;
}

// True when the exam falls on today's calendar date.
export function isExamToday(examDate?: string | null): boolean {
  const d = parseExamDate(examDate);
  if (!d) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// True when the exam's date/time is already in the past.
// When the exam has no parseable time we treat "end of that day" as the cutoff.
export function isExamPast(examDate?: string | null): boolean {
  const d = parseExamDate(examDate);
  if (!d) return false;
  const now = new Date();
  const hasTime = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.test(examDate || '');
  if (!hasTime) {
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    return now.getTime() > endOfDay.getTime();
  }
  return now.getTime() > d.getTime();
}

// Hours remaining until the exam (may be negative if past). null when unparseable.
export function hoursUntilExam(examDate?: string | null): number | null {
  const d = parseExamDate(examDate);
  if (!d) return null;
  return (d.getTime() - Date.now()) / (1000 * 60 * 60);
}

// Evaluate whether a scribe is permitted to withdraw from an application / commitment.
// Rule: Scribe can withdraw ONLY IF there are MORE than 24 hours remaining before the exam date/time.
// Under 24 hours, withdrawal is locked to protect the student.
export function canScribeWithdraw(examDate?: string | null): { allowed: boolean; hoursRemaining: number | null; reason?: string } {
  const hours = hoursUntilExam(examDate);
  // Unparseable date: fail open (allow) rather than trap the scribe in a commitment.
  if (hours === null) {
    return { allowed: true, hoursRemaining: null };
  }
  if (hours <= 24) {
    return {
      allowed: false,
      hoursRemaining: Math.max(0, Math.round(hours)),
      reason: 'Withdrawal is locked within 24 hours of the scheduled exam date to protect the student.',
    };
  }
  return { allowed: true, hoursRemaining: Math.round(hours) };
}

/**
 * Placeholder default export that renders nothing. This module is a utility, not a screen; the
 * null-returning component only exists so tooling that expects a default export (e.g. Expo Router's
 * route scanning, if the file is ever picked up as a route) finds one and stays quiet.
 */
export default function ExamDateNonRoute() {
  return null;
}

