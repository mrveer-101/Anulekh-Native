/**
 * Route: /console/student/assignment_form[?id=<requestId>]
 *
 * Form for a student to post (or, when `id` is given, edit) an *assignment* writing
 * request — homework / lab reports / term papers a volunteer writes up — as opposed
 * to exam-scribe requests, which use request_form.tsx.
 *
 * Fields: subject (required), title (defaults to subject), academic level
 * (School / College), page count, deadline (required, picked in a custom
 * calendar + time modal and stored as the string "YYYY-MM-DD hh:mm AM|PM"),
 * description, and optional reference attachments (PDFs/docs/images).
 *
 * Data (via the `supabase` shim in core/supabase.ts, which calls the Rust/Axum
 * backend's /api/query endpoint — not real Supabase):
 *   - reads the student's `profiles` row (name used for attachment file names)
 *   - edit mode: reads the existing `assignment_requests` row
 *   - save: inserts or updates `assignment_requests` with status 'pending'
 * Attachments (PDF, Word, JPG, PNG) upload straight to storage as soon as they are picked
 * (`storageService.uploadFile`, kind `assignment`, progress shown per file). The `attachments`
 * column stores `"<name>::<public URL>"` strings. Old rows may still hold `"<name>::…::<data URI>"`;
 * readers take the part after the last `::`, so both formats keep working.
 *
 * Layout: one layout for every screen size, built from components/student/RequestKit (page,
 * header, section cards, submit button — shared with request_form). On desktop the root layout
 * shows it in the centred DesktopPageFrame.
 * After a successful save it returns to /console/student with the Requests tab open.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { FormSection, RequestHeader, RequestPage, SubmitButton } from '@/components/student/RequestKit';
import { storageService } from '@/services/storageService';

/**
 * A reference file attached to the request while the form is open.
 * `uri` is the picker's local URI (also used as the React key / removal id),
 * `name` the normalised file name (see formatAttachmentFileName), `mimeType` drives
 * the icon, and `size` (bytes) is shown when known.
 */
interface Attachment {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  /** Public URL once uploaded (or an old inline data URI when editing an old request). */
  url?: string;
  /** Upload progress 0..1 while sending. */
  progress?: number;
  /** Upload error message, if the upload failed. */
  error?: string;
}

/** File types the backend accepts for assignments (see Anulekh-Axum/src/storage.rs). */
const ATTACHMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];

/**
 * Assignment request create/edit screen (default export for the route; no props).
 * Reads the optional `id` search param to switch into edit mode.
 */
