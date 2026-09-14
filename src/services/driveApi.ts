import { VideoMetadata } from '../types';
import { isVideoFile as isVideoFileType } from '../utils/fileType';

const DRIVE_API_V3 = 'https://www.googleapis.com/drive/v3';
const STORAGE_KEY_LOCAL_METAS = 'vidsetu_local_video_metas';

export const getCentralFolderId = (): string => {
  return ((import.meta as any).env?.VITE_CENTRAL_FOLDER_ID || (import.meta as any).env?.VITE_PUBLIC_FOLDER_ID || '').trim();
};

export const getGoogleApiKey = (): string => {
  return ((import.meta as any).env?.VITE_GOOGLE_API_KEY || '').trim();
};

export const getUploadsFolderName = (): string => {
  return ((import.meta as any).env?.VITE_UPLOADS_FOLDER_NAME || 'VidSetu_Uploads').trim();
};

// A video counts as a temporary, one-time-download share (rather than a permanent library
// upload, which gets a 10-year expiry) when its lifespan is well short of that permanent window.
export const isTemporaryUpload = (video: Pick<VideoMetadata, 'expiresAt' | 'createdAt'>): boolean => {
  return Boolean(video.expiresAt) && video.expiresAt < video.createdAt + 10 * 24 * 60 * 60 * 1000;
};

// Same-origin download URL, proxied through our own Edge Function instead of pointing at
// drive.google.com directly. drive.google.com is a verified Android App Link for the Google
// Drive app, so navigating to it on mobile gets intercepted by the OS into an account-picker /
// "open with Drive" prompt instead of just saving the file - a same-origin URL never does that.
export const getDirectDownloadUrl = (fileId: string, fileName: string): string => {
  const params = new URLSearchParams({ id: fileId, name: fileName });
  return `/api/download-file?${params.toString()}`;
};

// Fetches a URL as a Blob, reporting byte progress as it streams in, and validates the response
// before handing back a Blob. Without that validation, a misrouted request (e.g. /api/download-file
// hit while running plain `vite dev`, which has no Netlify Functions/Edge Functions and falls back
// to serving the SPA's own index.html) silently "succeeds" with the wrong content - the browser
// then happily saves that HTML as if it were the real file, with no visible error at all.
export async function fetchBlobWithProgress(
  url: string,
  init: RequestInit = {},
  onProgress?: (loadedBytes: number, totalBytes: number) => void,
  expectedSize?: number
): Promise<Blob> {
  const res = await fetch(url, init);

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `Download failed (HTTP ${res.status})`);
  }

  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(
      'The download endpoint returned a web page instead of the file. If you are running this app with "npm run dev" locally, use "netlify dev" instead (or test on the deployed site) - the download proxy is a Netlify Function and does not exist under plain Vite dev.'
    );
  }

  if (!res.body || !onProgress) {
    return await res.blob();
  }

  const contentLength = +(res.headers.get('Content-Length') || 0);
  // Content-Length isn't always exposed; fall back to the caller-supplied known size so
  // progress doesn't silently stay stuck at 0.
  const totalBytes = contentLength > 0 ? contentLength : (expectedSize || 0);
  const reader = res.body.getReader();
  let receivedBytes = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.length;
      onProgress(receivedBytes, totalBytes);
    }
  }

  return new Blob(chunks as any, { type: contentType || 'application/octet-stream' });
}

