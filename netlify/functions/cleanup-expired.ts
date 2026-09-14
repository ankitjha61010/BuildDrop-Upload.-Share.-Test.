// Netlify Scheduled Function: runs automatically once a day (cron @daily) to delete
// any uploaded files from Google Drive whose expiration timestamp (12 days) has passed.
// IMPORTANT: Excludes PRIVATE builds (Private_BuildDrop_Uploads) - PRIVATE builds NEVER expire.
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
      const props = { ...file.appProperties, ...file.properties };
      
      // NEVER expire private uploads or files marked as PRIVATE
      if (props.builddrop_upload_type === 'PRIVATE' || props.folderName === 'Private_BuildDrop_Uploads') {
        continue;
      }

      const expiresAtStr = props.vidsetu_expires_at;
      if (!expiresAtStr) continue;

      const expiresAt = parseInt(expiresAtStr, 10);
      if (!isNaN(expiresAt) && expiresAt <= now) {
        console.log(`[Cleanup] Deleting expired file "${file.name}" (ID: ${file.id})`);
        
        // If file has a build folder, delete the entire build folder (which includes build file and icon)
        const buildFolderId = props.builddrop_build_folder_id;
        const userFolderId = props.builddrop_user_folder_id;

        if (buildFolderId) {
          const folderDelRes = await fetch(`${DRIVE_API}/files/${encodeURIComponent(buildFolderId)}?supportsAllDrives=true`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (folderDelRes.ok || folderDelRes.status === 404) {
            deletedCount++;
          }
        } else {
          // Fallback for legacy files
          const delRes = await fetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?supportsAllDrives=true`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });

          if (delRes.ok || delRes.status === 404) {
            deletedCount++;
          }

          if (props.builddrop_app_icon && props.builddrop_app_icon.includes('id=')) {
            const iconId = props.builddrop_app_icon.split('id=')[1]?.split('&')[0];
            if (iconId) {
              await fetch(`${DRIVE_API}/files/${encodeURIComponent(iconId)}?supportsAllDrives=true`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              }).catch(() => {});
            }
          }
        }

        // Clean up empty user folder if userFolderId is set
        if (userFolderId) {
          try {
            const checkRes = await fetch(
              `${DRIVE_API}/files?q=${encodeURIComponent(`'${userFolderId}' in parents and trashed = false`)}&fields=files(id)&supportsAllDrives=true`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (!checkData.files || checkData.files.length === 0) {
                await fetch(`${DRIVE_API}/files/${encodeURIComponent(userFolderId)}?supportsAllDrives=true`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${token}` },
                }).catch(() => {});
              }
            }
          } catch {}
        }
      }
    }

    // Empty Google Drive Trash after deleting expired files
    if (deletedCount > 0) {
      await fetch(`${DRIVE_API}/files/trash`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    console.log(`[Cleanup] Completed. Deleted ${deletedCount} expired file(s) and emptied trash.`);
    return Response.json({ success: true, deletedCount });
  } catch (err: any) {
    console.error('[Cleanup] Error during cleanup:', err);
    return new Response(err?.message || 'Cleanup error', { status: 500 });
  }
};

export const config: Config = {
  schedule: '@daily',
};
