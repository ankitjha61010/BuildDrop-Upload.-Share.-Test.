// Streams a Drive file's bytes through our own domain instead of redirecting the browser to
// drive.google.com. That redirect is what was breaking mobile downloads: drive.google.com is a
// verified Android App Link for the Google Drive app, so a plain navigation to it gets
// intercepted by the OS, which shows an account-picker / "open with Drive" prompt instead of
// just saving the file. Requests to our own origin never trigger that interception.
//
// Runs as a Netlify Edge Function (Deno runtime) rather than a regular Function because a
// standard Lambda-based function both has a response size cap and buffers the whole body in
// memory - neither works for multi-GB video files. Edge Functions can stream the response body
// straight through as it arrives from Drive.
import type { Config, Context } from '@netlify/edge-functions';
import { getDriveAccessToken } from '../lib/googleDriveAuth.ts';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  const fileId = url.searchParams.get('id');
  const requestedName = url.searchParams.get('name') || 'download';
  // Set only by ipa-manifest.ts's software-package url - for an iOS OTA install, iOS's installd
  // process fetches the .ipa straight from this endpoint, invisibly to our own JS, so this is the
  // only reliable place to consume a one-time-link install the way handleDownloadFile does for a
  // manual browser download.
  const shouldConsumeAfterServing = url.searchParams.get('consume') === '1';

  if (!fileId) {
    return new Response('Missing id', { status: 400 });
  }

  let token: string;
  try {
    token = await getDriveAccessToken();
  } catch (err) {
    console.error('Failed to mint Drive access token:', err);
    return new Response('Server not configured', { status: 500 });
  }

  const driveRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!driveRes.ok || !driveRes.body) {
    const detail = await driveRes.text().catch(() => '');
    console.error('Drive media fetch failed:', driveRes.status, detail);
    return new Response('Failed to fetch file from Drive', { status: driveRes.status === 404 ? 404 : 502 });
  }

  // Fired once Drive has confirmed the file exists and started streaming to us - in the
  // background (via waitUntil) so it never delays the response itself. consume-download.ts
  // independently re-verifies this is actually a temporary one-time share before deleting
  // anything, so a forged/stale "consume=1" can't be used to wipe a permanent library file.
  if (shouldConsumeAfterServing) {
    context.waitUntil(
      fetch(new URL('/api/consume-download', request.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      }).catch(() => {})
    );
  }

  const asciiName = requestedName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  const headers = new Headers();
  headers.set('Content-Type', driveRes.headers.get('Content-Type') || 'application/octet-stream');
  const length = driveRes.headers.get('Content-Length');
  if (length) headers.set('Content-Length', length);
  headers.set('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(requestedName)}`);
  headers.set('Cache-Control', 'no-store');

  return new Response(driveRes.body, { status: 200, headers });
};

export const config: Config = {
  path: '/api/download-file',
};
