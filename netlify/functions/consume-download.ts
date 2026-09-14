// Runs server-side with the uploader's own Google OAuth refresh token so a link recipient or admin
// can delete a build file, along with its build folder, icon image, and empty parent user folder.
import type { Config } from '@netlify/functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let fileId: unknown;
  try {
    const body = await req.json();
    fileId = body?.fileId;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (!fileId || typeof fileId !== 'string') {
    return new Response('Missing fileId', { status: 400 });
  }

  let token: string;
  try {
    token = await getDriveAccessToken();
  } catch (err) {
    console.error('Failed to mint Drive access token:', err);
    return new Response('Server not configured', { status: 500 });
  }

  const metaRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,trashed,parents,properties,appProperties&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (metaRes.status === 404) {
    return Response.json({ success: true, alreadyDeleted: true });
  }
  if (!metaRes.ok) {
    console.error('Drive metadata lookup failed:', metaRes.status, await metaRes.text());
    return new Response('Failed to look up file', { status: 502 });
  }

  const meta = await metaRes.json();
  if (meta.trashed) {
    return Response.json({ success: true, alreadyDeleted: true });
  }

  const props = { ...meta.appProperties, ...meta.properties };
  
  // Verify this is a BuildDrop managed build file
  const isBuildDropFile = Boolean(
    props.builddrop_upload_type ||
    props.vidsetu_created_at ||
    props.original_name ||
    props.vidsetu_expires_at
  );

  if (!isBuildDropFile) {
    return new Response('This file is not managed by BuildDrop and cannot be deleted', { status: 403 });
  }

  const buildFolderId = props.builddrop_build_folder_id || meta.parents?.[0];
  const userFolderId = props.builddrop_user_folder_id;
  const appIconUrl = props.builddrop_app_icon;

  let buildFolderDeleted = false;

  // 1. Try deleting the entire build folder (contains build file & icon PNG)
  if (buildFolderId) {
    const folderDelRes = await fetch(`${DRIVE_API}/files/${encodeURIComponent(buildFolderId)}?supportsAllDrives=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (folderDelRes.ok || folderDelRes.status === 404) {
      buildFolderDeleted = true;
    }
  }

  // 2. Fallback: Delete main build file directly if folder delete didn't run
  if (!buildFolderDeleted) {
    const delRes = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!delRes.ok && delRes.status !== 404) {
      console.error('Drive delete failed:', delRes.status, await delRes.text());
      return new Response('Failed to delete file from Drive', { status: 502 });
    }

    // Delete associated icon file if present
    if (appIconUrl && appIconUrl.includes('id=')) {
      const iconId = appIconUrl.split('id=')[1]?.split('&')[0];
      if (iconId) {
        await fetch(`${DRIVE_API}/files/${encodeURIComponent(iconId)}?supportsAllDrives=true`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    }
  }

  // 3. Check and clean up parent User Folder if it is now empty
  if (userFolderId) {
    try {
      const checkRes = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`'${userFolderId}' in parents and trashed = false`)}&fields=files(id)&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (!checkData.files || checkData.files.length === 0) {
          console.log(`[Delete] User folder ${userFolderId} is now empty. Deleting empty user folder...`);
          await fetch(`${DRIVE_API}/files/${encodeURIComponent(userFolderId)}?supportsAllDrives=true`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('User folder empty check warning:', e);
    }
  }

  return Response.json({ success: true });
};

export const config: Config = {
  path: '/api/consume-download',
};
