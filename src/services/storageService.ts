/**
 * File uploads: the app sends files **directly** to Cloudflare R2 (or, in local development, to the
 * backend's stand-in), never as base64 through the API. See docs/plans/APL.md and
 * Anulekh-Axum/src/storage.rs.
 *
 * Three steps, all inside `uploadFile`:
 *   1. Ask the backend for an upload link: POST /api/storage/presigned-url
 *      { kind, content_type, size_bytes, user_id }. The backend checks the type and size for that kind.
 *   2. PUT the file to the link — phones stream it from disk (expo-file-system upload task, no JS
 *      memory copy); web sends the Blob with XMLHttpRequest so progress can be reported.
 *   3. The caller saves the result (key / URL) in Turso — only after step 2 succeeded.
 *
 * Public kinds return a `publicUrl`. Private kinds (ID proofs, support screenshots) return no URL;
 * store `storedValue` (`r2p:<key>`) instead — only a logged-in admin can open those.
 * `uploadFile` never throws: failures come back in `error` as a short, user-facing message.
 */
import { Platform } from 'react-native';
// SDK 56: the classic upload/info functions live in the "legacy" entry (the main entry throws).
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL, supabase } from '@/core/supabase';
import * as DocumentPicker from 'expo-document-picker';

/** Upload kinds — must match `RULES` in Anulekh-Axum/src/storage.rs. */
export type UploadKind = 'chat_image' | 'chat_pdf' | 'voice' | 'assignment' | 'avatar' | 'proof' | 'ticket';

export interface UploadOptions {
  kind: UploadKind;
  /** MIME type of the file, e.g. 'image/jpeg', 'application/pdf', 'audio/mp4'.
   *  Web only: '' means "use the type the browser reports for the file" (e.g. recorded audio). */
  contentType: string;
  /** File size in bytes when known (the picker usually provides it); otherwise it is measured. */
  sizeBytes?: number;
  /** Called with 0..1 while the file is being sent. */
  onProgress?: (fraction: number) => void;
}

export interface UploadResult {
  /** Storage key, e.g. `chat_image/<user>/<uuid>.jpg` (null on failure). */
  fileKey: string | null;
  /** Public URL for public kinds; null for private kinds and on failure. */
  publicUrl: string | null;
  /** What to save in the database: the public URL, or `r2p:<key>` for private files. */
  storedValue: string | null;
  /** MIME type and size actually uploaded (for `chat_messages.mime_type` / `size_bytes`). */
  mimeType: string;
  sizeBytes: number;
  error: string | null;
}

/** Backend response of POST /api/storage/presigned-url. */
interface PresignedUrlResponse {
  upload_url: string;
  file_key: string;
  public_url: string | null;
  storage_type: 'r2' | 'local';
  content_type: string;
  private: boolean;
}

const fail = (error: string, mimeType = '', sizeBytes = 0): UploadResult =>
  ({ fileKey: null, publicUrl: null, storedValue: null, mimeType, sizeBytes, error });

/** Web: PUT a Blob with progress (fetch cannot report upload progress). Resolves with the HTTP status. */
function putBlobWithProgress(url: string, blob: Blob, contentType: string, onProgress?: (f: number) => void): Promise<number> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(0);
    xhr.ontimeout = () => resolve(0);
    xhr.timeout = 5 * 60 * 1000;
    xhr.send(blob);
  });
}

