// Netlify Function: retrieves metadata for a Google Drive file using the site owner's OAuth token.
// Allows any recipient with a share link to view complete build metadata (app name, icon, bundle ID,
// version, file size, expiration) without requiring a public VITE_GOOGLE_API_KEY environment variable.
import type { Config } from '@netlify/functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export default async (req: Request) => {
  const url = new URL(req.url);
  const fileId = url.searchParams.get('id');

  if (!fileId) {
    return new Response('Missing file ID', { status: 400 });
  }

  let token: string;
  try {
    token = await getDriveAccessToken();
  } catch (err) {
    console.error('[GetMetadata] Failed to get Drive access token:', err);
    return new Response('Server auth configuration error', { status: 500 });
  }

  try {
    const res = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,size,mimeType,createdTime,thumbnailLink,webContentLink,webViewLink,properties,appProperties,trashed&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.status === 404) {
      return Response.json({ error: 'File not found or deleted from storage', trashed: true }, { status: 404 });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[GetMetadata] Drive API returned error:', res.status, errText);
      return new Response('Failed to retrieve file metadata from Drive', { status: 502 });
    }

    const file = await res.json();
    return Response.json(file);
  } catch (err: any) {
    console.error('[GetMetadata] Unexpected error:', err);
    return new Response(err?.message || 'Server error', { status: 500 });
  }
};

export const config: Config = {
  path: '/api/get-metadata',
};
