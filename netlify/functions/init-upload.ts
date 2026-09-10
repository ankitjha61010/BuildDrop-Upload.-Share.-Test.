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
const EXPIRATION_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function getUploadsFolderName(): string {
  return (process.env.VITE_UPLOADS_FOLDER_NAME || 'VidSetu_Uploads').trim();
}

// Finds (or creates) the shared uploads folder in the owner's own Drive. A fixed
// DRIVE_UPLOADS_FOLDER_ID env var skips the lookup entirely; otherwise it's found/created by
// name, same as the folder the client used to resolve for itself before it had its own login.
async function resolveUploadsFolderId(token: string): Promise<string> {
  const fixedId = (process.env.DRIVE_UPLOADS_FOLDER_ID || '').trim();
  if (fixedId) return fixedId;

  const folderName = getUploadsFolderName();
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
      description: 'VidSetu shared uploads storage folder',
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create uploads folder: ${createRes.status} ${await createRes.text()}`);
  }
  const created = await createRes.json();
  return created.id;
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let fileName: unknown, mimeType: unknown, fileSize: unknown;
  try {
    const body = await req.json();
    fileName = body?.fileName;
    mimeType = body?.mimeType;
    fileSize = body?.fileSize;
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

  let folderId: string;
  try {
    folderId = await resolveUploadsFolderId(token);
  } catch (err: any) {
    console.error('Failed to resolve uploads folder:', err);
    return new Response('Failed to prepare storage folder', { status: 502 });
  }

  const createdAt = Date.now();
  const expiresAt = createdAt + EXPIRATION_DURATION_MS;
  const resolvedMimeType = typeof mimeType === 'string' && mimeType ? mimeType : 'application/octet-stream';

  const metadata = {
    name: fileName,
    mimeType: resolvedMimeType,
    parents: [folderId],
    description: `Uploaded via VidSetu. Expires at ${new Date(expiresAt).toISOString()}`,
    properties: {
      vidsetu_created_at: createdAt.toString(),
      vidsetu_expires_at: expiresAt.toString(),
      original_name: fileName,
    },
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
    console.error('Failed to initiate Drive resumable session:', sessionRes.status, detail);
    return new Response('Failed to initiate upload session', { status: 502 });
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
