// Netlify Function: Admin endpoint to permanently purge all files in Google Drive Trash.
import type { Config } from '@netlify/functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let token: string;
  try {
    token = await getDriveAccessToken();
  } catch (err) {
    console.error('[EmptyTrash] Failed to get Drive access token:', err);
    return new Response('Server auth error', { status: 500 });
  }

  try {
    const res = await fetch(`${DRIVE_API}/files/trash`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok && res.status !== 404) {
      const errText = await res.text().catch(() => '');
      console.error('[EmptyTrash] Failed to empty Drive trash:', res.status, errText);
      return new Response('Failed to empty Google Drive trash', { status: 502 });
    }

    return Response.json({ success: true, message: 'Google Drive trash purged successfully.' });
  } catch (err: any) {
    console.error('[EmptyTrash] Unexpected error:', err);
    return new Response(err?.message || 'Server error', { status: 500 });
  }
};

export const config: Config = {
  path: '/api/admin-empty-trash',
};
