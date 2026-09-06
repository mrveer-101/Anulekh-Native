import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/core/supabase';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import ConsoleStudentPC from '@/components/pc_view/ConsoleStudentPC';

interface Attachment {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  /** base64 data URI stored inline in the DB */
  dataUri?: string;
}

export default function AssignmentRequestForm() {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 768;

  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [academicLevel, setAcademicLevel] = useState('College');
  const [pageCount, setPageCount] = useState('10');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [convertingFiles, setConvertingFiles] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState('05');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState('PM');

  const ACADEMIC_LEVELS = ['School', 'College'];

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      setProfile(profileData);

      if (isEditing) {
        const { data: requestData } = await supabase.from('assignment_requests').select('*').eq('id', params.id).single();
        if (requestData) {
          setSubject(requestData.subject || '');
          setTitle(requestData.assignment_title || '');
          setAcademicLevel(requestData.academic_level || 'College');
          setPageCount(requestData.page_count || '10');
          setDescription(requestData.description || '');
          setDeadline(requestData.deadline || '');
          // Restore saved attachments (stored as name::dataUri pairs)
          if (requestData.attachments && Array.isArray(requestData.attachments)) {
            const restored: Attachment[] = requestData.attachments.map((entry: string) => {
              const sepIdx = entry.indexOf('::');
              if (sepIdx === -1) return null;
              const name = entry.substring(0, sepIdx);
              const dataUri = entry.substring(sepIdx + 2);
              const ext = name.split('.').pop()?.toLowerCase() || '';
              const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext}`;
              return { uri: dataUri, name, mimeType, dataUri };
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

  /** Convert a file URI to base64 data URI using fetch + FileReader (works on web & native) */
  const toDataUri = async (uri: string, mimeType: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

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

  const addFiles = async (newFiles: Omit<Attachment, 'dataUri'>[]) => {
    setConvertingFiles(true);
    const converted: Attachment[] = [];
    const username = profile?.official_name || profile?.full_name || 'student';
    for (const file of newFiles) {
      try {
        const formattedName = formatAttachmentFileName(username, file.name, file.mimeType);
        const dataUri = await toDataUri(file.uri, file.mimeType);
        converted.push({ ...file, name: formattedName, dataUri });
      } catch (e) {
        console.warn('Failed to read file:', file.name);
        const formattedName = formatAttachmentFileName(username, file.name, file.mimeType);
        converted.push({ ...file, name: formattedName });
      }
    }
    setAttachments((prev) => [...prev, ...converted]);
    setConvertingFiles(false);
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['*/*'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const newFiles = result.assets.map((a) => ({ uri: a.uri, name: a.name || `file_${Date.now()}`, mimeType: a.mimeType || 'application/pdf', size: a.size }));
      await addFiles(newFiles);
    } catch (e: any) { Alert.alert('Error', e.message || 'Failed to pick file.'); }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Please allow access to your photo library.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 0.6 });
      if (result.canceled || !result.assets?.length) return;
      const newFiles = result.assets.map((a) => {
        const ext = a.uri.split('.').pop()?.toLowerCase() || 'jpg';
        return { uri: a.uri, name: a.fileName || `image_${Date.now()}.${ext}`, mimeType: `image/${ext}`, size: a.fileSize };
      });
      await addFiles(newFiles);
    } catch (e: any) { Alert.alert('Error', e.message || 'Failed to pick image.'); }
  };

  const removeAttachment = (uri: string) => setAttachments((prev) => prev.filter((a) => a.uri !== uri));

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return { name: 'file-text' as const, color: '#ef4444', bg: '#fef2f2', border: '#fecaca' };
    if (mimeType.includes('image')) return { name: 'image' as const, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
    return { name: 'file' as const, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSave = async () => {
    if (!subject.trim()) { Alert.alert('Error', 'Subject is required.'); return; }
    if (!deadline.trim()) { Alert.alert('Error', 'Deadline is required.'); return; }
    if (convertingFiles) { Alert.alert('Please Wait', 'Files are still being processed.'); return; }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('You must be logged in.');

      const username = profile?.official_name || profile?.full_name || 'student';
      const formattedTitle = title.trim() || subject.trim();

      // Format attachments with naming convention: username_filename_filetype.ext
      const attachmentEntries = attachments
        .map((a) => {
          const formattedName = formatAttachmentFileName(username, a.name, a.mimeType);
          const relativePath = `/media/assignment/attachments/${formattedName}`;
          return `${formattedName}::${relativePath}::${a.dataUri || a.uri}`;
        });

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

      const save = async (payload: any) =>
        isEditing
          ? supabase.from('assignment_requests').update(payload).eq('id', params.id)
          : supabase.from('assignment_requests').insert(payload);

      // Attempt save with attachments column
      let res = await save({ ...basePayload, attachments: attachmentEntries });

      if (res.error) {
        console.warn('Primary save with full data URIs failed, retrying with file reference paths:', res.error.message);
        // Fallback 1: Save with file paths instead of huge base64
        const pathEntries = attachments.map((a) => {
          const formattedName = formatAttachmentFileName(username, a.name, a.mimeType);
          return `${formattedName}::/media/assignment/attachments/${formattedName}`;
        });
        res = await save({ ...basePayload, attachments: pathEntries });
      }

      if (res.error) {
        console.warn('Secondary save with path references failed, falling back to base payload:', res.error.message);
        // Fallback 2: Append attachment summary to description & save base payload
        const attachmentSummary = attachments.length > 0
          ? `\n\n[Attachments: ${attachments.map(a => formatAttachmentFileName(username, a.name, a.mimeType)).join(', ')}]`
          : '';
        res = await save({ ...basePayload, description: `${basePayload.description}${attachmentSummary}`.trim() });
      }

      if (res.error) throw new Error(res.error.message || 'Failed to save.');

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
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const getDaysInMonth = (m: number, y: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (m: number, y: number) => new Date(y, m, 1).getDay();

  const changeMonth = (dir: 'next' | 'prev') => {
    if (dir === 'prev') { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); } else setCalendarMonth(m => m - 1); }
    else { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); } else setCalendarMonth(m => m + 1); }
    setSelectedDay(null);
  };

  const handleConfirmDateTime = () => {
    if (!selectedDay) { Alert.alert('Required', 'Please select a day.'); return; }
    const d = selectedDay < 10 ? `0${selectedDay}` : selectedDay;
    const mo = calendarMonth + 1 < 10 ? `0${calendarMonth + 1}` : calendarMonth + 1;
    setDeadline(`${calendarYear}-${mo}-${d} ${selectedHour}:${selectedMinute} ${selectedAmPm}`);
    setShowDatePicker(false);
  };

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

  if (loading && !profile) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  if (isDesktop) {
    return (
      <ConsoleStudentPC activeTab="requests">
        <View style={{ maxWidth: 880, width: '100%', alignSelf: 'center', backgroundColor: '#ffffff', borderRadius: 24, padding: 36, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a' }}>{isEditing ? 'Edit Assignment Request' : 'New Assignment Request'}</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#64748b', marginTop: 4 }}>Post an academic assignment for writer matching.</Text>
            </View>
            <TouchableOpacity
              onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/console/student' as any); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f1f5f9', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, cursor: 'pointer' as any }}
            >
              <Feather name="x" size={18} color="#64748b" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#475569' }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Form Card */}
          <View style={s.card}>
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
                {ACADEMIC_LEVELS.map((lvl) => (
                  <TouchableOpacity key={lvl} onPress={() => setAcademicLevel(lvl)} style={[s.levelBtn, academicLevel === lvl ? s.levelBtnActive : s.levelBtnInactive, { cursor: 'pointer' as any }]}>
                    <Text style={[s.levelBtnText, academicLevel === lvl ? s.levelBtnTextActive : s.levelBtnTextInactive]}>{lvl}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.field}>
              <Text style={s.label}>Page Count / Word Estimation</Text>
              <TextInput value={pageCount} onChangeText={setPageCount} keyboardType="number-pad" placeholder="e.g. 10" placeholderTextColor="#94a3b8" style={s.input} />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Submission Deadline</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[s.deadlineBtn, { cursor: 'pointer' as any }]}>
                <Text style={s.deadlineBtnText}>{deadline || 'Select Date & Time'}</Text>
                <Feather name="calendar" size={18} color="#2563eb" />
              </TouchableOpacity>
            </View>

            <View style={s.field}>
              <Text style={s.label}>Assignment Instructions / Description</Text>
              <TextInput value={description} onChangeText={setDescription} placeholder="Describe formatting rules, reference styles, topic details..." placeholderTextColor="#94a3b8" multiline numberOfLines={4} style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} />
            </View>

            {/* Attachments Section */}
            <View style={s.field}>
              <Text style={s.label}>Reference Attachments (Optional)</Text>
              {attachments.map((att, idx) => (
                <View key={idx} style={s.attachRow}>
                  <View style={s.attachIcon}>
                    <Feather name={att.mimeType.includes('image') ? 'image' : 'file-text'} size={18} color="#2563eb" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{att.name}</Text>
                    <Text style={{ fontSize: 11, color: '#64748b' }}>{att.mimeType}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} style={s.removeBtn}>
                    <Feather name="trash-2" size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <TouchableOpacity onPress={pickDocument} style={[s.pickerBtn, { cursor: 'pointer' as any }]}>
                  <Feather name="paperclip" size={16} color="#2563eb" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>Add PDF / Doc</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={pickImage} style={[s.pickerBtn, { cursor: 'pointer' as any }]}>
                  <Feather name="image" size={16} color="#2563eb" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>Add Photo</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity onPress={handleSave} disabled={loading} style={[s.saveBtn, { cursor: 'pointer' as any }]}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{isEditing ? 'Update Assignment' : 'Submit Assignment Request'}</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Date Picker Modal */}
        <Modal visible={showDatePicker} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={s.pickerModal}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 14 }}>Select Deadline</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <TouchableOpacity onPress={() => changeMonth('prev')} style={s.navBtn}><Feather name="chevron-left" size={18} color="#334155" /></TouchableOpacity>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1e293b' }}>{MONTHS[calendarMonth]} {calendarYear}</Text>
                <TouchableOpacity onPress={() => changeMonth('next')} style={s.navBtn}><Feather name="chevron-right" size={18} color="#334155" /></TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {WEEKDAYS.map(w => <Text key={w} style={{ width: '14%', textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#94a3b8' }}>{w}</Text>)}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>{renderCalendarDays()}</View>
              
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Time</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <TextInput value={selectedHour} onChangeText={setSelectedHour} keyboardType="number-pad" maxLength={2} style={[s.input, { width: 50, textAlign: 'center' }]} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#475569' }}>:</Text>
                <TextInput value={selectedMinute} onChangeText={setSelectedMinute} keyboardType="number-pad" maxLength={2} style={[s.input, { width: 50, textAlign: 'center' }]} />
                <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 2 }}>
                  {['AM', 'PM'].map(ap => (
                    <TouchableOpacity key={ap} onPress={() => setSelectedAmPm(ap)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: selectedAmPm === ap ? '#2563eb' : 'transparent' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: selectedAmPm === ap ? '#fff' : '#64748b' }}>{ap}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ flex: 1, backgroundColor: '#f1f5f9', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#475569' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleConfirmDateTime} style={{ flex: 1, backgroundColor: '#2563eb', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ConsoleStudentPC>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/console/student' as any); }} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#334155" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isEditing ? 'Edit Assignment Request' : 'New Assignment Request'}</Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        {/* ── Main Form Card ── */}
        <View style={s.card}>

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

        {/* ── Attachments Card ── */}
        <View style={[s.card, { marginTop: 14 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View>
              <Text style={s.label}>Reference Attachments</Text>
            </View>
            {attachments.length > 0 && (
              <View style={{ backgroundColor: '#eff6ff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: '#bfdbfe' }}>
                <Text style={{ fontFamily: 'Roboto', fontSize: 10, fontWeight: '700', color: '#2563eb' }}>{attachments.length} file{attachments.length !== 1 ? 's' : ''}</Text>
              </View>
            )}
          </View>

          {convertingFiles && (
            <View style={[s.banner, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={[s.bannerText, { color: '#1d4ed8' }]}>Reading files…</Text>
            </View>
          )}

          {attachments.map((file) => {
            const icon = getFileIcon(file.mimeType);
            const ready = !!file.dataUri;
            return (
              <View key={file.uri} style={[s.attachRow, { backgroundColor: icon.bg, borderColor: icon.border }]}>
                <View style={[s.attachIcon, { borderColor: icon.border }]}>
                  <Feather name={icon.name} size={16} color={icon.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: 'Roboto', fontSize: 12, fontWeight: '700', color: '#0f172a' }}>{file.name}</Text>
                  <Text style={{ fontFamily: 'Roboto', fontSize: 10, color: '#64748b', marginTop: 1 }}>
                    {ready ? `Ready${file.size ? ' · ' + formatSize(file.size) : ''}` : 'Processing…'}
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
        </View>

        {/* ── Save Button ── */}
        <TouchableOpacity onPress={handleSave} disabled={loading || convertingFiles} activeOpacity={0.85}
          style={[s.saveBtn, (loading || convertingFiles) && { opacity: 0.65 }]}>
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={s.saveBtnText}>{isEditing ? 'Update Request' : 'Post Assignment Request'}</Text>}
        </TouchableOpacity>

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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', shadowColor: '#64748b', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  backBtn: { marginRight: 14, padding: 6, marginLeft: -4, borderRadius: 10 },
  headerTitle: { fontFamily: 'Roboto', fontSize: 20, fontWeight: '900', color: '#0f172a' },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#f1f5f9', padding: 20, shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, gap: 18 },
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
  saveBtn: { marginTop: 20, backgroundColor: '#2563eb', borderRadius: 18, paddingVertical: 16, alignItems: 'center', shadowColor: '#2563eb', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 5 },
  saveBtnText: { fontFamily: 'Roboto', fontSize: 16, fontWeight: '900', color: '#fff' },
  pickerModal: { backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 28, padding: 22, borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, elevation: 6 },
  navBtn: { padding: 8, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
});
