import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { API_URL } from '@/core/supabase';

export interface PresignedUrlResponse {
  upload_url: string;
  public_url: string;
  file_key: string;
  storage_type: 'r2' | 'local';
}

export interface UploadOptions {
  folder?: 'chat' | 'proofs' | 'avatars' | 'tickets' | 'general';
  fileExt?: string;
  contentType?: string;
}

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
    const isBase64 = fileUriOrBase64.startsWith('data:') || (!fileUriOrBase64.startsWith('file://') && !fileUriOrBase64.startsWith('http') && !fileUriOrBase64.startsWith('blob:') && fileUriOrBase64.length > 500);

    // 1. If it's already a base64 string, upload directly
    if (isBase64) {
      return this.uploadBase64(fileUriOrBase64, options);
    }

    // 2. Try presigned PUT upload
    const presigned = await this.getPresignedUrl(options);
    if (presigned && presigned.storage_type === 'r2') {
      try {
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
          const uploadRes = await FileSystem.uploadAsync(presigned.upload_url, fileUriOrBase64, {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
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
    try {
      let base64Data = '';
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
