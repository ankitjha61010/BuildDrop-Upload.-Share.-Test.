// Grants "anyone with the link can view" access to a just-uploaded file, using the site owner's
// own refresh token. This has to run server-side because the person who just uploaded the file
// has no Google session of their own (see init-upload.ts) and so has no permissions to grant on
// a file they don't own.
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

  const permRes = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  if (!permRes.ok) {
    const detail = await permRes.text().catch(() => '');
    console.error('Failed to set public permission:', permRes.status, detail);
    return new Response('Failed to make file shareable', { status: 502 });
  }

  return Response.json({ success: true });
};

export const config: Config = {
  path: '/api/finalize-upload',
};
