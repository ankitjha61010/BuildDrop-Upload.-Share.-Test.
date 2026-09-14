// Netlify Function: Admin endpoint to list all files across public (BuildDrop_Uploads)
// and private (Private_BuildDrop_Uploads) folders in Google Drive.
import type { Config } from '@netlify/functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export default async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let token: string;
  try {
    token = await getDriveAccessToken();
  } catch (err) {
    console.error('[AdminList] Failed to get Drive access token:', err);
    return new Response('Server auth error', { status: 500 });
  }

  try {
    const query = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";

    const searchRes = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,mimeType,createdTime,thumbnailLink,webContentLink,webViewLink,properties,appProperties,parents)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error('[AdminList] Failed to list Drive files:', searchRes.status, errText);
      return new Response('Failed to query files', { status: 502 });
    }

    const data = await searchRes.json();
    const allFiles: any[] = data.files || [];

    // Filter build files (exclude icon files and non-BuildDrop files)
    const buildFiles = allFiles.filter((file) => {
      if (file.name.startsWith('icon_') && file.mimeType.startsWith('image/')) return false;
      const props = { ...file.appProperties, ...file.properties };
      return Boolean(props.builddrop_upload_type || props.vidsetu_created_at || props.original_name || props.builddrop_app_name);
    });

    const mappedFiles = buildFiles.map((file) => {
      const props = { ...file.appProperties, ...file.properties };
      const uploadType = props.builddrop_upload_type || (props.folderName === 'Private_BuildDrop_Uploads' ? 'PRIVATE' : 'NORMAL');
      const folderName = uploadType === 'PRIVATE' ? 'Private_BuildDrop_Uploads' : 'BuildDrop_Uploads';

      const createdAt = parseInt(props.vidsetu_created_at || new Date(file.createdTime || Date.now()).getTime().toString(), 10);
      const expiresAt = parseInt(props.vidsetu_expires_at || (createdAt + 12 * 24 * 60 * 60 * 1000).toString(), 10);

      let appIcon = props.builddrop_app_icon || '';
      if (appIcon && appIcon.includes('drive.google.com') && appIcon.includes('id=')) {
        const iconId = appIcon.split('id=')[1]?.split('&')[0];
        if (iconId) appIcon = `https://lh3.googleusercontent.com/d/${iconId}`;
      }

      return {
        id: file.id,
        driveFileId: file.id,
        name: file.name,
        originalFileName: props.original_name || file.name,
        size: parseInt(file.size || '0', 10),
        mimeType: file.mimeType || 'application/octet-stream',
        createdAt,
        expiresAt,
        isExpired: uploadType !== 'PRIVATE' && Date.now() > expiresAt,
        folderName,
        appName: props.builddrop_app_name || '',
        bundleId: props.builddrop_bundle_id || '',
        bundleVersion: props.builddrop_bundle_version || '',
        buildNumber: props.builddrop_build_number || '',
        appIcon,
      };
    });

    return Response.json({ success: true, files: mappedFiles });
  } catch (err: any) {
    console.error('[AdminList] Unexpected error:', err);
    return new Response(err?.message || 'Server error', { status: 500 });
  }
};

export const config: Config = {
  path: '/api/admin-list-files',
};