/** Friendly label for a stored file value: private keys show as "Uploaded document (private)". */
export function fileLabel(value: string | null | undefined, fallback = 'Not uploaded'): string {
  if (!value) return fallback;
  if (value.startsWith('r2p:')) return 'Uploaded document (private)';
  if (/^https?:\/\//.test(value)) return decodeURIComponent(value.split('?')[0].split('/').pop() || fallback);
  return value;
}

export const storageService = {
  /**
   * Uploads one file (a local `file://` / `content://` URI on phones, a `blob:` / `data:` URI on web).
   * Call again to retry — every attempt gets a fresh upload link.
   */
  async uploadFile(uri: string, options: UploadOptions): Promise<UploadResult> {
    const { kind, onProgress } = options;
    const clean = (t: string) => t.split(';')[0].trim().toLowerCase();
    let contentType = clean(options.contentType);
    try {
      // Who is uploading (the backend only issues links for existing accounts).
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return fail('Please sign in again to upload files.', contentType);

      // File size: web reads the Blob (needed for the PUT anyway); phones ask the file system.
      let blob: Blob | null = null;
      let sizeBytes = options.sizeBytes ?? 0;
      if (Platform.OS === 'web') {
        blob = await (await fetch(uri)).blob();
        sizeBytes = blob.size;
        if (!contentType) contentType = clean(blob.type);
      } else if (!sizeBytes) {
        const info = await FileSystem.getInfoAsync(uri);
        sizeBytes = info.exists ? info.size : 0;
      }
      if (!sizeBytes) return fail('Could not read the file.', contentType);

      // 1. Upload link (the backend validates kind, type and size).
      const res = await fetch(`${API_URL}/api/storage/presigned-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, content_type: contentType, size_bytes: sizeBytes, user_id: userId }),
      });
      const link = (await res.json().catch(() => ({}))) as Partial<PresignedUrlResponse> & { error?: string };
      if (!res.ok || !link.upload_url || !link.file_key || !link.content_type) {
        return fail(link.error || 'Upload is not available right now. Please try again.', contentType, sizeBytes);
      }

      // 2. Send the bytes straight to storage, with the exact Content-Type the link was signed for.
      onProgress?.(0);
      let status = 0;
      if (blob) {
        status = await putBlobWithProgress(link.upload_url, blob, link.content_type, onProgress);
      } else {
        const task = FileSystem.createUploadTask(
          link.upload_url,
          uri,
          { httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': link.content_type } },
          (p) => { if (p.totalBytesExpectedToSend > 0) onProgress?.(p.totalBytesSent / p.totalBytesExpectedToSend); },
        );
        status = (await task.uploadAsync())?.status ?? 0;
      }
      if (status < 200 || status >= 300) {
        return fail(status ? `Upload failed (${status}). Please try again.` : 'Network problem — check your connection and try again.', contentType, sizeBytes);
      }
      onProgress?.(1);

      // 3. Hand back what the caller should save.
      const publicUrl = link.private ? null : link.public_url ?? null;
      return {
        fileKey: link.file_key,
        publicUrl,
        storedValue: link.private ? `r2p:${link.file_key}` : publicUrl,
        mimeType: link.content_type,
        sizeBytes,
        error: null,
      };
    } catch (e: any) {
      console.warn('Upload failed:', e);
      return fail('Upload failed — check your connection and try again.', contentType);
    }
  },

  /**
   * Lets the user pick one file (JPEG/PNG image, or a PDF when `allowPdf`) and uploads it as `kind`.
   * Returns null when the user cancels; otherwise the value to save (URL, or `r2p:<key>` for private
   * kinds), the file name and local `uri` (for an on-screen preview), and `error` (null on success).
   */
  async pickAndUpload(
    kind: UploadKind,
    { allowPdf = true, onProgress }: { allowPdf?: boolean; onProgress?: (f: number) => void } = {},
  ): Promise<{ value: string | null; name: string; uri: string; error: string | null } | null> {
    const types = ['image/jpeg', 'image/png', ...(allowPdf ? ['application/pdf'] : [])];
    const picked = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.length) return null;
    const asset = picked.assets[0];
    const name = asset.name || 'document';
    // Phones sometimes report no type; fall back to the file extension.
    const ext = name.split('.').pop()?.toLowerCase();
    const type = asset.mimeType || (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg');
    const res = await this.uploadFile(asset.uri, { kind, contentType: type, onProgress });
    return { value: res.storedValue, name, uri: asset.uri, error: res.error };
  },
};
