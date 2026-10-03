/**
 * File-upload client for the Anulekh backend (Rust/Axum, see Anulekh-Axum/src/storage.rs).
 *
 * Used by the chat screen (app/console/common/chat.tsx) to upload images and
 * documents. The backend stores files in Cloudflare R2 when R2 credentials are
 * configured, otherwise on its own local disk (development). Two endpoints are used:
 *   - POST /api/storage/presigned-url : returns a short-lived (15 min) PUT URL
 *   - POST /api/storage/upload        : accepts the file as a base64 string
 * `uploadFile` prefers a direct presigned PUT to R2 (no base64 overhead through the
 * server) and falls back to the base64 endpoint. Functions never throw; failures
 * are reported through `null` / `UploadResult.error`.
 * Note: these requests are sent without an auth header (the backend routes do not require one).
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { API_URL } from '@/core/supabase';

/**
 * Response of POST /api/storage/presigned-url.
 * `upload_url` is where to PUT the raw bytes, `public_url` is the final readable URL,
 * `file_key` is the object key (`<folder>/<uuid>.<ext>`), and `storage_type` says
 * whether the backend is using R2 or its local-disk fallback.
 */
export interface PresignedUrlResponse {
  upload_url: string;
  public_url: string;
  file_key: string;
  storage_type: 'r2' | 'local';
}

/**
 * Options shared by all upload functions.
 * `folder` is the top-level key prefix in the bucket (defaults to 'general'),
 * `fileExt` the extension without dot (defaults to 'bin') and `contentType` the
 * MIME type (defaults to 'application/octet-stream').
 */
export interface UploadOptions {
  folder?: 'chat' | 'proofs' | 'avatars' | 'tickets' | 'general';
  fileExt?: string;
  contentType?: string;
}

/**
 * Result of an upload. On success `error` is null and `publicUrl` / `fileKey` are
 * set; on failure both strings are empty and `error` holds a readable message.
 */
export interface UploadResult {
  publicUrl: string;
  fileKey: string;
  error: string | null;
}

/**
 * Storage Service for Cloudflare R2 (and local fallback)
 */
export const storageService = {
  /**
   * Request a presigned URL from backend
   */
  async getPresignedUrl(options: UploadOptions): Promise<PresignedUrlResponse | null> {
    // Returns null on any HTTP or network error so callers can fall back to base64 upload.
    try {
      const res = await fetch(`${API_URL}/api/storage/presigned-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: options.folder || 'general',
          file_ext: options.fileExt || 'bin',
          content_type: options.contentType || 'application/octet-stream',
        }),
      });

      if (!res.ok) return null;
      return (await res.json()) as PresignedUrlResponse;
    } catch (e) {
      console.warn('Failed to get presigned URL:', e);
      return null;
    }
  },

  /**
   * Direct Base64 upload to backend (works with R2 and local fallback)
   */
  async uploadBase64(base64Data: string, options: UploadOptions): Promise<UploadResult> {
    // `base64Data` may be raw base64 or a full data: URI — the backend strips any "data:...," prefix.
    try {
      const res = await fetch(`${API_URL}/api/storage/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: options.folder || 'general',
          file_ext: options.fileExt || 'bin',
          content_type: options.contentType || 'application/octet-stream',
          file_base64: base64Data,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { publicUrl: '', fileKey: '', error: data.error || 'Upload failed' };
      }

      return { publicUrl: data.public_url, fileKey: data.file_key, error: null };
    } catch (err: any) {
      return { publicUrl: '', fileKey: '', error: err.message || 'Network error during upload' };
    }
  },

  /**
   * Universal upload function: accepts local file URI or base64 string
   */
  async uploadFile(fileUriOrBase64: string, options: UploadOptions): Promise<UploadResult> {
    // Heuristic: a data: URI, or a long string that is not a file://, http(s) or blob: URI, is treated as base64.
    const isBase64 = fileUriOrBase64.startsWith('data:') || (!fileUriOrBase64.startsWith('file://') && !fileUriOrBase64.startsWith('http') && !fileUriOrBase64.startsWith('blob:') && fileUriOrBase64.length > 500);

    // 1. If it's already a base64 string, upload directly
    if (isBase64) {
      return this.uploadBase64(fileUriOrBase64, options);
    }

    // 2. Try presigned PUT upload
    // Only attempted when the backend is on R2; with local storage we skip straight to step 3.
    const presigned = await this.getPresignedUrl(options);
    if (presigned && presigned.storage_type === 'r2') {
      try {
        // Web: the URI is a blob:/http URL, so fetch it into a Blob and PUT that.
        if (Platform.OS === 'web') {
          const blobRes = await fetch(fileUriOrBase64);
          const blob = await blobRes.blob();
          const putRes = await fetch(presigned.upload_url, {
            method: 'PUT',
            headers: {
              'Content-Type': options.contentType || 'application/octet-stream',
            },
            body: blob,
          });

          if (putRes.ok) {
            return {
              publicUrl: presigned.public_url,
              fileKey: presigned.file_key,
              error: null,
            };
          }
        } else {
          // Native: stream the local file's raw bytes with expo-file-system (BINARY_CONTENT = body is the file itself).
          const uploadRes = await FileSystem.uploadAsync(presigned.upload_url, fileUriOrBase64, {
            httpMethod: 'PUT',
            uploadType: (FileSystem.UploadType?.BINARY_CONTENT ?? 0) as any,
            headers: {
              'Content-Type': options.contentType || 'application/octet-stream',
            },
          });

          if (uploadRes.status >= 200 && uploadRes.status < 300) {
            return {
              publicUrl: presigned.public_url,
              fileKey: presigned.file_key,
              error: null,
            };
          }
        }
      } catch (uploadErr) {
        console.warn('Presigned PUT failed, falling back to direct upload:', uploadErr);
      }
    }

    // 3. Fallback: read file and send via direct base64 upload
    // Reached when R2 is not configured, the presigned request failed, or the PUT returned non-2xx.
    try {
      let base64Data = '';
      // Web: FileReader yields a data: URI (prefix is stripped server-side). Native: read the file as base64.
      if (Platform.OS === 'web') {
        const response = await fetch(fileUriOrBase64);
        const blob = await response.blob();
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        base64Data = await FileSystem.readAsStringAsync(fileUriOrBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      return this.uploadBase64(base64Data, options);
    } catch (err: any) {
      return { publicUrl: '', fileKey: '', error: err.message || 'Failed to read file for upload' };
    }
  },
};
