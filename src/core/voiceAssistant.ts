/**
 * voiceAssistant.ts — Anulekh Voice AI Engine (KISS architecture)
 *
 * Provides central voice actions for iOS Siri & In-App Voice Assistant:
 * 1. Speaks aloud using native iOS TTS (expo-speech).
 * 2. Inquiries: queries pending applications and speaks them aloud.
 * 3. Voice Acceptance: matches and accepts a scribe by spoken name.
 * 4. Voice Chat: sends a message to the matched scribe and notifies their device.
 * 5. Emergency SOS: triggers voice emergency broadcast.
 * 6. Intent parser: interprets spoken sentences into concrete actions.
 */

import * as Speech from 'expo-speech';
import { supabase } from '@/core/supabase';
import { sendActionNotification } from '@/core/notificationWatcher';
import { router } from 'expo-router';

export type VoiceActionResult = {
  success: boolean;
  message: string;
  spokenResponse: string;
  actionType: 'check_scribes' | 'accept_scribe' | 'send_message' | 'create_request' | 'sos' | 'unknown';
  data?: any;
};

/**
 * Speak text aloud using natural system speech synthesis (Apple AVFoundation on iOS)
 */
export async function speakAloud(text: string, language: string = 'en-US'): Promise<void> {
  try {
    await Speech.stop();
    Speech.speak(text, {
      language,
      pitch: 1.0,
      rate: 0.95,
    });
  } catch (err) {
    console.warn('Speech error:', err);
  }
}

/**
 * Stop any ongoing speech playback
 */
export function stopSpeech(): void {
  try {
    Speech.stop();
  } catch (err) {
    // quiet
  }
}

/**
 * 1. Check pending scribe applications for the logged-in student's active exam.
 */
export async function voiceCheckScribeApplications(): Promise<VoiceActionResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      const msg = 'Please log in to check your scribe applications.';
      speakAloud(msg);
      return { success: false, message: msg, spokenResponse: msg, actionType: 'check_scribes' };
    }

    // 1. Get student's most recent active or pending exam request
    const { data: exams, error: examErr } = await supabase
      .from('exam_requests')
      .select('*')
      .eq('student_id', session.user.id)
      .order('id', { ascending: false })
      .limit(1);

    if (examErr || !exams || exams.length === 0) {
      const msg = "You don't have any active exam requests right now. Would you like to create one?";
      speakAloud(msg);
      return { success: true, message: msg, spokenResponse: msg, actionType: 'check_scribes' };
    }

    const currentExam = exams[0];

    // If already matched
    if (currentExam.status === 'matched' && currentExam.scribe_id) {
      const { data: scribeProfile } = await supabase
        .from('profiles')
        .select('full_name, official_name, phone')
        .eq('id', currentExam.scribe_id)
        .single();

      const scribeName = scribeProfile?.official_name || scribeProfile?.full_name || 'Your confirmed scribe';
      const msg = `You are already matched with ${scribeName} for your ${currentExam.subject || 'exam'}. Calling unlocks 24 hours prior to exam time.`;
      speakAloud(msg);
      return { success: true, message: msg, spokenResponse: msg, actionType: 'check_scribes', data: currentExam };
    }

    // 2. Fetch applications for this request
    const { data: apps, error: appErr } = await supabase
      .from('scribe_applications')
      .select('*')
      .eq('request_id', currentExam.id)
      .eq('status', 'pending');

    if (appErr || !apps || apps.length === 0) {
      const msg = `No scribes have applied yet for your ${currentExam.subject || 'exam'}. Your request is visible to all nearby volunteers.`;
      speakAloud(msg);
      return { success: true, message: msg, spokenResponse: msg, actionType: 'check_scribes', data: [] };
    }

    // 3. Format spoken summary
    const count = apps.length;
    const names = apps.map((a: any) => a.scribe_name || 'Volunteer').join(' and ');
    const spoken = count === 1
      ? `You have 1 application for ${currentExam.subject || 'your exam'} from ${names}. You can say "Accept ${apps[0].scribe_name}" to confirm.`
      : `You have ${count} applications for ${currentExam.subject || 'your exam'} from ${names}. Which scribe would you like to accept?`;

    speakAloud(spoken);
    return {
      success: true,
      message: `Found ${count} applications: ${names}`,
      spokenResponse: spoken,
      actionType: 'check_scribes',
      data: apps,
    };
  } catch (err: any) {
    const errorMsg = 'Could not load scribe applications. Please check your network connection.';
    speakAloud(errorMsg);
    return { success: false, message: err?.message || errorMsg, spokenResponse: errorMsg, actionType: 'check_scribes' };
  }
}

