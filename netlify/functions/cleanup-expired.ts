// Netlify Scheduled Function: runs automatically once a day (cron @daily) to delete
// any uploaded files from Google Drive whose expiration timestamp (12 days) has passed.
import type { Config } from '@netlify/functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export default async () => {
  console.log('[Cleanup] Running automated expired files cleanup...');

  let token: string;
  try {
    token = await getDriveAccessToken();
  } catch (err) {
    console.error('[Cleanup] Failed to obtain Drive access token:', err);
    return new Response('Server auth failed', { status: 500 });
  }

  const now = Date.now();
  let deletedCount = 0;

  try {
    // Search for non-trashed files in Drive
    const q = "trashed = false";
    const searchRes = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,properties,appProperties)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error('[Cleanup] Failed to list Drive files:', searchRes.status, errText);
      return new Response('Failed to query files', { status: 502 });
    }

    const data = await searchRes.json();
    const files: any[] = data.files || [];

    for (const file of files) {
      const expiresAtStr = file.properties?.vidsetu_expires_at || file.appProperties?.vidsetu_expires_at;
      if (!expiresAtStr) continue;

      const expiresAt = parseInt(expiresAtStr, 10);
      if (!isNaN(expiresAt) && expiresAt <= now) {
        console.log(`[Cleanup] Deleting expired file "${file.name}" (ID: ${file.id}, Expired at: ${new Date(expiresAt).toISOString()})`);
        const delRes = await fetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?supportsAllDrives=true`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (delRes.ok || delRes.status === 404) {
          deletedCount++;
        } else {
          console.error(`[Cleanup] Failed to delete file ${file.id}:`, delRes.status, await delRes.text());
        }
      }
    }

    console.log(`[Cleanup] Completed. Deleted ${deletedCount} expired file(s).`);
    return Response.json({ success: true, deletedCount });
  } catch (err: any) {
    console.error('[Cleanup] Error during cleanup:', err);
    return new Response(err?.message || 'Cleanup error', { status: 500 });
  }
};

export const config: Config = {
  schedule: '@daily',
};