// Same "wrong runtime" guard as fetchBlobWithProgress above, for our other same-origin Netlify
// Function endpoints (/api/init-upload, /api/finalize-upload, /api/list-videos, ...): under
// plain `vite dev` these don't exist, and the request either 404s or - for a GET, since Vite's
// dev server serves index.html for any unmatched route - silently comes back as the SPA's own
// HTML with a 200 status. Without this check that HTML would otherwise hit `res.json()` and
// surface only as a cryptic "Unexpected token '<'" syntax error.
export async function fetchJson<T = any>(url: string, init: RequestInit = {}, label: string): Promise<T> {
  const res = await fetch(url, init);
  const viteDevHint =
    'If you are running this app with "npm run dev" locally, use "netlify dev" instead (or test on the deployed site) - this endpoint is a Netlify Function and does not exist under plain Vite dev.';

  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(`${label} returned a web page instead of data. ${viteDevHint}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // A bare 404 with no body from one of our own same-origin /api/ paths is almost always this
    // same "wrong runtime" cause, just without Vite's HTML fallback body (it only rewrites GET
    // requests to index.html, so a POST like this one just 404s empty-handed instead).
    if (res.status === 404 && !detail) {
      throw new Error(`${label} failed: endpoint not found (HTTP 404). ${viteDevHint}`);
    }
    throw new Error(detail || `${label} failed (HTTP ${res.status})`);
  }

  return res.json();
}

export class DriveApiService {
  /**
   * Helper to check if a Drive file is a movie/video file
   */
  public isVideoFile(file: any): boolean {
    const mime = (file?.mimeType || '').toLowerCase().trim();

    // Folders are not videos
    if (mime === 'application/vnd.google-apps.folder' || mime.includes('folder')) {
      return false;
    }

    // Single source of truth shared with the player/UI file-type detection, so a file
    // that's excluded here (e.g. .aab/.apk/.ipa) can never later be misread as a video.
    return isVideoFileType(file?.name || '', file?.mimeType);
  }

  /**
   * Maps a raw Drive file resource (from either listVideos or getVideoMetadata) into our
   * VideoMetadata shape, resolving the temporary-share vs. permanent-library expiration.
   */
  private mapDriveFile(file: any, folderIdHint?: string): VideoMetadata {
    const appProps = { ...file.appProperties, ...file.properties };
    const localCache = this.getLocalMetadataCache();
    const fallbackLocal = localCache[file.id] || {};

    const hasExplicitExpiration = Boolean(appProps.vidsetu_expires_at || fallbackLocal.expiresAt);
    const createdAt = parseInt(appProps.vidsetu_created_at || fallbackLocal.createdAt || new Date(file.createdTime || Date.now()).getTime(), 10);
    const expiresAt = hasExplicitExpiration
      ? parseInt(appProps.vidsetu_expires_at || fallbackLocal.expiresAt, 10)
      : (createdAt + 10 * 365 * 24 * 60 * 60 * 1000);
    const isExpired = hasExplicitExpiration && Date.now() > expiresAt;

    const meta: VideoMetadata = {
      id: file.id,
      driveFileId: file.id,
      name: file.name,
      originalFileName: appProps.original_name || file.name,
      size: parseInt(file.size || '0', 10),
      mimeType: file.mimeType || 'application/octet-stream',
      createdAt,
      expiresAt,
      isExpired,
      thumbnailLink: file.thumbnailLink,
      webContentLink: file.webContentLink || `https://drive.google.com/uc?export=download&id=${file.id}`,
      webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
      driveFolderId: file.parents?.[0] || folderIdHint,
      appName: appProps.builddrop_app_name || fallbackLocal.appName,
      bundleId: appProps.builddrop_bundle_id || fallbackLocal.bundleId,
      bundleVersion: appProps.builddrop_bundle_version || fallbackLocal.bundleVersion,
      buildNumber: appProps.builddrop_build_number || fallbackLocal.buildNumber || '1',
      appIcon: appProps.builddrop_app_icon || fallbackLocal.appIcon,
    };

    this.cacheVideoMetadata(meta);
    return meta;
  }

  /**
   * Get single video metadata by Drive file ID or check expiration (public unauthenticated
   * fetching - works for any recipient, not just the site owner).
   */
  public async getVideoMetadata(fileId: string): Promise<VideoMetadata> {
    let file: any = null;

    // 1. Try server-side Netlify Function first (uses OAuth token, works reliably for any file)
    try {
      const res = await fetch(`/api/get-metadata?id=${encodeURIComponent(fileId)}`);
      if (res.ok) {
        file = await res.json();
      } else if (res.status === 404) {
        throw new Error('This file has been removed or deleted from Google Drive.');
      }
    } catch (err: any) {
      if (err?.message?.includes('removed or deleted')) {
        throw err;
      }
      console.warn('Server get-metadata endpoint fetch warning:', err);
    }

    // 2. Fallback to public API-key endpoint if server endpoint failed or not running Netlify
    if (!file || !file.id) {
      const apiKey = getGoogleApiKey();
      if (apiKey) {
        try {
          const res = await fetch(
            `${DRIVE_API_V3}/files/${fileId}?fields=id,name,size,mimeType,createdTime,thumbnailLink,webContentLink,webViewLink,properties,appProperties,trashed&key=${apiKey}`
          );
          if (res.ok) {
            file = await res.json();
          } else {
            console.warn('Public API-key metadata fetch failed:', res.status, await res.text());
          }
        } catch (err) {
          console.warn('Public API-key metadata fetch error:', err);
        }
      }
    }

    if (!file || !file.id) {
      const localCache = this.getLocalMetadataCache();
      const cached = localCache[fileId];

      if (cached && cached.name) {
        file = {
          id: fileId,
          name: cached.name,
          size: cached.size?.toString() || '0',
          mimeType: cached.mimeType || 'application/octet-stream',
          createdTime: new Date(cached.createdAt || Date.now()).toISOString(),
          thumbnailLink: cached.thumbnailLink,
          appProperties: {
            vidsetu_created_at: cached.createdAt?.toString(),
            vidsetu_expires_at: cached.expiresAt?.toString(),
            original_name: cached.originalFileName || cached.name,
          },
        };
      } else {
        // Last resort: neither a working API key nor a local cache entry could identify this
        // file - fall back to a bare placeholder rather than erroring out entirely, since the
        // direct download/view links still work without any metadata.
        file = {
          id: fileId,
          name: 'Shared File',
          size: '0',
          mimeType: 'application/octet-stream',
          createdTime: new Date().toISOString(),
          webContentLink: `https://drive.google.com/uc?export=download&id=${fileId}`,
          webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
        };
      }
    }

    if (file.trashed) {
      throw new Error('This file has been removed or deleted from Google Drive.');
    }

    return this.mapDriveFile(file);
  }

  /**
   * Consume a one-time temporary share link: ask the server (which holds the site owner's own
   * Drive credentials) to delete the file from Drive. Works for anonymous recipients (no Google
   * session of their own) since it's the server doing the deleting, not the caller's browser.
   * Also reused to clean up any expired library file, since the server only ever allows deleting
   * files explicitly marked as temporary shares (see netlify/functions/consume-download.ts).
   */
  public async consumeTemporaryDownload(fileId: string): Promise<void> {
    try {
      const res = await fetch('/api/consume-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      if (!res.ok) {
        console.warn('Failed to delete temporary file after download:', res.status, await res.text());
        return;
      }
    } catch (err) {
      console.warn('Failed to reach delete-after-download endpoint:', err);
      return;
    }

    this.removeCachedMetadata(fileId);
  }

  /**
   * Local metadata caching to handle cross-origin or immediate local updates
   */
  public getLocalMetadataCache(): Record<string, Partial<VideoMetadata>> {
    const raw = localStorage.getItem(STORAGE_KEY_LOCAL_METAS);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  public cacheVideoMetadata(meta: VideoMetadata): void {
    const cache = this.getLocalMetadataCache();
    cache[meta.driveFileId] = {
      id: meta.id,
      driveFileId: meta.driveFileId,
      name: meta.name,
      originalFileName: meta.originalFileName,
      size: meta.size,
      mimeType: meta.mimeType,
      createdAt: meta.createdAt,
      expiresAt: meta.expiresAt,
      thumbnailLink: meta.thumbnailLink,
      appName: meta.appName,
      bundleId: meta.bundleId,
      bundleVersion: meta.bundleVersion,
      buildNumber: meta.buildNumber,
      appIcon: meta.appIcon,
    };
    localStorage.setItem(STORAGE_KEY_LOCAL_METAS, JSON.stringify(cache));
  }

  public removeCachedMetadata(fileId: string): void {
    const cache = this.getLocalMetadataCache();
    delete cache[fileId];
    localStorage.setItem(STORAGE_KEY_LOCAL_METAS, JSON.stringify(cache));
  }
}

export const driveApi = new DriveApiService();