/**
 * 2. Accept a scribe by spoken name
 */
export async function voiceAcceptScribe(scribeNameQuery: string): Promise<VoiceActionResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      const msg = 'Please log in to accept a scribe.';
      speakAloud(msg);
      return { success: false, message: msg, spokenResponse: msg, actionType: 'accept_scribe' };
    }

    // Get active exam
    const { data: exams } = await supabase
      .from('exam_requests')
      .select('*')
      .eq('student_id', session.user.id)
      .eq('status', 'pending')
      .order('id', { ascending: false })
      .limit(1);

    if (!exams || exams.length === 0) {
      const msg = 'No pending exam request found to assign a scribe to.';
      speakAloud(msg);
      return { success: false, message: msg, spokenResponse: msg, actionType: 'accept_scribe' };
    }

    const exam = exams[0];

    // Find pending applications for this exam
    const { data: apps } = await supabase
      .from('scribe_applications')
      .select('*')
      .eq('request_id', exam.id)
      .eq('status', 'pending');

    if (!apps || apps.length === 0) {
      const msg = `There are no pending applications for your ${exam.subject} exam.`;
      speakAloud(msg);
      return { success: false, message: msg, spokenResponse: msg, actionType: 'accept_scribe' };
    }

    // Fuzzy match by name
    const queryClean = scribeNameQuery.toLowerCase().trim();
    let targetApp = apps.find((a: any) =>
      (a.scribe_name || '').toLowerCase().includes(queryClean) ||
      queryClean.includes((a.scribe_name || '').toLowerCase())
    );

    // If user said "accept scribe" and there is only 1 application, pick that one
    if (!targetApp && apps.length === 1 && (queryClean.includes('scribe') || queryClean.includes('first') || queryClean === '')) {
      targetApp = apps[0];
    }

    if (!targetApp) {
      const available = apps.map((a: any) => a.scribe_name).join(', ');
      const msg = `I could not find a scribe named "${scribeNameQuery}". Available applicants are: ${available}.`;
      speakAloud(msg);
      return { success: false, message: msg, spokenResponse: msg, actionType: 'accept_scribe' };
    }

    // 1. Mark application as accepted
    await supabase
      .from('scribe_applications')
      .update({ status: 'accepted' })
      .eq('id', targetApp.id);

    // 2. Lock exam_request to this scribe
    await supabase
      .from('exam_requests')
      .update({ status: 'matched', scribe_id: targetApp.scribe_id })
      .eq('id', exam.id);

    // 3. Notify the scribe
    await sendActionNotification({
      recipientUserId: targetApp.scribe_id,
      title: '🎉 Scribe Match Confirmed!',
      message: `You are confirmed as the scribe for ${exam.subject || 'Exam'} on ${exam.exam_date || 'scheduled date'}.`,
      requestId: exam.id,
    });

    const confirmedName = targetApp.scribe_name || 'Your scribe';
    const msg = `Success! ${confirmedName} is confirmed as your scribe for ${exam.subject || 'your exam'}. You can now chat in the app, and phone calling unlocks 24 hours before your exam.`;
    speakAloud(msg);

    return {
      success: true,
      message: `Scribe ${confirmedName} matched successfully`,
      spokenResponse: msg,
      actionType: 'accept_scribe',
      data: targetApp,
    };
  } catch (err: any) {
    const errorMsg = 'Failed to accept scribe. Please try again.';
    speakAloud(errorMsg);
    return { success: false, message: err?.message || errorMsg, spokenResponse: errorMsg, actionType: 'accept_scribe' };
  }
}

