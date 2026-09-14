// Starts a Google Drive resumable upload session using the site owner's own refresh token, so
// the person uploading (who may be a friend with no Google account of their own) never has to
// sign in. The browser then PUTs the file's bytes directly to the session URL this returns -
// Drive resumable session URLs are self-authorizing (no Authorization header needed on the PUT
// requests that follow), so multi-GB file bytes never have to pass through this function.
import type { Config } from '@netlify/functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024 * 1024; // 12 GB
const EXPIRATION_DURATION_MS = 12 * 24 * 60 * 60 * 1000; // 12 days

function getUploadsFolderName(requestedName?: string): string {
  if (requestedName === 'Private_BuildDrop_Uploads' || requestedName === 'BuildDrop_Uploads') {
    return requestedName;
  }
  return (process.env.VITE_UPLOADS_FOLDER_NAME || 'BuildDrop_Uploads').trim();
}

// Finds (or creates) the target shared uploads folder in the owner's own Drive.
async function resolveUploadsFolderId(token: string, targetFolderName?: string): Promise<string> {
  const folderName = getUploadsFolderName(targetFolderName);

  // If requesting standard folder and DRIVE_UPLOADS_FOLDER_ID is set, use fixed ID
  const fixedId = (process.env.DRIVE_UPLOADS_FOLDER_ID || '').trim();
  if (fixedId && folderName === getUploadsFolderName()) return fixedId;

  const q = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchRes = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files?.length > 0) return data.files[0].id;
  }

  const createRes = await fetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: `BuildDrop shared storage folder (${folderName})`,
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create uploads folder "${folderName}": ${createRes.status} ${await createRes.text()}`);
  }
  const created = await createRes.json();
  return created.id;
}

// Helper to find or create a subfolder inside a parent folder
async function findOrCreateSubfolder(token: string, parentFolderId: string, folderName: string): Promise<string> {
  const q = `'${parentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchRes = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files?.length > 0) return data.files[0].id;
  }

  const createRes = await fetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create subfolder "${folderName}": ${createRes.status} ${await createRes.text()}`);
  }
  const created = await createRes.json();
  return created.id;
}

// Upload base64 image data directly into the build folder in Drive
async function uploadBase64IconToDrive(token: string, buildFolderId: string, base64Data: string): Promise<string | undefined> {
  try {
    const match = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return undefined;

    const buffer = Buffer.from(match[2], 'base64');
    const iconFileName = `icon_${Date.now()}.png`;

    const createRes = await fetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: iconFileName,
        mimeType: 'image/png',
        parents: [buildFolderId],
        description: `BuildDrop App Icon`,
      }),
    });

    if (!createRes.ok) return undefined;
    const created = await createRes.json();
    const iconFileId = created.id;

    await fetch(
      `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(iconFileId)}?uploadType=media&supportsAllDrives=true`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
        body: buffer,
      }
    );

    // Make icon file publicly readable
    await fetch(`${DRIVE_API}/files/${encodeURIComponent(iconFileId)}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }).catch(() => { });

    return `https://lh3.googleusercontent.com/d/${iconFileId}`;
  } catch (err) {
    console.error('Failed to upload base64 icon to Drive:', err);
    return undefined;
  }
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let fileName: unknown, mimeType: unknown, fileSize: unknown, appName: unknown, bundleId: unknown, bundleVersion: unknown, buildNumber: unknown, appIcon: unknown, targetFolder: unknown, userId: unknown;
  try {
    const body = await req.json();
    fileName = body?.fileName;
    mimeType = body?.mimeType;
    fileSize = body?.fileSize;
    appName = body?.appName;
    bundleId = body?.bundleId;
    bundleVersion = body?.bundleVersion;
    buildNumber = body?.buildNumber;
    appIcon = body?.appIcon;
    targetFolder = body?.targetFolder;
    userId = body?.userId;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (!fileName || typeof fileName !== 'string') {
    return new Response('Missing fileName', { status: 400 });
  }
  if (typeof fileSize !== 'number' || fileSize <= 0) {
    return new Response('Missing or invalid fileSize', { status: 400 });
  }
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return new Response('File exceeds the 12 GB maximum', { status: 413 });
  }

  let token: string;
  try {
    token = await getDriveAccessToken();
  } catch (err) {
    console.error('Failed to mint Drive access token:', err);
    return new Response('Server not configured', { status: 500 });
  }

  let rootFolderId: string;
  try {
    rootFolderId = await resolveUploadsFolderId(token, typeof targetFolder === 'string' ? targetFolder : undefined);
  } catch (err: any) {
    console.error('Failed to resolve uploads folder:', err);
    return new Response('Failed to prepare storage folder', { status: 502 });
  }

  // Create nested user subfolder & build subfolder structure:
  // BuildDrop_Uploads / {userId} / {buildId} /
  const resolvedUserId = (typeof userId === 'string' && userId.trim()) ? userId.trim() : 'user_default';
  let buildFolderId: string;
  let userFolderId: string;
  try {
    userFolderId = await findOrCreateSubfolder(token, rootFolderId, resolvedUserId);
    const buildFolderName = `build_${Date.now()}`;
    buildFolderId = await findOrCreateSubfolder(token, userFolderId, buildFolderName);
  } catch (err: any) {
    console.error('Failed to create subfolders for upload:', err);
    return new Response('Failed to prepare nested build folder', { status: 502 });
  }

  const createdAt = Date.now();
  const expiresAt = createdAt + EXPIRATION_DURATION_MS;
  const resolvedMimeType = typeof mimeType === 'string' && mimeType ? mimeType : 'application/octet-stream';
  const uploadTypeStr = targetFolder === 'Private_BuildDrop_Uploads' ? 'PRIVATE' : 'NORMAL';

  const propertiesRecord: Record<string, string> = {
    vidsetu_created_at: createdAt.toString(),
    original_name: fileName,
    builddrop_upload_type: uploadTypeStr,
    builddrop_user_folder_id: userFolderId,
    builddrop_build_folder_id: buildFolderId,
  };

  // Only set 12-day expiration timestamp if the upload is NORMAL
  if (uploadTypeStr === 'NORMAL') {
    propertiesRecord.vidsetu_expires_at = expiresAt.toString();
  }

  if (typeof appName === 'string' && appName) propertiesRecord.builddrop_app_name = appName.slice(0, 100);
  if (typeof bundleId === 'string' && bundleId) propertiesRecord.builddrop_bundle_id = bundleId.slice(0, 100);
  if (typeof bundleVersion === 'string' && bundleVersion) propertiesRecord.builddrop_bundle_version = bundleVersion.slice(0, 50);
  if (typeof buildNumber === 'string' && buildNumber) propertiesRecord.builddrop_build_number = buildNumber.slice(0, 50);

  // Handle app icon storage inside the build subfolder
  if (typeof appIcon === 'string' && appIcon) {
    if (appIcon.startsWith('data:image/')) {
      const uploadedIconUrl = await uploadBase64IconToDrive(token, buildFolderId, appIcon);
      if (uploadedIconUrl) {
        propertiesRecord.builddrop_app_icon = uploadedIconUrl;
      }
    } else if (appIcon.length <= 120) {
      propertiesRecord.builddrop_app_icon = appIcon;
    }
  }

  const metadata = {
    name: fileName,
    mimeType: resolvedMimeType,
    parents: [buildFolderId],
    description: `Uploaded via BuildDrop. Expires at ${new Date(expiresAt).toISOString()}`,
    properties: propertiesRecord,
  };

  const sessionRes = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,size,mimeType,createdTime,thumbnailLink,webContentLink,webViewLink,properties`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': resolvedMimeType,
        'X-Upload-Content-Length': fileSize.toString(),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!sessionRes.ok) {
    const detail = await sessionRes.text().catch(() => '');
    console.error('Drive resumable session create failed:', sessionRes.status, detail);
    if (sessionRes.status === 403 || sessionRes.status === 507 || /quota|storage|space|exceeded/i.test(detail)) {
      return Response.json(
        {
          error: 'STORAGE_FULL',
          message: 'Google Drive storage space is currently full. Please wait a few moments while expired builds auto-cleanup, or try again later.',
        },
        { status: 507 }
      );
    }
    return Response.json(
      { error: 'INIT_FAILED', message: `Failed to initialize resumable upload session: ${detail || sessionRes.statusText}` },
      { status: sessionRes.status }
    );
  }

  const uploadUrl = sessionRes.headers.get('Location');
  if (!uploadUrl) {
    return new Response('Drive did not return an upload session URL', { status: 502 });
  }

  return Response.json({ uploadUrl });
};

export const config: Config = {
  path: '/api/init-upload',
};