export default function AssignmentRequestForm() {

  // `?id=` present => editing an existing assignment_requests row.
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;

  // `loading` covers both the initial fetch and saving; `profile` is the student's profiles row.
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Form field state.
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [academicLevel, setAcademicLevel] = useState('College');
  const [pageCount, setPageCount] = useState('10');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // True while picked files are being read into base64; saving is blocked meanwhile.
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Deadline picker modal state: visible month/year, chosen day and 12-hour time.
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState('05');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState('PM');

  /** Options for the Academic Level toggle (stored as-is in `academic_level`). */
  const ACADEMIC_LEVELS = ['School', 'College'];

  // Load the profile (and the request being edited, if any) once on mount.
  useEffect(() => { fetchProfile(); }, []);

  /**
   * Loads the student's `profiles` row and, in edit mode, the `assignment_requests`
   * row identified by `params.id`, pre-filling every form field. Errors are only logged.
   */
  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setProfile(profileData);

      // Edit mode: copy the saved request into the form.
      if (isEditing) {
        const { data: requestData } = await supabase.from('assignment_requests').select('*').eq('id', params.id).single();
        if (requestData) {
          setSubject(requestData.subject || '');
          setTitle(requestData.assignment_title || '');
          setAcademicLevel(requestData.academic_level || 'College');
          setPageCount(requestData.page_count || '10');
          setDescription(requestData.description || '');
          setDeadline(requestData.deadline || '');
          // Restore saved attachments: "<name>::<url>" (old rows: "<name>::…::<data URI>").
          if (requestData.attachments && Array.isArray(requestData.attachments)) {
            const restored: Attachment[] = requestData.attachments.map((entry: string) => {
              if (!entry.includes('::')) return null;
              const name = entry.substring(0, entry.indexOf('::'));
              const url = entry.substring(entry.lastIndexOf('::') + 2);
              const ext = name.split('.').pop()?.toLowerCase() || '';
              const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
              return { uri: url, name, mimeType, url };
            }).filter(Boolean) as Attachment[];
            setAttachments(restored);
          }
        }
      }
    } catch (err: any) {
      console.log('Error loading form:', err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Builds a normalised attachment name: `<user>_<basename>_<pdf|image|doc|file>.<ext>`,
   * lower-cased with every non-alphanumeric character replaced by "_". Files without an
   * extension are given ".jpg".
   * @param userName - student's official or full name (falls back to "student").
   * @param originalName - file name from the picker.
   * @param mimeType - MIME type, used to choose the type tag.
   */
  const formatAttachmentFileName = (userName: string, originalName: string, mimeType: string): string => {
    const sanitizedUser = (userName || 'student').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const ext = originalName.includes('.') ? originalName.split('.').pop()?.toLowerCase() || 'jpg' : 'jpg';
    const baseName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
    const sanitizedBase = (baseName || 'file').toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    let fileType = 'file';
    if (mimeType.includes('pdf') || ext === 'pdf') fileType = 'pdf';
    else if (mimeType.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'image';
    else if (['doc', 'docx', 'txt'].includes(ext)) fileType = 'doc';

    return `${sanitizedUser}_${sanitizedBase}_${fileType}.${ext}`;
  };

  /** Updates one attachment (matched by its local uri). */
  const patchAttachment = (uri: string, patch: Partial<Attachment>) =>
    setAttachments((prev) => prev.map((a) => (a.uri === uri ? { ...a, ...patch } : a)));

  /**
   * Renames the picked files, shows them in the list at once, then uploads them one by one straight
   * to storage (kind `assignment`), updating each row's progress. Failed files show their error and
   * can be removed and picked again.
   * @param newFiles - files returned by the document or image picker.
   */
  const addFiles = async (newFiles: Omit<Attachment, 'url' | 'progress' | 'error'>[]) => {
    const username = profile?.official_name || profile?.full_name || 'student';
    const named = newFiles.map((f) => ({ ...f, name: formatAttachmentFileName(username, f.name, f.mimeType), progress: 0 }));
    setAttachments((prev) => [...prev, ...named]);
    setUploadingFiles(true);
    for (const file of named) {
      const res = await storageService.uploadFile(file.uri, {
        kind: 'assignment',
        contentType: file.mimeType,
        onProgress: (p) => patchAttachment(file.uri, { progress: p }),
      });
      patchAttachment(file.uri, res.publicUrl ? { url: res.publicUrl, progress: 1 } : { error: res.error || 'Upload failed' });
    }
    setUploadingFiles(false);
  };

  /** Opens the system document picker (any file type, multiple selection) and adds the chosen files. */
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ATTACHMENT_TYPES, multiple: true, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const newFiles = result.assets.map((a) => ({ uri: a.uri, name: a.name || `file_${Date.now()}`, mimeType: a.mimeType || 'application/pdf', size: a.size }));
      await addFiles(newFiles);
    } catch (e: any) { Alert.alert('Error', e.message || 'Failed to pick file.'); }
  };

  /**
   * Asks for photo-library permission, lets the user pick several images, and adds
   * them. The MIME type is guessed from the URI's extension.
   */
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Please allow access to your photo library.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.6 });
      if (result.canceled || !result.assets?.length) return;
      const newFiles = result.assets.map((a) => {
        const ext = a.uri.split('.').pop()?.toLowerCase() || 'jpg';
        return { uri: a.uri, name: a.fileName || `image_${Date.now()}.${ext}`, mimeType: ext === 'png' ? 'image/png' : 'image/jpeg', size: a.fileSize };
      });
      await addFiles(newFiles);
    } catch (e: any) { Alert.alert('Error', e.message || 'Failed to pick image.'); }
  };

  /** Removes an attachment by its URI (mobile list; the desktop list removes by index). */
  const removeAttachment = (uri: string) => setAttachments((prev) => prev.filter((a) => a.uri !== uri));

  /** Feather icon name plus colours for an attachment row: red for PDF, purple for images, blue otherwise. */
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return { name: 'file-text' as const, color: '#ef4444', bg: '#fef2f2', border: '#fecaca' };
    if (mimeType.includes('image')) return { name: 'image' as const, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
    return { name: 'file' as const, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
  };

  /** Human-readable file size (B / KB / MB); empty string when the size is unknown. */
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /**
   * Validates the form and inserts (or, in edit mode, updates) the
   * `assignment_requests` row with status 'pending', saving only attachments that finished uploading.
   * On success shows an alert and replaces the route with /console/student?tab=requests.
   */
  const handleSave = async () => {
    // Validation: subject and deadline are required, and file reading must have finished.
    if (!subject.trim()) { Alert.alert('Error', 'Subject is required.'); return; }
    if (!deadline.trim()) { Alert.alert('Error', 'Deadline is required.'); return; }
    if (uploadingFiles) { Alert.alert('Please Wait', 'Files are still uploading.'); return; }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('You must be logged in.');

      // Title is optional in the UI; fall back to the subject so the request always has one.
      const formattedTitle = title.trim() || subject.trim();

      // Uploaded attachments only, stored as "<name>::<url>".
      const attachmentEntries = attachments.filter((a) => a.url).map((a) => `${a.name}::${a.url}`);

      // Columns to save. Note: editing also resets status to 'pending'.
      const basePayload = {
        student_id: session.user.id,
        student_name: profile?.official_name || profile?.full_name || 'Student',
        subject: subject.trim(),
        assignment_title: formattedTitle,
        academic_level: academicLevel,
        page_count: pageCount.trim() || '1',
        description: description.trim(),
        deadline: deadline.trim(),
        status: 'pending',
      };

      // Single save helper: UPDATE by id when editing, INSERT a new row otherwise.
      const save = async (payload: any) =>
        isEditing
          ? supabase.from('assignment_requests').update(payload).eq('id', params.id)
          : supabase.from('assignment_requests').insert(payload);

      const res = await save({ ...basePayload, attachments: attachmentEntries });
      if (res.error) throw new Error(res.error.message || 'Failed to save.');

      // Success: confirm and return to the student console's Requests tab.
      Alert.alert('Success', isEditing ? 'Assignment request updated!' : 'Assignment request posted!');
      router.replace({ pathname: '/console/student' as any, params: { tab: 'requests' } });
    } catch (err: any) {
      console.error('[AssignmentForm] Save error:', err);
      Alert.alert('Error', err.message || 'Failed to save request.');
    } finally {
      setLoading(false);
    }
  };

  /* ─── Calendar ─── */
  /** Month names and weekday headers for the custom deadline calendar. */
  const MONTHS =['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  /** Number of days in month `m` (0-based) of year `y` (day 0 of the next month = last day of this one). */
  const getDaysInMonth = (m: number, y: number) => new Date(y, m + 1, 0).getDate();
  /** Weekday (0 = Sunday) of the 1st of month `m`, used to offset the calendar grid. */
  const getFirstDayOfMonth = (m: number, y: number) => new Date(y, m, 1).getDay();

  /** Moves the calendar one month back or forward (wrapping the year) and clears the selected day. */
  const changeMonth = (dir: 'next' | 'prev') => {
    if (dir === 'prev') { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); } else setCalendarMonth(m => m - 1); }
    else { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); } else setCalendarMonth(m => m + 1); }
    setSelectedDay(null);
  };

  /**
   * Writes the chosen day and time into `deadline` as "YYYY-MM-DD hh:mm AM|PM"
   * (day and month zero-padded) and closes the modal. Past dates are not rejected.
   */
  const handleConfirmDateTime = () => {
    if (!selectedDay) { Alert.alert('Required', 'Please select a day.'); return; }
    const d = selectedDay < 10 ? `0${selectedDay}` : selectedDay;
    const mo = calendarMonth + 1 < 10 ? `0${calendarMonth + 1}` : calendarMonth + 1;
    setDeadline(`${calendarYear}-${mo}-${d} ${selectedHour}:${selectedMinute} ${selectedAmPm}`);
    setShowDatePicker(false);
  };

  /**
   * Builds the calendar grid cells: blank spacers up to the month's first weekday,
   * then one tappable cell per day (selected day highlighted). Each cell is ~1/7 width.
   */
  const renderCalendarDays = () => {
    const days = getDaysInMonth(calendarMonth, calendarYear);
    const first = getFirstDayOfMonth(calendarMonth, calendarYear);
    const slots = [];
    for (let i = 0; i < first; i++) slots.push(<View key={`e-${i}`} style={{ width: '14%', height: 32 }} />);
    for (let day = 1; day <= days; day++) {
      const sel = selectedDay === day;
      slots.push(
        <TouchableOpacity key={`d-${day}`} onPress={() => setSelectedDay(day)}
          style={{ width: '14%', height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: sel ? '#2563eb' : 'transparent' }}>
          <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '600', color: sel ? '#fff' : '#1e293b' }}>{day}</Text>
        </TouchableOpacity>
      );
    }
    return slots;
  };

  // Initial load: full-screen spinner until the profile arrives.
  if (loading && !profile) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  // ── Page: header, two section cards (details, attachments) and the submit button ──
  return (
    <RequestPage>
      <RequestHeader
        title={isEditing ? 'Edit Assignment' : 'Assignment Request'}
        subtitle={isEditing ? undefined : 'Get a writer for your assignment'}
        onBack={() => { if (router.canGoBack()) router.back(); else router.replace('/console/student' as any); }}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 90, gap: 14 }} showsVerticalScrollIndicator={false}>

        {/* ── Assignment details ── */}
        <FormSection icon="file-text" title="Assignment Details">
        <View style={{ gap: 18 }}>

          <View style={s.field}>
            <Text style={s.label}>Subject</Text>
            <TextInput value={subject} onChangeText={setSubject} placeholder="e.g. Applied Physics, Chemistry-II" placeholderTextColor="#94a3b8" style={s.input} />
          </View>

          <View style={s.field}>
            <Text style={s.label}>Assignment Title</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Lab Report 2, Term Paper 1" placeholderTextColor="#94a3b8" style={s.input} />
          </View>

          <View style={s.field}>
            <Text style={s.label}>Academic Level</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {ACADEMIC_LEVELS.map(level => {
                const active = academicLevel === level;
                return (
                  <TouchableOpacity key={level} onPress={() => setAcademicLevel(level)}
                    style={[s.levelBtn, active ? s.levelBtnActive : s.levelBtnInactive]}>
                    <Text style={[s.levelBtnText, active ? s.levelBtnTextActive : s.levelBtnTextInactive]}>{level}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={s.field}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.label}>Page Count Estimate</Text>
              <Text style={{ fontFamily: 'Roboto', fontSize: 11, fontWeight: '700', color: '#2563eb' }}>
                {pageCount || '1'} {parseInt(pageCount || '1') === 1 ? 'Page' : 'Pages'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              {/* Page count stepper: minus (never below 1), digits-only input, plus */}
              <TouchableOpacity
                onPress={() => {
                  const current = Math.max(1, (parseInt(pageCount) || 1) - 1);
                  setPageCount(current.toString());
                }}
                activeOpacity={0.7}
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="minus" size={18} color="#475569" />
              </TouchableOpacity>

              <TextInput
                value={pageCount}
                onChangeText={(val) => {
                  const clean = val.replace(/[^0-9]/g, '');
                  setPageCount(clean);
                }}
                keyboardType="numeric"
                placeholder="1"
                placeholderTextColor="#94a3b8"
                style={[s.input, { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800' }]}
              />

              <TouchableOpacity
                onPress={() => {
                  const current = (parseInt(pageCount) || 0) + 1;
                  setPageCount(current.toString());
                }}
                activeOpacity={0.7}
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#bfdbfe', alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="plus" size={18} color="#2563eb" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.field}>
            <Text style={s.label}>Deadline</Text>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.8} style={s.deadlineBtn}>
              <Text style={[s.deadlineBtnText, !deadline && { color: '#94a3b8', fontWeight: '400' }]}>
                {deadline || 'Select Deadline Date & Time'}
              </Text>
              <Feather name="calendar" size={16} color="#2563eb" />
            </TouchableOpacity>
          </View>

          <View style={s.field}>
            <Text style={s.label}>Description & Instructions</Text>
            <TextInput value={description} onChangeText={setDescription}
              placeholder="Write specifications, requirements, guidelines or instructions..."
              placeholderTextColor="#94a3b8" multiline numberOfLines={4}
              style={[s.input, { height: 100, textAlignVertical: 'top', paddingTop: 12 }]} />
          </View>
        </View>
        </FormSection>

        {/* ── Reference attachments (optional) ── */}
        <FormSection
          icon="paperclip"
          title="Attachments"
          right={attachments.length > 0 ? (
            <View style={{ backgroundColor: '#eff6ff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: '#bfdbfe' }}>
              <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '700', color: '#2563eb' }}>{attachments.length} file{attachments.length !== 1 ? 's' : ''}</Text>
            </View>
          ) : undefined}
        >

          {uploadingFiles && (
            <View style={[s.banner, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={[s.bannerText, { color: '#1d4ed8' }]}>Uploading files…</Text>
            </View>
          )}

          {/* One row per attachment; "Ready" once its base64 data URI exists */}
          {attachments.map((file) => {
            const icon = getFileIcon(file.mimeType);
            const ready = !!file.url;
            return (
              <View key={file.uri} style={[s.attachRow, { backgroundColor: icon.bg, borderColor: icon.border }]}>
                <View style={[s.attachIcon, { borderColor: icon.border }]}>
                  <Feather name={icon.name} size={16} color={icon.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#0f172a' }}>{file.name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>
                    {file.error ? file.error : ready ? `Uploaded${file.size ? ' · ' + formatSize(file.size) : ''}` : `Uploading ${Math.round((file.progress || 0) * 100)}%`}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {ready && <Feather name="check-circle" size={14} color="#059669" />}
                  <TouchableOpacity onPress={() => removeAttachment(file.uri)} style={s.removeBtn}>
                    <Feather name="x" size={12} color="#64748b" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {/* Picker buttons: documents and photo library */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: attachments.length > 0 ? 8 : 0 }}>
            <TouchableOpacity onPress={pickDocument} style={s.pickerBtn} activeOpacity={0.7}>
              <Feather name="file-text" size={14} color="#ef4444" />
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#475569' }}>PDF / Doc</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickImage} style={s.pickerBtn} activeOpacity={0.7}>
              <Feather name="image" size={14} color="#7c3aed" />
              <Text style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#475569' }}>Image</Text>
            </TouchableOpacity>
          </View>
        </FormSection>

        {/* ── Save (blocked while files are still being read) ── */}
        <SubmitButton
          label={isEditing ? 'Update Request' : 'Post Assignment Request'}
          onPress={handleSave}
          loading={loading}
          disabled={uploadingFiles}
          color="#ea580c"
        />

      </ScrollView>

      {/* ── Date & Time Picker Modal ── */}
      <Modal animationType="slide" transparent visible={showDatePicker} onRequestClose={() => setShowDatePicker(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={s.pickerModal}>
            <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '900', color: '#0f172a', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Select Date & Time</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => changeMonth('prev')} style={s.navBtn}><Feather name="chevron-left" size={14} color="#334155" /></TouchableOpacity>
              <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#1e293b' }}>{MONTHS[calendarMonth]} {calendarYear}</Text>
              <TouchableOpacity onPress={() => changeMonth('next')} style={s.navBtn}><Feather name="chevron-right" size={14} color="#334155" /></TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
              {WEEKDAYS.map((d) => (
                <View key={d} style={{ width: '14.28%', alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>{d}</Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 12 }}>
              {renderCalendarDays()}
            </View>

            {/* Time entry: hour accepts 1-12 and minute 0-59 (input ignores other values), plus AM/PM toggle */}
            <Text style={{ fontFamily: 'Roboto', fontSize: 9, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Set Deadline Time</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 20 }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <TextInput value={selectedHour} onChangeText={(t) => { const h = parseInt(t); if (!t || (h >= 1 && h <= 12)) setSelectedHour(t); }}
                  keyboardType="numeric" maxLength={2} style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '800', color: '#0f172a', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, width: 44, paddingVertical: 6, textAlign: 'center' }} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '700', color: '#94a3b8', marginTop: 3, textTransform: 'uppercase' }}>Hour</Text>
              </View>
              <Text style={{ fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#cbd5e1', marginBottom: 16 }}>:</Text>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <TextInput value={selectedMinute} onChangeText={(t) => { const m = parseInt(t); if (!t || (m >= 0 && m <= 59)) setSelectedMinute(t); }}
                  keyboardType="numeric" maxLength={2} style={{ fontFamily: 'Roboto', fontSize: 16, fontWeight: '800', color: '#0f172a', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, width: 44, paddingVertical: 6, textAlign: 'center' }} />
                <Text style={{ fontFamily: 'Roboto', fontSize: 8, fontWeight: '700', color: '#94a3b8', marginTop: 3, textTransform: 'uppercase' }}>Min</Text>
              </View>
              <View style={{ flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 10, padding: 2, marginLeft: 8 }}>
                {['AM', 'PM'].map((ap) => (
                  <TouchableOpacity key={ap} onPress={() => setSelectedAmPm(ap)}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: selectedAmPm === ap ? '#2563eb' : 'transparent' }}>
                    <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: selectedAmPm === ap ? '#fff' : '#64748b' }}>{ap}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}
                style={{ flex: 1, backgroundColor: '#f1f5f9', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#475569' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleConfirmDateTime}
                style={{ flex: 1, backgroundColor: '#2563eb', borderRadius: 14, paddingVertical: 12, alignItems: 'center', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 13, fontWeight: '800', color: '#fff' }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </RequestPage>
  );
}

const s = StyleSheet.create({
  field: { gap: 6 },
  label: { fontFamily: 'Roboto', fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 },
  input: { fontFamily: 'Roboto', fontSize: 14, color: '#0f172a', backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  levelBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  levelBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  levelBtnInactive: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  levelBtnText: { fontFamily: 'Roboto', fontSize: 13, fontWeight: '800' },
  levelBtnTextActive: { color: '#fff' },
  levelBtnTextInactive: { color: '#64748b' },
  deadlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  deadlineBtnText: { fontFamily: 'Roboto', fontSize: 14, fontWeight: '600', color: '#0f172a' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  bannerText: { fontFamily: 'Roboto', fontSize: 12, fontWeight: '700' },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  attachIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  removeBtn: { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(100,116,139,0.1)', alignItems: 'center', justifyContent: 'center' },
  pickerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, paddingVertical: 13, backgroundColor: '#f8fafc' },
  pickerModal: { backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 28, padding: 22, borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, elevation: 6 },
  navBtn: { padding: 8, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
});