/**
 * 3. Send a message to the currently matched scribe
 */
export async function voiceSendMessageToScribe(messageText: string): Promise<VoiceActionResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      const msg = 'Please log in to send a message.';
      speakAloud(msg);
      return { success: false, message: msg, spokenResponse: msg, actionType: 'send_message' };
    }

    // Find student's matched exam
    const { data: exams } = await supabase
      .from('exam_requests')
      .select('*')
      .eq('student_id', session.user.id)
      .eq('status', 'matched')
      .order('id', { ascending: false })
      .limit(1);

    if (!exams || exams.length === 0 || !exams[0].scribe_id) {
      const msg = 'You do not have a confirmed scribe yet to message.';
      speakAloud(msg);
      return { success: false, message: msg, spokenResponse: msg, actionType: 'send_message' };
    }

    const exam = exams[0];

    // Insert message into chat_messages
    const { error: msgErr } = await supabase
      .from('chat_messages')
      .insert({
        request_id: exam.id,
        sender_id: session.user.id,
        message: messageText.trim(),
        message_type: 'text',
        created_at: new Date().toISOString(),
      });

    if (msgErr) throw msgErr;

    // Get current student's name
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, official_name')
      .eq('id', session.user.id)
      .single();

    const senderName = profile?.official_name || profile?.full_name || 'Student';

    // Notify scribe
    await sendActionNotification({
      recipientUserId: exam.scribe_id,
      title: `💬 ${senderName} (Student)`,
      message: messageText.trim(),
      requestId: exam.id,
    });

    const msg = `Message sent to your scribe: "${messageText.trim()}".`;
    speakAloud(msg);

    return {
      success: true,
      message: msg,
      spokenResponse: msg,
      actionType: 'send_message',
    };
  } catch (err: any) {
    const errorMsg = 'Could not send chat message. Please try again.';
    speakAloud(errorMsg);
    return { success: false, message: err?.message || errorMsg, spokenResponse: errorMsg, actionType: 'send_message' };
  }
}

/**
 * 4. Trigger Emergency SOS via voice
 */
export async function voiceTriggerEmergencySOS(): Promise<VoiceActionResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      const msg = 'Please log in to trigger an SOS alert.';
      speakAloud(msg);
      return { success: false, message: msg, spokenResponse: msg, actionType: 'sos' };
    }

    // Find student's most recent request
    const { data: exams } = await supabase
      .from('exam_requests')
      .select('*')
      .eq('student_id', session.user.id)
      .order('id', { ascending: false })
      .limit(1);

    if (!exams || exams.length === 0) {
      const msg = 'No exam request found to trigger an SOS for.';
      speakAloud(msg);
      return { success: false, message: msg, spokenResponse: msg, actionType: 'sos' };
    }

    const exam = exams[0];

    // Mark as emergency
    await supabase
      .from('exam_requests')
      .update({ is_emergency: 'yes', status: 'pending', scribe_id: null })
      .eq('id', exam.id);

    // Broadcast notifications to approved scribes
    const { data: scribes } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'scribe')
      .eq('verification_status', 'approved');

    if (scribes && scribes.length > 0) {
      const notifs = scribes.map((s: any) => ({
        user_id: s.id,
        title: '🚨 Emergency SOS Scribe Alert!',
        message: `Immediate scribe needed for ${exam.subject || 'Exam'} today at ${exam.exam_venue || 'exam hall'}! Tap to accept.`,
        is_read: 0,
        created_at: new Date().toISOString(),
      }));
      await supabase.from('notifications').insert(notifs);
    }

    const msg = `Emergency SOS alert triggered! All nearby standby scribes have been notified for your ${exam.subject || 'exam'}.`;
    speakAloud(msg);

    return {
      success: true,
      message: msg,
      spokenResponse: msg,
      actionType: 'sos',
    };
  } catch (err: any) {
    const errorMsg = 'Failed to trigger SOS alert.';
    speakAloud(errorMsg);
    return { success: false, message: err?.message || errorMsg, spokenResponse: errorMsg, actionType: 'sos' };
  }
}

/**
 * Main Natural Voice Command Dispatcher
 * Parses a spoken sentence and routes to the appropriate handler.
 */
export async function parseAndExecuteVoiceCommand(rawTranscript: string): Promise<VoiceActionResult> {
  const t = rawTranscript.toLowerCase().trim();
  console.log(`🎙️ Voice Command Received: "${t}"`);

  // 1. Create Exam Request / Find Scribe
  if (
    t.includes('create request') ||
    t.includes('create exam') ||
    t.includes('book scribe') ||
    t.includes('book a scribe') ||
    t.includes('find scribe') ||
    t.includes('find a scribe') ||
    t.includes('new request')
  ) {
    const msg = 'Opening voice exam creator.';
    speakAloud(msg);
    router.push('/console/student/request_form?mode=voice' as any);
    return {
      success: true,
      message: msg,
      spokenResponse: msg,
      actionType: 'create_request',
    };
  }

  // 2. Inquire about scribe applications
  if (
    t.includes('who applied') ||
    t.includes('check scribe') ||
    t.includes('check scribes') ||
    t.includes('show application') ||
    t.includes('show applications') ||
    t.includes('scribe application') ||
    t.includes('view applicant')
  ) {
    return voiceCheckScribeApplications();
  }

  // 3. Accept Scribe
  if (t.includes('accept') || t.includes('confirm scribe') || t.includes('hire')) {
    // Extract name after "accept" or "confirm"
    let candidateName = '';
    const acceptMatch = t.match(/accept\s+([a-z\s]+)/i);
    if (acceptMatch) {
      candidateName = acceptMatch[1].replace(/on anulekh|in anulekh|for my exam|as scribe|scribe/g, '').trim();
    } else {
      const confirmMatch = t.match(/confirm\s+([a-z\s]+)/i);
      if (confirmMatch) {
        candidateName = confirmMatch[1].replace(/on anulekh|in anulekh|for my exam|as scribe|scribe/g, '').trim();
      }
    }
    return voiceAcceptScribe(candidateName);
  }

  // 4. Send Message / Chat with scribe
  if (t.includes('message') || t.includes('tell scribe') || t.includes('send message') || t.includes('chat with scribe')) {
    // Extract message body
    let messageBody = '';
    const msgMatch = t.match(/(?:message|tell scribe|send message|chat with scribe)(?:\s*(?:to\s*my\s*scribe|my\s*scribe|to\s*scribe|that|:)?)\s+(.+)/i);
    if (msgMatch && msgMatch[1]) {
      messageBody = msgMatch[1].replace(/on anulekh|in anulekh/g, '').trim();
    }

    if (!messageBody) {
      // Just open chat screen
      router.push('/console/common/chat' as any);
      const spoken = 'Opening chat with your scribe.';
      speakAloud(spoken);
      return { success: true, message: spoken, spokenResponse: spoken, actionType: 'send_message' };
    }

    return voiceSendMessageToScribe(messageBody);
  }

  // 5. Emergency SOS
  if (t.includes('emergency') || t.includes('trigger sos') || t.includes('sos alert') || t.includes('need urgent scribe')) {
    return voiceTriggerEmergencySOS();
  }

  // 6. Fallback Help
  const help = 'I can help you create an exam request, check who applied, accept a scribe, or send a message to your scribe. What would you like to do?';
  speakAloud(help);
  return {
    success: false,
    message: help,
    spokenResponse: help,
    actionType: 'unknown',
  };
}
